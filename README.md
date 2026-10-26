# Candy Clash: Sugar Storm 🍬

A colorful real-time match-three party game made for phones and laptops. Create a room, share its code or invite link, and race your friends through a 90-second candy storm.

## What you can do

- Play with **2–8 real players** in a live room.
- Share a room code or a direct invite link that fills in the code for your friend.
- Practice alone against **three CPU candy players**. The game asks you to confirm before practice starts.
- Swipe or tap two neighboring candies to match three or more.
- Build combo streaks, make rainbow candies, and complete the round's secret candy goal.
- Fill a shared Party Meter, watch surprise events, and race through the final ten seconds.
- Enjoy animated effects, sound, and phone vibration where supported. Sound can be turned off.

## Start playing locally

You need Node.js 18 or newer.

```bash
npm install
npm start
```

Open `http://localhost:10000` in your browser. For real multiplayer, open the public Render URL on each player's device.

## Deploy on Render

1. Extract this ZIP.
2. Create a GitHub repository and upload the files inside the `candy-clash-sugar-storm` folder.
3. In Render, create a **Web Service** and connect that repository.
4. Use `npm install` as the build command and `npm start` as the start command. The included `render.yaml` has these settings.
5. Deploy, then share the Render link or a room invite link with friends.

The server reads Render's `PORT` setting. Render can check `/health` to confirm the app is running.

## Project layout

```text
public/
  index.html   Game screens and room lobby
  style.css    Responsive design and animations
  game.js      Candy board, matching, effects, and phone controls
server.js      Rooms, player scores, CPU practice, events, and timer
render.yaml   Render Web Service settings
```
