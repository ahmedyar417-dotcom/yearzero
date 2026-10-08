// Direction helpers for writing poses (character faces +Z, +X is her left).
const rad = (d) => (d * Math.PI) / 180;

// Sagittal plane: 0 = forward, 90 = down, -90 = up, 180 = back. lat: + = her left.
export const sag = (a, lat = 0) => [lat, -Math.sin(rad(a)), Math.cos(rad(a))];
// Frontal plane: 0 = out to her left, 180 = out to her right, 90 = down, -90 = up. fwd: + = forward.
export const fr = (a, fwd = 0) => [Math.cos(rad(a)), -Math.sin(rad(a)), fwd];
// Horizontal plane: 0 = forward, 90 = her left, -90 = her right, 180 = back. up: + = up.
export const hz = (a, up = 0) => [Math.sin(rad(a)), up, Math.cos(rad(a))];

export const UP = [0, 1, 0], DOWN = [0, -1, 0], FWD = [0, 0, 1], BACK = [0, 0, -1], LEFT = [1, 0, 0], RIGHT = [-1, 0, 0];

// Torso helpers: spine leaving the pelvis at sagittal angle a (−90 = upright),
// belly facing 90° further round.
export const torso = (a, lat = 0) => ({ up: sag(a, lat), front: sag(a + 90) });
// Lying on the back with the head toward −Z (feet toward +Z).
export const supine = { up: BACK, front: UP };
// Face-down with the head toward +Z.
export const prone = { up: FWD, front: DOWN };

// Mirror a pose spec left↔right: negate X everywhere and swap l/r limbs.
export function mirror(spec) {
  const mo = (v) => {
    if (Array.isArray(v)) return typeof v[0] === "number" ? [-v[0], ...v.slice(1)] : v.map(mo);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mo(x)]));
    return v;
  };
  const m = mo(spec);
  [m.lArm, m.rArm] = [m.rArm, m.lArm];
  [m.lLeg, m.rLeg] = [m.rLeg, m.lLeg];
  for (const k of ["lArm", "rArm", "lLeg", "rLeg"]) if (m[k] === undefined) delete m[k];
  return m;
}
