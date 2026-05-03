import { useState, useEffect } from "react";

const fmt = (v, decimals = 0, suffix = "") =>
  v == null ? "—" : `${typeof v === "number" ? v.toFixed(decimals) : v}${suffix}`;

const pctColor = (pct, low = 0.2, high = 0.5) => {
  if (pct == null) return "#555";
  if (pct >= high) return "#00FF88";
  if (pct >= low) return "#FFD700";
  return "#FF6B35";
};

function MetricRow({ label, value, sub, color = "#aaa", highlight = false }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      padding: "8px 0",
      borderBottom: "1px solid #181818",
    }}>
      <span style={{ fontSize: 10, color: "#555", letterSpacing: 1 }}>{label.toUpperCase()}</span>
      <div style={{ textAlign: "right" }}>
        <span style={{
          fontFamily: "'Bebas Neue', cursive",
          fontSize: highlight ? 22 : 16,
          color,
          letterSpacing: 1,
        }}>
          {value}
        </span>
        {sub && <span style={{ fontSize: 9, color: "#444", marginLeft: 4 }}>{sub}</span>}
      </div>
    </div>
  );
}

function Panel({ title, color, children, lastSynced, onRefresh, loading }) {
  return (
    <div style={{
      background: "#111",
      border: `1px solid ${color}22`,
      borderRadius: 14,
      padding: 18,
      flex: 1,
      minWidth: 260,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 16, color, letterSpacing: 2 }}>{title}</div>
          {lastSynced && (
            <div style={{ fontSize: 9, color: "#333", letterSpacing: 1, marginTop: 1 }}>
              SYNCED {lastSynced}
            </div>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            background: loading ? "#181818" : `${color}14`,
            border: `1px solid ${color}44`,
            borderRadius: 7,
            padding: "5px 12px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 9,
            color: loading ? "#333" : color,
            letterSpacing: 1,
          }}
        >
          {loading ? "SYNCING..." : "SYNC"}
        </button>
      </div>
      {children}
    </div>
  );
}

const OUTREACH_KEY = () => `yz-outreach-${new Date().toISOString().slice(0, 10)}`;

const ls = {
  get: (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

export default function OutreachPanel() {
  const [data, setData] = useState(() => ls.get(OUTREACH_KEY()) || {});
  const [loading, setLoading] = useState({ instantly: false, vollna: false });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const saved = ls.get(OUTREACH_KEY());
    if (saved) setData(saved);
  }, []);

  const fetchInstantly = async () => {
    setLoading(l => ({ ...l, instantly: true }));
    setErrors(e => ({ ...e, instantly: null }));
    try {
      const res = await fetch("/api/instantly");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Instantly fetch failed");
      const merged = { ...ls.get(OUTREACH_KEY()), instantly: json };
      ls.set(OUTREACH_KEY(), merged);
      setData(merged);
    } catch (e) {
      setErrors(err => ({ ...err, instantly: e.message }));
    } finally {
      setLoading(l => ({ ...l, instantly: false }));
    }
  };

  const fetchVollna = async () => {
    setLoading(l => ({ ...l, vollna: true }));
    setErrors(e => ({ ...e, vollna: null }));
    try {
      const res = await fetch("/api/vollna");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Vollna fetch failed");
      const merged = { ...ls.get(OUTREACH_KEY()), vollna: json };
      ls.set(OUTREACH_KEY(), merged);
      setData(merged);
    } catch (e) {
      setErrors(err => ({ ...err, vollna: e.message }));
    } finally {
      setLoading(l => ({ ...l, vollna: false }));
    }
  };

  const i = data?.instantly;
  const v = data?.vollna;

  const iSynced = i?.fetchedAt ? new Date(i.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;
  const vSynced = v?.fetchedAt ? new Date(v.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : null;

  const replyRatePct = parseFloat(i?.replyRate7d ?? 0);
  const posRatePct = parseFloat(i?.positiveReplyRate7d ?? 0);

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 22, letterSpacing: 3, color: "#fff", marginBottom: 20 }}>
        OUTREACH
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {/* Cold Email */}
        <Panel
          title="Cold Email"
          color="#00FF88"
          lastSynced={iSynced}
          onRefresh={fetchInstantly}
          loading={loading.instantly}
        >
          {errors.instantly && (
            <div style={{ fontSize: 10, color: "#FF6B35", marginBottom: 10 }}>{errors.instantly}</div>
          )}
          <MetricRow label="Sends Today" value={i?.today?.sent?.toLocaleString() ?? "—"} color="#fff" highlight />
          <MetricRow label="Sends 7D" value={i?.sevenDay?.sent?.toLocaleString() ?? "—"} color="#aaa" />
          <MetricRow label="Reply Rate 7D" value={fmt(replyRatePct, 2, "%")} color={pctColor(replyRatePct, 0.2, 0.5)} highlight />
          <MetricRow label="Positive Reply 7D" value={fmt(posRatePct, 2, "%")} color={pctColor(posRatePct, 5, 20)} highlight />
          <MetricRow label="Replies Today" value={i?.today?.uniqueReplies ?? "—"} color="#aaa" />
          <MetricRow label="Meetings Booked 7D" value={i?.sevenDay?.meetingsBooked ?? "—"} color="#FFD700" highlight />
          <MetricRow label="Meetings Completed 7D" value={i?.sevenDay?.meetingsCompleted ?? "—"} color="#aaa" />
          <MetricRow label="Opportunities 7D" value={i?.sevenDay?.opportunities ?? "—"} color="#A78BFA" />
        </Panel>

        {/* Upwork / Vollna */}
        <Panel
          title="Upwork"
          color="#FFD700"
          lastSynced={vSynced}
          onRefresh={fetchVollna}
          loading={loading.vollna}
        >
          {errors.vollna && (
            <div style={{ fontSize: 10, color: "#FF6B35", marginBottom: 10 }}>{errors.vollna}</div>
          )}
          <MetricRow label="Apps Today" value={v?.today?.count ?? "—"} color="#fff" highlight />
          <MetricRow label="Apps 7D" value={v?.sevenDay?.count ?? "—"} color="#aaa" />
          <MetricRow label="Viewed 7D" value={v?.sevenDay?.viewed ?? "—"} color="#FFD700" highlight />
          <MetricRow label="Interviewed 7D" value={v?.sevenDay?.interviewed ?? "—"} color="#A78BFA" highlight />
          <MetricRow label="Hired 7D" value={v?.sevenDay?.hired ?? "—"} color="#00FF88" highlight />
          <MetricRow label="Connects Used 7D" value={v?.sevenDay?.connects ?? "—"} color="#aaa" />
        </Panel>
      </div>
    </div>
  );
}
