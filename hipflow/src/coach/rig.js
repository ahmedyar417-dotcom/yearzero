// Poses a rigged 3D human (Rocketbox/Biped or Mixamo skeleton) from a compact description.
//
// Coordinates: the character faces +Z, +X is her LEFT, +Y is up. Units are cm.
// A pose spec:
//   o:      [x, y, z]  where the pelvis sits in the pose frame (default 0)
//   pelvis: { up, front }   direction the spine leaves the pelvis / belly faces
//   chest:  { up, front }   upper back (defaults to pelvis)
//   head:   { up, front }   (defaults to chest)
//   lArm / rArm: { up: dir, fore: dir, elbow?: dir }  or { ik: [x,y,z] wrist, pole: dir }
//                (ikRel instead of ik: the target moves with the pelvis)
//                + optional hand: { dir, palm }
//   lLeg / rLeg: { thigh: dir, shin: dir, knee?: dir, foot?: dir }  or { ik: [x,y,z] ankle, pole: dir, foot? }
// Directions are [x, y, z] arrays (normalised for you). IK targets live in the
// same frame as `o`, so a hand or foot stays planted while the pelvis moves.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

const TORSO = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"];
const SIDES = { l: "Left", r: "Right" };
const CHILD = {
  Hips: "Spine", Spine: "Spine1", Spine1: "Spine2", Spine2: "Neck", Neck: "Head", Head: "HeadTop_End",
  LeftArm: "LeftForeArm", LeftForeArm: "LeftHand", LeftHand: "LeftHandMiddle1",
  RightArm: "RightForeArm", RightForeArm: "RightHand", RightHand: "RightHandMiddle1",
  LeftUpLeg: "LeftLeg", LeftLeg: "LeftFoot", LeftFoot: "LeftToeBase",
  RightUpLeg: "RightLeg", RightLeg: "RightFoot", RightFoot: "RightToeBase",
};

function ortho(p, d) {
  const v = p.clone().sub(d.clone().multiplyScalar(p.dot(d)));
  return v.lengthSq() < 1e-6 ? null : v.normalize();
}
function basis(d, p) {
  const t = new THREE.Vector3().crossVectors(d, p);
  return new THREE.Matrix4().makeBasis(d, p, t);
}
// Rotation taking (d0, p0) onto (d1, p1).
function mapFrame(d0, p0, d1, p1) {
  const m0 = basis(d0, ortho(p0, d0));
  const m1 = basis(d1, ortho(p1, d1) || anyPerp(d1));
  const r = m1.multiply(m0.transpose());
  return new THREE.Quaternion().setFromRotationMatrix(r);
}
function anyPerp(d) {
  return ortho(Math.abs(d.y) < 0.9 ? Y : Z, d);
}

// The coaches: realistic Rocketbox avatars (MIT) and the original stylised one.
export const COACHES = {
  female: { url: "/models/coach-female.glb", label: "Female coach" },
  male: { url: "/models/coach-male.glb", label: "Male coach" },
};
export const MODEL_URL = COACHES.female.url;

// Rocketbox (3ds Max Biped) bone names → the canonical names used here.
const BIPED = {
  Hips: "Bip01 Pelvis", Spine: "Bip01 Spine", Spine1: "Bip01 Spine1", Spine2: "Bip01 Spine2", Neck: "Bip01 Neck", Head: "Bip01 Head",
};
for (const [s, b] of [["Left", "L"], ["Right", "R"]]) {
  Object.assign(BIPED, {
    [s + "Shoulder"]: `Bip01 ${b} Clavicle`, [s + "Arm"]: `Bip01 ${b} UpperArm`, [s + "ForeArm"]: `Bip01 ${b} Forearm`,
    [s + "Hand"]: `Bip01 ${b} Hand`, [s + "HandMiddle1"]: `Bip01 ${b} Finger2`,
    [s + "UpLeg"]: `Bip01 ${b} Thigh`, [s + "Leg"]: `Bip01 ${b} Calf`, [s + "Foot"]: `Bip01 ${b} Foot`, [s + "ToeBase"]: `Bip01 ${b} Toe0`,
  });
}
const FROM_BIPED = Object.fromEntries(Object.entries(BIPED).map(([k, v]) => [v, k]));
// (three.js turns spaces in node names into underscores)
const keyFor = (name) => FROM_BIPED[name.replace(/_/g, " ")] || name.replace("mixamorig", "");

