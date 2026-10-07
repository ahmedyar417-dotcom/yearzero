import { useEffect, useState } from "react";
import { DEFAULT_START } from "./data/program.js";

const KEY = "hipflow:v1";
const DEFAULTS = { startDate: DEFAULT_START, voice: true, beeps: true, sessions: [], tests: {} };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
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
