import { useState, useEffect, useMemo } from "react";

const FONT = '"Inter", system-ui, -apple-system, sans-serif';

/** Current calendar month (trends reset each month automatically). */
function monthContext(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const label = new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  return { year: y, month: m, label };
}

/** Calendar day of cycle end in the user's browser TZ — matches Apple yz-health-{date} keys. */
function cycleLocalYMD(row) {
  const iso = row?.cycleEndIso || row?.cycleStart;
  if (!iso) return row?.cycleEndDate ?? null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return row?.cycleEndDate ?? null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function filterWhoopMonth(days, year, month1) {
  if (!days?.length) return [];
  return days.filter((row) => {
    const iso = row.cycleEndIso || row.cycleStart;
    if (iso) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        return d.getFullYear() === year && d.getMonth() + 1 === month1;
      }
    }
    if (row.cycleEndDate) {
      const parts = row.cycleEndDate.split("-").map(Number);
      return parts[0] === year && parts[1] === month1;
    }
    return false;
  });
}

function filterAppleMonth(points, year, month1) {
  if (!points?.length) return [];
  return points.filter((p) => {
    const parts = p.date.split("-").map(Number);
    return parts[0] === year && parts[1] === month1;
  });
}

const msToHm = (ms) => {
  if (ms == null || ms === 0) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
};

const fmt = (v, unit = "", decimals = 0) =>
  v == null ? "—" : `${typeof v === "number" ? v.toFixed(decimals) : v}${unit}`;

const recoveryColor = (score) => {
  if (score == null) return "#e5e7eb";
  if (score >= 67) return "#4ade80";
  if (score >= 34) return "#facc15";
  return "#fb923c";
};

const recoveryLabel = (score) => {
  if (score == null) return "Sync to see recovery";
  if (score >= 67) return "Ready to perform";
  if (score >= 34) return "Keep it moderate";
  return "Keep it light";
};

