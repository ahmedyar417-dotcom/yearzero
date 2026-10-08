// Choreography for every stretch: how to get into it (entry keyframes) and
// what to do once there (a still hold, or a loop for moving exercises).
// Side one is written out; side two is mirrored automatically.
// Units are cm; see rig.js for the pose format and dirs.js for helpers.

import { sag, fr, hz, torso, supine, mirror, UP, DOWN, FWD, BACK } from "./dirs.js";

const flat = (dir = FWD) => ({ dir, palm: DOWN }); // hand flat on the floor

// ── Starting positions ────────────────────────────────────────────────────
const STAND = {};

const KNEEL = {
  lLeg: { thigh: sag(90, 0.08), shin: sag(180), foot: sag(183) },
  rLeg: { thigh: sag(90, -0.08), shin: sag(180), foot: sag(183) },
  lArm: { up: [0.12, -1, 0.05], fore: [0.08, -1, 0.2] },
  rArm: { up: [-0.12, -1, 0.05], fore: [-0.08, -1, 0.2] },
};

const TABLE = {
  pelvis: torso(-12), chest: torso(-10), head: { up: sag(-25), front: sag(65) },
  lLeg: { thigh: sag(90, 0.08), shin: sag(180), foot: sag(183) },
  rLeg: { thigh: sag(90, -0.08), shin: sag(180), foot: sag(183) },
  lArm: { ik: [12, -39, 25], pole: BACK, hand: flat() },
  rArm: { ik: [-12, -39, 25], pole: BACK, hand: flat() },
};

const SUPINE_ARMS = {
  lArm: { up: hz(12, -0.08), fore: hz(8, -0.05), hand: { dir: hz(5), palm: DOWN } },
  rArm: { up: hz(-12, -0.08), fore: hz(-8, -0.05), hand: { dir: hz(-5), palm: DOWN } },
};
const SUPINE_BENT = {
  pelvis: supine, ...SUPINE_ARMS,
  lLeg: { ik: [11, -3, 40], pole: UP }, rLeg: { ik: [-11, -3, 40], pole: UP },
};
const SUPINE_FLAT = {
  pelvis: supine, ...SUPINE_ARMS,
  lLeg: { thigh: sag(4, 0.06), shin: sag(5, 0.02), knee: UP, foot: [0.1, 0.8, 0.5] },
  rLeg: { thigh: sag(4, -0.06), shin: sag(5, -0.02), knee: UP, foot: [-0.1, 0.8, 0.5] },
};

const SIT_BENT = {
  pelvis: torso(-100), chest: torso(-95), head: torso(-88),
  lLeg: { ik: [12, -10, 44], pole: UP }, rLeg: { ik: [-12, -10, 44], pole: UP },
  lArm: { ik: [19, -14, -22], pole: BACK, hand: flat(BACK) }, rArm: { ik: [-19, -14, -22], pole: BACK, hand: flat(BACK) },
};
const SIT_LONG = {
  pelvis: torso(-92), head: torso(-88),
  lLeg: { thigh: sag(3, 0.07), shin: sag(4, 0.02), knee: UP, foot: [0.05, 0.9, 0.3] },
  rLeg: { thigh: sag(3, -0.07), shin: sag(4, -0.02), knee: UP, foot: [-0.05, 0.9, 0.3] },
  lArm: { ik: [21, -14, -6], pole: BACK, hand: flat() }, rArm: { ik: [-21, -14, -6], pole: BACK, hand: flat() },
};

// Half-kneeling: right knee down, left foot forward.
const HALF_KNEEL_R = {
  lLeg: { ik: [9, -40, 38], pole: sag(-30) },
  rLeg: { ik: [-9, -43, -45], pole: DOWN, foot: sag(182) },
  lArm: { ik: [11, 9, 29], pole: sag(150, 0.6) }, rArm: { ik: [1, 9, 31], pole: sag(150, -0.6) },
};

