// Shapes for the illustrated body drawn over the skeleton from figure.js.
// Everything returns SVG path strings in the figure's coordinate space.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
// u rotated +90°: for a limb pointing down in a right-facing side view this is
// its posterior (back) side; for the spine pointing up it is the front.
const perp = (u) => [-u[1], u[0]];
const f = (n) => Math.round(n * 100) / 100;
const pt = (p) => `${f(p[0])},${f(p[1])}`;

// Smooth closed curve through points (Catmull-Rom → cubic Bézier).
export function smoothClosed(points, tension = 0.5) {
  const n = points.length;
  let d = `M${pt(points[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    const c1 = add(p1, mul(sub(p2, p0), tension / 3));
    const c2 = sub(p2, mul(sub(p3, p1), tension / 3));
    d += ` C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d + "Z";
}

// Tapered limb with a muscle bulge. w = [rStart, rMidPosterior, rMidAnterior, rEnd]
export function limb(a, b, w, symmetric = false) {
  const v = sub(b, a);
  const L = len(v);
  if (L < 0.3) return circle(a, w[0]);
  const u = norm(v), n = perp(u);
  const [ra, mp, ma, rb] = w;
  const post = symmetric ? (mp + ma) / 2 : mp;
  const ant = symmetric ? (mp + ma) / 2 : ma;
  const at = (t, side, r) => add(add(a, mul(v, t)), mul(n, side * r));
  const capB = (k) => add(b, add(mul(u, rb * Math.cos(k)), mul(n, rb * Math.sin(k))));
  const capA = (k) => add(a, add(mul(u, -ra * Math.cos(k)), mul(n, -ra * Math.sin(k))));
  const pts = [
    at(0, 1, ra), at(0.3, 1, (ra + post) / 2 + 0.15), at(0.55, 1, post), at(0.85, 1, (post + rb) / 2),
    capB(1.2), capB(0.5), capB(0), capB(-0.5), capB(-1.2),
    at(0.85, -1, (ant + rb) / 2), at(0.55, -1, ant), at(0.3, -1, (ra + ant) / 2 + 0.15), at(0, -1, ra),
    capA(1.2), capA(0.5), capA(0), capA(-0.5), capA(-1.2),
  ];
  return smoothClosed(pts, 0.45);
}

export function circle(c, r) {
  return `M${f(c[0] - r)},${f(c[1])} a${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0 a${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0Z`;
}

function bezier(p0, c, p1, t) {
  const m = 1 - t;
  return [m * m * p0[0] + 2 * m * t * c[0] + t * t * p1[0], m * m * p0[1] + 2 * m * t * c[1] + t * t * p1[1]];
}
function bezierTangent(p0, c, p1, t) {
  return norm([2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]), 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1])]);
}

// Torso profile: [s along spine, posterior half-width, anterior half-width]
const SIDE_PROFILE = [[0, 6.4, 4.9], [0.16, 6.0, 5.1], [0.4, 4.3, 4.5], [0.64, 5.0, 5.9], [0.84, 5.2, 5.0], [1, 3.4, 2.9]];
const FRONT_PROFILE = [[0, 9, 9], [0.16, 8.5, 8.5], [0.42, 7, 7], [0.66, 8.2, 8.2], [0.86, 9.2, 9.2], [1, 3, 3]];

// Closed torso outline along the (possibly curved) spine, from s0 to s1.
export function torso(hip, ctrl, neck, view, s0 = 0, s1 = 1, scaleW = 1) {
  const prof = view === "side" ? SIDE_PROFILE : FRONT_PROFILE;
  const widthAt = (s, i) => {
    for (let k = 0; k < prof.length - 1; k++) {
      const [sa, ...wa] = prof[k];
      const [sb, ...wb] = prof[k + 1];
      if (s >= sa && s <= sb) { const t = (s - sa) / (sb - sa || 1); return (wa[i] + (wb[i] - wa[i]) * t) * scaleW; }
    }
    return prof[prof.length - 1][i + 1] * scaleW;
  };
  const steps = 7;
  const back = [], front = [];
  for (let k = 0; k <= steps; k++) {
    const s = s0 + ((s1 - s0) * k) / steps;
    const p = bezier(hip, ctrl, neck, s);
    const u = bezierTangent(hip, ctrl, neck, Math.min(0.999, Math.max(0.001, s)));
    const n = mul(perp(u), -1); // spine points up, so −perp is the posterior (back) side
    back.push(add(p, mul(n, widthAt(s, 0))));
    front.push(add(p, mul(n, -widthAt(s, 1))));
  }
  // round the bottom (pelvis/glutes) when starting at the hip
  const u0 = bezierTangent(hip, ctrl, neck, 0.001);
  const bottom = s0 === 0 ? [add(hip, mul(u0, -3.2))] : [];
  return smoothClosed([...back, ...front.reverse(), ...bottom], 0.42);
}

// Head: skin ellipse plus hair cap, nose and ear. `up` is the angle (deg) neck→head.
export function head(c, upDeg, r, view) {
  const up = (upDeg * Math.PI) / 180;
  const U = [Math.cos(up), Math.sin(up)];
  const F = perp(U); // facing direction: "up" rotated +90°
  const P = mul(F, -1);
  const at = (a, rr = r) => add(c, add(mul(U, Math.cos(a) * rr), mul(F, Math.sin(a) * rr)));
  if (view === "side") {
    // skull + face with a small nose and chin
    const face = smoothClosed([
      at(0, r * 1.02), at(0.6), at(1.15, r * 1.02), add(at(1.45, r * 1.08), mul(F, 0.9)), at(1.75, r * 1.0), at(2.2, r * 0.95),
      at(2.7, r * 0.8), at(3.3, r * 0.85), at(3.9), at(4.6), at(5.4),
    ], 0.5);
    const hair = smoothClosed([
      at(0.55, r * 1.12), at(0.1, r * 1.15), at(-0.6, r * 1.15), at(-1.3, r * 1.13), at(-1.9, r * 1.05),
      at(-2.25, r * 0.8), at(-1.6, r * 0.55), at(-0.9, r * 0.6), at(-0.2, r * 0.75), at(0.45, r * 0.95),
    ], 0.5);
    // ponytail
    const tail = smoothClosed([at(-1.25, r * 1.05), add(at(-1.6, r * 1.6), mul(U, -1)), add(at(-1.95, r * 2.1), mul(U, -2.5)), at(-1.85, r * 1.15)], 0.5);
    const ear = circle(add(c, add(mul(P, r * 0.1), mul(U, -r * 0.05))), r * 0.16);
    const eye = add(c, add(mul(F, r * 0.62), mul(U, r * 0.12)));
    return { face, hair, tail, ear, eye };
  }
  const face = smoothClosed([at(0, r * 1.05), at(0.8), at(1.6, r * 0.95), at(2.4, r * 0.9), at(3.14, r * 0.85), at(-2.4, r * 0.9), at(-1.6, r * 0.95), at(-0.8)], 0.5);
  const hair = smoothClosed([at(1.25, r * 1.0), at(0.6, r * 1.14), at(0, r * 1.18), at(-0.6, r * 1.14), at(-1.25, r * 1.0), at(-0.7, r * 0.8), at(0, r * 0.72), at(0.7, r * 0.8)], 0.5);
  const eyes = [add(c, add(mul(U, r * 0.05), mul(F, r * 0.36))), add(c, add(mul(U, r * 0.05), mul(F, -r * 0.36)))];
  return { face, hair, tail: null, ear: null, eye: null, eyes };
}

export const ptsToStr = pt;