const strainColor = (strain) => {
  if (strain == null) return "#a3a3a3";
  if (strain >= 18) return "#fb923c";
  if (strain >= 14) return "#facc15";
  if (strain >= 10) return "#c084fc";
  return "#4ade80";
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

/** Normalizes numeric series to [0,1] for chart Y; independent min/max per series. */
function normalizeY(values) {
  const valid = values.filter((x) => x != null && !Number.isNaN(x));
  if (!valid.length) return values.map(() => null);
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const span = max - min || 1;
  return values.map((x) => (x == null || Number.isNaN(x) ? null : (x - min) / span));
}

/** Simple linear regression y on index for trend overlay */
function linearTrend(values) {
  const pts = values.map((y, i) => ({ i, y })).filter((p) => p.y != null && !Number.isNaN(p.y));
  if (pts.length < 2) return values.map(() => null);
  const n = pts.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  for (const p of pts) {
    sumX += p.i;
    sumY += p.y;
    sumXY += p.i * p.y;
    sumXX += p.i * p.i;
  }
  const denom = n * sumXX - sumX * sumX || 1;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return values.map((_, i) => slope * i + intercept);
}

/** Cubic-smooth path; breaks at nulls so gaps don’t interpolate falsely. */
function smoothPath(normYs, w, h, pad) {
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;
  const n = normYs.length;
  if (n < 1) return "";

  let acc = "";
  let prevNonNull = null;
  normYs.forEach((nv, i) => {
    if (nv == null) {
      prevNonNull = null;
      return;
    }
    const x = pad.left + (i / Math.max(1, n - 1)) * iw;
    const y = pad.top + (1 - nv) * ih;
    if (prevNonNull == null) {
      acc += `${acc ? " " : ""}M ${x},${y}`;
      prevNonNull = { x, y, i };
      return;
    }
    const px = prevNonNull.x;
    const py = prevNonNull.y;
    const cpx = (px + x) / 2;
    acc += ` C ${cpx},${py} ${cpx},${y} ${x},${y}`;
    prevNonNull = { x, y, i };
  });
  return acc;
}

/**
 * Multi-series line chart from raw numeric arrays (same length).
 * Each series normalized independently so scales stay faithful to trends.
 */
function DataChart({ datasets, legend, legendMuted = "#737373", w = 168, h = 58, pad = { top: 5, bottom: 4, left: 2, right: 2 } }) {
  if (!datasets?.length) return null;

  const normalized = datasets.map((ds) => ({
    ...ds,
    norm: normalizeY(ds.values),
  }));

  const n = normalized[0]?.norm?.length ?? 0;
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;

  return (
    <div style={{ flexShrink: 0 }}>
      <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
        {normalized.map((ds, idx) => {
          const valid = (ds.norm || []).filter((v) => v != null);
          if (valid.length === 1) {
            const i = ds.norm.findIndex((v) => v != null);
            const x = n <= 1 ? pad.left + iw / 2 : pad.left + (i / Math.max(1, n - 1)) * iw;
            const y = pad.top + (1 - ds.norm[i]) * ih;
            return <circle key={idx} cx={x} cy={y} r={3} fill={ds.color} opacity={0.95} />;
          }
          const d = smoothPath(ds.norm, w, h, pad);
          if (!d) return null;
          return (
            <path
              key={idx}
              d={d}
              fill="none"
              stroke={ds.color}
              strokeWidth={ds.dashed ? 1.25 : 1.75}
              strokeDasharray={ds.dashed ? "5 4" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.95}
            />
          );
        })}
      </svg>
      {legend?.length > 0 && (
        <div style={{ display: "flex", gap: 7, marginTop: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: w + 40 }}>
          {legend.map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <svg width={14} height={3} style={{ overflow: "visible" }}>
                <line x1={0} y1={1.5} x2={14} y2={1.5} stroke={l.color} strokeWidth={1.75} strokeDasharray={l.dashed ? "4 3" : undefined} />
              </svg>
              <span style={{ fontSize: 7, color: legendMuted, letterSpacing: 0.35, fontWeight: 500 }}>{l.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Weight + dashed linear trend (same Y scale as weight). */
function BodyWeightChart({ weights, w = 168, h = 58 }) {
  const pad = { top: 5, bottom: 4, left: 2, right: 2 };
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;
  const n = weights.length;
  const vals = weights.filter((y) => y != null && !Number.isNaN(y));
  const min = vals.length ? Math.min(...vals) : 0;
  const max = vals.length ? Math.max(...vals) : 1;
  const span = max - min || 1;
  const normW = weights.map((y) => (y == null || Number.isNaN(y) ? null : (y - min) / span));

  if (vals.length === 1) {
    const i = normW.findIndex((v) => v != null);
    const x = n <= 1 ? pad.left + iw / 2 : pad.left + (i / Math.max(1, n - 1)) * iw;
    const y = pad.top + (1 - normW[i]) * ih;
    return (
      <div style={{ flexShrink: 0 }}>
        <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
          <circle cx={x} cy={y} r={3} fill="#38bdf8" opacity={0.95} />
        </svg>
        <div style={{ display: "flex", gap: 10, marginTop: 6, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 7, color: "#737373", fontWeight: 500 }}>WEIGHT (month)</span>
        </div>
      </div>
    );
  }

  const trendRaw = linearTrend(weights);
  const normT = trendRaw.map((y) => (y == null || Number.isNaN(y) ? null : (y - min) / span));
  const dW = smoothPath(normW, w, h, pad);
  const dT = smoothPath(normT, w, h, pad);

  return (
    <div style={{ flexShrink: 0 }}>
      <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
        {dW && <path d={dW} fill="none" stroke="#38bdf8" strokeWidth={1.75} strokeLinecap="round" opacity={0.95} />}
        {dT && vals.length >= 2 && (
          <path d={dT} fill="none" stroke="#737373" strokeWidth={1.35} strokeDasharray="5 4" strokeLinecap="round" opacity={0.85} />
        )}
      </svg>
      <div style={{ display: "flex", gap: 10, marginTop: 6, justifyContent: "flex-end" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width={14} height={3}>
            <line x1={0} y1={1.5} x2={14} y2={1.5} stroke="#38bdf8" strokeWidth={1.75} />
          </svg>
          <span style={{ fontSize: 7, color: "#737373", fontWeight: 500 }}>WEIGHT</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width={14} height={3}>
            <line x1={0} y1={1.5} x2={14} y2={1.5} stroke="#737373" strokeWidth={1.35} strokeDasharray="4 3" />
          </svg>
          <span style={{ fontSize: 7, color: "#737373", fontWeight: 500 }}>TREND</span>
        </div>
      </div>
    </div>
  );
}

function MonthEmpty({ message }) {
  return (
    <div
      style={{
        width: 172,
        height: 58,
        flexShrink: 0,
        border: "1px dashed #3f3f3f",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 10px",
        textAlign: "center",
        fontSize: 8,
        color: "#525252",
        fontFamily: FONT,
        lineHeight: 1.35,
      }}
    >
      {message}
    </div>
  );
}

function MiniSparkline({ values, color = "#737373" }) {
  const w = 56,
    h = 24,
    pad = { top: 4, bottom: 4, left: 2, right: 2 };
  const arr = values || [];
  const norm = normalizeY(arr);
  const valid = arr.filter((x) => x != null && !Number.isNaN(x));
  if (!valid.length) {
    return <div style={{ width: w, height: h, flexShrink: 0 }} />;
  }
  if (valid.length === 1) {
    const nv = norm.find((x) => x != null);
    const x = w / 2;
    const y = pad.top + (1 - nv) * (h - pad.top - pad.bottom);
    return (
      <svg width={w} height={h} style={{ flexShrink: 0, opacity: 0.95 }}>
        <circle cx={x} cy={y} r={2.5} fill={color} />
      </svg>
    );
  }
  const d = smoothPath(norm, w, h, pad);
  if (!d) return <div style={{ width: w, height: h, flexShrink: 0 }} />;
  return (
    <svg width={w} height={h} style={{ flexShrink: 0, opacity: 0.95 }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DonutChart({ protein, carbs, fat }) {
  const r = 28,
    cx = 40,
    cy = 40;
  const circ = 2 * Math.PI * r;
  const total = (protein || 0) + (carbs || 0) + (fat || 0);

  const segments = [
    { value: protein || 0, color: "#fb923c", label: "PROTEIN" },
    { value: carbs || 0, color: "#3b82f6", label: "CARBS" },
    { value: fat || 0, color: "#facc15", label: "FAT" },
  ];

  let cumPct = 0;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <svg width={80} height={80} style={{ flexShrink: 0 }}>
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2a2a" strokeWidth={10} />
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
                strokeWidth={10}
                strokeDasharray={`${dash} ${circ}`}
                strokeDashoffset={offset}
                style={{ transform: "rotate(-90deg)", transformOrigin: `${cx}px ${cy}px` }}
              />
            );
          })
        )}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingTop: 4 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, opacity: total === 0 ? 0.2 : 1 }} />
            <span style={{ fontSize: 8, color: "#a3a3a3", letterSpacing: 0.4, fontWeight: 500 }}>
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
        borderRadius: 10,
        padding: "16px 18px 18px",
        flex: "1 1 22%",
        minWidth: 200,
        display: "flex",
        flexDirection: "column",
        gap: 3,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 40px rgba(0,0,0,0.45)",
      }}
    >
      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.52)", letterSpacing: 2.5, fontWeight: 700, fontFamily: FONT }}>{label.toUpperCase()}</span>
      <span
        style={{
          fontSize: 48,
          fontWeight: 800,
          color: "#fff",
          lineHeight: 1,
          fontFamily: FONT,
          marginTop: 4,
          letterSpacing: -1.5,
        }}
      >
        {value}
      </span>
      {lines.map((line, i) => (
        <span
          key={i}
          style={{
            fontSize: i === 0 ? 11.5 : 10,
            fontWeight: i === 0 ? 500 : 400,
            color: i === 0 ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.5)",
            marginTop: i === 0 ? 6 : 2,
            lineHeight: 1.4,
            fontFamily: FONT,
          }}
        >
          {line}
        </span>
      ))}
    </div>
  );
}

