import { useEffect, useMemo, useRef, useState } from "react";
import { POSES } from "./poses.js";
import { resolve, joints, lowestY, bounds, unwrapTo, sample, LEN } from "./figure.js";

const ASPECT = 0.62; // height / width of the stage

function frame(r, view) {
  const j = joints(r, view);
  if (view === "top") return j;
  const dy = -lowestY(j); // put the floor at y = 0
  const shift = (p) => [p[0], p[1] + dy];
  const out = {};
  for (const [k, v] of Object.entries(j)) {
    out[k] = Array.isArray(v[0]) ? v.map(shift) : shift(v);
  }
  return out;
}

const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);

export default function Figure({ pose: poseId, playing = true, mirror = false, fixedK, className = "" }) {
  const def = POSES[poseId];
  const { A, frames, view, viewBox, floorX } = useMemo(() => {
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
    const pad = 14;
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
      w = Math.max(w, need / 0.86 / ASPECT);
      h = w * ASPECT;
      x0 = (b.minX + b.maxX) / 2 - w / 2;
      y0 = -h * 0.86;
    }
    return { A, frames, view: def.view, viewBox: [x0, y0, w, h], floorX: [x0, x0 + w] };
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
  const pts = (arr) => arr.map((p) => p.join(",")).join(" ");
  const side = view === "side";
  const far = side ? "var(--fig-far)" : "var(--fig)";
  const limbW = 5.2;
  const footStart = (l) => l[2];

  const leg = (l, color) => (
    <g>
      <polyline points={pts(l.slice(0, 3))} stroke={color} strokeWidth={limbW} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <line x1={footStart(l)[0]} y1={footStart(l)[1]} x2={l[3][0]} y2={l[3][1]} stroke={color} strokeWidth={limbW * 0.8} strokeLinecap="round" />
    </g>
  );
  const arm = (a, color) => (
    <polyline points={pts(a)} stroke={color} strokeWidth={limbW * 0.85} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  );

  const transform = mirror ? `translate(${2 * x0 + w} 0) scale(-1 1)` : undefined;

  return (
    <svg className={`figure ${className}`} viewBox={viewBox.join(" ")} role="img" aria-label="Stretch demonstration">
      {view === "top" ? (
        <rect x={x0 + 6} y={y0 + 6} width={w - 12} height={h - 12} rx={10} fill="var(--mat)" />
      ) : (
        <>
          <rect x={floorX[0]} y={0} width={w} height={h} fill="var(--mat)" />
          <line x1={floorX[0]} y1={0} x2={floorX[1]} y2={0} stroke="var(--floor)" strokeWidth={1.2} />
        </>
      )}
      <g transform={transform}>
        {A.wall != null && <line x1={A.wall} y1={0} x2={A.wall} y2={y0} stroke="var(--prop)" strokeWidth={3} />}
        {A.pole != null && <line x1={A.pole} y1={0} x2={A.pole} y2={y0 + 6} stroke="var(--prop)" strokeWidth={3} strokeLinecap="round" />}

        {arm(j.a2, far)}
        {leg(j.l2, far)}

        {!side && <line x1={j.hipL[0]} y1={j.hipL[1]} x2={j.hipR[0]} y2={j.hipR[1]} stroke="var(--fig)" strokeWidth={7} strokeLinecap="round" />}
        <path d={`M${j.hip[0]},${j.hip[1]} Q${j.ctrl[0]},${j.ctrl[1]} ${j.neck[0]},${j.neck[1]}`} stroke="var(--fig)" strokeWidth={side ? 8 : 6} fill="none" strokeLinecap="round" />
        {!side && <line x1={j.shL[0]} y1={j.shL[1]} x2={j.shR[0]} y2={j.shR[1]} stroke="var(--fig)" strokeWidth={6} strokeLinecap="round" />}
        <circle cx={j.head[0]} cy={j.head[1]} r={LEN.headR} fill="var(--fig)" />

        {leg(j.l1, "var(--fig)")}
        {arm(j.a1, "var(--fig)")}

        {r.strap > 0.5 && (
          <line x1={j.a1[2][0]} y1={j.a1[2][1]} x2={(j.l1[2][0] + j.l1[3][0]) / 2} y2={(j.l1[2][1] + j.l1[3][1]) / 2} stroke="var(--accent)" strokeWidth={1.4} />
        )}
        <circle cx={side ? j.hip[0] : j.hip[0]} cy={j.hip[1]} r={side ? 5.5 : 7.5} fill="var(--accent)" opacity={0.28} />
      </g>
    </svg>
  );
}
