import { useEffect, useRef, useState } from "react";
import { Icon, Sheet } from "../ui.jsx";
import { PROGRAM_DAYS, TESTS, CHECKPOINTS, programDay, fmtDate } from "../data/program.js";
import { listPhotos, addPhoto, deletePhoto } from "../photos.js";
import { downloadReminder } from "../reminder.js";
import { streaks, doneDaySet } from "../lib.js";
import { CoachPicker } from "./Onboarding.jsx";

const POSES = [["pigeon", "Pigeon"], ["butterfly", "Butterfly"], ["squat", "Deep squat"], ["split", "Half split"], ["any", "Other"]];

function usePhotos() {
  const [photos, setPhotos] = useState([]);
  const urls = useRef(new Map());
  const refresh = () => listPhotos().then((all) => {
    for (const p of all) if (!urls.current.has(p.id)) urls.current.set(p.id, URL.createObjectURL(p.blob));
    setPhotos(all.map((p) => ({ ...p, url: urls.current.get(p.id) })));
  }).catch(() => setPhotos([]));
  useEffect(() => {
    refresh();
    const map = urls.current;
    return () => { for (const u of map.values()) URL.revokeObjectURL(u); };
  }, []);
  return [photos, refresh];
}

function Compare({ before, after }) {
  const [split, setSplit] = useState(50);
  const ref = useRef(null);
  const move = (e) => {
    const r = ref.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    setSplit(Math.max(0, Math.min(100, (x / r.width) * 100)));
  };
  return (
    <div className="compare" ref={ref} style={{ "--split": `${split}%` }} onPointerDown={move} onPointerMove={(e) => e.buttons && move(e)} onTouchMove={move}>
      <img src={before.url} alt={`Before, ${before.date}`} />
      <img className="after" src={after.url} alt={`After, ${after.date}`} />
      <div className="handle" />
      <span className="lab" style={{ left: 10 }}>{fmtDate(before.date, { day: "numeric", month: "short" })}</span>
      <span className="lab" style={{ right: 10 }}>{fmtDate(after.date, { day: "numeric", month: "short" })}</span>
    </div>
  );
}

function Photos({ today }) {
  const [photos, refresh] = usePhotos();
  const [pose, setPose] = useState("pigeon");
  const [view, setView] = useState(null); // photo | "compare"
  const input = useRef(null);
  const mine = photos.filter((p) => p.pose === pose);
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    await addPhoto(f, pose, today);
    refresh();
  };
  return (
    <>
      <div className="section-head"><h3>Progress photos</h3>{mine.length >= 2 && <button onClick={() => setView("compare")}>Compare</button>}</div>
      <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="photo-poses">
          {POSES.map(([id, label]) => <button key={id} className={`chip ${pose === id ? "on" : ""}`} onClick={() => setPose(id)}>{label}</button>)}
        </div>
        <div className="photos">
          <button className="photo add tap" onClick={() => input.current?.click()}>
            <div><Icon name="camera" size={26} />Add photo</div>
          </button>
          {[...mine].reverse().map((p) => (
            <button key={p.id} className="photo tap" onClick={() => setView(p)}>
              <img src={p.url} alt={`${pose} on ${p.date}`} />
              <span>{fmtDate(p.date, { day: "numeric", month: "short" })}</span>
            </button>
          ))}
        </div>
        <p className="muted small" style={{ margin: 0, lineHeight: 1.45 }}>Same spot, same angle, side-on works best. Photos stay on this phone.</p>
        <input ref={input} type="file" accept="image/*" hidden onChange={onFile} />
      </div>
      {view === "compare" && (
        <Sheet title="Before & after" onClose={() => setView(null)}>
          <Compare before={mine[0]} after={mine[mine.length - 1]} />
          <p className="muted small">Drag to compare your first and latest {POSES.find((x) => x[0] === pose)[1].toLowerCase()} photos.</p>
        </Sheet>
      )}
      {view && view !== "compare" && (
        <Sheet title={fmtDate(view.date, { weekday: "long", day: "numeric", month: "long" })} onClose={() => setView(null)}>
          <img src={view.url} alt="" style={{ width: "100%", borderRadius: 16 }} />
          <button className="btn ghost danger" onClick={async () => { await deletePhoto(view.id); setView(null); refresh(); }}><Icon name="trash" size={18} /> Delete photo</button>
        </Sheet>
      )}
    </>
  );
}