function Metric({ label, value, color, muted, valueDefault = "#e5e7eb", spark, sparkColor }) {
  const lineColor = sparkColor || color || "#737373";
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 8, color: muted || "#737373", letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 600, fontFamily: FONT }}>
          {label}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: color ?? valueDefault, fontFamily: FONT, lineHeight: 1.2 }}>{value}</span>
      </div>
      <MiniSparkline values={spark} color={lineColor} />
    </div>
  );
}

function PanelIcon({ color }) {
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: `radial-gradient(circle at 30% 25%, ${color}66, ${color}14 65%, transparent)`,
        border: `1px solid ${color}40`,
        flexShrink: 0,
      }}
    />
  );
}

function Panel({ title, main, mainSub, mainColor, metrics, chart, iconColor = "#6366f1", surface, border, titleColor, subColor, dividerColor, metricMuted, valueDefault = "#e5e7eb", minh }) {
  return (
    <div
      style={{
        background: surface || "#161616",
        border: `1px solid ${border || "#2a2a2a"}`,
        borderRadius: 10,
        padding: "14px 16px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: minh || 236,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 8, color: titleColor || "#525252", letterSpacing: 2.8, fontWeight: 700, fontFamily: FONT }}>{title.toUpperCase()}</span>
        <PanelIcon color={iconColor} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 42, fontWeight: 800, color: mainColor || "#fafafa", lineHeight: 1, fontFamily: FONT, letterSpacing: -1.2 }}>{main}</div>
          {mainSub && (
            <div style={{ fontSize: 11.5, color: subColor || "#737373", marginTop: 5, lineHeight: 1.35, fontWeight: 400, fontFamily: FONT }}>{mainSub}</div>
          )}
        </div>
        {chart && <div style={{ flexShrink: 0 }}>{chart}</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "11px 14px", paddingTop: 12, marginTop: "auto", borderTop: `1px solid ${dividerColor || "#2a2a2a"}` }}>
        {metrics.map(({ label, value, color, spark, sparkColor }, idx) => (
          <Metric
            key={`${title}-${idx}-${label}`}
            label={label}
            value={value}
            color={color}
            muted={metricMuted}
            valueDefault={valueDefault}
            spark={spark}
            sparkColor={sparkColor}
          />
        ))}
      </div>
    </div>
  );
}

const CAL_GOAL = 1900;
const PROTEIN_GOAL_G = 180;

function mergeAppleSteps(whoopDays, applePoints) {
  const byDate = new Map((applePoints || []).map((p) => [p.date, p]));
  return whoopDays.map((row) => byDate.get(cycleLocalYMD(row))?.steps ?? null);
}

