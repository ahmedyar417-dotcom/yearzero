// Still images of each stretch's finished position, rendered once with a
// single shared WebGL canvas and cached as data URLs.
import { createStage } from "./stage.js";
import { loadModel } from "./rig.js";
import { prepareMove } from "./coach.js";

const cache = new Map();
let ctx = null;
let queue = Promise.resolve();

function setup() {
  if (!ctx) {
    ctx = (async () => {
      const canvas = document.createElement("canvas");
      const stage = createStage(canvas, { shadows: true });
      stage.resize(360, 250);
      const model = await loadModel();
      stage.setModel(model);
      return { stage, model, canvas };
    })();
  }
  return ctx;
}

export function snapshot(id) {
  if (cache.has(id)) return cache.get(id);
  const p = (queue = queue.then(async () => {
    const { stage, model, canvas } = await setup();
    const prep = prepareMove(stage, model, id, 0);
    if (!prep) return null;
    const pose = prep.loop ? prep.loop[Math.min(1, prep.loop.length - 1)] : prep.hold;
    stage.setMat(prep.box);
    stage.setCamera(stage.frame(pose.box, prep.az, prep.el));
    stage.place(pose);
    stage.props.clear();
    stage.render();
    await new Promise((r) => setTimeout(r, 0)); // let the UI breathe between renders
    return canvas.toDataURL("image/jpeg", 0.82);
  }).catch(() => null));
  cache.set(id, p);
  return p;
}
