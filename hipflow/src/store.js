import { useEffect, useState } from "react";
import { DEFAULT_START } from "./data/program.js";

const KEY = "hipflow:v1";
const DEFAULTS = {
  startDate: DEFAULT_START, voice: true, beeps: true, sessions: [], tests: {},
  profile: null, // { goals: [], level, time } once onboarding is done
  easier: false, // show the easier option during holds
  coach: "female", // female | male
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const s = { ...DEFAULTS, ...JSON.parse(raw) };
    // people who used the app before onboarding existed skip it
    if (!s.profile && s.sessions.length) s.profile = { goals: [], level: "tight", time: "18:00", legacy: true };
    return s;
  } catch {
    return DEFAULTS;
  }
}

export function useStore() {
  const [state, setState] = useState(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  }, [state]);
  const update = (patch) => setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));
  return [state, update];
}

// An in-progress session, so closing the app mid-session can be resumed.
const ACTIVE = "hipflow:active";
export const activeSession = {
  get() {
    try {
      const a = JSON.parse(localStorage.getItem(ACTIVE) || "null");
      return a && Date.now() - a.savedAt < 3 * 3600 * 1000 ? a : null;
    } catch {
      return null;
    }
  },
  set(a) { try { localStorage.setItem(ACTIVE, JSON.stringify({ ...a, savedAt: Date.now() })); } catch { /* ignore */ } },
  clear() { try { localStorage.removeItem(ACTIVE); } catch { /* ignore */ } },
};
