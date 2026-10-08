import { useEffect, useState } from "react";
import { addDays, daysBetween, ymd, sessionFor, programDay, PROGRAM_DAYS } from "./data/program.js";
import { quickSession } from "./data/sessions.js";

export function useToday() {
  const [today, setToday] = useState(() => ymd(new Date()));
  useEffect(() => {
    const check = () => setToday(ymd(new Date()));
    const id = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", check); };
  }, []);
  return today;
}

export function streaks(sessions, today) {
  const dates = new Set(sessions.map((s) => s.date));
  let d = dates.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (dates.has(d)) { current++; d = addDays(d, -1); }
  const sorted = [...dates].sort();
  let best = 0, run = 0, prev = null;
  for (const x of sorted) { run = prev && daysBetween(prev, x) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = x; }
  return { current, best };
}

export const doneDaySet = (sessions) => new Set(sessions.map((s) => s.day).filter(Boolean));

// The stretch that best represents a session (its longest real hold).
export function signature(session) {
  const pick = [...session.items].filter((it) => !["warm", "cool"].includes(it.stretch.area)).sort((a, b) => b.secs * b.sides - a.secs * a.sides)[0];
  return (pick || session.items[0]).stretch.id;
}

// A session reference that survives reloads: "day:12", "extra:bed", "practice:1".
export function sessionFromKey(key) {
  const [kind, v] = key.split(":");
  if (kind === "extra") return { session: quickSession(v), day: null, extra: v };
  const n = Number(v);
  return { session: sessionFor(n), day: kind === "day" ? n : null };
}

export function todayInfo(store, today) {
  const day = programDay(store.startDate, today);
  return { day, notStarted: day < 1, finished: day > PROGRAM_DAYS, session: sessionFor(day < 1 ? 1 : day) };
}

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};
