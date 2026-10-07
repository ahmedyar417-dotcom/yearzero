import { useEffect, useMemo, useRef, useState } from "react";
import Figure from "./Figure.jsx";
import { POSES } from "./poses.js";
import { buildTimeline, fmtTime } from "./data/program.js";
import { Icon } from "./ui.jsx";

// ── Sound + voice ───────────────────────────────────────────────────────
let audioCtx = null;
export function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch { /* no audio */ }
}
function beep(freq = 880, ms = 120, vol = 0.15) {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = "sine";
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + ms / 1000);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + ms / 1000);
  } catch { /* ignore */ }
}
function say(text) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

function useWakeLock(active) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock = null;
    let cancelled = false;
    const get = () => navigator.wakeLock.request("screen").then((l) => { if (cancelled) l.release(); else lock = l; }).catch(() => {});
    get();
    const onVis = () => document.visibilityState === "visible" && get();
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; lock?.release?.(); document.removeEventListener("visibilitychange", onVis); };
  }, [active]);
}

const sideName = (seg) => (seg.side ? seg.side : "");

export default function Player({ session, settings, onClose, onComplete }) {
  const segs = useMemo(() => buildTimeline(session), [session]);
  const total = useMemo(() => segs.reduce((t, s) => t + s.secs, 0), [segs]);
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(segs[0].secs * 1000);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const [feel, setFeel] = useState(null);
  const endAt = useRef(performance.now() + segs[0].secs * 1000);
  const lastWhole = useRef(null);
  const halfSaid = useRef(false);
  const spentMs = useRef(0);

  useWakeLock(!done);

  const seg = segs[i];
  const voice = settings.voice;
  const sound = settings.beeps;

  // Announce each segment.
  useEffect(() => {
    if (done) return;
    halfSaid.current = false;
    const s = seg.item.stretch;
    if (seg.kind === "prep") {
      if (voice) say(`${i === 0 ? "First" : "Next"}: ${s.name}.${seg.side ? " " + seg.side + "." : ""} Get into position.`);
    } else if (seg.kind === "switch") {
      if (voice) say(`Switch sides. ${seg.side}.`);
      else if (sound) beep(660, 200);
    } else if (seg.kind === "work") {
      if (sound) beep(1046, 220);
      if (voice) setTimeout(() => say(s.cues[0] || (s.move ? "Move slowly with your breath." : "Hold and breathe.")), 350);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, done]);

  useEffect(() => {
    if (paused || done) return;
    const id = setInterval(() => {
      const ms = endAt.current - performance.now();
      const whole = Math.ceil(ms / 1000);
      if (whole !== lastWhole.current) {
        lastWhole.current = whole;
        if (sound && whole <= 3 && whole >= 1) beep(seg.kind === "work" ? 880 : 740, 90, 0.12);
        if (seg.kind === "work" && voice && !halfSaid.current && seg.secs >= 40 && whole === Math.round(seg.secs / 2)) {
          halfSaid.current = true;
          if (!s.move) say(seg.item.note?.startsWith("Contract") ? "Press gently into the floor for five seconds… then relax and sink deeper." : "Halfway. Breathe out and relax a little deeper.");
        }
      }
      if (ms <= 0) advance(1);
      else setLeft(ms);
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, paused, done]);

  function go(n) {
    lastWhole.current = null;
    const remaining = paused ? left : Math.max(0, endAt.current - performance.now());
    spentMs.current += Math.max(0, seg.secs * 1000 - remaining);
    if (n >= segs.length) {
      setDone(true);
      if (voice) say("Session complete. Great work.");
      else if (sound) { beep(880, 150); setTimeout(() => beep(1175, 250), 180); }
      return;
    }
    const k = Math.max(0, n);
    setPaused(false);
    setI(k);
    setLeft(segs[k].secs * 1000);
    endAt.current = performance.now() + segs[k].secs * 1000;
  }
  function advance(dir) {
    if (dir > 0) go(i + 1);
    else {
      // back: restart current segment if >2s in, else previous stretch
      const elapsed = seg.secs * 1000 - left;
      if (elapsed > 2000) go(i);
      else {
        let k = i - 1;
        while (k > 0 && segs[k].kind !== "prep") k--;
        go(Math.max(0, k));
      }
    }
  }
  function togglePause() {
    if (paused) {
      endAt.current = performance.now() + left;
      setPaused(false);
    } else {
      setPaused(true);
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    }
  }
  function skipStretch() {
    let k = i + 1;
    while (k < segs.length && segs[k].kind !== "prep") k++;
    go(k);
  }

  const elapsedTotal = segs.slice(0, i).reduce((t, s) => t + s.secs, 0) + (seg.secs - left / 1000);
  const remainingTotal = Math.max(0, total - elapsedTotal);

  if (done) {
    return (
      <div className="player">
        <div className="player-done">
          <div className="done-badge"><Icon name="check" size={40} /></div>
          <h1>Session complete</h1>
          <p className="muted">Day {session.day} · {session.dayType.name} · {fmtTime(total)}</p>
          <div className="feel">
            <p>How did your hips feel today?</p>
            <div className="feel-row">
              {["Very tight", "Tight", "OK", "Loose", "Great"].map((label, n) => (
                <button key={label} className={`chip ${feel === n + 1 ? "on" : ""}`} onClick={() => setFeel(n + 1)}>{label}</button>
              ))}
            </div>
          </div>
          <button className="btn primary big" onClick={() => onComplete({ secs: Math.round(spentMs.current / 1000), feel })}>Save &amp; finish</button>
        </div>
      </div>
    );
  }

  const s = seg.item.stretch;
  const pose = POSES[s.pose];
  const mirror = seg.sideIndex === 1 || (seg.kind === "switch");
  const frac = 1 - left / (seg.secs * 1000);
  const R = 46;
  const C = 2 * Math.PI * R;
  const nextItem = session.items[seg.idx + 1];
  const label = seg.kind === "prep" ? "Get into position" : seg.kind === "switch" ? "Switch sides" : s.move ? "Move with your breath" : "Hold & breathe";

  return (
    <div className="player">
      <div className="player-top">
        <button className="icon-btn" onClick={onClose} aria-label="Exit session"><Icon name="x" /></button>
        <div className="player-progress">
          <div className="bar"><div style={{ width: `${(elapsedTotal / total) * 100}%` }} /></div>
          <div className="player-meta"><span>{seg.idx + 1} / {session.items.length}</span><span>{fmtTime(remainingTotal)} left</span></div>
        </div>
      </div>

      <div className={`player-stage ${seg.kind}`}>
        <Figure pose={s.pose} mirror={mirror && pose?.view === "side"} playing={!paused} />
        {pose?.view === "top" && <span className="view-tag">View from above</span>}
        {pose?.view === "front" && <span className="view-tag">Front view</span>}
        <span className="feel-tag"><i /> Feel it here</span>
      </div>

      <div className="player-info">
        <div className={`mode ${seg.kind}`}>{label}</div>
        <h1>{s.name}</h1>
        {sideName(seg) && <div className="side">{sideName(seg)}</div>}
      </div>

      <div className="player-timer">
        <svg viewBox="0 0 100 100" className="ring">
          <circle cx="50" cy="50" r={R} className="ring-bg" />
          <circle cx="50" cy="50" r={R} className={`ring-fg ${seg.kind}`} strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 50 50)" />
        </svg>
        <div className="timer-num">{Math.ceil(left / 1000)}</div>
      </div>

      <div className="player-cue">
        {seg.item.note && seg.kind === "work" ? <p className="note">{seg.item.note}</p> : null}
        <p>{seg.kind === "prep" ? s.how[0] : s.cues[Math.floor(frac * s.cues.length) % s.cues.length]}</p>
      </div>

      <div className="player-controls">
        <button className="icon-btn lg" onClick={() => advance(-1)} aria-label="Back"><Icon name="prev" /></button>
        <button className="play-btn" onClick={togglePause} aria-label={paused ? "Resume" : "Pause"}><Icon name={paused ? "play" : "pause"} size={30} /></button>
        <button className="icon-btn lg" onClick={skipStretch} aria-label="Skip stretch"><Icon name="next" /></button>
      </div>
      <div className="player-next">{nextItem ? <>Up next: <b>{nextItem.stretch.name}</b></> : "Last one: finish strong"}</div>
    </div>
  );
}
