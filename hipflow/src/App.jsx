import { useEffect, useMemo, useState } from "react";
import Figure from "./Figure.jsx";
import Player, { unlockAudio } from "./Player.jsx";
import { POSES } from "./poses.js";
import { Icon, Sheet } from "./ui.jsx";
import { useStore } from "./store.js";
import { STRETCHES, AREAS, BY_ID, videoUrl } from "./data/stretches.js";
import {
  PHASES, PROGRAM_DAYS, sessionFor, programDay, addDays, ymd, fmtDate, fmtTime, daysBetween,
  TESTS, CHECKPOINTS,
} from "./data/program.js";

function useToday() {
  const [today, setToday] = useState(() => ymd(new Date()));
  useEffect(() => {
    const check = () => setToday(ymd(new Date()));
    const id = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", check); };
  }, []);
  return today;
}

function streaks(sessions, today) {
  const dates = new Set(sessions.map((s) => s.date));
  let d = dates.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (dates.has(d)) { current++; d = addDays(d, -1); }
  const sorted = [...dates].sort();
  let best = 0, run = 0, prev = null;
  for (const x of sorted) { run = prev && daysBetween(prev, x) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = x; }
  return { current, best };
}

const Thumb = ({ pose }) => (
  <div className="thumb"><Figure pose={pose} fixedK={1} /></div>
);

// ── Today ────────────────────────────────────────────────────────────────
function Today({ store, today, onStart, openStretch, openTests }) {
  const day = programDay(store.startDate, today);
  const notStarted = day < 1;
  const finished = day > PROGRAM_DAYS;
  const session = sessionFor(notStarted ? 1 : day);
  const doneToday = store.sessions.some((s) => s.date === today);
  const { current } = streaks(store.sessions, today);
  const doneDays = new Set(store.sessions.map((s) => s.day).filter(Boolean));
  const weekStartDay = (session.week - 1) * 7 + 1;
  const dueCheckpoint = CHECKPOINTS.find((c) => day >= c.from && !store.tests[c.id] && (c.id !== "start" || day <= 14) && (c.id !== "mid" || day <= 42));

  return (
    <div className="screen">
      {notStarted ? (
        <div className="hero card" style={{ "--phase": session.phase.color }}>
          <div className="eyebrow">Your program starts {day === 0 ? "tomorrow" : `in ${1 - day} days`}</div>
          <h1>{fmtDate(store.startDate, { weekday: "long", day: "numeric", month: "long" })}</h1>
          <p className="muted">10 weeks · 10 minutes a day · built for very tight hips. Here's Day 1 so you can preview it.</p>
          <button className="btn primary big" onClick={() => onStart(session, null)}><Icon name="play" size={18} /> Try Day 1 now (practice)</button>
        </div>
      ) : (
        <div className="hero card" style={{ "--phase": session.phase.color }}>
          <div className="eyebrow">
            {finished ? "Program complete · maintenance" : <>Day {day} of {PROGRAM_DAYS} · Week {session.week}</>}
          </div>
          <h1>{session.dayType.name}</h1>
          <div className="hero-meta">
            <span className="pill" style={{ color: session.phase.color }}>Phase {session.phase.n}: {session.phase.name}</span>
            <span className="muted"><Icon name="clock" size={14} /> {fmtTime(session.totalSecs)} · {session.items.length} stretches</span>
          </div>
          {doneToday ? (
            <div className="done-row">
              <span className="done-tag"><Icon name="check" size={16} /> Done today</span>
              <button className="btn ghost" onClick={() => onStart(session, day)}>Do it again</button>
            </div>
          ) : (
            <button className="btn primary big" onClick={() => onStart(session, day)}><Icon name="play" size={18} /> Start today's session</button>
          )}
        </div>
      )}

      {dueCheckpoint && !notStarted && (
        <button className="card test-cta" onClick={() => openTests(dueCheckpoint.id)}>
          <div>
            <b>{dueCheckpoint.name} mobility test</b>
            <span className="muted">4 quick checks, about 3 minutes. Track how far you've come.</span>
          </div>
          <Icon name="chevron" />
        </button>
      )}

      {!notStarted && (
        <div className="card stats-row">
          <div><b><Icon name="flame" size={16} /> {current}</b><span>day streak</span></div>
          <div><b>{doneDays.size}</b><span>of {PROGRAM_DAYS} days</span></div>
          <div className="week-dots">
            {Array.from({ length: 7 }, (_, n) => {
              const d = weekStartDay + n;
              const cls = doneDays.has(d) ? "done" : d === day ? "today" : d < day ? "missed" : "";
              return <i key={n} className={cls} title={`Day ${d}`} />;
            })}
            <span>this week</span>
          </div>
        </div>
      )}

      <h3 className="section">Today's stretches</h3>
      <div className="list card">
        {session.items.map((it, n) => (
          <button key={n} className="row" onClick={() => openStretch(it.stretch.id)}>
            <Thumb pose={it.stretch.pose} />
            <div className="row-main">
              <b>{it.stretch.name}</b>
              <span className="muted">{AREAS[it.stretch.area].label}{it.note ? " · " + (it.note.startsWith("Contract") ? "contract-relax" : "variation") : ""}</span>
            </div>
            <span className="row-time">{it.sides === 2 ? `${it.secs}s × 2` : fmtTime(it.secs)}</span>
          </button>
        ))}
      </div>

      <div className="card phase-card" style={{ "--phase": session.phase.color }}>
        <div className="eyebrow">Phase {session.phase.n} · weeks {session.phase.weeks.join("–")}</div>
        <b>{session.phase.goal}</b>
        <p className="muted">{session.phase.tip}</p>
      </div>

      <p className="disclaimer">Stretch to mild discomfort, never pain. Stop if you feel sharp, pinching or nerve-like pain.</p>
    </div>
  );
}

