// Stick-figure engine for the stretch demonstrations.
//
// A pose is described with absolute segment angles in SVG degrees
// (0 = right, 90 = down, 180 = left, -90 = up). Any segment can be:
//   number            angle, full length
//   [angle, scale]    angle with foreshortening (for front/top views)
//   { at: [x, y] }    point the segment at an absolute point
// Limbs can instead use { ik: [x, y], bend: 1 | -1, foot } to plant a hand
// or foot on an absolute point (coordinates share the hip's frame, hip = o).
//
// Views: "side" (figure faces right, floor auto-grounded, far limbs muted),
//        "front" (floor auto-grounded, shoulders/hips drawn wide),
//        "top" (looking down on a mat, no floor).

export const LEN = { torso: 31, shoulder: 0.88, neck: 9, headR: 5.8, ua: 16, fa: 18, th: 22, sh: 21, ft: 7 };
const WIDE = { shoulder: 7, hip: 5 };

const rad = (d) => (d * Math.PI) / 180;
const dir = (a, l) => [Math.cos(rad(a)) * l, Math.sin(rad(a)) * l];
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const angTo = (from, to) => (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;

function segSpec(v, from, fallback) {
  if (v == null) v = fallback;
  if (typeof v === "number") return [v, 1];
  if (Array.isArray(v)) return [v[0], v[1] ?? 1];
  if (v.at) return [angTo(from, v.at), v.s ?? 1];
  return [0, 1];
}

function ik(origin, target, a, b, bend = 1) {
  const dx = target[0] - origin[0];
  const dy = target[1] - origin[1];
  let d = Math.hypot(dx, dy);
  d = Math.min(Math.max(d, Math.abs(a - b) + 0.01), a + b - 0.01);
  const base = Math.atan2(dy, dx);
  const alpha = Math.acos((a * a + d * d - b * b) / (2 * a * d));
  const first = base - bend * alpha;
  const joint = [origin[0] + Math.cos(first) * a, origin[1] + Math.sin(first) * a];
  const second = Math.atan2(target[1] - joint[1], target[0] - joint[0]);
  return [(first * 180) / Math.PI, (second * 180) / Math.PI];
}

// Resolve a pose spec into plain numbers: { o, t:[a,s], c, h:[a,s], a1, a2, l1, l2 }
// where limbs are [[a,s],[a,s]] (arms) or [[a,s],[a,s],[a,s]] (legs).
export function resolve(p, view) {
  const o = p.o || [0, 0];
  const t = segSpec(p.t, o, -90);
  const neck = add(o, dir(t[0], LEN.torso * t[1]));
  const shoulder = add(o, dir(t[0], LEN.torso * t[1] * LEN.shoulder));
  const wide = view !== "side";
  // shoulders and hips are drawn wide in front/top views; must match joints()
  const hp = (i) => (wide ? add(o, [i === 1 ? -WIDE.hip : WIDE.hip, 0]) : o);
  const shPt = (i) => (wide ? add(shoulder, dir(t[0] + (i === 1 ? -90 : 90), WIDE.shoulder)) : shoulder);

  const arm = (spec, i) => {
    const s = shPt(i);
    if (spec && spec.ik) {
      const [u, f] = ik(s, spec.ik, LEN.ua, LEN.fa, spec.bend ?? -1);
      return [[u, 1], [f, 1]];
    }
    const u = segSpec(spec?.[0], s, 90);
    const elbow = add(s, dir(u[0], LEN.ua * u[1]));
    const f = segSpec(spec?.[1], elbow, u[0]);
    return [u, f];
  };
  const leg = (spec, i) => {
    const h = hp(i);
    if (spec && spec.ik) {
      const [u, f] = ik(h, spec.ik, LEN.th, LEN.sh, spec.bend ?? 1);
      return [[u, 1], [f, 1], segSpec(spec.foot, null, 0)];
    }
    const u = segSpec(spec?.[0], h, 90);
    const knee = add(h, dir(u[0], LEN.th * u[1]));
    const s = segSpec(spec?.[1], knee, u[0]);
    const ankle = add(knee, dir(s[0], LEN.sh * s[1]));
    const f = segSpec(spec?.[2], ankle, 0);
    return [u, s, f];
  };

  return {
    o: [...o],
    t,
    c: p.c || 0,
    h: segSpec(p.h, neck, t[0]),
    a1: arm(p.a1, 1),
    a2: arm(p.a2, 2),
    l1: leg(p.l1, 1),
    l2: leg(p.l2, 2),
    strap: p.strap ? 1 : 0,
    wall: p.wall ?? null,
    pole: p.pole ?? null,
  };
}

export function lerpPose(a, b, k) {
  const rec = (x, y) => {
    if (typeof x === "number") return typeof y === "number" ? x + (y - x) * k : x;
    if (Array.isArray(x)) return x.map((v, i) => rec(v, y?.[i]));
    if (x && typeof x === "object") {
      const out = {};
      for (const key of Object.keys(x)) out[key] = rec(x[key], y?.[key]);
      return out;
    }
    return x;
  };
  return rec(a, b);
}

// Forward kinematics → joint points.
export function joints(r, view) {
  const wide = view !== "side";
  const hip = r.o;
  const neck = add(hip, dir(r.t[0], LEN.torso * r.t[1]));
  const shoulder = add(hip, dir(r.t[0], LEN.torso * r.t[1] * LEN.shoulder));
  const n = [Math.sin(rad(r.t[0])), -Math.cos(rad(r.t[0]))];
  const mid = add(hip, dir(r.t[0], (LEN.torso * r.t[1]) / 2));
  const ctrl = add(mid, [n[0] * r.c * 2, n[1] * r.c * 2]);
  const head = add(neck, dir(r.h[0], LEN.neck * r.h[1]));

  const limb = (start, spec, lens) => {
    const pts = [start];
    let p = start;
    spec.forEach((s, i) => {
      p = add(p, dir(s[0], lens[i] * s[1]));
      pts.push(p);
    });
    return pts;
  };
  const shL = wide ? add(shoulder, dir(r.t[0] - 90, WIDE.shoulder)) : shoulder;
  const shR = wide ? add(shoulder, dir(r.t[0] + 90, WIDE.shoulder)) : shoulder;
  const hipL = wide ? add(hip, [-WIDE.hip, 0]) : hip;
  const hipR = wide ? add(hip, [WIDE.hip, 0]) : hip;

  return {
    hip, neck, shoulder, ctrl, head,
    shL, shR, hipL, hipR,
    a1: limb(shL, r.a1, [LEN.ua, LEN.fa]),
    a2: limb(shR, r.a2, [LEN.ua, LEN.fa]),
    l1: limb(hipL, r.l1, [LEN.th, LEN.sh, LEN.ft]),
    l2: limb(hipR, r.l2, [LEN.th, LEN.sh, LEN.ft]),
  };
}

// Lowest body surface (joints padded by roughly how thick the body is there).
export function lowestY(j) {
  const padded = [
    [j.hip, 5.5], [j.neck, 3.5], [j.shoulder, 4.5], [j.shL, 2.5], [j.shR, 2.5], [j.hipL, 4], [j.hipR, 4],
    [j.a1[1], 2], [j.a1[2], 1.4], [j.a2[1], 2], [j.a2[2], 1.4],
    [j.l1[1], 2.8], [j.l1[2], 1.6], [j.l1[3], 1.2], [j.l2[1], 2.8], [j.l2[2], 1.6], [j.l2[3], 1.2],
  ];
  // torso curve midpoint
  const cm = [0.25 * j.hip[0] + 0.5 * j.ctrl[0] + 0.25 * j.neck[0], 0.25 * j.hip[1] + 0.5 * j.ctrl[1] + 0.25 * j.neck[1]];
  let y = Math.max(...padded.map(([p, r]) => p[1] + r), cm[1] + 4.5);
  y = Math.max(y, j.head[1] + LEN.headR * 1.05);
  return y;
}

export function bounds(j) {
  const pts = [j.hip, j.neck, ...j.a1, ...j.a2, ...j.l1, ...j.l2, j.shL, j.shR];
  const xs = pts.map((p) => p[0]).concat([j.head[0] - LEN.headR, j.head[0] + LEN.headR]);
  const ys = pts.map((p) => p[1]).concat([j.head[1] - LEN.headR, j.head[1] + LEN.headR]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// Make B's angles take the short way round from A (authored long swings stay
// under 180 degrees, so this only fixes ik/atan2 wrap-around).
export function unwrapTo(a, b) {
  const fix = (x, y) => {
    let v = y[0];
    while (v - x[0] > 180) v -= 360;
    while (v - x[0] < -180) v += 360;
    return [v, y[1]];
  };
  const limb = (xa, ya) => ya.map((seg, i) => fix(xa[i], seg));
  return { ...b, t: fix(a.t, b.t), h: fix(a.h, b.h), a1: limb(a.a1, b.a1), a2: limb(a.a2, b.a2), l1: limb(a.l1, b.l1), l2: limb(a.l2, b.l2) };
}

// Sample a sequence of resolved keyframes at k in [0, 1].
export function sample(frames, k) {
  if (frames.length === 2) return lerpPose(frames[0], frames[1], k);
  const n = frames.length - 1;
  const i = Math.min(Math.floor(k * n), n - 1);
  return lerpPose(frames[i], frames[i + 1], k * n - i);
}
