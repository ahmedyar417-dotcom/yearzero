import React, { useState, useEffect, useCallback, useRef } from "react";

// ─── localStorage ─────────────────────────────────────────────────────────────
const ls = {
  get(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; } },
};

const getWeekKey = () => {
  const d = new Date(); d.setHours(0,0,0,0);
  d.setDate(d.getDate() - ((d.getDay()+6)%7));
  return `yz-week-${d.toISOString().slice(0,10)}`;
};
const uid = () => Math.random().toString(36).slice(2,8);

// ─── Trajectories ─────────────────────────────────────────────────────────────
const TRAJECTORIES = {
  business: (wk) => Math.min(15000, Math.round((wk/52)*15000)),
  fatLoss:  (wk) => Math.max(85, 102 - (wk * (17/52))),
  savings:  (wk) => Math.round(15000 + (wk/52)*85000),
  social:   (wk) => Math.round((wk/52)*5000),
};
const GOAL_META = {
  business: { label:"Monthly Revenue", unit:"£", start:0,     end:15000,  format: v=>`£${v.toLocaleString()}`,  placeholder:"e.g. 1200" },
  fatLoss:  { label:"Body Weight",     unit:"kg",start:102,   end:85,     format: v=>`${v}kg`,                  placeholder:"e.g. 99.5" },
  savings:  { label:"Savings Balance", unit:"£", start:15000, end:100000, format: v=>`£${v.toLocaleString()}`,  placeholder:"e.g. 18000" },
  social:   { label:"X Followers",     unit:"",  start:0,     end:5000,   format: v=>`${v.toLocaleString()}`,   placeholder:"e.g. 47" },
};

// ─── Default goal sections ────────────────────────────────────────────────────
const DEFAULT_SECTIONS = {
  business: {
    label:"Business", color:"#00FF88", icon:"◈", goal:"Leave Corporate · £15k/month",
    daily:[
      {label:"100 Outbound touches",unit:"/day",key:"d0"},
      {label:"30min Follow-ups",unit:"min",key:"d1"},
      {label:"30min Fulfillment/skill",unit:"min",key:"d2"},
      {label:"Pipeline update",unit:"10min",key:"d3"},
    ],
    weekly:[
      {label:"Reach outs",min:0,max:700,target:500,unit:"reach outs",suffix:"/ 500",key:"w0"},
      {label:"Sales calls",min:0,max:15,target:4,unit:"calls",suffix:"/ 4–6",key:"w1"},
      {label:"CRM cleanup",min:0,max:4,target:1,unit:"hrs",suffix:"/ 1–2 hrs",key:"w2"},
      {label:"Authority post",min:0,max:5,target:1,unit:"posts",suffix:"/ 1",key:"w3"},
    ],
  },
  fatLoss: {
    label:"Fat Loss", color:"#FF6B35", icon:"◉", goal:"102 kg → 85 kg",
    daily:[
      {label:"Log calories ~2000 kcal",unit:"kcal",key:"d0"},
      {label:"≥130g protein",unit:"g",key:"d1"},
      {label:"8,000+ steps",unit:"steps",key:"d2"},
      {label:"2–3L water",unit:"L",key:"d3"},
    ],
    weekly:[
      {label:"Strength sessions",min:0,max:7,target:3,unit:"sessions",suffix:"/ 3",key:"w0"},
      {label:"Cardio sessions",min:0,max:7,target:1,unit:"sessions",suffix:"/ 1 opt.",key:"w1"},
      {label:"Weigh-ins",min:0,max:7,target:7,unit:"days",suffix:"/ 7",key:"w2"},
      {label:"Avg loss (kg)",min:0,max:2,target:0.35,unit:"kg",suffix:"/ −0.35 kg",step:0.05,key:"w3"},
    ],
  },
  savings: {
    label:"Savings", color:"#FFD700", icon:"◆", goal:"£15k → £100k",
    daily:[
      {label:"Log spending",unit:"once",key:"d0"},
      {label:"24hr delay >£20",unit:"rule",key:"d1"},
      {label:"No consumer debt",unit:"rule",key:"d2"},
      {label:"CC paid in full",unit:"monthly",key:"d3"},
    ],
    weekly:[
      {label:"Net worth updated",min:0,max:1,target:1,unit:"done",suffix:"/ 1",type:"check",key:"w0"},
      {label:"Spending reviewed",min:0,max:1,target:1,unit:"done",suffix:"/ 1",type:"check",key:"w1"},
      {label:"Business cash logged",min:0,max:1,target:1,unit:"done",suffix:"/ 1",type:"check",key:"w2"},
      {label:"50% profit transferred",min:0,max:1,target:1,unit:"done",suffix:"/ 1",type:"check",key:"w3"},
    ],
  },
  social: {
    label:"Grow @X", color:"#A78BFA", icon:"◍", goal:"0 → 5,000 Followers",
    daily:[
      {label:"Write/refine post",unit:"30min",key:"d0"},
      {label:"Record short video",unit:"20min",key:"d1"},
      {label:"Comments + DMs",unit:"20min",key:"d2"},
      {label:"Meaningful comments",unit:"5–10",key:"d3"},
    ],
    weekly:[
      {label:"Main posts",min:0,max:10,target:5,unit:"posts",suffix:"/ 5",key:"w0"},
      {label:"Reels / videos",min:0,max:10,target:3,unit:"videos",suffix:"/ 3",key:"w1"},
      {label:"Comments left",min:0,max:150,target:35,unit:"comments",suffix:"/ 35–70",key:"w2"},
      {label:"DMs sent",min:0,max:50,target:20,unit:"DMs",suffix:"/ 20",key:"w3"},
    ],
  },
};

const DEFAULT_SCHED = [
  {id:"s0",label:"WEEKDAY",sub:"Mon–Fri · 3 hrs",color:"#A78BFA",blocks:[
    {id:"b0",text:"60min — 100 outbound touches"},
    {id:"b1",text:"30min — Follow-ups + CRM"},
    {id:"b2",text:"30min — Write/refine post"},
    {id:"b3",text:"15min — Comments + DMs"},
    {id:"b4",text:"15min — Log calories + weight + spend"},
  ]},
  {id:"s1",label:"SATURDAY",sub:"6–7 hrs",color:"#FF6B35",blocks:[
    {id:"b0",text:"2hrs — Deep client work + SOPs"},
    {id:"b1",text:"2hrs — List building + extra outreach"},
    {id:"b2",text:"1.5hrs — Batch content (posts + videos)"},
    {id:"b3",text:"30min — Weekly money review"},
    {id:"b4",text:"1hr — Long workout + steps"},
  ]},
  {id:"s2",label:"SUNDAY",sub:"6–7 hrs",color:"#FFD700",blocks:[
    {id:"b0",text:"2hrs — Sales calls / review recordings"},
    {id:"b1",text:"1.5hrs — Long walk / cardio"},
    {id:"b2",text:"1.5hrs — Record, edit, schedule content"},
    {id:"b3",text:"1hr — Metrics review + next week plan"},
  ]},
];

const Q_THEMES = ["Validate · First clients","Tighten systems · Scale","Systemize · Case studies","Transition · Solidify ops"];
const emptyChecks = (s) => Object.fromEntries(Object.keys(s).map(k=>[k,s[k].daily.map(()=>false)]));
const emptyActuals = (s) => Object.fromEntries(Object.keys(s).map(k=>[k,s[k].weekly.map(()=>null)]));

// ─── Microsoft Graph / Outlook helpers ───────────────────────────────────────
const MS_CLIENT_ID = ls.get("yz-ms-client-id") || "";
const MS_SCOPES = "Calendars.ReadWrite User.Read";

function getMsAuthUrl(clientId, redirectUri) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "token",
    redirect_uri: redirectUri,
    scope: MS_SCOPES,
    response_mode: "fragment",
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

function parseMsToken() {
  const hash = window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get("access_token");
  const expiresIn = params.get("expires_in");
  if (token) {
    window.history.replaceState({}, document.title, window.location.pathname);
    return { token, expiresAt: Date.now() + parseInt(expiresIn||3600)*1000 };
  }
  return null;
}