export default function HealthPanel({ darkMode = true }) {
  const [data, setData] = useState(() => ls.get(HEALTH_KEY()) || {});
  const [series, setSeries] = useState(() => ls.get("yz-whoop-series-v2"));
  const [appleHist, setAppleHist] = useState(() => ls.get("yz-health-history-v1"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadSnapshots = () => {
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
  };

  const loadSeries = () => {
    fetch("/api/whoop-series")
      .then((r) => r.json())
      .then((json) => {
        if (json.days?.length) {
          ls.set("yz-whoop-series-v2", json);
          setSeries(json);
        }
      })
      .catch(() => {});
    fetch("/api/health-history")
      .then((r) => r.json())
      .then((json) => {
        if (json.points?.length) {
          ls.set("yz-health-history-v1", json);
          setAppleHist(json);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadSnapshots();
    loadSeries();
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

      const seriesRes = await fetch("/api/whoop-series");
      const seriesJson = await seriesRes.json();
      if (seriesJson.days?.length) {
        ls.set("yz-whoop-series-v2", seriesJson);
        setSeries(seriesJson);
      }
      const histRes = await fetch("/api/health-history");
      const histJson = await histRes.json();
      if (histJson.points?.length) {
        ls.set("yz-health-history-v1", histJson);
        setAppleHist(histJson);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const w = data?.whoop;
  const a = data?.apple;

  const allWhoop = series?.days || [];
  const applePoints = appleHist?.points || [];

  const cy = new Date().getFullYear();
  const cm = new Date().getMonth() + 1;
  const monthTitle = new Date(cy, cm - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  const monthWhoop = useMemo(() => filterWhoopMonth(allWhoop, cy, cm), [allWhoop, cy, cm]);
  const monthApple = useMemo(() => filterAppleMonth(applePoints, cy, cm), [applePoints, cy, cm]);

  const chartSlice = useMemo(() => {
    const d = monthWhoop;
    const stepsAligned = mergeAppleSteps(d, applePoints);
    const weightsAligned = d.map((row) => {
      const hit = applePoints.find((p) => p.date === cycleLocalYMD(row));
      return hit?.weight_lb ?? null;
    });

    const sortedAppleMonth = [...monthApple].sort((a, b) => a.date.localeCompare(b.date));
    const monthWeights = sortedAppleMonth.map((p) => p.weight_lb ?? null);

    const recoveryChart = {
      datasets: [
        { values: d.map((x) => x.recoveryScore), color: "#facc15", label: "RECOVERY" },
        { values: d.map((x) => x.rhr), color: "#60a5fa", label: "RHR" },
        { values: d.map((x) => x.hrv), color: "#c084fc", label: "HRV" },
        { values: d.map((x) => x.spo2), color: "#4ade80", label: "SpO2" },
      ],
      legend: [
        { label: "RECOVERY", color: "#facc15" },
        { label: "RHR", color: "#60a5fa" },
        { label: "HRV", color: "#c084fc" },
        { label: "SpO2", color: "#4ade80" },
      ],
    };

    const pulseChart = {
      datasets: [{ values: d.map((x) => x.avgHr), color: "#2dd4bf", label: "AVG HR" }],
      legend: [{ label: "PULSE TRACE", color: "#2dd4bf" }],
    };

    const sleepChart = {
      datasets: [
        { values: d.map((x) => (x.lightMs != null ? x.lightMs / 3600000 : null)), color: "#fb923c", label: "CORE" },
        { values: d.map((x) => (x.deepMs != null ? x.deepMs / 3600000 : null)), color: "#3b82f6", label: "DEEP" },
        { values: d.map((x) => (x.remMs != null ? x.remMs / 3600000 : null)), color: "#a78bfa", label: "REM" },
      ],
      legend: [
        { label: "CORE", color: "#fb923c" },
        { label: "DEEP", color: "#3b82f6" },
        { label: "REM", color: "#a78bfa" },
      ],
    };

    const strainTrend = linearTrend(d.map((x) => x.strain));
    const activityChart = {
      datasets: [
        { values: stepsAligned.map((s) => (s != null ? s / 10000 : null)), color: "#fb923c", label: "STEPS" },
        { values: d.map((x) => (x.energyKcal != null ? x.energyKcal / 400 : null)), color: "#38bdf8", label: "ENERGY" },
        { values: d.map((x) => x.strain), color: "#c084fc", label: "STRAIN" },
        { values: strainTrend, color: "#737373", dashed: true, label: "TREND" },
      ],
      legend: [
        { label: "STEPS", color: "#fb923c" },
        { label: "ENERGY", color: "#38bdf8" },
        { label: "STRAIN", color: "#c084fc" },
        { label: "TREND", color: "#737373", dashed: true },
      ],
    };

    return {
      recoveryChart,
      pulseChart,
      sleepChart,
      activityChart,
      weightsAligned,
      stepsAligned,
      monthWeights,
      sortedAppleMonth,
    };
  }, [monthWhoop, monthApple, applePoints]);

  const latest = allWhoop[allWhoop.length - 1] || {};
  const summary = series?.summary || {};

  const recScore = w?.recovery?.score ?? latest.recoveryScore;
  const recColor = recoveryColor(recScore);
  const strainVal = w?.strain ?? latest.strain;
  const sColor = strainColor(strainVal);

  const whoopTime = w?.fetchedAt ? new Date(w.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;
  const appleTime = a?.fetchedAt ? new Date(a.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;

  const totalSleepMs = w?.sleep?.totalMs ?? latest.sleepTotalMs;
  const mainSleepMs = latest.sleepMainMs ?? totalSleepMs;
  const napMs = latest.sleepNapMs;

  const napLabel = napMs != null && napMs > 0 ? msToHm(napMs) : "—";
  const sleepSubNight = mainSleepMs != null ? `Night ${msToHm(mainSleepMs)} · Naps ${napLabel}` : "Night — · Naps —";

  const sleepDebt = w?.sleep?.debtMs ?? latest.sleepDebtMs;
  const sleepNeedMs = latest.sleepNeedMs;

  const deltaHVs7d =
    summary.sleepVs7dHours != null
      ? `${summary.sleepVs7dHours <= 0 ? "" : "+"}${summary.sleepVs7dHours.toFixed(1)}h vs 7D`
      : "— vs 7D";

  const sleepLine2 =
    sleepDebt != null && sleepNeedMs != null
      ? `${deltaHVs7d} · ${msToHm(sleepNeedMs)} needed`
      : sleepNeedMs != null
        ? `${deltaHVs7d} · ${msToHm(sleepNeedMs)} needed`
        : `${deltaHVs7d}`;

  const weightLb = a?.weight_lb;
  const bf = a?.body_fat_pct;
  const vsPlanLb = a?.vs_plan_lb;
  const startW = a?.start_weight_lb;
  const goalW = a?.goal_weight_lb;

  const heroWeightLine1 =
    vsPlanLb != null ? `${vsPlanLb >= 0 ? "+" : ""}${vsPlanLb.toFixed(1)} lb vs plan` : weightLb != null ? "— vs plan" : "— vs plan";

  const firstAppleDate = applePoints[0]?.date ? new Date(applePoints[0].date + "T12:00:00") : null;
  const weeksLogging =
    firstAppleDate != null ? Math.max(1, (Date.now() - firstAppleDate.getTime()) / (7 * 86400000)) : null;
  const paceLbPerWk =
    startW != null && weightLb != null && weeksLogging != null ? (startW - weightLb) / weeksLogging : null;

  const heroWeightLine2 =
    bf != null && paceLbPerWk != null && Number.isFinite(paceLbPerWk)
      ? `${bf.toFixed(1)}% est. body fat · ${paceLbPerWk.toFixed(1)} lb/wk loss pace`
      : bf != null
        ? `${bf.toFixed(1)}% est. body fat`
        : "Body composition from Apple Health";

  const todayShort = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const recoveryPts =
    summary.recoveryDelta30 != null ? `${summary.recoveryDelta30 >= 0 ? "+" : ""}${Math.round(summary.recoveryDelta30)} pts vs 30D` : "— vs 30D";
  const heroRecoveryLines = [recoveryPts, `Cycle · ${latest.dayLabel || todayShort}`];

  const rhrPts =
    summary.rhrDelta30 != null ? `${summary.rhrDelta30 >= 0 ? "+" : ""}${summary.rhrDelta30.toFixed(0)} bpm vs 30D` : "— vs 30D";
  const heroRhrLines = [
    rhrPts,
    w?.recovery?.hrv != null ? `${w.recovery.hrv} ms HRV · WHOOP resting heart rate` : latest.hrv != null ? `${latest.hrv} ms HRV · WHOOP resting heart rate` : "WHOOP resting heart rate",
  ];

  const calIn = a?.calories != null ? Math.round(a.calories) : null;
  const protIn = a?.protein_g != null ? Math.round(a.protein_g) : null;
  const calLeft = calIn != null ? Math.max(0, CAL_GOAL - calIn) : null;
  const protLeft = protIn != null ? Math.max(0, PROTEIN_GOAL_G - protIn) : null;
  const estTdee = a?.tdee_kcal != null ? Math.round(a.tdee_kcal) : null;
  const dexaRmr = a?.rmr_kcal != null ? Math.round(a.rmr_kcal) : null;

  const theme = darkMode
    ? { bg: "#0f0f0f", headerSub: "#737373", panel: "#161616", sparkLegend: "#737373", border: "#2a2a2a", panelTitle: "#525252", metricMuted: "#737373", finePrint: "#737373", valueDefault: "#e5e7eb" }
    : { bg: "#ecebe8", headerSub: "#64748b", panel: "#ffffff", sparkLegend: "#94a3b8", border: "#e2e2df", panelTitle: "#78716c", metricMuted: "#78716c", finePrint: "#57534e", valueDefault: "#1c1917" };

  const panelSkin = {
    surface: theme.panel,
    border: theme.border,
    titleColor: theme.panelTitle,
    subColor: theme.metricMuted,
    dividerColor: theme.border,
    metricMuted: theme.metricMuted,
    valueDefault: theme.valueDefault,
    minh: 248,
  };

  const strain7d = summary.strainSum7d != null ? summary.strainSum7d.toFixed(1) : "—";

  const lostLb = startW != null && weightLb != null ? startW - weightLb : null;
  const progressPct =
    startW != null && goalW != null && weightLb != null && startW !== goalW
      ? Math.min(100, Math.max(0, Math.round(((startW - weightLb) / (startW - goalW)) * 100)))
      : null;

  const respRate = latest.respiratoryRate;

  const needDisplay = sleepNeedMs != null ? msToHm(sleepNeedMs) : msToHm(8 * 3600000 + 38 * 60000);

  const hasWhoopMonth = monthWhoop.length > 0;

  const recoveryChartEl = hasWhoopMonth ? (
    <DataChart {...chartSlice.recoveryChart} legendMuted={theme.sparkLegend} w={172} h={58} />
  ) : (
    <MonthEmpty message={`No WHOOP cycles dated in ${monthTitle} yet. Sync to load this month.`} />
  );

  const pulseChartEl = hasWhoopMonth ? (
    <DataChart {...chartSlice.pulseChart} legendMuted={theme.sparkLegend} w={172} h={58} />
  ) : (
    <MonthEmpty message={`No WHOOP cycles dated in ${monthTitle} yet.`} />
  );

  const sleepChartEl = hasWhoopMonth ? (
    <DataChart {...chartSlice.sleepChart} legendMuted={theme.sparkLegend} w={172} h={58} />
  ) : (
    <MonthEmpty message={`No WHOOP cycles dated in ${monthTitle} yet.`} />
  );

  const activityChartEl = hasWhoopMonth ? (
    <DataChart {...chartSlice.activityChart} legendMuted={theme.sparkLegend} w={172} h={58} />
  ) : (
    <MonthEmpty message={`No WHOOP cycles dated in ${monthTitle} yet.`} />
  );

  const mw = chartSlice.monthWeights || [];
  const bodyChartEl =
    mw.filter((x) => x != null).length >= 1 ? (
      <BodyWeightChart weights={mw} w={172} h={58} />
    ) : (
      <MonthEmpty message={`No Apple weight logs in ${monthTitle}. Run your Shortcut on gym days.`} />
    );

  const sortedNut = [...monthApple].sort((a, b) => a.date.localeCompare(b.date));
  const nutCal = sortedNut.map((p) => p.calories ?? null);
  const nutProtLeft = sortedNut.map((p) => (p.protein_g != null ? Math.max(0, PROTEIN_GOAL_G - p.protein_g) : null));
  const nutCarbs = sortedNut.map((p) => p.carbs_g ?? null);
  const nutFat = sortedNut.map((p) => p.fat_g ?? null);
  const nutCalLeft = sortedNut.map((p) => (p.calories != null ? Math.max(0, CAL_GOAL - p.calories) : null));

  const bodyMainSub =
    paceLbPerWk != null && Number.isFinite(paceLbPerWk)
      ? `${paceLbPerWk.toFixed(1)} lb/wk loss pace`
      : bf != null
        ? `${bf.toFixed(1)}% body fat`
        : "Sync Apple Health";

  if (!darkMode) {
    return (
      <div style={{ padding: 24, fontFamily: FONT, color: "#1a1a1a", background: theme.bg, minHeight: "calc(100vh - 52px)" }}>
        <p style={{ fontSize: 13 }}>Use dark mode for the health dashboard.</p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "18px 20px 32px",
        maxWidth: 1240,
        margin: "0 auto",
        fontFamily: FONT,
        background: "#0f0f0f",
        minHeight: "calc(100vh - 52px)",
        color: "#fafafa",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 9, color: "#525252", letterSpacing: 3.2, fontWeight: 700 }}>HEALTH</div>
          <div style={{ fontSize: 9, color: theme.headerSub, letterSpacing: 0.5, marginTop: 5, fontWeight: 400 }}>
            Trends · {monthTitle} · cycles dated this month
          </div>
          <div style={{ fontSize: 9, color: "#3f3f3f", letterSpacing: 0.4, marginTop: 4, fontWeight: 400 }}>
            {whoopTime ? `WHOOP ${whoopTime}` : "WHOOP NOT SYNCED"}
            {appleTime ? ` · APPLE ${appleTime}` : " · APPLE NOT SYNCED"}
          </div>
        </div>
        <button
          onClick={fetchWhoop}
          disabled={loading}
          style={{
            background: loading ? "#1a1a1a" : "rgba(45, 212, 191, 0.1)",
            border: `1px solid ${loading ? "#333" : "rgba(45, 212, 191, 0.35)"}`,
            borderRadius: 8,
            padding: "10px 22px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 9,
            color: loading ? "#525252" : "#2dd4bf",
            letterSpacing: 1.8,
            fontWeight: 700,
            fontFamily: FONT,
          }}
        >
          {loading ? "SYNCING…" : "SYNC WHOOP"}
        </button>
      </div>

      {error && (
        <div style={{ background: "rgba(251, 146, 60, 0.08)", border: "1px solid rgba(251, 146, 60, 0.28)", borderRadius: 10, padding: "10px 16px", fontSize: 11, color: "#fb923c", marginBottom: 14, fontFamily: FONT }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <HeroCard
          label="Recovery Score"
          value={fmt(recScore)}
          lines={heroRecoveryLines}
          gradient="linear-gradient(145deg, #6d28d9 0%, #5b21b6 38%, #3730a3 100%)"
        />
        <HeroCard
          label="Resting Heart Rate"
          value={w?.recovery?.rhr != null ? `${w.recovery.rhr} bpm` : latest.rhr != null ? `${latest.rhr} bpm` : "—"}
          lines={heroRhrLines}
          gradient="linear-gradient(145deg, #0f766e 0%, #14b8a6 42%, #2dd4bf 100%)"
        />
        <HeroCard
          label="Total Sleep"
          value={msToHm(totalSleepMs)}
          lines={[sleepSubNight, sleepLine2]}
          gradient="linear-gradient(145deg, #14532d 0%, #166534 42%, #16a34a 100%)"
        />
        <HeroCard
          label="Current Weight"
          value={weightLb != null ? `${weightLb.toFixed(1)} lb` : "—"}
          lines={[heroWeightLine1, heroWeightLine2]}
          gradient="linear-gradient(145deg, #1e3a8a 0%, #1d4ed8 48%, #0ea5e9 100%)"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, gridAutoRows: "minmax(248px, auto)" }}>
        <Panel
          {...panelSkin}
          title="Recovery"
          main={fmt(recScore)}
          mainSub={recoveryLabel(recScore)}
          mainColor={recColor}
          iconColor="#c084fc"
          chart={recoveryChartEl}
          metrics={[
            { label: "RHR", value: fmt(w?.recovery?.rhr ?? latest.rhr, " bpm"), spark: monthWhoop.map((x) => x.rhr), sparkColor: "#60a5fa" },
            { label: "HRV", value: fmt(w?.recovery?.hrv ?? latest.hrv, " ms"), color: "#c084fc", spark: monthWhoop.map((x) => x.hrv), sparkColor: "#c084fc" },
            { label: "SpO2", value: fmt(w?.recovery?.spo2 ?? latest.spo2, "%", 1), spark: monthWhoop.map((x) => x.spo2), sparkColor: "#4ade80" },
            {
              label: "Need",
              value: needDisplay,
              color: "#a3a3a3",
              spark: monthWhoop.map((x) => (x.sleepNeedMs != null ? x.sleepNeedMs / 3600000 : null)),
              sparkColor: "#a3a3a3",
            },
          ]}
        />

        <Panel
          {...panelSkin}
          title="Pulse"
          main={w?.recovery?.rhr != null ? `${w.recovery.rhr} bpm` : latest.rhr != null ? `${latest.rhr} bpm` : "—"}
          mainSub="WHOOP resting heart rate"
          mainColor="#fafafa"
          iconColor="#2dd4bf"
          chart={pulseChartEl}
          metrics={[
            { label: "Cycle avg", value: fmt(w?.avgHr ?? latest.avgHr, " bpm"), spark: monthWhoop.map((x) => x.avgHr), sparkColor: "#2dd4bf" },
            {
              label: "Resp",
              value: respRate != null ? `${respRate.toFixed(1)}/min` : "—",
              spark: monthWhoop.map((x) => x.respiratoryRate),
              sparkColor: "#2dd4bf",
            },
            { label: "SpO2", value: fmt(w?.recovery?.spo2 ?? latest.spo2, "%", 1), spark: monthWhoop.map((x) => x.spo2), sparkColor: "#4ade80" },
            { label: "Workout max", value: fmt(w?.maxHr ?? latest.maxHr, " bpm"), color: "#fb923c", spark: monthWhoop.map((x) => x.maxHr), sparkColor: "#fb923c" },
          ]}
        />

        <Panel
          {...panelSkin}
          title="Sleep"
          main={msToHm(totalSleepMs)}
          mainSub={sleepSubNight}
          mainColor="#c084fc"
          iconColor="#818cf8"
          chart={sleepChartEl}
          metrics={[
            {
              label: "Deep",
              value: msToHm(w?.sleep?.deepMs ?? latest.deepMs),
              color: "#3b82f6",
              spark: monthWhoop.map((x) => (x.deepMs != null ? x.deepMs / 3600000 : null)),
              sparkColor: "#3b82f6",
            },
            {
              label: "REM",
              value: msToHm(w?.sleep?.remMs ?? latest.remMs),
              color: "#a78bfa",
              spark: monthWhoop.map((x) => (x.remMs != null ? x.remMs / 3600000 : null)),
              sparkColor: "#a78bfa",
            },
            {
              label: "Eff",
              value: fmt(w?.sleep?.efficiency ?? latest.sleepEfficiency, "%"),
              color: (w?.sleep?.efficiency ?? latest.sleepEfficiency) >= 85 ? "#4ade80" : "#facc15",
              spark: monthWhoop.map((x) => x.sleepEfficiency),
              sparkColor: "#facc15",
            },
            {
              label: "Debt",
              value: msToHm(w?.sleep?.debtMs ?? latest.sleepDebtMs),
              color: (w?.sleep?.debtMs ?? latest.sleepDebtMs) > 0 ? "#fb923c" : "#4ade80",
              spark: monthWhoop.map((x) => (x.sleepDebtMs != null ? x.sleepDebtMs / 3600000 : null)),
              sparkColor: "#fb923c",
            },
          ]}
        />

        <Panel
          {...panelSkin}
          title="Body"
          main={weightLb != null ? `${weightLb.toFixed(1)} lb` : "—"}
          mainSub={bodyMainSub}
          mainColor="#facc15"
          iconColor="#38bdf8"
          chart={bodyChartEl}
          metrics={[
            {
              label: "BF est",
              value: fmt(bf, "%", 1),
              spark: [...monthApple].sort((a, b) => a.date.localeCompare(b.date)).map((p) => p.body_fat_pct ?? null),
              sparkColor: "#facc15",
            },
            {
              label: "Lost",
              value: lostLb != null ? `${lostLb.toFixed(1)} lb` : "—",
              color: "#4ade80",
              spark: chartSlice.monthWeights,
              sparkColor: "#4ade80",
            },
            {
              label: "Progress",
              value: progressPct != null ? `${progressPct}%` : "—",
              color: "#38bdf8",
              spark: chartSlice.monthWeights,
              sparkColor: "#38bdf8",
            },
            { label: "DEXA Δ", value: a?.dexa_delta_pct != null ? `${fmt(a.dexa_delta_pct, "%", 1)}` : "—", color: "#a3a3a3" },
          ]}
        />

        <Panel
          {...panelSkin}
          title="Activity"
          main={strainVal != null ? `${strainVal.toFixed(1)} strain` : "—"}
          mainSub={
            a?.steps != null
              ? `${Math.round(a.steps).toLocaleString()} steps · ${latest.dayLabel || "today"}`
              : latest.dayLabel
                ? `Cycle · ${latest.dayLabel}`
                : "Strain & movement"
          }
          mainColor={sColor}
          iconColor="#fb923c"
          chart={activityChartEl}
          metrics={[
            {
              label: "Steps",
              value: a?.steps != null ? Math.round(a.steps).toLocaleString() : "—",
              color: "#4ade80",
              spark: mergeAppleSteps(monthWhoop, applePoints),
              sparkColor: "#4ade80",
            },
            {
              label: "Energy",
              value: a?.active_energy_kcal != null ? `${Math.round(a.active_energy_kcal)} kcal` : latest.energyKcal != null ? `${latest.energyKcal} kcal` : "—",
              color: "#38bdf8",
              spark: monthWhoop.map((x) => x.energyKcal),
              sparkColor: "#38bdf8",
            },
            { label: "7D strain", value: strain7d, color: "#c084fc", spark: monthWhoop.map((x) => x.strain), sparkColor: "#c084fc" },
            {
              label: "Walk",
              value: fmt(a?.distance_mi, " mi", 1),
              spark: [...monthApple].sort((a, b) => a.date.localeCompare(b.date)).map((p) => p.distance_mi ?? null),
              sparkColor: "#fb923c",
            },
          ]}
        />

        <Panel
          {...panelSkin}
          title="Nutrition"
          main={`${calIn != null ? calIn.toLocaleString() : "—"} / ${CAL_GOAL.toLocaleString()}`}
          mainSub={`${protIn != null ? protIn : "—"}g / ${PROTEIN_GOAL_G}g protein`}
          mainColor="#fb923c"
          iconColor="#facc15"
          chart={<DonutChart protein={a?.protein_g} carbs={a?.carbs_g} fat={a?.fat_g} />}
          metrics={[
            { label: "Cal left", value: calLeft != null ? calLeft.toLocaleString() : "—", color: "#a3a3a3", spark: nutCalLeft, sparkColor: "#a3a3a3" },
            { label: "Prot left", value: protLeft != null ? `${protLeft}g` : "—", color: "#fb923c", spark: nutProtLeft, sparkColor: "#fb923c" },
            { label: "Carbs", value: fmt(a?.carbs_g, "g"), color: "#3b82f6", spark: nutCarbs, sparkColor: "#3b82f6" },
            { label: "Fat", value: fmt(a?.fat_g, "g"), color: "#facc15", spark: nutFat, sparkColor: "#facc15" },
            { label: "DEXA RMR", value: dexaRmr != null ? `${dexaRmr} kcal` : "—", color: "#737373" },
            { label: "Est TDEE", value: estTdee != null ? `${estTdee} kcal` : "—", color: "#c084fc" },
          ]}
        />
      </div>

      {!a && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 16px",
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            fontSize: 9,
            color: theme.finePrint,
            letterSpacing: 0.35,
            fontFamily: FONT,
          }}
        >
          Apple Health data (weight, steps, nutrition) comes from your iOS Shortcut. Run it each morning to populate.
        </div>
      )}
    </div>
  );
}
