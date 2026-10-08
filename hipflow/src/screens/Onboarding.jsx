import { useState } from "react";
import Thumb3D from "../coach/Thumb3D.jsx";
import { Icon } from "../ui.jsx";
import { PHASES, addDays, fmtDate, ymd } from "../data/program.js";
import { downloadReminder } from "../reminder.js";

const GOALS = [
  ["loosen", "🦵", "Loosen tight hips", "Feel less stiff day to day"],
  ["squat", "🪑", "Sit and squat comfortably", "Cross-legged, deep squats, getting up off the floor"],
  ["back", "🧍", "Ease lower-back tension", "Tight hips often pull on your back"],
  ["splits", "🤸", "Work toward the splits", "Build the range step by step"],
  ["sport", "⚽", "Move better for sport", "Stride, kick, lunge and recover"],
];
const LEVELS = [
  ["very_tight", "🪨", "Very tight", "Sitting cross-legged is uncomfortable"],
  ["tight", "🌱", "Tight", "I can sit cross-legged, but deep squats are hard"],
  ["ok", "🌊", "Fairly flexible", "I want to go further and keep it"],
];
const TIMES = [["07:30", "Morning"], ["12:30", "Lunch"], ["18:30", "Evening"], ["21:30", "Before bed"]];

export function CoachPicker({ value, onChange }) {
  return (
    <div className="coach-pick">
      {[["female", "Female coach"], ["male", "Male coach"]].map(([id, label]) => (
        <button key={id} className={`coach-opt tap ${value === id ? "on" : ""}`} onClick={() => onChange(id)} aria-pressed={value === id}>
          <Thumb3D id="butterfly" coach={id} alt="" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function Opt({ on, emoji, title, sub, onClick }) {
  return (
    <button className={`opt ${on ? "on" : ""}`} onClick={onClick} aria-pressed={on}>
      <span className="emoji">{emoji}</span>
      <div><b>{title}</b><span>{sub}</span></div>
      <span className="check">{on && <Icon name="check" size={14} />}</span>
    </button>
  );
}

export default function Onboarding({ store, today, onDone }) {
  const [step, setStep] = useState(0);
  const [goals, setGoals] = useState([]);
  const [level, setLevel] = useState(null);
  const [time, setTime] = useState("18:30");
  const [start, setStart] = useState(store.startDate >= today ? store.startDate : today);
  const [voice, setVoice] = useState(true);
  const [coach, setCoach] = useState(store.coach || "female");
  const tomorrow = addDays(today, 1);
  const steps = 5;
  const next = () => setStep((s) => s + 1);
  const toggleGoal = (id) => setGoals((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  const finish = () => onDone({ profile: { goals, level, time }, startDate: start, voice, coach, easier: level === "very_tight" });

  let body, cta, disabled = false;
  if (step === 0) {
    body = (
      <>
        <div className="welcome"><Thumb3D id="pigeon" size="hero" alt="" /><div className="shade" /></div>
        <h1>Open up tight hips in 10 minutes a day</h1>
        <p>A 10-week guided plan for beginners. Your coach shows you how to get into every stretch, then holds it with you.</p>
      </>
    );
    cta = "Get started";
  } else if (step === 1) {
    body = (
      <>
        <h1>What do you want from stretching?</h1>
        <p>Pick as many as you like.</p>
        {GOALS.map(([id, e, t, s]) => <Opt key={id} on={goals.includes(id)} emoji={e} title={t} sub={s} onClick={() => toggleGoal(id)} />)}
      </>
    );
    cta = "Continue";
    disabled = !goals.length;
  } else if (step === 2) {
    body = (
      <>
        <h1>How tight are your hips right now?</h1>
        <p>Be honest. We'll tailor the coaching to you.</p>
        {LEVELS.map(([id, e, t, s]) => <Opt key={id} on={level === id} emoji={e} title={t} sub={s} onClick={() => setLevel(id)} />)}
      </>
    );
    cta = "Continue";
    disabled = !level;
  } else if (step === 3) {
    body = (
      <>
        <h1>When will you stretch?</h1>
        <p>Same time every day makes it a habit.</p>
        <div className="chips" style={{ flexWrap: "wrap", margin: 0, padding: 0 }}>
          {TIMES.map(([t, label]) => <button key={t} className={`chip ${time === t ? "on" : ""}`} onClick={() => setTime(t)}>{label} · {t}</button>)}
        </div>
        <label className="set-row card" style={{ padding: "12px 16px" }}>
          <span>Or pick a time</span>
          <input className="input" type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
        </label>
        <h3 style={{ margin: "8px 2px 0" }}>Start</h3>
        <div className="chips" style={{ flexWrap: "wrap", margin: 0, padding: 0 }}>
          <button className={`chip ${start === today ? "on" : ""}`} onClick={() => setStart(today)}>Today</button>
          <button className={`chip ${start === tomorrow ? "on" : ""}`} onClick={() => setStart(tomorrow)}>Tomorrow</button>
          <input className="input" type="date" value={start} min={ymd(new Date())} onChange={(e) => e.target.value && setStart(e.target.value)} aria-label="Start date" />
        </div>
        <h3 style={{ margin: "8px 2px 0" }}>Your coach</h3>
        <CoachPicker value={coach} onChange={setCoach} />
        <label className="set-row card" style={{ padding: "6px 16px" }}>
          <span>Voice coaching</span>
          <input type="checkbox" className="switch" checked={voice} onChange={(e) => setVoice(e.target.checked)} />
        </label>
      </>
    );
    cta = "Build my plan";
  } else {
    body = (
      <>
        <h1>Your plan is ready</h1>
        <p>10 weeks, 10 minutes a day{level === "very_tight" ? ", with easier options shown in every hold" : ""}.</p>
        <div className="card plan-sum">
          <div className="ps-row"><span className="emoji" style={{ fontSize: 22 }}>📅</span><div><b>Starts {start === today ? "today" : fmtDate(start, { weekday: "long", day: "numeric", month: "long" })}</b><span>Ends {fmtDate(addDays(start, 69), { day: "numeric", month: "long" })}</span></div></div>
          <div className="ps-row"><span className="emoji" style={{ fontSize: 22 }}>⏰</span><div><b>Every day at {time}</b><span>About 10 minutes</span></div></div>
          {PHASES.map((p) => (
            <div key={p.n} className="ps-row">
              <span className="phase-num" style={{ "--phase": p.color }}>{p.n}</span>
              <div><b>{p.name}</b><span>Weeks {p.weeks.join("–")}</span></div>
            </div>
          ))}
        </div>
        <button className="btn" onClick={() => downloadReminder(start, time)}><Icon name="calendar" size={18} /> Add a daily reminder to my calendar</button>
      </>
    );
    cta = "Let's go";
  }

  return (
    <div className="onb">
      <div className="onb-top">
        {step > 0 ? <button className="icon-btn" onClick={() => setStep((s) => s - 1)} aria-label="Back"><Icon name="back" /></button> : <span style={{ width: 42 }} />}
        <div className="dots" aria-hidden="true">{Array.from({ length: steps }, (_, n) => <i key={n} className={n <= step ? "on" : ""} />)}</div>
        <span style={{ width: 42 }} />
      </div>
      <div className="onb-body" key={step}>{body}</div>
      <div className="onb-foot">
        <button className="btn primary big" disabled={disabled} style={disabled ? { opacity: 0.45 } : undefined} onClick={step === steps - 1 ? finish : next}>{cta}</button>
      </div>
    </div>
  );
}
