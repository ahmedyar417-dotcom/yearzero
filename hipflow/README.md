# HipFlow — 10-week hip mobility program

A phone-first app (installable PWA) with a guided **10-minute daily stretch session** for tight hips, built for beginners.

- **5 phases × 2 weeks:** Foundation → Build Range → Active Mobility → Strength at End Range → Integration
- **Weekly rotation:** Front of hip → Glutes & rotators → Inner thigh (twice), then a Full-Hip Flow day
- **Guided player:** countdown ring, "get into position" and "switch sides" prompts, voice coaching, beeps, and keeps the screen awake
- **Demonstrations:** an animated figure for each of the 25 stretches, plus a "Watch video demos" link (YouTube search)
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
| `src/poses.js` + `src/figure.js` | Animated stick-figure keyframes and the engine |
| `src/Player.jsx` | Guided session player |
| `src/App.jsx` | Today / Plan / Stretches / Progress screens |
