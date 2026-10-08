import { useState } from "react";
import Coach3D from "../coach/Coach3D.jsx";
import { Icon, Sheet } from "../ui.jsx";
import { AREAS, BY_ID, videoUrl } from "../data/stretches.js";
import { TESTS, CHECKPOINTS, ymd } from "../data/program.js";

export function StretchSheet({ id, onClose }) {
  const s = BY_ID[id];
  return (
    <Sheet title={s.name} onClose={onClose}>
      <div className="demo"><Coach3D stretch={s.id} pose2d={s.pose} kind="demo" /></div>
      <p className="target"><span style={{ color: AREAS[s.area].color }}>●</span> {s.target}</p>
      <h4>How to get into it</h4>
      <ol className="steps">{s.how.map((h, n) => <li key={n}>{h}</li>)}</ol>
      <h4>While you hold</h4>
      <ul className="bullets good">{s.cues.map((h, n) => <li key={n}>{h}</li>)}</ul>
      {s.avoid.length > 0 && <><h4>Avoid</h4><ul className="bullets bad">{s.avoid.map((h, n) => <li key={n}>{h}</li>)}</ul></>}
      <div className="variants">
        <div><h4>Easier</h4><p>{s.easier}</p></div>
        <div><h4>Harder</h4><p>{s.harder}</p></div>
      </div>
      <a className="btn" href={videoUrl(s)} target="_blank" rel="noreferrer"><Icon name="video" size={18} /> Watch video demos</a>
    </Sheet>
  );
}

export function TestSheet({ checkpoint, store, update, onClose }) {
  const cp = CHECKPOINTS.find((c) => c.id === checkpoint);
  const [vals, setVals] = useState(() => ({ ...(store.tests[checkpoint] || {}) }));
  const save = () => {
    const clean = {};
    for (const t of TESTS) if (vals[t.id] !== "" && vals[t.id] != null && !isNaN(+vals[t.id])) clean[t.id] = +vals[t.id];
    update((s) => ({ tests: { ...s.tests, [checkpoint]: { ...clean, date: ymd(new Date()) } } }));
    onClose();
  };
  return (
    <Sheet title={`${cp.name} test`} onClose={onClose}>
      <p className="muted">{cp.label}. Warm up with a minute of cat-cow first, and do each test the same way every time so the numbers compare.</p>
      {TESTS.map((t) => (
        <div key={t.id} className="test-field">
          <label htmlFor={`t-${t.id}`}><b>{t.name}</b> <span className="muted">({t.unit}, {t.better} is better)</span></label>
          <p className="muted small">{t.how}</p>
          <input className="input" id={`t-${t.id}`} type="number" inputMode="decimal" min={t.min ?? 0} max={t.max} value={vals[t.id] ?? ""} onChange={(e) => setVals({ ...vals, [t.id]: e.target.value })} />
        </div>
      ))}
      <button className="btn primary big" onClick={save}>Save results</button>
    </Sheet>
  );
}
