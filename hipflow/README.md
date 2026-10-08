# HipFlow — 10-week hip mobility program

A phone-first app (installable PWA) with a guided **10-minute daily stretch session** for tight hips, built for beginners.

- **5 phases × 2 weeks:** Foundation → Build Range → Active Mobility → Strength at End Range → Integration
- **Weekly rotation:** Front of hip → Glutes & rotators → Inner thigh (twice), then a Full-Hip Flow day
- **Guided player:** countdown ring, "get into position" and "switch sides" prompts, voice coaching, beeps, and keeps the screen awake
- **3D coach:** a 3D person shows every stretch. During "get into position" she moves step by step into the stretch, then holds it, breathing, for exactly your hold time. On "switch sides" she comes out and goes into the other side. Each stretch also has a "Watch video demos" link (YouTube search).
- **Progress:** streaks, a 10-week calendar, and mobility tests at weeks 1, 5 and 10
- Progress is saved on the device (localStorage). No account needed.

## Run locally
```bash
cd hipflow
npm install
npm run dev
```
Add `/?sheet` to the URL to see every demonstration's keyframes on one page.

## Deploy (Vercel, free)
1. vercel.com → **Add New… → Project** → import this `yearzero` repo again (a second project).
2. Set **Root Directory** to `hipflow`. The framework is detected as Vite.
3. Deploy. On your phone, open the URL, then **Share → Add to Home Screen**.

Your existing Year Zero dashboard deployment is unaffected.

## Where things live
| File | What |
|---|---|
| `src/data/program.js` | Phases, the 20 session templates, 10-minute fitting, tests |
| `src/data/stretches.js` | Stretch library: how-to, cues, mistakes, easier/harder versions, video search |
| `src/coach/moves.js` | 3D choreography: how to get into each stretch, and the hold or loop |
| `src/coach/rig.js` + `dirs.js` | Poses the 3D character from limb directions and planted hands/feet |
| `src/coach/Coach3D.jsx` + `coach.js` + `stage.js` | The 3D scene, timing it to the session player, thumbnails |
| `src/poses.js` + `src/figure.js` + `src/body.js` | 2D illustrated fallback for devices without WebGL |
| `src/Player.jsx` | Guided session player |
| `src/App.jsx` | Today / Plan / Stretches / Progress screens |

## Credits
3D character: "Michelle" (Mixamo), from the three.js example models.
