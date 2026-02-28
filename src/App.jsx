import { useState, useEffect, useCallback } from "react";

// ─── localStorage persistence ────────────────────────────────────────────────
const ls = {
  get(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch { return false; }
  },
};

const getWeekKey = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return `yz-week-${d.toISOString().slice(0, 10)}`;
};

// ─── Config ──────────────────────────────────────────────────────────────────
const SECTIONS = {
  business: {
    label: "Business", color: "#00FF88", icon: "◈", goal: "Leave Corporate · £15k/month",
    daily: [
      { label: "100 Outbound touches", unit: "/day", key: "d0" },
      { label: "30min Follow-ups", unit: "min", key: "d1" },
      { label: "30min Fulfillment/skill", unit: "min", key: "d2" },
      { label: "Pipeline update", unit: "10min", key: "d3" },
    ],
    weekly: [
      { label: "Reach outs", min: 0, max: 700, target: 500, unit: "reach outs", suffix: "/ 500" },
      { label: "Sales calls", min: 0, max: 15, target: 4, unit: "calls", suffix: "/ 4–6" },
      { label: "CRM cleanup", min: 0, max: 4, target: 1, unit: "hrs", suffix: "/ 1–2 hrs" },
      { label: "Authority post", min: 0, max: 5, target: 1, unit: "posts", suffix: "/ 1" },
    ],
  },
  fatLoss: {
    label: "Fat Loss", color: "#FF6B35", icon: "◉", goal: "102 kg → 85 kg",
    daily: [
      { label: "Log calories ~2000 kcal", unit: "kcal", key: "d0" },
      { label: "≥130g protein", unit: "g", key: "d1" },
      { label: "8,000+ steps", unit: "steps", key: "d2" },
      { label: "2–3L water", unit: "L", key: "d3" },
    ],
    weekly: [
      { label: "Strength sessions", min: 0, max: 7, target: 3, unit: "sessions", suffix: "/ 3" },
      { label: "Cardio sessions", min: 0, max: 7, target: 1, unit: "sessions", suffix: "/ 1 opt." },
      { label: "Weigh-ins", min: 0, max: 7, target: 7, unit: "days", suffix: "/ 7" },
      { label: "Avg loss (kg)", min: 0, max: 2, target: 0.35, unit: "kg", suffix: "/ −0.35 kg", step: 0.05 },
    ],
  },
  savings: {
    label: "Savings", color: "#FFD700", icon: "◆", goal: "£15k → £100k",
    daily: [
      { label: "Log spending", unit: "once", key: "d0" },
      { label: "24hr delay >£20", unit: "rule", key: "d1" },
      { label: "No consumer debt", unit: "rule", key: "d2" },
      { label: "CC paid in full", unit: "monthly", key: "d3" },
    ],
    weekly: [
      { label: "Net worth updated", min: 0, max: 1, target: 1, unit: "done", suffix: "/ 1", type: "check" },
      { label: "Spending reviewed", min: 0, max: 1, target: 1, unit: "done", suffix: "/ 1", type: "check" },
      { label: "Business cash logged", min: 0, max: 1, target: 1, unit: "done", suffix: "/ 1", type: "check" },
      { label: "50% profit transferred", min: 0, max: 1, target: 1, unit: "done", suffix: "/ 1", type: "check" },
    ],
  },
  social: {
    label: "Grow @X", color: "#A78BFA", icon: "◍", goal: "0 → 5,000 Followers",
    daily: [
      { label: "Write/refine post", unit: "30min", key: "d0" },
      { label: "Record short video", unit: "20min", key: "d1" },
      { label: "Comments + DMs", unit: "20min", key: "d2" },
      { label: "Meaningful comments", unit: "5–10", key: "d3" },
    ],
    weekly: [
      { label: "Main posts", min: 0, max: 10, target: 5, unit: "posts", suffix: "/ 5" },
      { label: "Reels / videos", min: 0, max: 10, target: 3, unit: "videos", suffix: "/ 3" },
      { label: "Comments left", min: 0, max: 150, target: 35, unit: "comments", suffix: "/ 35–70" },
      { label: "DMs sent", min: 0, max: 50, target: 20, unit: "DMs", suffix: "/ 20" },
    ],
  },
};