const gltfs = {};
// Each stage gets its own copy of the character (a three.js object can only
// live in one scene), cloned from the untouched original in its rest pose.
export function loadModel(url = MODEL_URL) {
  if (!gltfs[url]) gltfs[url] = new GLTFLoader().loadAsync(url);
  return gltfs[url].then((gltf) => {
    const body = cloneSkinned(gltf.scene);
    const root = new THREE.Group();
    root.add(body);
    faceForward(root);
    return prepare(root, gltf.animations);
  });
}
export const preloadModel = (url = MODEL_URL) => loadModel(url).catch(() => null);

// Turn the character so she faces +Z (her left on +X), whatever the source file did.
function faceForward(root) {
  root.updateMatrixWorld(true);
  const find = (n) => root.getObjectByName(n);
  const lArm = find("Bip01_L_UpperArm") || find("mixamorigLeftArm");
  const rArm = find("Bip01_R_UpperArm") || find("mixamorigRightArm");
  if (!lArm || !rArm) return;
  const l = lArm.getWorldPosition(new THREE.Vector3()), r = rArm.getWorldPosition(new THREE.Vector3());
  const left = l.sub(r).setY(0).normalize(); // should point to +X
  root.rotation.y = -Math.atan2(-left.z, left.x);
  root.updateMatrixWorld(true);
}

function prepare(root, animations) {
  root.updateMatrixWorld(true);
  const bones = {};
  const keyOf = new Map();
  const meshes = [];
  root.traverse((o) => {
    if (o.isBone) {
      const k = keyFor(o.name);
      bones[k] = o;
      keyOf.set(o, k);
    }
    if (o.isSkinnedMesh) meshes.push(o);
  });
  const rest = {};
  for (const [name, b] of Object.entries(bones)) {
    const p = new THREE.Vector3(); b.getWorldPosition(p);
    const q = new THREE.Quaternion(); b.getWorldQuaternion(q);
    const pq = new THREE.Quaternion(); b.parent.getWorldQuaternion(pq);
    rest[name] = { pos: p, worldQ: q, localQ: b.quaternion.clone(), parentQ: pq };
  }
  const dirOf = (n) => rest[CHILD[n]].pos.clone().sub(rest[n].pos).normalize();
  const lenOf = (a, b) => rest[b].pos.distanceTo(rest[a].pos) * 100;
  // rest frames (direction along the bone, pole as described in pose specs)
  const frames = {};
  for (const n of TORSO) frames[n] = { d: Y.clone(), p: Z.clone() };
  for (const s of ["Left", "Right"]) {
    frames[s + "Arm"] = { d: dirOf(s + "Arm"), p: Z.clone().negate() };
    frames[s + "ForeArm"] = { d: dirOf(s + "ForeArm"), p: Z.clone().negate() };
    frames[s + "Hand"] = { d: dirOf(s + "Hand"), p: Y.clone().negate() };
    frames[s + "UpLeg"] = { d: dirOf(s + "UpLeg"), p: Z.clone() };
    frames[s + "Leg"] = { d: dirOf(s + "Leg"), p: Z.clone() };
    const fd = dirOf(s + "Foot");
    const h = new THREE.Vector3().crossVectors(dirOf(s + "Leg"), Z).normalize();
    frames[s + "Foot"] = { d: fd, p: new THREE.Vector3().crossVectors(h, fd).normalize() };
  }
  const hipsPos = rest.Hips.pos;
  const rel = (n) => rest[n].pos.clone().sub(hipsPos).multiplyScalar(100);
  const dims = {
    thigh: lenOf("LeftUpLeg", "LeftLeg"), shin: lenOf("LeftLeg", "LeftFoot"),
    upper: lenOf("LeftArm", "LeftForeArm"), fore: lenOf("LeftForeArm", "LeftHand"),
    hipJoint: { l: rel("LeftUpLeg"), r: rel("RightUpLeg") },
  };
  // order bones parent-first for applying world rotations
  const order = [];
  root.traverse((o) => o.isBone && order.push(keyOf.get(o)));
  for (const m of meshes) {
    m.frustumCulled = false;
    m.castShadow = true;
  }
  return { root, bones, keyOf, mesh: meshes[0], meshes, rest, frames, dims, order, animations };
}

