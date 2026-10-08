import Thumb3D from "../coach/Thumb3D.jsx";
import { Icon, Ring } from "../ui.jsx";
import { PROGRAM_DAYS, CHECKPOINTS, sessionFor, addDays, fmtDate, fmtTime, parseYmd } from "../data/program.js";
import { QUICK } from "../data/sessions.js";
import { streaks, doneDaySet, signature, todayInfo, greeting } from "../lib.js";

export default function Home({ store, update, today, resume, onResume, openDay, openQuick, openStretch, openTests, startNow }) {
  const { day, notStarted, finished, session } = todayInfo(store, today);
  const doneToday = store.sessions.some((s) => s.date === today);
  const { current } = streaks(store.sessions, today);
  const doneDays = doneDaySet(store.sessions);
  const weekStart = (session.week - 1) * 7 + 1;
  const weekDone = Array.from({ length: 7 }, (_, n) => weekStart + n).filter((d) => doneDays.has(d)).length;
  const dueCheckpoint = !notStarted && CHECKPOINTS.find((c) => day >= c.from && !store.tests[c.id] && (c.id !== "start" || day <= 14) && (c.id !== "mid" || day <= 42));
  const feels = store.sessions.map((s) => s.feel).filter(Boolean).slice(-2);
  const tooIntense = !store.easier && feels.length === 2 && feels.every((f) => f === 1);
  const heroDay = notStarted ? 1 : day;

  return (
    <div className="screen">
      <div className="top">
        <div>
          <div className="kicker">{fmtDate(today, { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1>{greeting()}</h1>
        </div>
        <span className="streak-chip" aria-label={`${current} day streak`}><Icon name="flame" size={18} /> {current}</span>
      </div>

      {resume && (
        <button className="card cta-card resume tap" onClick={onResume}>
          <span className="ic accent"><Icon name="play" size={20} /></span>
          <div><b>Resume your session</b><span>{resume.label} · stretch {resume.at}</span></div>
          <Icon name="chevron" />
        </button>
      )}

      <div className="hero-class tap" role="button" tabIndex={0} onClick={() => openDay(heroDay)} onKeyDown={(e) => e.key === "Enter" && openDay(heroDay)}>
        <Thumb3D id={signature(session)} size="hero" alt="" />
        <div className="shade" />
        <div className="hero-top">
          <span className="glass-pill">{notStarted ? `Starts ${day === 0 ? "tomorrow" : fmtDate(store.startDate, { weekday: "short", day: "numeric", month: "short" })}` : finished ? "Maintenance" : `Day ${day} · Week ${session.week}`}</span>
          {doneToday ? <span className="glass-pill done"><Icon name="check" size={14} /> Done today</span> : <span className="glass-pill">Phase {session.phase.n}</span>}
        </div>
        <div className="hero-body">
          <div>
            <div className="eyebrow">{notStarted ? "Preview Day 1" : "Today's class"}</div>
            <h2>{session.dayType.name}</h2>
            <div className="meta"><span>{Math.round(session.totalSecs / 60)} min</span><span>·</span><span>{session.items.length} stretches</span><span>·</span><span>{session.phase.name}</span></div>
          </div>
          <button className="play-fab" aria-label="Start today's class" onClick={(e) => { e.stopPropagation(); startNow(heroDay); }}><Icon name="play" size={26} /></button>
        </div>
      </div>

      {tooIntense && (
        <div className="card cta-card">
          <span className="ic"><Icon name="bolt" size={20} /></span>
          <div><b>Feeling too intense?</b><span>Show the easier version of each stretch during holds.</span></div>
          <button className="btn small" onClick={() => update({ easier: true })}>Turn on</button>
        </div>
      )}

      {!notStarted && (
        <div className="card">
          <div className="section-head" style={{ margin: "14px 16px 0" }}><h3>Week {Math.min(10, session.week)}</h3><span>{weekDone} of 7 done</span></div>
          <div className="week">
            {Array.from({ length: 7 }, (_, n) => {
              const d = weekStart + n;
              const date = addDays(store.startDate, d - 1);
              const cls = doneDays.has(d) ? "done" : d === day ? "today" : d < day ? "missed" : "";
              return (
                <button key={n} className={`wday ${cls}`} onClick={() => openDay(d)} aria-label={`Day ${d}: ${sessionFor(d).dayType.name}`}>
                  {parseYmd(date).toLocaleDateString(undefined, { weekday: "narrow" })}
                  <span className="dot">{doneDays.has(d) ? <Icon name="check" size={16} /> : parseYmd(date).getDate()}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {dueCheckpoint && (
        <button className="card cta-card tap" onClick={() => openTests(dueCheckpoint.id)}>
          <span className="ic"><Icon name="trophy" size={20} /></span>
          <div><b>{dueCheckpoint.name} mobility test</b><span>4 quick checks · about 3 minutes</span></div>
          <Icon name="chevron" />
        </button>
      )}

      <div className="section-head"><h3>In today's class</h3><span>{fmtTime(session.totalSecs)}</span></div>
      <div className="carousel">
        {session.items.map((it, n) => (
          <button key={n} className="move-card tap" onClick={() => openStretch(it.stretch.id)}>
            <Thumb3D id={it.stretch.id} alt="" />
            <b>{it.stretch.name}</b>
            <span>{it.sides === 2 ? `${Math.round(it.secs)}s each side` : fmtTime(it.secs)}</span>
          </button>
        ))}
      </div>

      {!notStarted && (
        <div className="card progress-card">
          <Ring value={doneDays.size / PROGRAM_DAYS} />
          <div className="pc-main">
            <b>{doneDays.size} of {PROGRAM_DAYS} days</b>
            <span className="muted small">Phase {session.phase.n} · {session.phase.name} · weeks {session.phase.weeks.join("–")}</span>
          </div>
        </div>
      )}

      <div className="card phase-card" style={{ "--phase": session.phase.color }}>
        <div className="eyebrow" style={{ color: session.phase.color }}>Coach's tip · Phase {session.phase.n}</div>
        <b>{session.phase.goal}</b>
        <p>{session.phase.tip}</p>
      </div>

      <div className="section-head"><h3>Quick sessions</h3><span>Any time</span></div>
      <div className="qs-row">
        {QUICK.map((q) => (
          <button key={q.id} className="qs tap" onClick={() => openQuick(q.id)}>
            <Thumb3D id={q.hero} alt="" />
            <div className="shade" />
            <span className="glass-pill">{q.mins} min</span>
            <div className="qs-body"><b>{q.title}</b><span>{q.blurb}</span></div>
          </button>
        ))}
      </div>

      <p className="disclaimer">Stretch to mild discomfort, never pain. Stop if you feel sharp, pinching or nerve-like pain.</p>
    </div>
  );
}