const Q_THEMES = ["Validate · First clients", "Tighten systems · Scale", "Systemize · Case studies", "Transition · Solidify ops"];
const SCHED = [
  { label: "WEEKDAY", sub: "Mon–Fri · 3 hrs", color: "#A78BFA", blocks: ["60min — 100 outbound touches", "30min — Follow-ups + CRM", "30min — Write/refine post", "15min — Comments + DMs", "15min — Log calories + weight + spend"] },
  { label: "SATURDAY", sub: "6–7 hrs", color: "#FF6B35", blocks: ["2hrs — Deep client work + SOPs", "2hrs — List building + extra outreach", "1.5hrs — Batch content (posts + videos)", "30min — Weekly money review", "1hr — Long workout + steps"] },
  { label: "SUNDAY", sub: "6–7 hrs", color: "#FFD700", blocks: ["2hrs — Sales calls / review recordings", "1.5hrs — Long walk / cardio", "1.5hrs — Record, edit, schedule content", "1hr — Metrics review + next week plan"] },
];

const emptyChecks = () => Object.fromEntries(Object.keys(SECTIONS).map(k => [k, [false, false, false, false]]));
const emptyActuals = () => Object.fromEntries(Object.keys(SECTIONS).map(k => [k, [null, null, null, null]]));

const weekPct = (checks, actuals) => {
  const sKeys = Object.keys(SECTIONS);
  let done = 0, total = 0;
  sKeys.forEach(sec => {
    done += (checks[sec] || []).filter(Boolean).length;
    done += SECTIONS[sec].weekly.filter((w, i) => { const a = (actuals[sec] || [])[i]; return a !== null && a !== undefined && a >= w.target; }).length;
    total += SECTIONS[sec].daily.length + SECTIONS[sec].weekly.length;
  });
  return Math.round((done / total) * 100);
};

// ─── Components ───────────────────────────────────────────────────────────────
function Ring({ pct, color, size = 60 }) {
  const r = (size - 8) / 2, circ = 2 * Math.PI * r, dash = Math.min(pct / 100, 1) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e1e1e" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.5s ease", filter: `drop-shadow(0 0 5px ${color}88)` }} />
    </svg>
  );
}

