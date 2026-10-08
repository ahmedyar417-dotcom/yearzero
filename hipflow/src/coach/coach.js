// Turns a stretch's choreography into a timed performance:
//   prep   → move from wherever she is into the start position, then step by step into the stretch
//   switch → come out of side one and go into side two
//   work   → stay in the stretch (breathing) for the whole hold, or loop a moving exercise
//   demo   → library preview: get in, hold, reset, repeat
import * as THREE from "three";
import { MOVES } from "./moves.js";
import { mirror } from "./dirs.js";
import { resolvePose, blend } from "./rig.js";

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

// Resolve + ground every keyframe of a stretch for one side (cached per stage).
export function prepareMove(stage, model, id, side) {
  const key = `${model.root.uuid}:${id}:${side}`;
  stage.cache = stage.cache || {};
  if (stage.cache[key]) return stage.cache[key];
  const m = MOVES[id];
  if (!m) return null;
  const sided = (spec) => (side === 1 ? mirror(spec) : spec);
  const res = (spec) => stage.ground(resolvePose(model, sided(spec)));
  const entry = m.entry.map(res);
  const loop = m.loop ? m.loop.map(res) : null;
  const hold = loop ? loop[0] : entry[entry.length - 1];
  const box = new THREE.Box3();
  for (const p of [...entry, ...(loop || [])]) box.union(p.box);
  const az = side === 1 ? -m.cam.az : m.cam.az;
  const props = propsFor(stage, model, m, loop ? loop[loop.length > 1 ? 1 : 0] : hold, side);
  const prepared = { id, side, m, entry, loop, hold, box, az, el: m.cam.el, props, beat: m.beat || 2.5 };
  stage.cache[key] = prepared;
  return prepared;
}

// Where props go, measured from the finished pose.
function propsFor(stage, model, m, pose, side) {
  const out = {};
  stage.place(pose);
  model.root.updateMatrixWorld(true);
  const wp = (name) => model.bones[name].getWorldPosition(new THREE.Vector3());
  const S = side === 1 ? "Left" : "Right";
  if (m.wall) out.wall = wp(S + "Leg").z - 0.07; // behind the back knee (couch stretch)
  if (m.pole) {
    const h = wp("LeftHand").add(wp("RightHand")).multiplyScalar(0.5);
    out.pole = new THREE.Vector3(h.x, 0, h.z + 0.04);
  }
  if (m.blocks) {
    out.blocks = ["LeftHand", "RightHand"].map((n) => wp(n)).filter((p) => p.y > 0.08).map((p) => ({ x: p.x, z: p.z + 0.05, h: Math.max(0.06, p.y - 0.035) }));
  }
  if (m.strap) out.strap = true;
  return out;
}

// A timeline is a list of {pose, t} stops; between stops the body eases.
export function buildTimeline(kind, prep, from, secs, other) {
  const stops = [];
  const add = (pose, dt) => stops.push({ pose, t: (stops.length ? stops[stops.length - 1].t : 0) + dt });
  if (kind === "prep" || kind === "demo") {
    const n = prep.entry.length;
    const total = kind === "demo" ? n * 2.2 : Math.max(2, secs - 1.2);
    const step = Math.min(2.6, total / n);
    add(from || prep.entry[0], 0);
    prep.entry.forEach((p, i) => add(p, i === 0 && !from ? 0 : step));
    if (prep.loop) add(prep.loop[0], step * 0.6);
    if (kind === "demo") {
      if (prep.loop) {
        for (let c = 0; c < 2; c++) prep.loop.forEach((p, i) => add(p, i === 0 && c === 0 ? 0.3 : prep.beat));
        add(prep.loop[0], prep.beat);
      } else add(prep.hold, 3.5);
    }
  } else if (kind === "switch") {
    // out of side one (reverse its entry), into side two
    const back = other.entry.slice(0, -1).reverse();
    const fwd = prep.entry;
    const n = back.length + fwd.length;
    const step = Math.min(2.2, Math.max(0.9, (secs - 0.6) / n));
    add(from || other.hold, 0);
    back.forEach((p) => add(p, step));
    fwd.slice(1).forEach((p) => add(p, step));
    if (prep.loop) add(prep.loop[0], step * 0.6);
  }
  return { kind, stops, end: stops.length ? stops[stops.length - 1].t : 0 };
}

export function sampleTimeline(tl, t) {
  const s = tl.stops;
  if (!s.length) return null;
  if (t <= s[0].t) return s[0].pose;
  for (let i = 1; i < s.length; i++) {
    if (t <= s[i].t) {
      const span = s[i].t - s[i - 1].t || 1;
      return blend(s[i - 1].pose, s[i].pose, ease((t - s[i - 1].t) / span));
    }
  }
  return s[s.length - 1].pose;
}

// Moving exercises cycle through their loop keyframes.
export function sampleLoop(prep, t) {
  const L = prep.loop;
  const beat = prep.beat;
  const k = (t / beat) % L.length;
  const i = Math.floor(k);
  return blend(L[i], L[(i + 1) % L.length], ease(k - i));
}

// Gentle breathing: rotate the chest a couple of degrees around her side-to-side axis.
const axis = new THREE.Vector3();
export function breathing(pose, t) {
  const a = Math.sin((t / 5.5) * Math.PI * 2) * THREE.MathUtils.degToRad(2.2);
  const out = {};
  for (const [bone, k] of [["Spine1", 0.5], ["Spine2", 1]]) {
    if (!pose.q[bone]) continue;
    axis.set(1, 0, 0).applyQuaternion(pose.q[bone]);
    out[bone] = new THREE.Quaternion().setFromAxisAngle(axis, -a * k);
  }
  return out;
}
