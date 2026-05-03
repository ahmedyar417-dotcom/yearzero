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
  if (score >= 67) return "#00FF88";
  if (score >= 34) return "#FFD700";
  return "#FF6B35";
};

const recoveryLabel = (score) => {
  if (score == null) return "Sync to see recovery";
  if (score >= 67) return "Ready to perform";
  if (score >= 34) return "Keep it moderate";
  return "Keep it light";
};

const strainColor = (strain) => {
  if (strain == null) return "#aaa";
  if (strain >= 18) return "#FF6B35";
  if (strain >= 14) return "#FFD700";
  if (strain >= 10) return "#A78BFA";
  return "#00FF88";
};

const HEALTH_KEY = () => `yz-health-${new Date().toISOString().slice(0, 10)}`;

const ls = {
  get: (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

function HeroCard({ label, value, sub1, sub2, gradient }) {
  return (
    <div style={{
      background: gradient,
      borderRadius: 14,
      padding: "22px 26px",
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 3,
    }}>
      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", letterSpacing: 2, fontWeight: 700 }}>
        {label.toUpperCase()}
      </span>
      <span style={{ fontSize: 52, fontWeight: 800, color: "#fff", lineHeight: 1.05, fontFamily: "system-ui, -apple-system, sans-serif", marginTop: 4 }}>
        {value}
      </span>
      {sub1 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 3 }}>{sub1}</span>}
      {sub2 && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>{sub2}</span>}
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 9, color: "#4a4a4a", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 600, color: color || "#c0c0c0", fontFamily: "system-ui, -apple-system, sans-serif" }}>{value}</span>
    </div>
  );
}