// ── Plan ─────────────────────────────────────────────────────────────────
function Plan({ store, today, openSession }) {
  const day = programDay(store.startDate, today);
  const doneDays = new Set(store.sessions.map((s) => s.day).filter(Boolean));
  return (
    <div className="screen">
      <h2 className="title">10-week plan</h2>
      <p className="muted small">Each week rotates Front → Back → Inner, twice, then a full-hip Flow day. Tap any day to preview it or do it.</p>
      {PHASES.map((p) => (
        <div key={p.n} className="card phase-block" style={{ "--phase": p.color }}>
          <div className="phase-head">
            <span className="phase-num">{p.n}</span>
            <div>
              <b>{p.name}</b>
              <span className="muted small">Weeks {p.weeks.join("–")} · {p.goal}</span>
            </div>
          </div>
          {p.weeks.map((w) => (
            <div key={w} className="week-row">
              <span className="week-label">W{w}</span>
              <div className="days">
                {Array.from({ length: 7 }, (_, n) => {
                  const d = (w - 1) * 7 + n + 1;
                  const s = sessionFor(d);
                  const cls = doneDays.has(d) ? "done" : d === day ? "today" : d < day ? "missed" : "";
                  return (
                    <button key={d} className={`day ${cls}`} onClick={() => openSession(d)} title={`Day ${d}: ${s.dayType.name}`}>
                      <span className="d-type">{s.dayType.short}</span>
                      <span className="d-date">{fmtDate(addDays(store.startDate, d - 1), { day: "numeric" })}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Library ──────────────────────────────────────────────────────────────
function Library({ openStretch }) {
  const [area, setArea] = useState("all");
  const list = STRETCHES.filter((s) => area === "all" || s.area === area);
  return (
    <div className="screen">
      <h2 className="title">Stretch library</h2>
      <div className="chips">
        <button className={`chip ${area === "all" ? "on" : ""}`} onClick={() => setArea("all")}>All</button>
        {Object.entries(AREAS).map(([k, a]) => (
          <button key={k} className={`chip ${area === k ? "on" : ""}`} onClick={() => setArea(k)}>{a.label}</button>
        ))}
      </div>
      <div className="grid">
        {list.map((s) => (
          <button key={s.id} className="card tile" onClick={() => openStretch(s.id)}>
            <Figure pose={s.pose} fixedK={1} />
            <b>{s.name}</b>
            <span className="muted small">{AREAS[s.area].label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Progress ─────────────────────────────────────────────────────────────
function Progress({ store, update, today, openTests }) {
  const { current, best } = streaks(store.sessions, today);
  const doneDays = new Set(store.sessions.map((s) => s.day).filter(Boolean));
  const minutes = Math.round(store.sessions.reduce((t, s) => t + (s.secs || 0), 0) / 60);
  const day = programDay(store.startDate, today);

  const fmtVal = (t, v) => (v == null || v === "" ? "–" : `${v}${t.unit === "/5" ? "/5" : " " + t.unit}`);
  const delta = (t) => {
    const a = store.tests.start?.[t.id];
    const b = store.tests.end?.[t.id] ?? store.tests.mid?.[t.id];
    if (a == null || b == null) return null;
    const d = (b - a) * (t.better === "lower" ? -1 : 1);
    return d;
  };

  return (
    <div className="screen">
      <h2 className="title">Progress</h2>
      <div className="stat-grid">
        <div className="card stat"><b>{current}</b><span>current streak</span></div>
        <div className="card stat"><b>{best}</b><span>best streak</span></div>
        <div className="card stat"><b>{doneDays.size}<small>/{PROGRAM_DAYS}</small></b><span>program days</span></div>
        <div className="card stat"><b>{minutes}</b><span>minutes stretched</span></div>
      </div>

      <h3 className="section">Calendar</h3>
      <div className="card heat">
        {Array.from({ length: 10 }, (_, w) => (
          <div key={w} className="heat-row">
            <span>W{w + 1}</span>
            {Array.from({ length: 7 }, (_, n) => {
              const d = w * 7 + n + 1;
              const cls = doneDays.has(d) ? "done" : d === day ? "today" : d < day ? "missed" : "";
              return <i key={n} className={cls} />;
            })}
          </div>
        ))}
      </div>

      <h3 className="section">Mobility tests</h3>
      <div className="card tests">
        <div className="tests-row head">
          <span />
          {CHECKPOINTS.map((c) => <span key={c.id}>{c.name}</span>)}
        </div>
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
            <button key={c.id} className="btn ghost small" onClick={() => openTests(c.id)}>{store.tests[c.id] ? "Edit" : "Log"} {c.name.toLowerCase()} <span className="muted">({c.label})</span></button>
          ))}
        </div>
      </div>

      <h3 className="section">Settings</h3>
      <div className="card settings">
        <label className="set-row">
          <span>Program start date</span>
          <input type="date" value={store.startDate} onChange={(e) => e.target.value && update({ startDate: e.target.value })} />
        </label>
        <label className="set-row">
          <span>Voice coaching</span>
          <input type="checkbox" className="switch" checked={store.voice} onChange={(e) => update({ voice: e.target.checked })} />
        </label>
        <label className="set-row">
          <span>Countdown beeps</span>
          <input type="checkbox" className="switch" checked={store.beeps} onChange={(e) => update({ beeps: e.target.checked })} />
        </label>
        <div className="set-row">
          <span className="muted small">Progress is saved on this device.</span>
          <button className="btn ghost small danger" onClick={() => { if (confirm("Erase all sessions and test results?")) update({ sessions: [], tests: {} }); }}>Reset</button>
        </div>
      </div>
    </div>
  );
}

// ── Sheets ───────────────────────────────────────────────────────────────
function StretchSheet({ id, onClose }) {
  const s = BY_ID[id];
  const view = POSES[s.pose]?.view;
  return (
    <Sheet title={s.name} onClose={onClose}>
      <div className="demo">
        <Figure pose={s.pose} />
        {view !== "side" && <span className="view-tag">{view === "top" ? "View from above" : "Front view"}</span>}
        <span className="feel-tag"><i /> Feel it here</span>
      </div>
      <a className="btn video" href={videoUrl(s)} target="_blank" rel="noreferrer"><Icon name="video" size={18} /> Watch video demos</a>
      <p className="target"><span style={{ color: AREAS[s.area].color }}>●</span> {s.target}</p>
      <h4>How to</h4>
      <ol className="steps">{s.how.map((h, n) => <li key={n}>{h}</li>)}</ol>
      <h4>Cues</h4>
      <ul className="bullets good">{s.cues.map((h, n) => <li key={n}>{h}</li>)}</ul>
      {s.avoid.length > 0 && <><h4>Avoid</h4><ul className="bullets bad">{s.avoid.map((h, n) => <li key={n}>{h}</li>)}</ul></>}
      <div className="variants">
        <div><h4>Easier</h4><p>{s.easier}</p></div>
        <div><h4>Harder</h4><p>{s.harder}</p></div>
      </div>
    </Sheet>
  );
}

function SessionSheet({ day, store, today, onStart, openStretch, onClose }) {
  const s = sessionFor(day);
  const date = addDays(store.startDate, day - 1);
  const done = store.sessions.some((x) => x.day === day);
  return (
    <Sheet title={`Day ${day} · ${s.dayType.name}`} onClose={onClose}>
      <p className="muted">{fmtDate(date, { weekday: "long", day: "numeric", month: "long" })} · Week {s.week} · Phase {s.phase.n}: {s.phase.name}{done ? " · ✓ done" : ""}</p>
      <div className="list card">
        {s.items.map((it, n) => (
          <button key={n} className="row" onClick={() => openStretch(it.stretch.id)}>
            <Thumb pose={it.stretch.pose} />
            <div className="row-main"><b>{it.stretch.name}</b><span className="muted">{it.note || AREAS[it.stretch.area].label}</span></div>
            <span className="row-time">{it.sides === 2 ? `${it.secs}s × 2` : fmtTime(it.secs)}</span>
          </button>
        ))}
      </div>
      <button className="btn primary big" onClick={() => onStart(s, programDay(store.startDate, today) >= 1 ? day : null)}>
        <Icon name="play" size={18} /> Start this session
      </button>
    </Sheet>
  );
}

function TestSheet({ checkpoint, store, update, onClose }) {
  const cp = CHECKPOINTS.find((c) => c.id === checkpoint);
  const [vals, setVals] = useState(() => ({ ...(store.tests[checkpoint] || {}) }));
  const save = () => {
    const clean = {};
    for (const t of TESTS) if (vals[t.id] !== "" && vals[t.id] != null && !isNaN(+vals[t.id])) clean[t.id] = +vals[t.id];
    update((s) => ({ tests: { ...s.tests, [checkpoint]: { ...clean, date: ymd(new Date()) } } }));
    onClose();
  };
  return (
    <Sheet title={`${cp.name} test · ${cp.label}`} onClose={onClose}>
      <p className="muted">Warm up with a minute of cat-cow first. Do each test the same way every time so the numbers compare.</p>
      {TESTS.map((t) => (
        <div key={t.id} className="test-field">
          <label htmlFor={`t-${t.id}`}><b>{t.name}</b> <span className="muted">({t.unit}, {t.better} is better)</span></label>
          <p className="muted small">{t.how}</p>
          <input id={`t-${t.id}`} type="number" inputMode="decimal" min={t.min ?? 0} max={t.max} value={vals[t.id] ?? ""} onChange={(e) => setVals({ ...vals, [t.id]: e.target.value })} />
        </div>
      ))}
      <button className="btn primary big" onClick={save}>Save results</button>
    </Sheet>
  );
}

// ── App shell ────────────────────────────────────────────────────────────
const TABS = [
  ["today", "Today", "today"],
  ["plan", "Plan", "plan"],
  ["library", "Stretches", "library"],
  ["progress", "Progress", "progress"],
];

export default function App() {
  const [store, update] = useStore();
  const today = useToday();
  const [tab, setTab] = useState("today");
  const [stretchId, setStretchId] = useState(null);
  const [sessionDay, setSessionDay] = useState(null);
  const [testCp, setTestCp] = useState(null);
  const [playing, setPlaying] = useState(null); // { session, day }

  const start = (session, day) => {
    unlockAudio();
    setSessionDay(null);
    setPlaying({ session, day });
  };
  const complete = ({ secs, feel }) => {
    const rec = { date: today, day: playing.day, secs, feel, at: Date.now() };
    if (playing.day != null) update((s) => ({ sessions: [...s.sessions, rec] }));
    setPlaying(null);
    setTab("today");
  };

  const settings = useMemo(() => ({ voice: store.voice, beeps: store.beeps }), [store.voice, store.beeps]);

  if (playing) {
    return <Player session={playing.session} settings={settings} onClose={() => { try { speechSynthesis.cancel(); } catch { /* ignore */ } setPlaying(null); }} onComplete={complete} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo" />HipFlow</div>
        <span className="muted small">{fmtDate(today)}</span>
      </header>
      <main>
        {tab === "today" && <Today store={store} today={today} onStart={start} openStretch={setStretchId} openTests={setTestCp} />}
        {tab === "plan" && <Plan store={store} today={today} openSession={setSessionDay} />}
        {tab === "library" && <Library openStretch={setStretchId} />}
        {tab === "progress" && <Progress store={store} update={update} today={today} openTests={setTestCp} />}
      </main>
      <nav className="tabbar">
        {TABS.map(([k, label, icon]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            <Icon name={icon} size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {sessionDay != null && <SessionSheet day={sessionDay} store={store} today={today} onStart={start} openStretch={setStretchId} onClose={() => setSessionDay(null)} />}
      {stretchId && <StretchSheet id={stretchId} onClose={() => setStretchId(null)} />}
      {testCp && <TestSheet checkpoint={testCp} store={store} update={update} onClose={() => setTestCp(null)} />}
    </div>
  );
}
