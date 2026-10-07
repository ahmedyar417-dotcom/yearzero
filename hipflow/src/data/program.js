import { BY_ID } from "./stretches.js";

export const PROGRAM_DAYS = 70;
export const PREP_SECS = 5; // "get into position"
export const SWITCH_SECS = 5; // between sides

export const PHASES = [
  {
    n: 1, weeks: [1, 2], name: "Foundation", color: "var(--p1)",
    goal: "Learn the shapes and teach your hips that stretching is safe.",
    tip: "Ease in to about 3–4/10 intensity. Breathe slowly. Never bounce.",
  },
  {
    n: 2, weeks: [3, 4], name: "Build Range", color: "var(--p2)",
    goal: "Longer holds and deeper shapes: pigeon, lizard, frog, half split.",
    tip: "Aim for 5/10. With each exhale, sink a few millimetres deeper.",
  },
  {
    n: 3, weeks: [5, 6], name: "Active Mobility", color: "var(--p3)",
    goal: "Move through your new range: hip circles, 90/90 switches, deep squats.",
    tip: "Slow, controlled movement. If you can't control it, make it smaller.",
  },
  {
    n: 4, weeks: [7, 8], name: "Strength at End Range", color: "var(--p4)",
    goal: "Lock in your flexibility with contract-relax and loaded positions.",
    tip: "Contract-relax: in long holds, press into the floor at about 30% effort for 5 seconds, then relax and sink deeper. Do this 2–3 times.",
  },
  {
    n: 5, weeks: [9, 10], name: "Integration", color: "var(--p5)",
    goal: "Put it all together with flows and your deepest holds, then retest.",
    tip: "Use everything you've learned: breathe, contract-relax, and control the range.",
  },
];

export const DAY_TYPES = {
  A: { name: "Front of Hip", short: "Front", desc: "Hip flexors & quads" },
  B: { name: "Glutes & Rotators", short: "Back", desc: "Back and outside of the hip" },
  C: { name: "Inner Thigh", short: "Inner", desc: "Adductors & hamstrings" },
  F: { name: "Full-Hip Flow", short: "Flow", desc: "A bit of everything" },
};
const WEEK_PATTERN = ["A", "B", "C", "A", "B", "C", "F"];

// [stretchId, seconds per side, note?]
const CR = "Contract-relax: press 5s at 30% effort, relax and sink deeper. Repeat.";
const SESSIONS = {
  1: {
    A: [["cat_cow", 60], ["knee_hug", 40], ["glute_bridge", 40], ["half_kneel", 45], ["low_lunge", 35], ["supine_hamstring", 40], ["child_pose", 60], ["belly_breath", 45]],
    B: [["cat_cow", 60], ["knee_hug", 40], ["figure4", 45], ["supine_twist", 40], ["happy_baby", 45], ["glute_bridge", 40], ["child_pose", 55], ["belly_breath", 45]],
    C: [["cat_cow", 60], ["butterfly", 50], ["adductor_rock", 40], ["wide_fold", 45], ["supine_hamstring", 40], ["happy_baby", 40], ["child_pose", 50], ["belly_breath", 40]],
    F: [["cat_cow", 60], ["half_kneel", 40], ["figure4", 40], ["butterfly", 45], ["supine_twist", 35], ["child_pose", 60], ["belly_breath", 45]],
  },
  2: {
    A: [["cat_cow", 50], ["glute_bridge", 35], ["half_kneel", 50], ["lizard", 45], ["half_split", 45], ["butterfly", 45], ["child_pose", 50]],
    B: [["cat_cow", 50], ["figure4", 40], ["pigeon", 60], ["ninety_ninety", 45], ["happy_baby", 45], ["child_pose", 55]],
    C: [["cat_cow", 50], ["adductor_rock", 40], ["frog", 60], ["butterfly", 55], ["wide_fold", 60], ["happy_baby", 45], ["child_pose", 50], ["belly_breath", 40]],
    F: [["cat_cow", 45], ["low_lunge", 40], ["pigeon", 50], ["frog", 55], ["half_split", 40], ["child_pose", 50]],
  },
  3: {
    A: [["hip_cars", 30], ["glute_bridge", 40, "Squeeze 3 seconds at the top of every rep."], ["half_kneel", 45, "Add an overhead reach with the down-knee arm."], ["lizard", 45], ["half_split", 45], ["child_pose", 45]],
    B: [["hip_cars", 30], ["ninety_switch", 60], ["ninety_ninety", 45], ["pigeon", 55], ["happy_baby", 45], ["child_pose", 40]],
    C: [["hip_cars", 30], ["adductor_rock", 40, "Slow reps: 3 seconds back, 3 seconds forward."], ["frog", 50, "Frog rocks: rock back and forward slowly."], ["deep_squat", 60], ["wide_fold", 55], ["butterfly", 45], ["child_pose", 40]],
    F: [["cat_cow", 40], ["squat_lunge_flow", 40], ["ninety_switch", 60], ["deep_squat", 60], ["pigeon", 45], ["butterfly", 45], ["child_pose", 40]],
  },
  4: {
    A: [["hip_cars", 25], ["half_kneel", 40], ["couch", 50, CR], ["half_split", 50, CR], ["butterfly", 40], ["child_pose", 40]],
    B: [["hip_cars", 25], ["ninety_switch", 50], ["pigeon", 60, CR], ["figure4", 40], ["ninety_ninety", 35], ["child_pose", 40]],
    C: [["cat_cow", 40], ["cossack", 50, "Alternate sides slowly; pause 2 seconds at the bottom."], ["frog", 60, CR], ["butterfly", 55, CR], ["deep_squat", 60], ["wide_fold", 60, CR], ["happy_baby", 40], ["child_pose", 40]],
    F: [["hip_cars", 25], ["squat_lunge_flow", 40], ["ninety_switch", 50], ["couch", 45], ["cossack", 45], ["pigeon", 45], ["child_pose", 40]],
  },
  5: {
    A: [["hip_cars", 25], ["squat_lunge_flow", 40], ["couch", 60, CR], ["half_split", 60, CR], ["belly_breath", 40]],
    B: [["hip_cars", 25], ["ninety_switch", 50], ["pigeon", 75, CR], ["ninety_ninety", 45], ["happy_baby", 40], ["child_pose", 35]],
    C: [["cat_cow", 40], ["cossack", 50], ["frog", 75, CR], ["wide_fold", 65, CR], ["deep_squat", 75], ["butterfly", 55], ["happy_baby", 40], ["child_pose", 40]],
    F: [["hip_cars", 25], ["squat_lunge_flow", 45], ["ninety_switch", 50], ["lizard", 45], ["pigeon", 50], ["deep_squat", 50]],
  },
};