function CheckRow({ label, done, color, onToggle }) {
  return (
    <button onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: "5px 0", width: "100%", textAlign: "left" }}>
      <span style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${done ? color : "#3a3a3a"}`, background: done ? color + "22" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.18s", boxShadow: done ? `0 0 7px ${color}55` : "none" }}>
        {done && <span style={{ color, fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
      </span>
      <span style={{ fontSize: 13, color: done ? "#444" : "#bbb", textDecoration: done ? "line-through" : "none", letterSpacing: 0.2 }}>{label}</span>
    </button>
  );
}

function InputModal({ item, color, onSave, onClose }) {
  const [val, setVal] = useState(item.actual ?? 0);
  const isCheck = item.type === "check";
  const step = item.step || 1;
  const pct = Math.min(Math.round((val / item.target) * 100), 100);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000d", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#141414", border: `1px solid ${color}55`, borderRadius: 18, padding: 28, width: "min(340px, 94vw)" }}>
        <p style={{ fontSize: 9, color: "#555", letterSpacing: 2, margin: "0 0 4px" }}>LOG PROGRESS</p>
        <p style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, color: "#fff", letterSpacing: 1, margin: "0 0 4px" }}>{item.label}</p>
        <p style={{ fontSize: 11, color: "#555", margin: "0 0 24px" }}>Target: {item.suffix.replace("/ ", "")}</p>
        {isCheck ? (
          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            {["Not done", "Done"].map((opt, i) => (
              <button key={opt} onClick={() => setVal(i)} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `2px solid ${val === i ? color : "#2a2a2a"}`, background: val === i ? color + "20" : "#1a1a1a", color: val === i ? color : "#555", fontFamily: "'Bebas Neue', cursive", fontSize: 16, letterSpacing: 1, cursor: "pointer" }}>{opt}</button>
            ))}
          </div>
        ) : (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <button onClick={() => setVal(v => Math.max(item.min, parseFloat((v - step).toFixed(2))))} style={{ width: 42, height: 42, borderRadius: 8, border: "1px solid #2a2a2a", background: "#1a1a1a", color: "#aaa", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>−</button>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 52, color, lineHeight: 1, letterSpacing: 2, filter: `drop-shadow(0 0 10px ${color}55)` }}>{val}</div>
                <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{item.unit}</div>
              </div>
              <button onClick={() => setVal(v => Math.min(item.max, parseFloat((v + step).toFixed(2))))} style={{ width: 42, height: 42, borderRadius: 8, border: "1px solid #2a2a2a", background: "#1a1a1a", color: "#aaa", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>+</button>
            </div>
            <input type="range" min={item.min} max={item.max} step={step} value={val} onChange={e => setVal(parseFloat(e.target.value))} style={{ width: "100%", accentColor: color, cursor: "pointer" }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 9, color: "#333" }}>{item.min}</span>
              <span style={{ fontSize: 9, color: "#333" }}>{item.max}</span>
            </div>
          </div>
        )}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: "#555" }}>progress</span>
            <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 14, color: pct >= 100 ? "#00FF88" : color, letterSpacing: 1 }}>{pct}%</span>
          </div>
          <div style={{ height: 5, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? "#00FF88" : color, borderRadius: 3, transition: "width 0.3s ease" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid #2a2a2a", background: "#1a1a1a", color: "#555", fontSize: 11, cursor: "pointer", letterSpacing: 1 }}>CANCEL</button>
          <button onClick={() => onSave(val)} style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: `1px solid ${color}55`, background: color + "20", color, fontFamily: "'Bebas Neue', cursive", fontSize: 17, cursor: "pointer", letterSpacing: 2 }}>SAVE</button>
        </div>
      </div>
    </div>
  );
}

function WeekCard({ item, color, onClick }) {
  const hasData = item.actual !== null && item.actual !== undefined;
  const isCheck = item.type === "check";
  const pct = hasData ? Math.min(Math.round((item.actual / item.target) * 100), 100) : 0;
  const hit = hasData && item.actual >= item.target;
  const dc = hit ? "#00FF88" : color;
  return (
    <button onClick={onClick} style={{ position: "relative", overflow: "hidden", background: hasData ? color + "08" : "#181818", borderRadius: 10, padding: "10px 12px", border: `1px solid ${hasData ? color + "40" : "#242424"}`, cursor: "pointer", textAlign: "left", width: "100%" }}>
      {hasData && <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: `linear-gradient(90deg, ${color}14, transparent)`, pointerEvents: "none" }} />}
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 10, color: "#555", marginBottom: 3 }}>{item.label}</div>
        {hasData ? (
          <>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, color: dc, letterSpacing: 1, filter: `drop-shadow(0 0 5px ${dc}55)` }}>
              {isCheck ? (item.actual === 1 ? "✓ DONE" : "✗ PENDING") : item.actual}
              {!isCheck && <span style={{ fontSize: 9, color: "#444", marginLeft: 5 }}>{item.suffix}</span>}
            </div>
            {!isCheck && <div style={{ marginTop: 5, height: 2, background: "#1e1e1e", borderRadius: 1, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: dc }} /></div>}
          </>
        ) : (
          <div style={{ fontSize: 11, color: "#383838" }}>tap to log {item.suffix}</div>
        )}
      </div>
    </button>
  );
}

function GoalCard({ sectionKey, checks, onCheck, actuals, onSave }) {
  const s = SECTIONS[sectionKey];
  const [modal, setModal] = useState(null);
  const dd = checks.filter(Boolean).length;
  const wh = s.weekly.filter((w, i) => { const a = actuals[i]; return a !== null && a !== undefined && a >= w.target; }).length;
  const pct = Math.round(((dd + wh) / (s.daily.length + s.weekly.length)) * 100);
  return (
    <>
      {modal !== null && <InputModal item={{ ...s.weekly[modal], actual: actuals[modal] ?? 0 }} color={s.color} onSave={v => { onSave(sectionKey, modal, v); setModal(null); }} onClose={() => setModal(null)} />}
      <div style={{ background: "#111", border: `1px solid ${s.color}20`, borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", gap: 18, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 130, height: 130, borderRadius: "50%", background: `radial-gradient(circle, ${s.color}07 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
              <span style={{ color: s.color, fontSize: 18 }}>{s.icon}</span>
              <span style={{ color: s.color, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>{s.label}</span>
            </div>
            <div style={{ color: "#fff", fontFamily: "'Bebas Neue', cursive", fontSize: 20, letterSpacing: 1 }}>{s.goal}</div>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Ring pct={pct} color={s.color} size={60} />
            <span style={{ position: "absolute", fontFamily: "'Bebas Neue', cursive", fontSize: 13, color: "#fff", letterSpacing: 1 }}>{pct}%</span>
          </div>
        </div>
        <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: 14 }}>
          <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 7 }}>DAILY NON-NEGOTIABLES</div>
          {s.daily.map((item, i) => <CheckRow key={item.key} label={`${item.label} · ${item.unit}`} done={checks[i]} color={s.color} onToggle={() => onCheck(sectionKey, i)} />)}
        </div>
        <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: 14 }}>
          <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 10 }}>WEEKLY TARGETS <span style={{ color: "#2a2a2a" }}>· tap to log</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            {s.weekly.map((w, i) => <WeekCard key={i} item={{ ...w, actual: actuals[i] }} color={s.color} onClick={() => setModal(i)} />)}
          </div>
        </div>
      </div>
    </>
  );
}

