import { useState, useEffect } from "react";

const msToHm = (ms) => {
  if (ms == null) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
};

const fmt = (v, unit = "", decimals = 0) =>
  v == null ? "—" : `${typeof v === "number" ? v.toFixed(decimals) : v}${unit}`;

const recoveryColor = (score) => {
  if (score == null) return "#aaa";
  if (score >= 67) return "#22c55e";
  if (score >= 34) return "#fbbf24";
  return "#fb923c";
};

const recoveryLabel = (score) => {
  if (score == null) return "Sync to see recovery";
  if (score >= 67) return "Ready to perform";
  if (score >= 34) return "Keep it moderate";
  return "Keep it light";
};

const strainColor = (strain) => {
  if (strain == null) return "#aaa";
  if (strain >= 18) return "#fb923c";
  if (strain >= 14) return "#fbbf24";
  if (strain >= 10) return "#a78bfa";
  return "#34d399";
};

const HEALTH_KEY = () => `yz-health-${new Date().toISOString().slice(0, 10)}`;

const ls = {
  get: (k) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

/** Decorative multi-line chart — colors aligned with WHOOP-style dashboard */
function Sparkline({ datasets, legend, legendMuted = "#6b7280", w = 150, h = 54 }) {
  const pad = { top: 4, bottom: 4, left: 2, right: 2 };
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;

  const makePath = (values) => {
    const n = values.length;
    return values.reduce((acc, v, i) => {
      const x = pad.left + (i / (n - 1)) * iw;
      const y = pad.top + (1 - v) * ih;
      if (i === 0) return `M ${x},${y}`;
      const px = pad.left + ((i - 1) / (n - 1)) * iw;
      const pv = values[i - 1];
      const py = pad.top + (1 - pv) * ih;
      const cpx = (px + x) / 2;
      return `${acc} C ${cpx},${py} ${cpx},${y} ${x},${y}`;
    }, "");
  };

  return (
    <div>
      <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
        {datasets.map((ds, i) => (
          <path
            key={i}
            d={makePath(ds.values)}
            fill="none"
            stroke={ds.color}
            strokeWidth={1.6}
            strokeDasharray={ds.dashed ? "4 3" : undefined}
            opacity={0.92}
          />
        ))}
      </svg>
      {legend && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {legend.map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <svg width={12} height={3} style={{ overflow: "visible" }}>
                <line x1={0} y1={1.5} x2={12} y2={1.5} stroke={l.color} strokeWidth={1.6} strokeDasharray={l.dashed ? "3 2" : undefined} />
              </svg>
              <span style={{ fontSize: 7, color: legendMuted, letterSpacing: 0.4 }}>{l.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DonutChart({ protein, carbs, fat }) {
  const r = 26,
    cx = 36,
    cy = 36;
  const circ = 2 * Math.PI * r;
  const total = (protein || 0) + (carbs || 0) + (fat || 0);

  const segments = [
    { value: protein || 0, color: "#fb923c", label: "PROTEIN" },
    { value: carbs || 0, color: "#3b82f6", label: "CARBS" },
    { value: fat || 0, color: "#fbbf24", label: "FAT" },
  ];

  let cumPct = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width={72} height={72} style={{ flexShrink: 0 }}>
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2a2a" strokeWidth={9} />
        ) : (
          segments.map((s, i) => {
            const pct = s.value / total;
            const dash = pct * circ;
            const offset = circ - cumPct * circ;
            cumPct += pct;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={9}
                strokeDasharray={`${dash} ${circ}`}
                strokeDashoffset={offset}
                style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }}
              />
            );
          })
        )}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, opacity: total === 0 ? 0.25 : 1 }} />
            <span style={{ fontSize: 8, color: "#9ca3af", letterSpacing: 0.5 }}>
              {s.label} {total > 0 ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroCard({ label, value, lines = [], gradient }) {
  return (
    <div
      style={{
        background: gradient,
        borderRadius: 12,
        padding: "18px 20px",
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
      }}
    >
      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", letterSpacing: 2.2, fontWeight: 700 }}>{label.toUpperCase()}</span>
      <span
        style={{
          fontSize: 46,
          fontWeight: 800,
          color: "#fff",
          lineHeight: 1.02,
          fontFamily: "system-ui, -apple-system, sans-serif",
          marginTop: 2,
          letterSpacing: -1,
        }}
      >
        {value}
      </span>
      {lines.map((line, i) => (
        <span
          key={i}
          style={{
            fontSize: i === 0 ? 11 : 10,
            color: i === 0 ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.48)",
            marginTop: i === 0 ? 4 : 1,
            lineHeight: 1.35,
          }}
        >
          {line}
        </span>
      ))}
    </div>
  );
}

