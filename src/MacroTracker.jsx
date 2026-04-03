import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const TARGETS = {
  cal:     { label: "CALORIES", unit: "kcal", target: 2000, color: "#FF6B35" },
  protein: { label: "PROTEIN",  unit: "g",    target: 160,  color: "#00FF88" },
  carbs:   { label: "CARBS",    unit: "g",    target: 200,  color: "#FFD700" },
  fat:     { label: "FAT",      unit: "g",    target: 65,   color: "#A78BFA" },
};

const EXTENDED = {
  fibre:   { label: "FIBRE",   unit: "g",  target: 30 },
  sugar:   { label: "SUGAR",   unit: "g",  target: 50 },
  sodium:  { label: "SODIUM",  unit: "mg", target: 2300 },
  satFat:  { label: "SAT FAT", unit: "g",  target: 20 },
};

const SYSTEM_PROMPT = `You are a nutrition assistant integrated into a fat loss dashboard. Your job is to help the user track their daily macros accurately.

When the user describes a meal:
1. If you need more info (portion sizes, cooking method, specific ingredients), ask ONE clarifying question at a time — keep it short and conversational
2. Once you have enough information, give a brief friendly confirmation and append the macro data

When you have enough info to log, always end your message with EXACTLY this format on its own line (never show this to the user in your conversational reply):
MACRO_LOG:{"name":"meal name","cal":0,"protein":0,"carbs":0,"fat":0,"fibre":0,"sugar":0,"sodium":0,"satFat":0}

For photo inputs: analyse what you can see, estimate portions visually, but ask about anything unclear before logging.

Keep responses short — 1-3 sentences max before asking a question or logging. Be encouraging about fat loss progress when relevant. Use UK English.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const todayKey = () => new Date().toISOString().slice(0, 10);

const ls = {
  get(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch { /* quota exceeded — silent */ }
  },
};

function parseMacroLog(text) {
  const match = text.match(/MACRO_LOG:(\{[^\n]+\})/);
  if (!match) return null;
  try { return JSON.parse(match[1]); }
  catch { return null; }
}

function stripMacroLog(text) {
  return text.replace(/\nMACRO_LOG:\{[^\n]+\}/, "").replace(/MACRO_LOG:\{[^\n]+\}/, "").trim();
}

function sumMeals(meals) {
  return meals.reduce(
    (acc, m) => ({
      cal:    acc.cal    + (m.cal    || 0),
      protein:acc.protein+ (m.protein|| 0),
      carbs:  acc.carbs  + (m.carbs  || 0),
      fat:    acc.fat    + (m.fat    || 0),
      fibre:  acc.fibre  + (m.fibre  || 0),
      sugar:  acc.sugar  + (m.sugar  || 0),
      sodium: acc.sodium + (m.sodium || 0),
      satFat: acc.satFat + (m.satFat || 0),
    }),
    { cal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sugar: 0, sodium: 0, satFat: 0 }
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function MacroBar({ label, unit, value, target, color, small }) {
  const pct   = Math.min((value / target) * 100, 100);
  const over  = value > target;
  const barColor = over ? "#FF3B3B" : color;
  const numSize  = small ? 13 : 16;
  const labelSize = small ? 9 : 9;

  return (
    <div style={{ flex: 1, minWidth: small ? 60 : 70 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
        <span style={{ fontSize: labelSize, color: "#555", letterSpacing: 1 }}>{label}</span>
        <span style={{ fontSize: labelSize, color: "#333" }}>/{target}{unit}</span>
      </div>
      <div style={{
        fontFamily: "'Bebas Neue', cursive",
        fontSize: numSize,
        color: barColor,
        letterSpacing: 1,
        lineHeight: 1,
        marginBottom: 4,
        filter: over ? "none" : `drop-shadow(0 0 4px ${color}55)`,
      }}>
        {Math.round(value)}<span style={{ fontSize: 9, color: "#555", marginLeft: 2 }}>{unit}</span>
      </div>
      <div style={{ height: small ? 2 : 3, background: "#1e1e1e", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: barColor,
          borderRadius: 2,
          transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );
}

function ChatBubble({ msg }) {
  const isUser = msg.role === "user";
  const displayText = typeof msg.content === "string"
    ? msg.content
    : msg.content?.find?.(c => c.type === "text")?.text || "[image]";

  return (
    <div style={{
      display: "flex",
      justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: 8,
    }}>
      <div style={{
        maxWidth: "82%",
        padding: "8px 11px",
        borderRadius: isUser ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
        background: isUser ? "#FF6B3520" : "#181818",
        border: `1px solid ${isUser ? "#FF6B3533" : "#222"}`,
        fontSize: 12,
        color: isUser ? "#FF6B35" : "#888",
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {displayText}
      </div>
    </div>
  );
}

function LoadingBubble() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
      <div style={{
        padding: "8px 14px",
        borderRadius: "12px 12px 12px 3px",
        background: "#181818",
        border: "1px solid #222",
        fontSize: 13,
        color: "#444",
      }}>
        <style>{`
          @keyframes yz-pulse { 0%,80%,100%{opacity:.2} 40%{opacity:1} }
          .yz-dot { display:inline-block; width:5px; height:5px; border-radius:50%; background:#555; margin:0 2px; animation: yz-pulse 1.2s infinite; }
          .yz-dot:nth-child(2){animation-delay:0.2s}
          .yz-dot:nth-child(3){animation-delay:0.4s}
        `}</style>
        <span className="yz-dot" /><span className="yz-dot" /><span className="yz-dot" />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MacroTracker({ color = "#FF6B35" }) {
  const today = todayKey();
  const chatKey  = `yz-nutrition-chat-${today}`;
  const mealKey  = `yz-macros-${today}`;

  const [messages,  setMessages]  = useState([]);
  const [meals,     setMeals]     = useState([]);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [extOpen,   setExtOpen]   = useState(false);
  const [error,     setError]     = useState(null);

  const chatEndRef  = useRef(null);
  const fileRef     = useRef(null);
  const inputRef    = useRef(null);

  // ── Load / day-reset on mount ──────────────────────────────────────────────
  useEffect(() => {
    const savedChat  = ls.get(chatKey);
    const savedMeals = ls.get(mealKey);
    setMessages(savedChat  || []);
    setMeals   (savedMeals || []);
  }, [chatKey, mealKey]);

  // ── Scroll chat to bottom on new messages ─────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Persist helpers ────────────────────────────────────────────────────────
  const persistMessages = useCallback((msgs) => {
    ls.set(chatKey, msgs);
  }, [chatKey]);

  const persistMeals = useCallback((ms) => {
    ls.set(mealKey, ms);
  }, [mealKey]);

  // ── Call Claude ────────────────────────────────────────────────────────────
  const callClaude = useCallback(async (history) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: history,
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const raw  = data?.content?.[0]?.text || "";

      // Parse and strip MACRO_LOG before storing
      const entry = parseMacroLog(raw);
      const clean = stripMacroLog(raw);

      const assistantMsg = { role: "assistant", content: clean };
      const newHistory   = [...history, assistantMsg];
      setMessages(newHistory);
      persistMessages(newHistory);

      if (entry) {
        setMeals(prev => {
          const next = [...prev, { ...entry, id: Date.now() }];
          persistMeals(next);
          return next;
        });
      }
    } catch (e) {
      const errMsg = { role: "assistant", content: `⚠ ${e.message || "Something went wrong. Try again."}` };
      setMessages(prev => {
        const next = [...prev, errMsg];
        persistMessages(next);
        return next;
      });
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [persistMessages, persistMeals]);

  // ── Send text message ──────────────────────────────────────────────────────
  const sendText = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg  = { role: "user", content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    persistMessages(newHistory);
    setInput("");
    callClaude(newHistory);
  }, [input, loading, messages, persistMessages, callClaude]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
  };

  // ── Send photo ─────────────────────────────────────────────────────────────
  const handlePhoto = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = () => {
      const b64  = reader.result.split(",")[1];
      const mime = file.type || "image/jpeg";
      const userMsg = {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
          { type: "text",  text: "What are the macros in this meal? Ask me any questions you need, then log it." },
        ],
      };
      const newHistory = [...messages, userMsg];
      setMessages(newHistory);
      persistMessages(newHistory);
      callClaude(newHistory);
    };
    reader.readAsDataURL(file);
  }, [messages, persistMessages, callClaude]);

  // ── Delete meal ────────────────────────────────────────────────────────────
  const deleteMeal = useCallback((id) => {
    setMeals(prev => {
      const next = prev.filter(m => m.id !== id);
      persistMeals(next);
      return next;
    });
  }, [persistMeals]);

  // ── Derived totals ─────────────────────────────────────────────────────────
  const totals = sumMeals(meals);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      borderTop: "1px solid #1e1e1e",
      paddingTop: 14,
      display: "flex",
      flexDirection: "column",
      gap: 14,
      fontFamily: "'DM Mono', monospace",
    }}>
      {/* Section label */}
      <div style={{ fontSize: 9, color: "#444", letterSpacing: 2 }}>MACRO TRACKER</div>

      {/* ── Macro bars ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {Object.entries(TARGETS).map(([key, cfg]) => (
          <MacroBar
            key={key}
            label={cfg.label}
            unit={cfg.unit}
            value={totals[key]}
            target={cfg.target}
            color={cfg.color}
          />
        ))}
      </div>

      {/* ── Extended nutrients toggle ──────────────────────────────────────── */}
      <div>
        <button
          onClick={() => setExtOpen(o => !o)}
          style={{
            background: "none",
            border: "1px solid #1e1e1e",
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 9,
            color: "#444",
            letterSpacing: 1.5,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {extOpen ? "▾" : "▸"} EXTENDED NUTRIENTS
        </button>
        {extOpen && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            {Object.entries(EXTENDED).map(([key, cfg]) => (
              <MacroBar
                key={key}
                label={cfg.label}
                unit={cfg.unit}
                value={totals[key]}
                target={cfg.target}
                color="#666"
                small
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Meal log ──────────────────────────────────────────────────────── */}
      {meals.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: "#333", letterSpacing: 2, marginBottom: 7 }}>LOGGED MEALS</div>
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {meals.map(meal => (
              <div
                key={meal.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  marginBottom: 4,
                  background: "#181818",
                  borderRadius: 8,
                  border: "1px solid #1e1e1e",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {meal.name}
                  </div>
                  <div style={{ fontSize: 10, color: "#444", marginTop: 1 }}>
                    <span style={{ color: "#FF6B35" }}>{meal.cal} kcal</span>
                    <span style={{ margin: "0 6px", color: "#2a2a2a" }}>·</span>
                    <span style={{ color: "#00FF88" }}>{meal.protein}g protein</span>
                  </div>
                </div>
                <button
                  onClick={() => deleteMeal(meal.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#3a3a3a",
                    fontSize: 14,
                    cursor: "pointer",
                    padding: "2px 6px",
                    flexShrink: 0,
                    lineHeight: 1,
                  }}
                  title="Remove meal"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Chat interface ─────────────────────────────────────────────────── */}
      <div style={{
        background: "#0d0d0d",
        border: "1px solid #1e1e1e",
        borderRadius: 12,
        overflow: "hidden",
      }}>
        {/* Chat history */}
        <div style={{
          maxHeight: 260,
          overflowY: "auto",
          padding: "12px 12px 4px",
        }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px 0", fontSize: 11, color: "#333" }}>
              Tell me what you ate, or take a photo of your meal.
            </div>
          )}
          {messages.map((msg, i) => (
            <ChatBubble key={i} msg={msg} />
          ))}
          {loading && <LoadingBubble />}
          <div ref={chatEndRef} />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#1a1a1a" }} />

        {/* Input row */}
        <div style={{ display: "flex", gap: 6, padding: "8px 10px", alignItems: "center" }}>
          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhoto}
            style={{ display: "none" }}
          />

          {/* Camera button */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            title="Log meal from photo"
            style={{
              width: 34,
              height: 34,
              flexShrink: 0,
              background: "#1a1a1a",
              border: "1px solid #1e1e1e",
              borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              opacity: loading ? 0.4 : 1,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What did you eat?"
            disabled={loading}
            style={{
              flex: 1,
              background: "#1a1a1a",
              border: "1px solid #FF6B3533",
              borderRadius: 8,
              padding: "7px 11px",
              fontSize: 12,
              color: "#bbb",
              fontFamily: "'DM Mono', monospace",
              outline: "none",
              opacity: loading ? 0.5 : 1,
            }}
          />

          {/* Send button */}
          <button
            onClick={sendText}
            disabled={loading || !input.trim()}
            style={{
              background: input.trim() && !loading ? "#FF6B3515" : "#111",
              border: `1px solid ${input.trim() && !loading ? "#FF6B3555" : "#1e1e1e"}`,
              borderRadius: 8,
              padding: "7px 13px",
              fontSize: 10,
              color: input.trim() && !loading ? "#FF6B35" : "#333",
              fontFamily: "'Bebas Neue', cursive",
              letterSpacing: 1.5,
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              flexShrink: 0,
            }}
          >
            LOG
          </button>
        </div>
      </div>
    </div>
  );
}
