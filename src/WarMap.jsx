import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";

// ─── War Map ──────────────────────────────────────────────────────────────────
// The yearly planning spreadsheet, rebuilt: year → quarter goals → month →
// week targets + review → day plan. Recurring routine is generated, unfinished
// tasks roll forward (and count how often they were pushed), day ratings feed a
// year heatmap, and the scoreboard measures goals instead of describing them.
// Everything persists to localStorage under "yz-wm-*" and syncs via yz_data.

// ─── Constants ────────────────────────────────────────────────────────────────
const P        = "yz-wm-";
const K_CONFIG = P + "config";
const K_GOALS  = P + "goals";
const K_WEEKS  = P + "weeks";
const K_MONTHS = P + "months";
const daysKey  = (mk) => `${P}days-${mk}`;
const VIEW_KEY = "wm-view"; // UI-only, deliberately outside the synced yz- namespace

const RATINGS = [
  { id: "won",  color: "#22c55e", label: "Won the day" },
  { id: "ok",   color: "#f59e0b", label: "Showed up, not enough" },
  { id: "lost", color: "#ef4444", label: "Lost the day" },
  { id: "rest", color: "#A78BFA", label: "Rest / off" },
  { id: "away", color: "#60A5FA", label: "Away / travel" },
];

const WEEKDAYS    = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = MONTH_NAMES.map(m => m.slice(0, 3).toUpperCase());

const CARRY_LOOKBACK = 14; // days scanned for unfinished tasks
const NAG_ROLLS      = 3;  // pushed this many times → flagged

// Mirrors App.jsx DEFAULT_SECTIONS so tags match the Goals tab when yz-sections is unset
const DEFAULT_AREAS = {
  business: { label: "Business", color: "#00FF88" },
  fatLoss:  { label: "Fat Loss", color: "#FF6B35" },
  savings:  { label: "Savings",  color: "#FFD700" },
  social:   { label: "Grow @X",  color: "#A78BFA" },
};
const LIFE_AREA = { id: "life", label: "Life", color: "#8a8a8a" };

const DEFAULT_CONFIG = {
  mission: "",
  rules: [],
  quarterNotes: {},
  routine: [],
  metrics: [
    { id: "m-hours",    label: "Hours worked",  unit: "h",  agg: "sum",  target: 20,   dir: "up" },
    { id: "m-outreach", label: "Outreach sent", unit: "",   agg: "sum",  target: 500,  dir: "up" },
    { id: "m-weight",   label: "Weight",        unit: "kg", agg: "last", target: null, dir: "down" },
  ],
  ratingLabels: {},
};

const EMPTY_DAY   = { tasks: [], routine: {}, rating: null, metrics: {}, note: "" };
const EMPTY_WEEK  = { targets: [], review: {}, ai: null };
const EMPTY_MONTH = { objectives: [], notes: "" };

