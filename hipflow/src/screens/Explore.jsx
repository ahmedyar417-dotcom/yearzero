import { useState } from "react";
import Thumb3D from "../coach/Thumb3D.jsx";
import { Icon } from "../ui.jsx";
import { STRETCHES, AREAS } from "../data/stretches.js";
import { QUICK } from "../data/sessions.js";

export default function Explore({ openQuick, openStretch }) {
  const [area, setArea] = useState("all");
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const list = STRETCHES.filter((s) => (area === "all" || s.area === area) && (!needle || `${s.name} ${s.target}`.toLowerCase().includes(needle)));
  return (
    <div className="screen">
      <div className="top"><div><div className="kicker">Classes & stretches</div><h1>Explore</h1></div></div>
      <label className="search">
        <Icon name="search" size={20} />
        <input type="search" placeholder="Search stretches or muscles" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      {!needle && (
        <>
          <div className="section-head"><h3>Quick sessions</h3><span>{QUICK.length} classes</span></div>
          <div className="qs-row">
            {QUICK.map((s) => (
              <button key={s.id} className="qs tap" onClick={() => openQuick(s.id)}>
                <Thumb3D id={s.hero} alt="" />
                <div className="shade" />
                <span className="glass-pill">{s.mins} min</span>
                <div className="qs-body"><b>{s.title}</b><span>{s.blurb}</span></div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-head"><h3>Stretch library</h3><span>{list.length}</span></div>
      <div className="chips">
        <button className={`chip ${area === "all" ? "on" : ""}`} onClick={() => setArea("all")}>All</button>
        {Object.entries(AREAS).map(([k, a]) => (
          <button key={k} className={`chip ${area === k ? "on" : ""}`} onClick={() => setArea(k)}>{a.label}</button>
        ))}
      </div>
      {list.length ? (
        <div className="grid">
          {list.map((s) => (
            <button key={s.id} className="card tile tap" onClick={() => openStretch(s.id)}>
              <Thumb3D id={s.id} alt="" />
              <div className="tile-body"><b>{s.name}</b><span>{AREAS[s.area].label}</span></div>
            </button>
          ))}
        </div>
      ) : (
        <p className="empty">No stretches match “{q}”.</p>
      )}
    </div>
  );
}
