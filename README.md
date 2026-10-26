# Candy Clash: Sugar Storm

A colorful, mobile-friendly real-time match-three party game for 2–8 friends. It uses a separate candy board for every player, a shared room code, a live score table, and a shared party meter.

## Play features

- Create a room and share its 5-character code.
- Join from another phone, tablet, or computer. No account is needed.
- Play a 90-second round. Match 3 or more candies by tapping two neighboring tiles or swiping between them.
- Build combo streaks, complete a secret candy goal, create rainbow candies with a match of 4 or more, and fill the shared Party Meter.
- Surprise events, a final 10-second rush, sound effects, haptics on supported phones, confetti, and a live leaderboard.
- The host can start a practice round alone or wait for 2–8 friends.

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open `http://localhost:10000`. For multiplayer testing on different devices, expose the local server with a tunnel or deploy it publicly.

## Deploy on Render

1. Unzip this project.
2. Create a GitHub repository and upload the unzipped files.
3. In Render, choose **New → Web Service**, then connect that repository.
4. Render reads `render.yaml`. Confirm the build command is `npm install` and the start command is `npm start`.
5. Deploy. Share the resulting Render link with players.

The app listens on Render's `PORT` setting and uses Socket.IO for live rooms. The `/health` endpoint is available for Render health checks.

## Project files

- `server.js` — web server, room codes, player list, timer, score board, party meter, and round events.
- `public/index.html` — all game screens.
- `public/style.css` — responsive visual design and animations.
- `public/game.js` — candy board, matching rules, combos, effects, and sounds.
- `render.yaml` — Render Web Service setup.