// ── Holds / loops ─────────────────────────────────────────────────────────
const tableWith = (extra) => ({ ...TABLE, ...extra });

const COW = tableWith({ pelvis: torso(12), chest: torso(-30), head: { up: sag(-55), front: sag(35) } });
const CAT = tableWith({ pelvis: torso(-48), chest: torso(18), head: { up: sag(55), front: sag(145) } });

const BRIDGE_DOWN = { ...SUPINE_BENT, lLeg: { ik: [11, -3, 40], pole: UP }, rLeg: { ik: [-11, -3, 40], pole: UP } };
const BRIDGE_UP = {
  ...SUPINE_BENT, o: [0, 22, 4], pelvis: torso(152), chest: torso(168), head: { up: sag(186), front: sag(276) },
  lLeg: { ik: [11, -3, 40], pole: UP }, rLeg: { ik: [-11, -3, 40], pole: UP },
};

const KNEE_HUG = (k) => ({
  pelvis: supine, head: { up: sag(200 - k * 15), front: sag(290 - k * 15) },
  lLeg: { thigh: sag(-118 - k * 10, 0.12), shin: sag(10 - k * 8, 0.05) },
  rLeg: { thigh: sag(-118 - k * 10, -0.12), shin: sag(10 - k * 8, -0.05) },
  lArm: { ik: [9, 24 + k * 3, -6 - k * 4], pole: [1, -0.3, 0] }, rArm: { ik: [-9, 24 + k * 3, -6 - k * 4], pole: [-1, -0.3, 0] },
});

const HALF_KNEEL_HOLD = {
  ...HALF_KNEEL_R, o: [0, -3, 7], pelvis: torso(-96), chest: torso(-93),
  lLeg: { ik: [9, -40, 38], pole: sag(-30) },
  rLeg: { ik: [-9, -43, -45], pole: DOWN, foot: sag(182) },
  rArm: { up: sag(-100, -0.1), fore: sag(-98, -0.05) },
  lArm: { ik: [11, 11, 32], pole: sag(150, 0.6) },
};

const LOW_LUNGE_R = {
  o: [0, -6, 6], pelvis: torso(-80), chest: torso(-58), head: torso(-48),
  rLeg: { ik: [-10, -40, 56], pole: sag(-35) },
  lLeg: { ik: [9, -43, -58], pole: DOWN, foot: sag(182) },
  rArm: { ik: [-16, -6, 40], pole: [-0.4, -0.3, -1] }, lArm: { ik: [-4, -6, 42], pole: [0.6, -0.3, -1] },
};

const KQUAD_R = {
  ...HALF_KNEEL_R, o: [0, -2, 4], pelvis: torso(-92), chest: torso(-88),
  rLeg: { thigh: sag(100, -0.08), shin: sag(-80, -0.05), knee: DOWN, foot: sag(-170) },
  rArm: { ik: [-12, -16, -24], pole: [-0.3, 0, 1], hand: { dir: DOWN, palm: FWD } },
  lArm: { ik: [11, 9, 31], pole: sag(150, 0.6) },
};
const KQUAD_START = { ...KQUAD_R, rLeg: { thigh: sag(100, -0.08), shin: sag(195, -0.02), knee: DOWN, foot: sag(182) }, rArm: { up: [-0.25, -1, -0.3], fore: [-0.2, -1, -0.3] } };

const COUCH_LEAN = {
  o: [0, -4, 10], pelvis: torso(-70), chest: torso(-50), head: torso(-40),
  lLeg: { ik: [10, -40, 50], pole: sag(-35) },
  rLeg: { thigh: sag(100, -0.08), shin: sag(-90, -0.03), knee: DOWN, foot: sag(-90) },
  lArm: { ik: [26, -26, 46], pole: BACK, hand: flat() }, rArm: { ik: [-12, -26, 46], pole: BACK, hand: flat() },
};
const COUCH_UP = {
  ...COUCH_LEAN, o: [0, -3, 8], pelvis: torso(-94), chest: torso(-92), head: torso(-90),
  lArm: { ik: [12, 10, 34], pole: sag(150, 0.6) }, rArm: { ik: [2, 10, 35], pole: sag(150, -0.6) },
};