function Panel({ title, main, mainSub, mainColor, metrics }) {
  return (
    <div style={{
      background: "#111",
      border: "1px solid #1c1c1c",
      borderRadius: 14,
      padding: "20px 22px",
      display: "flex",
      flexDirection: "column",
      gap: 14,
    }}>
      <span style={{ fontSize: 9, color: "#3a3a3a", letterSpacing: 2, fontWeight: 700 }}>{title.toUpperCase()}</span>
      <div>
        <div style={{ fontSize: 46, fontWeight: 800, color: mainColor || "#fff", lineHeight: 1, fontFamily: "system-ui, -apple-system, sans-serif" }}>
          {main}
        </div>
        {mainSub && <div style={{ fontSize: 11, color: "#4a4a4a", marginTop: 6 }}>{mainSub}</div>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", paddingTop: 4, borderTop: "1px solid #1c1c1c" }}>
        {metrics.map(({ label, value, color }) => (
          <Metric key={label} label={label} value={value} color={color} />
        ))}
      </div>
    </div>
  );
}

export default function HealthPanel() {
  const [data, setData] = useState(() => ls.get(HEALTH_KEY()) || {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const saved = ls.get(HEALTH_KEY());
    if (saved) setData(saved);
  }, []);

  const fetchWhoop = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  const w = data?.whoop;
  const a = data?.apple;

  const recScore = w?.recovery?.score;
  const recColor = recoveryColor(recScore);
  const strainVal = w?.strain;
  const sColor = strainColor(strainVal);

  const whoopTime = w?.fetchedAt
    ? new Date(w.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;
  const appleTime = a?.fetchedAt
    ? new Date(a.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1300, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: 2, fontWeight: 700 }}>HEALTH</div>
          <div style={{ fontSize: 9, color: "#333", letterSpacing: 1, marginTop: 3 }}>
            {whoopTime ? `WHOOP ${whoopTime}` : "WHOOP NOT SYNCED"}
            {appleTime ? ` · APPLE ${appleTime}` : " · APPLE NOT SYNCED"}
          </div>
        </div>
        <button
          onClick={fetchWhoop}
          disabled={loading}
          style={{
            background: loading ? "#181818" : "#00FF8814",
            border: "1px solid #00FF8833",
            borderRadius: 8,
            padding: "8px 18px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 10,
            color: loading ? "#444" : "#00FF88",
            letterSpacing: 1,
            fontWeight: 700,
          }}
        >
          {loading ? "SYNCING..." : "SYNC WHOOP"}
        </button>
      </div>

      {error && (
        <div style={{ background: "#FF6B3510", border: "1px solid #FF6B3540", borderRadius: 10, padding: "10px 16px", fontSize: 11, color: "#FF6B35", marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Hero row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <HeroCard
          label="Recovery Score"
          value={fmt(recScore)}
          sub1={recoveryLabel(recScore)}
          gradient="linear-gradient(135deg, #5B3FAF 0%, #3D70C7 100%)"
        />
        <HeroCard
          label="Resting Heart Rate"
          value={w?.recovery?.rhr != null ? `${w.recovery.rhr} bpm` : "—"}
          sub1={w?.recovery?.hrv != null ? `${w.recovery.hrv} ms HRV · WHOOP resting heart rate` : "WHOOP resting heart rate"}
          gradient="linear-gradient(135deg, #0C8B78 0%, #1AB898 100%)"
        />
        <HeroCard
          label="Total Sleep"
          value={msToHm(w?.sleep?.totalMs)}
          sub1={w?.sleep?.efficiency != null ? `${w.sleep.efficiency}% efficiency` : undefined}
          sub2={w?.sleep?.debtMs != null ? `${msToHm(w.sleep.debtMs)} sleep debt` : undefined}
          gradient="linear-gradient(135deg, #1A7A50 0%, #22A86C 100%)"
        />
        <HeroCard
          label="Current Weight"
          value={a?.weight_lb != null ? `${a.weight_lb.toFixed(1)} lb` : "—"}
          sub1={a?.body_fat_pct != null ? `${a.body_fat_pct.toFixed(1)}% est. body fat` : "Run shortcut to sync"}
          gradient="linear-gradient(135deg, #1A5AA0 0%, #2D80D8 100%)"
        />
      </div>

      {/* Panel grid — Recovery | Pulse | Sleep / Body | Activity | Nutrition */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>

        <Panel
          title="Recovery"
          main={fmt(recScore)}
          mainSub={recoveryLabel(recScore)}
          mainColor={recColor}
          metrics={[
            { label: "RHR", value: fmt(w?.recovery?.rhr, " bpm") },
            { label: "HRV", value: fmt(w?.recovery?.hrv, " ms"), color: "#A78BFA" },
            { label: "SpO2", value: fmt(w?.recovery?.spo2, "%", 1) },
            { label: "Sleep Debt", value: msToHm(w?.sleep?.debtMs), color: w?.sleep?.debtMs > 0 ? "#FF6B35" : "#00FF88" },
          ]}
        />

        <Panel
          title="Pulse"
          main={w?.recovery?.rhr != null ? `${w.recovery.rhr} bpm` : "—"}
          mainSub="WHOOP resting heart rate"
          mainColor="#fff"
          metrics={[
            { label: "Cycle Avg", value: fmt(w?.avgHr, " bpm") },
            { label: "Max HR", value: fmt(w?.maxHr, " bpm"), color: "#FF6B35" },
            { label: "SpO2", value: fmt(w?.recovery?.spo2, "%", 1) },
            { label: "HRV", value: fmt(w?.recovery?.hrv, " ms"), color: "#A78BFA" },
          ]}
        />

        <Panel
          title="Sleep"
          main={msToHm(w?.sleep?.totalMs)}
          mainSub={w?.sleep?.efficiency != null ? `${w.sleep.efficiency}% efficiency` : undefined}
          mainColor="#A78BFA"
          metrics={[
            { label: "Deep", value: msToHm(w?.sleep?.deepMs), color: "#6366f1" },
            { label: "REM", value: msToHm(w?.sleep?.remMs), color: "#A78BFA" },
            { label: "Light", value: msToHm(w?.sleep?.lightMs) },
            { label: "Efficiency", value: fmt(w?.sleep?.efficiency, "%"), color: w?.sleep?.efficiency >= 85 ? "#00FF88" : "#FFD700" },
          ]}
        />

        <Panel
          title="Body"
          main={a?.weight_lb != null ? `${a.weight_lb.toFixed(1)} lb` : "—"}
          mainSub={a?.body_fat_pct != null ? `${a.body_fat_pct.toFixed(1)}% body fat` : "Run shortcut to sync"}
          mainColor="#FFD700"
          metrics={[
            { label: "BF Est", value: fmt(a?.body_fat_pct, "%", 1) },
            { label: "Steps", value: a?.steps != null ? Math.round(a.steps).toLocaleString() : "—", color: "#00FF88" },
            { label: "Calories In", value: a?.calories != null ? Math.round(a.calories).toLocaleString() : "—", color: "#FF6B35" },
            { label: "Distance", value: fmt(a?.distance_mi, " mi", 1) },
          ]}
        />

        <Panel
          title="Activity"
          main={strainVal != null ? strainVal.toFixed(1) : "—"}
          mainSub="Strain score"
          mainColor={sColor}
          metrics={[
            { label: "Steps", value: a?.steps != null ? Math.round(a.steps).toLocaleString() : "—", color: "#00FF88" },
            { label: "Walk", value: fmt(a?.distance_mi, " mi", 1) },
            { label: "Avg HR", value: fmt(w?.avgHr, " bpm") },
            { label: "Max HR", value: fmt(w?.maxHr, " bpm"), color: "#FF6B35" },
          ]}
        />

        <Panel
          title="Nutrition"
          main={a?.calories != null ? Math.round(a.calories).toLocaleString() : "0"}
          mainSub={a?.protein_g != null ? `${Math.round(a.protein_g)}g / 180g protein` : "/ 1,900 kcal target"}
          mainColor="#FF6B35"
          metrics={[
            { label: "Protein", value: fmt(a?.protein_g, "g"), color: "#00FF88" },
            { label: "Carbs", value: fmt(a?.carbs_g, "g"), color: "#FFD700" },
            { label: "Fat", value: fmt(a?.fat_g, "g"), color: "#A78BFA" },
            { label: "Sugar", value: fmt(a?.sugar_g, "g"), color: "#FF6B35" },
          ]}
        />

      </div>

      {!a && (
        <div style={{ marginTop: 10, padding: "10px 16px", background: "#111", border: "1px solid #1c1c1c", borderRadius: 10, fontSize: 10, color: "#333" }}>
          Apple Health data (weight, steps, nutrition) comes from your iOS Shortcut. Run it each morning to populate.
        </div>
      )}
    </div>
  );
}
