import { useState, useCallback } from "react";
import { supabase } from "./supabase";

// ─── Constants ────────────────────────────────────────────────────────────────
const PROJECT_START = new Date("2026-04-08T00:00:00");
const DEADLINE      = new Date("2026-07-01T00:00:00");
const TOTAL_DAYS    = 84;

// Fan geometry — quarter circle anchored at bottom-left
// Day 1 is at the right/bottom of the fan (360°), Day 84 at the top (270°)
const FAN_END       = 360;   // day 1 side  (pointing right from center)
const FAN_START     = 270;   // day 84 side (pointing up from center)
const FAN_SWEEP     = FAN_END - FAN_START; // 90°
const SEG_ANGLE     = FAN_SWEEP / TOTAL_DAYS; // ≈ 1.071° per day
const SEG_GAP       = 0.18;  // degrees gap between adjacent segments
const RING_GAP      = 4;     // viewBox units between rings
const INNER_BASE    = 70;    // innermost ring inner radius (viewBox units)
const LABEL_PAD     = 28;    // space outside outermost ring for day labels

// SVG viewBox — square, center at (0, VB) = bottom-left corner
const VB = 1000;
const CX = 0;
const CY = VB;

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

// Clockwise arc segment path (SVG sweep-flag = 1)
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

// Angle range for day d (0-indexed). Day 0 = day 1 is at the FAN_END / right side.
function dayAngles(d) {
  const end   = FAN_END - d * SEG_ANGLE;
  const start = FAN_END - (d + 1) * SEG_ANGLE;
  return { start: start + SEG_GAP / 2, end: end - SEG_GAP / 2 };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatBox({ label, value, color }) {
  return (
    <div style={{
      flex: 1,
      background: "#111",
      border: "1px solid #1c1c1c",
      borderRadius: 10,
      padding: "12px 8px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || "#fff", lineHeight: 1, fontFamily: "system-ui" }}>
        {value}
      </div>
      <div style={{ fontSize: 8, color: "#3a3a3a", letterSpacing: 2, marginTop: 5 }}>{label}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Project100({ session, onBack }) {
  const [habits,    setHabits]    = useState(() => ls.get("yz-p100-habits") || DEFAULT_HABITS);
  const [wheel,     setWheel]     = useState(() => ls.get("yz-p100-wheel")  || {});
  const [editingId, setEditingId] = useState(null);
  const [editVal,   setEditVal]   = useState("");

  // ── Date calculations ──────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const msPerDay  = 86400000;
  const elapsed   = Math.min(TOTAL_DAYS, Math.max(0, Math.floor((today - PROJECT_START) / msPerDay)));
  const daysLeft  = Math.max(0, Math.ceil((DEADLINE - today) / msPerDay));
  // today's day-index in the project (0-based), capped at 83
  const todayIdx  = Math.min(TOTAL_DAYS - 1, elapsed);

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
  const deleteHabit = (id)         => saveHabits(habits.filter(h => h.id !== id));
  const renameHabit = (id, label)  => saveHabits(habits.map(h => h.id === id ? { ...h, label } : h));

  const handleSeg = (hi, d) => {
    const k = `${hi}-${d}`;
    saveWheel({ ...wheel, [k]: ((wheel[k] || 0) + 1) % 3 });
  };

  // ── Ring geometry ──────────────────────────────────────────────────────────
  const n         = habits.length || 1;
  const maxR      = VB - LABEL_PAD;
  const ringW     = Math.max(20, (maxR - INNER_BASE - RING_GAP * (n - 1)) / n);
  const outerEdge = INNER_BASE + n * (ringW + RING_GAP) - RING_GAP;
  const labelR    = outerEdge + LABEL_PAD - 4;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      height: "100vh",
      background: "#0a0a0a",
      color: "#fff",
      fontFamily: "system-ui, -apple-system, sans-serif",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div style={{
        borderBottom: "1px solid #1a1a1a",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 2px" }}
        >
          ←
        </button>
        <span style={{ fontSize: 11, color: "#333", letterSpacing: 3, fontWeight: 700 }}>YEAR ZERO</span>
        <span style={{ color: "#1f1f1f", fontSize: 14 }}>·</span>
        <span style={{ fontSize: 11, color: "#444", letterSpacing: 1 }}>
          ◆ Project 100 ·{" "}
          <span style={{ color: "#00FF88", fontWeight: 700 }}>{daysLeft} days left</span>
        </span>
        <div style={{ marginLeft: "auto", fontSize: 9, color: "#2a2a2a", letterSpacing: 1 }}>
          DAY {Math.min(elapsed + 1, 84)} OF 84
        </div>
      </div>

      {/* ── Two-panel layout ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── LEFT PANEL ─────────────────────────────────────────────────────── */}
        <div style={{
          width: 260,
          flexShrink: 0,
          borderRight: "1px solid #1a1a1a",
          padding: "24px 16px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}>

          {/* Big days remaining */}
          <div>
            <div style={{
              fontSize: 80,
              fontWeight: 800,
              color: "#00FF88",
              lineHeight: 1,
              fontFamily: "system-ui",
              letterSpacing: -2,
            }}>
              {daysLeft}
            </div>
            <div style={{ fontSize: 9, color: "#3a3a3a", letterSpacing: 3, marginTop: 6 }}>DAYS LEFT</div>
          </div>

          {/* Stat boxes */}
          <div style={{ display: "flex", gap: 6 }}>
            <StatBox label="STREAK"  value={streak}        color="#FFD700" />
            <StatBox label="DONE %"  value={`${donePct}%`} color="#00FF88" />
            <StatBox label="HABITS"  value={habits.length}  color="#A78BFA" />
          </div>

          {/* Habit list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {habits.map((h, hi) => {
              let done = 0;
              for (let d = 0; d < elapsed; d++) if ((wheel[`${hi}-${d}`] || 0) === 1) done++;
              const pct = elapsed ? Math.round(done / elapsed * 100) : 0;

              return (
                <div
                  key={h.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "#111",
                    borderRadius: 8,
                    overflow: "hidden",
                    border: "1px solid #1a1a1a",
                  }}
                >
                  {/* Colour bar */}
                  <div style={{ width: 4, alignSelf: "stretch", background: h.color, flexShrink: 0 }} />

                  {/* Label / edit */}
                  <div style={{ flex: 1, padding: "10px 10px 10px 10px", minWidth: 0 }}>
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
                        style={{
                          width: "100%",
                          background: "transparent",
                          border: "none",
                          borderBottom: "1px solid #333",
                          color: "#fff",
                          fontSize: 11,
                          outline: "none",
                          fontFamily: "inherit",
                        }}
                      />
                    ) : (
                      <span
                        onClick={() => { setEditingId(h.id); setEditVal(h.label); }}
                        title="Click to rename"
                        style={{
                          fontSize: 11,
                          cursor: "pointer",
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: "#ccc",
                        }}
                      >
                        {h.label}
                      </span>
                    )}
                  </div>

                  {/* Completion % */}
                  <span style={{ fontSize: 11, fontWeight: 700, color: h.color, paddingRight: 6, flexShrink: 0 }}>
                    {pct}%
                  </span>

                  {/* Delete */}
                  <button
                    onClick={() => deleteHabit(h.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#2a2a2a",
                      cursor: "pointer",
                      fontSize: 16,
                      padding: "0 8px 0 0",
                      flexShrink: 0,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}

            <button
              onClick={addHabit}
              style={{
                padding: "9px",
                background: "transparent",
                border: "1px dashed #1f1f1f",
                borderRadius: 8,
                color: "#2a2a2a",
                fontSize: 10,
                cursor: "pointer",
                letterSpacing: 2,
                marginTop: 2,
              }}
            >
              + ADD HABIT
            </button>
          </div>

          {/* Legend */}
          <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 14 }}>
            <div style={{ fontSize: 8, color: "#222", letterSpacing: 2, marginBottom: 10 }}>
              CLICK SEGMENTS TO LOG
            </div>
            {[
              { label: "EMPTY",  color: "#1e1e1e", border: "#2a2a2a" },
              { label: "DONE",   color: "#00FF88", border: "#00FF88" },
              { label: "MISSED", color: "#cc2200", border: "#cc2200" },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: s.color, border: `1px solid ${s.border}`, flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: "#333", letterSpacing: 1 }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT PANEL — Fan wheel ─────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          <div style={{
            position: "absolute",
            top: 12,
            left: 16,
            fontSize: 8,
            color: "#1f1f1f",
            letterSpacing: 2,
          }}>
            84-DAY HABIT WHEEL · CLICK ANY SEGMENT TO LOG
          </div>

          <svg
            viewBox={`0 0 ${VB} ${VB}`}
            width="100%"
            height="100%"
            preserveAspectRatio="xMinYMax meet"
            style={{ display: "block" }}
          >
            {/* ── Rings ──────────────────────────────────────────────────────── */}
            {habits.map((habit, hi) => {
              const innerR = INNER_BASE + hi * (ringW + RING_GAP);
              const outerR = innerR + ringW;

              return Array.from({ length: TOTAL_DAYS }, (_, d) => {
                const state = wheel[`${hi}-${d}`] || 0;
                const { start, end } = dayAngles(d);
                const fill = state === 1 ? habit.color
                           : state === 2 ? "#cc2200"
                           : "#1a1a1a";

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

            {/* ── Day labels along outer edge (every 7 + today) ─────────────── */}
            {Array.from({ length: TOTAL_DAYS }, (_, d) => {
              const isToday = d === todayIdx;
              // show every 7th: days 7, 14, 21 ... 84 (d=6,13,...83)
              if ((d + 1) % 7 !== 0 && !isToday) return null;
              const midDeg = FAN_END - (d + 0.5) * SEG_ANGLE;
              const pt     = ptOn(labelR, midDeg);
              return (
                <text
                  key={`lbl-${d}`}
                  x={pt.x}
                  y={pt.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={isToday ? 12 : 10}
                  fill={isToday ? "#ffffff" : "#2e2e2e"}
                  fontFamily="system-ui"
                  fontWeight={isToday ? 700 : 400}
                >
                  {d + 1}
                </text>
              );
            })}

            {/* ── Today marker — white tick just outside outermost ring ──────── */}
            {elapsed > 0 && (() => {
              const midDeg = FAN_END - (todayIdx + 0.5) * SEG_ANGLE;
              const p1 = ptOn(outerEdge + 5, midDeg);
              const p2 = ptOn(outerEdge + LABEL_PAD - 6, midDeg);
              return (
                <line
                  x1={p1.x} y1={p1.y}
                  x2={p2.x} y2={p2.y}
                  stroke="#ffffff"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              );
            })()}

            {/* ── Ring labels (habit number) on inner arc ────────────────────── */}
            {habits.map((habit, hi) => {
              const innerR = INNER_BASE + hi * (ringW + RING_GAP);
              const midR   = innerR + ringW / 2;
              // Place label at the very end of the fan (day 84 side, near 270°)
              const labelDeg = FAN_START + SEG_ANGLE * 0.7;
              const pt = ptOn(midR, labelDeg);
              return (
                <text
                  key={`rlbl-${hi}`}
                  x={pt.x}
                  y={pt.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={Math.min(14, ringW * 0.12)}
                  fill={habit.color}
                  fontFamily="system-ui"
                  fontWeight={700}
                  opacity={0.5}
                >
                  {hi + 1}
                </text>
              );
            })}

            {/* ── Inner hub label ────────────────────────────────────────────── */}
            <text
              x={CX + INNER_BASE * 0.35}
              y={CY - INNER_BASE * 0.35}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fill="#222"
              fontFamily="system-ui"
              letterSpacing={1}
            >
              {elapsed}d
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}
