import { useState, useEffect, useCallback, useRef } from "react";
import MacroTracker from "./MacroTracker";
import { supabase } from "./supabase";
import AuthScreen from "./AuthScreen";

// ─── localStorage persistence ─────────────────────────────────────────────────
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
      return true;
    }
    catch { return false; }
  },
  setFromRemote(key, val, remoteMs) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      const ts = JSON.parse(localStorage.getItem("yz-ts") || "{}");
      ts[key] = remoteMs;
      localStorage.setItem("yz-ts", JSON.stringify(ts));
      return true;
    }
    catch { return false; }
  },
  ts(key) {
    try { return JSON.parse(localStorage.getItem("yz-ts") || "{}")[key] || 0; }
    catch { return 0; }
  },
};

// ─── Supabase sync ────────────────────────────────────────────────────────────
// Module-level tracker so syncToSupabase can report status to the App component
// without needing React deps. The App sets _syncTracker.onChange on mount.
const _syncTracker = { pending: 0, onChange: null };

const syncToSupabase = async (userId, key, value) => {
  if (!userId) return;
  _syncTracker.pending++;
  _syncTracker.onChange?.("syncing");
  try {
    const { error } = await supabase.from("yz_data").upsert(
      { user_id: userId, key, value, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    );
    _syncTracker.pending = Math.max(0, _syncTracker.pending - 1);
    if (error) {
      console.error("[sync] push error for", key, error);
      _syncTracker.onChange?.("failed");
    } else if (_syncTracker.pending === 0) {
      _syncTracker.onChange?.("synced");
    }
  } catch (e) {
    _syncTracker.pending = Math.max(0, _syncTracker.pending - 1);
    console.error("[sync] push exception:", key, e);
    _syncTracker.onChange?.("failed");
  }
};

// Smart pull: fetch all rows and pull only keys where Supabase is newer than local.
// Returns the number of keys updated.
const smartPullNewerFromSupabase = async (userId) => {
  if (!userId) return 0;
  const { data, error } = await supabase
    .from("yz_data")
    .select("key, value, updated_at")
    .eq("user_id", userId);
  if (error || !data?.length) return 0;
  let updated = 0;
  data.forEach(({ key, value, updated_at }) => {
    const remoteMs = new Date(updated_at).getTime();
    const localMs = ls.ts(key);
    // 1 s buffer avoids pulling back our own just-written data
    if (remoteMs > localMs + 1000) {
      // Skip if value is identical (extra safety guard against echo)
      const localVal = ls.get(key);
      if (JSON.stringify(localVal) === JSON.stringify(value)) return;
      ls.setFromRemote(key, value, remoteMs);
      console.log("[sync] pulled newer:", key, `(remote ${remoteMs} > local ${localMs})`);
      updated++;
    }
  });
  return updated;
};

const pushAllToSupabase = async (userId) => {
  if (!userId) return;
  const upserts = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("yz-") && k !== "yz-ts") {
      upserts.push({ user_id: userId, key: k, value: ls.get(k), updated_at: new Date().toISOString() });
    }
  }
  if (!upserts.length) return;
  const { error } = await supabase.from("yz_data").upsert(upserts, { onConflict: "user_id,key" });
  if (error) throw error;
};

const pullMissingFromSupabase = async (userId) => {
  if (!userId) return 0;
  const { data, error } = await supabase.from("yz_data").select("key, value").eq("user_id", userId);
  if (error) throw error;
  let filled = 0;
  (data || []).forEach(({ key, value }) => {
    if (localStorage.getItem(key) === null) {
      ls.setFromRemote(key, value, Date.now());
      filled++;
    }
  });
  return filled;
};

const pullAllFromSupabase = async (userId) => {
  if (!userId) return;
  const { data, error } = await supabase.from("yz_data").select("key, value").eq("user_id", userId);
  if (error) throw error;
  (data || []).forEach(({ key, value }) => { ls.setFromRemote(key, value, Date.now()); });
};

const fetchSupabaseSnapshot = async (userId) => {
  if (!userId) return [];
  const { data, error } = await supabase.from("yz_data").select("key, value, updated_at").eq("user_id", userId);
  if (error) throw error;
  return data || [];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getWeekKey = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `yz-week-${d.toISOString().slice(0, 10)}`;
};
const todayStr = () => new Date().toISOString().slice(0, 10);
const weekKeyForDate = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `yz-week-${d.toISOString().slice(0, 10)}`;
};
const getDayChecks = (wd, dayStr) => {
  if (!wd) return null;
  if (wd.dailyChecks?.[dayStr]) return wd.dailyChecks[dayStr];
  if (wd.checks) return wd.checks;
  return null;
};

// ─── Config ───────────────────────────────────────────────────────────────────
const DEFAULT_SECTIONS = {
  business: {
    label: "Business", color: "#00FF88", icon: "◈", goal: "Leave Corporate · £15k/month",
    daily: [
      { label: "100 Outbound touches", unit: "/day", key: "d0" },
      { label: "30min Follow-ups", unit: "min", key: "d1" },
      { label: "30min Fulfillment/skill", unit: "min", key: "d2" },
      { label: "Pipeline update", unit: "10min", key: "d3" },
    ],
    weekly: [
      { label: "Reach outs", min: 0, max: 700, target: 500, unit: "reach outs", suffix: "/ 500", key: "w0" },
      { label: "Sales calls", min: 0, max: 15, target: 4, unit: "calls", suffix: "/ 4-6", key: "w1" },
      { label: "CRM cleanup", min: 0, max: 4, target: 1, unit: "hrs", suffix: "/ 1-2 hrs", key: "w2" },
      { label: "Authority post", min: 0, max: 5, target: 1, unit: "posts", suffix: "/ 1", key: "w3" },
    ],
  },
  fatLoss: {
    label: "Fat Loss", color: "#FF6B35", icon: "◉", goal: "102 kg → 85 kg",
    daily: [
      { label: "Log calories ~2000 kcal", unit: "kcal", key: "d0" },
      { label: "≥130g protein", unit: "g", key: "d1" },
      { label: "8,000+ steps", unit: "steps", key: "d2" },
      { label: "2-3L water", unit: "L", key: "d3" },
    ],
    weekly: [
      { label: "Strength sessions", min: 0, max: 7, target: 3, unit: "sessions", suffix: "/ 3", key: "w0" },
      { label: "Cardio sessions", min: 0, max: 7, target: 1, unit: "sessions", suffix: "/ 1 opt.", key: "w1" },
      { label: "Weigh-ins", min: 0, max: 7, target: 7, unit: "days", suffix: "/ 7", key: "w2" },
      { label: "Avg loss (kg)", min: 0, max: 2, target: 0.35, unit: "kg", suffix: "/ -0.35 kg", step: 0.05, key: "w3" },
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
      { label: "Net worth updated", min: 0, max: 1, target: 1, unit: "done", suffix: "/ 1", type: "check", key: "w0" },
      { label: "Spending reviewed", min: 0, max: 1, target: 1, unit: "done", suffix: "/ 1", type: "check", key: "w1" },
      { label: "Business cash logged", min: 0, max: 1, target: 1, unit: "done", suffix: "/ 1", type: "check", key: "w2" },
      { label: "50% profit transferred", min: 0, max: 1, target: 1, unit: "done", suffix: "/ 1", type: "check", key: "w3" },
    ],
  },
  social: {
    label: "Grow @X", color: "#A78BFA", icon: "◍", goal: "0 → 5,000 Followers",
    daily: [
      { label: "Write/refine post", unit: "30min", key: "d0" },
      { label: "Record short video", unit: "20min", key: "d1" },
      { label: "Comments + DMs", unit: "20min", key: "d2" },
      { label: "Meaningful comments", unit: "5-10", key: "d3" },
    ],
    weekly: [
      { label: "Main posts", min: 0, max: 10, target: 5, unit: "posts", suffix: "/ 5", key: "w0" },
      { label: "Reels / videos", min: 0, max: 10, target: 3, unit: "videos", suffix: "/ 3", key: "w1" },
      { label: "Comments left", min: 0, max: 150, target: 35, unit: "comments", suffix: "/ 35-70", key: "w2" },
      { label: "DMs sent", min: 0, max: 50, target: 20, unit: "DMs", suffix: "/ 20", key: "w3" },
    ],
  },
};