const AI_SYSTEM = `You review one week of a solo founder's planning log (their "War Map"). They want an advisor, not a cheerleader. Compare what they planned with what they did, and both with their quarterly goals.

Reply in plain text: at most 6 short lines, each starting with "- ". No preamble, no praise, no sign-off. Cover:
- the biggest gap between plan and output, with numbers
- activity that feels productive but does not move a quarterly goal (courses, research, tooling, planning), if any
- any task pushed to a later day repeatedly: say do it, shrink it, or drop it
- the single most important target for next week, as a measurable number
Only cite facts present in the data. If the week has too little data to judge, say exactly what was not logged.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ls = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  // Records yz-ts like App.jsx so focus/realtime pulls don't overwrite newer local edits
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      const ts = JSON.parse(localStorage.getItem("yz-ts") || "{}");
      ts[k] = Date.now();
      localStorage.setItem("yz-ts", JSON.stringify(ts));
    } catch {}
  },
};

// Local-date keys (YYYY-MM-DD) — never toISOString, which shifts days across UTC
const pad       = (n) => String(n).padStart(2, "0");
const toKey     = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey   = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const todayKey  = () => toKey(new Date());
const addDays   = (s, n) => { const d = fromKey(s); d.setDate(d.getDate() + n); return toKey(d); };
const weekdayIx = (s) => (fromKey(s).getDay() + 6) % 7; // Mon = 0
const mondayOf  = (s) => addDays(s, -weekdayIx(s));
const monthOf   = (s) => s.slice(0, 7);
const quarterOf = (s) => Math.floor((Number(s.slice(5, 7)) - 1) / 3) + 1;
const daysInMonth = (y, m0) => new Date(y, m0 + 1, 0).getDate();
const quarterRange = (y, q) => [`${y}-${pad(q * 3 - 2)}-01`, toKey(new Date(y, q * 3, 0))];
const fmtDay = (s, opts = { weekday: "short", day: "numeric", month: "short" }) => fromKey(s).toLocaleDateString("en-GB", opts);
const isoWeek = (s) => {
  const d = fromKey(s);
  const u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  u.setUTCDate(u.getUTCDate() + 4 - (u.getUTCDay() || 7));
  return Math.ceil(((u - Date.UTC(u.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
};
const uid     = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const num     = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const fmtNum  = (v) => (v == null ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(1));

const isOpenTask = (task) => !task.done && !task.movedTo && !task.dropped;
const isLiveTask = (task) => !task.movedTo && !task.dropped;

function dayStats(day, routine) {
  const tasks = day.tasks.filter(isLiveTask);
  const total = tasks.length + routine.length;
  const done  = tasks.filter(x => x.done).length + routine.filter(r => day.routine?.[r.id]).length;
  return { total, done, pct: total ? done / total : null };
}

function suggestRating(pct) {
  if (pct == null) return null;
  if (pct >= 0.8) return "won";
  if (pct >= 0.5) return "ok";
  return "lost";
}

// ─── Store: cached localStorage + debounced Supabase upserts ──────────────────
function useStore(session) {
  const cache  = useRef({});
  const timers = useRef({});
  const [rev, setRev] = useState(0);
  const userId = session?.user?.id;

  const push = useCallback((key, value) => {
    if (!userId) return;
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      delete timers.current[key];
      const { error } = await supabase.from("yz_data").upsert(
        { user_id: userId, key, value, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" }
      );
      if (error) console.error("[war-map] sync failed for", key, error);
    }, 800);
  }, [userId]);

  const get = useCallback((key, fallback) => {
    if (!(key in cache.current)) cache.current[key] = ls.get(key);
    return cache.current[key] ?? fallback;
  }, []);

  const set = useCallback((key, value) => {
    cache.current[key] = value;
    ls.set(key, value);
    push(key, value);
    setRev(r => r + 1);
  }, [push]);

  // App dispatches yz-reload after pulling newer data from another device
  useEffect(() => {
    const onReload = () => { cache.current = {}; setRev(r => r + 1); };
    window.addEventListener("yz-reload", onReload);
    return () => window.removeEventListener("yz-reload", onReload);
  }, []);

  return { get, set, rev };
}

// ─── Small UI pieces ──────────────────────────────────────────────────────────
const inputStyle = (t, extra) => ({
  background: t.input, border: `1px solid ${t.inputBorder}`, borderRadius: 8, color: t.text,
  fontSize: 13, padding: "8px 10px", fontFamily: "inherit", outline: "none", minWidth: 0, ...extra,
});

const btnStyle = (t, variant = "ghost", extra) => ({
  background: variant === "solid" ? t.text : "transparent",
  color: variant === "solid" ? t.bg : t.sub,
  border: `1px solid ${variant === "solid" ? t.text : t.inputBorder}`,
  borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
  fontFamily: "inherit", whiteSpace: "nowrap", ...extra,
});

const iconBtn = (t, extra) => ({
  background: "none", border: "none", color: t.dim, cursor: "pointer", fontSize: 15,
  lineHeight: 1, padding: "2px 4px", flexShrink: 0, fontFamily: "inherit", ...extra,
});

function Card({ t, title, right, children, style }) {
  return (
    <section style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, minWidth: 0, ...style }}>
      {(title || right) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12, minHeight: 20 }}>
          <h3 style={{ fontSize: 10, color: t.sub, letterSpacing: 2, fontWeight: 700, margin: 0 }}>{title}</h3>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

function Check({ on, color = "#22c55e", onClick, t, label }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      style={{
        width: 20, height: 20, borderRadius: 6, flexShrink: 0, padding: 0, cursor: "pointer",
        border: `1.5px solid ${on ? color : t.checkBorder}`, background: on ? color : "transparent",
        color: "#0a0a0a", fontSize: 12, fontWeight: 800, lineHeight: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >{on ? "✓" : ""}</button>
  );
}

function Bar({ pct, color, t, h = 4 }) {
  return (
    <div style={{ height: h, background: t.track, borderRadius: h, overflow: "hidden" }}>
      <div style={{ width: `${clamp01(pct || 0) * 100}%`, height: "100%", background: color, borderRadius: h, transition: "width 0.3s" }} />
    </div>
  );
}

function AreaPicker({ value, areas, onChange }) {
  const a = areas.find(x => x.id === value) || LIFE_AREA;
  return (
    <span title={a.label} style={{ position: "relative", width: 16, height: 20, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: a.color }} />
      <select
        value={a.id}
        onChange={e => onChange(e.target.value)}
        aria-label="Area"
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%" }}
      >
        {areas.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
      </select>
    </span>
  );
}

function InlineText({ value, onSave, t, style, placeholder = "—" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const cancelled = useRef(false);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const commit = () => {
    setEditing(false);
    if (cancelled.current) { cancelled.current = false; return; }
    const v = draft.trim();
    if (v && v !== value) onSave(v);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { cancelled.current = true; e.currentTarget.blur(); }
        }}
        style={inputStyle(t, { padding: "3px 6px", width: "100%", ...style })}
      />
    );
  }
  return (
    <span onClick={() => setEditing(true)} style={{ cursor: "text", minWidth: 0, overflowWrap: "anywhere", ...style }}>
      {value || <span style={{ color: t.dim }}>{placeholder}</span>}
    </span>
  );
}

// Keeps a local draft so "94." can be typed; commits on blur / Enter
function NumberField({ value, onSave, t, placeholder = "—", width = 80 }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);
  const commit = () => { const v = num(draft); if (v !== (value ?? null)) onSave(v); };
  return (
    <input
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      onChange={e => setDraft(e.target.value.replace(",", "."))}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={inputStyle(t, { width, textAlign: "right", padding: "6px 8px", fontVariantNumeric: "tabular-nums" })}
    />
  );
}

function NoteArea({ value, onChange, t, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={inputStyle(t, { width: "100%", resize: "vertical", lineHeight: 1.5, display: "block" })}
    />
  );
}

function AddRow({ t, placeholder, onAdd, areas, defaultArea }) {
  const [text, setText] = useState("");
  const [area, setArea] = useState(defaultArea);
  const submit = () => { const v = text.trim(); if (!v) return; onAdd(v, area); setText(""); };
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
      {areas && <AreaPicker value={area} areas={areas} onChange={setArea} />}
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); }}
        placeholder={placeholder}
        style={inputStyle(t, { flex: 1 })}
      />
      <button onClick={submit} style={btnStyle(t, "solid")}>Add</button>
    </div>
  );
}

function RolledBadge({ rolled, t }) {
  if (!rolled) return null;
  const hot = rolled >= NAG_ROLLS;
  return (
    <span
      title={hot ? `Pushed ${rolled} times — do it, shrink it, or drop it` : `Pushed ${rolled} time${rolled > 1 ? "s" : ""}`}
      style={{
        fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, flexShrink: 0,
        color: hot ? "#ef4444" : t.sub, background: hot ? "#ef444420" : t.surface, border: `1px solid ${hot ? "#ef444455" : t.border}`,
      }}
    >↻{rolled}</span>
  );
}

function Segmented({ t, options, value, onChange }) {
  return (
    <div role="tablist" style={{ display: "flex", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: 3, gap: 2 }}>
      {options.map(o => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            style={{
              background: active ? t.card : "transparent", color: active ? t.text : t.sub,
              border: active ? `1px solid ${t.border}` : "1px solid transparent", borderRadius: 7,
              padding: "6px 12px", fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer", fontFamily: "inherit",
            }}
          >{o.label}</button>
        );
      })}
    </div>
  );
}

function NavRow({ t, label, sub, onPrev, onNext, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
      <button onClick={onPrev} aria-label="Previous" style={btnStyle(t, "ghost", { padding: "6px 11px" })}>‹</button>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4, color: t.text }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: t.sub, marginTop: 1 }}>{sub}</div>}
      </div>
      <button onClick={onNext} aria-label="Next" style={btnStyle(t, "ghost", { padding: "6px 11px" })}>›</button>
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

// ─── Day view ─────────────────────────────────────────────────────────────────
function DayView({ wm, date, setDate }) {
  const { t, areas, config, ratings } = wm;
  const day     = wm.getDay(date);
  const routine = wm.routineFor(date);
  const stats   = dayStats(day, routine);
  const isToday = date === wm.today;
  // Don't call a day lost at 7am: only suggest once something is done or the day is over
  const suggested = !day.rating && (date < wm.today || stats.done > 0) ? suggestRating(stats.pct) : null;
  const monday  = mondayOf(date);

  const update     = (fn) => wm.updateDay(date, fn);
  const patchTask  = (id, patch) => update(d => ({ ...d, tasks: d.tasks.map(x => (x.id === id ? { ...x, ...patch } : x)) }));
  const deleteTask = (id) => update(d => ({ ...d, tasks: d.tasks.filter(x => x.id !== id) }));
  const addTask    = (text, area) => update(d => ({ ...d, tasks: [...d.tasks, { id: uid(), text, area, done: false }] }));

  // Unfinished tasks from the last two weeks — only surfaced on the real today
  const carry = [];
  if (isToday) {
    for (let i = CARRY_LOOKBACK; i >= 1; i--) {
      const s = addDays(date, -i);
      wm.getDay(s).tasks.forEach(task => { if (isOpenTask(task)) carry.push({ task, from: s }); });
    }
  }

  const live  = day.tasks.filter(isLiveTask);
  const gone  = day.tasks.filter(x => !isLiveTask(x));
  const week  = wm.weekMetrics(monday);

  return (
    <div>
      <NavRow
        t={t}
        label={fmtDay(date, { weekday: "long", day: "numeric", month: "long" })}
        sub={`Week ${isoWeek(date)} · Q${quarterOf(date)}${isToday ? " · Today" : date < wm.today ? " · Past" : " · Planning ahead"}`}
        onPrev={() => setDate(addDays(date, -1))}
        onNext={() => setDate(addDays(date, 1))}
        right={!isToday && <button onClick={() => setDate(wm.today)} style={btnStyle(t)}>Jump to today</button>}
      />

      {/* Rating */}
      <Card t={t} style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 92 }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: t.text, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {stats.pct == null ? "—" : `${Math.round(stats.pct * 100)}%`}
            </div>
            <div style={{ fontSize: 10, color: t.sub, letterSpacing: 1.5, marginTop: 4 }}>{stats.done}/{stats.total} DONE</div>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 10, color: t.sub, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>
              RATE THE DAY{suggested && <span style={{ fontWeight: 500, letterSpacing: 0.5 }}> · completion says “{wm.ratingLabel(suggested)}”</span>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ratings.map(r => {
                const on = day.rating === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => update(d => ({ ...d, rating: on ? null : r.id }))}
                    aria-pressed={on}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 20, cursor: "pointer",
                      fontSize: 12, fontWeight: on ? 700 : 500, fontFamily: "inherit",
                      background: on ? r.color + "26" : "transparent", color: on ? t.text : t.sub,
                      border: `1px solid ${on ? r.color : suggested === r.id ? r.color + "88" : t.inputBorder}`,
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.color }} />
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {isToday && config.rules.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: t.sub, letterSpacing: 2, fontWeight: 700 }}>RULES</span>
          {config.rules.map((r, i) => (
            <span key={i} style={{ fontSize: 12, color: t.text, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "4px 9px" }}>
              <span style={{ color: t.sub, marginRight: 5 }}>{i + 1}</span>{r}
            </span>
          ))}
        </div>
      )}

      <div className="wm-grid2">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Card t={t} title="TASKS" right={<span style={{ fontSize: 11, color: t.sub }}>{live.filter(x => x.done).length}/{live.length}</span>}>
            {live.length === 0 && <div style={{ fontSize: 13, color: t.dim, padding: "4px 0 2px" }}>Nothing planned yet. What has to happen today for the quarter to move?</div>}
            {live.map(task => (
              <div key={task.id} className="wm-row" style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderBottom: `1px solid ${t.rowSep}` }}>
                <Check t={t} on={task.done} onClick={() => patchTask(task.id, { done: !task.done })} color={wm.areaOf(task.area).color} label={`Mark ${task.text} done`} />
                <AreaPicker value={task.area} areas={areas} onChange={a => patchTask(task.id, { area: a })} />
                <InlineText
                  t={t}
                  value={task.text}
                  onSave={v => patchTask(task.id, { text: v })}
                  style={{ flex: 1, fontSize: 13, color: task.done ? t.sub : t.text, textDecoration: task.done ? "line-through" : "none" }}
                />
                <RolledBadge rolled={task.rolled} t={t} />
                {!task.done && (
                  <button title="Push to next day" aria-label="Push to next day" onClick={() => wm.moveTask(task, date, addDays(date, 1))} style={iconBtn(t, { fontSize: 13 })}>→</button>
                )}
                <button title="Delete" aria-label="Delete task" onClick={() => deleteTask(task.id)} style={iconBtn(t)}>×</button>
              </div>
            ))}
            {gone.map(task => (
              <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 0", fontSize: 12, color: t.dim }}>
                <span style={{ width: 20, textAlign: "center" }}>{task.movedTo ? "→" : "×"}</span>
                <span style={{ flex: 1, textDecoration: "line-through", overflowWrap: "anywhere" }}>{task.text}</span>
                <span>{task.movedTo ? fmtDay(task.movedTo) : "dropped"}</span>
              </div>
            ))}
            <AddRow t={t} placeholder="Add a task…" onAdd={addTask} areas={areas} defaultArea={areas[0]?.id} />
          </Card>

          {carry.length > 0 && (
            <Card
              t={t}
              title={`UNFINISHED · ${carry.length}`}
              right={<button onClick={() => carry.forEach(c => wm.moveTask(c.task, c.from, date))} style={btnStyle(t)}>Bring all to today</button>}
              style={{ borderColor: "#f59e0b44" }}
            >
              <div style={{ fontSize: 12, color: t.sub, marginBottom: 8, lineHeight: 1.5 }}>
                Left open on earlier days. Bring it forward or drop it on purpose. Don't let it rot.
              </div>
              {carry.map(({ task, from }) => (
                <div key={task.id} style={{ display: "flex", alignItems: "center", gap: "6px 9px", padding: "7px 0", borderBottom: `1px solid ${t.rowSep}`, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 9, flex: "1 1 200px", minWidth: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: wm.areaOf(task.area).color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: t.text, minWidth: 0, overflowWrap: "anywhere" }}>{task.text}</span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                    <span style={{ fontSize: 11, color: t.sub }}>{fmtDay(from, { day: "numeric", month: "short" })}</span>
                    <RolledBadge rolled={task.rolled} t={t} />
                    <button onClick={() => wm.moveTask(task, from, date)} style={btnStyle(t, "ghost", { padding: "4px 8px", fontSize: 11 })}>Today</button>
                    <button
                      onClick={() => wm.updateDay(from, d => ({ ...d, tasks: d.tasks.map(x => (x.id === task.id ? { ...x, dropped: true } : x)) }))}
                      style={btnStyle(t, "ghost", { padding: "4px 8px", fontSize: 11 })}
                    >Drop</button>
                  </span>
                </div>
              ))}
            </Card>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Card
            t={t}
            title="ROUTINE"
            right={<button onClick={() => wm.setView("setup")} style={iconBtn(t, { fontSize: 11, color: t.sub })}>Edit</button>}
          >
            {routine.length === 0 && (
              <div style={{ fontSize: 13, color: t.dim, lineHeight: 1.5 }}>
                No routine for {WEEKDAYS[weekdayIx(date)]}. Set it once in Setup instead of retyping it every day.
              </div>
            )}
            {routine.map(r => {
              const on = !!day.routine?.[r.id];
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 0" }}>
                  <Check t={t} on={on} color={wm.areaOf(r.area).color} label={`Mark ${r.label} done`} onClick={() => update(d => ({ ...d, routine: { ...d.routine, [r.id]: !on } }))} />
                  <span style={{ fontSize: 13, color: on ? t.sub : t.text, textDecoration: on ? "line-through" : "none", flex: 1 }}>{r.label}</span>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: wm.areaOf(r.area).color, opacity: 0.7 }} />
                </div>
              );
            })}
          </Card>

          <Card t={t} title="SCOREBOARD">
            {config.metrics.length === 0 && <div style={{ fontSize: 13, color: t.dim }}>Add numbers to track in Setup.</div>}
            {config.metrics.map(m => {
              const w = week[m.id];
              const wk = m.agg === "sum" ? `${fmtNum(w.total)}${m.target != null ? ` / ${m.target}` : ""} this week` : m.target != null ? `target ${m.target}${m.unit}` : "";
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: t.text }}>{m.label}</div>
                    <div style={{ fontSize: 11, color: t.sub }}>{wk}</div>
                  </div>
                  <NumberField t={t} value={day.metrics?.[m.id]} onSave={v => update(d => ({ ...d, metrics: { ...d.metrics, [m.id]: v } }))} />
                  <span style={{ fontSize: 11, color: t.sub, width: 22 }}>{m.unit}</span>
                </div>
              );
            })}
          </Card>

          <Card t={t} title="NOTES">
            <NoteArea t={t} value={day.note} onChange={v => update(d => ({ ...d, note: v }))} placeholder="What happened? What got in the way?" />
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Week view ────────────────────────────────────────────────────────────────
function WeekView({ wm, date, setDate, openDay }) {
  const { t, config } = wm;
  const monday = mondayOf(date);
  const days   = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const week   = { ...EMPTY_WEEK, ...(wm.weeks[monday] || {}) };
  const prevMonday = addDays(monday, -7);
  const prevOpen   = (wm.weeks[prevMonday]?.targets || []).filter(x => !x.done && !x.carried);
  const metrics    = wm.weekMetrics(monday);
  const [aiState, setAiState] = useState({ loading: false, error: null });

  const setWeek     = (fn) => wm.setWeek(monday, fn);
  const patchTarget = (id, patch) => setWeek(w => ({ ...w, targets: w.targets.map(x => (x.id === id ? { ...x, ...patch } : x)) }));
  const setReview   = (patch) => setWeek(w => ({ ...w, review: { ...w.review, ...patch } }));

  const carryTargets = () => {
    wm.setWeek(prevMonday, w => ({ ...w, targets: w.targets.map(x => (!x.done && !x.carried ? { ...x, carried: true } : x)) }));
    setWeek(w => ({ ...w, targets: [...w.targets, ...prevOpen.map(x => ({ id: uid(), text: x.text, done: false }))] }));
  };

  const runAiReview = async () => {
    setAiState({ loading: true, error: null });
    const q  = quarterOf(monday);
    const yr = Number(monday.slice(0, 4));
    const payload = {
      week: `${fmtDay(monday)} – ${fmtDay(days[6])} ${yr} (ISO week ${isoWeek(monday)})`,
      quarterGoals: wm.goals.filter(g => g.year === yr && g.q === q).map(g => ({
        goal: g.title, area: wm.areaOf(g.area).label, status: g.status, progress: wm.goalProgress(g).text,
      })),
      weeklyTargets: week.targets.map(x => ({ target: x.text, done: !!x.done })),
      scoreboard: config.metrics.map(m => ({
        metric: m.label, unit: m.unit, target: m.target,
        actual: m.agg === "sum" ? metrics[m.id].total : metrics[m.id].latest, aggregation: m.agg,
      })),
      days: days.map(s => {
        const d = wm.getDay(s);
        const st = dayStats(d, wm.routineFor(s));
        return {
          date: fmtDay(s), rating: d.rating ? wm.ratingLabel(d.rating) : null,
          completion: st.pct == null ? null : `${st.done}/${st.total}`,
          tasks: d.tasks.map(x => ({ task: x.text, done: !!x.done, pushedTimes: x.rolled || 0, pushedToLaterDay: !!x.movedTo, dropped: !!x.dropped })),
          note: d.note || undefined,
        };
      }),
      selfReview: week.review,
    };
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-opus-5-5",
          max_tokens: 16000,
          output_config: { effort: "low" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: AI_SYSTEM,
          messages: [{ role: "user", content: JSON.stringify(payload, null, 1) }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.stop_reason === "refusal") throw new Error("The model declined to review this week.");
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
      if (!text) throw new Error("Empty response");
      setWeek(w => ({ ...w, ai: { text, at: Date.now() } }));
      setAiState({ loading: false, error: null });
    } catch (e) {
      setAiState({ loading: false, error: e.message });
    }
  };

  const doneTargets = week.targets.filter(x => x.done).length;

  return (
    <div>
      <NavRow
        t={t}
        label={`Week ${isoWeek(monday)}`}
        sub={`${fmtDay(monday, { day: "numeric", month: "short" })} – ${fmtDay(days[6], { day: "numeric", month: "short", year: "numeric" })}`}
        onPrev={() => setDate(addDays(monday, -7))}
        onNext={() => setDate(addDays(monday, 7))}
        right={mondayOf(wm.today) !== monday && <button onClick={() => setDate(wm.today)} style={btnStyle(t)}>This week</button>}
      />

      {/* Day strip */}
      <div className="wm-strip" style={{ marginBottom: 16 }}>
        {days.map(s => {
          const d  = wm.getDay(s);
          const st = dayStats(d, wm.routineFor(s));
          const r  = wm.ratingById(d.rating);
          const pct = s <= wm.today || st.done > 0 ? st.pct : null;
          return (
            <button
              key={s}
              onClick={() => openDay(s)}
              style={{
                background: r ? r.color + "22" : t.card, border: `1px solid ${s === wm.today ? t.text : r ? r.color + "66" : t.border}`,
                borderRadius: 12, padding: "10px 8px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", minWidth: 0,
              }}
            >
              <div style={{ fontSize: 10, color: t.sub, letterSpacing: 1.5, fontWeight: 700 }}>{WEEKDAYS[weekdayIx(s)].toUpperCase()}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: t.text, lineHeight: 1.2 }}>{fromKey(s).getDate()}</div>
              <div style={{ fontSize: 11, color: t.sub, margin: "2px 0 6px", fontVariantNumeric: "tabular-nums" }}>{pct == null ? "—" : `${Math.round(pct * 100)}%`}</div>
              <Bar t={t} pct={pct} color={r?.color || t.sub} h={3} />
            </button>
          );
        })}
      </div>

      <div className="wm-grid2">
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Card t={t} title="WEEKLY TARGETS" right={<span style={{ fontSize: 11, color: t.sub }}>{doneTargets}/{week.targets.length}</span>}>
            {week.targets.length === 0 && <div style={{ fontSize: 13, color: t.dim }}>3–5 outcomes that make this week a win. Outcomes, not activities.</div>}
            {week.targets.map(x => (
              <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderBottom: `1px solid ${t.rowSep}` }}>
                <Check t={t} on={!!x.done} onClick={() => patchTarget(x.id, { done: !x.done })} label={`Mark ${x.text} done`} />
                <InlineText
                  t={t}
                  value={x.text}
                  onSave={v => patchTarget(x.id, { text: v })}
                  style={{ flex: 1, fontSize: 13, color: x.done ? t.sub : x.carried ? t.dim : t.text, textDecoration: x.done || x.carried ? "line-through" : "none" }}
                />
                {x.carried && <span style={{ fontSize: 11, color: t.dim }}>→ next week</span>}
                <button aria-label="Delete target" onClick={() => setWeek(w => ({ ...w, targets: w.targets.filter(y => y.id !== x.id) }))} style={iconBtn(t)}>×</button>
              </div>
            ))}
            {prevOpen.length > 0 && (
              <button onClick={carryTargets} style={btnStyle(t, "ghost", { marginTop: 10, width: "100%", borderStyle: "dashed" })}>
                Carry {prevOpen.length} unfinished target{prevOpen.length > 1 ? "s" : ""} from last week
              </button>
            )}
            <AddRow t={t} placeholder="Add a target…" onAdd={text => setWeek(w => ({ ...w, targets: [...w.targets, { id: uid(), text, done: false }] }))} />
          </Card>

          <Card t={t} title="SCOREBOARD">
            {config.metrics.map(m => {
              const w = metrics[m.id];
              const actual = m.agg === "sum" ? w.total : w.latest;
              const hit = m.target != null && actual != null && (m.dir === "down" ? actual <= m.target : actual >= m.target);
              const pct = m.target ? (m.agg === "sum" ? actual / m.target : hit ? 1 : 0) : null;
              const max = Math.max(...w.values.map(v => v || 0), 0.0001);
              return (
                <div key={m.id} style={{ padding: "8px 0", borderBottom: `1px solid ${t.rowSep}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 13, color: t.text }}>{m.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: hit ? "#22c55e" : t.text, fontVariantNumeric: "tabular-nums" }}>
                      {actual == null ? "—" : `${fmtNum(actual)}${m.unit}`}{m.target != null && <span style={{ color: t.sub, fontWeight: 500 }}> / {m.target}{m.unit}</span>}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 26, margin: "6px 0 4px" }}>
                    {w.values.map((v, i) => (
                      <div key={i} title={`${WEEKDAYS[i]}: ${fmtNum(v)}${m.unit}`} style={{ flex: 1, height: v == null ? 2 : m.agg === "sum" ? `${Math.max(8, (v / max) * 100)}%` : "100%", background: v == null ? t.track : m.agg === "sum" ? t.sub : t.track, borderRadius: 2, position: "relative" }}>
                        {m.agg === "last" && v != null && <span style={{ position: "absolute", inset: 0, fontSize: 9, color: t.text, display: "flex", alignItems: "center", justifyContent: "center" }}>{fmtNum(v)}</span>}
                      </div>
                    ))}
                  </div>
                  {pct != null && m.agg === "sum" && <Bar t={t} pct={pct} color={hit ? "#22c55e" : "#f59e0b"} />}
                </div>
              );
            })}
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Card t={t} title="WEEKLY REVIEW">
            <div style={{ fontSize: 12, color: t.sub, marginBottom: 6 }}>Score the week, honestly</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                const on = week.review.score === n;
                const c  = n >= 8 ? "#22c55e" : n >= 5 ? "#f59e0b" : "#ef4444";
                return (
                  <button
                    key={n}
                    onClick={() => setReview({ score: on ? null : n })}
                    aria-pressed={on}
                    style={{ width: 30, height: 30, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", background: on ? c : "transparent", color: on ? "#0a0a0a" : t.sub, border: `1px solid ${on ? c : t.inputBorder}` }}
                  >{n}</button>
                );
              })}
            </div>
            {[
              ["worked", "What worked"],
              ["didnt",  "What didn't, and why"],
              ["next",   "One change for next week"],
            ].map(([k, label]) => (
              <div key={k} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: t.sub, marginBottom: 5 }}>{label}</div>
                <NoteArea t={t} rows={2} value={week.review[k]} onChange={v => setReview({ [k]: v })} />
              </div>
            ))}
          </Card>

          <Card
            t={t}
            title="ADVISOR"
            right={<button onClick={runAiReview} disabled={aiState.loading} style={btnStyle(t, "solid", { opacity: aiState.loading ? 0.5 : 1 })}>{aiState.loading ? "Reading your week…" : week.ai ? "Re-run" : "Review my week"}</button>}
          >
            {!week.ai && !aiState.error && (
              <div style={{ fontSize: 13, color: t.dim, lineHeight: 1.5 }}>
                Sends this week's targets, tasks, scoreboard and review to Claude for a blunt read on where plan and output diverged.
              </div>
            )}
            {aiState.error && <div style={{ fontSize: 12, color: "#ef4444" }}>Couldn't get a review: {aiState.error}</div>}
            {week.ai && (
              <>
                <div style={{ fontSize: 13, color: t.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{week.ai.text}</div>
                <div style={{ fontSize: 10, color: t.dim, marginTop: 8 }}>{new Date(week.ai.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Month view ───────────────────────────────────────────────────────────────
function MonthView({ wm, date, setDate, openDay }) {
  const { t } = wm;
  const y  = Number(date.slice(0, 4));
  const m0 = Number(date.slice(5, 7)) - 1;
  const mk = monthOf(date);
  const n  = daysInMonth(y, m0);
  const first = `${mk}-01`;
  const cells = [...Array(weekdayIx(first)).fill(null), ...Array.from({ length: n }, (_, i) => `${mk}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  const rows  = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const month = { ...EMPTY_MONTH, ...(wm.months[mk] || {}) };
  const setMonth = (fn) => wm.setMonth(mk, fn);

  const counts = Object.fromEntries(wm.ratings.map(r => [r.id, 0]));
  let taskDone = 0, taskTotal = 0;
  cells.forEach(s => {
    if (!s) return;
    const d = wm.getDay(s);
    if (d.rating && counts[d.rating] != null) counts[d.rating]++;
    d.tasks.filter(isLiveTask).forEach(x => { taskTotal++; if (x.done) taskDone++; });
  });

  return (
    <div>
      <NavRow
        t={t}
        label={`${MONTH_NAMES[m0]} ${y}`}
        sub={`${taskDone}/${taskTotal} tasks done · ${wm.ratings.filter(r => counts[r.id]).map(r => `${counts[r.id]} ${r.id}`).join(" · ") || "no days rated"}`}
        onPrev={() => setDate(toKey(new Date(y, m0 - 1, 1)))}
        onNext={() => setDate(toKey(new Date(y, m0 + 1, 1)))}
        right={monthOf(wm.today) !== mk && <button onClick={() => setDate(wm.today)} style={btnStyle(t)}>This month</button>}
      />

      <div className="wm-month" style={{ marginBottom: 16 }}>
        {[...WEEKDAYS, "WEEK"].map((d, i) => (
          <div key={d} className={i === 7 ? "wm-weekcol" : undefined} style={{ fontSize: 10, color: t.sub, letterSpacing: 1.5, fontWeight: 700, padding: "0 4px 4px" }}>{d.toUpperCase()}</div>
        ))}
        {rows.map((row, ri) => {
          const monday = mondayOf(row.find(Boolean));
          const wk = wm.weeks[monday];
          return [
            ...row.map((s, ci) => {
              if (!s) return <div key={`e${ri}-${ci}`} style={{ background: t.empty, borderRadius: 10, opacity: 0.5 }} />;
              const d  = wm.getDay(s);
              const st = dayStats(d, wm.routineFor(s));
              const r  = wm.ratingById(d.rating);
              const live = d.tasks.filter(isLiveTask);
              const pct  = s <= wm.today || st.done > 0 ? st.pct : null;
              return (
                <button
                  key={s}
                  onClick={() => openDay(s)}
                  className="wm-cell"
                  style={{
                    background: r ? r.color + (t.dark ? "24" : "30") : t.card,
                    border: `1px solid ${s === wm.today ? t.text : r ? r.color + "55" : t.border}`,
                    borderRadius: 10, padding: "7px 8px", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                    display: "flex", flexDirection: "column", gap: 3, minWidth: 0, overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{fromKey(s).getDate()}</span>
                    {pct != null && <span className="wm-cell-pct" style={{ fontSize: 10, color: t.sub, fontVariantNumeric: "tabular-nums" }}>{Math.round(pct * 100)}%</span>}
                  </div>
                  <div className="wm-cell-tasks" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    {live.slice(0, 3).map(x => (
                      <span key={x.id} style={{ fontSize: 11, color: x.done ? t.sub : t.text, textDecoration: x.done ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: wm.areaOf(x.area).color, flexShrink: 0 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{x.text}</span>
                      </span>
                    ))}
                    {live.length > 3 && <span style={{ fontSize: 10, color: t.sub }}>+{live.length - 3} more</span>}
                  </div>
                  <div style={{ flex: 1 }} />
                  {pct != null && <Bar t={t} pct={pct} color={r?.color || t.sub} h={3} />}
                </button>
              );
            }),
            <button
              key={`w${ri}`}
              className="wm-weekcol"
              onClick={() => { setDate(monday); wm.setView("week"); }}
              style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: "7px 8px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", minWidth: 0 }}
            >
              <div style={{ fontSize: 10, color: t.sub, fontWeight: 700, letterSpacing: 1 }}>WK {isoWeek(monday)}</div>
              {wk?.targets?.length > 0 && <div style={{ fontSize: 12, color: t.text, marginTop: 4 }}>{wk.targets.filter(x => x.done).length}/{wk.targets.length} targets</div>}
              {wk?.review?.score && <div style={{ fontSize: 12, color: t.text, marginTop: 2 }}>Score {wk.review.score}/10</div>}
            </button>,
          ];
        })}
      </div>

      <div className="wm-grid2">
        <Card t={t} title="MAIN OBJECTIVES" right={<span style={{ fontSize: 11, color: t.sub }}>{month.objectives.filter(x => x.done).length}/{month.objectives.length}</span>}>
          {month.objectives.length === 0 && <div style={{ fontSize: 13, color: t.dim }}>What must be true by the end of {MONTH_NAMES[m0]}?</div>}
          {month.objectives.map(x => (
            <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderBottom: `1px solid ${t.rowSep}` }}>
              <Check t={t} on={!!x.done} onClick={() => setMonth(mo => ({ ...mo, objectives: mo.objectives.map(y => (y.id === x.id ? { ...y, done: !y.done } : y)) }))} label={`Mark ${x.text} done`} />
              <InlineText
                t={t}
                value={x.text}
                onSave={v => setMonth(mo => ({ ...mo, objectives: mo.objectives.map(y => (y.id === x.id ? { ...y, text: v } : y)) }))}
                style={{ flex: 1, fontSize: 13, color: x.done ? t.sub : t.text, textDecoration: x.done ? "line-through" : "none" }}
              />
              <button aria-label="Delete objective" onClick={() => setMonth(mo => ({ ...mo, objectives: mo.objectives.filter(y => y.id !== x.id) }))} style={iconBtn(t)}>×</button>
            </div>
          ))}
          <AddRow t={t} placeholder="Add an objective…" onAdd={text => setMonth(mo => ({ ...mo, objectives: [...mo.objectives, { id: uid(), text, done: false }] }))} />
        </Card>
        <Card t={t} title="NOTES & LESSONS">
          <NoteArea t={t} rows={7} value={month.notes} onChange={v => setMonth(mo => ({ ...mo, notes: v }))} placeholder="What did this month teach you?" />
        </Card>
      </div>
    </div>
  );
}

// ─── Year view ────────────────────────────────────────────────────────────────
function GoalRow({ wm, goal }) {
  const { t, areas, config } = wm;
  const prog   = wm.goalProgress(goal);
  const linked = config.metrics.find(m => m.id === goal.metricId);
  const statusColor = { open: t.sub, hit: "#22c55e", missed: "#ef4444", moved: "#f59e0b" }[goal.status] || t.sub;
  const closed = goal.status !== "open";

  return (
    <div style={{ padding: "9px 0", borderBottom: `1px solid ${t.rowSep}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <AreaPicker value={goal.area} areas={areas} onChange={a => wm.patchGoal(goal.id, { area: a })} />
        <InlineText
          t={t}
          value={goal.title}
          onSave={v => wm.patchGoal(goal.id, { title: v })}
          style={{ flex: 1, fontSize: 13, fontWeight: 600, color: closed ? t.sub : t.text, textDecoration: goal.status === "hit" || goal.status === "moved" ? "line-through" : "none" }}
        />
        {goal.slips > 0 && (
          <span title="Moved from an earlier quarter" style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", border: "1px solid #f59e0b55", borderRadius: 10, padding: "1px 6px", flexShrink: 0 }}>
            slipped ×{goal.slips}
          </span>
        )}
        <select
          value={goal.status}
          onChange={e => (e.target.value === "next" ? wm.moveGoalToNextQuarter(goal) : wm.patchGoal(goal.id, { status: e.target.value }))}
          aria-label="Goal status"
          style={inputStyle(t, { padding: "3px 6px", fontSize: 11, color: statusColor, fontWeight: 700, width: "auto" })}
        >
          <option value="open">Open</option>
          <option value="hit">Hit</option>
          <option value="missed">Missed</option>
          {goal.status === "moved" ? <option value="moved">Moved on</option> : <option value="next">Move to next Q</option>}
        </select>
        <button aria-label="Delete goal" onClick={() => wm.deleteGoal(goal.id)} style={iconBtn(t)}>×</button>
      </div>
      {goal.target != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, paddingLeft: 24 }}>
          <div style={{ flex: 1 }}><Bar t={t} pct={prog.pct} color={wm.areaOf(goal.area).color} /></div>
          {linked ? (
            <span style={{ fontSize: 11, color: t.sub, fontVariantNumeric: "tabular-nums" }}>{prog.text} · from {linked.label}</span>
          ) : (
            <>
              <NumberField t={t} width={64} value={goal.current} placeholder="now" onSave={v => wm.patchGoal(goal.id, { current: v })} />
              <span style={{ fontSize: 11, color: t.sub, whiteSpace: "nowrap" }}>→ {goal.target}{goal.unit ? ` ${goal.unit}` : ""}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AddGoal({ wm, year, q }) {
  const { t, areas, config } = wm;
  const [open, setOpen]   = useState(false);
  const [title, setTitle] = useState("");
  const [area, setArea]   = useState(areas[0]?.id);
  const [nums, setNums]   = useState({ start: "", target: "", unit: "", metricId: "" });

  const submit = () => {
    const v = title.trim();
    if (!v) return;
    wm.setGoals([...wm.goals, {
      id: uid(), year, q, area, title: v, status: "open", slips: 0,
      start: num(nums.start), target: num(nums.target), unit: nums.unit.trim(), current: null, metricId: nums.metricId || null,
    }]);
    setTitle(""); setNums({ start: "", target: "", unit: "", metricId: "" }); setOpen(false);
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <AreaPicker value={area} areas={areas} onChange={setArea} />
        <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} placeholder="Add a goal…" style={inputStyle(t, { flex: 1 })} />
        <button onClick={() => setOpen(o => !o)} title="Make it measurable" style={btnStyle(t, "ghost", { padding: "7px 9px" })}>#</button>
        <button onClick={submit} style={btnStyle(t, "solid")}>Add</button>
      </div>
      {open && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", paddingLeft: 24 }}>
          <input value={nums.start} onChange={e => setNums({ ...nums, start: e.target.value })} placeholder="Start (e.g. 0)" inputMode="decimal" style={inputStyle(t, { width: 104 })} />
          <input value={nums.target} onChange={e => setNums({ ...nums, target: e.target.value })} placeholder="Target" inputMode="decimal" style={inputStyle(t, { width: 84 })} />
          <input value={nums.unit} onChange={e => setNums({ ...nums, unit: e.target.value })} placeholder="Unit" style={inputStyle(t, { width: 72 })} />
          <select value={nums.metricId} onChange={e => setNums({ ...nums, metricId: e.target.value })} style={inputStyle(t, { width: "auto" })}>
            <option value="">Update by hand</option>
            {config.metrics.map(m => <option key={m.id} value={m.id}>Auto from {m.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function YearView({ wm, year, setDate, openDay }) {
  const { t, config, ratings } = wm;
  const today = wm.today;
  const currentQ = Number(today.slice(0, 4)) === year ? quarterOf(today) : year < Number(today.slice(0, 4)) ? 5 : 0;

  // Heatmap + streaks
  const counts = Object.fromEntries(ratings.map(r => [r.id, 0]));
  let unrated = 0, streak = 0, best = 0, run = 0;
  for (let m0 = 0; m0 < 12; m0++) {
    for (let d = 1; d <= daysInMonth(year, m0); d++) {
      const s = `${year}-${pad(m0 + 1)}-${pad(d)}`;
      if (s > today) break;
      const r = wm.getDay(s).rating;
      if (r && counts[r] != null) counts[r]++;
      else if (s < today) unrated++;
      if (r === "won") { run++; best = Math.max(best, run); }
      else if (r !== "rest" && r !== "away" && s !== today) run = 0;
    }
  }
  streak = run;

  const [newRule, setNewRule] = useState("");

  return (
    <div>
      <NavRow
        t={t}
        label={`${year}`}
        sub={currentQ >= 1 && currentQ <= 4 ? `Q${currentQ} · ${Math.max(0, Math.round((new Date(year, 11, 31) - fromKey(today)) / 86400000))} days left in the year` : null}
        onPrev={() => setDate(`${year - 1}-01-01`)}
        onNext={() => setDate(`${year + 1}-01-01`)}
        right={Number(today.slice(0, 4)) !== year && <button onClick={() => setDate(today)} style={btnStyle(t)}>This year</button>}
      />

      <Card t={t} title="MISSION" style={{ marginBottom: 16 }}>
        <NoteArea t={t} rows={2} value={config.mission} onChange={v => wm.setConfig({ mission: v })} placeholder="Why this year matters. Read it every morning." />
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
          {wm.areas.filter(a => a.id !== LIFE_AREA.id).map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: a.color }} />
              <span style={{ color: t.text, fontWeight: 600 }}>{a.label}</span>
              {a.goal && <span style={{ color: t.sub }}>{a.goal}</span>}
            </div>
          ))}
        </div>
      </Card>

      <div className="wm-quarters" style={{ marginBottom: 16 }}>
        {[1, 2, 3, 4].map(q => {
          const [qs, qe] = quarterRange(year, q);
          const goals    = wm.goals.filter(g => g.year === year && g.q === q);
          const ended    = qe < today;
          const isNow    = q === currentQ;
          const pending  = ended ? goals.filter(g => g.status === "open").length : 0;
          const hit      = goals.filter(g => g.status === "hit").length;
          const daysLeft = isNow ? Math.round((fromKey(qe) - fromKey(today)) / 86400000) : null;
          return (
            <Card
              key={q}
              t={t}
              title={`Q${q} · ${MONTH_SHORT[q * 3 - 3]}–${MONTH_SHORT[q * 3 - 1]}`}
              right={
                <span style={{ fontSize: 11, fontWeight: 700, color: isNow ? "#22c55e" : t.sub }}>
                  {isNow ? `NOW · ${daysLeft}d left` : ended ? `${hit}/${goals.length} hit` : qs > today ? "AHEAD" : ""}
                </span>
              }
              style={isNow ? { borderColor: "#22c55e55" } : undefined}
            >
              {pending > 0 && (
                <div style={{ fontSize: 12, color: "#f59e0b", background: "#f59e0b14", border: "1px solid #f59e0b44", borderRadius: 8, padding: "7px 10px", marginBottom: 8 }}>
                  {pending} goal{pending > 1 ? "s" : ""} still open from a finished quarter. Mark each hit, missed, or move it on.
                </div>
              )}
              {goals.length === 0 && <div style={{ fontSize: 13, color: t.dim }}>No goals set.</div>}
              {goals.map(g => <GoalRow key={g.id} wm={wm} goal={g} />)}
              <AddGoal wm={wm} year={year} q={q} />
              <div style={{ marginTop: 10 }}>
                <NoteArea
                  t={t}
                  rows={Math.max(1, Math.min(4, Math.ceil((config.quarterNotes?.[`${year}-Q${q}`]?.length || 0) / 60)))}
                  value={config.quarterNotes?.[`${year}-Q${q}`]}
                  onChange={v => wm.setConfig({ quarterNotes: { ...config.quarterNotes, [`${year}-Q${q}`]: v } })}
                  placeholder="Quarter thesis / note"
                />
              </div>
            </Card>
          );
        })}
      </div>

      <Card
        t={t}
        title="EVERY DAY OF THE YEAR"
        right={<span style={{ fontSize: 11, color: t.sub }}>won streak {streak} · best {best}</span>}
        style={{ marginBottom: 16 }}
      >
        <div className="wm-heat">
          <div />
          {Array.from({ length: 31 }, (_, i) => (
            <div key={i} className="wm-heat-num" style={{ fontSize: 8, color: t.dim, textAlign: "center" }}>{(i + 1) % 5 === 0 || i === 0 ? i + 1 : ""}</div>
          ))}
          {MONTH_SHORT.map((label, m0) => [
            <div key={label} style={{ fontSize: 9, color: t.sub, fontWeight: 700, letterSpacing: 1, display: "flex", alignItems: "center" }}>{label}</div>,
            ...Array.from({ length: 31 }, (_, i) => {
              if (i >= daysInMonth(year, m0)) return <div key={`${label}${i}`} />;
              const s = `${year}-${pad(m0 + 1)}-${pad(i + 1)}`;
              const r = wm.ratingById(wm.getDay(s).rating);
              return (
                <button
                  key={s}
                  onClick={() => openDay(s)}
                  title={`${fmtDay(s)}${r ? ` · ${r.label}` : ""}`}
                  aria-label={`${fmtDay(s)}${r ? `, ${r.label}` : ""}`}
                  style={{
                    aspectRatio: "1", borderRadius: 3, padding: 0, cursor: "pointer", minWidth: 0,
                    background: r ? r.color : s > today ? "transparent" : t.empty,
                    border: s === today ? `1.5px solid ${t.text}` : s > today ? `1px solid ${t.border}` : "none",
                  }}
                />
              );
            }),
          ])}
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, fontSize: 12 }}>
          {ratings.map(r => (
            <span key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, color: t.sub }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: r.color }} />
              {r.label} <b style={{ color: t.text, fontVariantNumeric: "tabular-nums" }}>{counts[r.id]}</b>
            </span>
          ))}
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: t.sub }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: t.empty }} />
            Not rated <b style={{ color: t.text }}>{unrated}</b>
          </span>
        </div>
      </Card>

      <Card t={t} title="RULES">
        {config.rules.length === 0 && <div style={{ fontSize: 13, color: t.dim }}>Non-negotiables. They show at the top of today.</div>}
        {config.rules.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${t.rowSep}` }}>
            <span style={{ fontSize: 12, color: t.sub, width: 16, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
            <InlineText t={t} value={r} onSave={v => wm.setConfig({ rules: config.rules.map((x, j) => (j === i ? v : x)) })} style={{ flex: 1, fontSize: 13, color: t.text }} />
            <button aria-label="Delete rule" onClick={() => wm.setConfig({ rules: config.rules.filter((_, j) => j !== i) })} style={iconBtn(t)}>×</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            value={newRule}
            onChange={e => setNewRule(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && newRule.trim()) { wm.setConfig({ rules: [...config.rules, newRule.trim()] }); setNewRule(""); } }}
            placeholder="Add a rule…"
            style={inputStyle(t, { flex: 1 })}
          />
          <button onClick={() => { if (newRule.trim()) { wm.setConfig({ rules: [...config.rules, newRule.trim()] }); setNewRule(""); } }} style={btnStyle(t, "solid")}>Add</button>
        </div>
      </Card>
    </div>
  );
}

// ─── Setup view ───────────────────────────────────────────────────────────────
function SetupView({ wm }) {
  const { t, config, areas, store } = wm;
  const today   = wm.today;
  const routine = config.routine.filter(r => !r.end || r.end > today);
  const fileRef = useRef(null);
  const [importMsg, setImportMsg] = useState(null);

  const setRoutine = (list) => wm.setConfig({ routine: list });
  const patchRoutine = (id, patch) => setRoutine(config.routine.map(r => (r.id === id ? { ...r, ...patch } : r)));
  // Items already used on past days are ended (kept in history), brand-new ones are removed
  const removeRoutine = (r) => setRoutine(r.start && r.start < today ? config.routine.map(x => (x.id === r.id ? { ...x, end: today } : x)) : config.routine.filter(x => x.id !== r.id));
  const patchMetric = (id, patch) => wm.setConfig({ metrics: config.metrics.map(m => (m.id === id ? { ...m, ...patch } : m)) });

  const exportData = () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(P)) data[k] = ls.get(k);
    }
    const blob = new Blob([JSON.stringify({ app: "war-map", version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `war-map-${today}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (file) => {
    try {
      const parsed = JSON.parse(await file.text());
      const data = parsed?.data;
      const keys = data && typeof data === "object" ? Object.keys(data).filter(k => k.startsWith(P)) : [];
      if (!keys.length) throw new Error("No War Map data in this file.");
      if (!window.confirm(`Import ${keys.length} War Map records? Settings, goals, weeks and months are replaced; days are merged (the file wins on the same date).`)) return;
      keys.forEach(k => {
        const value = k.startsWith(P + "days-") ? { ...store.get(k, {}), ...data[k] } : data[k];
        store.set(k, value);
      });
      setImportMsg({ ok: true, text: `Imported ${keys.length} records.` });
    } catch (e) {
      setImportMsg({ ok: false, text: e.message });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card t={t} title="DAILY ROUTINE" right={<span style={{ fontSize: 11, color: t.sub }}>auto-added to every matching day</span>}>
        {routine.length === 0 && <div style={{ fontSize: 13, color: t.dim, marginBottom: 6 }}>Things you'd otherwise retype every day: prayer, reading, training split, calorie tracking…</div>}
        {routine.map(r => (
          <div key={r.id} className="wm-setup-row" style={{ borderBottom: `1px solid ${t.rowSep}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200 }}>
              <AreaPicker value={r.area} areas={areas} onChange={a => patchRoutine(r.id, { area: a })} />
              <input value={r.label} onChange={e => patchRoutine(r.id, { label: e.target.value })} aria-label="Routine item" style={inputStyle(t, { flex: 1 })} />
            </div>
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              {WEEKDAYS.map((d, i) => {
                const on = !!r.days?.[i];
                return (
                  <button
                    key={d}
                    onClick={() => patchRoutine(r.id, { days: WEEKDAYS.map((_, j) => (j === i ? !on : !!r.days?.[j])) })}
                    aria-pressed={on}
                    aria-label={d}
                    style={{ width: 30, height: 30, borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: on ? t.text : "transparent", color: on ? t.bg : t.sub, border: `1px solid ${on ? t.text : t.inputBorder}` }}
                  >{d[0]}</button>
                );
              })}
              <button aria-label="Remove routine item" onClick={() => removeRoutine(r)} style={iconBtn(t, { marginLeft: 4 })}>×</button>
            </div>
          </div>
        ))}
        <AddRow
          t={t}
          placeholder="Add a routine item…"
          areas={areas}
          defaultArea={LIFE_AREA.id}
          onAdd={(label, area) => setRoutine([...config.routine, { id: uid(), label, area, days: WEEKDAYS.map(() => true), start: today }])}
        />
      </Card>

      <Card t={t} title="SCOREBOARD NUMBERS">
        <div style={{ fontSize: 12, color: t.sub, marginBottom: 8, lineHeight: 1.5 }}>
          Logged daily. “Sum” adds up across the week (hours, DMs); “Latest” keeps the last value (weight). Goals can update themselves from these.
        </div>
        {config.metrics.map(m => (
          <div key={m.id} className="wm-setup-row" style={{ borderBottom: `1px solid ${t.rowSep}` }}>
            <input value={m.label} onChange={e => patchMetric(m.id, { label: e.target.value })} aria-label="Metric name" style={inputStyle(t, { flex: 1, minWidth: 140 })} />
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input value={m.unit} onChange={e => patchMetric(m.id, { unit: e.target.value })} placeholder="unit" aria-label="Unit" style={inputStyle(t, { width: 60 })} />
              <select value={m.agg} onChange={e => patchMetric(m.id, { agg: e.target.value })} aria-label="Aggregation" style={inputStyle(t, { width: "auto" })}>
                <option value="sum">Sum / week</option>
                <option value="last">Latest</option>
              </select>
              <NumberField t={t} width={76} value={m.target} placeholder="target" onSave={v => patchMetric(m.id, { target: v })} />
              <select value={m.dir} onChange={e => patchMetric(m.id, { dir: e.target.value })} aria-label="Direction" style={inputStyle(t, { width: "auto" })}>
                <option value="up">Higher is better</option>
                <option value="down">Lower is better</option>
              </select>
              <button aria-label="Remove metric" onClick={() => wm.setConfig({ metrics: config.metrics.filter(x => x.id !== m.id) })} style={iconBtn(t)}>×</button>
            </div>
          </div>
        ))}
        <AddRow t={t} placeholder="Add a number to track…" onAdd={label => wm.setConfig({ metrics: [...config.metrics, { id: uid(), label, unit: "", agg: "sum", target: null, dir: "up" }] })} />
      </Card>

      <Card t={t} title="DAY RATINGS">
        <div style={{ fontSize: 12, color: t.sub, marginBottom: 8 }}>Write down what each colour means, so the rating is a standard and not a mood.</div>
        {RATINGS.map(r => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: r.color, flexShrink: 0 }} />
            <input
              value={config.ratingLabels?.[r.id] ?? r.label}
              onChange={e => wm.setConfig({ ratingLabels: { ...config.ratingLabels, [r.id]: e.target.value } })}
              aria-label={`Label for ${r.id}`}
              style={inputStyle(t, { flex: 1 })}
            />
          </div>
        ))}
      </Card>

      <Card t={t} title="DATA">
        <div style={{ fontSize: 12, color: t.sub, marginBottom: 10, lineHeight: 1.5 }}>
          Syncs to your account automatically. Export is a full backup; import restores one, or loads a prepared War Map file.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={exportData} style={btnStyle(t)}>Export backup</button>
          <button onClick={() => fileRef.current?.click()} style={btnStyle(t)}>Import file…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ""; }} />
          {importMsg && <span style={{ fontSize: 12, color: importMsg.ok ? "#22c55e" : "#ef4444" }}>{importMsg.text}</span>}
        </div>
      </Card>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WarMap({ session, darkMode = true }) {
  const store = useStore(session);
  const [view, setViewState] = useState(() => { try { return localStorage.getItem(VIEW_KEY) || "day"; } catch { return "day"; } });
  const [date, setDate] = useState(todayKey);
  const today = todayKey();

  const setView = (v) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch {} };
  const openDay = (s) => { setDate(s); setView("day"); };

  const t = darkMode ? {
    dark: true, bg: "#0a0a0a", card: "#111", border: "#1c1c1c", surface: "#151515", text: "#f2f2f2", sub: "#8a8a8a",
    dim: "#4d4d4d", track: "#202020", input: "#0c0c0c", inputBorder: "#272727", checkBorder: "#3a3a3a", rowSep: "#181818", empty: "#1a1a1a",
  } : {
    dark: false, bg: "#f2f1ed", card: "#fff", border: "#e5e5e5", surface: "#f7f7f5", text: "#1a1a1a", sub: "#6b6b6b",
    dim: "#b0b0b0", track: "#ececec", input: "#fff", inputBorder: "#dcdcdc", checkBorder: "#c9c9c9", rowSep: "#f0f0f0", empty: "#e9e8e4",
  };

  // ── Data ──────────────────────────────────────────────────────────────────
  const config = { ...DEFAULT_CONFIG, ...store.get(K_CONFIG, {}) };
  const goals  = store.get(K_GOALS, []);
  const weeks  = store.get(K_WEEKS, {});
  const months = store.get(K_MONTHS, {});

  // Areas follow the Goals tab sections so colours stay consistent app-wide
  const sections = ls.get("yz-sections") || DEFAULT_AREAS;
  const areas = [...Object.entries(sections).map(([id, s]) => ({ id, label: s.label, color: s.color, goal: s.goal })), LIFE_AREA];
  const areaOf = (id) => areas.find(a => a.id === id) || LIFE_AREA;

  const ratings     = RATINGS.map(r => ({ ...r, label: config.ratingLabels?.[r.id] || r.label }));
  const ratingById  = (id) => ratings.find(r => r.id === id) || null;
  const ratingLabel = (id) => ratingById(id)?.label || id;

  const setConfig = (patch) => store.set(K_CONFIG, { ...config, ...patch });
  const setGoals  = (g) => store.set(K_GOALS, g);
  const setWeek   = (mon, fn) => { const all = store.get(K_WEEKS, {}); store.set(K_WEEKS, { ...all, [mon]: fn({ ...EMPTY_WEEK, ...(all[mon] || {}) }) }); };
  const setMonth  = (mk, fn) => { const all = store.get(K_MONTHS, {}); store.set(K_MONTHS, { ...all, [mk]: fn({ ...EMPTY_MONTH, ...(all[mk] || {}) }) }); };

  const getDay = (s) => ({ ...EMPTY_DAY, ...(store.get(daysKey(monthOf(s)), {})[s] || {}) });
  const updateDay = (s, fn) => {
    const k = daysKey(monthOf(s));
    const all = store.get(k, {});
    store.set(k, { ...all, [s]: fn({ ...EMPTY_DAY, ...(all[s] || {}) }) });
  };

  const routineFor = (s) => config.routine.filter(r => r.days?.[weekdayIx(s)] && (!r.start || r.start <= s) && (!r.end || s < r.end));

  // Original is kept (marked movedTo) so the day it slipped from still shows it
  const moveTask = (task, from, to) => {
    if (from === to) return;
    updateDay(from, d => ({ ...d, tasks: d.tasks.map(x => (x.id === task.id ? { ...x, movedTo: to } : x)) }));
    updateDay(to, d => ({ ...d, tasks: [...d.tasks, { id: uid(), text: task.text, area: task.area, done: false, rolled: (task.rolled || 0) + 1, origin: task.origin || from }] }));
  };

  const weekMetrics = (monday) => {
    const days = Array.from({ length: 7 }, (_, i) => getDay(addDays(monday, i)));
    return Object.fromEntries(config.metrics.map(m => {
      const values = days.map(d => num(d.metrics?.[m.id]));
      const logged = values.filter(v => v != null);
      return [m.id, { values, total: logged.reduce((a, b) => a + b, 0), latest: logged.length ? logged[logged.length - 1] : null }];
    }));
  };

  // Sum metrics count within the goal's quarter; "latest" metrics take the newest value logged up to today
  const metricForGoal = (g, m) => {
    const [qs, qe] = quarterRange(g.year, g.q);
    let total = 0, latest = null;
    for (let s = m.agg === "sum" ? qs : addDays(today, -120); s <= (m.agg === "sum" ? qe : today); s = addDays(s, 1)) {
      if (s > today) break;
      const v = num(getDay(s).metrics?.[m.id]);
      if (v != null) { total += v; latest = v; }
    }
    return m.agg === "sum" ? total : latest;
  };

  const goalProgress = (g) => {
    if (g.target == null) return { pct: g.status === "hit" ? 1 : null, text: g.status };
    const m = config.metrics.find(x => x.id === g.metricId);
    const current = m ? metricForGoal(g, m) : g.current;
    const start = g.start ?? 0;
    const pct = current == null || g.target === start ? null : clamp01((current - start) / (g.target - start));
    return { pct, current, text: `${fmtNum(current)} → ${g.target}${g.unit ? ` ${g.unit}` : ""}` };
  };

  const patchGoal  = (id, patch) => setGoals(goals.map(g => (g.id === id ? { ...g, ...patch } : g)));
  const deleteGoal = (id) => { if (window.confirm("Delete this goal?")) setGoals(goals.filter(g => g.id !== id)); };
  const moveGoalToNextQuarter = (g) => {
    const next = g.q === 4 ? { year: g.year + 1, q: 1 } : { year: g.year, q: g.q + 1 };
    setGoals([
      ...goals.map(x => (x.id === g.id ? { ...x, status: "moved" } : x)),
      { ...g, ...next, id: uid(), status: "open", slips: (g.slips || 0) + 1, current: g.current },
    ]);
  };

  const wm = {
    t, store, today, config, setConfig, goals, setGoals, weeks, setWeek, months, setMonth,
    getDay, updateDay, routineFor, moveTask, weekMetrics, goalProgress, patchGoal, deleteGoal, moveGoalToNextQuarter,
    areas, areaOf, ratings, ratingById, ratingLabel, setView,
  };

  const year = Number(date.slice(0, 4));
  const doy  = Math.round((fromKey(today) - new Date(fromKey(today).getFullYear(), 0, 1)) / 86400000) + 1;

  return (
    <div style={{ minHeight: "calc(100vh - 52px)", background: t.bg, color: t.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        .wm-wrap { max-width: 1180px; margin: 0 auto; padding: 20px 20px 48px; }
        .wm-wrap *, .wm-wrap *::before, .wm-wrap *::after { box-sizing: border-box; }
        .wm-grid2 { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 16px; align-items: start; }
        .wm-quarters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
        .wm-strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
        .wm-month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)) minmax(0, 0.8fr); grid-template-rows: auto; grid-auto-rows: minmax(104px, auto); gap: 6px; }
        .wm-heat { display: grid; grid-template-columns: 34px repeat(31, minmax(0, 1fr)); gap: 3px; }
        .wm-setup-row { display: flex; gap: 10px; align-items: center; padding: 8px 0; flex-wrap: wrap; }
        .wm-wrap input:focus, .wm-wrap textarea:focus, .wm-wrap select:focus { border-color: ${t.sub} !important; }
        .wm-wrap button:focus-visible { outline: 2px solid ${t.sub}; outline-offset: 2px; }
        .wm-cell:hover { filter: brightness(${t.dark ? 1.25 : 0.97}); }
        @media (max-width: 860px) {
          .wm-grid2, .wm-quarters { grid-template-columns: minmax(0, 1fr); }
        }
        @media (max-width: 700px) {
          .wm-wrap { padding: 14px 12px 40px; }
          .wm-month { grid-template-columns: repeat(7, minmax(0, 1fr)); grid-auto-rows: minmax(54px, auto); gap: 4px; }
          .wm-weekcol, .wm-cell-tasks, .wm-cell-pct { display: none !important; }
          .wm-strip { gap: 4px; }
          .wm-heat { gap: 2px; grid-template-columns: 28px repeat(31, minmax(0, 1fr)); }
          .wm-heat-num { visibility: hidden; }
        }
      `}</style>

      <div className="wm-wrap">
        <header style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: t.sub, letterSpacing: 3, fontWeight: 700 }}>WAR MAP {Number(today.slice(0, 4))}</div>
            <div style={{ fontSize: 12, color: t.sub, marginTop: 3 }}>
              Day {doy} · Week {isoWeek(today)} · Q{quarterOf(today)}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <Segmented
            t={t}
            value={view}
            onChange={setView}
            options={[
              { id: "day",   label: "Day" },
              { id: "week",  label: "Week" },
              { id: "month", label: "Month" },
              { id: "year",  label: "Year" },
              { id: "setup", label: "Setup" },
            ]}
          />
        </header>

        {config.mission && view !== "year" && (
          <button
            onClick={() => setView("year")}
            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderLeft: `2px solid ${t.dim}`, padding: "2px 0 2px 12px", marginBottom: 18, color: t.sub, fontSize: 12, fontStyle: "italic", lineHeight: 1.5, cursor: "pointer", fontFamily: "inherit" }}
          >{config.mission}</button>
        )}

        {view === "day"   && <DayView   wm={wm} date={date} setDate={setDate} />}
        {view === "week"  && <WeekView  wm={wm} date={date} setDate={setDate} openDay={openDay} />}
        {view === "month" && <MonthView wm={wm} date={date} setDate={setDate} openDay={openDay} />}
        {view === "year"  && <YearView  wm={wm} year={year} setDate={setDate} openDay={openDay} />}
        {view === "setup" && <SetupView wm={wm} />}
      </div>
    </div>
  );
}
