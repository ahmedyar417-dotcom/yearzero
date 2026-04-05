import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_TARGETS = {
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

const ls = {
  get(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      // Keep a shared write-timestamp map so App.jsx smartSync can compare this device's
      // data age against Supabase updated_at when deciding push vs pull.
      const ts = JSON.parse(localStorage.getItem("yz-ts") || "{}");
      ts[key] = Date.now();
      localStorage.setItem("yz-ts", JSON.stringify(ts));
    }
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
export default function MacroTracker({ color = "#FF6B35", editMode = false, viewDayOffset = 0 }) {
  const getActiveDateKey = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + (offset || 0));
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  };

  const dateKey   = getActiveDateKey(viewDayOffset);
  const MEALS_KEY = "yz-macros-" + dateKey;
  const CHAT_KEY  = "yz-nutrition-chat-" + dateKey;

  const [messages,  setMessages]  = useState(() => ls.get("yz-nutrition-chat-" + getActiveDateKey(viewDayOffset)) || [{ role: "assistant", content: "Tell me what you ate, or take a photo of your meal." }]);
  const [meals,     setMeals]     = useState(() => ls.get("yz-macros-" + getActiveDateKey(viewDayOffset)) || []);
  const [coaching,  setCoaching]  = useState(() => ls.get("yz-macro-coach-" + getActiveDateKey(viewDayOffset)) || "");
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [extOpen,   setExtOpen]   = useState(false);
  const [error,     setError]     = useState(null);
  const [targets,   setTargets]   = useState(() => ls.get("yz-macro-targets") || DEFAULT_TARGETS);

  const updateTarget = (key, newTarget) => {
    setTargets(prev => {
      const next = { ...prev, [key]: { ...prev[key], target: newTarget } };
      ls.set("yz-macro-targets", next);
      return next;
    });
  };

  const chatEndRef  = useRef(null);
  const cameraRef   = useRef(null);
  const uploadRef   = useRef(null);
  const barcodeRef  = useRef(null);
  const inputRef    = useRef(null);

  // ── Reload data when day offset changes ───────────────────────────────────
  useEffect(() => {
    const dk = getActiveDateKey(viewDayOffset);
    const mk = "yz-macros-" + dk;
    const ck = "yz-nutrition-chat-" + dk;
    setMeals(ls.get(mk) || []);
    setMessages(ls.get(ck) || [{ role: "assistant", content: "Tell me what you ate, or take a photo of your meal." }]);
    setCoaching(ls.get("yz-macro-coach-" + dk) || "");
    setInput("");
  }, [viewDayOffset]);

  // ── Re-read state when App signals a remote pull (cross-device sync) ───────
  useEffect(() => {
    const handleRemoteReload = () => {
      const dk = getActiveDateKey(viewDayOffset);
      setTargets(ls.get("yz-macro-targets") || DEFAULT_TARGETS);
      const savedChat  = ls.get("yz-nutrition-chat-" + dk);
      const savedMeals = ls.get("yz-macros-" + dk);
      if (savedChat)  setMessages(savedChat);
      if (savedMeals) setMeals(savedMeals);
      setCoaching(ls.get("yz-macro-coach-" + dk) || "");
    };
    window.addEventListener("yz-reload", handleRemoteReload);
    return () => window.removeEventListener("yz-reload", handleRemoteReload);
  }, [viewDayOffset]);

  // ── Scroll chat to bottom on new messages ─────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Persist helpers — always recompute key from current viewDayOffset ─────
  const saveChat = useCallback((msgs) => {
    const dk = getActiveDateKey(viewDayOffset);
    ls.set("yz-nutrition-chat-" + dk, msgs);
  }, [viewDayOffset]);

  const saveMeals = useCallback((ms) => {
    const dk = getActiveDateKey(viewDayOffset);
    ls.set("yz-macros-" + dk, ms);
  }, [viewDayOffset]);

  const saveCoaching = useCallback((text) => {
    const dk = getActiveDateKey(viewDayOffset);
    ls.set("yz-macro-coach-" + dk, text);
    setCoaching(text);
  }, [viewDayOffset]);

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
      saveChat(newHistory);

      if (entry) {
        setMeals(prev => {
          const next = [...prev, { ...entry, id: Date.now() }];
          saveMeals(next);
          return next;
        });
      }
    } catch (e) {
      const errMsg = { role: "assistant", content: `⚠ ${e.message || "Something went wrong. Try again."}` };
      setMessages(prev => {
        const next = [...prev, errMsg];
        saveChat(next);
        return next;
      });
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [saveChat, saveMeals]);

  // ── Send text message ──────────────────────────────────────────────────────
  const sendText = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg  = { role: "user", content: text };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    saveChat(newHistory);
    setInput("");
    callClaude(newHistory);
  }, [input, loading, messages, saveChat, callClaude]);

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
      saveChat(newHistory);
      callClaude(newHistory);
    };
    reader.readAsDataURL(file);
  }, [messages, saveChat, callClaude]);

  // ── Upload from gallery / file picker ────────────────────────────────────
  const handleGallery = useCallback((e) => {
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
          { type: "text",  text: "I'm uploading a photo of food I ate earlier. Please analyse what you can see, estimate the portions and macros, ask me anything you need to clarify, then log it." },
        ],
      };
      const newHistory = [...messages, userMsg];
      setMessages(newHistory);
      saveChat(newHistory);
      callClaude(newHistory);
    };
    reader.readAsDataURL(file);
  }, [messages, saveChat, callClaude]);

  // ── Barcode scan ───────────────────────────────────────────────────────────
  const handleBarcode = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setLoading(true);
    setError(null);

    try {
      let barcode = null;

      // 1) Try native BarcodeDetector (Chrome / Android)
      if ("BarcodeDetector" in window) {
        try {
          const bitmap = await createImageBitmap(file);
          const detector = new BarcodeDetector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"],
          });
          const codes = await detector.detect(bitmap);
          if (codes.length > 0) barcode = codes[0].rawValue;
        } catch {
          /* detector failed — fall through to Claude */
        }
      }

      // 2) Fallback: ask Claude to read the barcode digits from the image
      if (!barcode) {
        const b64 = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result.split(",")[1]);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        const mime = file.type || "image/jpeg";
        const resp = await fetch("/api/claude", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 60,
            system: "Read the barcode in the image. Reply with ONLY the numeric barcode digits (e.g. 5901234123457). If no barcode is visible, reply: NONE",
            messages: [{
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
                { type: "text", text: "What is the barcode number?" },
              ],
            }],
          }),
        });
        const rdata = await resp.json();
        const raw = (rdata?.content?.[0]?.text || "").trim().replace(/\D/g, "");
        if (raw.length >= 6) barcode = raw;
      }

      if (!barcode) {
        const msg = { role: "assistant", content: "Couldn't read a barcode from that image. Make sure the barcode is clear and well-lit, then try again." };
        setMessages(prev => { const next = [...prev, msg]; saveChat(next); return next; });
        setLoading(false);
        return;
      }

      // 3) Look up product on Open Food Facts
      const ofRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
      const ofData = await ofRes.json();

      if (ofData.status !== 1 || !ofData.product) {
        const msg = { role: "assistant", content: `Barcode ${barcode} scanned — but this product isn't in the Open Food Facts database yet. What is it? Describe it and I'll estimate the macros.` };
        setMessages(prev => { const next = [...prev, msg]; saveChat(next); return next; });
        setLoading(false);
        return;
      }

      // 4) Build nutrition context and pass to Claude to ask portion + log
      const p = ofData.product;
      const n = p.nutriments || {};
      const name = p.product_name || p.product_name_en || "Scanned product";
      const cal100     = Math.round(n["energy-kcal_100g"] ?? (n["energy_100g"] ?? 0) / 4.184);
      const protein100 = +(n.proteins_100g ?? 0).toFixed(1);
      const carbs100   = +(n.carbohydrates_100g ?? 0).toFixed(1);
      const fat100     = +(n.fat_100g ?? 0).toFixed(1);
      const fibre100   = +(n.fiber_100g ?? n["fiber_100g"] ?? 0).toFixed(1);
      const sugar100   = +(n.sugars_100g ?? 0).toFixed(1);
      const sodium100  = Math.round((n.sodium_100g ?? 0) * 1000);
      const satFat100  = +(n["saturated-fat_100g"] ?? 0).toFixed(1);

      const userMsg = {
        role: "user",
        content: `I scanned a barcode for: ${name}. Nutrition per 100g — ${cal100} kcal, ${protein100}g protein, ${carbs100}g carbs, ${fat100}g fat, ${fibre100}g fibre, ${sugar100}g sugar, ${sodium100}mg sodium, ${satFat100}g sat fat. Ask me how much I had, then log it.`,
      };
      const newHistory = [...messages, userMsg];
      setMessages(newHistory);
      saveChat(newHistory);
      callClaude(newHistory); // callClaude manages setLoading(false) in its finally block

    } catch (err) {
      const msg = { role: "assistant", content: `⚠ Barcode scan failed: ${err.message}` };
      setMessages(prev => { const next = [...prev, msg]; saveChat(next); return next; });
      setError(err.message);
      setLoading(false);
    }
  }, [messages, saveChat, callClaude]);

  // ── Delete meal ────────────────────────────────────────────────────────────
  const deleteMeal = useCallback((id) => {
    setMeals(prev => {
      const next = prev.filter(m => m.id !== id);
      saveMeals(next);
      return next;
    });
  }, [saveMeals]);

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
      {/* Hidden file inputs — placed outside overflow:hidden containers for iOS Safari compatibility */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhoto}
        style={{ display: "none" }}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        onChange={handleGallery}
        style={{ display: "none" }}
      />
      <input
        ref={barcodeRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleBarcode}
        style={{ display: "none" }}
      />
      {/* Section label */}
      <div style={{ fontSize: 9, color: "#444", letterSpacing: 2 }}>MACRO TRACKER</div>

      {/* ── Editable targets (edit mode only) ─────────────────────────────── */}
      {editMode && (
        <div style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 9, color: "#555", letterSpacing: 2, marginBottom: 2 }}>EDIT TARGETS</div>
          {Object.entries(targets).map(([key, cfg]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 9, color: "#555", letterSpacing: 1, width: 64, flexShrink: 0 }}>{cfg.label}</span>
              <input
                type="number"
                value={cfg.target}
                onChange={e => updateTarget(key, parseFloat(e.target.value) || 0)}
                style={{ width: 72, background: "#1a1a1a", border: `1px solid ${cfg.color}44`, borderRadius: 5, color: cfg.color, padding: "4px 7px", fontSize: 12, fontFamily: "'Bebas Neue', cursive", letterSpacing: 1, outline: "none", textAlign: "center" }}
              />
              <span style={{ fontSize: 9, color: "#444" }}>{cfg.unit}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Macro bars ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {Object.entries(targets).map(([key, cfg]) => (
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
          {messages.map((msg, i) => (
            <ChatBubble key={i} msg={msg} />
          ))}
          {loading && <LoadingBubble />}
          <div ref={chatEndRef} />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#1a1a1a" }} />

        {/* Past-day banner */}
        {viewDayOffset !== 0 && (
          <div style={{
            padding: "5px 12px",
            background: "#FF6B3515",
            borderBottom: "1px solid #FF6B3522",
            fontSize: 9,
            color: "#FF6B35",
            letterSpacing: 2,
            textAlign: "center",
          }}>
            LOGGING FOR {new Date(dateKey + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).toUpperCase()}
          </div>
        )}

        {/* Input row */}
        <div style={{ display: "flex", gap: 6, padding: "8px 10px", alignItems: "center" }}>
          {/* Barcode scan button */}
          <button
            onClick={() => barcodeRef.current?.click()}
            disabled={loading}
            title="Scan barcode"
            style={{
              width: 44,
              height: 44,
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9V5a2 2 0 0 1 2-2h1"/>
              <path d="M3 15v4a2 2 0 0 0 2 2h1"/>
              <path d="M21 9V5a2 2 0 0 0-2-2h-1"/>
              <path d="M21 15v4a2 2 0 0 1-2 2h-1"/>
              <line x1="7" y1="3" x2="7" y2="21"/>
              <line x1="11" y1="3" x2="11" y2="21"/>
              <line x1="13" y1="3" x2="13" y2="21"/>
              <line x1="17" y1="3" x2="17" y2="21"/>
            </svg>
          </button>

          {/* Camera button — opens camera directly on iOS */}
          <button
            onClick={() => cameraRef.current?.click()}
            disabled={loading}
            title="Take a photo of your meal"
            style={{
              width: 44,
              height: 44,
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

          {/* Upload button — opens photo library picker on iOS */}
          <button
            onClick={() => uploadRef.current?.click()}
            disabled={loading}
            title="Upload a photo from gallery"
            style={{
              width: 44,
              height: 44,
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
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