// ── Pose resolution ──────────────────────────────────────────────────────
// Returns { q: {bone: worldQuaternion}, o: Vector3(cm) } — interpolatable.
export function resolvePose(model, spec) {
  const { frames, rest, dims } = model;
  const q = {};
  const o = V(spec.o || [0, 0, 0]);
  const frameQ = (bone, d, p) => mapFrame(frames[bone].d, frames[bone].p, d.clone().normalize(), p.clone().normalize());

  const pel = { up: V(spec.pelvis?.up || [0, 1, 0]).normalize(), front: V(spec.pelvis?.front || [0, 0, 1]).normalize() };
  const che = spec.chest ? { up: V(spec.chest.up).normalize(), front: V(spec.chest.front).normalize() } : pel;
  const hea = spec.head ? { up: V(spec.head.up).normalize(), front: V(spec.head.front).normalize() } : che;
  const Rp = frameQ("Hips", pel.up, pel.front);
  const Rc = frameQ("Spine2", che.up, che.front);
  const Rh = frameQ("Head", hea.up, hea.front);
  const torsoR = { Hips: Rp, Spine: Rp.clone().slerp(Rc, 0.35), Spine1: Rp.clone().slerp(Rc, 0.7), Spine2: Rc, Neck: Rc.clone().slerp(Rh, 0.5), Head: Rh };
  for (const n of TORSO) q[n] = torsoR[n].clone().multiply(rest[n].worldQ);

  // joint positions (cm, relative to pelvis bone) after torso rotation
  const jointPos = (bone, viaBone) => rest[bone].pos.clone().sub(rest[viaBone].pos).multiplyScalar(100).applyQuaternion(torsoR[viaBone]);
  const spine2Pos = (() => {
    // walk Hips→Spine→Spine1→Spine2 with their rotations
    let p = new THREE.Vector3();
    const chain = ["Hips", "Spine", "Spine1"];
    const next = { Hips: "Spine", Spine: "Spine1", Spine1: "Spine2" };
    for (const n of chain) p.add(rest[next[n]].pos.clone().sub(rest[n].pos).multiplyScalar(100).applyQuaternion(torsoR[n]));
    return p;
  })();

  for (const s of ["l", "r"]) {
    const S = SIDES[s];
    // ── arm
    const a = spec[s + "Arm"] || { up: [s === "l" ? 0.15 : -0.15, -1, 0], fore: [s === "l" ? 0.12 : -0.12, -1, 0.15] };
    const shoulder = spine2Pos.clone().add(jointPos(S + "Arm", "Spine2")).add(o);
    let up, fore, elbow;
    if (a.ik || a.ikRel) {
      const target = a.ik ? V(a.ik) : V(a.ikRel).add(o); // ikRel moves with the pelvis
      [up, fore] = twoBone(shoulder, target, dims.upper, dims.fore, V(a.pole || [0, 0, -1]));
    } else {
      up = V(a.up).normalize(); fore = V(a.fore).normalize();
    }
    elbow = bendDir(up, fore, a.elbow ? V(a.elbow) : fallbackElbow(up, che));
    q[S + "Arm"] = frameQ(S + "Arm", up, elbow).multiply(rest[S + "Arm"].worldQ);
    q[S + "ForeArm"] = frameQ(S + "ForeArm", fore, elbow).multiply(rest[S + "ForeArm"].worldQ);
    if (a.hand) {
      q[S + "Hand"] = frameQ(S + "Hand", V(a.hand.dir), V(a.hand.palm)).multiply(rest[S + "Hand"].worldQ);
    }
    // ── leg
    const l = spec[s + "Leg"] || { thigh: [s === "l" ? 0.06 : -0.06, -1, 0], shin: [s === "l" ? 0.02 : -0.02, -1, 0] };
    const hip = dims.hipJoint[s].clone().applyQuaternion(Rp).add(o);
    let th, sh;
    if (l.ik) {
      [th, sh] = twoBone(hip, V(l.ik), dims.thigh, dims.shin, V(l.pole || [0, 0, 1]));
    } else {
      th = V(l.thigh).normalize(); sh = V(l.shin).normalize();
    }
    const knee = bendDir(th, sh, l.knee ? V(l.knee) : fallbackKnee(th, pel));
    q[S + "UpLeg"] = frameQ(S + "UpLeg", th, knee).multiply(rest[S + "UpLeg"].worldQ);
    q[S + "Leg"] = frameQ(S + "Leg", sh, knee).multiply(rest[S + "Leg"].worldQ);
    const hinge = new THREE.Vector3().crossVectors(sh, ortho(knee, sh) || anyPerp(sh)).normalize();
    let fd = l.foot ? V(l.foot).normalize() : new THREE.Vector3().crossVectors(hinge, sh).normalize();
    const ftop = ortho(new THREE.Vector3().crossVectors(hinge, fd), fd) || anyPerp(fd);
    q[S + "Foot"] = frameQ(S + "Foot", fd, ftop).multiply(rest[S + "Foot"].worldQ);
  }
  return { q, o };
}

