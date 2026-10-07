import Figure from "./Figure.jsx";
import { POSES } from "./poses.js";

// Dev-only contact sheet of every demonstration: /?sheet
export default function PoseSheet() {
  const only = new URLSearchParams(location.search).get("only");
  const ids = only ? only.split(",") : Object.keys(POSES);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${only ? 2 : 6}, 1fr)`, gap: 8, padding: 8 }}>
      {ids.flatMap((id) =>
        (only ? [0, 1] : [0, 0.5, 1]).map((k) => (
          <div key={id + k} className="card" style={{ padding: 4 }}>
            <div style={{ fontSize: 11 }}>{id} {k}</div>
            <Figure pose={id} fixedK={k} />
          </div>
        ))
      )}
    </div>
  );
}

// Dev-only app icon source: /?sheet=icon (screenshotted into public/*.png)
export function IconArt() {
  return (
    <div style={{ width: 512, height: 512, display: "grid", placeItems: "center", background: "linear-gradient(145deg, #0f2e2a, #0e1014 70%)" }}>
      <div style={{ width: 420, "--fig": "#5eead4", "--fig-far": "#2b7d72", "--mat": "transparent", "--floor": "transparent", "--accent": "transparent" }}>
        <Figure pose="low_lunge" fixedK={1} />
      </div>
    </div>
  );
}
