import { useEffect, useId, useMemo, useRef, useState } from "react";
import { POSES } from "./poses.js";
import { resolve, joints, lowestY, bounds, unwrapTo, sample, LEN } from "./figure.js";
import { limb, torso, head, circle } from "./body.js";

const ASPECT = 0.62; // height / width of the stage

// Muscle shapes: [start radius, mid posterior, mid anterior, end radius]
const W = {
  thigh: [4.3, 4.0, 4.4, 2.9],
  shin: [2.75, 3.15, 2.3, 1.45],
  foot: [1.45, 1.35, 1.25, 1.15],
  upper: [2.45, 2.35, 2.45, 1.75],
  fore: [1.85, 1.75, 1.85, 1.2],
  hand: [1.25, 1.55, 1.55, 1.15],
  neck: [2.3, 2.3, 2.3, 2.2],
};

function frame(r, view) {
  const j = joints(r, view);
  if (view === "top") return { ...j, dy: 0 };
  const dy = -lowestY(j); // put the floor at y = 0
  const shift = (p) => [p[0], p[1] + dy];
  const out = { dy };
  for (const [k, v] of Object.entries(j)) {
    out[k] = Array.isArray(v[0]) ? v.map(shift) : shift(v);
  }
  return out;
}

const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const deg = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function Leg({ l, far, sym }) {
  const pants = far ? "var(--pants-far)" : "var(--pants)";
  const skin = far ? "var(--skin-far)" : "var(--skin)";
  const [hip, knee, ankle, toe] = l;
  const heelDir = [ankle[0] - toe[0], ankle[1] - toe[1]];
  const hl = Math.hypot(...heelDir) || 1;
  const heel = [ankle[0] + (heelDir[0] / hl) * 0.9, ankle[1] + (heelDir[1] / hl) * 0.9];
  return (
    <g className="part">
      <path d={limb(heel, toe, W.foot, true)} fill={skin} />
      <path d={limb(knee, ankle, W.shin, sym)} fill={pants} />
      <path d={limb(hip, knee, W.thigh, sym)} fill={pants} />
    </g>
  );
}

function Arm({ a, far, sym }) {
  const skin = far ? "var(--skin-far)" : "var(--skin)";
  const [sh, el, hand] = a;
  const wrist = lerp2(el, hand, 0.8);
  const tip = lerp2(el, hand, 1.08);
  return (
    <g className="part">
      <path d={limb(el, wrist, W.fore, sym)} fill={skin} />
      <path d={limb(wrist, tip, W.hand, true)} fill={skin} />
      <path d={limb(sh, el, W.upper, sym)} fill={skin} />
    </g>
  );
}

function Glow({ j, focus, uid }) {
  const shapes = [];
  const seg = (a, b, w, key) => {
    const c = lerp2(a, b, 0.5);
    shapes.push(<ellipse key={key} cx={c[0]} cy={c[1]} rx={Math.max(dist(a, b) / 2 + 1.5, 4)} ry={w} transform={`rotate(${deg(a, b)} ${c[0]} ${c[1]})`} />);
  };
  const spine = (s0, s1) => [lerp2(j.hip, j.neck, s0), lerp2(j.hip, j.neck, s1)];
  for (const f of focus || []) {
    if (f === "hip") shapes.push(<circle key={f} cx={j.hip[0]} cy={j.hip[1]} r={6.5} />);
    else if (f === "torso.low") seg(...spine(0.05, 0.45), 6, f);
    else if (f === "torso.mid") seg(...spine(0.3, 0.6), 6, f);
    else {
      const [side, part] = f.split(".");
      const l = j[side];
      if (part === "th") seg(l[0], l[1], 4.6, f);
      if (part === "thTop") seg(l[0], lerp2(l[0], l[1], 0.55), 4.8, f);
      if (part === "sh") seg(l[1], l[2], 3.4, f);
    }
  }
  return <g fill="var(--glow)" filter={`url(#blur-${uid})`} className="glow">{shapes}</g>;
}

