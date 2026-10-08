# HipFlow — 10-week hip mobility program

A phone-first app (installable PWA) with a guided **10-minute daily stretch session** for tight hips, built for beginners.

- **5 phases × 2 weeks:** Foundation → Build Range → Active Mobility → Strength at End Range → Integration
- **Weekly rotation:** Front of hip → Glutes & rotators → Inner thigh (twice), then a Full-Hip Flow day
- **Guided player:** countdown ring, "get into position" and "switch sides" prompts, voice coaching, beeps, and keeps the screen awake
- **3D coach:** a realistic 3D person (choose a female or male coach) shows every stretch. During "get into position" the coach moves step by step into the stretch, then holds it, breathing, for exactly your hold time. On "switch sides" she comes out and goes into the other side. Each stretch also has a "Watch video demos" link (YouTube search).
- **Personal start:** a short onboarding (goals, how tight you are, when you'll stretch, start date) and an optional daily calendar reminder
- **Today:** your class for the day as a big card, the week at a glance, what's in the class, and a resume card if you closed the app mid-session
- **Class preview:** duration, what you'll need (cushion, strap, blocks…), and every stretch before you start
- **Full-screen player:** 3-2-1 start, a progress bar per stretch, step-by-step instructions while she gets into position, cues during holds, an "up next" card, tap to pause, landscape layout
- **After each class:** a celebration with minutes, stretches and streak, and a quick "how did that feel?" rating. Two "too intense" ratings in a row suggest switching on the easier options
- **Explore:** six quick sessions (5–15 min) and the searchable stretch library
- **Progress:** streaks, a 10-week calendar, progress photos with a before/after slider (stored only on the phone), and mobility tests at weeks 1, 5 and 10
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
| `src/App.jsx` + `src/screens/` | App shell and screens: onboarding, today, plan, explore, progress, class preview, completion |

## Credits
3D coaches: "Female_Adult_12" and "Male_Adult_01" from [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) (MIT licence, see `public/models/LICENSE-Rocketbox.txt`), converted to glTF with smaller textures.
