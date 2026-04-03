import { useState } from "react";
import { supabase } from "./supabase";

export default function AuthScreen({ onAuth }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const handleSignIn = async () => {
    if (!email || !password) { setError("Enter email and password."); return; }
    setLoading(true); setError(null); setMessage(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    // onAuthStateChange in App will handle session
  };

  const handleSignUp = async () => {
    if (!email || !password) { setError("Enter email and password."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true); setError(null); setMessage(null);
    const { error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setMessage("Account created — check your email to confirm, then sign in.");
  };

  const onKey = (e) => { if (e.key === "Enter") handleSignIn(); };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'DM Mono', monospace" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@300;400;500&display=swap'); *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } body { background: #0a0a0a; } button { font-family: inherit; transition: opacity 0.15s; } button:hover { opacity: 0.82; } button:active { opacity: 0.65; transform: scale(0.97); }`}</style>

      <div style={{ width: "min(380px, 100%)" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 42, letterSpacing: 6, color: "#fff" }}>YEAR ZERO</div>
          <div style={{ fontSize: 10, color: "#444", letterSpacing: 3, marginTop: 4 }}>INPUT-BASED GOAL SYSTEM</div>
          <div style={{ width: 40, height: 2, background: "#00FF88", margin: "14px auto 0", borderRadius: 1, boxShadow: "0 0 8px #00FF8888" }} />
        </div>

        {/* Card */}
        <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 18, padding: 28 }}>
          <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 20 }}>SIGN IN OR CREATE ACCOUNT</div>

          {/* Email */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.5, marginBottom: 6 }}>EMAIL</div>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              onKeyDown={onKey}
              placeholder="you@example.com"
              autoComplete="email"
              style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, padding: "11px 14px", fontSize: 13, color: "#ddd", fontFamily: "'DM Mono', monospace", outline: "none" }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.5, marginBottom: 6 }}>PASSWORD</div>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null); }}
              onKeyDown={onKey}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{ width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, padding: "11px 14px", fontSize: 13, color: "#ddd", fontFamily: "'DM Mono', monospace", outline: "none" }}
            />
          </div>

          {/* Error / Message */}
          {error && (
            <div style={{ marginBottom: 16, padding: "9px 12px", background: "#FF3B3B14", border: "1px solid #FF3B3B44", borderRadius: 8, fontSize: 11, color: "#FF6B6B", letterSpacing: 0.3 }}>
              {error}
            </div>
          )}
          {message && (
            <div style={{ marginBottom: 16, padding: "9px 12px", background: "#00FF8812", border: "1px solid #00FF8844", borderRadius: 8, fontSize: 11, color: "#00FF88", letterSpacing: 0.3 }}>
              {message}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              onClick={handleSignIn}
              disabled={loading}
              style={{ width: "100%", padding: "13px 0", borderRadius: 10, border: "1px solid #00FF8844", background: "#00FF8818", color: loading ? "#444" : "#00FF88", fontFamily: "'Bebas Neue', cursive", fontSize: 18, letterSpacing: 3, cursor: loading ? "not-allowed" : "pointer" }}
            >
              {loading ? "..." : "SIGN IN"}
            </button>
            <button
              onClick={handleSignUp}
              disabled={loading}
              style={{ width: "100%", padding: "13px 0", borderRadius: 10, border: "1px solid #2a2a2a", background: "#181818", color: loading ? "#333" : "#666", fontFamily: "'Bebas Neue', cursive", fontSize: 18, letterSpacing: 3, cursor: loading ? "not-allowed" : "pointer" }}
            >
              {loading ? "..." : "CREATE ACCOUNT"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 9, color: "#333", letterSpacing: 1 }}>
          DATA SYNCED ACROSS DEVICES · WORKS OFFLINE
        </div>
      </div>
    </div>
  );
}