function Metric({ label, value, color, muted, valueDefault = "#e5e7eb" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 8, color: muted || "#6b7280", letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: color ?? valueDefault, fontFamily: "system-ui, -apple-system, sans-serif" }}>{value}</span>
    </div>
  );
}

function PanelIcon({ color }) {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: `linear-gradient(145deg, ${color}55, ${color}18)`,
        border: `1px solid ${color}44`,
        flexShrink: 0,
      }}
    />
  );
}

function Panel({ title, main, mainSub, mainColor, metrics, chart, iconColor = "#6366f1", surface, border, titleColor, subColor, dividerColor, metricMuted, valueDefault = "#e5e7eb" }) {
  return (
    <div
      style={{
        background: surface || "#141414",
        border: `1px solid ${border || "#252525"}`,
        borderRadius: 12,
        padding: "18px 18px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 0,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 8, color: titleColor || "#525252", letterSpacing: 2.4, fontWeight: 700 }}>{title.toUpperCase()}</span>
        <PanelIcon color={iconColor} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 40, fontWeight: 800, color: mainColor || "#fff", lineHeight: 1, fontFamily: "system-ui, -apple-system, sans-serif", letterSpacing: -1 }}>
            {main}
          </div>
          {mainSub && <div style={{ fontSize: 11, color: subColor || "#737373", marginTop: 6, lineHeight: 1.35 }}>{mainSub}</div>}
        </div>
        {chart && <div style={{ flexShrink: 0, marginTop: -4 }}>{chart}</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", paddingTop: 14, borderTop: `1px solid ${dividerColor || "#252525"}` }}>
        {metrics.map(({ label, value, color }) => (
          <Metric key={label} label={label} value={value} color={color} muted={metricMuted} valueDefault={valueDefault} />
        ))}
      </div>
    </div>
  );
}

const SPARKLINES = {
  recovery: {
    datasets: [
      { values: [0.42, 0.36, 0.4, 0.3, 0.34, 0.28, 0.32], color: "#fbbf24" },
      { values: [0.62, 0.64, 0.59, 0.65, 0.62, 0.64, 0.61], color: "#60a5fa" },
      { values: [0.72, 0.68, 0.74, 0.7, 0.76, 0.71, 0.74], color: "#a78bfa" },
      { values: [0.91, 0.92, 0.9, 0.93, 0.91, 0.92, 0.94], color: "#34d399" },
    ],
    legend: [
      { label: "RECOVERY", color: "#fbbf24" },
      { label: "RHR", color: "#60a5fa" },
      { label: "HRV", color: "#a78bfa" },
      { label: "SpO2", color: "#34d399" },
    ],
  },
  pulse: {
    datasets: [{ values: [0.5, 0.5, 0.52, 0.5, 0.12, 0.92, 0.48, 0.44, 0.5, 0.5, 0.52, 0.5, 0.12, 0.92, 0.48, 0.44, 0.5], color: "#2dd4bf" }],
    legend: [{ label: "PULSE TRACE", color: "#2dd4bf" }],
  },
  sleep: {
    datasets: [
      { values: [0.72, 0.68, 0.73, 0.7, 0.75, 0.71, 0.73], color: "#fb923c" },
      { values: [0.44, 0.47, 0.43, 0.5, 0.46, 0.49, 0.47], color: "#3b82f6" },
      { values: [0.28, 0.32, 0.3, 0.35, 0.29, 0.33, 0.31], color: "#a78bfa" },
    ],
    legend: [
      { label: "CORE", color: "#fb923c" },
      { label: "DEEP", color: "#3b82f6" },
      { label: "REM", color: "#a78bfa" },
    ],
  },
  body: {
    datasets: [
      { values: [0.58, 0.6, 0.56, 0.59, 0.55, 0.57, 0.54], color: "#60a5fa" },
      { values: [0.59, 0.57, 0.55, 0.53, 0.51, 0.49, 0.47], color: "#737373", dashed: true },
    ],
    legend: [
      { label: "WEIGHT", color: "#60a5fa" },
      { label: "TREND", color: "#737373", dashed: true },
    ],
  },
  activity: {
    datasets: [
      { values: [0.38, 0.55, 0.45, 0.62, 0.4, 0.58, 0.5], color: "#fb923c" },
      { values: [0.28, 0.44, 0.36, 0.5, 0.32, 0.46, 0.4], color: "#60a5fa" },
      { values: [0.22, 0.38, 0.3, 0.45, 0.26, 0.4, 0.34], color: "#a78bfa" },
      { values: [0.3, 0.33, 0.36, 0.39, 0.42, 0.45, 0.48], color: "#525252", dashed: true },
    ],
    legend: [
      { label: "STEPS", color: "#fb923c" },
      { label: "ENERGY", color: "#60a5fa" },
      { label: "STRAIN", color: "#a78bfa" },
      { label: "TREND", color: "#525252", dashed: true },
    ],
  },
};

const CAL_GOAL = 1900;
const PROTEIN_GOAL_G = 180;
const SLEEP_NEED_MS = 8 * 3600000 + 38 * 60000;

export default function HealthPanel({ darkMode = true }) {
  const [data, setData] = useState(() => ls.get(HEALTH_KEY()) || {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const saved = ls.get(HEALTH_KEY());
    if (saved) setData(saved);
    fetch("/api/health-today")
      .then((r) => r.json())
      .then((json) => {
        if (json.apple || json.whoop) {
          const merged = { ...ls.get(HEALTH_KEY()), ...json };
          ls.set(HEALTH_KEY(), merged);
          setData(merged);
        }
      })
      .catch(() => {});
  }, []);

  const fetchWhoop = async () => {
    setLoading(true);
    setError(null);
    try {
      const whoopRes = await fetch("/api/whoop");
      const whoopJson = await whoopRes.json();
      if (!whoopRes.ok) throw new Error(whoopJson.error || "WHOOP fetch failed");

      const todayRes = await fetch("/api/health-today");
      const todayJson = await todayRes.json();

      const merged = { ...ls.get(HEALTH_KEY()), ...todayJson, whoop: whoopJson };
      ls.set(HEALTH_KEY(), merged);
      setData(merged);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const w = data?.whoop;
  const a = data?.apple;

  const recScore = w?.recovery?.score;
  const recColor = recoveryColor(recScore);
  const strainVal = w?.strain;
  const sColor = strainColor(strainVal);

  const whoopTime = w?.fetchedAt ? new Date(w.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;
  const appleTime = a?.fetchedAt ? new Date(a.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;

  const totalSleepMs = w?.sleep?.totalMs;
  const sleepSubNight = totalSleepMs != null ? `Night ${msToHm(totalSleepMs)} · Naps —` : "Night — · Naps —";
  const sleepDebt = w?.sleep?.debtMs;
  const sleepLine2 =
    sleepDebt != null
      ? `${msToHm(sleepDebt)} debt vs 7D · ${msToHm(SLEEP_NEED_MS)} needed`
      : w?.sleep?.efficiency != null
        ? `${fmt(w.sleep.efficiency, "%")} efficiency · ${msToHm(SLEEP_NEED_MS)} target`
        : `— vs 7D · ${msToHm(SLEEP_NEED_MS)} needed`;

  const weightLb = a?.weight_lb;
  const bf = a?.body_fat_pct;
  const vsPlanLb = a?.vs_plan_lb;
  const heroWeightLine1 =
    vsPlanLb != null
      ? `${vsPlanLb >= 0 ? "+" : ""}${vsPlanLb.toFixed(1)} lb vs plan`
      : weightLb != null
        ? "— vs plan"
        : "— vs plan";
  const heroWeightLine2 =
    bf != null ? `${bf.toFixed(1)}% est. body fat · sync pace from logs` : "Body composition from Apple Health";

  const todayShort = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const calIn = a?.calories != null ? Math.round(a.calories) : 0;
  const protIn = a?.protein_g != null ? Math.round(a.protein_g) : 0;
  const calLeft = Math.max(0, CAL_GOAL - calIn);
  const protLeft = Math.max(0, PROTEIN_GOAL_G - protIn);
  const estTdee = a?.tdee_kcal != null ? Math.round(a.tdee_kcal) : null;
  const dexaRmr = a?.rmr_kcal != null ? Math.round(a.rmr_kcal) : null;

  const theme = darkMode
    ? { bg: "#0f0f0f", headerSub: "#737373", panel: "#141414", sparkLegend: "#6b7280", border: "#252525", panelTitle: "#525252", metricMuted: "#6b7280", finePrint: "#737373", valueDefault: "#e5e7eb" }
    : { bg: "#ecebe8", headerSub: "#64748b", panel: "#ffffff", sparkLegend: "#94a3b8", border: "#e2e2df", panelTitle: "#78716c", metricMuted: "#78716c", finePrint: "#57534e", valueDefault: "#1c1917" };

  const panelSkin = {
    surface: theme.panel,
    border: theme.border,
    titleColor: theme.panelTitle,
    subColor: theme.metricMuted,
    dividerColor: theme.border,
    metricMuted: theme.metricMuted,
    valueDefault: theme.valueDefault,
  };

  const heroRecoveryLines = ["— vs 30D", `Day ${todayShort}`];

  const heroRhrLines = [
    "— vs 30D",
    w?.recovery?.hrv != null ? `${w.recovery.hrv} ms HRV · WHOOP resting heart rate` : "WHOOP resting heart rate",
  ];

  return (
    <div
      style={{
        padding: "20px 22px 28px",
        maxWidth: 1280,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: theme.bg,
        minHeight: "calc(100vh - 52px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 9, color: theme.panelTitle, letterSpacing: 3, fontWeight: 700 }}>HEALTH</div>
          <div style={{ fontSize: 9, color: theme.headerSub, letterSpacing: 0.6, marginTop: 4 }}>
            {whoopTime ? `WHOOP ${whoopTime}` : "WHOOP NOT SYNCED"}
            {appleTime ? ` · APPLE ${appleTime}` : " · APPLE NOT SYNCED"}
          </div>
        </div>
        <button
          onClick={fetchWhoop}
          disabled={loading}
          style={{
            background: loading ? "#1a1a1a" : "rgba(45, 212, 191, 0.12)",
            border: `1px solid ${loading ? "#333" : "rgba(45, 212, 191, 0.35)"}`,
            borderRadius: 8,
            padding: "9px 20px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 9,
            color: loading ? "#525252" : "#2dd4bf",
            letterSpacing: 1.6,
            fontWeight: 700,
          }}
        >
          {loading ? "SYNCING…" : "SYNC WHOOP"}
        </button>
      </div>

      {error && (
        <div style={{ background: "rgba(251, 146, 60, 0.08)", border: "1px solid rgba(251, 146, 60, 0.25)", borderRadius: 10, padding: "10px 16px", fontSize: 11, color: "#fb923c", marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <HeroCard
          label="Recovery Score"
          value={fmt(recScore)}
          lines={heroRecoveryLines}
          gradient="linear-gradient(135deg, #6d28d9 0%, #4f46e5 45%, #2563eb 100%)"
        />
        <HeroCard
          label="Resting Heart Rate"
          value={w?.recovery?.rhr != null ? `${w.recovery.rhr} bpm` : "—"}
          lines={heroRhrLines}
          gradient="linear-gradient(135deg, #0f766e 0%, #14b8a6 50%, #2dd4bf 100%)"
        />
        <HeroCard
          label="Total Sleep"
          value={msToHm(totalSleepMs)}
          lines={[sleepSubNight, sleepLine2]}
          gradient="linear-gradient(135deg, #14532d 0%, #166534 40%, #22c55e 100%)"
        />
        <HeroCard
          label="Current Weight"
          value={weightLb != null ? `${weightLb.toFixed(1)} lb` : "—"}
          lines={[heroWeightLine1, heroWeightLine2]}
          gradient="linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #38bdf8 100%)"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <Panel
          {...panelSkin}
          title="Recovery"
          main={fmt(recScore)}
          mainSub={recoveryLabel(recScore)}
          mainColor={recColor}
          iconColor="#a78bfa"
          chart={<Sparkline {...SPARKLINES.recovery} legendMuted={theme.sparkLegend} />}
          metrics={[
            { label: "RHR", value: fmt(w?.recovery?.rhr, " bpm") },
            { label: "HRV", value: fmt(w?.recovery?.hrv, " ms"), color: "#a78bfa" },
            { label: "SpO2", value: fmt(w?.recovery?.spo2, "%", 1) },
            { label: "Need", value: msToHm(SLEEP_NEED_MS), color: "#94a3b8" },
          ]}
        />

        <Panel
          {...panelSkin}
          title="Pulse"
          main={w?.recovery?.rhr != null ? `${w.recovery.rhr} bpm` : "—"}
          mainSub="WHOOP resting heart rate"
          mainColor={darkMode ? "#ffffff" : "#0c0a09"}
          iconColor="#2dd4bf"
          chart={<Sparkline {...SPARKLINES.pulse} w={160} h={56} legendMuted={theme.sparkLegend} />}
          metrics={[
            { label: "Cycle avg", value: fmt(w?.avgHr, " bpm") },
            { label: "Resp", value: "—" },
            { label: "SpO2", value: fmt(w?.recovery?.spo2, "%", 1) },
            { label: "Workout max", value: fmt(w?.maxHr, " bpm"), color: "#fb923c" },
          ]}
        />

        <Panel
          {...panelSkin}
          title="Sleep"
          main={msToHm(totalSleepMs)}
          mainSub={w?.sleep?.efficiency != null ? `${fmt(w.sleep.efficiency, "%")} efficiency · ${sleepSubNight}` : sleepSubNight}
          mainColor="#a78bfa"
          iconColor="#818cf8"
          chart={<Sparkline {...SPARKLINES.sleep} legendMuted={theme.sparkLegend} />}
          metrics={[
            { label: "Deep", value: msToHm(w?.sleep?.deepMs), color: "#3b82f6" },
            { label: "REM", value: msToHm(w?.sleep?.remMs), color: "#a78bfa" },
            { label: "Eff", value: fmt(w?.sleep?.efficiency, "%"), color: w?.sleep?.efficiency >= 85 ? "#34d399" : "#fbbf24" },
            { label: "Debt", value: msToHm(w?.sleep?.debtMs), color: w?.sleep?.debtMs > 0 ? "#fb923c" : "#34d399" },
          ]}
        />

        <Panel
          {...panelSkin}
          title="Body"
          main={weightLb != null ? `${weightLb.toFixed(1)} lb` : "—"}
          mainSub={bf != null ? `${bf.toFixed(1)}% est. body fat` : "Sync Apple Health"}
          mainColor="#fbbf24"
          iconColor="#60a5fa"
          chart={<Sparkline {...SPARKLINES.body} legendMuted={theme.sparkLegend} />}
          metrics={[
            { label: "BF est", value: fmt(bf, "%", 1) },
            { label: "Steps", value: a?.steps != null ? Math.round(a.steps).toLocaleString() : "—", color: "#34d399" },
            { label: "Calories in", value: a?.calories != null ? Math.round(a.calories).toLocaleString() : "—", color: "#fb923c" },
            { label: "Distance", value: fmt(a?.distance_mi, " mi", 1) },
          ]}
        />

        <Panel
          {...panelSkin}
          title="Activity"
          main={strainVal != null ? `${strainVal.toFixed(1)} strain` : "—"}
          mainSub={a?.steps != null ? `${Math.round(a.steps).toLocaleString()} steps today` : "Strain & movement"}
          mainColor={sColor}
          iconColor="#fb923c"
          chart={<Sparkline {...SPARKLINES.activity} legendMuted={theme.sparkLegend} />}
          metrics={[
            { label: "Steps", value: a?.steps != null ? Math.round(a.steps).toLocaleString() : "—", color: "#34d399" },
            { label: "Energy", value: a?.active_energy_kcal != null ? `${Math.round(a.active_energy_kcal)} kcal` : "—", color: "#60a5fa" },
            { label: "7D strain", value: w?.strain_7d != null ? w.strain_7d.toFixed(1) : "—", color: "#a78bfa" },
            { label: "Walk", value: fmt(a?.distance_mi, " mi", 1) },
          ]}
        />

        <Panel
          {...panelSkin}
          title="Nutrition"
          main={`${calIn.toLocaleString()} / ${CAL_GOAL.toLocaleString()}`}
          mainSub={`${protIn}g / ${PROTEIN_GOAL_G}g protein`}
          mainColor="#fb923c"
          iconColor="#fbbf24"
          chart={<DonutChart protein={a?.protein_g} carbs={a?.carbs_g} fat={a?.fat_g} />}
          metrics={[
            { label: "Cal left", value: calLeft.toLocaleString(), color: "#94a3b8" },
            { label: "Prot left", value: `${protLeft}g`, color: "#fb923c" },
            { label: "Carbs", value: fmt(a?.carbs_g, "g"), color: "#3b82f6" },
            { label: "Fat", value: fmt(a?.fat_g, "g"), color: "#fbbf24" },
            { label: "DEXA RMR", value: dexaRmr != null ? `${dexaRmr} kcal` : "—", color: "#737373" },
            { label: "Est TDEE", value: estTdee != null ? `${estTdee} kcal` : "—", color: "#a78bfa" },
          ]}
        />
      </div>

      {!a && (
        <div
          style={{
            marginTop: 14,
            padding: "12px 16px",
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            fontSize: 9,
            color: theme.finePrint,
            letterSpacing: 0.4,
          }}
        >
          Apple Health data (weight, steps, nutrition) comes from your iOS Shortcut. Run it each morning to populate.
        </div>
      )}
    </div>
  );
}
