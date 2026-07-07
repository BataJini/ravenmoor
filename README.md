# RAVENMOOR — a gothic tale

An explorable gothic 3D world that runs in your browser. Built with Three.js —
every model, texture, and sound is generated procedurally in code (no asset files).

Thirteen lost souls wander the parish of Ravenmoor. Gather them — they will
orbit you as you walk — and let the cathedral bell call them home. When the
last toll fades, **dawn breaks over the moor for good.**

## Play

**Double-click `Play Ravenmoor.bat`** — it starts a tiny local server and opens
the game in your browser. Or by hand: `node server.mjs` → http://localhost:8130

## Controls

| Key | Action |
| --- | --- |
| W A S D / Mouse | walk / look |
| SHIFT | sprint / gallop |
| SPACE | jump |
| E | interact · mount · talk |
| F | pet a horse · challenge Wraith |
| Q | dismount |
| J | the Parish Journal (quests, collections, achievements) |
| R | whistle for Wraith (once he accepts you) |
| V | fullscreen · ESC menu · H help · F3 fps |

## The people of the parish

- **Father Ossian** paces the cathedral forecourt and knows why the bell is silent.
- **Mordecai the gravekeeper** wanders the graves by lantern-light. He lost his
  shovel by the well; return it and he pays in secrets.
- **Elke of the stables** wants Ashfall's thrown horseshoe back from the east
  road. She knows what the pale horse used to be.
- **The Old Bellringer** waits in the Bone Chapel, behind a lock shaped like a locket.
- Pale villagers drift the night paths. They will not be spoken to.

## The places

- **The cathedral** — great doors, prayer candles, playable organ, stained glass,
  moonlight shafts, the bell rope, and gargoyles that watch you climb the steps.
- **The graveyard** — 15 readable epitaphs, a creaking gate, the mausoleum that
  hides the Sexton's Locket, and an angel that moves only when unobserved.
- **The Drowned Rat** — the tavern: stoke the fire, drink mulled cider, pluck the
  lute, and sit with a patron whose mug has been empty forty years.
- **The watchtower hill** — survey the moor through the old glass and pillars of
  light will mark every soul still astray.
- **The stone circle** — light all five braziers and something old and antlered
  will answer. It leaves a gift.
- **The Bone Chapel** — the locket opens it. The Bellringer inside has been
  waiting a long time to say thank you.

## The games within the game

- **Ride** — Nyx, Ashfall, and Wraith the ghost horse. Petting is mandatory
  (spiritually). A found horseshoe makes every gallop +15% faster.
- **Race the dead** — challenge Wraith from horseback (F): six rings from the
  gravegate to the cathedral doors. He phases through fences. He thinks that's fair.
  Win, and he answers your whistle (R) anywhere, forever.
- **Collect** — 13 named souls (they orbit you; the count sings higher with each),
  6 hidden silver ravens (full set lengthens your stride), 15 epitaphs,
  13 achievements. Track everything in the journal (J). All progress saves.
- **The dawn** — gather all thirteen, ring the bell, and watch the night end:
  bells peal, the beam takes your gathered souls home, the sky turns gold,
  songbirds replace the owls, and Ravenmoor stays at peace forever after.

## Performance

Tuned for integrated GPUs: merged static geometry, a pooled 6-light system,
cadenced shadow updates, three auto-selected quality tiers. Measured ~5–7 ms
per frame (150–210 fps equivalent) on an Intel UHD iGPU before Act II; the
expanded world stays within the same budget (~160–200 draw calls).

## Tech

Plain ES modules, no build step; Three.js is the only runtime dependency.
All audio is synthesized WebAudio (wind, generative score, bell partials,
hooves, murmured NPC voices, fireplace crackle, thunder, dawn birds).
`?test=1` exposes a deterministic test API — `node test/run.mjs` runs a
17-check headless regression of the entire game arc.