export const phaseForWeek = (week) => PHASES[Math.min(4, Math.max(0, Math.ceil(week / 2) - 1))];

// day: 1..70 (beyond 70 keeps rotating through phase 5 for maintenance)
export function sessionFor(day) {
  const d = Math.max(1, day);
  const week = Math.min(10, Math.ceil(d / 7)) || 1;
  const phase = phaseForWeek(week);
  const type = WEEK_PATTERN[(d - 1) % 7];
  const items = SESSIONS[phase.n][type].map(([id, secs, note]) => {
    const s = BY_ID[id];
    if (!s) throw new Error(`Unknown stretch ${id}`);
    return { stretch: s, secs, note, sides: s.bilateral ? 2 : 1 };
  });
  fitToTarget(items);
  return { day: d, week, phase, type, dayType: DAY_TYPES[type], items, totalSecs: totalSecs(items) };
}

export const SESSION_SECS = 600;

// Scale the authored holds so every session lasts exactly SESSION_SECS,
// keeping their proportions (rounded to 5s; the last item absorbs the rest).
function fitToTarget(items) {
  const fixed = items.reduce((t, it) => t + PREP_SECS + (it.sides - 1) * SWITCH_SECS, 0);
  const work = items.reduce((t, it) => t + it.secs * it.sides, 0);
  const k = (SESSION_SECS - fixed) / work;
  for (const it of items) it.secs = Math.max(20, Math.round((it.secs * k) / 5) * 5);
  const last = items[items.length - 1];
  last.secs += (SESSION_SECS - totalSecs(items)) / last.sides;
}

export function totalSecs(items) {
  return items.reduce((t, it) => t + PREP_SECS + it.secs * it.sides + (it.sides - 1) * SWITCH_SECS, 0);
}

// Flatten a session into timed segments for the player.
export function buildTimeline(session) {
  const segs = [];
  session.items.forEach((it, idx) => {
    const side = (i) => (it.sides === 2 ? it.stretch.sides[i] : null);
    segs.push({ kind: "prep", item: it, idx, side: side(0), secs: PREP_SECS });
    for (let i = 0; i < it.sides; i++) {
      if (i > 0) segs.push({ kind: "switch", item: it, idx, side: side(i), secs: SWITCH_SECS });
      segs.push({ kind: "work", item: it, idx, side: side(i), sideIndex: i, secs: it.secs });
    }
  });
  return segs;
}

// ── Dates ────────────────────────────────────────────────────────────────
export const DEFAULT_START = "2026-10-08";
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
// Program day number for a date (1 = start date). <1 means not started.
export const programDay = (start, date) => daysBetween(start, date) + 1;

export const fmtTime = (secs) => `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}`;
export const fmtDate = (s, opts = { weekday: "short", day: "numeric", month: "short" }) =>
  parseYmd(s).toLocaleDateString(undefined, opts);

// ── Mobility tests ───────────────────────────────────────────────────────
export const TESTS = [
  {
    id: "squat", name: "Deep squat hold", unit: "sec", better: "higher", max: 120,
    how: "Feet shoulder-width, heels down, sit as deep as you can without holding anything. How many seconds can you comfortably hold it (max 120)?",
  },
  {
    id: "reach", name: "Sit and reach", unit: "cm", better: "higher", min: -40, max: 40,
    how: "Sit with your legs straight together. Reach for your toes. Fingertips past your toes = positive cm, short of your toes = negative cm.",
  },
  {
    id: "butterfly", name: "Butterfly knee height", unit: "cm", better: "lower", max: 60,
    how: "In butterfly with your heels about a fist from your groin and sitting tall, measure from the floor to the outside of your knee. Average both sides.",
  },
  {
    id: "ninety", name: "90/90 sit", unit: "/5", better: "higher", min: 1, max: 5,
    how: "1 = can't get into it, 2 = need both hands, 3 = one hand, 4 = no hands but leaning, 5 = sitting tall with no hands, both sides.",
  },
];
export const CHECKPOINTS = [
  { id: "start", name: "Baseline", from: 1, label: "Week 1" },
  { id: "mid", name: "Midpoint", from: 29, label: "Week 5" },
  { id: "end", name: "Final", from: 64, label: "Week 10" },
];
