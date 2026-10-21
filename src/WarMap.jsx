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
  business: { label: "Business", color: "#00FF88", goal: "Leave Corporate · £15k/month" },
  fatLoss:  { label: "Fat Loss", color: "#FF6B35", goal: "102 kg → 85 kg" },
  savings:  { label: "Savings",  color: "#FFD700", goal: "£15k → £100k" },
  social:   { label: "Grow @X",  color: "#A78BFA", goal: "0 → 5,000 Followers" },
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

function Check({ on, color = "#22c55e", onClick, t, label, size = 20 }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      style={{
        width: size, height: size, borderRadius: Math.round(size * 0.3), flexShrink: 0, padding: 0, cursor: "pointer",
        border: `1.5px solid ${on ? color : t.checkBorder}`, background: on ? color : "transparent",
        color: "#0a0a0a", fontSize: Math.round(size * 0.6), fontWeight: 800, lineHeight: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >{on ? "✓" : ""}</button>
  );
}

// Spans so it can sit inside buttons (goal lines) as well as blocks
function Bar({ pct, color, t, h = 4 }) {
  return (
    <span style={{ display: "block", height: h, background: t.track, borderRadius: h, overflow: "hidden" }}>
      <span style={{ display: "block", width: `${clamp01(pct || 0) * 100}%`, height: "100%", background: color, borderRadius: h, transition: "width 0.3s" }} />
    </span>
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

function NoteArea({ value, onChange, t, placeholder, rows = 3, style }) {
  return (
    <textarea
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={inputStyle(t, { width: "100%", resize: "vertical", lineHeight: 1.5, display: "block", ...style })}
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
  const { t, areas, config } = wm;
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
            <RatingChips wm={wm} s={date} suggested={suggested} />
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

// ─── Shared day/week pieces (Month view cells, phone panel) ──────────────────
function RatingChips({ wm, s, suggested, small }) {
  const { t } = wm;
  const day = wm.getDay(s);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {wm.ratings.map(r => {
        const on = day.rating === r.id;
        return (
          <button
            key={r.id}
            onClick={() => wm.updateDay(s, d => ({ ...d, rating: on ? null : r.id }))}
            aria-pressed={on}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: small ? "5px 9px" : "6px 10px", borderRadius: 20, cursor: "pointer",
              fontSize: small ? 11.5 : 12, fontWeight: on ? 700 : 500, fontFamily: "inherit",
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
  );
}

// The coloured dot in a month cell; opens a small menu of ratings
function RatingDot({ wm, s }) {
  const { t } = wm;
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc   = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const r = wm.ratingById(wm.getDay(s).rating);
  const pick = (id) => { wm.updateDay(s, d => ({ ...d, rating: id })); setOpen(false); };
  const item = { display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, border: "none", color: t.text, fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left" };

  return (
    <span ref={ref} className="wm-cell-dot" style={{ position: "relative", display: "inline-flex" }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={`Rate ${fmtDay(s)}${r ? `, now ${r.label}` : ""}`}
        aria-expanded={open}
        title={r ? r.label : "Rate the day"}
        style={{ width: 13, height: 13, borderRadius: "50%", padding: 0, cursor: "pointer", background: r ? r.color : "transparent", border: `1.5px solid ${r ? r.color : t.checkBorder}` }}
      />
      {open && (
        <div role="menu" style={{ position: "absolute", top: 19, left: -6, zIndex: 30, minWidth: 180, background: t.card, border: `1px solid ${t.border}`, borderRadius: 10, padding: 5, boxShadow: "0 10px 30px rgba(0,0,0,0.28)", display: "flex", flexDirection: "column" }}>
          {wm.ratings.map(x => (
            <button key={x.id} role="menuitem" onClick={() => pick(x.id)} style={{ ...item, background: r?.id === x.id ? t.surface : "transparent" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: x.color, flexShrink: 0 }} />{x.label}
            </button>
          ))}
          {r && <button role="menuitem" onClick={() => pick(null)} style={{ ...item, background: "transparent", color: t.sub }}>Clear rating</button>}
        </div>
      )}
    </span>
  );
}

// "+ Add" that turns into an input; Enter adds and stays open for the next line
function InlineAdd({ t, onAdd, label, areas, panel }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [area, setArea] = useState(areas?.[0]?.id);
  const cancelled = useRef(false);
  const fs = panel ? 13 : 11.5;
  const commit = () => { const v = text.trim(); if (v) onAdd(v, area); setText(""); };

  if (!open) {
    return (
      <button
        className="wm-add"
        onClick={() => setOpen(true)}
        aria-label={label}
        style={{ alignSelf: "flex-start", background: "none", border: "none", color: t.sub, fontSize: fs, cursor: "pointer", padding: panel ? "8px 0 0" : "3px 0 0", fontFamily: "inherit" }}
      >+ Add</button>
    );
  }
  return (
    <div
      style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 3 }}
      onBlur={e => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        if (!cancelled.current) commit();
        cancelled.current = false;
        setOpen(false);
      }}
    >
      {areas && <AreaPicker value={area} areas={areas} onChange={setArea} />}
      <input
        autoFocus
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { cancelled.current = true; e.currentTarget.blur(); }
        }}
        placeholder="Type, then Enter"
        aria-label={label}
        style={inputStyle(t, { flex: 1, width: "100%", fontSize: fs, padding: panel ? "7px 9px" : "3px 6px" })}
      />
    </div>
  );
}

// A day's tasks + routine, editable in place — a month cell, or the phone panel
function DayList({ wm, s, panel = false, showRoutine = true }) {
  const { t, areas } = wm;
  const day     = wm.getDay(s);
  const routine = showRoutine ? wm.routineFor(s) : [];
  const fs  = panel ? 13 : 11.5;
  const box = panel ? 18 : 13;
  const gap = panel ? 9 : 5;
  const pad = panel ? "6px 0" : "2px 0";
  const patch = (id, p) => wm.updateDay(s, d => ({ ...d, tasks: d.tasks.map(x => (x.id === id ? { ...x, ...p } : x)) }));

  return (
    <div className={panel ? "wm-daylist wm-daylist-panel" : "wm-daylist"} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      {day.tasks.map(task => (isLiveTask(task) ? (
        <div key={task.id} className="wm-task" style={{ display: "flex", alignItems: "flex-start", gap, padding: pad }}>
          <Check t={t} size={box} on={task.done} color={wm.areaOf(task.area).color} onClick={() => patch(task.id, { done: !task.done })} label={`Mark ${task.text} done`} />
          <InlineText
            t={t}
            value={task.text}
            onSave={v => patch(task.id, { text: v })}
            style={{ flex: 1, fontSize: fs, lineHeight: 1.35, color: task.done ? t.sub : t.text, textDecoration: task.done ? "line-through" : "none" }}
          />
          {task.rolled > 0 && (panel
            ? <RolledBadge rolled={task.rolled} t={t} />
            : <span title={`Pushed ${task.rolled}×`} style={{ fontSize: 9.5, fontWeight: 700, color: task.rolled >= NAG_ROLLS ? "#ef4444" : t.sub, flexShrink: 0 }}>↻{task.rolled}</span>)}
          <span className="wm-task-actions" style={{ display: "flex", flexShrink: 0 }}>
            {!task.done && <button aria-label="Push to next day" title="Push to next day" onClick={() => wm.moveTask(task, s, addDays(s, 1))} style={iconBtn(t, { fontSize: panel ? 13 : 11, padding: "0 2px" })}>→</button>}
            <button aria-label="Delete task" title="Delete" onClick={() => wm.updateDay(s, d => ({ ...d, tasks: d.tasks.filter(x => x.id !== task.id) }))} style={iconBtn(t, { fontSize: panel ? 15 : 12, padding: "0 2px" })}>×</button>
          </span>
        </div>
      ) : (
        <div key={task.id} title={task.movedTo ? `Moved to ${fmtDay(task.movedTo)}` : "Dropped"} style={{ fontSize: fs - 1, lineHeight: 1.35, color: t.dim, textDecoration: "line-through", padding: pad, paddingLeft: box + gap, overflowWrap: "anywhere" }}>
          {task.text}{task.movedTo ? " →" : ""}
        </div>
      )))}
      {routine.length > 0 && (
        <div style={day.tasks.length ? { borderTop: `1px dashed ${t.border}`, marginTop: 3, paddingTop: 3 } : undefined}>
          {routine.map(r => {
            const on = !!day.routine?.[r.id];
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap, padding: pad }}>
                <Check t={t} size={box} on={on} color={wm.areaOf(r.area).color} onClick={() => wm.updateDay(s, d => ({ ...d, routine: { ...d.routine, [r.id]: !on } }))} label={`Mark ${r.label} done`} />
                <span style={{ fontSize: fs, lineHeight: 1.35, color: on ? t.dim : t.sub, textDecoration: on ? "line-through" : "none", minWidth: 0, overflowWrap: "anywhere" }}>{r.label}</span>
              </div>
            );
          })}
        </div>
      )}
      <InlineAdd
        t={t}
        panel={panel}
        areas={areas}
        label={`Add a task on ${fmtDay(s)}`}
        onAdd={(text, area) => wm.updateDay(s, d => ({ ...d, tasks: [...d.tasks, { id: uid(), text, area, done: false }] }))}
      />
    </div>
  );
}

// The week's targets, editable in place — the month's right-hand column
function WeekGoals({ wm, monday, panel = false }) {
  const { t } = wm;
  const week = { ...EMPTY_WEEK, ...(wm.weeks[monday] || {}) };
  const fs  = panel ? 13 : 11.5;
  const box = panel ? 18 : 13;
  const score = week.review?.score;
  const patch = (id, p) => wm.setWeek(monday, w => ({ ...w, targets: w.targets.map(x => (x.id === id ? { ...x, ...p } : x)) }));

  return (
    <div className={panel ? "wm-daylist-panel" : undefined} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      {week.targets.map(x => (
        <div key={x.id} className="wm-task" style={{ display: "flex", gap: panel ? 9 : 5, alignItems: "flex-start", padding: panel ? "6px 0" : "2px 0" }}>
          <Check t={t} size={box} on={!!x.done} onClick={() => patch(x.id, { done: !x.done })} label={`Mark ${x.text} done`} />
          <InlineText
            t={t}
            value={x.text}
            onSave={v => patch(x.id, { text: v })}
            style={{ flex: 1, fontSize: fs, lineHeight: 1.35, color: x.done ? t.sub : x.carried ? t.dim : t.text, textDecoration: x.done || x.carried ? "line-through" : "none" }}
          />
          <span className="wm-task-actions" style={{ display: "flex", flexShrink: 0 }}>
            <button aria-label="Delete target" title="Delete" onClick={() => wm.setWeek(monday, w => ({ ...w, targets: w.targets.filter(y => y.id !== x.id) }))} style={iconBtn(t, { fontSize: panel ? 15 : 12, padding: "0 2px" })}>×</button>
          </span>
        </div>
      ))}
      <InlineAdd t={t} panel={panel} label={`Add a goal for week ${isoWeek(monday)}`} onAdd={text => wm.setWeek(monday, w => ({ ...w, targets: [...w.targets, { id: uid(), text, done: false }] }))} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: panel ? 10 : 6, flexWrap: "wrap" }}>
        {score && <span style={{ fontSize: 11, fontWeight: 800, color: score >= 8 ? "#22c55e" : score >= 5 ? "#f59e0b" : "#ef4444" }}>{score}/10</span>}
        <button onClick={() => wm.openWeek(monday)} style={{ background: "none", border: "none", color: t.sub, fontSize: 11, cursor: "pointer", padding: 0, fontFamily: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}>
          {score ? "Review" : "Review week"}
        </button>
      </div>
    </div>
  );
}

// ─── Month view ───────────────────────────────────────────────────────────────
// The spreadsheet's month page: every day's list visible and editable in the
// grid, the week's goals beside each row, objectives and notes underneath.
// On a phone the grid shrinks to colours and the tapped day opens below it.
const ROUTINE_KEY = "wm-month-routine"; // UI-only

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

  const [picked, setPicked] = useState(null);
  const sel = picked && monthOf(picked) === mk ? picked : monthOf(wm.today) === mk ? wm.today : first;
  const [showRoutine, setShowRoutine] = useState(() => { try { return localStorage.getItem(ROUTINE_KEY) !== "0"; } catch { return true; } });
  const toggleRoutine = () => {
    const next = !showRoutine;
    setShowRoutine(next);
    try { localStorage.setItem(ROUTINE_KEY, next ? "1" : "0"); } catch {}
  };

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
        sub={`${taskDone}/${taskTotal} tasks done · ${wm.ratings.filter(r => counts[r.id]).map(r => `${counts[r.id]} ${r.id}`).join(" · ") || "no days rated yet"}`}
        onPrev={() => setDate(toKey(new Date(y, m0 - 1, 1)))}
        onNext={() => setDate(toKey(new Date(y, m0 + 1, 1)))}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={toggleRoutine} aria-pressed={showRoutine} style={btnStyle(t)}>{showRoutine ? "Hide routine" : "Show routine"}</button>
            {monthOf(wm.today) !== mk && <button onClick={() => setDate(wm.today)} style={btnStyle(t)}>This month</button>}
          </div>
        }
      />

      <div className="wm-month" style={{ marginBottom: 16 }}>
        {[...WEEKDAYS, "Weekly goals"].map((d, i) => (
          <div key={d} className={i === 7 ? "wm-weekcol" : undefined} style={{ fontSize: 10, color: t.sub, letterSpacing: 1.5, fontWeight: 700, padding: "0 4px 4px" }}>{d.toUpperCase()}</div>
        ))}
        {rows.map((row, ri) => {
          const monday = mondayOf(row.find(Boolean));
          return [
            ...row.map((s, ci) => {
              if (!s) return <div key={`e${ri}-${ci}`} style={{ background: t.empty, borderRadius: 10, opacity: 0.45 }} />;
              const d   = wm.getDay(s);
              const st  = dayStats(d, wm.routineFor(s));
              const r   = wm.ratingById(d.rating);
              const pct = s <= wm.today || st.done > 0 ? st.pct : null;
              return (
                <div
                  key={s}
                  onClick={() => setPicked(s)}
                  className={`wm-daycell${s === sel ? " is-sel" : ""}`}
                  style={{
                    background: r ? r.color + (t.dark ? "26" : "3a") : t.card,
                    border: `1px solid ${s === wm.today ? t.text : r ? r.color + "66" : t.border}`,
                    borderRadius: 10, padding: "7px 8px 8px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      className="wm-daynum"
                      onClick={() => openDay(s)}
                      aria-label={`Open ${fmtDay(s)}`}
                      title="Open this day"
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 14, fontWeight: 800, color: t.text, fontFamily: "inherit", fontVariantNumeric: "tabular-nums" }}
                    >{fromKey(s).getDate()}</button>
                    <RatingDot wm={wm} s={s} />
                    <span style={{ flex: 1 }} />
                    {pct != null && <span className="wm-cell-pct" style={{ fontSize: 10, color: t.sub, fontVariantNumeric: "tabular-nums" }}>{Math.round(pct * 100)}%</span>}
                  </div>
                  <div className="wm-cell-body"><DayList wm={wm} s={s} showRoutine={showRoutine} /></div>
                </div>
              );
            }),
            <div key={`w${ri}`} className="wm-weekcol wm-weekgoals" style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 9px", minWidth: 0 }}>
              <div style={{ fontSize: 10, color: t.sub, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>WEEK {isoWeek(monday)}</div>
              <WeekGoals wm={wm} monday={monday} />
            </div>,
          ];
        })}
      </div>

      {/* Phone: the tapped day and its week, full size */}
      <div className="wm-month-panel">
        <Card
          t={t}
          title={fmtDay(sel, { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}
          right={<button onClick={() => openDay(sel)} style={btnStyle(t, "ghost", { padding: "4px 9px", fontSize: 11 })}>Open day</button>}
        >
          <RatingChips wm={wm} s={sel} small />
          <div style={{ height: 8 }} />
          <DayList key={sel} wm={wm} s={sel} panel showRoutine={showRoutine} />
        </Card>
        <Card t={t} title={`WEEK ${isoWeek(sel)} GOALS`}>
          <WeekGoals key={mondayOf(sel)} wm={wm} monday={mondayOf(sel)} panel />
        </Card>
      </div>

      <div className="wm-grid2" style={{ marginTop: 16 }}>
        <Card t={t} title="MAIN OBJECTIVES" right={<span style={{ fontSize: 11, color: t.sub }}>{month.objectives.filter(x => x.done).length}/{month.objectives.length}</span>}>
          {month.objectives.length === 0 && <div style={{ fontSize: 13, color: t.dim }}>What must be true by the end of {MONTH_NAMES[m0]}?</div>}
          {month.objectives.map(x => (
            <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderBottom: `1px solid ${t.rowSep}` }}>
              <Check t={t} on={!!x.done} onClick={() => setMonth(mo => ({ ...mo, objectives: mo.objectives.map(o => (o.id === x.id ? { ...o, done: !o.done } : o)) }))} label={`Mark ${x.text} done`} />
              <InlineText
                t={t}
                value={x.text}
                onSave={v => setMonth(mo => ({ ...mo, objectives: mo.objectives.map(o => (o.id === x.id ? { ...o, text: v } : o)) }))}
                style={{ flex: 1, fontSize: 13, color: x.done ? t.sub : t.text, textDecoration: x.done ? "line-through" : "none" }}
              />
              <button aria-label="Delete objective" onClick={() => setMonth(mo => ({ ...mo, objectives: mo.objectives.filter(o => o.id !== x.id) }))} style={iconBtn(t)}>×</button>
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
// The dashboard page: each quarter's goals beside its three months of days,
// with the mission, key, day tally and rules alongside.
function GoalEditor({ wm, goal }) {
  const { t, areas, config } = wm;
  const linked = config.metrics.find(m => m.id === goal.metricId);
  const small  = { padding: "4px 9px", fontSize: 11 };
  return (
    <div style={{ padding: "2px 0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {[["open", "Open"], ["hit", "Hit"], ["missed", "Missed"]].map(([id, label]) => (
          <button key={id} onClick={() => wm.patchGoal(goal.id, { status: id })} aria-pressed={goal.status === id} style={btnStyle(t, goal.status === id ? "solid" : "ghost", small)}>{label}</button>
        ))}
        {goal.status !== "moved" && (() => {
          const n = wm.nextQuarterFor(goal);
          return <button onClick={() => wm.moveGoalToNextQuarter(goal)} style={btnStyle(t, "ghost", small)}>Move to Q{n.q}{n.year !== goal.year ? ` ${n.year}` : ""}</button>;
        })()}
        <span style={{ flex: 1 }} />
        <button onClick={() => wm.deleteGoal(goal.id)} style={btnStyle(t, "ghost", { ...small, color: "#ef4444" })}>Delete</button>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <AreaPicker value={goal.area} areas={areas} onChange={a => wm.patchGoal(goal.id, { area: a })} />
        <input value={goal.title} onChange={e => wm.patchGoal(goal.id, { title: e.target.value })} aria-label="Goal" style={inputStyle(t, { flex: 1, padding: "5px 8px", fontSize: 12 })} />
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 11, color: t.sub }}>
        <span>From</span>
        <NumberField t={t} width={64} value={goal.start} placeholder="0" onSave={v => wm.patchGoal(goal.id, { start: v })} />
        <span>to</span>
        <NumberField t={t} width={64} value={goal.target} placeholder="target" onSave={v => wm.patchGoal(goal.id, { target: v })} />
        <input value={goal.unit || ""} onChange={e => wm.patchGoal(goal.id, { unit: e.target.value })} placeholder="unit" aria-label="Unit" style={inputStyle(t, { width: 60, padding: "6px 8px", fontSize: 12 })} />
        {goal.target != null && !linked && (
          <>
            <span>now</span>
            <NumberField t={t} width={64} value={goal.current} onSave={v => wm.patchGoal(goal.id, { current: v })} />
          </>
        )}
        <select value={goal.metricId || ""} onChange={e => wm.patchGoal(goal.id, { metricId: e.target.value || null })} aria-label="Progress source" style={inputStyle(t, { width: "auto", padding: "5px 6px", fontSize: 11 })}>
          <option value="">Update by hand</option>
          {config.metrics.map(m => <option key={m.id} value={m.id}>Auto from {m.label}</option>)}
        </select>
      </div>
    </div>
  );
}

function GoalLine({ wm, goal, open, onToggle }) {
  const { t } = wm;
  const prog = wm.goalProgress(goal);
  const area = wm.areaOf(goal.area);
  const st   = goal.status;
  const tag  = { hit: ["HIT", "#22c55e"], missed: ["MISSED", "#ef4444"], moved: ["MOVED ON", "#f59e0b"] }[st];
  return (
    <div style={{ borderBottom: `1px solid ${t.rowSep}` }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{ display: "flex", gap: 9, width: "100%", textAlign: "left", background: "none", border: "none", padding: "8px 0", cursor: "pointer", fontFamily: "inherit", alignItems: "stretch" }}
      >
        <span style={{ width: 3, borderRadius: 2, background: area.color, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, overflowWrap: "anywhere", color: st === "open" ? t.text : st === "missed" ? "#ef4444" : t.sub, textDecoration: st === "hit" || st === "moved" ? "line-through" : "none" }}>
              {goal.title || "Untitled goal"}
            </span>
            {goal.slips > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b" }}>slipped ×{goal.slips}</span>}
          </span>
          {goal.target != null && (
            <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
              <span style={{ flex: 1 }}><Bar t={t} pct={prog.pct} color={area.color} h={3} /></span>
              <span style={{ fontSize: 10.5, color: t.sub, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{prog.text}</span>
            </span>
          )}
        </span>
        {tag && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: tag[1], flexShrink: 0, paddingTop: 3 }}>{tag[0]}</span>}
      </button>
      {open && <GoalEditor wm={wm} goal={goal} />}
    </div>
  );
}

function AddGoal({ wm, year, q, onDone }) {
  const { t, areas, config } = wm;
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
    onDone?.();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <AreaPicker value={area} areas={areas} onChange={setArea} />
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") onDone?.(); }}
          placeholder={`A Q${q} goal…`}
          aria-label={`New Q${q} goal`}
          style={inputStyle(t, { flex: 1 })}
        />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 24, alignItems: "center" }}>
        <input value={nums.start} onChange={e => setNums({ ...nums, start: e.target.value })} placeholder="From (optional)" inputMode="decimal" aria-label="Start value" style={inputStyle(t, { width: 116, padding: "6px 8px", fontSize: 12 })} />
        <input value={nums.target} onChange={e => setNums({ ...nums, target: e.target.value })} placeholder="Target" inputMode="decimal" aria-label="Target value" style={inputStyle(t, { width: 76, padding: "6px 8px", fontSize: 12 })} />
        <input value={nums.unit} onChange={e => setNums({ ...nums, unit: e.target.value })} placeholder="Unit" aria-label="Unit" style={inputStyle(t, { width: 64, padding: "6px 8px", fontSize: 12 })} />
        <select value={nums.metricId} onChange={e => setNums({ ...nums, metricId: e.target.value })} aria-label="Progress source" style={inputStyle(t, { width: "auto", padding: "5px 6px", fontSize: 12 })}>
          <option value="">Update by hand</option>
          {config.metrics.map(m => <option key={m.id} value={m.id}>Auto from {m.label}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <button onClick={() => onDone?.()} style={btnStyle(t, "ghost", { padding: "6px 10px" })}>Cancel</button>
        <button onClick={submit} style={btnStyle(t, "solid", { padding: "6px 12px" })}>Add goal</button>
      </div>
    </div>
  );
}

function MiniMonth({ wm, y, m0, openDay }) {
  const { t } = wm;
  const mk    = `${y}-${pad(m0 + 1)}`;
  const first = `${mk}-01`;
  return (
    <div style={{ minWidth: 0 }}>
      <button
        onClick={() => wm.openMonth(first)}
        title={`Open ${MONTH_NAMES[m0]}`}
        style={{ background: "none", border: "none", padding: "0 0 6px", cursor: "pointer", fontSize: 11, fontWeight: 800, letterSpacing: 2, color: monthOf(wm.today) === mk ? t.text : t.sub, fontFamily: "inherit" }}
      >{MONTH_SHORT[m0]}</button>
      <div className="wm-mini">
        {WEEKDAYS.map((d, i) => <div key={i} className="wm-mini-wd" style={{ fontSize: 8.5, color: t.dim, textAlign: "center", fontWeight: 700 }}>{d[0]}</div>)}
        {Array.from({ length: weekdayIx(first) }, (_, i) => <div key={`l${i}`} />)}
        {Array.from({ length: daysInMonth(y, m0) }, (_, i) => {
          const s   = `${mk}-${pad(i + 1)}`;
          const r   = wm.ratingById(wm.getDay(s).rating);
          const fut = s > wm.today;
          return (
            <button
              key={s}
              onClick={() => openDay(s)}
              className="wm-mini-day"
              title={`${fmtDay(s)}${r ? ` · ${r.label}` : ""}`}
              aria-label={`${fmtDay(s)}${r ? `, ${r.label}` : ""}`}
              style={{
                background: r ? r.color : fut ? "transparent" : t.empty,
                color: r ? "#0a0a0a" : fut ? t.dim : t.sub,
                border: s === wm.today ? `1.5px solid ${t.text}` : `1px solid ${fut ? t.border : "transparent"}`,
                fontWeight: r ? 700 : 500,
              }}
            >{i + 1}</button>
          );
        })}
      </div>
    </div>
  );
}

function QuarterBand({ wm, year, q, currentQ, openDay }) {
  const { t, config } = wm;
  const [openGoal, setOpenGoal] = useState(null);
  const [adding, setAdding]     = useState(false);
  const [qs, qe]  = quarterRange(year, q);
  const goals     = wm.goals.filter(g => g.year === year && g.q === q);
  const ended     = qe < wm.today;
  const isNow     = q === currentQ;
  const pending   = ended ? goals.filter(g => g.status === "open").length : 0;
  const hit       = goals.filter(g => g.status === "hit").length;
  const daysLeft  = isNow ? Math.round((fromKey(qe) - fromKey(wm.today)) / 86400000) : null;
  const noteKey   = `${year}-Q${q}`;
  const note      = config.quarterNotes?.[noteKey] || "";

  return (
    <section className="wm-qband" style={{ background: t.card, border: `1px solid ${isNow ? "#22c55e66" : t.border}`, borderRadius: 14, padding: 16 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: t.text }}>Q{q}</h3>
          <span style={{ fontSize: 10, color: t.sub, letterSpacing: 2, fontWeight: 700 }}>{MONTH_SHORT[q * 3 - 3]}–{MONTH_SHORT[q * 3 - 1]}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: isNow ? "#22c55e" : t.sub }}>
            {isNow ? `NOW · ${daysLeft}d left` : ended ? `${hit}/${goals.length} hit` : qs > wm.today ? "AHEAD" : ""}
          </span>
        </div>
        {pending > 0 && <div style={{ fontSize: 11.5, color: "#f59e0b", margin: "2px 0 4px", lineHeight: 1.4 }}>{pending} goal{pending > 1 ? "s" : ""} still open. Tap each one: hit, missed, or move on.</div>}
        {goals.length === 0 && !adding && <div style={{ fontSize: 13, color: t.dim, padding: "6px 0" }}>No goals for Q{q} yet.</div>}
        {goals.map(g => <GoalLine key={g.id} wm={wm} goal={g} open={openGoal === g.id} onToggle={() => setOpenGoal(o => (o === g.id ? null : g.id))} />)}
        {adding
          ? <AddGoal wm={wm} year={year} q={q} onDone={() => setAdding(false)} />
          : <button onClick={() => setAdding(true)} style={{ background: "none", border: "none", color: t.sub, fontSize: 12, cursor: "pointer", padding: "8px 0 2px", fontFamily: "inherit" }}>+ Add goal</button>}
        <textarea
          className="wm-ghost"
          value={note}
          onChange={e => wm.setConfig({ quarterNotes: { ...config.quarterNotes, [noteKey]: e.target.value } })}
          placeholder="Quarter thesis (optional)"
          aria-label={`Q${q} note`}
          rows={Math.max(1, Math.min(4, Math.ceil(note.length / 55)))}
          style={{ marginTop: 6, width: "100%", resize: "vertical", background: "transparent", color: t.sub, fontSize: 12, fontStyle: "italic", lineHeight: 1.5, fontFamily: "inherit", borderRadius: 8, padding: "6px 8px", outline: "none", display: "block" }}
        />
      </div>
      <div className="wm-qmonths">
        {[0, 1, 2].map(i => <MiniMonth key={i} wm={wm} y={year} m0={q * 3 - 3 + i} openDay={openDay} />)}
      </div>
    </section>
  );
}