export default function Figure({ pose: poseId, playing = true, mirror = false, fixedK, className = "" }) {
  const uid = useId().replace(/:/g, "");
  const def = POSES[poseId];
  const { A, frames, view, viewBox, fig } = useMemo(() => {
    if (!def) return {};
    const frames = [def.A, def.M, def.B].filter(Boolean).map((p) => resolve(p, def.view));
    for (let i = 1; i < frames.length; i++) frames[i] = unwrapTo(frames[i - 1], frames[i]);
    const A = frames[0];
    // Sample several frames so the stage fits the whole motion.
    const samples = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((k) => bounds(frame(sample(frames, k), def.view)));
    const b = samples.reduce((acc, s) => ({
      minX: Math.min(acc.minX, s.minX), maxX: Math.max(acc.maxX, s.maxX),
      minY: Math.min(acc.minY, s.minY), maxY: Math.max(acc.maxY, s.maxY),
    }));
    for (const p of [A.wall, A.pole]) if (p != null) { b.minX = Math.min(b.minX, p - 4); b.maxX = Math.max(b.maxX, p + 4); }
    const pad = 15;
    let w = Math.max(b.maxX - b.minX + pad * 2, 110);
    let h, x0, y0;
    if (def.view === "top") {
      h = Math.max(b.maxY - b.minY + pad * 2, w * ASPECT);
      w = Math.max(w, h / ASPECT);
      h = w * ASPECT;
      x0 = (b.minX + b.maxX) / 2 - w / 2;
      y0 = (b.minY + b.maxY) / 2 - h / 2;
    } else {
      const need = -b.minY + pad;
      w = Math.max(w, need / 0.84 / ASPECT);
      h = w * ASPECT;
      x0 = (b.minX + b.maxX) / 2 - w / 2;
      y0 = -h * 0.84;
    }
    return { A, frames, view: def.view, viewBox: [x0, y0, w, h], fig: b };
  }, [poseId]);

  const [k, setK] = useState(0);
  const start = useRef(null);
  useEffect(() => {
    if (!def || !playing || fixedK != null) return;
    let raf;
    const period = (def.period || 6) * 1000;
    const tick = (now) => {
      if (start.current == null) start.current = now - k * period * 0.5;
      const phase = ((now - start.current) % period) / period; // 0..1
      const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      setK(ease(tri));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); start.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poseId, playing]);

  if (!def) return null;
  const r = sample(frames, fixedK ?? k);
  const j = frame(r, view);
  const [x0, y0, w, h] = viewBox;
  const side = view === "side";
  const sym = !side;
  const transform = mirror ? `translate(${2 * x0 + w} 0) scale(-1 1)` : undefined;
  const hd = head(j.head, r.h[0], LEN.headR, side ? "side" : "front");
  const neckTop = lerp2(j.neck, j.head, 0.55);
  const neckBase = side ? lerp2(j.shoulder, j.neck, 0.4) : lerp2(j.shoulder, j.neck, 0.2);
  const mid = (fig.minX + fig.maxX) / 2;

  const torsoPath = torso(j.hip, j.ctrl, j.neck, view);
  const pelvisPath = torso(j.hip, j.ctrl, j.neck, view, 0, 0.3);
  const backOfHead = def.prone && !side;

  const body = (
    <g stroke="var(--outline)" strokeWidth={0.45} strokeLinejoin="round">
      {side && <Arm a={j.a2} far sym={sym} />}
      {side && <Leg l={j.l2} far sym={sym} />}
      {!side && <Leg l={j.l1} sym={sym} />}
      {!side && <Leg l={j.l2} sym={sym} />}
      <path d={limb(neckBase, neckTop, W.neck, true)} fill="var(--skin)" />
      <path d={torsoPath} fill="var(--top)" />
      <path d={pelvisPath} fill="var(--pants)" />
      {side && <Leg l={j.l1} sym={sym} />}
      {!side && <Arm a={j.a1} sym={sym} />}
      {!side && <Arm a={j.a2} sym={sym} />}
      <g>
        {hd.tail && <path d={hd.tail} fill="var(--hair)" />}
        <path d={backOfHead ? circle(j.head, LEN.headR) : hd.face} fill={backOfHead ? "var(--hair)" : "var(--skin)"} />
        {!backOfHead && <path d={hd.hair} fill="var(--hair)" />}
        {hd.ear && <path d={hd.ear} fill="var(--skin-far)" stroke="none" />}
        {!backOfHead && hd.eyes?.map((e, n) => <circle key={n} cx={e[0]} cy={e[1]} r={0.5} fill="var(--hair)" stroke="none" />)}
        {hd.eye && <circle cx={hd.eye[0]} cy={hd.eye[1]} r={0.55} fill="var(--hair)" stroke="none" />}
      </g>
      {side && <Arm a={j.a1} sym={sym} />}
    </g>
  );

  return (
    <svg className={`figure ${className}`} viewBox={viewBox.join(" ")} role="img" aria-label="Stretch demonstration">
      <defs>
        <linearGradient id={`wall-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--stage-top)" />
          <stop offset="1" stopColor="var(--stage-wall)" />
        </linearGradient>
        <filter id={`blur-${uid}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
        <filter id={`soft-${uid}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" /></filter>
      </defs>
      {view === "top" ? (
        <>
          <rect x={x0} y={y0} width={w} height={h} fill="var(--stage-floor)" />
          <rect x={fig.minX - 9} y={fig.minY - 9} width={fig.maxX - fig.minX + 18} height={fig.maxY - fig.minY + 18} rx={3} fill="var(--matc)" />
        </>
      ) : (
        <>
          <rect x={x0} y={y0} width={w} height={h} fill={`url(#wall-${uid})`} />
          <rect x={x0} y={0} width={w} height={h} fill="var(--stage-floor)" />
          <rect x={fig.minX - 8} y={-0.4} width={fig.maxX - fig.minX + 16} height={2.2} rx={1} fill="var(--matc)" />
          <ellipse cx={mid} cy={1} rx={(fig.maxX - fig.minX) / 2 + 2} ry={2.6} fill="#000" opacity={0.22} filter={`url(#soft-${uid})`} />
        </>
      )}
      <g transform={transform}>
        {A.wall != null && <rect x={A.wall - 3} y={y0} width={3} height={-y0} fill="var(--prop)" />}
        {A.pole != null && <rect x={A.pole - 1.6} y={y0 + 6} width={3.2} height={-y0 - 6} rx={1.4} fill="var(--prop)" />}
        {(def.blocks || []).map(([bx, by], n) => (
          <rect key={n} x={bx - 4.5} y={by + j.dy + 1.3} width={9} height={-(by + j.dy + 1.3)} rx={1} fill="var(--block)" stroke="var(--outline)" strokeWidth={0.4} />
        ))}
        {body}
        {r.strap > 0.5 && (
          <path d={`M${j.a1[2][0]},${j.a1[2][1]} L${j.l1[3][0]},${j.l1[3][1]} L${j.a2[2][0]},${j.a2[2][1]}`} fill="none" stroke="var(--strap)" strokeWidth={1.1} strokeLinejoin="round" />
        )}
        <Glow j={j} focus={def.focus} uid={uid} />
      </g>
    </svg>
  );
}