const LIZARD_HANDS = {
  ...TABLE, o: [0, -4, 4], pelvis: torso(-25), chest: torso(-15), head: { up: sag(-25), front: sag(65) },
  rLeg: { ik: [-24, -34, 46], pole: [-0.6, 0.6, 0.4] },
  lLeg: { ik: [8, -36, -62], pole: DOWN, foot: sag(182) },
  lArm: { ik: [2, -38, 52], pole: BACK, hand: flat() }, rArm: { ik: [-10, -38, 52], pole: BACK, hand: flat() },
};
const LIZARD_LOW = {
  ...LIZARD_HANDS, o: [0, -12, 8], pelvis: torso(-10), chest: torso(2), head: { up: sag(-5), front: sag(85) },
  lArm: { ik: [3, -37, 56], pole: DOWN, hand: flat() }, rArm: { ik: [-12, -37, 56], pole: DOWN, hand: flat() },
};

const FIG4_CROSS = {
  ...SUPINE_BENT,
  rLeg: { ik: [5, 26, 30], pole: [-1, 0.4, 0.3], foot: [0.6, 0.6, 0.4] },
};
const FIG4_PULL = {
  ...SUPINE_BENT, head: { up: sag(195), front: sag(285) },
  lLeg: { thigh: sag(-100, 0.12), shin: sag(8, 0.05) },
  rLeg: { ik: [3, 34, 8], pole: [-1, 0.2, 0.4], foot: [0.6, 0.6, 0.4] },
  lArm: { ik: [11, 24, -4], pole: [1, -0.4, 0] }, rArm: { ik: [1, 24, -4], pole: [-1, -0.4, 0] },
};

const PIGEON_STEP = {
  ...TABLE, o: [0, -6, 6],
  rLeg: { thigh: sag(60, -0.35), shin: hz(70, -0.4) },
};
const PIGEON_UP = {
  o: [0, -10, 0], pelvis: torso(-70), chest: torso(-75), head: torso(-82),
  rLeg: { thigh: sag(8, -0.22), shin: hz(78, -0.08), foot: hz(75, -0.3) },
  lLeg: { thigh: sag(168, 0.04), shin: sag(176, 0.02), knee: DOWN, foot: sag(182) },
  lArm: { ik: [19, -16, 18], pole: BACK, hand: flat() }, rArm: { ik: [-21, -16, 18], pole: BACK, hand: flat() },
};

// 90/90 with the right leg in front (her left leg behind, out to the side).
const NINETY_R = {
  pelvis: torso(-92), head: torso(-90),
  rLeg: { thigh: hz(-8, -0.12), shin: hz(82, -0.04), foot: hz(85, -0.2) },
  lLeg: { thigh: hz(88, -0.12), shin: hz(178, -0.04), foot: hz(180, -0.1) },
  lArm: { ik: [17, -13, -20], pole: BACK, hand: flat(BACK) }, rArm: { ik: [-17, -13, -20], pole: BACK, hand: flat(BACK) },
};
const NINETY_R_FOLD = {
  ...NINETY_R, pelvis: torso(-62), chest: torso(-48), head: torso(-40),
  lArm: { ik: [12, -14, 36], pole: BACK, hand: flat() }, rArm: { ik: [-12, -14, 38], pole: BACK, hand: flat() },
};
const KNEES_UP = { ...SIT_BENT, lLeg: { ik: [24, -10, 40], pole: UP }, rLeg: { ik: [-24, -10, 40], pole: UP } };

