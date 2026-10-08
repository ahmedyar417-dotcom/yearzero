// Still images of each stretch's finished position, rendered once with a
// single shared WebGL canvas and cached as data URLs.
import { createStage, currentTheme } from "./stage.js";
import { loadModel } from "./rig.js";
import { prepareMove } from "./coach.js";

const cache = new Map();
const ctxs = {};
let queue = Promise.resolve();

function setup(theme) {
  if (!ctxs[theme]) {
    ctxs[theme] = (async () => {
      const canvas = document.createElement("canvas");
      const stage = createStage(canvas, { shadows: true, theme });
      const model = await loadModel();
      stage.setModel(model);
      return { stage, model, canvas };
    })();
  }
  return ctxs[theme];
}

// size: "thumb" (360×250) or "hero" (800×600)
export function snapshot(id, size = "thumb") {
  const theme = currentTheme();
  const key = `${id}:${size}:${theme}`;
  if (cache.has(key)) return cache.get(key);
  const [w, h] = size === "hero" ? [800, 600] : [360, 250];
  const p = (queue = queue.then(async () => {
    const { stage, model, canvas } = await setup(theme);
    stage.resize(w, h);
    const prep = prepareMove(stage, model, id, 0);
    if (!prep) return null;
    const pose = prep.loop ? prep.loop[Math.min(1, prep.loop.length - 1)] : prep.hold;
    stage.setMat(prep.box);
    stage.setCamera(stage.frame(pose.box, prep.az, prep.el, size === "hero" ? 0.12 : 0));
    stage.place(pose);
    stage.props.clear();
    stage.render();
    await new Promise((r) => setTimeout(r, 0)); // let the UI breathe between renders
    return canvas.toDataURL("image/jpeg", 0.82);
  }).catch(() => null));
  cache.set(key, p);
  return p;
}