function YearView({ wm, year, setDate, openDay }) {
  const { t, config, ratings } = wm;
  const today    = wm.today;
  const thisYear = Number(today.slice(0, 4));
  const currentQ = thisYear === year ? quarterOf(today) : 0;

  const counts = Object.fromEntries(ratings.map(r => [r.id, 0]));
  let unrated = 0, best = 0, run = 0;
  for (let m0 = 0; m0 < 12; m0++) {
    for (let d = 1; d <= daysInMonth(year, m0); d++) {
      const s = `${year}-${pad(m0 + 1)}-${pad(d)}`;
      if (s > today) break;
      const r = wm.getDay(s).rating;
      if (r && counts[r] != null) counts[r]++;
      else if (s < today) unrated++;
      // Rest and away days neither extend nor break a streak; an unrated today doesn't break it yet
      if (r === "won") { run++; best = Math.max(best, run); }
      else if (r !== "rest" && r !== "away" && s !== today) run = 0;
    }
  }

  const [newRule, setNewRule] = useState("");
  const addRule = () => { const v = newRule.trim(); if (!v) return; wm.setConfig({ rules: [...config.rules, v] }); setNewRule(""); };

  return (
    <div>
      <NavRow
        t={t}
        label={`${year}`}
        sub={currentQ ? `Q${currentQ} · ${Math.max(0, Math.round((new Date(year, 11, 31) - fromKey(today)) / 86400000))} days left in the year` : null}
        onPrev={() => setDate(`${year - 1}-01-01`)}
        onNext={() => setDate(`${year + 1}-01-01`)}
        right={thisYear !== year && <button onClick={() => setDate(today)} style={btnStyle(t)}>This year</button>}
      />

      <div className="wm-year">
        <div className="wm-year-q">
          {[1, 2, 3, 4].map(q => <QuarterBand key={`${year}-${q}`} wm={wm} year={year} q={q} currentQ={currentQ} openDay={openDay} />)}
        </div>

        <div className="wm-year-top">
          <Card t={t} title="MISSION">
            <NoteArea
              t={t}
              rows={Math.max(3, Math.ceil((config.mission?.length || 0) / 28) + 1)}
              value={config.mission}
              onChange={v => wm.setConfig({ mission: v })}
              placeholder="Why this year matters. Read it every morning."
              style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.45 }}
            />
          </Card>
          <Card t={t} title="KEY">
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {wm.areas.map(a => (
                <div key={a.id} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: a.color, marginTop: 3, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, lineHeight: 1.4, minWidth: 0 }}>
                    <b style={{ color: t.text }}>{a.label}</b>
                    {a.goal && <span style={{ color: t.sub }}> · {a.goal}</span>}
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Card t={t} title="DAYS" right={<span style={{ fontSize: 11, color: t.sub }}>won streak {run} · best {best}</span>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {ratings.map(r => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: r.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, color: t.sub }}>{r.label}</span>
                  <b style={{ color: t.text, fontVariantNumeric: "tabular-nums" }}>{counts[r.id]}</b>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: t.empty, flexShrink: 0 }} />
                <span style={{ flex: 1, color: t.sub }}>Not rated</span>
                <b style={{ color: t.text, fontVariantNumeric: "tabular-nums" }}>{unrated}</b>
              </div>
            </div>
          </Card>
        </div>

        <div className="wm-year-rules">
          <Card t={t} title="RULES">
            {config.rules.length === 0 && <div style={{ fontSize: 13, color: t.dim }}>Non-negotiables. They show at the top of each day.</div>}
            {config.rules.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${t.rowSep}` }}>
                <span style={{ fontSize: 12, color: t.sub, width: 16, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                <InlineText t={t} value={r} onSave={v => wm.setConfig({ rules: config.rules.map((x, j) => (j === i ? v : x)) })} style={{ flex: 1, fontSize: 13, color: t.text }} />
                <button aria-label="Delete rule" onClick={() => wm.setConfig({ rules: config.rules.filter((_, j) => j !== i) })} style={iconBtn(t)}>×</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input value={newRule} onChange={e => setNewRule(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addRule(); }} placeholder="Add a rule…" aria-label="New rule" style={inputStyle(t, { flex: 1 })} />
              <button onClick={addRule} style={btnStyle(t, "solid")}>Add</button>
            </div>
          </Card>
        </div>
      </div>
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
  const [view, setViewState] = useState(() => { try { return localStorage.getItem(VIEW_KEY) || "month"; } catch { return "month"; } });
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
  // A goal slipping out of a finished quarter lands in the current one, not another past quarter
  const nextQuarterFor = (g) => {
    const next = g.q === 4 ? { year: g.year + 1, q: 1 } : { year: g.year, q: g.q + 1 };
    return quarterRange(next.year, next.q)[1] < today ? { year: Number(today.slice(0, 4)), q: quarterOf(today) } : next;
  };
  const moveGoalToNextQuarter = (g) => {
    const next = nextQuarterFor(g);
    setGoals([
      ...goals.map(x => (x.id === g.id ? { ...x, status: "moved" } : x)),
      { ...g, ...next, id: uid(), status: "open", slips: (g.slips || 0) + 1, current: g.current },
    ]);
  };

  const wm = {
    t, store, today, config, setConfig, goals, setGoals, weeks, setWeek, months, setMonth,
    getDay, updateDay, routineFor, moveTask, weekMetrics, goalProgress, patchGoal, deleteGoal, moveGoalToNextQuarter, nextQuarterFor,
    areas, areaOf, ratings, ratingById, ratingLabel, setView,
    openWeek:  (s) => { setDate(s); setView("week"); },
    openMonth: (s) => { setDate(s); setView("month"); },
  };

  const year = Number(date.slice(0, 4));
  const doy  = Math.round((fromKey(today) - new Date(fromKey(today).getFullYear(), 0, 1)) / 86400000) + 1;

  return (
    <div style={{ minHeight: "calc(100vh - 52px)", background: t.bg, color: t.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`
        .wm-wrap { max-width: 1180px; margin: 0 auto; padding: 20px 20px 48px; }
        .wm-wrap.wm-wide { max-width: 1480px; }
        .wm-wrap *, .wm-wrap *::before, .wm-wrap *::after { box-sizing: border-box; }
        .wm-grid2 { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 16px; align-items: start; }
        .wm-strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
        .wm-setup-row { display: flex; gap: 10px; align-items: center; padding: 8px 0; flex-wrap: wrap; }
        .wm-wrap input:focus, .wm-wrap textarea:focus, .wm-wrap select:focus { border-color: ${t.sub} !important; }
        .wm-wrap button:focus-visible { outline: 2px solid ${t.sub}; outline-offset: 2px; }

        /* Month: the sheet's page — lists in the cells, weekly goals on the right */
        .wm-month { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)) minmax(0, 1.15fr); grid-template-rows: auto; grid-auto-rows: minmax(132px, auto); gap: 6px; }
        .wm-month-panel { display: none; }
        .wm-task-actions { opacity: 0; transition: opacity 0.15s; }
        .wm-task:hover .wm-task-actions, .wm-task:focus-within .wm-task-actions, .wm-daylist-panel .wm-task-actions { opacity: 1; }
        .wm-add { opacity: 0.3; transition: opacity 0.15s; }
        .wm-daycell:hover .wm-add, .wm-weekgoals:hover .wm-add, .wm-add:focus-visible, .wm-daylist-panel .wm-add { opacity: 1; }
        @media (hover: none) { .wm-task-actions, .wm-add { opacity: 1; } }

        /* Year: the dashboard — quarter bands of goals beside their months */
        .wm-year { display: grid; grid-template-columns: minmax(0, 1fr) 300px; grid-template-areas: "q top" "q rules"; grid-template-rows: auto 1fr; gap: 16px; align-items: start; }
        .wm-year-q { grid-area: q; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
        .wm-year-top { grid-area: top; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
        .wm-year-rules { grid-area: rules; min-width: 0; }
        .wm-qband { display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.4fr); gap: 24px; align-items: start; }
        .wm-qmonths { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
        .wm-mini { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; }
        .wm-mini-day { aspect-ratio: 1; min-width: 0; padding: 0; border-radius: 4px; font-size: 10px; font-family: inherit; cursor: pointer; display: flex; align-items: center; justify-content: center; font-variant-numeric: tabular-nums; }
        .wm-ghost { border: 1px dashed transparent; }
        .wm-ghost:hover, .wm-ghost:focus { border-color: ${t.inputBorder}; }

        @media (max-width: 1100px) {
          .wm-year { grid-template-columns: minmax(0, 1fr); grid-template-areas: "top" "q" "rules"; }
          .wm-year-top { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: start; }
        }
        @media (max-width: 860px) {
          .wm-grid2, .wm-qband { grid-template-columns: minmax(0, 1fr); }
        }
        @media (max-width: 700px) {
          .wm-wrap { padding: 14px 12px 40px; }
          .wm-strip { gap: 4px; }
          .wm-year-top { grid-template-columns: minmax(0, 1fr); }
          .wm-qmonths { gap: 8px; }
          .wm-mini { gap: 2px; }
          .wm-mini-day { font-size: 0; border-radius: 2px; }
          .wm-month { grid-template-columns: repeat(7, minmax(0, 1fr)); grid-auto-rows: minmax(48px, auto); gap: 4px; }
          .wm-weekcol, .wm-cell-body, .wm-cell-pct, .wm-cell-dot { display: none !important; }
          .wm-daynum { pointer-events: none; }
          .wm-daycell { cursor: pointer; }
          .wm-daycell.is-sel { outline: 2px solid ${t.text}; outline-offset: 1px; }
          .wm-month-panel { display: flex; flex-direction: column; gap: 16px; }
        }
      `}</style>

      <div className={`wm-wrap${view === "month" || view === "year" ? " wm-wide" : ""}`}>
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
              { id: "year",  label: "Year" },
              { id: "month", label: "Month" },
              { id: "week",  label: "Week" },
              { id: "day",   label: "Day" },
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
