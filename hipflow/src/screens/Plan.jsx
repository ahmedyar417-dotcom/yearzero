import { PHASES, PROGRAM_DAYS, sessionFor, programDay, addDays, fmtDate } from "../data/program.js";
import { doneDaySet } from "../lib.js";

export default function Plan({ store, today, openDay }) {
  const day = programDay(store.startDate, today);
  const doneDays = doneDaySet(store.sessions);
  return (
    <div className="screen">
      <div className="top">
        <div>
          <div className="kicker">{fmtDate(store.startDate, { day: "numeric", month: "short" })} – {fmtDate(addDays(store.startDate, PROGRAM_DAYS - 1), { day: "numeric", month: "short" })}</div>
          <h1>Your plan</h1>
        </div>
        <span className="pill">{doneDays.size}/{PROGRAM_DAYS}</span>
      </div>
      <p className="muted small" style={{ margin: "-4px 2px 0", lineHeight: 1.5 }}>Each week: Front → Back → Inner, twice, then a full-hip Flow. Tap any day to preview it.</p>
      {PHASES.map((p) => (
        <div key={p.n} className="card phase-block" style={{ "--phase": p.color }}>
          <div className="phase-head">
            <span className="phase-num">{p.n}</span>
            <div>
              <b>{p.name}</b>
              <span className="muted">Weeks {p.weeks.join("–")} · {p.goal}</span>
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
                    <button key={d} className={`day tap ${cls}`} onClick={() => openDay(d)} aria-label={`Day ${d}: ${s.dayType.name}`}>
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