const TWIST = {
  ...SUPINE_BENT,
  pelvis: { up: BACK, front: [0.65, 0.76, 0] }, chest: { up: BACK, front: [0.15, 0.99, 0] }, head: { up: BACK, front: [-0.6, 0.8, 0] },
  rLeg: { thigh: [0.88, 0.05, 0.47], shin: [0.1, -0.55, 0.83], knee: [0.45, 0.2, 0.85] },
  lLeg: { thigh: sag(3, 0.06), shin: sag(4, 0.02), knee: UP, foot: [0.1, 0.8, 0.5] },
  lArm: { up: fr(4), fore: fr(2), hand: { dir: fr(0), palm: DOWN } }, rArm: { up: fr(176), fore: fr(178), hand: { dir: fr(180), palm: DOWN } },
};
const T_ARMS = { ...SUPINE_BENT, lArm: TWIST.lArm, rArm: TWIST.rArm };

const HAPPY_BABY = {
  pelvis: supine,
  lLeg: { thigh: [0.5, 0.42, -0.75], shin: [0.06, 1, 0.08], foot: [0, 0.15, -1] }, rLeg: { thigh: [-0.5, 0.42, -0.75], shin: [-0.06, 1, 0.08], foot: [0, 0.15, -1] },
  lArm: { ik: [22, 30, -12], pole: [0.4, -0.9, 0] }, rArm: { ik: [-22, 30, -12], pole: [-0.4, -0.9, 0] },
};

const BUTTERFLY = {
  pelvis: torso(-84), chest: torso(-76), head: torso(-74),
  lLeg: { ik: [5, -13, 30], pole: [1, 0.25, 0.1], foot: [-0.4, -0.3, 0.85] },
  rLeg: { ik: [-5, -13, 30], pole: [-1, 0.25, 0.1], foot: [0.4, -0.3, 0.85] },
  lArm: { ik: [6, -9, 30], pole: [1, -0.3, -0.2] }, rArm: { ik: [-6, -9, 30], pole: [-1, -0.3, -0.2] },
};
const BUTTERFLY_START = { ...SIT_BENT, lLeg: { ik: [8, -12, 36], pole: [0.6, 1, 0] }, rLeg: { ik: [-8, -12, 36], pole: [-0.6, 1, 0] } };

const FROG = {
  pelvis: torso(-4), chest: torso(-6), head: { up: sag(-15), front: sag(75) },
  lLeg: { thigh: fr(22, 0.05), shin: sag(180, 0.04), knee: DOWN, foot: hz(100, -0.3) },
  rLeg: { thigh: fr(158, 0.05), shin: sag(180, -0.04), knee: DOWN, foot: hz(-100, -0.3) },
  lArm: { ik: [12, -23, 46], pole: [0, -1, -0.4], hand: flat() }, rArm: { ik: [-12, -23, 46], pole: [0, -1, -0.4], hand: flat() },
};
const FROG_WIDE_HANDS = { ...FROG, pelvis: torso(-12), chest: torso(-10), lArm: { ik: [12, -30, 26], pole: BACK, hand: flat() }, rArm: { ik: [-12, -30, 26], pole: BACK, hand: flat() } };

const ADD_OUT = {
  ...TABLE,
  rLeg: { ik: [-70, -34, 2], pole: [0, 0.3, 1], foot: FWD },
  lLeg: { ik: [8, -36, -44], pole: DOWN, foot: sag(182) },
};
const ADD_BACK = { ...ADD_OUT, o: [0, -5, -17], pelvis: torso(-6), chest: torso(-12) };

const WIDE = (lean) => ({
  pelvis: torso(-90 + lean), chest: torso(-86 + lean * 1.2), head: torso(-80 + lean * 1.2),
  lLeg: { thigh: hz(48, -0.06), shin: hz(48, -0.08), knee: UP, foot: [0, 1, 0.35] },
  rLeg: { thigh: hz(-48, -0.06), shin: hz(-48, -0.08), knee: UP, foot: [0, 1, 0.35] },
  lArm: { ik: [13, -14, 12 + lean * 0.75], pole: [0.6, 0, -1], hand: flat() }, rArm: { ik: [-13, -14, 12 + lean * 0.75], pole: [-0.6, 0, -1], hand: flat() },
});

