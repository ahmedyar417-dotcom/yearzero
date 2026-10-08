import { useEffect, useMemo, useState } from "react";
import Player, { unlockAudio } from "./Player.jsx";
import { Icon } from "./ui.jsx";
import { useStore, activeSession } from "./store.js";
import { useToday, streaks, sessionFromKey } from "./lib.js";
import { sessionFor, programDay, buildTimeline, PROGRAM_DAYS } from "./data/program.js";
import { QUICK } from "./data/sessions.js";
import Onboarding from "./screens/Onboarding.jsx";
import Home from "./screens/Home.jsx";
import Plan from "./screens/Plan.jsx";
import Explore from "./screens/Explore.jsx";
import Progress from "./screens/Progress.jsx";
import Overview from "./screens/Overview.jsx";
import Complete from "./screens/Complete.jsx";
import { StretchSheet, TestSheet } from "./screens/sheets.jsx";

const TABS = [
  ["today", "Today", "today"],
  ["plan", "Plan", "plan"],
  ["explore", "Explore", "explore"],
  ["progress", "Progress", "progress"],
];

export default function App() {
  const [store, update] = useStore();
  const today = useToday();
  const [tab, setTab] = useState("today");
  const [overviewKey, setOverviewKey] = useState(null);
  const [stretchId, setStretchId] = useState(null);
  const [testCp, setTestCp] = useState(null);
  const [playing, setPlaying] = useState(null); // { key, session, day, extra, resume }
  const [finished, setFinished] = useState(null); // completion screen data
  const [active, setActive] = useState(() => activeSession.get());

  useEffect(() => {
    const check = () => !document.hidden && setActive(activeSession.get());
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);
  useEffect(() => { if (!playing) setActive(activeSession.get()); }, [playing]);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  const settings = useMemo(() => ({ voice: store.voice, beeps: store.beeps, easier: store.easier }), [store.voice, store.beeps, store.easier]);
  const started = programDay(store.startDate, today) >= 1;
  const dayKey = (d) => (started ? `day:${d}` : `practice:${d}`);

  const start = (key, resume = null) => {
    unlockAudio();
    setOverviewKey(null);
    setPlaying({ key, ...sessionFromKey(key), resume });
  };

  const done = ({ secs }) => {
    const p = playing;
    const at = Date.now();
    const practice = p.key.startsWith("practice");
    const rec = { date: today, day: p.day, extra: p.extra || undefined, secs, at };
    const sessionsAfter = practice ? store.sessions : [...store.sessions, rec];
    if (!practice) update((s) => ({ sessions: [...s.sessions, rec] }));
    const title = p.day ? `Day ${p.day} complete` : practice ? "Practice complete" : "Session complete";
    const next = p.day && p.day < PROGRAM_DAYS ? `Tomorrow: ${sessionFor(p.day + 1).dayType.name}` : null;
    setFinished({
      at: practice ? null : at, title, subtitle: p.session.dayType.name,
      minutes: Math.max(1, Math.round(secs / 60)), stretches: p.session.items.length,
      streak: streaks(sessionsAfter, today).current, nextUp: next,
    });
    setPlaying(null);
    setTab("today");
  };
  const rate = (feel) => finished?.at && update((s) => ({ sessions: s.sessions.map((r) => (r.at === finished.at ? { ...r, feel } : r)) }));

  if (!store.profile) return <Onboarding store={store} today={today} onDone={(p) => update(p)} />;

  if (playing) {
    return (
      <Player
        key={playing.key + (playing.resume ? ":r" : "")}
        session={playing.session} settings={settings} resume={playing.resume} resumeKey={playing.key}
        onExit={() => setPlaying(null)} onDone={done}
      />
    );
  }
  if (finished) return <Complete {...finished} onFeel={rate} onClose={() => setFinished(null)} />;

  // what the resume card shows
  let resumeInfo = null;
  if (active) {
    try {
      const { session } = sessionFromKey(active.key);
      const seg = buildTimeline(session)[active.i];
      resumeInfo = { label: session.dayType.name, at: `${(seg?.idx ?? 0) + 1} of ${session.items.length}` };
    } catch { /* stale */ }
  }

  // overview data
  let ov = null;
  if (overviewKey) {
    const { session, day, extra } = sessionFromKey(overviewKey);
    if (extra) {
      const q = QUICK.find((x) => x.id === extra);
      ov = { session, eyebrow: `Quick session · ${q.mins} min`, blurb: q.blurb, done: false };
    } else {
      const n = Number(overviewKey.split(":")[1]);
      ov = {
        session, eyebrow: `Day ${n} · Week ${session.week} · ${session.phase.name}`, blurb: session.phase.goal,
        done: day != null && store.sessions.some((r) => r.day === day),
        startLabel: started ? "Start class" : "Try it now (practice)",
      };
    }
  }

  return (
    <div className="app">
      <main>
        {tab === "today" && (
          <Home
            store={store} update={update} today={today}
            resume={resumeInfo} onResume={() => start(active.key, { i: active.i, elapsed: active.elapsed })}
            openDay={(d) => setOverviewKey(dayKey(d))} startNow={(d) => start(dayKey(d))}
            openQuick={(id) => setOverviewKey(`extra:${id}`)} openStretch={setStretchId} openTests={setTestCp}
          />
        )}
        {tab === "plan" && <Plan store={store} today={today} openDay={(d) => setOverviewKey(dayKey(d))} />}
        {tab === "explore" && <Explore openQuick={(id) => setOverviewKey(`extra:${id}`)} openStretch={setStretchId} />}
        {tab === "progress" && <Progress store={store} update={update} today={today} openTests={setTestCp} />}
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map(([k, label, icon]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}>
            <Icon name={icon} size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {ov && <Overview {...ov} onStart={() => start(overviewKey)} onClose={() => setOverviewKey(null)} openStretch={setStretchId} />}
      {stretchId && <StretchSheet id={stretchId} onClose={() => setStretchId(null)} />}
      {testCp && <TestSheet checkpoint={testCp} store={store} update={update} onClose={() => setTestCp(null)} />}
    </div>
  );
}
