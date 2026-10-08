// Three.js studio: floor, yoga mat, lights, soft shadows, props and a camera
// that frames whatever the coach is doing.
import * as THREE from "three";
import { applyPose, measure } from "./rig.js";

const BG = 0xe9e4dc;

export function createStage(canvas, { shadows = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 4.5, 9);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9ab98, 1.6));
  const key = new THREE.DirectionalLight(0xfff4e8, 2.4);
  key.position.set(-1.6, 3.2, 2.2);
  key.castShadow = shadows;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -1.6; key.shadow.camera.right = 1.6;
  key.shadow.camera.top = 1.6; key.shadow.camera.bottom = -1.6;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 8;
  key.shadow.radius = 4;
  key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.9);
  rim.position.set(2, 1.5, -2.5);
  scene.add(rim);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0xd6c8b4, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const mat = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.006, 1.8), new THREE.MeshStandardMaterial({ color: 0x3f9e93, roughness: 0.8 }));
  mat.position.y = 0.003;
  mat.receiveShadow = true;
  scene.add(mat);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 30);
  const props = new THREE.Group();
  scene.add(props);

  let model = null;
  const setModel = (m) => {
    model = m;
    scene.add(m.root);
  };

  const resize = (w, h) => {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  // Place the posed body: o (cm) moves the pelvis, ground lifts it onto the floor.
  const place = (pose, extra) => {
    applyPose(model, pose, extra);
    model.root.position.set(pose.o.x / 100, pose.ground ?? 0, pose.o.z / 100);
  };

  // Measure a resolved pose once (grounding + bounds), cached on the pose.
  const ground = (pose) => {
    if (pose.ground != null) return pose;
    applyPose(model, pose);
    model.root.position.set(pose.o.x / 100, 0, pose.o.z / 100);
    const box = measure(model);
    pose.ground = -box.min.y;
    box.min.y += pose.ground; box.max.y += pose.ground;
    pose.box = box;
    return pose;
  };

  // Frame a set of bounds from a viewing direction.
  const frame = (box, az = -60, el = 12) => {
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    // horizontal extent as seen from this direction
    const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, 0, z));
    const proj = corners.map((p) => p.clone().sub(c).dot(right));
    const wide = Math.max(...proj) - Math.min(...proj);
    const tall = size.y + 0.1;
    const dist = Math.max(tall / 2 / Math.tan(vfov / 2), (wide + 0.25) / 2 / Math.tan(hfov / 2)) * 1.12 + 0.2;
    const target = c.clone();
    target.y = Math.max(c.y, 0.25);
    return { pos: target.clone().add(dir.multiplyScalar(dist)), target };
  };

  const setCamera = ({ pos, target }) => {
    camera.position.copy(pos);
    camera.lookAt(target);
  };

  const setMat = (box) => {
    const c = box.getCenter(new THREE.Vector3());
    const sx = box.max.x - box.min.x, sz = box.max.z - box.min.z;
    mat.rotation.y = sx > sz * 1.25 ? Math.PI / 2 : 0;
    mat.position.x = c.x; mat.position.z = c.z;
  };

  return { renderer, scene, camera, props, floor, mat, setModel, resize, place, ground, frame, setCamera, setMat, render: () => renderer.render(scene, camera) };
}