// Direction the joint juts toward (kneecap / point of elbow): the outer apex
// when bent, blending to a fallback as the limb straightens.
function bendDir(a, b, fallback) {
  const ang = a.angleTo(b);
  const apex = a.clone().sub(b);
  const fb = ortho(fallback, a) || anyPerp(a);
  if (apex.lengthSq() < 1e-6) return fb;
  apex.normalize();
  const w = THREE.MathUtils.smoothstep(ang, 0.08, 0.35);
  // keep the fallback on the same side as the apex to avoid flips
  if (fb.dot(apex) < 0 && w < 1) fb.negate();
  return fb.multiplyScalar(1 - w).add(apex.multiplyScalar(w)).normalize();
}
function fallbackKnee(th, pel) {
  // straight leg: kneecap faces where the belly faces, or up if the leg points that way
  return ortho(pel.front, th) || ortho(pel.up.clone().negate(), th) || anyPerp(th);
}
function fallbackElbow(up, che) {
  if (Math.abs(up.dot(che.front)) > 0.75) return ortho(che.up, up) || anyPerp(up);
  return ortho(che.front.clone().negate(), up) || anyPerp(up);
}

function twoBone(root, target, L1, L2, pole) {
  const dv = target.clone().sub(root);
  let d = dv.length();
  const u = dv.normalize();
  d = THREE.MathUtils.clamp(d, Math.abs(L1 - L2) + 0.5, L1 + L2 - 0.05);
  const v = ortho(pole.clone().normalize(), u) || anyPerp(u);
  const cosA = THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const A = Math.acos(cosA);
  const upper = u.clone().multiplyScalar(Math.cos(A)).add(v.clone().multiplyScalar(Math.sin(A))).normalize();
  const joint = upper.clone().multiplyScalar(L1);
  const lower = u.clone().multiplyScalar(d).sub(joint).normalize();
  return [upper, lower];
}

// ── Applying / blending ──────────────────────────────────────────────────
export function blend(a, b, t) {
  const q = {};
  for (const k of Object.keys(a.q)) q[k] = a.q[k].clone().slerp(b.q[k] || a.q[k], t);
  return { q, o: a.o.clone().lerp(b.o, t), ground: a.ground != null && b.ground != null ? a.ground + (b.ground - a.ground) * t : undefined };
}

const tmpQ = new THREE.Quaternion();
export function applyPose(model, pose, extra) {
  const { bones, rest, order, keyOf } = model;
  const world = {};
  for (const name of order) {
    const b = bones[name];
    const parentName = b.parent?.isBone ? keyOf.get(b.parent) : null;
    const parentW = parentName ? world[parentName] : rest[name].parentQ;
    let w = pose.q[name];
    if (!w) {
      // not posed: keep its rest offset from the parent
      w = parentW.clone().multiply(rest[name].localQ);
    } else if (extra?.[name]) {
      w = extra[name].clone().multiply(w);
    }
    world[name] = w;
    b.quaternion.copy(tmpQ.copy(parentW).invert().multiply(w));
  }
}

export { mirror as mirrorSpec } from "./dirs.js";

// Lowest point and bounds of the actual skinned mesh for the current pose (cm, group-local).
const vtx = new THREE.Vector3();
export function measure(model, step = 3) {
  const { meshes, root } = model;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const mesh of meshes) {
    mesh.skeleton.update();
    const n = mesh.geometry.attributes.position.count;
    for (let i = 0; i < n; i += step) {
      mesh.getVertexPosition(i, vtx);
      vtx.applyMatrix4(mesh.matrixWorld);
      box.expandByPoint(vtx);
    }
  }
  return box;
}
