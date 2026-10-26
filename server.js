import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 10000;
const rooms = new Map();
const COLORS = ['berry', 'lemon', 'grape', 'orange', 'blueberry', 'apple'];
const GOAL_LABELS = {
  berry: 'strawberries', lemon: 'lemons', grape: 'grapes',
  orange: 'oranges', blueberry: 'blueberries', apple: 'green apples'
};
const EVENTS = [
  { name: 'CANDY RAIN', note: 'Bonus candies are falling!', icon: '🌈' },
  { name: 'JELLY FLOOD', note: 'A little extra sparkle!', icon: '🫧' },
  { name: 'BOARD SHUFFLE', note: 'Fresh board energy!', icon: '🌀' },
  { name: 'SUGAR RUSH', note: 'Every match is worth more!', icon: '⚡' }
];

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(''); }
  while (rooms.has(code));
  return code;
}
function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score, online: p.online })),
    partyMeter: room.partyMeter,
    goal: room.goal,
    timeLeft: room.timeLeft,
    event: room.event
  };
}
function sendRoom(room) { io.to(room.code).emit('room-state', publicRoom(room)); }
function makeGoal() {
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return { color, target: 18, label: GOAL_LABELS[color] };
}
function closeGame(room) {
  if (room.status !== 'playing') return;
  room.status = 'results';
  if (room.clock) clearInterval(room.clock);
  const ranking = [...room.players.values()].map(({ id, name, score, goalDone }) => ({ id, name, score, goalDone }))
    .sort((a, b) => b.score - a.score);
  io.to(room.code).emit('game-over', { ranking, winner: ranking[0] || null });
  sendRoom(room);
}
function startGame(room) {
  room.status = 'playing';
  room.timeLeft = 90;
  room.partyMeter = 0;
  room.goal = makeGoal();
  room.startedAt = Date.now();
  room.players.forEach(p => { p.score = 0; p.goalDone = false; p.lastScoreUpdate = 0; });
  room.event = null;
  io.to(room.code).emit('game-start', { duration: 90, goal: room.goal });
  sendRoom(room);
  room.clock = setInterval(() => {
    room.timeLeft = Math.max(0, 90 - Math.floor((Date.now() - room.startedAt) / 1000));
    const elapsed = 90 - room.timeLeft;
    const milestone = [20, 40, 60].includes(elapsed) ? elapsed : null;
    if (milestone) {
      room.event = EVENTS[(milestone / 20 - 1 + Math.floor(Math.random() * EVENTS.length)) % EVENTS.length];
      io.to(room.code).emit('party-event', room.event);
      setTimeout(() => {
        if (room.status === 'playing' && room.timeLeft < 90 - milestone + 1) {
          room.event = null;
          sendRoom(room);
        }
      }, 6500);
    }
    if (room.timeLeft === 10) {
      room.event = { name: 'FINAL SUGAR RUSH!', note: 'Ten seconds of candy chaos!', icon: '🚀' };
      io.to(room.code).emit('party-event', room.event);
    }
    io.to(room.code).emit('tick', { timeLeft: room.timeLeft, partyMeter: room.partyMeter, event: room.event });
    if (room.timeLeft <= 0) closeGame(room);
  }, 250);
}

io.on('connection', socket => {
  socket.on('create-room', ({ name } = {}) => {
    const cleanName = String(name || 'Player').trim().slice(0, 16) || 'Player';
    const code = makeCode();
    const room = { code, hostId: socket.id, players: new Map(), status: 'lobby', partyMeter: 0, goal: null, timeLeft: 90, event: null, clock: null };
    room.players.set(socket.id, { id: socket.id, name: cleanName, score: 0, online: true, goalDone: false, lastScoreUpdate: 0 });
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit('room-created', { code });
    sendRoom(room);
  });
  socket.on('join-room', ({ code, name } = {}) => {
    const cleanCode = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    const room = rooms.get(cleanCode);
    if (!room) return socket.emit('game-error', 'Room code nahi mila. Code check karke phir try karo.');
    if (room.status !== 'lobby') return socket.emit('game-error', 'Game already shuru ho gaya. Naya room try karo.');
    if (room.players.size >= 8) return socket.emit('game-error', 'Room full hai — 8 players aa chuke hain.');
    const cleanName = String(name || 'Player').trim().slice(0, 16) || 'Player';
    room.players.set(socket.id, { id: socket.id, name: cleanName, score: 0, online: true, goalDone: false, lastScoreUpdate: 0 });
    socket.join(cleanCode);
    socket.data.roomCode = cleanCode;
    socket.emit('joined-room', { code: cleanCode });
    sendRoom(room);
  });
  socket.on('start-game', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.status !== 'lobby') return;
    if (room.players.size < 1 || room.players.size > 8) return;
    startGame(room);
  });
  socket.on('score-update', ({ score, goalDone } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== 'playing') return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const nextScore = Math.max(player.score, Math.min(500000, Number(score) || 0));
    const gained = nextScore - player.score;
    player.score = nextScore;
    if (goalDone) player.goalDone = true;
    if (gained > 0) {
      room.partyMeter = Math.min(100, room.partyMeter + gained / 95);
      if (room.partyMeter >= 100) {
        room.partyMeter = 0;
        io.to(room.code).emit('party-burst', { message: 'PARTY METER FULL!' });
      }
    }
    sendRoom(room);
  });
  socket.on('play-again', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.status !== 'results') return;
    room.status = 'lobby';
    room.players.forEach(p => { p.score = 0; p.goalDone = false; });
    io.to(room.code).emit('back-to-lobby');
    sendRoom(room);
  });
  socket.on('leave-room', () => leave(socket));
  socket.on('disconnect', () => leave(socket));
});
function leave(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.data.roomCode = null;
  if (!room) return;
  room.players.delete(socket.id);
  if (room.hostId === socket.id && room.players.size) room.hostId = room.players.keys().next().value;
  if (room.players.size === 0) {
    if (room.clock) clearInterval(room.clock);
    rooms.delete(code);
  } else sendRoom(room);
}

server.listen(PORT, '0.0.0.0', () => console.log(`Candy Clash listening on ${PORT}`));
