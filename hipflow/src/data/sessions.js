// Quick sessions (outside the 10-week plan) and the kit each session needs.
import { BY_ID } from "./stretches.js";
import { fitToTarget, totalSecs } from "./program.js";

export const KIT = {
  cushion: { emoji: "🛋️", label: "Cushion for your knees" },
  pillow: { emoji: "🪶", label: "Pillow" },
  strap: { emoji: "🎗️", label: "Strap, belt or towel" },
  blocks: { emoji: "📚", label: "2 blocks or thick books" },
  wall: { emoji: "🧱", label: "Wall or sofa" },
  frame: { emoji: "🚪", label: "Door frame or sturdy pole" },
  mat: { emoji: "🧘", label: "Mat or soft floor" },
};
const NEEDS = {
  half_kneel: ["cushion"], low_lunge: ["cushion"], kneeling_quad: ["cushion"], couch: ["cushion", "wall"],
  lizard: ["cushion"], half_split: ["cushion", "blocks"], frog: ["cushion"], adductor_rock: ["cushion"],
  pigeon: ["pillow"], supine_hamstring: ["strap"], deep_squat: ["frame"], squat_lunge_flow: ["cushion"],
};
export function kitFor(items) {
  const keys = new Set(["mat"]);
  for (const it of items) for (const k of NEEDS[it.stretch.id] || []) keys.add(k);
  return [...keys].map((k) => KIT[k]);
}

export const QUICK = [
  { id: "morning", title: "Morning Hip Wake-Up", mins: 5, blurb: "Gentle movement to shake off stiffness", hero: "half_kneel",
    items: [["cat_cow", 45], ["hip_cars", 30], ["half_kneel", 40], ["glute_bridge", 35], ["child_pose", 40]] },
  { id: "desk", title: "Desk Break Reset", mins: 5, blurb: "Undo hours of sitting", hero: "low_lunge",
    items: [["half_kneel", 40], ["low_lunge", 35], ["figure4", 40], ["child_pose", 40]] },
  { id: "bed", title: "Before Bed Unwind", mins: 10, blurb: "Slow, lying-down stretches to sleep better", hero: "supine_twist",
    items: [["knee_hug", 45], ["figure4", 45], ["supine_twist", 45], ["happy_baby", 45], ["butterfly", 50], ["child_pose", 50], ["belly_breath", 60]] },
  { id: "inner", title: "Inner Thigh Release", mins: 8, blurb: "Butterfly, frog and wide-leg work", hero: "butterfly",
    items: [["cat_cow", 40], ["adductor_rock", 40], ["butterfly", 55], ["frog", 55], ["wide_fold", 55], ["happy_baby", 45]] },
  { id: "squat", title: "Squat Mobility", mins: 8, blurb: "Own the bottom of a deep squat", hero: "deep_squat",
    items: [["hip_cars", 30], ["deep_squat", 60], ["cossack", 50], ["squat_lunge_flow", 40], ["ninety_switch", 50], ["child_pose", 40]] },
  { id: "deep", title: "Deep Hip Opener", mins: 15, blurb: "Longer holds for when you have time", hero: "pigeon",
    items: [["cat_cow", 50], ["lizard", 60], ["pigeon", 80], ["frog", 70], ["ninety_ninety", 60], ["butterfly", 60], ["child_pose", 60], ["belly_breath", 50]] },
];

export function quickSession(id) {
  const q = QUICK.find((x) => x.id === id);
  if (!q) return null;
  const items = q.items.map(([sid, secs]) => {
    const s = BY_ID[sid];
    return { stretch: s, secs, sides: s.bilateral ? 2 : 1 };
  });
  fitToTarget(items, q.mins * 60);
  return { extra: q.id, title: q.title, hero: q.hero, items, totalSecs: totalSecs(items), dayType: { name: q.title } };
}