async function fetchCalendarEvents(token, start, end) {
  const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$orderby=start/dateTime&$top=50&$select=subject,start,end,bodyPreview,isAllDay`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`Graph API error ${res.status}`);
  const data = await res.json();
  return data.value || [];
}

async function createCalendarEvent(token, event) {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`Create event failed ${res.status}`);
  return res.json();
}

// ─── Utility: date helpers ────────────────────────────────────────────────────
const fmt = (d, opts) => new Date(d).toLocaleDateString("en-GB", opts);
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
const dayNames = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function getWeekDays(refDate) {
  const d = new Date(refDate); d.setHours(0,0,0,0);
  const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay()+6)%7));
  return Array.from({length:7}, (_,i) => { const dd = new Date(monday); dd.setDate(monday.getDate()+i); return dd; });
}

// ─── Ring ─────────────────────────────────────────────────────────────────────
function Ring({pct,color,size=60}){
  const r=(size-8)/2,circ=2*Math.PI*r,dash=Math.min(pct/100,1)*circ;
  return(
    <svg width={size} height={size} style={{transform:"rotate(-90deg)",flexShrink:0}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e1e1e" strokeWidth={5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{transition:"stroke-dasharray 0.5s ease",filter:`drop-shadow(0 0 5px ${color}88)`}}/>
    </svg>
  );
}

// ─── CheckRow ─────────────────────────────────────────────────────────────────
function CheckRow({label,done,color,onToggle,editMode,onDelete}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0"}}>
      {editMode&&<button onClick={onDelete} style={{width:20,height:20,borderRadius:"50%",background:"#FF6B3522",border:"1px solid #FF6B3566",color:"#FF6B35",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,lineHeight:1}}>×</button>}
      <button onClick={editMode?undefined:onToggle} style={{display:"flex",alignItems:"center",gap:10,background:"none",border:"none",cursor:editMode?"default":"pointer",padding:"2px 0",flex:1,textAlign:"left",opacity:editMode?0.6:1}}>
        <span style={{width:18,height:18,borderRadius:4,border:`2px solid ${done?color:"#3a3a3a"}`,background:done?color+"22":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.18s",boxShadow:done?`0 0 7px ${color}55`:"none"}}>
          {done&&<span style={{color,fontSize:11,fontWeight:900,lineHeight:1}}>✓</span>}
        </span>
        <span style={{fontSize:13,color:done?"#444":"#bbb",textDecoration:done?"line-through":"none",letterSpacing:0.2}}>{label}</span>
      </button>
    </div>
  );
}

// ─── Add Daily Modal ──────────────────────────────────────────────────────────
function AddDailyModal({color,onSave,onClose}){
  const [label,setLabel]=useState(""); const [unit,setUnit]=useState("");
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#000d",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#141414",border:`1px solid ${color}55`,borderRadius:18,padding:28,width:"min(360px,94vw)"}}>
        <p style={{fontSize:9,color:"#555",letterSpacing:2,margin:"0 0 4px"}}>ADD DAILY TASK</p>
        <p style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:"#fff",letterSpacing:1,margin:"0 0 20px"}}>New Non-Negotiable</p>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:6}}>TASK LABEL</label>
          <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="e.g. 30min reading" autoFocus style={{width:"100%",background:"#1a1a1a",border:`1px solid ${color}33`,borderRadius:10,padding:"10px 14px",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
        </div>
        <div style={{marginBottom:24}}>
          <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:6}}>UNIT / NOTE <span style={{color:"#333"}}>(optional)</span></label>
          <input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="e.g. min, /day, pages" style={{width:"100%",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,padding:"10px 14px",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:"12px 0",borderRadius:10,border:"1px solid #2a2a2a",background:"#1a1a1a",color:"#555",fontSize:11,cursor:"pointer",letterSpacing:1}}>CANCEL</button>
          <button onClick={()=>label.trim()&&onSave({label:label.trim(),unit:unit.trim()||"✓",key:uid()})} style={{flex:2,padding:"12px 0",borderRadius:10,border:`1px solid ${color}55`,background:color+"20",color,fontFamily:"'Bebas Neue',cursive",fontSize:17,cursor:"pointer",letterSpacing:2,opacity:label.trim()?1:0.4}}>ADD TASK</button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Weekly Modal ─────────────────────────────────────────────────────────
function AddWeeklyModal({color,onSave,onClose}){
  const [label,setLabel]=useState(""); const [target,setTarget]=useState(""); const [unit,setUnit]=useState(""); const [max,setMax]=useState(""); const [isCheck,setIsCheck]=useState(false);
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#000d",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#141414",border:`1px solid ${color}55`,borderRadius:18,padding:28,width:"min(360px,94vw)"}}>
        <p style={{fontSize:9,color:"#555",letterSpacing:2,margin:"0 0 4px"}}>ADD WEEKLY TARGET</p>
        <p style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:"#fff",letterSpacing:1,margin:"0 0 20px"}}>New Target</p>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:6}}>LABEL</label>
          <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="e.g. Client calls" autoFocus style={{width:"100%",background:"#1a1a1a",border:`1px solid ${color}33`,borderRadius:10,padding:"10px 14px",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {["Number","Done/Not done"].map((opt,i)=>(
            <button key={opt} onClick={()=>setIsCheck(i===1)} style={{flex:1,padding:"8px 0",borderRadius:8,border:`1px solid ${(i===1)===isCheck?color+"66":"#2a2a2a"}`,background:(i===1)===isCheck?color+"15":"#1a1a1a",color:(i===1)===isCheck?color:"#555",fontSize:11,cursor:"pointer"}}>{opt}</button>
          ))}
        </div>
        {!isCheck&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
            <div><label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:6}}>TARGET</label><input type="number" value={target} onChange={e=>setTarget(e.target.value)} placeholder="5" style={{width:"100%",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,padding:"10px 10px",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit"}}/></div>
            <div><label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:6}}>MAX</label><input type="number" value={max} onChange={e=>setMax(e.target.value)} placeholder="20" style={{width:"100%",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,padding:"10px 10px",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit"}}/></div>
            <div><label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:6}}>UNIT</label><input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="calls" style={{width:"100%",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:10,padding:"10px 10px",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit"}}/></div>
          </div>
        )}
        <div style={{display:"flex",gap:8,marginTop:isCheck?10:0}}>
          <button onClick={onClose} style={{flex:1,padding:"12px 0",borderRadius:10,border:"1px solid #2a2a2a",background:"#1a1a1a",color:"#555",fontSize:11,cursor:"pointer",letterSpacing:1}}>CANCEL</button>
          <button onClick={()=>{if(!label.trim())return;const t=isCheck?1:parseFloat(target)||1;const m=isCheck?1:parseFloat(max)||t*3;const u=isCheck?"done":(unit.trim()||"count");onSave({label:label.trim(),min:0,max:m,target:t,unit:u,suffix:`/ ${t}`,key:uid(),...(isCheck?{type:"check"}:{})});}} style={{flex:2,padding:"12px 0",borderRadius:10,border:`1px solid ${color}55`,background:color+"20",color,fontFamily:"'Bebas Neue',cursive",fontSize:17,cursor:"pointer",letterSpacing:2,opacity:label.trim()?1:0.4}}>ADD TARGET</button>
        </div>
      </div>
    </div>
  );
}

// ─── Input Modal ──────────────────────────────────────────────────────────────
function InputModal({item,color,onSave,onClose}){
  const [val,setVal]=useState(item.actual??0); const isCheck=item.type==="check"; const step=item.step||1; const pct=Math.min(Math.round((val/item.target)*100),100);
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#000d",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#141414",border:`1px solid ${color}55`,borderRadius:18,padding:28,width:"min(340px,94vw)"}}>
        <p style={{fontSize:9,color:"#555",letterSpacing:2,margin:"0 0 4px"}}>LOG PROGRESS</p>
        <p style={{fontFamily:"'Bebas Neue',cursive",fontSize:24,color:"#fff",letterSpacing:1,margin:"0 0 4px"}}>{item.label}</p>
        <p style={{fontSize:11,color:"#555",margin:"0 0 24px"}}>Target: {item.suffix.replace("/ ","")}</p>
        {isCheck?(
          <div style={{display:"flex",gap:10,marginBottom:24}}>
            {["Not done","Done"].map((opt,i)=>(
              <button key={opt} onClick={()=>setVal(i)} style={{flex:1,padding:"12px 0",borderRadius:10,border:`2px solid ${val===i?color:"#2a2a2a"}`,background:val===i?color+"20":"#1a1a1a",color:val===i?color:"#555",fontFamily:"'Bebas Neue',cursive",fontSize:16,letterSpacing:1,cursor:"pointer"}}>{opt}</button>
            ))}
          </div>
        ):(
          <div style={{marginBottom:24}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <button onClick={()=>setVal(v=>Math.max(item.min,parseFloat((v-step).toFixed(2))))} style={{width:42,height:42,borderRadius:8,border:"1px solid #2a2a2a",background:"#1a1a1a",color:"#aaa",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>−</button>
              <div style={{flex:1,textAlign:"center"}}>
                <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:52,color,lineHeight:1,letterSpacing:2,filter:`drop-shadow(0 0 10px ${color}55)`}}>{val}</div>
                <div style={{fontSize:10,color:"#555",marginTop:2}}>{item.unit}</div>
              </div>
              <button onClick={()=>setVal(v=>Math.min(item.max,parseFloat((v+step).toFixed(2))))} style={{width:42,height:42,borderRadius:8,border:"1px solid #2a2a2a",background:"#1a1a1a",color:"#aaa",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>+</button>
            </div>
            <input type="range" min={item.min} max={item.max} step={step} value={val} onChange={e=>setVal(parseFloat(e.target.value))} style={{width:"100%",accentColor:color,cursor:"pointer"}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}><span style={{fontSize:9,color:"#333"}}>{item.min}</span><span style={{fontSize:9,color:"#333"}}>{item.max}</span></div>
          </div>
        )}
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:10,color:"#555"}}>progress</span><span style={{fontFamily:"'Bebas Neue',cursive",fontSize:14,color:pct>=100?"#00FF88":color,letterSpacing:1}}>{pct}%</span></div>
          <div style={{height:5,background:"#1a1a1a",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:pct>=100?"#00FF88":color,borderRadius:3,transition:"width 0.3s ease"}}/></div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:"12px 0",borderRadius:10,border:"1px solid #2a2a2a",background:"#1a1a1a",color:"#555",fontSize:11,cursor:"pointer",letterSpacing:1}}>CANCEL</button>
          <button onClick={()=>onSave(val)} style={{flex:2,padding:"12px 0",borderRadius:10,border:`1px solid ${color}55`,background:color+"20",color,fontFamily:"'Bebas Neue',cursive",fontSize:17,cursor:"pointer",letterSpacing:2}}>SAVE</button>
        </div>
      </div>
    </div>
  );
}

// ─── Week Card ────────────────────────────────────────────────────────────────
function WeekCard({item,color,onClick,editMode,onDelete}){
  const hasData=item.actual!==null&&item.actual!==undefined; const isCheck=item.type==="check";
  const pct=hasData?Math.min(Math.round((item.actual/item.target)*100),100):0; const hit=hasData&&item.actual>=item.target; const dc=hit?"#00FF88":color;
  return(
    <div style={{position:"relative"}}>
      {editMode&&<button onClick={onDelete} style={{position:"absolute",top:-7,right:-7,zIndex:10,width:20,height:20,borderRadius:"50%",background:"#FF6B3522",border:"1px solid #FF6B3566",color:"#FF6B35",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>×</button>}
      <button onClick={editMode?undefined:onClick} style={{position:"relative",overflow:"hidden",background:hasData?color+"08":"#181818",borderRadius:10,padding:"10px 12px",border:`1px solid ${editMode?color+"30":hasData?color+"40":"#242424"}`,cursor:editMode?"default":"pointer",textAlign:"left",width:"100%",opacity:editMode?0.7:1}}>
        {hasData&&!editMode&&<div style={{position:"absolute",inset:0,width:`${pct}%`,background:`linear-gradient(90deg,${color}14,transparent)`,pointerEvents:"none"}}/>}
        <div style={{position:"relative"}}>
          <div style={{fontSize:10,color:"#555",marginBottom:3}}>{item.label}</div>
          {hasData&&!editMode?(
            <>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:dc,letterSpacing:1}}>{isCheck?(item.actual===1?"✓ DONE":"✗ PENDING"):item.actual}{!isCheck&&<span style={{fontSize:9,color:"#444",marginLeft:5}}>{item.suffix}</span>}</div>
              {!isCheck&&<div style={{marginTop:5,height:2,background:"#1e1e1e",borderRadius:1,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:dc}}/></div>}
            </>
          ):(<div style={{fontSize:11,color:editMode?"#555":"#383838"}}>{editMode?item.suffix:`tap to log ${item.suffix}`}</div>)}
        </div>
      </button>
    </div>
  );
}

// ─── Goal Card ────────────────────────────────────────────────────────────────
function GoalCard({sectionKey,section,checks,onCheck,actuals,onSave,editMode,onUpdateSection}){
  const [modal,setModal]=useState(null); const [addDaily,setAddDaily]=useState(false); const [addWeekly,setAddWeekly]=useState(false);
  const dd=checks.filter(Boolean).length;
  const wh=section.weekly.filter((w,i)=>{const a=actuals[i];return a!==null&&a!==undefined&&a>=w.target;}).length;
  const pct=section.daily.length+section.weekly.length>0?Math.round(((dd+wh)/(section.daily.length+section.weekly.length))*100):0;
  return(
    <>
      {modal!==null&&!editMode&&<InputModal item={{...section.weekly[modal],actual:actuals[modal]??0}} color={section.color} onSave={v=>{onSave(sectionKey,modal,v);setModal(null);}} onClose={()=>setModal(null)}/>}
      {addDaily&&<AddDailyModal color={section.color} onSave={item=>{onUpdateSection(sectionKey,{...section,daily:[...section.daily,item]});setAddDaily(false);}} onClose={()=>setAddDaily(false)}/>}
      {addWeekly&&<AddWeeklyModal color={section.color} onSave={item=>{onUpdateSection(sectionKey,{...section,weekly:[...section.weekly,item]});setAddWeekly(false);}} onClose={()=>setAddWeekly(false)}/>}
      <div style={{background:"#111",border:`1px solid ${editMode?section.color+"44":section.color+"20"}`,borderRadius:16,padding:22,display:"flex",flexDirection:"column",gap:18,position:"relative",overflow:"hidden"}}>
        {editMode&&<div style={{position:"absolute",top:10,left:"50%",transform:"translateX(-50%)",background:section.color+"22",border:`1px solid ${section.color}44`,borderRadius:6,padding:"2px 10px",fontSize:9,color:section.color,letterSpacing:2,whiteSpace:"nowrap"}}>EDITING</div>}
        <div style={{position:"absolute",top:-30,right:-30,width:130,height:130,borderRadius:"50%",background:`radial-gradient(circle,${section.color}07 0%,transparent 70%)`,pointerEvents:"none"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginTop:editMode?16:0}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
              <span style={{color:section.color,fontSize:18}}>{section.icon}</span>
              <span style={{color:section.color,fontSize:11,letterSpacing:2,textTransform:"uppercase"}}>{section.label}</span>
            </div>
            <div style={{color:"#fff",fontFamily:"'Bebas Neue',cursive",fontSize:20,letterSpacing:1}}>{section.goal}</div>
          </div>
          <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <Ring pct={pct} color={section.color} size={60}/>
            <span style={{position:"absolute",fontFamily:"'Bebas Neue',cursive",fontSize:13,color:"#fff",letterSpacing:1}}>{pct}%</span>
          </div>
        </div>
        <div style={{borderTop:"1px solid #1e1e1e",paddingTop:14}}>
          <div style={{fontSize:9,color:"#444",letterSpacing:2,marginBottom:7}}>DAILY NON-NEGOTIABLES</div>
          {section.daily.map((item,i)=><CheckRow key={item.key} label={`${item.label} · ${item.unit}`} done={checks[i]||false} color={section.color} onToggle={()=>onCheck(sectionKey,i)} editMode={editMode} onDelete={()=>onUpdateSection(sectionKey,{...section,daily:section.daily.filter((_,j)=>j!==i)})}/>)}
          {editMode&&<button onClick={()=>setAddDaily(true)} style={{display:"flex",alignItems:"center",gap:7,marginTop:8,background:section.color+"12",border:`1px dashed ${section.color}44`,borderRadius:8,padding:"7px 12px",cursor:"pointer",color:section.color,fontSize:11,letterSpacing:1,width:"100%"}}><span style={{fontSize:16}}>+</span> ADD DAILY TASK</button>}
        </div>
        <div style={{borderTop:"1px solid #1e1e1e",paddingTop:14}}>
          <div style={{fontSize:9,color:"#444",letterSpacing:2,marginBottom:10}}>WEEKLY TARGETS {!editMode&&<span style={{color:"#2a2a2a"}}>· tap to log</span>}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
            {section.weekly.map((w,i)=><WeekCard key={w.key} item={{...w,actual:actuals[i]}} color={section.color} onClick={()=>setModal(i)} editMode={editMode} onDelete={()=>onUpdateSection(sectionKey,{...section,weekly:section.weekly.filter((_,j)=>j!==i)})}/>)}
          </div>
          {editMode&&<button onClick={()=>setAddWeekly(true)} style={{display:"flex",alignItems:"center",gap:7,marginTop:8,background:section.color+"12",border:`1px dashed ${section.color}44`,borderRadius:8,padding:"7px 12px",cursor:"pointer",color:section.color,fontSize:11,letterSpacing:1,width:"100%"}}><span style={{fontSize:16}}>+</span> ADD WEEKLY TARGET</button>}
        </div>
      </div>
    </>
  );
}

// ─── Schedule Section (editable) ─────────────────────────────────────────────
function ScheduleSection({sched,onUpdate,editMode}){
  const [addingTo,setAddingTo]=useState(null);
  const [newBlock,setNewBlock]=useState("");

  const deleteBlock=(dayId,blockId)=>{
    onUpdate(sched.map(d=>d.id===dayId?{...d,blocks:d.blocks.filter(b=>b.id!==blockId)}:d));
  };
  const addBlock=(dayId)=>{
    if(!newBlock.trim())return;
    onUpdate(sched.map(d=>d.id===dayId?{...d,blocks:[...d.blocks,{id:uid(),text:newBlock.trim()}]}:d));
    setNewBlock("");setAddingTo(null);
  };

  return(
    <div style={{padding:"0 20px 24px"}}>
      <div style={{borderTop:"1px solid #1a1a1a",paddingTop:18,marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:9,color:"#444",letterSpacing:2}}>WEEKLY SCHEDULE TEMPLATE</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12}}>
        {sched.map(day=>(
          <div key={day.id} style={{background:"#111",border:`1px solid ${editMode?day.color+"44":day.color+"20"}`,borderRadius:12,padding:16}}>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:18,color:day.color,letterSpacing:2}}>{day.label}</div>
            <div style={{fontSize:9,color:"#444",letterSpacing:1,marginBottom:10}}>{day.sub}</div>
            {day.blocks.map(b=>(
              <div key={b.id} style={{display:"flex",gap:6,marginBottom:6,alignItems:"flex-start"}}>
                {editMode&&<button onClick={()=>deleteBlock(day.id,b.id)} style={{width:16,height:16,borderRadius:"50%",background:"#FF6B3522",border:"1px solid #FF6B3566",color:"#FF6B35",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,lineHeight:1,marginTop:2}}>×</button>}
                <span style={{color:day.color,fontSize:7,marginTop:4,flexShrink:0}}>▸</span>
                <span style={{fontSize:11,color:"#777",lineHeight:1.5}}>{b.text}</span>
              </div>
            ))}
            {editMode&&(
              addingTo===day.id?(
                <div style={{marginTop:8,display:"flex",gap:6}}>
                  <input value={newBlock} onChange={e=>setNewBlock(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addBlock(day.id)} placeholder="e.g. 30min reading" autoFocus style={{flex:1,background:"#1a1a1a",border:`1px solid ${day.color}44`,borderRadius:7,padding:"6px 10px",color:"#fff",fontSize:11,outline:"none",fontFamily:"inherit"}}/>
                  <button onClick={()=>addBlock(day.id)} style={{padding:"6px 10px",borderRadius:7,background:day.color+"22",border:`1px solid ${day.color}55`,color:day.color,fontSize:11,cursor:"pointer"}}>+</button>
                  <button onClick={()=>{setAddingTo(null);setNewBlock("");}} style={{padding:"6px 10px",borderRadius:7,background:"#1a1a1a",border:"1px solid #2a2a2a",color:"#555",fontSize:11,cursor:"pointer"}}>✕</button>
                </div>
              ):(
                <button onClick={()=>setAddingTo(day.id)} style={{display:"flex",alignItems:"center",gap:6,marginTop:8,background:day.color+"12",border:`1px dashed ${day.color}44`,borderRadius:7,padding:"6px 10px",cursor:"pointer",color:day.color,fontSize:10,letterSpacing:1,width:"100%"}}>
                  <span style={{fontSize:14}}>+</span> ADD BLOCK
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── History Modal ────────────────────────────────────────────────────────────
function HistoryModal({history,sectionKeys,onClose}){
  const weeks=Object.entries(history).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,20);
  const fmtD=d=>new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short"});
  const COLORS={business:"#00FF88",fatLoss:"#FF6B35",savings:"#FFD700",social:"#A78BFA"};
  const LABELS={business:"Business",fatLoss:"Fat Loss",savings:"Savings",social:"Social"};
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"#000d",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#111",border:"1px solid #2a2a2a",borderRadius:18,padding:24,width:"min(680px,96vw)",maxHeight:"85vh",overflow:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div><div style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:"#fff",letterSpacing:2}}>WEEK HISTORY</div><div style={{fontSize:9,color:"#444",letterSpacing:1}}>{weeks.length} weeks saved</div></div>
          <button onClick={onClose} style={{background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:8,color:"#666",padding:"7px 14px",cursor:"pointer",fontSize:10}}>CLOSE</button>
        </div>
        {weeks.length===0?<div style={{textAlign:"center",padding:48,color:"#444",fontSize:11}}>No history yet</div>:weeks.map(([key,wd])=>{
          const dateStr=key.replace("yz-week-",""); const endD=new Date(dateStr); endD.setDate(endD.getDate()+6);
          const pcts=sectionKeys.map(sec=>{
            const c=wd.checks?.[sec]||[]; const a=wd.actuals?.[sec]||[];
            const total=(wd.sectionSnapshot?.[sec]?.daily?.length||4)+(wd.sectionSnapshot?.[sec]?.weekly?.length||4);
            const done=c.filter(Boolean).length+(wd.sectionSnapshot?.[sec]?.weekly||DEFAULT_SECTIONS[sec]?.weekly||[]).filter((w,i)=>{const v=a[i];return v!==null&&v!==undefined&&v>=w.target;}).length;
            return total>0?Math.round((done/total)*100):0;
          });
          const overall=Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length);
          const oc=overall>=75?"#00FF88":overall>=50?"#FFD700":"#FF6B35";
          return(
            <div key={key} style={{background:"#181818",borderRadius:12,padding:16,marginBottom:10,border:"1px solid #222"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:17,color:"#ccc",letterSpacing:1}}>{fmtD(dateStr)} – {fmtD(endD)}</div>
                <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:26,color:oc}}>{overall}%</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                {sectionKeys.map((sec,i)=>(
                  <div key={sec} style={{textAlign:"center"}}>
                    <div style={{fontSize:9,color:"#444",marginBottom:4}}>{LABELS[sec]||sec}</div>
                    <div style={{height:3,background:"#252525",borderRadius:2,overflow:"hidden",marginBottom:3}}><div style={{height:"100%",width:`${pcts[i]}%`,background:COLORS[sec]||"#fff"}}/></div>
                    <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:13,color:COLORS[sec]||"#fff"}}>{pcts[i]}%</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Check-In Modal ───────────────────────────────────────────────────────────
function CheckInModal({weekNum,existing,onSave,onDismiss}){
  const [vals,setVals]=useState({business:existing?.business??"",fatLoss:existing?.fatLoss??"",savings:existing?.savings??"",social:existing?.social??""});
  const fields=[
    {key:"business",color:"#00FF88",icon:"◈",...GOAL_META.business},
    {key:"fatLoss",color:"#FF6B35",icon:"◉",...GOAL_META.fatLoss},
    {key:"savings",color:"#FFD700",icon:"◆",...GOAL_META.savings},
    {key:"social",color:"#A78BFA",icon:"◍",...GOAL_META.social},
  ];
  return(
    <div style={{position:"fixed",inset:0,background:"#000e",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#141414",border:"1px solid #2a2a2a",borderRadius:20,padding:28,width:"min(400px,96vw)",maxHeight:"90vh",overflow:"auto"}}>
        <p style={{fontSize:9,color:"#555",letterSpacing:2,margin:"0 0 4px"}}>WEEK {weekNum} CHECK-IN</p>
        <p style={{fontFamily:"'Bebas Neue',cursive",fontSize:26,color:"#fff",letterSpacing:1,margin:"0 0 4px"}}>How are you tracking?</p>
        <p style={{fontSize:11,color:"#555",margin:"0 0 20px"}}>Log your current numbers for each goal</p>
        {fields.map(f=>{
          const traj=TRAJECTORIES[f.key](weekNum); const v=parseFloat(vals[f.key]);
          const onTrack=!isNaN(v)?(f.key==="fatLoss"?v<=traj*1.02:v>=traj*0.98):null;
          return(
            <div key={f.key} style={{marginBottom:14,background:"#1a1a1a",borderRadius:12,padding:14,border:`1px solid ${f.color}22`}}>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
                <span style={{color:f.color,fontSize:15}}>{f.icon}</span>
                <span style={{color:f.color,fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>{f.label}</span>
                {onTrack!==null&&<span style={{marginLeft:"auto",fontSize:9,color:onTrack?"#00FF88":"#FF6B35"}}>{onTrack?"✓ ON TRACK":"⚠ BEHIND"}</span>}
              </div>
              <div style={{fontSize:9,color:"#444",marginBottom:8}}>Target wk {weekNum}: {GOAL_META[f.key].format(Math.round(traj))}</div>
              <input type="number" value={vals[f.key]} onChange={e=>setVals(v=>({...v,[f.key]:e.target.value}))} placeholder={f.placeholder} style={{width:"100%",background:"#111",border:`1px solid ${f.color}44`,borderRadius:8,padding:"10px 12px",color:"#fff",fontSize:14,outline:"none",fontFamily:"inherit"}}/>
            </div>
          );
        })}
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <button onClick={onDismiss} style={{flex:1,padding:"12px 0",borderRadius:10,border:"1px solid #2a2a2a",background:"#1a1a1a",color:"#555",fontSize:11,cursor:"pointer",letterSpacing:1}}>SKIP</button>
          <button onClick={()=>{const parsed={};fields.forEach(f=>{const n=parseFloat(vals[f.key]);parsed[f.key]=isNaN(n)?null:n;});onSave({...parsed,weekNum,savedAt:Date.now()});}} style={{flex:2,padding:"12px 0",borderRadius:10,border:"1px solid #00FF8855",background:"#00FF8820",color:"#00FF88",fontFamily:"'Bebas Neue',cursive",fontSize:17,cursor:"pointer",letterSpacing:2}}>SAVE CHECK-IN</button>
        </div>
      </div>
    </div>
  );
}

// ─── SVG Line Chart ───────────────────────────────────────────────────────────
function LineChart({data,target,color,yMin,yMax,unit}){
  const W=320,H=160,PAD={top:16,right:20,bottom:28,left:52};
  const iW=W-PAD.left-PAD.right,iH=H-PAD.top-PAD.bottom;
  const trajPoints=Array.from({length:52},(_,i)=>target(i+1));
  const lo=yMin!==undefined?yMin:Math.min(...trajPoints)*0.95;
  const hi=yMax!==undefined?yMax:Math.max(...trajPoints)*1.05;
  const range=hi-lo||1;
  const toX=wk=>PAD.left+((wk-1)/51)*iW;
  const toY=v=>PAD.top+(1-(v-lo)/range)*iH;
  const trajPath=trajPoints.map((v,i)=>`${i===0?"M":"L"}${toX(i+1).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const pts=data.filter(d=>d.value!==null&&d.value!==undefined);
  const actualPath=pts.length>1?pts.map((d,i)=>`${i===0?"M":"L"}${toX(d.week).toFixed(1)},${toY(d.value).toFixed(1)}`).join(" "):null;
  const yTicks=[lo,lo+range*0.5,hi];
  const fmtY=v=>Math.abs(v)>=1000?`${unit}${(v/1000).toFixed(0)}k`:`${unit}${Math.round(v)}`;
  return(
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
      {yTicks.map((v,i)=><line key={i} x1={PAD.left} y1={toY(v)} x2={W-PAD.right} y2={toY(v)} stroke="#1e1e1e" strokeWidth={1}/>)}
      {yTicks.map((v,i)=><text key={i} x={PAD.left-5} y={toY(v)+4} textAnchor="end" fill="#444" fontSize={9} fontFamily="DM Mono,monospace">{fmtY(v)}</text>)}
      {[1,13,26,39,52].map(wk=>(
        <g key={wk}>
          <line x1={toX(wk)} y1={PAD.top} x2={toX(wk)} y2={H-PAD.bottom} stroke="#1a1a1a" strokeWidth={1} strokeDasharray="3,3"/>
          <text x={toX(wk)} y={H-PAD.bottom+12} textAnchor="middle" fill="#333" fontSize={8} fontFamily="DM Mono,monospace">{wk===1?"W1":wk===13?"Q2":wk===26?"Q3":wk===39?"Q4":"W52"}</text>
        </g>
      ))}
      <path d={trajPath} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.3}/>
      {actualPath&&<path d={actualPath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{filter:`drop-shadow(0 0 4px ${color}88)`}}/>}
      {pts.map((d,i)=><circle key={i} cx={toX(d.week)} cy={toY(d.value)} r={3} fill={color} stroke="#0a0a0a" strokeWidth={1.5}/>)}
      {pts.length>0&&<text x={toX(pts[pts.length-1].week)+6} y={toY(pts[pts.length-1].value)+4} fill={color} fontSize={10} fontFamily="DM Mono,monospace" fontWeight="bold">{fmtY(pts[pts.length-1].value)}</text>}
    </svg>
  );
}