const FEET_WIDE = { l: [48, -95, 2], r: [-48, -95, 2] };
const PRAYER = { lArm: { ikRel: [2, 14, 24], pole: [1, -0.5, -0.3], hand: { dir: UP, palm: [-1, 0, 0] } }, rArm: { ikRel: [-2, 14, 24], pole: [-1, -0.5, -0.3], hand: { dir: UP, palm: [1, 0, 0] } } };
const WIDE_STAND = {
  o: [0, -18, 0], ...PRAYER,
  lLeg: { ik: FEET_WIDE.l, pole: hz(30), foot: hz(25) }, rLeg: { ik: FEET_WIDE.r, pole: hz(-30), foot: hz(-25) },
};
const COSSACK_R = {
  o: [-32, -46, 0], pelvis: torso(-72), chest: torso(-75), head: torso(-82), ...PRAYER,
  rLeg: { ik: FEET_WIDE.r, pole: hz(-40, 0.3), foot: hz(-25) },
  lLeg: { ik: FEET_WIDE.l, pole: UP, foot: [0.2, 0.9, 0.35] },
};
const WIDE_SQUAT = {
  o: [0, -34, -4], pelvis: torso(-74), chest: torso(-78), head: torso(-84), ...PRAYER,
  lLeg: { ik: FEET_WIDE.l, pole: hz(40, 0.3), foot: hz(25) }, rLeg: { ik: FEET_WIDE.r, pole: hz(-40, 0.3), foot: hz(-25) },
};

const POLE_HANDS = (y) => ({ lArm: { ik: [9, y, 40], pole: [1, -0.3, -0.5] }, rArm: { ik: [-9, y, 40], pole: [-1, -0.3, -0.5] } });
const SQUAT_STAND = {
  ...POLE_HANDS(4),
  lLeg: { ik: [17, -93, 4], pole: hz(20), foot: hz(18) }, rLeg: { ik: [-17, -93, 4], pole: hz(-20), foot: hz(-18) },
};
const DEEP_SQUAT = {
  o: [0, -62, -14], pelvis: torso(-62), chest: torso(-70), head: torso(-78), ...POLE_HANDS(-28),
  lLeg: { ik: [17, -93, 4], pole: hz(28, 0.2), foot: hz(18) }, rLeg: { ik: [-17, -93, 4], pole: hz(-28, 0.2), foot: hz(-18) },
};

const HAM_TUCK = { ...SUPINE_BENT, rLeg: { thigh: sag(-130, -0.06), shin: sag(5, -0.03) }, lArm: { ik: [5, 20, -6], pole: [1, -0.5, 0] }, rArm: { ik: [-12, 20, -6], pole: [-1, -0.5, 0] } };
const HAM_UP = {
  ...SUPINE_BENT, head: { up: sag(184), front: sag(274) },
  rLeg: { thigh: sag(-98, -0.06), shin: sag(-100, -0.06), knee: BACK, foot: [0, 0.25, -1] },
  lArm: { ik: [4, 34, -14], pole: [1, -0.6, 0] }, rArm: { ik: [-12, 34, -14], pole: [-1, -0.6, 0] },
};

// Half split: left knee down, right leg straight forward.
const HALF_SPLIT_UP = {
  o: [0, 0, -6], pelvis: torso(-84), chest: torso(-84),
  lLeg: { ik: [9, -43, -46], pole: DOWN, foot: sag(182) },
  rLeg: { thigh: sag(24, -0.06), shin: sag(25, -0.04), knee: sag(-66), foot: sag(-62) },
  lArm: { ik: [16, -24, 22], pole: BACK, hand: flat() }, rArm: { ik: [-24, -24, 24], pole: BACK, hand: flat() },
};
const HALF_SPLIT_FOLD = {
  ...HALF_SPLIT_UP, pelvis: torso(-45), chest: torso(-28), head: torso(-20),
  lArm: { ik: [12, -26, 38], pole: BACK, hand: flat() }, rArm: { ik: [-26, -26, 40], pole: BACK, hand: flat() },
};
const HALF_KNEEL_FWD_R = mirror(HALF_KNEEL_R); // right foot forward, left knee down

