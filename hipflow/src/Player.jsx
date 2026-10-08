import { useEffect, useMemo, useRef, useState } from "react";
import Coach3D from "./coach/Coach3D.jsx";
import Thumb3D from "./coach/Thumb3D.jsx";
import { buildTimeline, fmtTime } from "./data/program.js";
import { activeSession } from "./store.js";
import { Icon } from "./ui.jsx";

// ── Sound, voice, haptics ───────────────────────────────────────────────
let audioCtx = null;
export function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch { /* no audio */ }
}
function tone(freq = 880, ms = 120, vol = 0.14) {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = "sine";
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + ms / 1000);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + ms / 1000 + 0.02);
  } catch { /* ignore */ }
}
const chime = () => { tone(784, 180); setTimeout(() => tone(1175, 260), 140); };
function say(text) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}
const hush = () => { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } };
const buzz = (ms = 25) => { try { navigator.vibrate?.(ms); } catch { /* ignore */ } };

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

const LABEL = { prep: "Get into position", switch: "Switch sides", work: "Hold & breathe", move: "Move with your breath" };

// resume: { i, elapsed } picks up where a closed session stopped; resumeKey identifies the session for that.
export default function Player({ session, settings, resume, resumeKey, onExit, onDone }) {
  const segs = useMemo(() => buildTimeline(session), [session]);
  const total = useMemo(() => segs.reduce((t, s) => t + s.secs, 0), [segs]);
  const itemTotals = useMemo(() => session.items.map((_, k) => segs.filter((s) => s.idx === k).reduce((t, s) => t + s.secs, 0)), [segs, session]);
  const startI = Math.min(resume?.i ?? 0, segs.length - 1);
  const [i, setI] = useState(startI);
  const [left, setLeft] = useState(segs[startI].secs * 1000 - (resume?.elapsed ?? 0));
  const [mode, setMode] = useState("countdown"); // countdown | run | paused
  const [count, setCount] = useState(3);
  const [voiceOn, setVoiceOn] = useState(settings.voice);
  const endAt = useRef(0);
  const lastWhole = useRef(null);
  const halfSaid = useRef(false);
  const spentMs = useRef(0);

  const seg = segs[i];
  const s = seg.item.stretch;
  const running = mode === "run";
  useWakeLock(true);

  // 3-2-1 before the first segment
  useEffect(() => {
    if (mode !== "countdown") return;
    if (count === 3 && voiceOn) say(resume ? `Welcome back. ${s.name}.` : `Get ready. First up, ${s.name}.`);
    if (count > 0) {
      if (settings.beeps) tone(660, 110);
      const t = setTimeout(() => setCount((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
    if (settings.beeps) tone(990, 200);
    endAt.current = performance.now() + left;
    setMode("run");
    announce(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, count]);

  function announce(k) {
    const g = segs[k];
    const st = g.item.stretch;
    halfSaid.current = false;
    buzz(g.kind === "work" ? 35 : 20);
    if (g.kind === "prep") {
      if (voiceOn) say(`${k === 0 ? "First" : "Next"}: ${st.name}.${g.side ? " " + g.side + "." : ""} Follow along to get into position.`);
      else if (settings.beeps) tone(740, 120);
    } else if (g.kind === "switch") {
      if (voiceOn) say(`Switch sides. ${g.side}.`);
      else if (settings.beeps) tone(660, 180);
    } else {
      if (settings.beeps) chime();
      if (voiceOn) setTimeout(() => say(st.move ? "Now move slowly with your breath." : `Hold it here. ${st.cues[0] || "Breathe slowly."}`), 380);
    }
  }

  // the clock
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const ms = endAt.current - performance.now();
      const whole = Math.ceil(ms / 1000);
      if (whole !== lastWhole.current) {
        lastWhole.current = whole;
        if (settings.beeps && whole <= 3 && whole >= 1 && seg.secs > 6) tone(seg.kind === "work" ? 880 : 740, 80, 0.1);
        if (seg.kind === "work" && voiceOn && !s.move && !halfSaid.current && seg.secs >= 40 && whole === Math.round(seg.secs / 2)) {
          halfSaid.current = true;
          say(seg.item.note?.startsWith("Contract") ? "Press gently into the floor for five seconds, then relax and sink a little deeper." : "Halfway. Breathe out and let your hips soften.");
        }
      }
      if (ms <= 0) go(i + 1);
      else setLeft(ms);
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, running, voiceOn]);

  // remember progress so a closed app can resume
  const progressRef = useRef(null);
  progressRef.current = { i, elapsed: Math.max(0, seg.secs * 1000 - left) };
  useEffect(() => {
    if (!resumeKey) return;
    const save = () => activeSession.set({ key: resumeKey, ...progressRef.current });
    const id = setInterval(save, 2000);
    window.addEventListener("pagehide", save);
    return () => { clearInterval(id); window.removeEventListener("pagehide", save); };
  }, [resumeKey]);

  // pause when the app is hidden (phone locked, switched apps)
  useEffect(() => {
    const onVis = () => { if (document.hidden && running) pause(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  });

  function go(n) {
    lastWhole.current = null;
    const remaining = running ? Math.max(0, endAt.current - performance.now()) : left;
    spentMs.current += Math.max(0, seg.secs * 1000 - remaining);
    if (n >= segs.length) {
      hush();
      if (settings.beeps) chime();
      if (voiceOn) say("Session complete. Beautiful work.");
      activeSession.clear();
      onDone({ secs: Math.round(spentMs.current / 1000) });
      return;
    }
    const k = Math.max(0, n);
    setI(k);
    setLeft(segs[k].secs * 1000);
    endAt.current = performance.now() + segs[k].secs * 1000;
    if (mode !== "run") setMode("run");
    announce(k);
  }
  function pause() {
    if (!running) return;
    setLeft(Math.max(0, endAt.current - performance.now()));
    setMode("paused");
    hush();
  }
  function resumeRun() {
    endAt.current = performance.now() + left;
    setMode("run");
  }
  const itemStart = (k) => segs.findIndex((g) => g.idx === k);
  const prevStretch = () => go(seg.kind === "prep" && seg.secs * 1000 - left < 2500 ? itemStart(Math.max(0, seg.idx - 1)) : itemStart(seg.idx));
  const nextStretch = () => go(seg.idx + 1 < session.items.length ? itemStart(seg.idx + 1) : segs.length);
  const end = () => { hush(); activeSession.clear(); onExit(); };

  // progress
  const elapsedSeg = seg.secs * 1000 - left;
  const elapsedTotal = segs.slice(0, i).reduce((t, g) => t + g.secs, 0) + elapsedSeg / 1000;
  const itemDone = (k) => {
    if (k < seg.idx) return 1;
    if (k > seg.idx) return 0;
    const before = segs.slice(itemStart(k), i).reduce((t, g) => t + g.secs, 0);
    return Math.min(1, (before + elapsedSeg / 1000) / itemTotals[k]);
  };
  const frac = Math.min(1, elapsedSeg / (seg.secs * 1000));

  // what to read: the steps while getting in, cues while holding
  let cue;
  if (seg.kind === "prep") {
    const entryFrac = Math.min(0.999, elapsedSeg / Math.max(1, (seg.secs - 1.2) * 1000));
    cue = s.how[Math.floor(entryFrac * s.how.length)];
  } else if (seg.kind === "switch") {
    cue = `Come out slowly, then set up on the other side: ${seg.side.toLowerCase()}.`;
  } else {
    const lines = [...s.cues, "Breathe slowly in through your nose, and let each exhale take you a little deeper."];
    cue = lines[Math.floor(elapsedSeg / 9000) % lines.length];
  }
  const label = seg.kind === "work" && s.move ? LABEL.move : LABEL[seg.kind];
  const lastOfItem = i + 1 >= segs.length || segs[i + 1].idx !== seg.idx;
  const nextItem = session.items[seg.idx + 1];
  const showNext = nextItem && seg.kind === "work" && lastOfItem && left < 8000;
  const secsLeft = Math.ceil(left / 1000);

  return (
    <div className="pl" role="dialog" aria-label="Stretch session">
      <div className="pl-stage" onClick={() => (running ? pause() : mode === "paused" && resumeRun())}>
        <Coach3D stretch={s.id} pose2d={s.pose} side={seg.sideIndex ?? (seg.kind === "switch" ? 1 : 0)} kind={seg.kind} segKey={i} secs={seg.secs} paused={!running} theme="dark" lift={0.02} fit={0.86} />
        <div className="pl-top" onClick={(e) => e.stopPropagation()}>
          <div className="segs" aria-hidden="true">
            {session.items.map((_, k) => <i key={k} style={{ "--w": itemTotals[k] }}><b style={{ "--p": itemDone(k) }} /></i>)}
          </div>
          <div className="pl-bar">
            <button className="icon-btn glass" onClick={pause} aria-label="Pause or end"><Icon name="x" /></button>
            <span className="time">{seg.idx + 1} of {session.items.length} · {fmtTime(Math.max(0, total - elapsedTotal))} left</span>
            <button className="icon-btn glass" onClick={() => { setVoiceOn((v) => !v); hush(); }} aria-label={voiceOn ? "Mute coach voice" : "Turn on coach voice"}>
              <Icon name={voiceOn ? "sound" : "mute"} size={20} />
            </button>
          </div>
        </div>
        {showNext && (
          <div className="up-next" key={seg.idx}>
            <Thumb3D id={nextItem.stretch.id} />
            <div><span>Up next</span><b>{nextItem.stretch.name}</b></div>
          </div>
        )}
      </div>

      <div className="pl-panel">
        <div className="pl-head">
          <div className="names">
            <span className={`phase-chip ${seg.kind}`}>{label}</span>
            <h1>{s.name}</h1>
            {seg.side && <div className="side">{seg.side}</div>}
          </div>
          <div className="big-time">{secsLeft >= 60 ? fmtTime(secsLeft) : secsLeft}<small>{seg.kind === "work" ? "seconds" : "to get set"}</small></div>
        </div>
        <div className={`step-bar ${seg.kind}`}><b style={{ width: `${frac * 100}%` }} /></div>
        <div className="cue">
          {seg.kind === "work" && seg.item.note && <span className="note">{seg.item.note}</span>}
          <span className="k" key={cue}>{cue}</span>
          {seg.kind === "work" && settings.easier && !s.move && <span className="easy">Easier option: {s.easier}</span>}
        </div>
        <div className="pl-controls">
          <button className="icon-btn" onClick={prevStretch} aria-label="Previous stretch"><Icon name="prev" /></button>
          <button className="play" onClick={() => (running ? pause() : resumeRun())} aria-label={running ? "Pause" : "Play"} disabled={mode === "countdown"}>
            <Icon name={running ? "pause" : "play"} size={30} />
          </button>
          <button className="icon-btn" onClick={nextStretch} aria-label="Next stretch"><Icon name="next" /></button>
        </div>
      </div>

      {mode === "countdown" && (
        <div className="pl-overlay">
          <p>{resume ? "Picking up where you left off" : "Get ready"}</p>
          <div className="count" key={count}>{count || "Go"}</div>
          <h2>{s.name}</h2>
          <p>{session.items.length} stretches · {fmtTime(total)}</p>
        </div>
      )}
      {mode === "paused" && (
        <div className="pl-overlay" onClick={resumeRun}>
          <h2>Paused</h2>
          <p>{s.name}{seg.side ? ` · ${seg.side}` : ""}</p>
          <div className="pause-actions" onClick={(e) => e.stopPropagation()}>
            <button className="btn light big" onClick={resumeRun}><Icon name="play" size={18} /> Resume</button>
            <button className="btn big" onClick={() => go(itemStart(seg.idx))}>Restart this stretch</button>
            <button className="btn ghost big danger" onClick={end}>End session</button>
          </div>
        </div>
      )}
    </div>
  );
}