export default function Progress({ store, update, today, openTests }) {
  const { current, best } = streaks(store.sessions, today);
  const doneDays = doneDaySet(store.sessions);
  const minutes = Math.round(store.sessions.reduce((t, s) => t + (s.secs || 0), 0) / 60);
  const day = programDay(store.startDate, today);
  const fmtVal = (t, v) => (v == null || v === "" ? "–" : `${v}${t.unit === "/5" ? "/5" : " " + t.unit}`);
  const delta = (t) => {
    const a = store.tests.start?.[t.id];
    const b = store.tests.end?.[t.id] ?? store.tests.mid?.[t.id];
    if (a == null || b == null) return null;
    return (b - a) * (t.better === "lower" ? -1 : 1);
  };

  return (
    <div className="screen">
      <div className="top"><div><div className="kicker">Keep showing up</div><h1>Progress</h1></div></div>
      <div className="stat-grid">
        <div className="card stat"><b>🔥 {current}</b><span>day streak</span></div>
        <div className="card stat"><b>{best}</b><span>best streak</span></div>
        <div className="card stat"><b>{doneDays.size}<small> / {PROGRAM_DAYS}</small></b><span>plan days done</span></div>
        <div className="card stat"><b>{minutes}</b><span>minutes stretched</span></div>
      </div>

      <div className="section-head"><h3>10-week calendar</h3></div>
      <div className="card heat">
        {Array.from({ length: 10 }, (_, w) => (
          <div key={w} className="heat-row">
            <span>W{w + 1}</span>
            {Array.from({ length: 7 }, (_, n) => {
              const d = w * 7 + n + 1;
              return <i key={n} className={doneDays.has(d) ? "done" : d === day ? "today" : d < day ? "missed" : ""} />;
            })}
          </div>
        ))}
      </div>

      <Photos today={today} />

      <div className="section-head"><h3>Mobility tests</h3></div>
      <div className="card tests">
        <div className="tests-row head"><span />{CHECKPOINTS.map((c) => <span key={c.id}>{c.name}</span>)}</div>
        {TESTS.map((t) => {
          const d = delta(t);
          return (
            <div key={t.id} className="tests-row">
              <span className="t-name">{t.name}{d != null && <em className={d > 0 ? "up" : d < 0 ? "down" : ""}>{d > 0 ? "▲" : d < 0 ? "▼" : "="} {Math.abs(Math.round(d * 10) / 10)}</em>}</span>
              {CHECKPOINTS.map((c) => <span key={c.id}>{fmtVal(t, store.tests[c.id]?.[t.id])}</span>)}
            </div>
          );
        })}
        <div className="tests-actions">
          {CHECKPOINTS.map((c) => (
            <button key={c.id} className="btn small" onClick={() => openTests(c.id)}>{store.tests[c.id] ? "Edit" : "Log"} {c.name.toLowerCase()} <span className="muted">· {c.label}</span></button>
          ))}
        </div>
      </div>

      <div className="section-head"><h3>Your coach</h3></div>
      <CoachPicker value={store.coach} onChange={(coach) => update({ coach })} />

      <div className="section-head"><h3>Settings</h3></div>
      <div className="card settings">
        <label className="set-row"><span>Plan start date</span><input className="input" type="date" value={store.startDate} onChange={(e) => e.target.value && update({ startDate: e.target.value })} /></label>
        <label className="set-row"><span>Voice coaching</span><input type="checkbox" className="switch" checked={store.voice} onChange={(e) => update({ voice: e.target.checked })} /></label>
        <label className="set-row"><span>Countdown beeps</span><input type="checkbox" className="switch" checked={store.beeps} onChange={(e) => update({ beeps: e.target.checked })} /></label>
        <label className="set-row"><span>Show easier options during holds</span><input type="checkbox" className="switch" checked={store.easier} onChange={(e) => update({ easier: e.target.checked })} /></label>
        <div className="set-row"><span>Daily reminder</span><button className="btn small" onClick={() => downloadReminder(store.startDate, store.profile?.time || "18:30")}><Icon name="calendar" size={16} /> Add to calendar</button></div>
        <div className="set-row">
          <span className="muted small">Everything is saved on this phone.</span>
          <button className="btn ghost small danger" onClick={() => { if (confirm("Erase all sessions and test results?")) update({ sessions: [], tests: {} }); }}>Reset</button>
        </div>
      </div>
    </div>
  );
}