const FLOW_SQUAT = {
  o: [0, -62, -14], pelvis: torso(-48), chest: torso(-52), head: torso(-60),
  lLeg: { ik: [17, -93, 4], pole: hz(28, 0.2), foot: hz(18) }, rLeg: { ik: [-17, -93, 4], pole: hz(-28, 0.2), foot: hz(-18) },
  lArm: { ik: [12, -92, 30], pole: BACK, hand: flat() }, rArm: { ik: [-12, -92, 30], pole: BACK, hand: flat() },
};
const FLOW_LUNGE = {
  o: [0, -52, -8], pelvis: torso(-60), chest: torso(-50), head: torso(-45),
  lLeg: { ik: [17, -93, 4], pole: sag(-40, 0.2), foot: hz(10) },
  rLeg: { ik: [-12, -96, -78], pole: DOWN, foot: sag(182) },
  lArm: { ik: [32, -92, 30], pole: BACK, hand: flat() }, rArm: { ik: [-12, -92, 30], pole: BACK, hand: flat() },
};

const CHILD_SIT = {
  ...KNEEL, o: [0, -26, -18], pelvis: torso(-70), chest: torso(-60),
  lLeg: { ik: [10, -42, -36], pole: [0.2, -0.3, 1], foot: sag(183) }, rLeg: { ik: [-10, -42, -36], pole: [-0.2, -0.3, 1], foot: sag(183) },
  lArm: { ik: [16, -38, 30], pole: BACK, hand: flat() }, rArm: { ik: [-16, -38, 30], pole: BACK, hand: flat() },
};
const CHILD_POSE = {
  o: [0, -28, -22], pelvis: torso(12), chest: torso(16), head: { up: sag(38), front: sag(128) },
  lLeg: { ik: [8, -42, -38], pole: [0.75, -0.3, 0.6], foot: sag(183) }, rLeg: { ik: [-8, -42, -38], pole: [-0.75, -0.3, 0.6], foot: sag(183) },
  lArm: { ik: [16, -41, 60], pole: UP, hand: flat() }, rArm: { ik: [-16, -41, 60], pole: UP, hand: flat() },
};

const BELLY = { ...SUPINE_BENT, lArm: { ik: [7, 13, 4], pole: [1, -0.4, -0.3], hand: { dir: [-0.6, 0, 0.8], palm: DOWN } }, rArm: { ik: [-7, 13, 4], pole: [-1, -0.4, -0.3], hand: { dir: [0.6, 0, 0.8], palm: DOWN } } };

const HIPCAR_FWD = tableWith({ rLeg: { thigh: sag(48, -0.12), shin: sag(165, -0.05), foot: sag(175) } });
const HIPCAR_SIDE = tableWith({ rLeg: { thigh: [-0.85, -0.45, -0.1], shin: [-0.2, -0.3, -0.93], foot: sag(180) } });
const HIPCAR_BACK = tableWith({ rLeg: { thigh: sag(192, -0.08), shin: sag(186, -0.06), knee: DOWN, foot: sag(190) } });

