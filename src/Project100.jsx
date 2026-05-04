import { useState, useCallback } from "react";
import { supabase } from "./supabase";

// ─── Constants ────────────────────────────────────────────────────────────────
const PROJECT_START = new Date("2026-04-08T00:00:00");
const DEADLINE      = new Date("2026-07-01T00:00:00");
const TOTAL_DAYS    = 84;

// Full 360° wheel — day 1 at 12 o'clock, clockwise
const WHEEL_START = -90;
const SEG_ANGLE   = 360 / TOTAL_DAYS;
const SEG_GAP     = 0.3;
const RING_GAP    = 6;
const INNER_BASE  = 80;
const LABEL_PAD   = 40;

const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;

const PALETTE = ["#00FF88", "#FF6B35", "#FFD700", "#A78BFA", "#60A5FA", "#F472B6", "#34D399"];

const DEFAULT_HABITS = [
  { id: "h1", label: "100 Outbound touches", color: "#00FF88" },
  { id: "h2", label: "Log calories",          color: "#FF6B35" },
  { id: "h3", label: "≥130g protein",          color: "#FFD700" },
  { id: "h4", label: "8,000+ steps",           color: "#A78BFA" },
  { id: "h5", label: "Log spending",           color: "#60A5FA" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ls = {
  get(k)    { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

function ptOn(r, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function segPath(innerR, outerR, startDeg, endDeg) {
  const o1 = ptOn(outerR, startDeg);
  const o2 = ptOn(outerR, endDeg);
  const i2 = ptOn(innerR, endDeg);
  const i1 = ptOn(innerR, startDeg);
  const lg = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return [
    `M ${o1.x},${o1.y}`,
    `A ${outerR},${outerR} 0 ${lg} 1 ${o2.x},${o2.y}`,
    `L ${i2.x},${i2.y}`,
    `A ${innerR},${innerR} 0 ${lg} 0 ${i1.x},${i1.y}`,
    "Z",
  ].join(" ");
}

function dayAngles(d) {
  const start = WHEEL_START + d * SEG_ANGLE;
  const end   = WHEEL_START + (d + 1) * SEG_ANGLE;
  return { start: start + SEG_GAP / 2, end: end - SEG_GAP / 2 };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatBox({ label, value, color, t }) {
  return (
    <div style={{
      flex: 1,
      background: t.statBg,
      border: `1px solid ${t.statBorder}`,
      borderRadius: 10,
      padding: "14px 8px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || t.text, lineHeight: 1, fontFamily: "system-ui" }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: t.subtext, letterSpacing: 2, marginTop: 5, fontFamily: "system-ui" }}>{label}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Project100({ session, darkMode = true }) {
  const [habits,    setHabits]    = useState(() => ls.get("yz-p100-habits") || DEFAULT_HABITS);
  const [wheel,     setWheel]     = useState(() => ls.get("yz-p100-wheel")  || {});
  const [editingId, setEditingId] = useState(null);
  const [editVal,   setEditVal]   = useState("");

  // ── Theme ──────────────────────────────────────────────────────────────────
  const t = darkMode ? {
    bg:           "#0a0a0a",
    surface:      "#111",
    border:       "#1a1a1a",
    text:         "#fff",
    subtext:      "#3a3a3a",
    dim:          "#1f1f1f",
    statBg:       "#111",
    statBorder:   "#1c1c1c",
    habitBg:      "#111",
    habitBorder:  "#1a1a1a",
    addBorder:    "#1f1f1f",
    addColor:     "#2a2a2a",
    emptyFill:    "#1a1a1a",
    legendBorder: "#1a1a1a",
    legendLabel:  "#222",
    labelDot:     "#2e2e2e",
    todayLbl:     "#ffffff",
    deleteColor:  "#2a2a2a",
    habitLabel:   "#ccc",
    logHint:      "#1f1f1f",
  } : {
    bg:           "#f2f1ed",
    surface:      "#fff",
    border:       "#e5e5e5",
    text:         "#1a1a1a",
    subtext:      "#aaa",
    dim:          "#e0e0e0",
    statBg:       "#fff",
    statBorder:   "#e5e5e5",
    habitBg:      "#fff",
    habitBorder:  "#ebebeb",
    addBorder:    "#ddd",
    addColor:     "#c0c0c0",
    emptyFill:    "#e4e4e4",
    legendBorder: "#e5e5e5",
    legendLabel:  "#ccc",
    labelDot:     "#bbb",
    todayLbl:     "#1a1a1a",
    deleteColor:  "#ccc",
    habitLabel:   "#555",
    logHint:      "#ddd",
  };

  // ── Date calculations ──────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const msPerDay = 86400000;
  const elapsed  = Math.min(TOTAL_DAYS, Math.max(0, Math.floor((today - PROJECT_START) / msPerDay)));
  const daysLeft = Math.max(0, Math.ceil((DEADLINE - today) / msPerDay));
  const todayIdx = Math.min(TOTAL_DAYS - 1, elapsed);

  // ── Stats ──────────────────────────────────────────────────────────────────
  let streak = 0;
  for (let d = elapsed - 1; d >= 0; d--) {
    if (habits.every((_, hi) => (wheel[`${hi}-${d}`] || 0) === 1)) streak++;
    else break;
  }

  let totalDone = 0;
  for (let hi = 0; hi < habits.length; hi++)
    for (let d = 0; d < elapsed; d++)
      if ((wheel[`${hi}-${d}`] || 0) === 1) totalDone++;
  const donePct = elapsed && habits.length
    ? Math.round(totalDone / (elapsed * habits.length) * 100)
    : 0;

  // ── Supabase sync ──────────────────────────────────────────────────────────
  const syncKey = useCallback(async (key, data) => {
    if (!session?.user?.id) return;
    await supabase.from("yz_data").upsert(
      { user_id: session.user.id, key, value: data, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    );
  }, [session]);

  const saveHabits = (h) => { setHabits(h); ls.set("yz-p100-habits", h); syncKey("yz-p100-habits", h); };
  const saveWheel  = (w) => { setWheel(w);  ls.set("yz-p100-wheel",  w); syncKey("yz-p100-wheel",  w); };

  // ── Habit CRUD ─────────────────────────────────────────────────────────────
  const addHabit = () => {
    const used  = new Set(habits.map(h => h.color));
    const color = PALETTE.find(c => !used.has(c)) || PALETTE[habits.length % PALETTE.length];
    saveHabits([...habits, { id: `h${Date.now()}`, label: "New habit", color }]);
  };
  const deleteHabit = (id)        => saveHabits(habits.filter(h => h.id !== id));
  const renameHabit = (id, label) => saveHabits(habits.map(h => h.id === id ? { ...h, label } : h));

  const handleSeg = (hi, d) => {
    const k = `${hi}-${d}`;
    saveWheel({ ...wheel, [k]: ((wheel[k] || 0) + 1) % 3 });
  };

  // ── Ring geometry ──────────────────────────────────────────────────────────
  const n         = habits.length || 1;
  const maxR      = VB / 2 - LABEL_PAD;
  const ringW     = Math.max(40, (maxR - INNER_BASE - RING_GAP * (n - 1)) / n);
  const outerEdge = INNER_BASE + n * (ringW + RING_GAP) - RING_GAP;
  const labelR    = outerEdge + 14;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      height: "calc(100vh - 52px)",
      background: t.bg,
      color: t.text,
      fontFamily: "system-ui, -apple-system, sans-serif",
      display: "flex",
      overflow: "hidden",
    }}>

      {/* ── LEFT PANEL ─────────────────────────────────────────────────────── */}
      <div style={{
        width: 290,
        flexShrink: 0,
        borderRight: `1px solid ${t.border}`,
        padding: "28px 20px",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 22,
        background: t.surface,
      }}>

        <div style={{ fontSize: 9, color: t.subtext, letterSpacing: 3, fontWeight: 600 }}>
          HABITS / GOALS
        </div>

        <div>
          <div style={{ fontSize: 72, fontWeight: 800, color: "#22c55e", lineHeight: 1, fontFamily: "system-ui", letterSpacing: -2 }}>
            {daysLeft}
          </div>
          <div style={{ fontSize: 9, color: t.subtext, letterSpacing: 2, marginTop: 4 }}>days left</div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <StatBox label="STREAK"  value={streak}        color="#FFD700" t={t} />
          <StatBox label="DONE"    value={`${donePct}%`} color="#22c55e" t={t} />
          <StatBox label="HABITS"  value={habits.length}  color="#A78BFA" t={t} />
        </div>

        {/* TODAY header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: -14 }}>
          <span style={{ fontSize: 8, color: t.subtext, letterSpacing: 2 }}>HABIT</span>
          <span style={{ fontSize: 8, color: t.subtext, letterSpacing: 2 }}>TODAY</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {habits.map((h, hi) => {
            let done = 0;
            for (let d = 0; d < elapsed; d++) if ((wheel[`${hi}-${d}`] || 0) === 1) done++;
            const pct = elapsed ? Math.round(done / elapsed * 100) : 0;
            const todayState = wheel[`${hi}-${todayIdx}`] || 0;
            const todayDone = todayState === 1;
            const toggleToday = () => {
              const k = `${hi}-${todayIdx}`;
              saveWheel({ ...wheel, [k]: todayDone ? 0 : 1 });
            };
            return (
              <div key={h.id} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                <div style={{ display: "flex", alignItems: "center", background: t.habitBg, borderRadius: 8, border: `1px solid ${todayDone ? h.color + "55" : t.habitBorder}`, overflow: "hidden", transition: "border-color 0.2s" }}>
                  <div style={{ width: 4, alignSelf: "stretch", background: h.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, padding: "10px 10px", minWidth: 0 }}>
                    {editingId === h.id ? (
                      <input
                        autoFocus
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => { renameHabit(h.id, editVal.trim() || h.label); setEditingId(null); }}
                        onKeyDown={e => {
                          if (e.key === "Enter")  { renameHabit(h.id, editVal.trim() || h.label); setEditingId(null); }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        style={{ width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${t.border}`, color: t.text, fontSize: 12, outline: "none", fontFamily: "inherit" }}
                      />
                    ) : (
                      <span
                        onClick={() => { setEditingId(h.id); setEditVal(h.label); }}
                        title="Click to rename"
                        style={{ fontSize: 12, cursor: "pointer", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: todayDone ? h.color : t.habitLabel }}
                      >
                        {h.label}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: t.subtext, paddingRight: 6, flexShrink: 0 }}>{pct}%</span>
                  {/* Today checkbox */}
                  <button
                    onClick={toggleToday}
                    title={todayDone ? "Mark as not done" : "Mark as done today"}
                    style={{
                      width: 28, height: 28,
                      borderRadius: 7,
                      border: `2px solid ${todayDone ? h.color : t.deleteColor}`,
                      background: todayDone ? h.color + "22" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, cursor: "pointer",
                      marginRight: 6,
                      transition: "all 0.15s",
                    }}
                  >
                    {todayDone && <span style={{ color: h.color, fontSize: 14, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </button>
                  <button onClick={() => deleteHabit(h.id)} style={{ background: "none", border: "none", color: t.deleteColor, cursor: "pointer", fontSize: 16, padding: "0 8px 0 0", flexShrink: 0, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ height: 3, background: t.border, borderRadius: "0 0 3px 3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: h.color, transition: "width 0.3s ease" }} />
                </div>
              </div>
            );
          })}

          <button onClick={addHabit} style={{ marginTop: 4, padding: "9px", background: "transparent", border: `1px dashed ${t.addBorder}`, borderRadius: 8, color: t.addColor, fontSize: 10, cursor: "pointer", letterSpacing: 2, fontFamily: "system-ui" }}>
            + ADD HABIT
          </button>
        </div>

        <div style={{ borderTop: `1px solid ${t.legendBorder}`, paddingTop: 14, marginTop: "auto" }}>
          <div style={{ fontSize: 8, color: t.legendLabel, letterSpacing: 2, marginBottom: 10 }}>CHECK TODAY · OR CLICK SEGMENTS</div>
          {[
            { label: "Empty",  color: t.emptyFill, border: t.border },
            { label: "Done",   color: "#22c55e",   border: "#22c55e" },
            { label: "Missed", color: "#ef4444",   border: "#ef4444" },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: s.color, border: `1px solid ${s.border}`, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: t.subtext, letterSpacing: 0.5 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL — Full 360° wheel ──────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative", background: t.bg }}>
        <div style={{ position: "absolute", top: 14, left: 18, fontSize: 9, color: t.logHint, letterSpacing: 2, fontFamily: "system-ui" }}>
          84-DAY HABIT WHEEL
        </div>

        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block" }}
        >
          {/* ── Rings ──────────────────────────────────────────────────────── */}
          {habits.map((habit, hi) => {
            const innerR = INNER_BASE + hi * (ringW + RING_GAP);
            const outerR = innerR + ringW;
            return Array.from({ length: TOTAL_DAYS }, (_, d) => {
              const state = wheel[`${hi}-${d}`] || 0;
              const { start, end } = dayAngles(d);
              const fill = state === 1 ? "#22c55e"
                         : state === 2 ? "#ef4444"
                         : t.emptyFill;
              return (
                <path
                  key={`${hi}-${d}`}
                  d={segPath(innerR, outerR, start, end)}
                  fill={fill}
                  onClick={() => handleSeg(hi, d)}
                  style={{ cursor: "pointer" }}
                >
                  <title>{habit.label} · Day {d + 1}</title>
                </path>
              );
            });
          })}

          {/* ── Day labels — every 7th + today ─────────────────────────────── */}
          {Array.from({ length: TOTAL_DAYS }, (_, d) => {
            const isToday = d === todayIdx && elapsed > 0;
            if ((d + 1) % 7 !== 0 && !isToday) return null;
            const midDeg = WHEEL_START + (d + 0.5) * SEG_ANGLE;
            const pt     = ptOn(labelR, midDeg);
            return (
              <text
                key={`lbl-${d}`}
                x={pt.x} y={pt.y}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={isToday ? 13 : 11}
                fill={isToday ? t.todayLbl : t.labelDot}
                fontFamily="system-ui"
                fontWeight={isToday ? 700 : 400}
              >
                {d + 1}
              </text>
            );
          })}

          {/* ── Today tick ─────────────────────────────────────────────────── */}
          {elapsed > 0 && (() => {
            const midDeg = WHEEL_START + (todayIdx + 0.5) * SEG_ANGLE;
            const p1 = ptOn(outerEdge + 4, midDeg);
            const p2 = ptOn(outerEdge + LABEL_PAD - 8, midDeg);
            return (
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke={t.todayLbl} strokeWidth={2.5} strokeLinecap="round" />
            );
          })()}

          {/* ── Center hub ─────────────────────────────────────────────────── */}
          <text x={CX} y={CY - 14} textAnchor="middle" dominantBaseline="middle"
            fontSize={32} fill={t.text} fontFamily="system-ui" fontWeight={800}>
            {elapsed}
          </text>
          <text x={CX} y={CY + 16} textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fill={t.subtext} fontFamily="system-ui" letterSpacing={2}>
            DAYS IN
          </text>
        </svg>
      </div>
    </div>
  );
}