function HistoryModal({ history, onClose }) {
  const weeks = Object.entries(history).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 20);
  const fmt = d => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000d", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 18, padding: 24, width: "min(680px, 96vw)", maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, color: "#fff", letterSpacing: 2 }}>WEEK HISTORY</div>
            <div style={{ fontSize: 9, color: "#444", letterSpacing: 1 }}>{weeks.length} weeks saved · data stored in your browser</div>
          </div>
          <button onClick={onClose} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#666", padding: "7px 14px", cursor: "pointer", fontSize: 10 }}>CLOSE</button>
        </div>
        {weeks.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: "#444", fontSize: 11 }}>No history yet — complete your first week!</div>
        ) : weeks.map(([key, wd]) => {
          const dateStr = key.replace("yz-week-", "");
          const endD = new Date(dateStr); endD.setDate(endD.getDate() + 6);
          const pcts = Object.keys(SECTIONS).map(sec => {
            const c = wd.checks?.[sec] || [false, false, false, false];
            const a = wd.actuals?.[sec] || [null, null, null, null];
            const d2 = c.filter(Boolean).length;
            const w2 = SECTIONS[sec].weekly.filter((w, i) => { const v = a[i]; return v !== null && v !== undefined && v >= w.target; }).length;
            return Math.round(((d2 + w2) / (SECTIONS[sec].daily.length + SECTIONS[sec].weekly.length)) * 100);
          });
          const overall = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
          const oc = overall >= 75 ? "#00FF88" : overall >= 50 ? "#FFD700" : "#FF6B35";
          return (
            <div key={key} style={{ background: "#181818", borderRadius: 12, padding: 16, marginBottom: 10, border: "1px solid #222" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 17, color: "#ccc", letterSpacing: 1 }}>{fmt(dateStr)} – {fmt(endD)}</div>
                <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 26, color: oc, filter: `drop-shadow(0 0 6px ${oc}55)` }}>{overall}%</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {Object.keys(SECTIONS).map((sec, i) => (
                  <div key={sec} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#444", marginBottom: 4 }}>{SECTIONS[sec].label}</div>
                    <div style={{ height: 3, background: "#252525", borderRadius: 2, overflow: "hidden", marginBottom: 3 }}><div style={{ height: "100%", width: `${pcts[i]}%`, background: SECTIONS[sec].color }} /></div>
                    <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 13, color: SECTIONS[sec].color }}>{pcts[i]}%</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const today = new Date();
  const start = new Date(today.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((today - start) / 86400000 + 1) / 7);
  const currentQ = Math.min(Math.ceil(weekNum / 13), 4);
  const dayLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][today.getDay()];
  const WEEK_KEY = getWeekKey();

  const [checks, setChecks] = useState(emptyChecks);
  const [actuals, setActuals] = useState(emptyActuals);
  const [history, setHistory] = useState({});
  const [saveFlash, setSaveFlash] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const wd = ls.get(WEEK_KEY);
    if (wd?.checks) setChecks(wd.checks);
    if (wd?.actuals) setActuals(wd.actuals);
    const hist = ls.get("yz-history") || {};
    setHistory(hist);
  }, []);

  const persist = useCallback((nc, na) => {
    const wd = { checks: nc, actuals: na, savedAt: Date.now() };
    ls.set(WEEK_KEY, wd);
    const newHist = { ...history, [WEEK_KEY]: wd };
    const trimmed = Object.fromEntries(Object.keys(newHist).sort().reverse().slice(0, 52).map(k => [k, newHist[k]]));
    ls.set("yz-history", trimmed);
    setHistory(trimmed);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1400);
  }, [history, WEEK_KEY]);

  const handleCheck = (sec, idx) => {
    const next = { ...checks, [sec]: checks[sec].map((v, i) => i === idx ? !v : v) };
    setChecks(next); persist(next, actuals);
  };
  const handleSave = (sec, idx, val) => {
    const next = { ...actuals, [sec]: actuals[sec].map((v, i) => i === idx ? val : v) };
    setActuals(next); persist(checks, next);
  };

  const allDaily = Object.values(checks).flat();
  const dailyDone = allDaily.filter(Boolean).length;
  const dailyPct = Math.round((dailyDone / allDaily.length) * 100);
  const topColor = dailyPct >= 75 ? "#00FF88" : dailyPct >= 45 ? "#FFD700" : "#FF6B35";
  const pastWeeks = Object.keys(history).filter(k => k !== WEEK_KEY).length;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "'DM Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; overscroll-behavior: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
        button { font-family: inherit; transition: opacity 0.15s; }
        button:hover { opacity: 0.82; }
        button:active { opacity: 0.65; transform: scale(0.97); }
      `}</style>

      {showHistory && <HistoryModal history={history} onClose={() => setShowHistory(false)} />}

      {/* Save flash */}
      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 5000, background: "#141414", border: "1px solid #00FF8855", borderRadius: 10, padding: "9px 16px", fontSize: 11, color: "#00FF88", letterSpacing: 1, transition: "opacity 0.3s", opacity: saveFlash ? 1 : 0, pointerEvents: "none" }}>
        ✓ Saved
      </div>

      {/* Top bar */}
      <div style={{ borderBottom: "1px solid #1a1a1a", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#0a0a0a", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 3, color: "#fff" }}>YEAR ZERO</span>
          <span style={{ background: "#00FF8812", border: "1px solid #00FF8830", borderRadius: 6, padding: "3px 9px", fontSize: 10, color: "#00FF88", letterSpacing: 2 }}>Q{currentQ}</span>
          <button onClick={() => setShowHistory(true)} style={{ background: "#181818", border: "1px solid #252525", borderRadius: 7, padding: "4px 11px", cursor: "pointer", fontSize: 10, color: "#555", letterSpacing: 1 }}>
            HISTORY {pastWeeks > 0 ? `· ${pastWeeks}wk` : ""}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 8, color: "#444", letterSpacing: 2 }}>TODAY</div>
            <div style={{ fontSize: 11, color: "#aaa" }}>{dayLabel.toUpperCase()} · WK {weekNum}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 8, color: "#444", letterSpacing: 2 }}>DAILY</div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, color: topColor, letterSpacing: 1 }}>{dailyPct}%</div>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ring pct={dailyPct} color={topColor} size={42} />
            <span style={{ position: "absolute", fontSize: 8, color: "#fff", fontWeight: 700 }}>{dailyDone}/{allDaily.length}</span>
          </div>
        </div>
      </div>

      {/* Quarters */}
      <div style={{ padding: "12px 20px 0", display: "flex", gap: 6 }}>
        {["Q1", "Q2", "Q3", "Q4"].map((q, i) => {
          const active = i + 1 === currentQ;
          return (
            <div key={q} style={{ flex: 1, background: active ? "#00FF8810" : "#111", border: `1px solid ${active ? "#00FF8838" : "#1a1a1a"}`, borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 16, color: active ? "#00FF88" : "#333", letterSpacing: 1 }}>{q}</span>
                {i + 1 < currentQ && <span style={{ color: "#00FF88", fontSize: 10 }}>✓</span>}
                {active && <span style={{ color: "#00FF88", fontSize: 8, letterSpacing: 1 }}>NOW</span>}
              </div>
              <div style={{ fontSize: 9, color: active ? "#777" : "#2a2a2a", marginTop: 1, lineHeight: 1.3 }}>{Q_THEMES[i]}</div>
            </div>
          );
        })}
      </div>

      {/* Year progress bar */}
      <div style={{ padding: "10px 20px 0", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 8, color: "#333", letterSpacing: 2, flexShrink: 0 }}>WK {weekNum}/52</span>
        <div style={{ flex: 1, height: 3, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(weekNum / 52) * 100}%`, background: "linear-gradient(90deg, #00FF88, #A78BFA)", borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: 8, color: "#333", letterSpacing: 1, flexShrink: 0 }}>{Math.round((weekNum / 52) * 100)}%</span>
      </div>

      {/* Goal cards */}
      <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {Object.keys(SECTIONS).map(key => (
          <GoalCard key={key} sectionKey={key} checks={checks[key]} onCheck={handleCheck} actuals={actuals[key]} onSave={handleSave} />
        ))}
      </div>

      {/* Schedule */}
      <div style={{ padding: "0 20px 24px" }}>
        <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 18, marginBottom: 12 }}>
          <span style={{ fontSize: 9, color: "#444", letterSpacing: 2 }}>WEEKLY SCHEDULE TEMPLATE</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {SCHED.map(day => (
            <div key={day.label} style={{ background: "#111", border: `1px solid ${day.color}20`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 18, color: day.color, letterSpacing: 2 }}>{day.label}</div>
              <div style={{ fontSize: 9, color: "#444", letterSpacing: 1, marginBottom: 10 }}>{day.sub}</div>
              {day.blocks.map((b, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "flex-start" }}>
                  <span style={{ color: day.color, fontSize: 7, marginTop: 4, flexShrink: 0 }}>▸</span>
                  <span style={{ fontSize: 11, color: "#777", lineHeight: 1.5 }}>{b}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: "1px solid #1a1a1a", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 9, color: "#222", letterSpacing: 1 }}>YEAR ZERO · INPUT-BASED SYSTEM · DATA SAVED LOCALLY</span>
        <div style={{ display: "flex", gap: 14 }}>
          {Object.values(SECTIONS).map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: s.color, fontSize: 9 }}>{s.icon}</span>
              <span style={{ fontSize: 9, color: "#333" }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