// ── The table ─────────────────────────────────────────────────────────────
// cam: viewing angle (az: 0 = front, −90 = from her right side; el: degrees up)
export const MOVES = {
  cat_cow: { cam: { az: -80, el: 8 }, entry: [KNEEL, TABLE], loop: [COW, CAT], beat: 3.2 },
  glute_bridge: { cam: { az: -80, el: 10 }, entry: [SUPINE_FLAT, SUPINE_BENT], loop: [BRIDGE_DOWN, BRIDGE_UP], beat: 2.6 },
  knee_hug: { cam: { az: -80, el: 12 }, entry: [SUPINE_BENT, KNEE_HUG(0)], loop: [KNEE_HUG(0), KNEE_HUG(1)], beat: 2.4 },
  hip_cars: { cam: { az: -55, el: 14 }, entry: [KNEEL, TABLE], loop: [HIPCAR_FWD, HIPCAR_SIDE, HIPCAR_BACK, TABLE], beat: 1.6 },
  half_kneel: { cam: { az: -75, el: 8 }, entry: [KNEEL, HALF_KNEEL_R, HALF_KNEEL_HOLD] },
  low_lunge: { cam: { az: -80, el: 8 }, entry: [KNEEL, HALF_KNEEL_FWD_R, LOW_LUNGE_R] },
  kneeling_quad: { cam: { az: -70, el: 8 }, entry: [KNEEL, HALF_KNEEL_R, KQUAD_START, KQUAD_R] },
  couch: { cam: { az: -75, el: 8 }, entry: [KNEEL, COUCH_LEAN, COUCH_UP], wall: "rLeg", blocks: false },
  lizard: { cam: { az: -70, el: 12 }, entry: [TABLE, LIZARD_HANDS, LIZARD_LOW] },
  figure4: { cam: { az: -70, el: 16 }, entry: [SUPINE_BENT, FIG4_CROSS, FIG4_PULL] },
  pigeon: { cam: { az: -55, el: 12 }, entry: [TABLE, PIGEON_STEP, PIGEON_UP] },
  ninety_ninety: { cam: { az: -20, el: 18 }, entry: [SIT_BENT, NINETY_R, NINETY_R_FOLD] },
  ninety_switch: { cam: { az: -10, el: 20 }, entry: [SIT_BENT, NINETY_R], loop: [NINETY_R, KNEES_UP, mirror(NINETY_R), KNEES_UP], beat: 1.8 },
  supine_twist: { cam: { az: -30, el: 35 }, entry: [SUPINE_BENT, T_ARMS, TWIST] },
  happy_baby: { cam: { az: -75, el: 14 }, entry: [SUPINE_BENT, KNEE_HUG(0), HAPPY_BABY] },
  butterfly: { cam: { az: -15, el: 15 }, entry: [SIT_LONG, BUTTERFLY_START, BUTTERFLY] },
  frog: { cam: { az: -140, el: 28 }, entry: [TABLE, FROG_WIDE_HANDS, FROG] },
  adductor_rock: { cam: { az: -150, el: 22 }, entry: [TABLE, ADD_OUT], loop: [ADD_OUT, ADD_BACK], beat: 2.6 },
  wide_fold: { cam: { az: -15, el: 16 }, entry: [SIT_LONG, WIDE(0), WIDE(32)] },
  cossack: { cam: { az: -8, el: 8 }, entry: [STAND, WIDE_STAND, WIDE_SQUAT], loop: [WIDE_SQUAT, COSSACK_R, WIDE_SQUAT, mirror(COSSACK_R)], beat: 2.4 },
  deep_squat: { cam: { az: -70, el: 8 }, entry: [SQUAT_STAND, DEEP_SQUAT], pole: true },
  supine_hamstring: { cam: { az: -80, el: 10 }, entry: [SUPINE_BENT, HAM_TUCK, HAM_UP], strap: true },
  half_split: { cam: { az: -80, el: 8 }, entry: [KNEEL, HALF_KNEEL_FWD_R, HALF_SPLIT_UP, HALF_SPLIT_FOLD], blocks: true },
  squat_lunge_flow: { cam: { az: -75, el: 10 }, entry: [SQUAT_STAND, FLOW_SQUAT], loop: [FLOW_SQUAT, FLOW_LUNGE], beat: 2.8 },
  child_pose: { cam: { az: -75, el: 14 }, entry: [KNEEL, CHILD_SIT, CHILD_POSE] },
  belly_breath: { cam: { az: -75, el: 14 }, entry: [SUPINE_BENT, BELLY] },
};

