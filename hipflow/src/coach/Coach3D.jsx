import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createStage } from "./stage.js";
import { loadModel, blend } from "./rig.js";
import { prepareMove, buildTimeline, sampleTimeline, sampleLoop, breathing } from "./coach.js";
import Figure from "../Figure.jsx";

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

// The 3D coach. `kind` is prep | switch | work | demo; a new `segKey` restarts it.
export default function Coach3D({ stretch, pose2d, side = 0, kind = "demo", segKey = 0, secs = 10, paused = false }) {
  const wrapRef = useRef(null);
  const live = useRef({});
  const [status, setStatus] = useState(() => (webglOk() ? "loading" : "fallback"));

  // mount: stage, model, render loop
  useEffect(() => {
    if (status === "fallback") return;
    const L = live.current;
    // a fresh canvas per mount: a canvas whose WebGL context was released can't be reused
    const canvas = document.createElement("canvas");
    wrapRef.current.prepend(canvas);
    let stage;
    try {
      stage = createStage(canvas);
    } catch (e) {
      console.warn("3D coach unavailable:", e);
      setStatus("fallback");
      return;
    }
    L.stage = stage;
    let raf = 0, last = performance.now(), disposed = false;
    const fit = () => {
      const el = wrapRef.current;
      if (el) stage.resize(el.clientWidth, el.clientHeight);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrapRef.current);
    fit();
    loadModel().then((model) => {
      if (disposed) return;
      L.model = model;
      stage.setModel(model);
      setStatus("ready");
    }).catch((e) => {
      console.warn("3D coach failed to load:", e);
      if (!disposed) setStatus("fallback");
    });

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!L.model || !L.prep || document.hidden) return;
      if (!L.paused) L.t += dt;
      frame(L, stage);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      stage.renderer.dispose();
      stage.renderer.forceContextLoss?.();
      canvas.remove();
      L.model = L.prep = L.cur = null;
    };
  }, [status === "fallback"]);

  // (re)start the performance when the segment changes
  useEffect(() => {
    const L = live.current;
    if (status !== "ready" || !L.model) return;
    const prep = prepareMove(L.stage, L.model, stretch, side);
    if (!prep) return;
    const other = side === 1 ? prepareMove(L.stage, L.model, stretch, 0) : null;
    const from = L.cur && L.prep ? L.cur : null;
    L.prep = prep;
    L.kind = kind;
    L.t = 0;
    L.from = from;
    L.tl = kind === "work" ? null : buildTimeline(kind, prep, from, secs, other);
    setProps(L, prep);
    L.camTarget = L.stage.frame(prep.box, prep.az, prep.el);
    if (!from) L.camNow = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, stretch, side, kind, segKey]);

  useEffect(() => {
    live.current.paused = paused;
  }, [paused]);

  if (status === "fallback") return pose2d ? <Figure pose={pose2d} mirror={side === 1} playing={!paused} /> : null;
  return (
    <div ref={wrapRef} className="coach3d">
      {status === "loading" && <div className="coach-loading">Loading coach…</div>}
    </div>
  );
}

function frame(L, stage) {
  const { prep } = L;
  let pose, extra;
  if (L.kind === "work") {
    const target = prep.loop ? sampleLoop(prep, L.t) : prep.hold;
    pose = L.from && L.t < 0.9 ? blend(L.from, target, L.t / 0.9) : target;
    if (!prep.loop) extra = breathing(pose, L.t);
  } else {
    if (L.kind === "demo" && L.t > L.tl.end + 1) {
      L.from = L.cur;
      L.tl = buildTimeline("demo", prep, L.cur, 0);
      L.t = 0;
    }
    pose = sampleTimeline(L.tl, L.t);
    const settled = L.t > L.tl.end;
    if (settled && prep.loop && L.kind !== "demo") pose = sampleLoop(prep, L.t - L.tl.end);
    else if (settled) extra = breathing(pose, L.t);
  }
  L.cur = pose;
  stage.place(pose, extra);
  updateStrap(L, stage);
  // camera eases toward this stretch's framing
  const tgt = L.camTarget;
  if (!L.camNow) L.camNow = { pos: tgt.pos.clone(), target: tgt.target.clone() };
  L.camNow.pos.lerp(tgt.pos, 0.06);
  L.camNow.target.lerp(tgt.target, 0.06);
  stage.setCamera(L.camNow);
  stage.render();
}

const PROP_MAT = { wall: 0xf3efe8, pole: 0x8c8f96, block: 0x9fc3e0, strap: 0xe0892c };
function setProps(L, prep) {
  const g = L.stage.props;
  while (g.children.length) {
    const c = g.children.pop();
    c.geometry?.dispose();
  }
  L.strap = null;
  const p = prep.props;
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  if (p.wall != null) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.06), mat(PROP_MAT.wall));
    w.position.set(prep.box.getCenter(new THREE.Vector3()).x, 0.8, p.wall - 0.03);
    w.receiveShadow = true;
    g.add(w);
  }
  if (p.pole) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.9, 16), mat(PROP_MAT.pole));
    c.position.set(p.pole.x, 0.95, p.pole.z);
    c.castShadow = true;
    g.add(c);
  }
  for (const b of p.blocks || []) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, b.h, 0.22), mat(PROP_MAT.block));
    m.position.set(b.x, b.h / 2, b.z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  if (p.strap) {
    L.strap = [0, 1].map(() => {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 8), mat(PROP_MAT.strap));
      g.add(s);
      return s;
    });
  }
}

const A = new THREE.Vector3(), B = new THREE.Vector3(), F = new THREE.Vector3(), T = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
function updateStrap(L, stage) {
  if (!L.strap) return;
  const bones = L.model.bones;
  const S = L.prep.side === 1 ? "Left" : "Right";
  L.model.root.updateMatrixWorld(true);
  bones[S + "Foot"].getWorldPosition(F);
  bones[S + "ToeBase"].getWorldPosition(T);
  const sole = F.clone().lerp(T, 0.55);
  const show = sole.y > 0.45;
  ["LeftHand", "RightHand"].forEach((h, i) => {
    const s = L.strap[i];
    s.visible = show;
    if (!show) return;
    bones[h].getWorldPosition(A);
    B.copy(sole);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    s.position.copy(mid);
    s.scale.set(1, A.distanceTo(B), 1);
    s.quaternion.setFromUnitVectors(up, B.clone().sub(A).normalize());
  });
}