// ─── Progress Page ────────────────────────────────────────────────────────────
function ProgressPage({checkins,onBack,weekNum}){
  const charts=[
    {key:"business",color:"#00FF88",icon:"◈",label:"Monthly Revenue",yMin:0,yMax:15000},
    {key:"fatLoss",color:"#FF6B35",icon:"◉",label:"Body Weight (kg)",yMin:83,yMax:104},
    {key:"savings",color:"#FFD700",icon:"◆",label:"Savings Balance",yMin:10000,yMax:105000},
    {key:"social",color:"#A78BFA",icon:"◍",label:"X Followers",yMin:0,yMax:5000},
  ];
  return(
    <div style={{minHeight:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"'DM Mono',monospace"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@300;400;500&display=swap');`}</style>
      <div style={{borderBottom:"1px solid #1a1a1a",padding:"14px 20px",display:"flex",alignItems:"center",gap:14,position:"sticky",top:0,background:"#0a0a0a",zIndex:100}}>
        <button onClick={onBack} style={{background:"#181818",border:"1px solid #252525",borderRadius:8,padding:"6px 14px",cursor:"pointer",color:"#888",fontSize:11,letterSpacing:1}}>← BACK</button>
        <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,letterSpacing:3}}>PROGRESS</span>
        <span style={{fontSize:9,color:"#444",letterSpacing:1}}>WK {weekNum} · ACTUAL VS TARGET</span>
      </div>
      <div style={{padding:20,display:"flex",flexDirection:"column",gap:20}}>
        {charts.map(ch=>{
          const meta=GOAL_META[ch.key];
          const data=Object.entries(checkins).map(([,ci])=>({week:ci.weekNum,value:ci[ch.key]})).filter(d=>d.value!==null&&d.value!==undefined).sort((a,b)=>a.week-b.week);
          const latest=data[data.length-1]?.value;
          const targetNow=TRAJECTORIES[ch.key](weekNum);
          const onTrack=latest!==undefined?(ch.key==="fatLoss"?latest<=targetNow*1.02:latest>=targetNow*0.98):null;
          return(
            <div key={ch.key} style={{background:"#111",border:`1px solid ${ch.color}20`,borderRadius:16,padding:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
                    <span style={{color:ch.color,fontSize:16}}>{ch.icon}</span>
                    <span style={{color:ch.color,fontSize:10,letterSpacing:2}}>{ch.label.toUpperCase()}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"baseline",gap:10}}>
                    <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:28,color:"#fff",letterSpacing:1}}>{latest!==undefined?meta.format(latest):"—"}</span>
                    {onTrack!==null&&<span style={{fontSize:10,color:onTrack?"#00FF88":"#FF6B35"}}>{onTrack?"✓ ON TRACK":"⚠ BEHIND"}</span>}
                  </div>
                  <div style={{fontSize:9,color:"#444",marginTop:2}}>Target now: {meta.format(Math.round(targetNow))} · Year end: {meta.format(meta.end)}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:9,color:"#444"}}>LOGGED</div>
                  <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:ch.color}}>{data.length}</div>
                  <div style={{fontSize:9,color:"#333"}}>weeks</div>
                </div>
              </div>
              {data.length===0?(
                <div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center",color:"#333",fontSize:11,border:"1px dashed #222",borderRadius:10}}>No data yet — check in each week</div>
              ):(
                <LineChart data={data} target={TRAJECTORIES[ch.key]} color={ch.color} unit={meta.unit} yMin={ch.yMin} yMax={ch.yMax}/>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Outlook Calendar ─────────────────────────────────────────────────────────
function CalendarSection(){
  const [msToken,setMsToken]=useState(()=>{ const t=ls.get("yz-ms-token"); return t&&t.expiresAt>Date.now()?t:null; });
  const [clientId,setClientId]=useState(()=>ls.get("yz-ms-client-id")||"");
  const [clientIdInput,setClientIdInput]=useState(()=>ls.get("yz-ms-client-id")||"");
  const [events,setEvents]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);
  const [calView,setCalView]=useState("week"); // "day" | "week"
  const [viewDate,setViewDate]=useState(new Date());
  const [showAddEvent,setShowAddEvent]=useState(false);
  const [newEvent,setNewEvent]=useState({title:"",date:"",startTime:"09:00",endTime:"10:00",notes:""});
  const [addStatus,setAddStatus]=useState(null);
  const [showSetup,setShowSetup]=useState(!ls.get("yz-ms-client-id"));

  // Parse token from URL after OAuth redirect
  useEffect(()=>{
    const parsed=parseMsToken();
    if(parsed){ ls.set("yz-ms-token",parsed); setMsToken(parsed); }
  },[]);

  // Fetch events when token + view changes
  useEffect(()=>{
    if(!msToken) return;
    const days=getWeekDays(viewDate);
    const start=calView==="week"?days[0]:viewDate;
    const end=new Date(calView==="week"?days[6]:viewDate);
    end.setDate(end.getDate()+1);
    setLoading(true); setError(null);
    fetchCalendarEvents(msToken.token,start,end)
      .then(evs=>{ setEvents(evs); setLoading(false); })
      .catch(e=>{ setError(e.message); setLoading(false); if(e.message.includes("401")){ ls.set("yz-ms-token",null); setMsToken(null); } });
  },[msToken,calView,viewDate.toDateString()]);

  const handleLogin=()=>{
    const id=clientIdInput.trim();
    if(!id){ alert("Enter your Azure Client ID first"); return; }
    ls.set("yz-ms-client-id",id); setClientId(id);
    window.location.href=getMsAuthUrl(id,window.location.origin+window.location.pathname);
  };

  const handleAddEvent=async()=>{
    if(!newEvent.title||!newEvent.date){ return; }
    setAddStatus("saving");
    try{
      const startDt=new Date(`${newEvent.date}T${newEvent.startTime}`);
      const endDt=new Date(`${newEvent.date}T${newEvent.endTime}`);
      await createCalendarEvent(msToken.token,{
        subject:newEvent.title,
        start:{dateTime:startDt.toISOString(),timeZone:"UTC"},
        end:{dateTime:endDt.toISOString(),timeZone:"UTC"},
        body:{contentType:"text",content:newEvent.notes},
      });
      setAddStatus("saved");
      setNewEvent({title:"",date:"",startTime:"09:00",endTime:"10:00",notes:""});
      setTimeout(()=>{ setShowAddEvent(false); setAddStatus(null); },800);
      // Refresh events
      const days=getWeekDays(viewDate);
      const s=calView==="week"?days[0]:viewDate; const e2=new Date(calView==="week"?days[6]:viewDate); e2.setDate(e2.getDate()+1);
      const evs=await fetchCalendarEvents(msToken.token,s,e2); setEvents(evs);
    }catch(e){ setAddStatus("error:"+e.message); }
  };

  const days=getWeekDays(viewDate);
  const today=new Date(); today.setHours(0,0,0,0);

  const getEventsForDay=(day)=>{
    return events.filter(ev=>{
      const evDay=new Date(ev.start.dateTime||ev.start.date); evDay.setHours(0,0,0,0);
      return evDay.toDateString()===day.toDateString();
    });
  };

  const eventColor="#6BA3FF";

  return(
    <div style={{padding:"0 20px 40px"}}>
      <div style={{borderTop:"1px solid #1a1a1a",paddingTop:18,marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <span style={{fontSize:9,color:"#444",letterSpacing:2}}>📅 OUTLOOK CALENDAR</span>
        {msToken&&(
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <button onClick={()=>setCalView("day")} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${calView==="day"?"#6BA3FF66":"#252525"}`,background:calView==="day"?"#6BA3FF22":"#181818",color:calView==="day"?"#6BA3FF":"#555",fontSize:10,cursor:"pointer",letterSpacing:1}}>DAY</button>
            <button onClick={()=>setCalView("week")} style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${calView==="week"?"#6BA3FF66":"#252525"}`,background:calView==="week"?"#6BA3FF22":"#181818",color:calView==="week"?"#6BA3FF":"#555",fontSize:10,cursor:"pointer",letterSpacing:1}}>WEEK</button>
            <button onClick={()=>setShowAddEvent(true)} style={{padding:"4px 12px",borderRadius:6,border:"1px solid #6BA3FF55",background:"#6BA3FF22",color:"#6BA3FF",fontSize:10,cursor:"pointer",letterSpacing:1}}>+ EVENT</button>
            <button onClick={()=>{ ls.set("yz-ms-token",null); setMsToken(null); }} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #333",background:"#181818",color:"#444",fontSize:10,cursor:"pointer"}}>Sign out</button>
          </div>
        )}
      </div>

      {/* Setup / Login */}
      {!msToken&&(
        <div style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:14,padding:24}}>
          {showSetup?(
            <>
              <p style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:"#fff",letterSpacing:1,marginBottom:4}}>Connect Outlook</p>
              <p style={{fontSize:11,color:"#555",marginBottom:20,lineHeight:1.6}}>You need a free Azure App Client ID to connect. See the setup guide below.</p>
              <div style={{marginBottom:14}}>
                <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:6}}>AZURE CLIENT ID</label>
                <input value={clientIdInput} onChange={e=>setClientIdInput(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={{width:"100%",background:"#1a1a1a",border:"1px solid #6BA3FF44",borderRadius:10,padding:"10px 14px",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
              </div>
              <button onClick={handleLogin} style={{width:"100%",padding:"13px 0",borderRadius:10,border:"1px solid #6BA3FF55",background:"#6BA3FF22",color:"#6BA3FF",fontFamily:"'Bebas Neue',cursive",fontSize:18,cursor:"pointer",letterSpacing:2,marginBottom:16}}>SIGN IN WITH MICROSOFT</button>
              <details style={{fontSize:10,color:"#555",lineHeight:1.8}}>
                <summary style={{cursor:"pointer",color:"#444",letterSpacing:1}}>SETUP GUIDE — HOW TO GET YOUR CLIENT ID</summary>
                <div style={{marginTop:12,paddingLeft:12,borderLeft:"2px solid #1e1e1e"}}>
                  <p style={{color:"#666",marginBottom:8}}>Takes ~5 minutes, completely free:</p>
                  <ol style={{paddingLeft:16,color:"#555"}}>
                    <li style={{marginBottom:6}}>Go to <span style={{color:"#6BA3FF"}}>portal.azure.com</span> and sign in with your Microsoft account</li>
                    <li style={{marginBottom:6}}>Search "App registrations" → click "New registration"</li>
                    <li style={{marginBottom:6}}>Name: anything (e.g. "Year Zero") · Supported account types: "Personal Microsoft accounts only"</li>
                    <li style={{marginBottom:6}}>Redirect URI: Select "Single-page application (SPA)" → paste your Vercel URL (e.g. https://yearzero.vercel.app)</li>
                    <li style={{marginBottom:6}}>Click Register → copy the "Application (client) ID" from the overview page</li>
                    <li style={{marginBottom:6}}>Paste it above and click Sign In</li>
                  </ol>
                </div>
              </details>
            </>
          ):(
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <p style={{fontSize:13,color:"#555",marginBottom:12}}>Connect your Outlook calendar to see events here</p>
              <button onClick={()=>setShowSetup(true)} style={{padding:"10px 24px",borderRadius:10,border:"1px solid #6BA3FF55",background:"#6BA3FF22",color:"#6BA3FF",fontSize:12,cursor:"pointer",letterSpacing:1}}>Connect Outlook →</button>
            </div>
          )}
        </div>
      )}

      {/* Add Event Modal */}
      {showAddEvent&&msToken&&(
        <div onClick={()=>setShowAddEvent(false)} style={{position:"fixed",inset:0,background:"#000d",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#141414",border:"1px solid #6BA3FF55",borderRadius:18,padding:28,width:"min(360px,94vw)"}}>
            <p style={{fontSize:9,color:"#555",letterSpacing:2,margin:"0 0 4px"}}>NEW EVENT</p>
            <p style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:"#fff",letterSpacing:1,margin:"0 0 20px"}}>Add to Calendar</p>
            {[
              {label:"TITLE",key:"title",placeholder:"e.g. Sales call with client",type:"text"},
              {label:"DATE",key:"date",placeholder:"",type:"date"},
            ].map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:5}}>{f.label}</label>
                <input type={f.type} value={newEvent[f.key]} onChange={e=>setNewEvent(v=>({...v,[f.key]:e.target.value}))} placeholder={f.placeholder} style={{width:"100%",background:"#1a1a1a",border:"1px solid #6BA3FF33",borderRadius:9,padding:"9px 12px",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit",colorScheme:"dark"}}/>
              </div>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {[{label:"START",key:"startTime"},{label:"END",key:"endTime"}].map(f=>(
                <div key={f.key}>
                  <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:5}}>{f.label}</label>
                  <input type="time" value={newEvent[f.key]} onChange={e=>setNewEvent(v=>({...v,[f.key]:e.target.value}))} style={{width:"100%",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:9,padding:"9px 12px",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit",colorScheme:"dark"}}/>
                </div>
              ))}
            </div>
            <div style={{marginBottom:20}}>
              <label style={{fontSize:10,color:"#555",letterSpacing:1,display:"block",marginBottom:5}}>NOTES <span style={{color:"#333"}}>(optional)</span></label>
              <input value={newEvent.notes} onChange={e=>setNewEvent(v=>({...v,notes:e.target.value}))} placeholder="Any notes..." style={{width:"100%",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:9,padding:"9px 12px",color:"#fff",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowAddEvent(false)} style={{flex:1,padding:"12px 0",borderRadius:10,border:"1px solid #2a2a2a",background:"#1a1a1a",color:"#555",fontSize:11,cursor:"pointer"}}>CANCEL</button>
              <button onClick={handleAddEvent} style={{flex:2,padding:"12px 0",borderRadius:10,border:"1px solid #6BA3FF55",background:"#6BA3FF20",color:addStatus==="saved"?"#00FF88":"#6BA3FF",fontFamily:"'Bebas Neue',cursive",fontSize:17,cursor:"pointer",letterSpacing:2}}>
                {addStatus==="saving"?"SAVING…":addStatus==="saved"?"✓ SAVED":addStatus?.startsWith("error")?"ERROR":"SAVE EVENT"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calendar View */}
      {msToken&&(
        <div>
          {/* Navigation */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <button onClick={()=>{const d=new Date(viewDate);d.setDate(d.getDate()-(calView==="week"?7:1));setViewDate(d);}} style={{width:30,height:30,borderRadius:7,border:"1px solid #252525",background:"#181818",color:"#888",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
            <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:16,color:"#ccc",letterSpacing:1,flex:1}}>
              {calView==="week"?`${fmt(days[0],{day:"numeric",month:"short"})} – ${fmt(days[6],{day:"numeric",month:"short",year:"numeric"})}`:`${fmt(viewDate,{weekday:"long",day:"numeric",month:"long",year:"numeric"})}`}
            </span>
            <button onClick={()=>setViewDate(new Date())} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #252525",background:"#181818",color:"#555",fontSize:10,cursor:"pointer",letterSpacing:1}}>TODAY</button>
            <button onClick={()=>{const d=new Date(viewDate);d.setDate(d.getDate()+(calView==="week"?7:1));setViewDate(d);}} style={{width:30,height:30,borderRadius:7,border:"1px solid #252525",background:"#181818",color:"#888",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
          </div>

          {loading&&<div style={{textAlign:"center",padding:32,color:"#444",fontSize:11,letterSpacing:2}}>LOADING…</div>}
          {error&&<div style={{textAlign:"center",padding:16,color:"#FF6B35",fontSize:11}}>{error}</div>}

          {/* Week View */}
          {!loading&&calView==="week"&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
              {days.map((day,i)=>{
                const dayEvents=getEventsForDay(day);
                const isToday=day.toDateString()===today.toDateString();
                return(
                  <div key={i} style={{background:isToday?"#6BA3FF0d":"#111",border:`1px solid ${isToday?"#6BA3FF44":"#1a1a1a"}`,borderRadius:10,padding:10,minHeight:100}}>
                    <div style={{marginBottom:8}}>
                      <div style={{fontSize:9,color:isToday?"#6BA3FF":"#444",letterSpacing:1}}>{dayNames[i]}</div>
                      <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:isToday?"#6BA3FF":"#ccc",letterSpacing:1}}>{day.getDate()}</div>
                    </div>
                    {dayEvents.length===0&&<div style={{fontSize:9,color:"#2a2a2a"}}>—</div>}
                    {dayEvents.map((ev,j)=>(
                      <div key={j} style={{background:eventColor+"22",border:`1px solid ${eventColor}44`,borderRadius:6,padding:"4px 7px",marginBottom:5}}>
                        <div style={{fontSize:10,color:eventColor,fontWeight:"bold",marginBottom:1,lineHeight:1.3}}>{ev.subject}</div>
                        {!ev.isAllDay&&<div style={{fontSize:9,color:"#666"}}>{fmtTime(ev.start.dateTime)}</div>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Day View */}
          {!loading&&calView==="day"&&(()=>{
            const dayEvents=getEventsForDay(viewDate).sort((a,b)=>new Date(a.start.dateTime||a.start.date)-new Date(b.start.dateTime||b.start.date));
            const isToday=viewDate.toDateString()===today.toDateString();
            return(
              <div style={{background:"#111",border:`1px solid ${isToday?"#6BA3FF33":"#1a1a1a"}`,borderRadius:12,padding:16}}>
                {dayEvents.length===0?(
                  <div style={{textAlign:"center",padding:32,color:"#333",fontSize:11}}>No events — enjoy the free time ✓</div>
                ):dayEvents.map((ev,i)=>(
                  <div key={i} style={{display:"flex",gap:14,paddingBottom:14,marginBottom:14,borderBottom:i<dayEvents.length-1?"1px solid #1a1a1a":"none",alignItems:"flex-start"}}>
                    <div style={{flexShrink:0,textAlign:"right",minWidth:50}}>
                      {!ev.isAllDay?(
                        <>
                          <div style={{fontSize:12,color:eventColor,fontWeight:"bold"}}>{fmtTime(ev.start.dateTime)}</div>
                          <div style={{fontSize:9,color:"#444"}}>→ {fmtTime(ev.end.dateTime)}</div>
                        </>
                      ):<div style={{fontSize:10,color:eventColor}}>All day</div>}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,color:"#ddd",fontWeight:"bold",marginBottom:4}}>{ev.subject}</div>
                      {ev.bodyPreview&&ev.bodyPreview.length>0&&<div style={{fontSize:11,color:"#555",lineHeight:1.5}}>{ev.bodyPreview.slice(0,120)}{ev.bodyPreview.length>120?"…":""}</div>}
                    </div>
                    <div style={{width:4,background:eventColor,borderRadius:2,alignSelf:"stretch",flexShrink:0}}/>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App(){
  const today=new Date();
  const start=new Date(today.getFullYear(),0,1);
  const weekNum=Math.ceil(((today-start)/86400000+1)/7);
  const currentQ=Math.min(Math.ceil(weekNum/13),4);
  const dayLabel=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][today.getDay()];
  const WEEK_KEY=getWeekKey();

  const [sections,setSections]=useState(()=>ls.get("yz-sections")||DEFAULT_SECTIONS);
  const [checks,setChecks]=useState(()=>emptyChecks(ls.get("yz-sections")||DEFAULT_SECTIONS));
  const [actuals,setActuals]=useState(()=>emptyActuals(ls.get("yz-sections")||DEFAULT_SECTIONS));
  const [sched,setSched]=useState(()=>ls.get("yz-sched")||DEFAULT_SCHED);
  const [history,setHistory]=useState({});
  const [checkins,setCheckins]=useState({});
  const [saveFlash,setSaveFlash]=useState(false);
  const [showHistory,setShowHistory]=useState(false);
  const [editMode,setEditMode]=useState(false);
  const [page,setPage]=useState("dashboard");
  const [showCheckin,setShowCheckin]=useState(false);

  useEffect(()=>{
    const wd=ls.get(WEEK_KEY);
    if(wd?.checks) setChecks(wd.checks);
    if(wd?.actuals) setActuals(wd.actuals);
    setHistory(ls.get("yz-history")||{});
    const ci=ls.get("yz-checkins")||{};
    setCheckins(ci);
    if(!ci[WEEK_KEY]) setTimeout(()=>setShowCheckin(true),800);
  },[]);

  const flash=()=>{setSaveFlash(true);setTimeout(()=>setSaveFlash(false),1400);};

  const persist=useCallback((nc,na,sec)=>{
    const wd={checks:nc,actuals:na,savedAt:Date.now(),sectionSnapshot:sec};
    ls.set(WEEK_KEY,wd);
    const newHist={...history,[WEEK_KEY]:wd};
    const trimmed=Object.fromEntries(Object.keys(newHist).sort().reverse().slice(0,52).map(k=>[k,newHist[k]]));
    ls.set("yz-history",trimmed); setHistory(trimmed); flash();
  },[history,WEEK_KEY]);

  const handleCheck=(sec,idx)=>{const next={...checks,[sec]:checks[sec].map((v,i)=>i===idx?!v:v)};setChecks(next);persist(next,actuals,sections);};
  const handleSave=(sec,idx,val)=>{const next={...actuals,[sec]:actuals[sec].map((v,i)=>i===idx?val:v)};setActuals(next);persist(checks,next,sections);};
  const handleUpdateSection=(secKey,newSection)=>{
    const newSections={...sections,[secKey]:newSection}; setSections(newSections); ls.set("yz-sections",newSections);
    const newChecks={...checks,[secKey]:newSection.daily.map((_,i)=>checks[secKey]?.[i]||false)};
    const newActuals={...actuals,[secKey]:newSection.weekly.map((_,i)=>actuals[secKey]?.[i]??null)};
    setChecks(newChecks); setActuals(newActuals); persist(newChecks,newActuals,newSections);
  };
  const handleUpdateSched=(newSched)=>{setSched(newSched);ls.set("yz-sched",newSched);flash();};
  const handleCheckinSave=(data)=>{const newCi={...checkins,[WEEK_KEY]:data};setCheckins(newCi);ls.set("yz-checkins",newCi);setShowCheckin(false);flash();};

  const allDaily=Object.keys(sections).flatMap(k=>(checks[k]||[]));
  const dailyDone=allDaily.filter(Boolean).length;
  const dailyPct=allDaily.length>0?Math.round((dailyDone/allDaily.length)*100):0;
  const topColor=dailyPct>=75?"#00FF88":dailyPct>=45?"#FFD700":"#FF6B35";
  const pastWeeks=Object.keys(history).filter(k=>k!==WEEK_KEY).length;
  const checkinDone=!!checkins[WEEK_KEY];

  if(page==="progress") return <ProgressPage checkins={checkins} onBack={()=>setPage("dashboard")} weekNum={weekNum}/>;

  return(
    <div style={{minHeight:"100vh",background:"#0a0a0a",color:"#fff",fontFamily:"'DM Mono',monospace"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@300;400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0a0a0a;overscroll-behavior:none;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-track{background:#111;} ::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:2px;}
        button{font-family:inherit;transition:opacity 0.15s;} button:hover{opacity:0.82;} button:active{opacity:0.65;transform:scale(0.97);}
        input{font-family:inherit;} input::placeholder{color:#444;}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.5);}
        input[type=time]::-webkit-calendar-picker-indicator{filter:invert(0.5);}
      `}</style>

      {showHistory&&<HistoryModal history={history} sectionKeys={Object.keys(sections)} onClose={()=>setShowHistory(false)}/>}
      {showCheckin&&<CheckInModal weekNum={weekNum} existing={checkins[WEEK_KEY]} onSave={handleCheckinSave} onDismiss={()=>setShowCheckin(false)}/>}

      <div style={{position:"fixed",bottom:20,right:20,zIndex:5000,background:"#141414",border:"1px solid #00FF8855",borderRadius:10,padding:"9px 16px",fontSize:11,color:"#00FF88",letterSpacing:1,transition:"opacity 0.3s",opacity:saveFlash?1:0,pointerEvents:"none"}}>✓ Saved</div>

      {editMode&&<div style={{background:"#1a0a00",borderBottom:"1px solid #FF6B3533",padding:"8px 20px",textAlign:"center",fontSize:10,color:"#FF6B35",letterSpacing:2}}>EDIT MODE ON · Changes apply going forward · Past weeks unchanged</div>}

      {/* Top bar */}
      <div style={{borderBottom:"1px solid #1a1a1a",padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:editMode?33:0,background:"#0a0a0a",zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:24,letterSpacing:3,color:"#fff"}}>LIFT OFF YEAR</span>
          <span style={{background:"#00FF8812",border:"1px solid #00FF8830",borderRadius:6,padding:"3px 9px",fontSize:10,color:"#00FF88",letterSpacing:2}}>Q{currentQ}</span>
          <button onClick={()=>setShowHistory(true)} style={{background:"#181818",border:"1px solid #252525",borderRadius:7,padding:"4px 11px",cursor:"pointer",fontSize:10,color:"#555",letterSpacing:1}}>HISTORY {pastWeeks>0?`· ${pastWeeks}wk`:""}</button>
          <button onClick={()=>setPage("progress")} style={{background:"#181818",border:"1px solid #252525",borderRadius:7,padding:"4px 11px",cursor:"pointer",fontSize:10,color:"#A78BFA",letterSpacing:1}}>📈 PROGRESS</button>
          <button onClick={()=>setShowCheckin(true)} style={{background:checkinDone?"#00FF8812":"#181818",border:`1px solid ${checkinDone?"#00FF8833":"#252525"}`,borderRadius:7,padding:"4px 11px",cursor:"pointer",fontSize:10,color:checkinDone?"#00FF88":"#555",letterSpacing:1}}>{checkinDone?"✓ CHECKED IN":"CHECK IN"}</button>
          <button onClick={()=>setEditMode(e=>!e)} style={{background:editMode?"#FF6B3522":"#181818",border:`1px solid ${editMode?"#FF6B3566":"#252525"}`,borderRadius:7,padding:"4px 11px",cursor:"pointer",fontSize:10,color:editMode?"#FF6B35":"#555",letterSpacing:1}}>{editMode?"✓ DONE EDITING":"✏ EDIT"}</button>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:8,color:"#444",letterSpacing:2}}>TODAY</div>
            <div style={{fontSize:11,color:"#aaa"}}>{dayLabel.toUpperCase()} · WK {weekNum}</div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:8,color:"#444",letterSpacing:2}}>DAILY</div>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color:topColor,letterSpacing:1}}>{dailyPct}%</div>
          </div>
          <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Ring pct={dailyPct} color={topColor} size={42}/>
            <span style={{position:"absolute",fontSize:8,color:"#fff",fontWeight:700}}>{dailyDone}/{allDaily.length}</span>
          </div>
        </div>
      </div>

      {/* Quarters */}
      <div style={{padding:"12px 20px 0",display:"flex",gap:6}}>
        {["Q1","Q2","Q3","Q4"].map((q,i)=>{
          const active=i+1===currentQ;
          return(
            <div key={q} style={{flex:1,background:active?"#00FF8810":"#111",border:`1px solid ${active?"#00FF8838":"#1a1a1a"}`,borderRadius:8,padding:"8px 10px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:16,color:active?"#00FF88":"#333",letterSpacing:1}}>{q}</span>
                {i+1<currentQ&&<span style={{color:"#00FF88",fontSize:10}}>✓</span>}
                {active&&<span style={{color:"#00FF88",fontSize:8,letterSpacing:1}}>NOW</span>}
              </div>
              <div style={{fontSize:9,color:active?"#777":"#2a2a2a",marginTop:1,lineHeight:1.3}}>{Q_THEMES[i]}</div>
            </div>
          );
        })}
      </div>

      {/* Year progress */}
      <div style={{padding:"10px 20px 0",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:8,color:"#333",letterSpacing:2,flexShrink:0}}>WK {weekNum}/52</span>
        <div style={{flex:1,height:3,background:"#1a1a1a",borderRadius:2,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${(weekNum/52)*100}%`,background:"linear-gradient(90deg,#00FF88,#A78BFA)",borderRadius:2}}/>
        </div>
        <span style={{fontSize:8,color:"#333",letterSpacing:1,flexShrink:0}}>{Math.round((weekNum/52)*100)}%</span>
      </div>

      {/* Goal cards */}
      <div style={{padding:20,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16}}>
        {Object.keys(sections).map(key=>(
          <GoalCard key={key} sectionKey={key} section={sections[key]}
            checks={checks[key]||[]} onCheck={handleCheck}
            actuals={actuals[key]||[]} onSave={handleSave}
            editMode={editMode} onUpdateSection={handleUpdateSection}/>
        ))}
      </div>

      {/* Schedule */}
      <ScheduleSection sched={sched} onUpdate={handleUpdateSched} editMode={editMode}/>

      {/* Outlook Calendar */}
      <CalendarSection/>

      <div style={{borderTop:"1px solid #1a1a1a",padding:"12px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <span style={{fontSize:9,color:"#222",letterSpacing:1}}>LIFT OFF YEAR · INPUT-BASED SYSTEM · DATA SAVED LOCALLY</span>
        <div style={{display:"flex",gap:14}}>
          {Object.values(sections).map(s=>(
            <div key={s.label} style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{color:s.color,fontSize:9}}>{s.icon}</span>
              <span style={{fontSize:9,color:"#333"}}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
