import { useState, useCallback } from "react";
import { supabase } from "./supabase";

// ─── Constants ────────────────────────────────────────────────────────────────
const PROJECT_START = new Date("2025-04-08T00:00:00");
const TOTAL_DAYS = 84;

const DEFAULT_HABITS = [
  { id: "h0", label: "Habit 1", color: "#00FF88" },
  { id: "h1", label: "Habit 2", color: "#FF6B35" },
  { id: "h2", label: "Habit 3", color: "#FFD700" },
];

// ─── localStorage helpers ─────────────────────────────────────────────────────
const ls = {
  get(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      const ts = JSON.parse(localStorage.getItem("yz-ts") || "{}");
      ts[key] = Date.now();
      localStorage.setItem("yz-ts", JSON.stringify(ts));
    } catch {}
  },
};

// ─── SVG helpers ──────────────────────────────────────────────────────────────
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, innerR, outerR, startDeg, endDeg) {
  const s1 = polarToCartesian(cx, cy, outerR, startDeg);
  const e1 = polarToCartesian(cx, cy, outerR, endDeg);
  const s2 = polarToCartesian(cx, cy, innerR, endDeg);
  const e2 = polarToCartesian(cx, cy, innerR, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s1.x} ${s1.y} A ${outerR} ${outerR} 0 ${large} 1 ${e1.x} ${e1.y} L ${s2.x} ${s2.y} A ${innerR} ${innerR} 0 ${large} 0 ${e2.x} ${e2.y} Z`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Project100({ session, onBack }) {
  const [habits, setHabits] = useState(() => ls.get("yz-p100-habits") || DEFAULT_HABITS);
  const [wheel, setWheel] = useState(() => ls.get("yz-p100-wheel") || {});
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState("");

  // ── Date calculations ──────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date("2025-07-01T00:00:00");
  const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
  const daysPassed = Math.max(0, TOTAL_DAYS - Math.max(0, daysLeft));
  const progress = Math.min(100, Math.max(0, (daysPassed / TOTAL_DAYS) * 100));

  // Today's day number within the project (1–84)
  const rawDay = Math.ceil((today - PROJECT_START) / (1000 * 60 * 60 * 24)) + 1;
  const projectDayNum = Math.min(84, Math.max(1, rawDay));
  const elapsed = Math.min(TOTAL_DAYS, Math.max(0, rawDay - 1));

  const countdownColor = daysLeft > 30 ? "#00FF88" : daysLeft > 10 ? "#FFD700" : "#FF3B3B";

  // ── Supabase sync ──────────────────────────────────────────────────────────
  const syncKey = useCallback(async (key, data) => {
    if (!session?.user?.id) return;
    await supabase.from("yz_data").upsert(
      { user_id: session.user.id, key, value: data, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    );
  }, [session]);

  const saveHabits = (newHabits) => {
    setHabits(newHabits);
    ls.set("yz-p100-habits", newHabits);
    syncKey("yz-p100-habits", newHabits);
  };

  const saveWheel = (newWheel) => {
    setWheel(newWheel);
    ls.set("yz-p100-wheel", newWheel);
    syncKey("yz-p100-wheel", newWheel);
  };

  // ── Habit management ───────────────────────────────────────────────────────
  const EXTRA_COLORS = ["#A78BFA", "#00D4FF", "#FF3B3B", "#FF69B4", "#7FFF00", "#FF8C00"];
  const addHabit = () => {
    const used = new Set(habits.map(h => h.color));
    const newColor = EXTRA_COLORS.find(c => !used.has(c)) || "#A78BFA";
    saveHabits([...habits, { id: `h${Date.now()}`, label: `Habit ${habits.length + 1}`, color: newColor }]);
  };
  const deleteHabit = (id) => saveHabits(habits.filter(h => h.id !== id));
  const renameHabit = (id, label) => saveHabits(habits.map(h => h.id === id ? { ...h, label } : h));

  // ── Wheel interaction ──────────────────────────────────────────────────────
  const handleSegmentClick = (hIdx, dIdx) => {
    const key = `${hIdx}-${dIdx}`;
    const next = ((wheel[key] || 0) + 1) % 4;
    saveWheel({ ...wheel, [key]: next });
  };

  // ── SVG layout ─────────────────────────────────────────────────────────────
  const RING_WIDTH = 34;
  const RING_GAP = 6;
  const INNER_BASE = 82;
  const SEG_GAP = 0.35; // degrees gap between segments
  const SEG_ANGLE = 360 / 84;

  const outerEdge = INNER_BASE + habits.length * (RING_WIDTH + RING_GAP);
  const labelR = outerEdge + 20;
  const svgRadius = labelR + 16;
  const svgSize = svgRadius * 2 + 4;
  const cx = svgSize / 2;
  const cy = svgSize / 2;

  // Segment fill for a given state + habit color
  const segFill = (state, color) => {
    if (state === 0) return ["#1a1a1a", "#2a2a2a"];
    if (state === 1) return [color, color];
    if (state === 2) return [color + "66", color + "88"];
    return ["#2a0a00", "#FF6B3599"];
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "'DM Mono', monospace" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@300;400;500&display=swap');`}</style>

      {/* ── Back / mini header ──────────────────────────────────────────────── */}
      <div style={{ borderBottom: "1px solid #1a1a1a", padding: "12px 20px", display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, background: "#0a0a0a", zIndex: 100 }}>
        <button
          onClick={onBack}
          style={{ background: "#181818", border: "1px solid #252525", borderRadius: 7, padding: "4px 12px", cursor: "pointer", fontSize: 10, color: "#555", letterSpacing: 1 }}
        >
          ← BACK
        </button>
        <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 3, color: "#fff" }}>PROJECT 100</span>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF6B35", boxShadow: "0 0 6px #FF6B3566" }} />
      </div>

      {/* ── Hero header ────────────────────────────────────────────────────── */}
      <div style={{ padding: "28px 24px 16px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 64, letterSpacing: 8, color: "#fff", lineHeight: 1 }}>
          PROJECT 100
        </div>

        {/* Countdown */}
        <div style={{
          marginTop: 10,
          fontFamily: "'Bebas Neue', cursive",
          fontSize: 48,
          letterSpacing: 4,
          color: countdownColor,
          filter: `drop-shadow(0 0 14px ${countdownColor}55)`,
          lineHeight: 1.1,
        }}>
          {Math.abs(daysLeft)} {daysLeft >= 0 ? "DAYS LEFT" : "DAYS PAST"}
        </div>
        <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginTop: 4 }}>
          DEADLINE: JUL 1 2025 · {TOTAL_DAYS}-DAY CHALLENGE
        </div>

        {/* Progress bar */}
        <div style={{ maxWidth: 580, margin: "16px auto 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#444", letterSpacing: 1, marginBottom: 5 }}>
            <span>APR 8</span>
            <span style={{ color: countdownColor }}>{Math.round(progress)}% COMPLETE · DAY {Math.min(projectDayNum, 84)}</span>
            <span>JUL 1</span>
          </div>
          <div style={{ height: 6, background: "#1a1a1a", borderRadius: 3, border: "1px solid #252525", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${progress}%`,
              background: `linear-gradient(90deg, #00FF88, ${countdownColor})`,
              borderRadius: 3,
              transition: "width 0.5s ease",
            }} />
          </div>
        </div>
      </div>

      {/* ── Main two-panel layout ───────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 20, padding: "8px 24px 28px", flexWrap: "wrap", alignItems: "flex-start" }}>

        {/* LEFT: Non-negotiables panel */}
        <div style={{ flex: "0 0 260px", background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, padding: 18 }}>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 16, letterSpacing: 3, color: "#fff", marginBottom: 14 }}>
            NON-NEGOTIABLES
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {habits.map((h, i) => (
              <div
                key={h.id}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "#181818", borderRadius: 8, border: "1px solid #222" }}
              >
                {/* Color swatch */}
                <div style={{
                  width: 11, height: 11, borderRadius: "50%",
                  background: h.color, flexShrink: 0,
                  boxShadow: `0 0 5px ${h.color}55`,
                }} />

                {/* Editable label */}
                {editingId === h.id ? (
                  <input
                    autoFocus
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onBlur={() => { renameHabit(h.id, editVal.trim() || h.label); setEditingId(null); }}
                    onKeyDown={e => {
                      if (e.key === "Enter") { renameHabit(h.id, editVal.trim() || h.label); setEditingId(null); }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    style={{
                      flex: 1, background: "transparent", border: "none",
                      borderBottom: "1px solid #555", color: "#fff",
                      fontSize: 10, fontFamily: "inherit", outline: "none", letterSpacing: 1,
                    }}
                  />
                ) : (
                  <span
                    onClick={() => { setEditingId(h.id); setEditVal(h.label); }}
                    style={{ flex: 1, fontSize: 10, letterSpacing: 1, cursor: "pointer", borderBottom: "1px dashed #2a2a2a" }}
                    title="Click to rename"
                  >
                    {h.label}
                  </span>
                )}

                {/* Ring number badge */}
                <span style={{ fontSize: 8, color: "#333", letterSpacing: 1, flexShrink: 0 }}>R{i + 1}</span>

                {/* Delete */}
                <button
                  onClick={() => deleteHabit(h.id)}
                  style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addHabit}
            style={{ marginTop: 10, width: "100%", padding: "7px 0", background: "#1a1a1a", border: "1px dashed #2a2a2a", borderRadius: 8, color: "#444", fontSize: 9, cursor: "pointer", letterSpacing: 1 }}
          >
            + ADD HABIT
          </button>

          {/* State legend */}
          <div style={{ marginTop: 18, borderTop: "1px solid #1a1a1a", paddingTop: 14 }}>
            <div style={{ fontSize: 8, color: "#2a2a2a", letterSpacing: 1, marginBottom: 8 }}>SEGMENT STATES (CLICK TO CYCLE)</div>
            {[
              { label: "EMPTY",   fill: "#1a1a1a", border: "#333" },
              { label: "DONE",    fill: "#00FF88", border: "#00FF88" },
              { label: "PARTIAL", fill: "#00FF8866", border: "#00FF8888" },
              { label: "MISSED",  fill: "#2a0a00", border: "#FF6B35" },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                <div style={{ width: 13, height: 13, borderRadius: 3, background: s.fill, border: `1px solid ${s.border}`, flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: "#3a3a3a", letterSpacing: 1 }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Circular habit wheel */}
        <div style={{ flex: 1, minWidth: 500, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 8, color: "#2a2a2a", letterSpacing: 2, marginBottom: 6 }}>
            84-DAY HABIT WHEEL · CLICK ANY SEGMENT TO LOG
          </div>

          <svg
            width={svgSize}
            height={svgSize}
            style={{ maxWidth: "100%", overflow: "visible" }}
          >
            {/* Rings */}
            {habits.map((habit, hIdx) => {
              const innerR = INNER_BASE + hIdx * (RING_WIDTH + RING_GAP);
              const outerR = innerR + RING_WIDTH;

              return Array.from({ length: 84 }, (_, dIdx) => {
                const state = wheel[`${hIdx}-${dIdx}`] || 0;
                const startDeg = dIdx * SEG_ANGLE + SEG_GAP / 2;
                const endDeg = (dIdx + 1) * SEG_ANGLE - SEG_GAP / 2;
                const d = arcPath(cx, cy, innerR, outerR, startDeg, endDeg);
                const [fill, stroke] = segFill(state, habit.color);

                return (
                  <path
                    key={`${hIdx}-${dIdx}`}
                    d={d}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={0.5}
                    style={{ cursor: "pointer", transition: "fill 0.12s" }}
                    onClick={() => handleSegmentClick(hIdx, dIdx)}
                  >
                    <title>Ring {hIdx + 1} · Day {dIdx + 1}</title>
                  </path>
                );
              });
            })}

            {/* Day number labels — every 7 + today */}
            {Array.from({ length: 84 }, (_, dIdx) => {
              const isToday = dIdx + 1 === projectDayNum;
              if (dIdx % 7 !== 0 && !isToday) return null;
              const midAngle = (dIdx + 0.5) * SEG_ANGLE;
              const rad = ((midAngle - 90) * Math.PI) / 180;
              const x = cx + labelR * Math.cos(rad);
              const y = cy + labelR * Math.sin(rad);
              return (
                <text
                  key={`lbl-${dIdx}`}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={isToday ? 9 : 7}
                  fill={isToday ? "#fff" : "#383838"}
                  fontFamily="DM Mono, monospace"
                  fontWeight={isToday ? 700 : 400}
                >
                  {dIdx + 1}
                </text>
              );
            })}

            {/* Today marker — white tick outside outermost ring */}
            {(() => {
              const midAngle = (projectDayNum - 0.5) * SEG_ANGLE;
              const rad = ((midAngle - 90) * Math.PI) / 180;
              const x1 = cx + (outerEdge + 2) * Math.cos(rad);
              const y1 = cy + (outerEdge + 2) * Math.sin(rad);
              const x2 = cx + (outerEdge + 9) * Math.cos(rad);
              const y2 = cy + (outerEdge + 9) * Math.sin(rad);
              return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />;
            })()}

            {/* Centre label */}
            <text x={cx} y={cy - 12} textAnchor="middle" fill="#333" fontSize={8} fontFamily="DM Mono, monospace" letterSpacing={2}>DAY</text>
            <text x={cx} y={cy + 14} textAnchor="middle" fill="#fff" fontSize={30} fontFamily="Bebas Neue, cursive" letterSpacing={2}>{projectDayNum}</text>
            <text x={cx} y={cy + 30} textAnchor="middle" fill="#333" fontSize={7} fontFamily="DM Mono, monospace" letterSpacing={1}>OF 84</text>
          </svg>
        </div>
      </div>

      {/* ── Summary row ────────────────────────────────────────────────────────── */}
      <div style={{ margin: "0 24px 32px", background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, padding: "14px 18px" }}>
        <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 13, letterSpacing: 3, color: "#333", marginBottom: 10 }}>SUMMARY · {elapsed} DAY{elapsed !== 1 ? "S" : ""} ELAPSED</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {habits.map((h, hIdx) => {
            let done = 0;
            for (let d = 0; d < elapsed; d++) {
              if ((wheel[`${hIdx}-${d}`] || 0) === 1) done++;
            }
            const pct = elapsed > 0 ? Math.round((done / elapsed) * 100) : 0;
            return (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#181818", borderRadius: 8, padding: "7px 13px", border: "1px solid #1e1e1e" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: h.color, flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: "#666", letterSpacing: 1 }}>{h.label}</span>
                <span style={{ fontSize: 9, color: h.color, letterSpacing: 1 }}>{done}/{elapsed}</span>
                <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 14, color: pct >= 70 ? "#00FF88" : pct >= 40 ? "#FFD700" : "#FF3B3B" }}>{pct}%</span>
              </div>
            );
          })}

          {/* Overall */}
          {(() => {
            let totalDone = 0;
            const totalPossible = elapsed * habits.length;
            for (let hIdx = 0; hIdx < habits.length; hIdx++) {
              for (let d = 0; d < elapsed; d++) {
                if ((wheel[`${hIdx}-${d}`] || 0) === 1) totalDone++;
              }
            }
            const pct = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#181818", borderRadius: 8, padding: "7px 13px", border: "1px solid #2a2a2a" }}>
                <span style={{ fontSize: 9, color: "#aaa", letterSpacing: 1 }}>OVERALL</span>
                <span style={{ fontSize: 9, color: "#555", letterSpacing: 1 }}>{totalDone}/{totalPossible}</span>
                <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 18, color: pct >= 70 ? "#00FF88" : pct >= 40 ? "#FFD700" : "#FF3B3B", filter: `drop-shadow(0 0 6px ${pct >= 70 ? "#00FF8866" : pct >= 40 ? "#FFD70066" : "#FF3B3B66"})` }}>
                  {pct}%
                </span>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