// Remove stale yz-sections if it contains a "deen" key
{
  const _saved = ls.get("yz-sections");
  if (_saved && "deen" in _saved) {
    localStorage.removeItem("yz-sections");
    const _ts = JSON.parse(localStorage.getItem("yz-ts") || "{}");
    delete _ts["yz-sections"];
    localStorage.setItem("yz-ts", JSON.stringify(_ts));
  }
}
const SECTIONS = ls.get("yz-sections") || DEFAULT_SECTIONS;

const DEFAULT_SCHED = [
  { label: "WEEKDAY", sub: "Mon–Fri · 3 hrs", color: "#A78BFA", blocks: ["60min — 100 outbound touches", "30min — Follow-ups + CRM", "30min — Write/refine post", "15min — Comments + DMs", "15min — Log calories + weight + spend"] },
  { label: "SATURDAY", sub: "6–7 hrs", color: "#FF6B35", blocks: ["2hrs — Deep client work + SOPs", "2hrs — List building + extra outreach", "1.5hrs — Batch content (posts + videos)", "30min — Weekly money review", "1hr — Long workout + steps"] },
  { label: "SUNDAY", sub: "6–7 hrs", color: "#FFD700", blocks: ["2hrs — Sales calls / review recordings", "1.5hrs — Long walk / cardio", "1.5hrs — Record, edit, schedule content", "1hr — Metrics review + next week plan"] },
];

const DEFAULT_TITLE = "YEAR ZERO";

const Q_THEMES = ["Validate · First clients", "Tighten systems · Scale", "Systemize · Case studies", "Transition · Solidify ops"];

const emptyChecks = (secs = SECTIONS) =>
  Object.fromEntries(Object.keys(secs).map(k => [k, new Array(secs[k].daily.length).fill(false)]));
const emptyActuals = (secs = SECTIONS) =>
  Object.fromEntries(Object.keys(secs).map(k => [k, new Array(secs[k].weekly.length).fill(null)]));

// Normalise per-section checks from old array format to new object (key→bool) format.
const normAllChecks = (rawChecks, secs) => {
  if (!rawChecks) return emptyChecks(secs);
  const result = {};
  for (const [sec, cur] of Object.entries(rawChecks)) {
    const section = secs?.[sec];
    if (!section) { result[sec] = cur; continue; }
    if (Array.isArray(cur)) {
      const obj = {};
      section.daily.forEach((task, i) => { obj[task.key] = cur[i] || false; });
      result[sec] = obj;
    } else {
      result[sec] = cur || {};
    }
  }
  return result;
};

// ─── InlineEdit ───────────────────────────────────────────────────────────────
function InlineEdit({ value, onSave, editMode, style = {}, number = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);

  const commit = () => {
    const v = number ? (parseFloat(draft) || 0) : (draft.trim() || String(value));
    onSave(v);
    setEditing(false);
  };

  if (!editMode) return <span style={style}>{value}</span>;

  if (editing) {
    return (
      <input
        autoFocus
        type={number ? "number" : "text"}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
          e.stopPropagation();
        }}
        onClick={e => e.stopPropagation()}
        style={{
          background: "#0d0d0d",
          border: "none",
          borderBottom: "1px solid #666",
          outline: "none",
          color: style.color || "#fff",
          fontSize: style.fontSize || 12,
          fontFamily: style.fontFamily || "inherit",
          letterSpacing: style.letterSpacing || "inherit",
          textTransform: style.textTransform || "none",
          width: number ? 52 : "auto",
          minWidth: 36,
          maxWidth: 220,
          padding: "1px 2px",
          borderRadius: 0,
        }}
      />
    );
  }

  return (
    <span
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      title="Click to edit"
      style={{ ...style, cursor: "text", borderBottom: "1px dashed #444" }}
    >
      {value}
    </span>
  );
}

