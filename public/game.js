(() => {
  const socket = io();
  const $ = sel => document.querySelector(sel);
  const screens = { home: $('#homeScreen'), lobby: $('#lobbyScreen'), game: $('#gameScreen'), results: $('#resultsScreen') };
  const candy = {
    berry: { emoji: '🍓', name: 'strawberries' }, lemon: { emoji: '🍋', name: 'lemons' },
    grape: { emoji: '🍇', name: 'grapes' }, orange: { emoji: '🍊', name: 'oranges' },
    blueberry: { emoji: '🫐', name: 'blueberries' }, apple: { emoji: '🍏', name: 'green apples' },
    rainbow: { emoji: '🌈', name: 'rainbow candy' }
  };
  const avatars = ['🍓','🍋','🍇','🍊','🫐','🍏','🍭','🧁'];
  const rows = 8, cols = 8, colors = Object.keys(candy).filter(k => k !== 'rainbow');
  let roomCode = '', selfId = '', hostId = '', players = [], board = [], selected = null, downCell = null;
  let playing = false, score = 0, goal = null, goalCount = 0, goalDone = false, combo = 0, bestCombo = 0, lastMatchAt = 0;
  let timeLeft = 90, partyMeter = 0, soundOn = localStorage.getItem('sugarSound') !== 'off', audioCtx, swipeAt = 0, eventTimer = null, actionLock = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function showScreen(name) { Object.entries(screens).forEach(([k, el]) => el.classList.toggle('hidden', k !== name)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function showError(id, msg) { $(id).textContent = msg || ''; }
  function shortName(name) { return String(name || 'Player').slice(0, 16); }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
  function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.remove('hidden'); clearTimeout(toast._timer); toast._timer = setTimeout(() => el.classList.add('hidden'), 2600); }
  function getAudio() { if (!soundOn) return null; try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); return audioCtx; } catch { return null; } }
  function tone(freq=520, duration=.08, type='sine', volume=.035, slide=0) {
    const ctx = getAudio(); if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(50, freq + slide), ctx.currentTime + duration);
    g.gain.setValueAtTime(volume, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + duration); o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + duration);
  }
  function soundMatch(size, chain=1) { tone(350 + Math.min(5, chain)*75, .14, 'sine', .035, 320 + size*12); if (size >= 4) setTimeout(() => tone(880, .22, 'triangle', .045, 420), 65); }
  function partySound() { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,.2,'triangle',.055,100),i*95)); }
  function haptic(pattern=12) { try { navigator.vibrate?.(pattern); } catch {} }
  $('#soundToggle').textContent = soundOn ? '🔊' : '🔇';
  $('#soundToggle').addEventListener('click', () => { soundOn = !soundOn; localStorage.setItem('sugarSound', soundOn ? 'on':'off'); $('#soundToggle').textContent = soundOn ? '🔊':'🔇'; $('#soundToggle').title = soundOn ? 'Sound on':'Sound off'; if (soundOn) tone(660,.1); });

  function playerName() { return shortName($('#playerName').value.trim() || 'Jellybean'); }
  $('#createRoom').addEventListener('click', () => { showError('#homeError',''); socket.emit('create-room', { name: playerName() }); });
  $('#joinRoom').addEventListener('click', () => { const code = $('#roomCodeInput').value.toUpperCase().replace(/[^A-Z0-9]/g,''); if (code.length < 4) return showError('#homeError','Room code 5 letters ka hota hai.'); showError('#homeError',''); socket.emit('join-room', { code, name: playerName() }); });
  $('#roomCodeInput').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5); });
  $('#roomCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinRoom').click(); });
  $('#playerName').addEventListener('keydown', e => { if (e.key === 'Enter') $('#createRoom').click(); });
  $('#startGame').addEventListener('click', () => { if (hostId !== selfId) return toast('Host hi round start kar sakta hai!'); socket.emit('start-game'); });
  $('#copyCode').addEventListener('click', async () => { try { await navigator.clipboard.writeText(roomCode); toast('Room code copied! Doston ko bhejo 🎉'); } catch { toast(`Room code: ${roomCode}`); } });
  $('#leaveLobby').addEventListener('click', leaveToHome); $('#leaveGame').addEventListener('click', leaveToHome); $('#backHome').addEventListener('click', leaveToHome);
  $('#playAgain').addEventListener('click', () => { if (hostId !== selfId) { toast('Host ko bolo ek aur round start kare!'); return; } socket.emit('play-again'); });
  function leaveToHome() { socket.emit('leave-room'); roomCode = ''; playing = false; selected = null; showScreen('home'); }

  socket.on('connect', () => { selfId = socket.id; });
  socket.on('room-created', ({ code }) => { roomCode = code; $('#roomCodeDisplay').textContent = code; $('#gameRoomCode').textContent = code; $('#footerCode').textContent = code; showScreen('lobby'); });
  socket.on('joined-room', ({ code }) => { roomCode = code; $('#roomCodeDisplay').textContent = code; $('#gameRoomCode').textContent = code; $('#footerCode').textContent = code; showScreen('lobby'); });
  socket.on('room-state', state => { roomCode = state.code; hostId = state.hostId; players = state.players || []; partyMeter = state.partyMeter || 0; $('#roomCodeDisplay').textContent = roomCode; $('#gameRoomCode').textContent = roomCode; $('#footerCode').textContent = roomCode; renderPlayers(); renderLeaderboard(); updatePartyMeter(); if (state.status === 'playing') { timeLeft = state.timeLeft ?? timeLeft; } });
  socket.on('game-error', msg => { if (!screens.game.classList.contains('hidden')) toast(msg); else showError('#homeError', msg); });
  socket.on('game-start', data => { goal = data.goal; timeLeft = data.duration || 90; score = 0; goalCount = 0; goalDone = false; combo = 0; bestCombo = 0; playing = true; actionLock = false; selected = null; clearEventClass(); createBoard(); updateScore(); updateGoal(); updateTimer(); $('#eventTitle').textContent = 'Sweet moves only'; $('#eventNote').textContent = 'Big combos fill the party meter. Watch for surprise events!'; $('#eventIcon').textContent = '🍡'; showScreen('game'); startConfetti(10); tone(523,.14,'triangle',.05); setTimeout(()=>tone(784,.2,'triangle',.05),110); });
  socket.on('tick', data => { timeLeft = data.timeLeft; partyMeter = data.partyMeter || 0; updateTimer(); updatePartyMeter(); if (timeLeft <= 10 && timeLeft > 0) { document.body.classList.add('final-rush'); } else document.body.classList.remove('final-rush'); });
  socket.on('party-event', event => triggerEvent(event));
  socket.on('party-burst', () => { const burst = $('#partyBurst'); burst.classList.remove('hidden'); partySound(); haptic([30,20,45]); startConfetti(45); setTimeout(()=>burst.classList.add('hidden'),2100); });
  socket.on('game-over', data => { playing = false; actionLock = true; document.body.classList.remove('final-rush'); renderResults(data); showScreen('results'); startConfetti(34); partySound(); });
  socket.on('back-to-lobby', () => { playing = false; selected = null; showScreen('lobby'); toast('Fresh round ready!'); });
  socket.on('disconnect', () => { if (playing) toast('Connection lost. Trying to reconnect…'); });
  socket.on('connect_error', () => showError('#homeError','Server se connect nahi ho pa raha. Thodi der baad try karo.'));

  function renderPlayers() {
    $('#playerCount').textContent = `${players.length} / 8`;
    $('#lobbyPlayers').innerHTML = players.map((p,i) => `<div class="player-row"><span class="avatar">${avatars[i%avatars.length]}</span><span class="player-name">${escapeHtml(p.name)}${p.id===selfId?' (You)':''}</span>${p.id===hostId?'<span class="host-badge">HOST</span>':''}<i class="player-online"></i></div>`).join('') || '<div class="empty-players">Waiting for players…</div>';
    const host = hostId === selfId;
    $('#startGame').disabled = !host;
    $('#startGame').style.opacity = host ? '1' : '.6';
    $('#lobbyReadyTitle').textContent = players.length >= 2 ? 'The crew is ready!' : 'Waiting for your crew...';
    $('#lobbyReadyText').textContent = host ? (players.length >= 2 ? 'Everyone is here. Hit start and let the sugar storm begin!' : 'Share the code. You can start a practice round now or wait for friends.') : 'The host will start the round when everyone is ready.';
  }
  function renderLeaderboard() {
    const list = $('#leaderboard');
    const sorted = [...players].sort((a,b) => b.score-a.score);
    list.innerHTML = sorted.map((p,i)=>`<div class="leader-row"><span class="rank-num">${i===0?'👑':i+1}</span><span class="leader-avatar">${avatars[Math.max(0,players.findIndex(x=>x.id===p.id))%avatars.length]}</span><span class="leader-name">${escapeHtml(p.name)}</span>${p.id===selfId?'<span class="you-label">YOU</span>':''}<span class="leader-score">${formatScore(p.score)}</span></div>`).join('') || '<div class="empty-players">Players appear here.</div>';
  }
  function renderResults(data) {
    const ranking = data.ranking || [];
    const mine = ranking.find(p=>p.id===selfId);
    const winner = data.winner;
    $('#resultTitle').textContent = winner?.id === selfId ? 'You crushed it!' : 'Sweet victory!';
    $('#resultSubtitle').textContent = winner ? `${winner.name} takes the crown. Great game, party crew!` : 'The party was sweeter together.';
    $('#resultsList').innerHTML = ranking.map((p,i)=>`<div class="result-row ${i===0?'winner':''}"><span class="result-rank">${i===0?'👑':`#${i+1}`}</span><span class="result-name">${escapeHtml(p.name)}${p.id===selfId?' (You)':''}</span>${p.goalDone?'<span class="result-goal">GOAL ✦</span>':''}<span class="result-score">${formatScore(p.score)}</span></div>`).join('') || '<div class="empty-players">No scores this round.</div>';
    $('#playAgain').innerHTML = hostId === selfId ? '<span>🔁</span> Play another round <b>→</b>' : '<span>🎉</span> Ask host to replay <b>→</b>';
  }
  function formatScore(n) { return Math.round(Number(n)||0).toLocaleString('en-US'); }
  function updateScore() { $('#scoreValue').textContent = formatScore(score); socket.emit('score-update', { score, goalDone }); }
  function updateGoal() { if (!goal) return; $('#goalText').textContent = `Match ${goal.target} ${goal.label}`; $('#goalCount').textContent = `${Math.min(goalCount,goal.target)} / ${goal.target}`; $('#goalFill').style.width = `${Math.min(100,goalCount/goal.target*100)}%`; const icon = candy[goal.color]?.emoji || '🎯'; $('#goalIcon').textContent = icon; }
  function updatePartyMeter() { $('#partyMeterFill').style.width = `${Math.max(0,Math.min(100,partyMeter))}%`; $('#partyMeterLabel').textContent = partyMeter > 0 ? `${Math.floor(partyMeter)}% CHARGED` : "LET'S FILL IT!"; }
  function updateTimer() { const m = Math.floor(timeLeft/60), s = timeLeft%60; $('#timerValue').textContent = `${m}:${String(s).padStart(2,'0')}`; $('#timerFill').style.width = `${Math.max(0,timeLeft/90*100)}%`; $('#timerCard')?.classList.toggle('urgent',timeLeft<=10); $('.timer-card').classList.toggle('urgent',timeLeft<=10); }

  function randomKind() { return colors[Math.floor(Math.random()*colors.length)]; }
  function cell(kind, fresh=false) { return { kind, fresh, clearing:false }; }
  function createBoard() {
    board = [];
    for(let r=0;r<rows;r++){
      const newRow=[];
      for(let c=0;c<cols;c++){
        let k; do { k = randomKind(); } while ((c>=2 && newRow[c-1]?.kind===k && newRow[c-2]?.kind===k) || (r>=2 && board[r-1]?.[c]?.kind===k && board[r-2]?.[c]?.kind===k));
        newRow.push(cell(k));
      }
      board.push(newRow);
    }
    renderBoard();
  }
  function renderBoard() {
    const el = $('#gameBoard');
    el.innerHTML = board.map((row,r)=>row.map((item,c)=>{
      if (!item) return `<button class="candy-cell" data-r="${r}" data-c="${c}" aria-label="empty"></button>`;
      const classes = ['candy-cell']; if (selected?.r===r&&selected?.c===c) classes.push('selected'); if (item.clearing) classes.push('empty'); if (item.fresh) classes.push('new-candy'); if (item.kind==='rainbow') classes.push('special');
      const meta = candy[item.kind]; return `<button class="${classes.join(' ')}" data-r="${r}" data-c="${c}" role="gridcell" aria-label="${meta.name}"><span class="candy">${meta.emoji}</span></button>`;
    }).join('')).join('');
    board.forEach(row=>row.forEach(x=>{if(x) x.fresh=false;}));
  }
  const adjacent = (a,b) => Math.abs(a.r-b.r)+Math.abs(a.c-b.c)===1;
  function posFromEl(el) { const cellEl=el.closest('.candy-cell'); if (!cellEl) return null; return {r:+cellEl.dataset.r,c:+cellEl.dataset.c}; }
  $('#gameBoard').addEventListener('pointerdown',e=>{downCell=posFromEl(e.target);});
  $('#gameBoard').addEventListener('pointerup',e=>{const up=posFromEl(e.target); if(downCell&&up&&adjacent(downCell,up)){swipeAt=Date.now(); attemptSwap(downCell,up);} downCell=null;});
  $('#gameBoard').addEventListener('click',e=>{
    if (!playing || actionLock || Date.now()-swipeAt<350) return;
    const p=posFromEl(e.target); if(!p) return;
    if (!selected) { selected=p; renderBoard(); tone(550,.05,'sine',.02); return; }
    if (selected.r===p.r&&selected.c===p.c){selected=null;renderBoard();return;}
    if (adjacent(selected,p)){attemptSwap(selected,p);return;}
    selected=p;renderBoard();tone(550,.05,'sine',.02);
  });
  function attemptSwap(a,b) {
    if(!playing||actionLock||!board[a.r]?.[a.c]||!board[b.r]?.[b.c]) return;
    selected=null; actionLock=true;
    const first=board[a.r][a.c], second=board[b.r][b.c];
    board[a.r][a.c]=second; board[b.r][b.c]=first; renderBoard(); tone(300,.07,'sine',.025,100);
    if(first.kind==='rainbow'||second.kind==='rainbow') {
      const target = first.kind==='rainbow' ? second.kind : first.kind;
      const group=[]; for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) if(board[r][c]?.kind===target||board[r][c]?.kind==='rainbow') group.push({r,c});
      if(group.length<4){actionLock=false;return;} resolveMatched(group,true); return;
    }
    const matches=findMatches();
    if(!matches.size){setTimeout(()=>{board[a.r][a.c]=first;board[b.r][b.c]=second;actionLock=false;renderBoard();tone(180,.09,'sine',.02,-70);},125);return;}
    resolveMatched([...matches.values()],false);
  }
  function findMatches() {
    const found=new Map();
    for(let r=0;r<rows;r++){let start=0;while(start<cols){let k=board[r][start]?.kind;if(k==='rainbow')k=null;let end=start+1;while(k&&end<cols&&board[r][end]?.kind===k)end++;if(k&&end-start>=3)for(let c=start;c<end;c++)found.set(`${r},${c}`,{r,c});start=Math.max(end,start+1);}}
    for(let c=0;c<cols;c++){let start=0;while(start<rows){let k=board[start][c]?.kind;if(k==='rainbow')k=null;let end=start+1;while(k&&end<rows&&board[end][c]?.kind===k)end++;if(k&&end-start>=3)for(let r=start;r<end;r++)found.set(`${r},${c}`,{r,c});start=Math.max(end,start+1);}}
    return found;
  }
  function resolveMatched(matches, rainbowBlast=false, chain=0) {
    if(!matches.length) { actionLock=false; return; }
    const now=Date.now(); if(now-lastMatchAt>2400) combo=0; combo++; lastMatchAt=now; bestCombo=Math.max(bestCombo,combo); $('#comboValue').textContent=`COMBO x${Math.min(5,combo)}`; $('#bestStreak').textContent=bestCombo;
    $('#comboChip').classList.add('active'); setTimeout(()=>$('#comboChip').classList.remove('active'),380);
    const base=matches.length*60; const multiplier=Math.min(5,1+(combo-1)*.35); let gained=Math.round(base*multiplier);
    const eventBoost=document.body.classList.contains('sugar-rain')?1.5:1; gained=Math.round(gained*eventBoost);
    if(goal&&!goalDone){goalCount+=matches.reduce((n,p)=>n+(board[p.r][p.c]?.kind===goal.color?1:0),0); if(goalCount>=goal.target){goalDone=true;gained+=1500;toast('Secret goal complete! +1,500 points 🌟');startConfetti(14);haptic(20);}}
    score+=gained; updateScore(); updateGoal(); soundMatch(matches.length,combo); haptic(matches.length>=5?22:9); floatScore(`+${formatScore(gained)}${multiplier>1?' x'+multiplier.toFixed(1):''}`);
    if(matches.length>=4 && !rainbowBlast){const keep=matches[matches.length-1]; if(board[keep.r][keep.c]) board[keep.r][keep.c]=cell('rainbow');}
    matches.forEach(p=>{if(board[p.r][p.c]&&!(matches.length>=4&&!rainbowBlast&&p.r===matches[matches.length-1].r&&p.c===matches[matches.length-1].c))board[p.r][p.c].clearing=true;});
    renderBoard(); if(matches.length>=4&&!rainbowBlast){setTimeout(()=>floatScore('🌈 SPECIAL CANDY!',.35,.42),120);}
    setTimeout(()=>{
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)if(board[r][c]?.clearing)board[r][c]=null;
      for(let c=0;c<cols;c++){let write=rows-1;for(let r=rows-1;r>=0;r--)if(board[r][c]){if(write!==r){board[write][c]=board[r][c];board[r][c]=null;}write--;}for(let r=write;r>=0;r--)board[r][c]=cell(randomKind(),true);}
      renderBoard();
      const next=findMatches(); if(next.size){setTimeout(()=>resolveMatched([...next.values()],false,chain+1),170);} else {actionLock=false;}
    },reduced?20:250);
  }
  function floatScore(text,x=.5,y=.47){const el=document.createElement('div');el.className='floating-score';el.textContent=text;el.style.left=`${innerWidth*x}px`;el.style.top=`${innerHeight*y}px`;document.body.append(el);setTimeout(()=>el.remove(),1000); if(Math.random()<.65)particles(innerWidth*x,innerHeight*y,8);}
  function particles(x,y,n){const palette=['#ff6f9f','#ffd55f','#8e5ae2','#4dddb0','#fff'];for(let i=0;i<n;i++){const p=document.createElement('i');p.className='particle';p.style.left=`${x}px`;p.style.top=`${y}px`;p.style.background=palette[i%palette.length];p.style.setProperty('--dx',`${(Math.random()-.5)*90}px`);p.style.setProperty('--dy',`${(Math.random()-.5)*90}px`);document.body.append(p);setTimeout(()=>p.remove(),650);}}
  function startConfetti(n){const root=$('#resultConfetti');if(!root)return;root.innerHTML='';const colors2=['#ff6b9e','#ffd252','#8f5adf','#59dcb4','#ff9f5a'];for(let i=0;i<n;i++){const bit=document.createElement('i');bit.className='confetti-bit';bit.style.left=`${Math.random()*100}%`;bit.style.background=colors2[i%colors2.length];bit.style.animationDelay=`${Math.random()*1.6}s`;bit.style.animationDuration=`${2+Math.random()*1.2}s`;root.append(bit);}}
  function clearEventClass(){document.body.classList.remove('jelly','sugar-rain','board-shuffle','final-rush');}
  function triggerEvent(event){if(!event)return;$('#eventIcon').textContent=event.icon||'✨';$('#eventTitle').textContent=event.name||'SURPRISE EVENT';$('#eventNote').textContent=event.note||'Something sweet is happening!';$('#toastIcon').textContent=event.icon||'✨';$('#toastTitle').textContent=event.name||'SURPRISE EVENT';$('#toastNote').textContent=event.note||'Something sweet is happening!';const toastEl=$('#eventToast');toastEl.classList.remove('hidden');clearTimeout(eventTimer);eventTimer=setTimeout(()=>toastEl.classList.add('hidden'),3600);
    clearEventClass();const lower=(event.name||'').toLowerCase();if(lower.includes('jelly'))document.body.classList.add('jelly');else if(lower.includes('rain'))document.body.classList.add('sugar-rain');else if(lower.includes('shuffle')){document.body.classList.add('board-shuffle');if(board.length){const flat=board.flat().filter(Boolean).map(x=>x.kind);for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const k=flat.pop()||randomKind();board[r][c]=cell(k,true);}renderBoard();}}else if(lower.includes('rush'))document.body.classList.add('final-rush');tone(720,.18,'triangle',.045,500);startConfetti(11);haptic([15,20,15]);}

  // Keep the board valid if a client returns to the tab after a pause.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&playing)updateTimer();});
})();
