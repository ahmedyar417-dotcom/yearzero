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
  if (score == null) return "#555";
  if (score >= 67) return "#00FF88";
  if (score >= 34) return "#FFD700";
  return "#FF6B35";
};

const strainColor = (strain) => {
  if (strain == null) return "#555";
  if (strain >= 18) return "#FF6B35";
  if (strain >= 14) return "#FFD700";
  if (strain >= 10) return "#A78BFA";
  return "#00FF88";
};

function StatCard({ label, value, sub, color = "#aaa", wide = false }) {
  return (
    <div style={{
      background: "#111",
      border: `1px solid ${color}22`,
      borderRadius: 12,
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      gridColumn: wide ? "span 2" : undefined,
    }}>
      <span style={{ fontSize: 9, color: "#444", letterSpacing: 2 }}>{label.toUpperCase()}</span>
      <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 28, color, letterSpacing: 1, lineHeight: 1 }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 10, color: "#555" }}>{sub}</span>}
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #1a1a1a", paddingTop: 12, marginTop: 4 }}>
      <span style={{ fontSize: 9, color: "#333", letterSpacing: 2 }}>{label.toUpperCase()}</span>
    </div>
  );
}

const HEALTH_KEY = () => `yz-health-${new Date().toISOString().slice(0, 10)}`;

const ls = {
  get: (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

export default function HealthPanel({ session }) {
  const [data, setData] = useState(() => ls.get(HEALTH_KEY()) || {});
  const [loading, setLoading] = useState({ whoop: false });
  const [error, setError] = useState(null);

  useEffect(() => {
    const saved = ls.get(HEALTH_KEY());
    if (saved) setData(saved);
  }, []);

  const fetchWhoop = async () => {
    setLoading(l => ({ ...l, whoop: true }));
    setError(null);
    try {
      const res = await fetch("/api/whoop");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "WHOOP fetch failed");
      const merged = { ...ls.get(HEALTH_KEY()), whoop: json };
      ls.set(HEALTH_KEY(), merged);
      setData(merged);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(l => ({ ...l, whoop: false }));
    }
  };

  const w = data?.whoop;
  const a = data?.apple;

  const recScore = w?.recovery?.score;
  const recColor = recoveryColor(recScore);
  const strainVal = w?.strain;
  const sColor = strainColor(strainVal);

  const lastSynced = w?.fetchedAt
    ? new Date(w.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div style={{ padding: "20px", maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 3, color: "#fff" }}>
            HEALTH
          </div>
          {lastSynced && (
            <div style={{ fontSize: 9, color: "#333", letterSpacing: 1, marginTop: 2 }}>
              WHOOP SYNCED {lastSynced}
              {a?.fetchedAt && ` · APPLE ${new Date(a.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}
            </div>
          )}
        </div>
        <button
          onClick={fetchWhoop}
          disabled={loading.whoop}
          style={{
            background: loading.whoop ? "#181818" : "#00FF8814",
            border: "1px solid #00FF8844",
            borderRadius: 8,
            padding: "7px 16px",
            cursor: loading.whoop ? "not-allowed" : "pointer",
            fontSize: 10,
            color: loading.whoop ? "#444" : "#00FF88",
            letterSpacing: 1,
          }}
        >
          {loading.whoop ? "SYNCING..." : "SYNC WHOOP"}
        </button>
      </div>

      {error && (
        <div style={{ background: "#FF6B3514", border: "1px solid #FF6B3544", borderRadius: 8, padding: "9px 14px", fontSize: 11, color: "#FF6B35", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>

        {/* Recovery */}
        <SectionHeader label="Recovery" />
        <StatCard label="Recovery" value={fmt(recScore)} color={recColor} />
        <StatCard label="RHR" value={fmt(w?.recovery?.rhr, " bpm")} color="#aaa" />
        <StatCard label="HRV" value={fmt(w?.recovery?.hrv, " ms")} color="#A78BFA" />
        <StatCard label="SpO2" value={fmt(w?.recovery?.spo2, "%", 1)} color="#aaa" />

        {/* Sleep */}
        <SectionHeader label="Sleep" />
        <StatCard label="Total Sleep" value={msToHm(w?.sleep?.totalMs)} color="#A78BFA" wide />
        <StatCard label="Deep" value={msToHm(w?.sleep?.deepMs)} color="#A78BFA" />
        <StatCard label="REM" value={msToHm(w?.sleep?.remMs)} color="#A78BFA" />
        <StatCard label="Efficiency" value={fmt(w?.sleep?.efficiency, "%")} color="#aaa" />
        <StatCard label="Sleep Debt" value={msToHm(w?.sleep?.debtMs)} color={w?.sleep?.debtMs > 0 ? "#FF6B35" : "#00FF88"} />

        {/* Strain */}
        <SectionHeader label="Activity" />
        <StatCard label="Strain" value={fmt(strainVal, "", 1)} color={sColor} />
        <StatCard label="Avg HR" value={fmt(w?.avgHr, " bpm")} color="#aaa" />
        <StatCard label="Max HR" value={fmt(w?.maxHr, " bpm")} color="#aaa" />
        <StatCard label="Steps" value={a?.steps != null ? a.steps.toLocaleString() : "—"} color="#00FF88" />
        <StatCard label="Distance" value={fmt(a?.distance_mi, " mi", 1)} color="#aaa" />

        {/* Body */}
        <SectionHeader label="Body" />
        <StatCard label="Weight" value={fmt(a?.weight_lb, " lb", 1)} color="#FFD700" />
        <StatCard label="Body Fat" value={fmt(a?.body_fat_pct, "%", 1)} color="#aaa" />

        {/* Nutrition */}
        <SectionHeader label="Nutrition (Apple Health)" />
        <StatCard label="Calories" value={a?.calories != null ? Math.round(a.calories).toLocaleString() : "—"} color="#FF6B35" />
        <StatCard label="Protein" value={fmt(a?.protein_g, "g")} color="#00FF88" />
        <StatCard label="Carbs" value={fmt(a?.carbs_g, "g")} color="#FFD700" />
        <StatCard label="Fat" value={fmt(a?.fat_g, "g")} color="#A78BFA" />
        <StatCard label="Sugar" value={fmt(a?.sugar_g, "g")} color="#FF6B35" />

        {/* Mindfulness */}
        <SectionHeader label="Mindfulness" />
        <StatCard label="Mindful Minutes" value={fmt(a?.mindful_minutes, " min")} color="#A78BFA" wide />

      </div>

      {/* Apple Health note */}
      {!a && (
        <div style={{ marginTop: 16, padding: "10px 14px", background: "#181818", border: "1px solid #2a2a2a", borderRadius: 8, fontSize: 10, color: "#444" }}>
          Apple Health data comes from your iOS Shortcut. Run it each morning to populate weight, steps, calories and protein.
        </div>
      )}
    </div>
  );
}