// ─── ColorSwatch ──────────────────────────────────────────────────────────────
function ColorSwatch({ color, onSave, editMode }) {
  if (!editMode) return null;
  return (
    <label style={{ cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center" }} title="Change colour">
      <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", background: color, border: "2px solid #444" }} />
      <input
        type="color"
        value={color}
        onChange={e => onSave(e.target.value)}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
      />
    </label>
  );
}

// ─── Ring ─────────────────────────────────────────────────────────────────────
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

// ─── CheckRow ─────────────────────────────────────────────────────────────────
function CheckRow({ label, unit, done, color, onToggle, editMode, onUpdateLabel, onUpdateUnit, onDelete }) {
  if (editMode) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid #181818" }}>
        <InlineEdit value={label} onSave={onUpdateLabel} editMode={true}
          style={{ fontSize: 12, color: "#bbb", flex: 1, minWidth: 0 }} />
        <span style={{ color: "#333", fontSize: 11, flexShrink: 0 }}>·</span>
        <InlineEdit value={unit} onSave={onUpdateUnit} editMode={true}
          style={{ fontSize: 11, color: "#555", flexShrink: 0 }} />
        <button onClick={onDelete}
          style={{ background: "none", border: "none", color: "#444", fontSize: 16, cursor: "pointer", padding: "0 4px", lineHeight: 1, flexShrink: 0 }}
          title="Delete">×</button>
      </div>
    );
  }
  return (
    <button onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: "5px 0", width: "100%", textAlign: "left" }}>
      <span style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${done ? color : "#3a3a3a"}`, background: done ? color + "22" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.18s", boxShadow: done ? `0 0 7px ${color}55` : "none" }}>
        {done && <span style={{ color, fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
      </span>
      <span style={{ fontSize: 13, color: done ? "#444" : "#bbb", textDecoration: done ? "line-through" : "none", letterSpacing: 0.2 }}>
        {label} · {unit}
      </span>
    </button>
  );
}

// ─── InputModal ───────────────────────────────────────────────────────────────
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

// ─── WeekCard ─────────────────────────────────────────────────────────────────
function WeekCard({ item, color, onClick, editMode, onUpdateLabel, onUpdateTarget, onUpdateUnit, onDelete }) {
  const hasData = item.actual !== null && item.actual !== undefined;
  const isCheck = item.type === "check";
  const pct = hasData ? Math.min(Math.round((item.actual / item.target) * 100), 100) : 0;
  const hit = hasData && item.actual >= item.target;
  const dc = hit ? "#00FF88" : color;

  if (editMode) {
    return (
      <div style={{ background: "#181818", borderRadius: 10, padding: "10px 12px", border: "1px solid #2a2a2a", display: "flex", flexDirection: "column", gap: 5 }}>
        <InlineEdit value={item.label} onSave={onUpdateLabel} editMode={true}
          style={{ fontSize: 10, color: "#bbb", display: "block" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, color: "#444" }}>target:</span>
          <InlineEdit value={item.target} onSave={v => onUpdateTarget(parseFloat(v) || 0)} editMode={true} number
            style={{ fontSize: 13, color, fontFamily: "'Bebas Neue', cursive" }} />
          <InlineEdit value={item.unit} onSave={onUpdateUnit} editMode={true}
            style={{ fontSize: 9, color: "#555" }} />
          <button onClick={onDelete}
            style={{ background: "none", border: "none", color: "#444", fontSize: 16, cursor: "pointer", padding: "0 2px", lineHeight: 1, marginLeft: "auto" }}
            title="Delete">×</button>
        </div>
      </div>
    );
  }

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

// ─── GoalCard ─────────────────────────────────────────────────────────────────
function GoalCard({ sectionKey, section, checks, onCheck, actuals, onSave, editMode, onUpdate, onUpdateChecks, onUpdateActuals, onReorder, viewDayOffset }) {
  const s = section;
  const [modal, setModal] = useState(null);
  const dd = Array.isArray(checks) ? checks.filter(Boolean).length : Object.values(checks).filter(Boolean).length;
  const wh = s.weekly.filter((w, i) => { const a = actuals[i]; return a !== null && a !== undefined && a >= w.target; }).length;
  const pct = Math.round(((dd + wh) / Math.max(s.daily.length + s.weekly.length, 1)) * 100);

  const addDailyTask = () => {
    const newItem = { label: "New task", unit: "once", key: `d${Date.now()}` };
    onUpdate(sec => ({ ...sec, daily: [...sec.daily, newItem] }));
    if (Array.isArray(checks)) {
      onUpdateChecks([...checks, false]);
    } else {
      onUpdateChecks({ ...checks, [newItem.key]: false });
    }
  };

  const deleteDailyTask = (i) => {
    const taskKey = s.daily[i]?.key;
    onUpdate(sec => ({ ...sec, daily: sec.daily.filter((_, j) => j !== i) }));
    if (Array.isArray(checks)) {
      onUpdateChecks(checks.filter((_, j) => j !== i));
    } else {
      const { [taskKey]: _removed, ...rest } = checks;
      onUpdateChecks(rest);
    }
  };

  const addWeeklyTarget = () => {
    const newItem = { label: "New target", min: 0, max: 10, target: 5, unit: "units", suffix: "/ 5", key: `w${Date.now()}` };
    onUpdate(sec => ({ ...sec, weekly: [...sec.weekly, newItem] }));
    onUpdateActuals([...actuals, null]);
  };

  const deleteWeeklyTarget = (i) => {
    if (modal === i) setModal(null);
    onUpdate(sec => ({ ...sec, weekly: sec.weekly.filter((_, j) => j !== i) }));
    onUpdateActuals(actuals.filter((_, j) => j !== i));
  };

  return (
    <>
      {!editMode && modal !== null && s.weekly[modal] && (
        <InputModal
          item={{ ...s.weekly[modal], actual: actuals[modal] ?? 0 }}
          color={s.color}
          onSave={v => { onSave(sectionKey, modal, v); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      <div style={{ background: "#111", border: `1px solid ${s.color}20`, borderRadius: 16, padding: 22, display: "flex", flexDirection: "column", gap: 18, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 130, height: 130, borderRadius: "50%", background: `radial-gradient(circle, ${s.color}07 0%, transparent 70%)`, pointerEvents: "none" }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3, flexWrap: "wrap" }}>
              <ColorSwatch color={s.color} onSave={c => onUpdate(sec => ({ ...sec, color: c }))} editMode={editMode} />
              <InlineEdit value={s.icon} onSave={v => onUpdate(sec => ({ ...sec, icon: v }))} editMode={editMode}
                style={{ color: s.color, fontSize: 18 }} />
              <InlineEdit value={s.label} onSave={v => onUpdate(sec => ({ ...sec, label: v }))} editMode={editMode}
                style={{ color: s.color, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }} />
            </div>
            <InlineEdit value={s.goal} onSave={v => onUpdate(sec => ({ ...sec, goal: v }))} editMode={editMode}
              style={{ color: "#fff", fontFamily: "'Bebas Neue', cursive", fontSize: 20, letterSpacing: 1 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 12 }}>
            {editMode && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <button
                  onClick={() => onReorder(-1)}
                  style={{ width: 24, height: 24, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 5, color: "#555", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 }}
                  title="Move up"
                >▲</button>
                <button
                  onClick={() => onReorder(1)}
                  style={{ width: 24, height: 24, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 5, color: "#555", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 }}
                  title="Move down"
                >▼</button>
              </div>
            )}
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Ring pct={pct} color={s.color} size={60} />
              <span style={{ position: "absolute", fontFamily: "'Bebas Neue', cursive", fontSize: 13, color: "#fff", letterSpacing: 1 }}>{pct}%</span>
            </div>
          </div>
        </div>

        {/* Daily non-negotiables */}
        <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: 14 }}>
          <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 7 }}>DAILY NON-NEGOTIABLES</div>
          {s.daily.map((item, i) => (
            <CheckRow
              key={item.key}
              label={item.label}
              unit={item.unit}
              done={Array.isArray(checks) ? checks[i] || false : checks[item.key] || false}
              color={s.color}
              onToggle={() => onCheck(sectionKey, item.key)}
              editMode={editMode}
              onUpdateLabel={v => onUpdate(sec => ({ ...sec, daily: sec.daily.map((d, j) => j === i ? { ...d, label: v } : d) }))}
              onUpdateUnit={v => onUpdate(sec => ({ ...sec, daily: sec.daily.map((d, j) => j === i ? { ...d, unit: v } : d) }))}
              onDelete={() => deleteDailyTask(i)}
            />
          ))}
          {editMode && (
            <button onClick={addDailyTask} style={{ marginTop: 8, width: "100%", padding: "6px 0", background: "#1a1a1a", border: "1px dashed #2a2a2a", borderRadius: 6, color: "#444", fontSize: 10, cursor: "pointer", letterSpacing: 1 }}>
              + ADD DAILY TASK
            </button>
          )}
        </div>

        {/* Weekly targets */}
        <div style={{ borderTop: "1px solid #1e1e1e", paddingTop: 14 }}>
          <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 10 }}>
            WEEKLY TARGETS {!editMode && <span style={{ color: "#2a2a2a" }}>· tap to log</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            {s.weekly.map((w, i) => (
              <WeekCard
                key={w.key || i}
                item={{ ...w, actual: actuals[i] }}
                color={s.color}
                onClick={() => !editMode && setModal(i)}
                editMode={editMode}
                onUpdateLabel={v => onUpdate(sec => ({ ...sec, weekly: sec.weekly.map((w2, j) => j === i ? { ...w2, label: v } : w2) }))}
                onUpdateTarget={v => onUpdate(sec => ({ ...sec, weekly: sec.weekly.map((w2, j) => j === i ? { ...w2, target: v, max: Math.max(w2.max, v * 2), suffix: `/ ${v}` } : w2) }))}
                onUpdateUnit={v => onUpdate(sec => ({ ...sec, weekly: sec.weekly.map((w2, j) => j === i ? { ...w2, unit: v } : w2) }))}
                onDelete={() => deleteWeeklyTarget(i)}
              />
            ))}
          </div>
          {editMode && (
            <button onClick={addWeeklyTarget} style={{ marginTop: 8, width: "100%", padding: "6px 0", background: "#1a1a1a", border: "1px dashed #2a2a2a", borderRadius: 6, color: "#444", fontSize: 10, cursor: "pointer", letterSpacing: 1 }}>
              + ADD WEEKLY TARGET
            </button>
          )}
        </div>

        {sectionKey === "fatLoss" && <MacroTracker color={s.color} editMode={editMode} viewDayOffset={viewDayOffset} />}
      </div>
    </>
  );
}

// ─── HistoryModal ─────────────────────────────────────────────────────────────
function HistoryModal({ history, sections, onClose }) {
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
          const pcts = Object.keys(sections).map(sec => {
            const s = sections[sec];
            let dailyDone = 0, dailyPossible = 0;
            if (wd.dailyChecks) {
              const days = Object.values(wd.dailyChecks);
              days.forEach(dc => { dailyDone += (dc[sec] || []).filter(Boolean).length; });
              dailyPossible = s.daily.length * Math.max(days.length, 1);
            } else {
              const c = wd.checks?.[sec] || [];
              dailyDone = c.filter(Boolean).length;
              dailyPossible = s.daily.length;
            }
            const a = wd.actuals?.[sec] || [];
            const w2 = s.weekly.filter((w, i) => { const v = a[i]; return v !== null && v !== undefined && v >= w.target; }).length;
            return Math.round(((dailyDone + w2) / Math.max(dailyPossible + s.weekly.length, 1)) * 100);
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
                {Object.keys(sections).map((sec, i) => (
                  <div key={sec} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "#444", marginBottom: 4 }}>{sections[sec].label}</div>
                    <div style={{ height: 3, background: "#252525", borderRadius: 2, overflow: "hidden", marginBottom: 3 }}><div style={{ height: "100%", width: `${pcts[i]}%`, background: sections[sec].color }} /></div>
                    <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 13, color: sections[sec].color }}>{pcts[i]}%</div>
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

// ─── SupabaseInspectorModal ───────────────────────────────────────────────────
function SupabaseInspectorModal({ data, onClose }) {
  const [expanded, setExpanded] = useState(null);
  const sorted = [...data].sort((a, b) => a.key.localeCompare(b.key));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000d", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 18, padding: 24, width: "min(720px, 96vw)", maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, color: "#fff", letterSpacing: 2 }}>SUPABASE SNAPSHOT</div>
            <div style={{ fontSize: 9, color: "#555", letterSpacing: 1, marginTop: 2 }}>{sorted.length} keys stored — click any row to inspect value</div>
          </div>
          <button onClick={onClose} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, color: "#666", padding: "7px 14px", cursor: "pointer", fontSize: 10 }}>CLOSE</button>
        </div>
        {sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "#444", fontSize: 11 }}>No data found in Supabase for this user.</div>
        ) : sorted.map(row => {
          const isExp = expanded === row.key;
          const localExists = localStorage.getItem(row.key) !== null;
          return (
            <div key={row.key} style={{ marginBottom: 6, borderRadius: 10, border: "1px solid #1e1e1e", overflow: "hidden" }}>
              <button onClick={() => setExpanded(isExp ? null : row.key)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#181818", border: "none", cursor: "pointer", textAlign: "left", gap: 10 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: row.key.includes("sections") ? "#FFD700" : "#bbb" }}>{row.key}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {!localExists && <span style={{ fontSize: 9, color: "#FF6B35", background: "#FF6B3514", border: "1px solid #FF6B3533", borderRadius: 4, padding: "2px 6px" }}>NOT LOCAL</span>}
                  <span style={{ fontSize: 9, color: "#444" }}>{new Date(row.updated_at).toLocaleString("en-GB")}</span>
                  <span style={{ color: "#444", fontSize: 10 }}>{isExp ? "▾" : "▸"}</span>
                </div>
              </button>
              {isExp && (
                <div style={{ padding: 14, background: "#0d0d0d", borderTop: "1px solid #1e1e1e" }}>
                  <pre style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "#666", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, maxHeight: 300, overflow: "auto" }}>
                    {JSON.stringify(row.value, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DayPicker ────────────────────────────────────────────────────────────────
function DayPicker({ selectedDay, onSelect }) {
  const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const today = todayStr();

  const getMondayOf = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };

  const [weekStart, setWeekStart] = useState(() => getMondayOf(selectedDay));

  useEffect(() => {
    setWeekStart(getMondayOf(selectedDay));
  }, [selectedDay]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const shiftWeek = (delta) => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d.toISOString().slice(0, 10));
  };

  const navBtn = (label, onClick) => (
    <button onClick={onClick} style={{ flexShrink: 0, width: 28, height: 44, borderRadius: 8, border: "1px solid #1e1e1e", background: "#111", color: "#555", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
      {label}
    </button>
  );

  return (
    <div style={{ padding: "12px 20px 0", display: "flex", alignItems: "center", gap: 6 }}>
      {navBtn("‹", () => shiftWeek(-1))}
      <div style={{ display: "flex", gap: 6, flex: 1, overflowX: "auto" }}>
        {days.map(day => {
          const d = new Date(day + "T00:00:00");
          const isToday = day === today;
          const isSel = day === selectedDay;
          const isFuture = day > today;
          const selColor = isFuture ? "#00D4FF" : "#00FF88";
          return (
            <button key={day} onClick={() => onSelect(day)} style={{ flexShrink: 0, flex: 1, minWidth: 40, padding: "8px 0", borderRadius: 10, border: `1px solid ${isSel ? selColor : isToday ? "#2a2a2a" : "#1a1a1a"}`, background: isSel ? selColor + "12" : isToday ? "#181818" : "#111", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 8, color: isSel ? selColor : isFuture ? "#2a4a55" : "#444", letterSpacing: 1 }}>{DAY_NAMES[d.getDay()]}</span>
              <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 18, color: isSel ? selColor : isToday ? "#bbb" : isFuture ? "#334" : "#444", letterSpacing: 1, lineHeight: 1, filter: isSel ? `drop-shadow(0 0 5px ${selColor}88)` : "none" }}>{d.getDate()}</span>
              {isToday && !isSel && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#333" }} />}
              {isFuture && !isSel && <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#1a2a33" }} />}
            </button>
          );
        })}
      </div>
      {navBtn("›", () => shiftWeek(1))}
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

  // ── State ───────────────────────────────────────────────────────────────────
  const [session,         setSession]         = useState(undefined);
  const [selectedDay,     setSelectedDay]     = useState(todayStr);
  const [checks,          setChecks]          = useState(() => emptyChecks(ls.get("yz-sections") || DEFAULT_SECTIONS));
  const [actuals,         setActuals]         = useState(() => emptyActuals(ls.get("yz-sections") || DEFAULT_SECTIONS));
  const [history,         setHistory]         = useState({});
  const [saveFlash,       setSaveFlash]       = useState(false);
  const [showHistory,     setShowHistory]     = useState(false);
  const [syncDot,         setSyncDot]         = useState("synced"); // "synced" | "syncing" | "failed"
  const [pulling,         setPulling]         = useState(false);
  const [pullStatus,      setPullStatus]      = useState(null);
  const [editMode,        setEditMode]        = useState(false);
  const [forcePushing,    setForcePushing]    = useState(false);
  const [forcePushStatus, setForcePushStatus] = useState(null);
  const [supabaseData,    setSupabaseData]    = useState(null);
  const [reloadTick,      setReloadTick]      = useState(0); // increment to trigger reload from localStorage
  // Editable config state
  const [sections,  setSections]  = useState(() => ls.get("yz-sections") || DEFAULT_SECTIONS);
  const [sched,     setSched]     = useState(() => ls.get("yz-sched")    || DEFAULT_SCHED);
  const [dashTitle, setDashTitle] = useState(() => ls.get("yz-title")   || DEFAULT_TITLE);
  // Refs so realtime/focus callbacks always read current values without stale closure
  const selectedDayRef = useRef(selectedDay);
  useEffect(() => { selectedDayRef.current = selectedDay; }, [selectedDay]);

  // ── Wire sync-status callbacks to _syncTracker ──────────────────────────────
  useEffect(() => {
    _syncTracker.onChange = setSyncDot;
    return () => { _syncTracker.onChange = null; };
  }, []);

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (s) { setSession(s); return; }
      const { data: { session: refreshed } } = await supabase.auth.refreshSession();
      setSession(refreshed ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null));
    return () => subscription.unsubscribe();
  }, []);

  // ── Load on login ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const load = async () => {
      const uid = session.user.id;
      try { await pushAllToSupabase(uid); } catch (e) { console.error("[sync] login push failed:", e); }
      try { await pullMissingFromSupabase(uid); } catch (e) { console.error("[sync] login fill failed:", e); }
      const day = todayStr();
      setSelectedDay(day);
      const savedSections = ls.get("yz-sections") || DEFAULT_SECTIONS;
      setSections(savedSections);
      setSched(ls.get("yz-sched") || DEFAULT_SCHED);
      setDashTitle(ls.get("yz-title") || DEFAULT_TITLE);
      const wd = ls.get(weekKeyForDate(day));
      const dayChecks = getDayChecks(wd, day);
      setChecks(normAllChecks(dayChecks || emptyChecks(savedSections), savedSections));
      if (wd?.actuals) setActuals(wd.actuals);
      setHistory(ls.get("yz-history") || {});
    };
    load();
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Day switch ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const wd = ls.get(weekKeyForDate(selectedDay));
    const dayChecks = getDayChecks(wd, selectedDay);
    setChecks(normAllChecks(dayChecks || emptyChecks(sections), sections));
    setActuals(wd?.actuals || emptyActuals(sections));
  }, [selectedDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reload all React state from localStorage (called after any remote pull) ──
  // Uses refs so this callback is stable (no stale closure on selectedDay).
  const reloadFromStorage = useCallback(() => {
    const day = selectedDayRef.current;
    const savedSections = ls.get("yz-sections") || DEFAULT_SECTIONS;
    setSections(savedSections);
    setSched(ls.get("yz-sched") || DEFAULT_SCHED);
    setDashTitle(ls.get("yz-title") || DEFAULT_TITLE);
    const wd = ls.get(weekKeyForDate(day));
    const dayChecks = getDayChecks(wd, day);
    setChecks(normAllChecks(dayChecks || emptyChecks(savedSections), savedSections));
    setActuals(wd?.actuals || emptyActuals(savedSections));
    setHistory(ls.get("yz-history") || {});
    // Notify sub-components (e.g. MacroTracker) to re-read their localStorage state
    window.dispatchEvent(new CustomEvent("yz-reload"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Increment reloadTick → triggers reloadFromStorage (used by realtime handler
  // which can't call reloadFromStorage directly without a stale closure risk)
  useEffect(() => {
    if (reloadTick === 0) return;
    reloadFromStorage();
  }, [reloadTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Smart pull on app focus / visibility restore ──────────────────────────
  const smartPullOnFocus = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) return;
    try {
      const updated = await smartPullNewerFromSupabase(uid);
      if (updated > 0) reloadFromStorage();
    } catch (e) { console.error("[sync] focus pull failed:", e); }
  }, [session?.user?.id, reloadFromStorage]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const onFocus = () => smartPullOnFocus();
    const onVisibility = () => { if (!document.hidden) smartPullOnFocus(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session?.user?.id, smartPullOnFocus]);

  // ── Supabase realtime subscription ───────────────────────────────────────
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    const channel = supabase
      .channel("yz-data-changes")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "yz_data",
        filter: `user_id=eq.${uid}`,
      }, (payload) => {
        const row = payload.new;
        if (!row?.key) return;
        // Skip if the value is identical (our own echo coming back from the server)
        const localVal = ls.get(row.key);
        if (JSON.stringify(localVal) === JSON.stringify(row.value)) return;
        const remoteMs = new Date(row.updated_at).getTime();
        const localMs = ls.ts(row.key);
        if (remoteMs > localMs + 1000) {
          console.log("[sync] realtime: updating", row.key);
          ls.setFromRemote(row.key, row.value, remoteMs);
          setReloadTick(t => t + 1); // triggers the reloadFromStorage effect
        }
      })
      .subscribe((status) => { console.log("[sync] realtime:", status); });
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist week data ────────────────────────────────────────────────────────
  const persist = useCallback((nc, na) => {
    const userId = session?.user?.id;
    const wk = weekKeyForDate(selectedDay);
    const existing = ls.get(wk) || {};
    const dailyChecks = existing.dailyChecks ? { ...existing.dailyChecks } : {};
    if (existing.checks && !existing.dailyChecks) dailyChecks[todayStr()] = existing.checks;
    dailyChecks[selectedDay] = nc;
    const wd = { dailyChecks, actuals: na, savedAt: Date.now() };
    ls.set(wk, wd);
    syncToSupabase(userId, wk, wd);
    const newHist = { ...history, [wk]: wd };
    const trimmed = Object.fromEntries(Object.keys(newHist).sort().reverse().slice(0, 52).map(k => [k, newHist[k]]));
    ls.set("yz-history", trimmed);
    syncToSupabase(userId, "yz-history", trimmed);
    setHistory(trimmed);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1400);
  }, [history, selectedDay, session]);

  // ── Check / actuals handlers ─────────────────────────────────────────────────
  const handleCheck = (sec, taskKey) => {
    const cur = checks[sec] || {};
    let newSecChecks;
    if (Array.isArray(cur)) {
      // Old array format — find index by taskKey
      const section = sections[sec];
      const idx = section.daily.findIndex(t => t.key === taskKey);
      if (idx === -1) return;
      newSecChecks = cur.map((v, i) => i === idx ? !v : v);
    } else {
      // New object format
      newSecChecks = { ...cur, [taskKey]: !cur[taskKey] };
    }
    const next = { ...checks, [sec]: newSecChecks };
    setChecks(next);
    persist(next, actuals);
  };
  const handleSave = (sec, idx, val) => {
    const next = { ...actuals, [sec]: actuals[sec].map((v, i) => i === idx ? val : v) };
    setActuals(next); persist(checks, next);
  };
  // Called from GoalCard when daily tasks are added/removed in edit mode
  const handleUpdateChecks = (sec, newArr) => {
    const next = { ...checks, [sec]: newArr };
    setChecks(next);
    persist(next, actuals);
  };
  // Called from GoalCard when weekly targets are added/removed in edit mode
  const handleUpdateActuals = (sec, newArr) => {
    const next = { ...actuals, [sec]: newArr };
    setActuals(next);
    persist(checks, next);
  };

  // ── Section / sched / title update (edit mode) ───────────────────────────────
  const updateSection = (key, updater) => {
    setSections(prev => {
      const next = { ...prev, [key]: updater(prev[key]) };
      ls.set("yz-sections", next);
      syncToSupabase(session?.user?.id, "yz-sections", next);
      return next;
    });
  };

  const handleReorderSection = (key, dir) => {
    const keys = Object.keys(sections);
    const idx = keys.indexOf(key);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= keys.length) return;
    const newKeys = [...keys];
    [newKeys[idx], newKeys[newIdx]] = [newKeys[newIdx], newKeys[idx]];
    const reordered = {};
    newKeys.forEach(k => { reordered[k] = sections[k]; });
    setSections(reordered);
    ls.set("yz-sections", reordered);
    ls.set("yz-section-order", newKeys);
    syncToSupabase(session?.user?.id, "yz-sections", reordered);
    syncToSupabase(session?.user?.id, "yz-section-order", newKeys);
  };

  const updateSched = (updater) => {
    setSched(prev => {
      const next = updater(prev);
      ls.set("yz-sched", next);
      syncToSupabase(session?.user?.id, "yz-sched", next);
      return next;
    });
  };

  const saveDashTitle = (v) => {
    setDashTitle(v);
    ls.set("yz-title", v);
    syncToSupabase(session?.user?.id, "yz-title", v);
  };

  // ── Sync handlers ────────────────────────────────────────────────────────────
  // Retry: shown only when syncDot === "failed"
  const handleRetrySync = async () => {
    if (!session?.user?.id) return;
    setSyncDot("syncing");
    try {
      await pushAllToSupabase(session.user.id);
      setSyncDot("synced");
    } catch (e) {
      console.error("[sync] retry failed:", e);
      setSyncDot("failed");
    }
  };

  const handlePull = async () => {
    if (pulling || !session) return;
    const confirmed = window.confirm("⚠️ PULL FROM SUPABASE\n\nThis will overwrite ALL your local data with what is stored in Supabase.\n\nYour current local data will be lost.\n\nAre you sure?");
    if (!confirmed) return;
    setPulling(true); setPullStatus(null);
    try {
      await pullAllFromSupabase(session.user.id);
      const day = todayStr();
      setSelectedDay(day);
      const savedSections = ls.get("yz-sections") || DEFAULT_SECTIONS;
      setSections(savedSections);
      setSched(ls.get("yz-sched") || DEFAULT_SCHED);
      setDashTitle(ls.get("yz-title") || DEFAULT_TITLE);
      const wd = ls.get(weekKeyForDate(day));
      const dayChecks = getDayChecks(wd, day);
      setChecks(normAllChecks(dayChecks || emptyChecks(savedSections), savedSections));
      if (wd?.actuals) setActuals(wd.actuals);
      setHistory(ls.get("yz-history") || {});
      setPullStatus("✓ PULLED");
      setTimeout(() => setPullStatus(null), 3000);
    } catch (e) {
      console.error("[sync] pull failed:", e);
      setPullStatus("✗ FAILED");
      setTimeout(() => setPullStatus(null), 3000);
    } finally { setPulling(false); }
  };

  const handleCheckSupabase = async () => {
    if (!session) return;
    try {
      const rows = await fetchSupabaseSnapshot(session.user.id);
      setSupabaseData(rows);
    } catch (e) {
      console.error("[sync] fetch snapshot failed:", e);
      alert("Failed to fetch Supabase data: " + e.message);
    }
  };

  const handleForcePush = async () => {
    if (forcePushing || !session) return;
    const uid = session.user.id;
    setForcePushing(true); setForcePushStatus(null);
    try {
      const { error: delErr } = await supabase.from("yz_data").delete().eq("user_id", uid);
      if (delErr) throw delErr;
      const upserts = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("yz-") && k !== "yz-ts") {
          upserts.push({ user_id: uid, key: k, value: ls.get(k), updated_at: new Date().toISOString() });
        }
      }
      if (upserts.length) await supabase.from("yz_data").upsert(upserts, { onConflict: "user_id,key" });
      setForcePushStatus("✓ DONE");
      setTimeout(() => setForcePushStatus(null), 3000);
    } catch (e) {
      console.error("[sync] force push failed:", e);
      setForcePushStatus("✗ FAILED");
      setTimeout(() => setForcePushStatus(null), 3000);
    } finally { setForcePushing(false); }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const allDaily = Object.values(checks).flatMap(v => Array.isArray(v) ? v : Object.values(v));
  const dailyDone = allDaily.filter(Boolean).length;
  const dailyPct = Math.round((dailyDone / Math.max(allDaily.length, 1)) * 100);
  const topColor = dailyPct >= 75 ? "#00FF88" : dailyPct >= 45 ? "#FFD700" : "#FF6B35";
  const pastWeeks = Object.keys(history).filter(k => k !== WEEK_KEY).length;

  // ── Loading / auth gates ─────────────────────────────────────────────────────
  if (session === undefined) return <div style={{ minHeight: "100vh", background: "#0a0a0a" }} />;
  if (!session) return <AuthScreen />;

  // ── Render ───────────────────────────────────────────────────────────────────
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
        @keyframes yz-pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>

      {showHistory && <HistoryModal history={history} sections={sections} onClose={() => setShowHistory(false)} />}
      {supabaseData !== null && <SupabaseInspectorModal data={supabaseData} onClose={() => setSupabaseData(null)} />}

      {/* Save flash */}
      <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 5000, background: "#141414", border: "1px solid #00FF8855", borderRadius: 10, padding: "9px 16px", fontSize: 11, color: "#00FF88", letterSpacing: 1, transition: "opacity 0.3s", opacity: saveFlash ? 1 : 0, pointerEvents: "none" }}>
        ✓ Saved
      </div>

      {/* Top bar */}
      <div style={{ borderBottom: "1px solid #1a1a1a", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#0a0a0a", zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <InlineEdit
            value={dashTitle}
            onSave={saveDashTitle}
            editMode={editMode}
            style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, letterSpacing: 3, color: "#fff" }}
          />
          <span style={{ background: "#00FF8812", border: "1px solid #00FF8830", borderRadius: 6, padding: "3px 9px", fontSize: 10, color: "#00FF88", letterSpacing: 2 }}>Q{currentQ}</span>
          <button onClick={() => setShowHistory(true)} style={{ background: "#181818", border: "1px solid #252525", borderRadius: 7, padding: "4px 11px", cursor: "pointer", fontSize: 10, color: "#555", letterSpacing: 1 }}>
            HISTORY {pastWeeks > 0 ? `· ${pastWeeks}wk` : ""}
          </button>
          {/* Auto-sync status indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }} title={syncDot === "synced" ? "Synced" : syncDot === "syncing" ? "Syncing…" : "Sync failed — tap to retry"}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: syncDot === "synced" ? "#00FF88" : syncDot === "syncing" ? "#FFD700" : "#FF3B3B",
              boxShadow: syncDot === "synced" ? "0 0 5px #00FF8866" : syncDot === "syncing" ? "0 0 5px #FFD70066" : "0 0 6px #FF3B3B88",
              transition: "background 0.4s, box-shadow 0.4s",
              animation: syncDot === "syncing" ? "yz-pulse-dot 1s ease-in-out infinite" : "none",
              cursor: syncDot === "failed" ? "pointer" : "default",
            }} onClick={syncDot === "failed" ? handleRetrySync : undefined} />
            {syncDot === "failed" && (
              <button onClick={handleRetrySync} style={{ background: "#FF3B3B14", border: "1px solid #FF3B3B44", borderRadius: 5, padding: "3px 8px", fontSize: 9, color: "#FF6B6B", cursor: "pointer", letterSpacing: 1 }}>
                RETRY
              </button>
            )}
          </div>
          <button onClick={handlePull} disabled={pulling} style={{ background: pullStatus === "✓ PULLED" ? "#00FF8818" : "#181818", border: `1px solid ${pullStatus === "✓ PULLED" ? "#00FF8844" : pullStatus === "✗ FAILED" ? "#FF3B3B44" : "#FF6B3533"}`, borderRadius: 7, padding: "4px 11px", cursor: pulling ? "not-allowed" : "pointer", fontSize: 10, color: pullStatus === "✓ PULLED" ? "#00FF88" : pullStatus === "✗ FAILED" ? "#FF6B6B" : pulling ? "#555" : "#FF6B35", letterSpacing: 1 }}>
            {pulling ? "PULLING..." : pullStatus || "PULL"}
          </button>
          <button onClick={() => { setEditMode(m => !m); setForcePushStatus(null); }} style={{ background: editMode ? "#FF6B3518" : "#181818", border: `1px solid ${editMode ? "#FF6B3544" : "#252525"}`, borderRadius: 7, padding: "4px 11px", cursor: "pointer", fontSize: 10, color: editMode ? "#FF6B35" : "#444", letterSpacing: 1 }}>
            {editMode ? "✓ DONE EDITING" : "EDIT"}
          </button>
          <button onClick={handleCheckSupabase} style={{ background: "#FFD70014", border: "1px solid #FFD70033", borderRadius: 7, padding: "4px 11px", cursor: "pointer", fontSize: 10, color: "#FFD700", letterSpacing: 1 }}>
            CHECK DB
          </button>
          {editMode && (
            <button onClick={handleForcePush} disabled={forcePushing} style={{ background: forcePushStatus === "✓ DONE" ? "#00FF8818" : "#FF3B3B14", border: `1px solid ${forcePushStatus === "✓ DONE" ? "#00FF8844" : forcePushStatus === "✗ FAILED" ? "#FF3B3B88" : "#FF3B3B44"}`, borderRadius: 7, padding: "4px 11px", cursor: forcePushing ? "not-allowed" : "pointer", fontSize: 10, color: forcePushStatus === "✓ DONE" ? "#00FF88" : forcePushing ? "#555" : "#FF6B6B", letterSpacing: 1 }}>
              {forcePushing ? "PUSHING..." : forcePushStatus || "FORCE PUSH"}
            </button>
          )}
          <button onClick={() => supabase.auth.signOut()} style={{ background: "#181818", border: "1px solid #252525", borderRadius: 7, padding: "4px 11px", cursor: "pointer", fontSize: 10, color: "#444", letterSpacing: 1 }}>
            SIGN OUT
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 8, color: selectedDay === todayStr() ? "#444" : selectedDay > todayStr() ? "#00D4FF" : "#A78BFA", letterSpacing: 2 }}>
              {selectedDay === todayStr() ? "TODAY" : selectedDay > todayStr() ? "PLANNING" : "EDITING"}
            </div>
            <div style={{ fontSize: 11, color: selectedDay === todayStr() ? "#aaa" : selectedDay > todayStr() ? "#00D4FF" : "#A78BFA" }}>
              {dayLabel.toUpperCase()} · WK {weekNum}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 8, color: "#444", letterSpacing: 2 }}>DAILY</div>
            <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 20, color: topColor, letterSpacing: 1 }}>{dailyPct}%</div>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Ring pct={dailyPct} color={topColor} size={42} />
            <span style={{ position: "absolute", fontSize: 8, color: "#fff", fontWeight: 700 }}>{dailyDone}/{allDaily.length}</span>
          </div>
          {/* Per-category rings */}
          <div style={{ width: 1, height: 40, background: "#1e1e1e", flexShrink: 0 }} />
          {Object.entries(sections).map(([sectionKey, section]) => {
            const sectionChecks = checks[sectionKey] || [];
            const sectionActuals = actuals[sectionKey] || [];
            const dd = Array.isArray(sectionChecks) ? sectionChecks.filter(Boolean).length : Object.values(sectionChecks).filter(Boolean).length;
            const wh = section.weekly.filter((w, i) => {
              const a = sectionActuals[i];
              return a !== null && a !== undefined && a >= w.target;
            }).length;
            const total = section.daily.length + section.weekly.length;
            const pct = total > 0 ? Math.round(((dd + wh) / total) * 100) : 0;
            return (
              <div key={sectionKey} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Ring pct={pct} color={section.color} size={34} />
                  <span style={{ position: "absolute", fontSize: 7, color: "#fff", fontWeight: 700 }}>{pct}%</span>
                </div>
                <span style={{ fontSize: 9, color: section.color, lineHeight: 1 }}>{section.icon}</span>
              </div>
            );
          })}
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

      {/* Day picker */}
      <DayPicker selectedDay={selectedDay} onSelect={setSelectedDay} />

      {/* Past-day / future-day banner */}
      {selectedDay !== todayStr() && (() => {
        const isFuture = selectedDay > todayStr();
        const bannerColor = isFuture ? "#00D4FF" : "#A78BFA";
        const formattedDate = new Date(selectedDay + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
        return (
          <div style={{ margin: "10px 20px 0", padding: "8px 14px", background: bannerColor + "12", border: `1px solid ${bannerColor}33`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: bannerColor, letterSpacing: 1, fontWeight: isFuture ? 600 : 400 }}>
              {isFuture ? `PLANNING ${formattedDate.toUpperCase()}` : `Editing ${formattedDate}`}
            </span>
            <button onClick={() => setSelectedDay(todayStr())} style={{ background: "none", border: `1px solid ${bannerColor}44`, borderRadius: 6, padding: "3px 10px", fontSize: 10, color: bannerColor, cursor: "pointer", letterSpacing: 1 }}>
              BACK TO TODAY
            </button>
          </div>
        );
      })()}

      {/* Edit mode hint */}
      {editMode && (
        <div style={{ margin: "10px 20px 0", padding: "8px 14px", background: "#FF6B3510", border: "1px solid #FF6B3533", borderRadius: 10 }}>
          <span style={{ fontSize: 10, color: "#FF6B35", letterSpacing: 1 }}>
            ✎ EDIT MODE — click any text to rename · colour swatch to repaint · × to delete · click DONE EDITING when finished
          </span>
        </div>
      )}

      {/* Goal cards */}
      <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        {Object.keys(sections).map(key => (
          <GoalCard
            key={key}
            sectionKey={key}
            section={sections[key]}
            checks={checks[key] || []}
            onCheck={handleCheck}
            actuals={actuals[key] || []}
            onSave={handleSave}
            editMode={editMode}
            onUpdate={(updater) => updateSection(key, updater)}
            onUpdateChecks={(newArr) => handleUpdateChecks(key, newArr)}
            onUpdateActuals={(newArr) => handleUpdateActuals(key, newArr)}
            onReorder={(dir) => handleReorderSection(key, dir)}
            viewDayOffset={Math.round((new Date(selectedDay + "T00:00:00") - new Date(todayStr() + "T00:00:00")) / 86400000)}
          />
        ))}
      </div>

      {/* Schedule */}
      <div style={{ padding: "0 20px 24px" }}>
        <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 18, marginBottom: 12 }}>
          <span style={{ fontSize: 9, color: "#444", letterSpacing: 2 }}>WEEKLY SCHEDULE TEMPLATE</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {sched.map((day, di) => (
            <div key={di} style={{ background: "#111", border: `1px solid ${day.color}20`, borderRadius: 12, padding: 16 }}>
              <InlineEdit
                value={day.label}
                onSave={v => updateSched(s => s.map((d, i) => i === di ? { ...d, label: v } : d))}
                editMode={editMode}
                style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 18, color: day.color, letterSpacing: 2, display: "block", marginBottom: 2 }}
              />
              <InlineEdit
                value={day.sub}
                onSave={v => updateSched(s => s.map((d, i) => i === di ? { ...d, sub: v } : d))}
                editMode={editMode}
                style={{ fontSize: 9, color: "#444", letterSpacing: 1, marginBottom: 10, display: "block" }}
              />
              {day.blocks.map((b, bi) => (
                <div key={bi} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "flex-start" }}>
                  <span style={{ color: day.color, fontSize: 7, marginTop: 4, flexShrink: 0 }}>▸</span>
                  <InlineEdit
                    value={b}
                    onSave={v => updateSched(s => s.map((d, i) => i === di ? { ...d, blocks: d.blocks.map((bl, j) => j === bi ? v : bl) } : d))}
                    editMode={editMode}
                    style={{ fontSize: 11, color: "#777", lineHeight: 1.5 }}
                  />
                  {editMode && (
                    <button
                      onClick={() => updateSched(s => s.map((d, i) => i === di ? { ...d, blocks: d.blocks.filter((_, j) => j !== bi) } : d))}
                      style={{ background: "none", border: "none", color: "#333", fontSize: 14, cursor: "pointer", padding: "0 2px", flexShrink: 0, lineHeight: 1, marginTop: 1 }}
                      title="Delete block">×</button>
                  )}
                </div>
              ))}
              {editMode && (
                <button
                  onClick={() => updateSched(s => s.map((d, i) => i === di ? { ...d, blocks: [...d.blocks, "New block"] } : d))}
                  style={{ marginTop: 6, width: "100%", padding: "5px 0", background: "#1a1a1a", border: "1px dashed #2a2a2a", borderRadius: 5, color: "#444", fontSize: 9, cursor: "pointer", letterSpacing: 1 }}
                >
                  + ADD BLOCK
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #1a1a1a", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 9, color: "#222", letterSpacing: 1 }}>YEAR ZERO · INPUT-BASED SYSTEM · DATA SAVED LOCALLY</span>
        <div style={{ display: "flex", gap: 14 }}>
          {Object.values(sections).map(s => (
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
