import Thumb3D from "../coach/Thumb3D.jsx";
import { Icon } from "../ui.jsx";
import { AREAS } from "../data/stretches.js";
import { fmtTime } from "../data/program.js";
import { kitFor } from "../data/sessions.js";
import { signature } from "../lib.js";

// Full-screen preview of a session before starting it.
export default function Overview({ session, eyebrow, blurb, done, startLabel = "Start", onStart, onClose, openStretch }) {
  const kit = kitFor(session.items);
  return (
    <div className="full" role="dialog" aria-label={session.dayType.name}>
      <div className="ov-hero">
        <Thumb3D id={session.hero || signature(session)} size="hero" />
        <div className="shade" />
        <button className="icon-btn glass" onClick={onClose} aria-label="Back"><Icon name="back" /></button>
      </div>
      <div className="ov-body">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{session.dayType.name}</h1>
        </div>
        <div className="meta-row">
          <span className="pill"><Icon name="clock" size={14} /> {Math.round(session.totalSecs / 60)} min</span>
          <span className="pill">{session.items.length} stretches</span>
          <span className="pill">Beginner friendly</span>
          {done && <span className="pill" style={{ color: "var(--accent)" }}><Icon name="check" size={14} /> Done</span>}
        </div>
        {blurb && <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>{blurb}</p>}
        <div>
          <div className="section-head" style={{ margin: "0 2px 10px" }}><h3>You'll need</h3></div>
          <div className="kit">{kit.map((k) => <span key={k.label} className="pill">{k.emoji} {k.label}</span>)}</div>
        </div>
        <div>
          <div className="section-head" style={{ margin: "0 2px 8px" }}><h3>Stretches</h3><span>{fmtTime(session.totalSecs)}</span></div>
          <div className="card moves">
            {session.items.map((it, n) => (
              <button key={n} className="move-row tap" onClick={() => openStretch(it.stretch.id)}>
                <Thumb3D id={it.stretch.id} />
                <div className="mr-main">
                  <b>{it.stretch.name}</b>
                  <span>{it.note ? (it.note.startsWith("Contract") ? "Contract-relax" : it.note) : AREAS[it.stretch.area].label}</span>
                </div>
                <span className="t">{it.sides === 2 ? `${Math.round(it.secs)}s × 2` : fmtTime(it.secs)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="sticky-cta">
        <button className="btn primary big" onClick={onStart}><Icon name="play" size={18} /> {startLabel}</button>
      </div>
    </div>
  );
}
