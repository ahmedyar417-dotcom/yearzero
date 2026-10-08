import { useMemo, useState } from "react";
import { Icon } from "../ui.jsx";

const FEELS = [["😣", "Too intense"], ["😮‍💨", "Challenging"], ["🙂", "Just right"], ["😌", "Easy"]];
const COLORS = ["#45e0c0", "#5aa9ff", "#a993ff", "#ff86b8", "#ffc46b"];

export default function Complete({ title, subtitle, minutes, stretches, streak, nextUp, onFeel, onClose }) {
  const [feel, setFeel] = useState(null);
  const bits = useMemo(() => Array.from({ length: 46 }, (_, n) => ({
    left: Math.random() * 100, delay: Math.random() * 0.8, dur: 2.2 + Math.random() * 1.6, color: COLORS[n % COLORS.length], rot: Math.random() * 360,
  })), []);
  return (
    <div className="done-screen" role="dialog" aria-label="Session complete">
      <div className="confetti" aria-hidden="true">
        {bits.map((b, n) => <i key={n} style={{ left: `${b.left}%`, background: b.color, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, transform: `rotate(${b.rot}deg)` }} />)}
      </div>
      <div className="badge"><Icon name="check" size={52} /></div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      <div className="done-stats">
        <div><b>{minutes}</b><span>{minutes === 1 ? "minute" : "minutes"}</span></div>
        <div><b>{stretches}</b><span>stretches</span></div>
        <div><b>🔥 {streak}</b><span>day streak</span></div>
      </div>
      <div className="feel">
        <p>How did that feel?</p>
        <div className="feel-row">
          {FEELS.map(([emoji, label], n) => (
            <button key={label} className={feel === n + 1 ? "on" : ""} onClick={() => { setFeel(n + 1); onFeel(n + 1); }}>
              <i>{emoji}</i>{label}
            </button>
          ))}
        </div>
      </div>
      {nextUp && <p className="muted small">{nextUp}</p>}
      <button className="btn primary big" onClick={onClose}>Done</button>
    </div>
  );
}
