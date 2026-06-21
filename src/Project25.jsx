import { useState, useCallback } from "react";
import { supabase } from "./supabase";

// ─── Constants ────────────────────────────────────────────────────────────────
const TOTAL_DAYS = 115;
const ACCENT     = "#E8B04B";

const WHEEL_START = -90;
const SEG_ANGLE   = 360 / TOTAL_DAYS;
const SEG_GAP     = 0.3;
const RING_GAP    = 6;
const INNER_BASE  = 80;
const LABEL_PAD   = 52;

const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;

const PALETTE = ["#E8B04B","#54B8A4","#E0735C","#9B8BD9","#5FA8E0","#D98BB0","#9FC04A","#E8794B"];

const MONTHS = [
  { label: "JUL", startDay: 0,  days: 31 },
  { label: "AUG", startDay: 31, days: 31 },
  { label: "SEP", startDay: 62, days: 30 },
  { label: "OCT", startDay: 92, days: 23 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ls = {
  get(k)    { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Use local date parts to avoid UTC off-by-one
function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function indexToDate(idx) {
  const d = new Date(2026, 6, 1);
  d.setDate(d.getDate() + idx);
  return d;
}

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
  const s = WHEEL_START + d * SEG_ANGLE;
  const e = WHEEL_START + (d + 1) * SEG_ANGLE;
  return { start: s + SEG_GAP / 2, end: e - SEG_GAP / 2 };
}

const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ─── Main component ───────────────────────────────────────────────────────────
export default function Project25({ session, darkMode = true }) {
  const [habits,     setHabits]     = useState(() => ls.get("yz-p25-habits") || []);
  const [selectedId, setSelectedId] = useState(null);
  const [newName,    setNewName]    = useState("");
  const [newColor,   setNewColor]   = useState(PALETTE[0]);

  // ── Theme — mirrors Project100 exactly ────────────────────────────────────
  const t = darkMode ? {
    bg:          "#0a0a0a",
    surface:     "#111",
    border:      "#1a1a1a",
    text:        "#fff",
    subtext:     "#3a3a3a",
    dim:         "#1f1f1f",
    habitBg:     "#111",
    habitBorder: "#1a1a1a",
    addBorder:   "#1f1f1f",
    addColor:    "#2a2a2a",
    deleteColor: "#2a2a2a",
    habitLabel:  "#ccc",
    labelDot:    "#2e2e2e",
  } : {
    bg:          "#f2f1ed",
    surface:     "#fff",
    border:      "#e5e5e5",
    text:        "#1a1a1a",
    subtext:     "#aaa",
    dim:         "#e0e0e0",
    habitBg:     "#fff",
    habitBorder: "#ebebeb",
    addBorder:   "#ddd",
    addColor:    "#c0c0c0",
    deleteColor: "#ccc",
    habitLabel:  "#555",
    labelDot:    "#bbb",
  };

  // ── Date calculations ──────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const projectStart = new Date(2026, 6, 1);
  const todayIdx     = Math.floor((today - projectStart) / 86400000);

  const isBeforeStart  = todayIdx < 0;
  const isDuring       = todayIdx >= 0 && todayIdx < TOTAL_DAYS;
  const isAfterEnd     = todayIdx >= TOTAL_DAYS;
  const daysUntilStart = isBeforeStart ? Math.ceil((projectStart - today) / 86400000) : 0;

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalPossible = habits.length * TOTAL_DAYS;
  let totalDone = 0;
  habits.forEach(h => {
    for (let d = 0; d < TOTAL_DAYS; d++) {
      if (h.completions?.[dateKey(indexToDate(d))]) totalDone++;
    }
  });
  const pct = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;

  // ── Supabase sync — same pattern as Project100 ────────────────────────────
  const syncKey = useCallback(async (key, data) => {
    if (!session?.user?.id) return;
    await supabase.from("yz_data").upsert(
      { user_id: session.user.id, key, value: data, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    );
  }, [session]);

  const saveHabits = (h) => {
    setHabits(h);
    ls.set("yz-p25-habits", h);
    syncKey("yz-p25-habits", h);
  };

  // ── Habit CRUD ─────────────────────────────────────────────────────────────
  const addHabit = () => {
    const name = newName.trim();
    if (!name) return;
    const id      = `p25-${Date.now()}`;
    const updated = [...habits, { id, name, color: newColor, completions: {} }];
    saveHabits(updated);
    setSelectedId(id);
    setNewName("");
    const usedColors = new Set(updated.map(h => h.color));
    const next = PALETTE.find(c => !usedColors.has(c)) || PALETTE[updated.length % PALETTE.length];
    setNewColor(next);
  };

  const deleteHabit = (id) => {
    saveHabits(habits.filter(h => h.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const toggleDay = (habitId, dk) => {
    const updated = habits.map(h => {
      if (h.id !== habitId) return h;
      const c = { ...h.completions };
      if (c[dk]) delete c[dk]; else c[dk] = true;
      return { ...h, completions: c };
    });
    saveHabits(updated);
  };

  const reset = () => {
    if (!window.confirm("Reset all Project 25 habits and progress? This cannot be undone.")) return;
    saveHabits([]);
    setSelectedId(null);
  };

  // ── Ring geometry ──────────────────────────────────────────────────────────
  const n         = habits.length || 1;
  const maxR      = VB / 2 - LABEL_PAD;
  const ringW     = Math.max(30, (maxR - INNER_BASE - RING_GAP * (n - 1)) / n);
  const outerEdge = INNER_BASE + n * (ringW + RING_GAP) - RING_GAP;

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
        padding: "24px 20px",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        background: t.surface,
      }}>

        {/* Header */}
        <div>
          <div style={{ fontSize: 9, color: t.subtext, letterSpacing: 3, fontWeight: 600 }}>PROJECT 25</div>
          <div style={{ fontSize: 8, color: t.labelDot, letterSpacing: 1, marginTop: 3 }}>
            1 JUL – 23 OCT 2026 · 115 DAYS
          </div>
        </div>

        {/* Window state summary */}
        <div>
          {isBeforeStart && (
            <div>
              <div style={{ fontSize: 9, color: t.subtext, letterSpacing: 2, marginBottom: 4 }}>STARTS IN</div>
              <div style={{ fontSize: 52, fontWeight: 800, color: ACCENT, lineHeight: 1, letterSpacing: -2, fontVariantNumeric: "tabular-nums" }}>
                {daysUntilStart}
              </div>
              <div style={{ fontSize: 9, color: t.subtext, letterSpacing: 2, marginTop: 4 }}>DAYS</div>
            </div>
          )}
          {isDuring && (
            <div>
              <div style={{ fontSize: 9, color: t.subtext, letterSpacing: 2, marginBottom: 4 }}>DAY</div>
              <div style={{ fontSize: 52, fontWeight: 800, color: t.text, lineHeight: 1, letterSpacing: -2, fontVariantNumeric: "tabular-nums" }}>
                {todayIdx + 1}
              </div>
              <div style={{ fontSize: 9, color: t.subtext, letterSpacing: 1, marginTop: 4 }}>
                OF 115 · <span style={{ color: ACCENT }}>{pct}% logged</span>
              </div>
            </div>
          )}
          {isAfterEnd && (
            <div>
              <div style={{ fontSize: 9, color: "#22c55e", letterSpacing: 2, marginBottom: 4 }}>COMPLETE</div>
              <div style={{ fontSize: 52, fontWeight: 800, color: "#22c55e", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {pct}%
              </div>
              <div style={{ fontSize: 9, color: t.subtext, letterSpacing: 2, marginTop: 4 }}>115 DAYS</div>
            </div>
          )}
        </div>

        {/* Add habit */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 8, color: t.subtext, letterSpacing: 2 }}>ADD HABIT</div>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addHabit(); }}
            placeholder="Habit name…"
            style={{
              background: t.bg,
              border: `1px solid ${t.addBorder}`,
              borderRadius: 8,
              padding: "8px 10px",
              color: t.text,
              fontSize: 12,
              outline: "none",
              fontFamily: "inherit",
              width: "100%",
            }}
          />
          {/* Palette swatches */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {PALETTE.map(c => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                title={c}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: c,
                  border: newColor === c ? `3px solid ${darkMode ? "#fff" : "#1a1a1a"}` : "3px solid transparent",
                  cursor: "pointer",
                  outline: "none",
                  flexShrink: 0,
                  transition: prefersReducedMotion ? "none" : "border 0.12s",
                }}
              />
            ))}
          </div>
          <button
            onClick={addHabit}
            style={{
              padding: "8px",
              background: "transparent",
              border: `1px dashed ${t.addBorder}`,
              borderRadius: 8,
              color: t.addColor,
              fontSize: 10,
              cursor: "pointer",
              letterSpacing: 2,
              fontFamily: "system-ui",
            }}
          >
            + ADD
          </button>
        </div>

        {/* Habit list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 8, color: t.subtext, letterSpacing: 2, marginBottom: 4 }}>HABITS</div>
          {habits.length === 0 && (
            <div style={{ fontSize: 11, color: t.labelDot, padding: "6px 0" }}>
              No habits yet.
            </div>
          )}
          {habits.map(h => {
            let done = 0;
            for (let d = 0; d < TOTAL_DAYS; d++) {
              if (h.completions?.[dateKey(indexToDate(d))]) done++;
            }
            const isSel = selectedId === h.id;
            return (
              <div
                key={h.id}
                onClick={() => setSelectedId(isSel ? null : h.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(isSel ? null : h.id); }}}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 10px",
                  borderRadius: 8,
                  border: `1px solid ${isSel ? h.color + "66" : t.habitBorder}`,
                  background: isSel ? h.color + "11" : t.habitBg,
                  cursor: "pointer",
                  transition: prefersReducedMotion ? "none" : "border-color 0.15s, background 0.15s",
                  outline: "none",
                }}
              >
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: h.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, color: isSel ? h.color : t.habitLabel, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {h.name}
                </span>
                <span style={{ fontSize: 10, color: t.subtext, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {done}/115
                </span>
                <button
                  onClick={e => { e.stopPropagation(); deleteHabit(h.id); }}
                  title="Delete habit"
                  style={{ background: "none", border: "none", color: t.deleteColor, cursor: "pointer", fontSize: 16, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
                >×</button>
              </div>
            );
          })}
        </div>

        {/* Day planner for selected habit */}
        {selectedId && (() => {
          const habit = habits.find(h => h.id === selectedId);
          if (!habit) return null;
          return (
            <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 14 }}>
              <div style={{ fontSize: 8, color: t.subtext, letterSpacing: 2, marginBottom: 8 }}>
                DAY PLANNER
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: habit.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: habit.color, fontWeight: 600 }}>{habit.name}</span>
              </div>
              {MONTHS.map(month => (
                <div key={month.label} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 8, color: t.subtext, letterSpacing: 2, marginBottom: 5 }}>{month.label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                    {Array.from({ length: month.days }, (_, i) => {
                      const idx  = month.startDay + i;
                      const dk   = dateKey(indexToDate(idx));
                      const done = !!(habit.completions?.[dk]);
                      const isToday = idx === todayIdx;
                      return (
                        <button
                          key={idx}
                          onClick={() => toggleDay(selectedId, dk)}
                          title={`${month.label} ${i + 1}${done ? " ✓" : ""}`}
                          style={{
                            aspectRatio: "1",
                            borderRadius: 4,
                            border: isToday
                              ? `2px solid ${ACCENT}`
                              : `1px solid ${done ? habit.color + "66" : t.border}`,
                            background: done ? habit.color + "33" : t.dim,
                            color: done ? habit.color : t.subtext,
                            fontSize: 8,
                            cursor: "pointer",
                            fontVariantNumeric: "tabular-nums",
                            fontFamily: "system-ui",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                            lineHeight: 1,
                          }}
                        >
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Reset */}
        {habits.length > 0 && (
          <div style={{ marginTop: "auto", paddingTop: 14, borderTop: `1px solid ${t.border}` }}>
            <button
              onClick={reset}
              style={{
                width: "100%",
                padding: "7px",
                background: "transparent",
                border: `1px solid ${t.deleteColor}`,
                borderRadius: 8,
                color: t.deleteColor,
                fontSize: 9,
                cursor: "pointer",
                letterSpacing: 2,
                fontFamily: "system-ui",
              }}
            >
              RESET ALL
            </button>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL — Wheel ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative", background: t.bg }}>
        <div style={{ position: "absolute", top: 14, left: 18, fontSize: 9, color: t.labelDot, letterSpacing: 2 }}>
          115-DAY HABIT WHEEL
        </div>

        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block" }}
          role="img"
          aria-label="Project 25 habit wheel"
        >

          {/* ── Rings ──────────────────────────────────────────────────────── */}
          {habits.map((habit, hi) => {
            const innerR = INNER_BASE + hi * (ringW + RING_GAP);
            const outerR = innerR + ringW;
            return Array.from({ length: TOTAL_DAYS }, (_, d) => {
              const { start, end } = dayAngles(d);
              const dk   = dateKey(indexToDate(d));
              const done = !!(habit.completions?.[dk]);
              return (
                <path
                  key={`${hi}-${d}`}
                  d={segPath(innerR, outerR, start, end)}
                  fill={done ? habit.color : habit.color + "18"}
                  onClick={() => toggleDay(habit.id, dk)}
                  style={{ cursor: "pointer" }}
                  role="button"
                  aria-label={`${habit.name} ${dateKey(indexToDate(d))}${done ? " done" : ""}`}
                >
                  <title>{habit.name} · {dateKey(indexToDate(d))}</title>
                </path>
              );
            });
          })}

          {/* ── Month markers ───────────────────────────────────────────────── */}
          {MONTHS.map(month => {
            const angle = WHEEL_START + month.startDay * SEG_ANGLE;
            const p1    = ptOn(outerEdge + 4,  angle);
            const p2    = ptOn(outerEdge + 13, angle);
            const pt    = ptOn(outerEdge + 28, angle);
            return (
              <g key={month.label} aria-hidden="true">
                <line
                  x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke={ACCENT} strokeWidth={1.5} strokeOpacity={0.65}
                />
                <text
                  x={pt.x} y={pt.y}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={11} fill={ACCENT} fillOpacity={0.75}
                  fontFamily="system-ui" letterSpacing={1}
                >
                  {month.label}
                </text>
              </g>
            );
          })}

          {/* ── Today marker — radial line + rim dot ─────────────────────────── */}
          {isDuring && (() => {
            const angle = WHEEL_START + (todayIdx + 0.5) * SEG_ANGLE;
            const p1    = ptOn(INNER_BASE - 6, angle);
            const p2    = ptOn(outerEdge + 3,  angle);
            const dot   = ptOn(outerEdge + 10, angle);
            return (
              <g aria-hidden="true">
                <line
                  x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke={ACCENT} strokeWidth={2} strokeOpacity={0.9}
                  strokeLinecap="round"
                />
                <circle cx={dot.x} cy={dot.y} r={5} fill={ACCENT} />
              </g>
            );
          })()}

          {/* ── Centre label ─────────────────────────────────────────────────── */}
          {isBeforeStart && (
            <g aria-hidden="true">
              <text x={CX} y={CY - 22} textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fill={t.subtext} fontFamily="system-ui" letterSpacing={2}>
                STARTS IN
              </text>
              <text x={CX} y={CY + 8} textAnchor="middle" dominantBaseline="middle"
                fontSize={48} fill={ACCENT} fontFamily="system-ui" fontWeight={800} letterSpacing={-2}>
                {daysUntilStart}
              </text>
              <text x={CX} y={CY + 34} textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fill={t.subtext} fontFamily="system-ui" letterSpacing={2}>
                DAYS
              </text>
            </g>
          )}
          {isDuring && (
            <g aria-hidden="true">
              <text x={CX} y={CY - 26} textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fill={t.subtext} fontFamily="system-ui" letterSpacing={2}>
                DAY
              </text>
              <text x={CX} y={CY + 4} textAnchor="middle" dominantBaseline="middle"
                fontSize={48} fill={t.text} fontFamily="system-ui" fontWeight={800} letterSpacing={-2}>
                {todayIdx + 1}
              </text>
              <text x={CX} y={CY + 28} textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fill={t.subtext} fontFamily="system-ui" letterSpacing={2}>
                OF 115
              </text>
              <text x={CX} y={CY + 44} textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fill={ACCENT} fontFamily="system-ui" letterSpacing={1}>
                {pct}% logged
              </text>
            </g>
          )}
          {isAfterEnd && (
            <g aria-hidden="true">
              <text x={CX} y={CY - 26} textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fill={"#22c55e"} fontFamily="system-ui" letterSpacing={2}>
                COMPLETE
              </text>
              <text x={CX} y={CY + 4} textAnchor="middle" dominantBaseline="middle"
                fontSize={48} fill={"#22c55e"} fontFamily="system-ui" fontWeight={800} letterSpacing={-2}>
                {pct}%
              </text>
              <text x={CX} y={CY + 28} textAnchor="middle" dominantBaseline="middle"
                fontSize={9} fill={t.subtext} fontFamily="system-ui" letterSpacing={2}>
                115 DAYS
              </text>
            </g>
          )}
          {habits.length === 0 && (
            <text x={CX} y={CY + 72} textAnchor="middle" dominantBaseline="middle"
              fontSize={10} fill={t.labelDot} fontFamily="system-ui" letterSpacing={1}
              aria-hidden="true">
              Add a habit to begin
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}
