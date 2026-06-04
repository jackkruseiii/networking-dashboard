import React, { useState, useMemo } from "react";

// Calls our own Vercel serverless function — same origin, zero CORS issues.
// The serverless function calls Google Apps Script from the server side.
async function postToSheet(type, data) {
  try {
    const res = await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, data }),
    });
    return res.ok;
  } catch (err) {
    console.error("Sheet sync failed:", err);
    return false;
  }
}

const SEED = [
  {fn:"Don",ln:"Bergin",industry:"Government",company:"Veteran Affairs",linkedin:"https://www.linkedin.com/in/don-bergin/",email:"",rel:"Woodbery",city:"Baltimore",state:"MD",ug:"UNC",grad:"Catholic",status:"Active",lc:"2026-03-20",nc:"2026-06-18",notes:"Linkedin message"},
  {fn:"Nick",ln:"Breedlove",industry:"Finance",company:"BKK",linkedin:"https://www.linkedin.com/in/nickbreedlove/",email:"",rel:"USNA Classmate",city:"Forth Worth",state:"TX",ug:"USNA",grad:"Harvard",status:"Active",lc:"2026-04-24",nc:"2026-07-23",notes:"Linkedin message"},
  {fn:"Ted",ln:"Bradfield",industry:"Contractor Defense",company:"",linkedin:"https://www.linkedin.com/in/ted-bradfield-43935727/",email:"",rel:"",city:"",state:"",ug:"",grad:"",status:"Active",lc:"2026-03-20",nc:"2026-06-18",notes:""},
  {fn:"Dereck",ln:"Brown",industry:"Education",company:"USNA",linkedin:"https://www.linkedin.com/in/dereckbrown/",email:"",rel:"USNA and FAO",city:"Arlington",state:"VA",ug:"USNA",grad:"NPS",status:"Active",lc:"2026-03-05",nc:"2026-06-03",notes:""},
  {fn:"Cory",ln:"Christensen",industry:"FMS/Security Cooperation",company:"PEO C4I",linkedin:"",email:"cory.c.christensen32.civ@us.navy.mil",rel:"FAO and former A/NAVSEC Brazil",city:"San Diego",state:"CA",ug:"USNA",grad:"N/A",status:"Active",lc:"2025-08-20",nc:"2025-11-18",notes:"Just casual check in and link up"},
  {fn:"Tim",ln:"Disher",industry:"Education",company:"RETIRED",linkedin:"https://www.linkedin.com/in/timothy-disher-2ba530119/",email:"",rel:"",city:"",state:"",ug:"",grad:"",status:"Active",lc:"2025-10-31",nc:"2026-01-29",notes:""},
  {fn:"Jay",ln:"Furman",industry:"",company:"",linkedin:"",email:"",rel:"FAO",city:"",state:"TX",ug:"",grad:"",status:"Active",lc:"2026-05-15",nc:"2026-08-13",notes:""},
  {fn:"Jeff",ln:"Gilbert",industry:"Tech",company:"Independent",linkedin:"https://www.linkedin.com/in/jeffbgilbert/",email:"",rel:"Woodberry",city:"Falls Church",state:"VA",ug:"JMU",grad:"N/A",status:"Active",lc:"2026-04-11",nc:"2026-07-10",notes:"Short email"},
  {fn:"Jimmy",ln:"Hilton",industry:"Defense Sales",company:"Joint Munitions Command",linkedin:"https://www.linkedin.com/in/jameshilton99/",email:"",rel:"FAO, USNA, old boss",city:"",state:"",ug:"USNA",grad:"",status:"Active",lc:"2024-07-24",nc:"2024-10-22",notes:""},
  {fn:"Paul",ln:"Ross",industry:"Architecture",company:"DBI Projects",linkedin:"https://www.linkedin.com/in/harrypaulross/",email:"",rel:"Woodberry",city:"Hastings on Hudson",state:"NY",ug:"",grad:"",status:"Active",lc:"2025-07-25",nc:"2025-10-23",notes:""},
  {fn:"Andrew",ln:"Roy",industry:"Management",company:"HAVOC AI",linkedin:"https://www.linkedin.com/in/andrewroy2001/",email:"",rel:"USNA, friend",city:"",state:"",ug:"",grad:"",status:"Active",lc:"2026-03-26",nc:"2026-06-24",notes:""},
  {fn:"Patrick",ln:"Sullivan",industry:"Defense",company:"USNA",linkedin:"",email:"",rel:"USNA, friend",city:"Annapolis",state:"",ug:"",grad:"",status:"Active",lc:"2026-04-23",nc:"2026-07-22",notes:""},
  {fn:"Jared",ln:"Wilhelm",industry:"AI",company:"USNA",linkedin:"https://www.linkedin.com/in/jaredmwilhelm/",email:"",rel:"FAO",city:"Alexandria",state:"VA",ug:"USNA",grad:"",status:"Active",lc:"2025-11-07",nc:"2026-02-05",notes:""},
  {fn:"Cal",ln:"Worthington",industry:"Defense Sales Biz Dev",company:"Standard Aero",linkedin:"https://www.linkedin.com/in/scott-worthington18/",email:"",rel:"USNA FAO",city:"",state:"",ug:"",grad:"",status:"Active",lc:"2025-02-27",nc:"2025-05-28",notes:""},
  {fn:"Jean",ln:"Dupin de St. Cyr",industry:"Education and Leadership",company:"CAVU International & Lecturer",linkedin:"https://www.linkedin.com/in/jean-dupin-de-saint-cyr-4b717385/",email:"",rel:"Navy FAO",city:"France",state:"France",ug:"USNA",grad:"NPS",status:"Active",lc:"2026-04-25",nc:"2026-07-24",notes:""},
  {fn:"Tom",ln:"Kim",industry:"Education",company:"UT Dallas",linkedin:"https://www.linkedin.com/in/tomckim/",email:"",rel:"",city:"Lewisville",state:"TX",ug:"USNA",grad:"",status:"Never Contacted",lc:"",nc:"",notes:"Christian (volunteering)"},
  {fn:"Angus",ln:"Mccoll",industry:"Education and Fundraising",company:"University of North Texas",linkedin:"https://www.linkedin.com/in/angus-mccoll-0691b18/",email:"",rel:"",city:"Denton",state:"TX",ug:"USNA",grad:"NPS",status:"Never Contacted",lc:"",nc:"",notes:""},
  {fn:"Todd",ln:"Waldvogel",industry:"Education",company:"TCU",linkedin:"https://www.linkedin.com/in/todd-waldvogel-p-e-b647903/",email:"",rel:"",city:"Ft. Worth",state:"TX",ug:"USAFA",grad:"Texas A&M",status:"Never Contacted",lc:"",nc:"",notes:""},
  {fn:"Michael",ln:"Grohman",industry:"Education",company:"TCU",linkedin:"https://www.linkedin.com/in/michael-grohman-z/",email:"",rel:"",city:"DFW",state:"TX",ug:"",grad:"Arizona State / U of Charleston",status:"Never Contacted",lc:"",nc:"",notes:"Big Country Vets"},
];

const TODAY = new Date("2026-06-03");
const THRESHOLD = 90;
const AV = {
  cold:    { bg:"#E6F1FB", color:"#0C447C" },
  overdue: { bg:"#FAEEDA", color:"#633806" },
  active:  { bg:"#EAF3DE", color:"#3B6D11" },
};
const COL   = { cold:"#185FA5", overdue:"#854F0B", active:"#3B6D11" };
const BADGE = {
  never:   { background:"#f5f5f3", border:"1px solid #ddd",    color:"#999"    },
  overdue: { background:"#FAEEDA", border:"1px solid #EF9F27", color:"#854F0B" },
  recent:  { background:"#EAF3DE", border:"1px solid #97C459", color:"#3B6D11" },
};

function pd(s) { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d; }
function ds(d) { return Math.floor((TODAY - d) / 86400000); }
function fd(d) { return d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }); }
function ini(c) { return ((c.fn||"").charAt(0) + (c.ln||"").charAt(0)).toUpperCase() || "?"; }
function lcCls(d, type) {
  if (!d) return "never";
  if (type === "overdue") return "overdue";
  if (type === "cold")    return "never";
  return ds(d) >= THRESHOLD ? "overdue" : "recent";
}

function LastContactBadge({ c, type }) {
  const d = pd(c.lc);
  if (!d) return (
    <div style={{ fontSize:11, padding:"5px 9px", borderRadius:7, ...BADGE.never, width:"fit-content", marginBottom:9 }}>
      No interaction on record
    </div>
  );
  const days  = ds(d);
  const label = days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, padding:"5px 9px", borderRadius:7, ...BADGE[lcCls(d,type)], width:"fit-content", marginBottom:9 }}>
      <span style={{ fontWeight:500 }}>{fd(d)}</span>
      <span style={{ opacity:.75 }}>— {label}</span>
    </div>
  );
}

function ContactCard({ c, idx, type, onOpen, sessionNotes, setSessionNotes }) {
  const key = `${type}-${c.fn}-${c.ln}-${idx}`;
  const av  = AV[type];
  const loc = [c.city, c.state].filter(Boolean).join(", ");
  const [showSave, setShowSave] = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [syncing,  setSyncing]  = useState(false);
  const note = sessionNotes[key] || "";

  async function handleSaveNote() {
    setShowSave(false);
    setSyncing(true);
    const ok = await postToSheet("note", {
      firstName: c.fn,
      lastName:  c.ln,
      note:      sessionNotes[key] || "",
      timestamp: new Date().toISOString(),
    });
    setSyncing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ background:"#fff", border:"0.5px solid #e0e0de", borderRadius:12, padding:"14px 16px", marginBottom:10 }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "#bbb"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "#e0e0de"}>

      <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:9, cursor:"pointer" }} onClick={() => onOpen(c, type)}>
        <div style={{ width:34, height:34, minWidth:34, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:600, background:av.bg, color:av.color }}>
          {ini(c)}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:600, lineHeight:1.2, marginBottom:2 }}>{c.fn} {c.ln}</div>
          <div style={{ fontSize:11, color:"#777" }}>{c.rel || (c.company || "—")}</div>
        </div>
      </div>

      <LastContactBadge c={c} type={type} />

      {(c.industry || c.company || loc) && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:9 }}>
          {c.industry && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, border:"0.5px solid #e0e0de", color:"#666", background:"#f9f9f7" }}>{c.industry}</span>}
          {c.company  && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, border:"0.5px solid #e0e0de", color:"#666", background:"#f9f9f7" }}>{c.company}</span>}
          {loc        && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, border:"0.5px solid #e0e0de", color:"#666", background:"#f9f9f7" }}>📍 {loc}</span>}
        </div>
      )}

      <div style={{ display:"flex", gap:6, marginBottom:9, flexWrap:"wrap" }}>
        <button onClick={() => onOpen(c, type)} style={{ fontSize:11, padding:"3px 9px", borderRadius:6, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>View profile</button>
        {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" style={{ fontSize:11, padding:"3px 9px", borderRadius:6, border:"0.5px solid #ccc", color:"#555", textDecoration:"none" }}>LinkedIn</a>}
        {c.email    && <a href={`mailto:${c.email}`} style={{ fontSize:11, padding:"3px 9px", borderRadius:6, border:"0.5px solid #ccc", color:"#555", textDecoration:"none" }}>Email</a>}
      </div>

      {c.notes && (
        <div style={{ fontSize:11, color:"#666", marginBottom:8, padding:"5px 8px", background:"#f9f9f7", borderRadius:6, borderLeft:"2px solid #ddd", lineHeight:1.5 }}>
          <div style={{ fontSize:10, color:"#999", marginBottom:2 }}>Prior note</div>
          {c.notes}
        </div>
      )}

      <textarea
        value={note}
        onChange={e => { setSessionNotes(p => ({ ...p, [key]: e.target.value })); setShowSave(true); }}
        onFocus={() => setShowSave(true)}
        placeholder="Log a new note…"
        rows={2}
        style={{ width:"100%", fontSize:12, padding:"7px 9px", border:"0.5px solid #e0e0de", borderRadius:7, resize:"vertical", minHeight:50, fontFamily:"inherit", background:"#f9f9f7", color:"#222", lineHeight:1.5, outline:"none", boxSizing:"border-box" }}
      />
      {showSave && (
        <button onClick={handleSaveNote} disabled={syncing} style={{ marginTop:5, fontSize:11, padding:"3px 10px", borderRadius:6, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>
          {syncing ? "Saving…" : "Save note"}
        </button>
      )}
      {saved && <div style={{ fontSize:10, color:"#3B6D11", marginTop:3 }}>✓ Saved to sheet</div>}
    </div>
  );
}

function DetailPanel({ c, type, onClose, sessionNotes, setSessionNotes }) {
  const [saved,   setSaved]   = useState(false);
  const [syncing, setSyncing] = useState(false);
  if (!c) return null;
  const av  = AV[type] || AV.active;
  const d   = pd(c.lc), nd = pd(c.nc);
  const loc = [c.city, c.state].filter(Boolean).join(", ");
  const cls = lcCls(d, type);
  const days = d ? ds(d) : null;
  const dl   = days === null ? null : days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
  const noteKey = `detail-${c.fn}-${c.ln}`;
  const note    = sessionNotes[noteKey] || "";

  async function handleSaveNote() {
    setSyncing(true);
    await postToSheet("note", {
      firstName: c.fn,
      lastName:  c.ln,
      note,
      timestamp: new Date().toISOString(),
    });
    setSyncing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function InfoItem({ label, value }) {
    return (
      <div style={{ background:"#f9f9f7", borderRadius:8, padding:"8px 10px" }}>
        <div style={{ fontSize:10, color:"#999", textTransform:"uppercase", letterSpacing:".04em", marginBottom:2 }}>{label}</div>
        <div style={{ fontSize:13, color:value ? "#222" : "#bbb", fontStyle:value ? "normal" : "italic" }}>{value || "—"}</div>
      </div>
    );
  }

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:16, border:"0.5px solid #e0e0de", width:"min(560px,100%)", maxHeight:"85vh", overflowY:"auto", padding:24 }}>

        <div style={{ display:"flex", alignItems:"flex-start", gap:14, marginBottom:18 }}>
          <div style={{ width:52, height:52, minWidth:52, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:600, background:av.bg, color:av.color }}>{ini(c)}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:20, fontWeight:600, marginBottom:3 }}>{c.fn} {c.ln}</div>
            <div style={{ fontSize:13, color:"#777" }}>{c.rel || (c.company || "—")}</div>
          </div>
          <button onClick={onClose} style={{ background:"transparent", border:"0.5px solid #ccc", borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:12, color:"#666" }}>✕ Close</button>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, padding:"5px 10px", borderRadius:8, marginBottom:16, ...BADGE[cls], width:"fit-content" }}>
          {d ? <><span style={{ fontWeight:500 }}>Last contact: {fd(d)}</span><span style={{ opacity:.75 }}>— {dl}</span></> : <span>No interaction on record</span>}
        </div>

        {(c.linkedin || c.email) && (
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
            {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:"0.5px solid #ccc", color:"#555", textDecoration:"none" }}>LinkedIn ↗</a>}
            {c.email    && <a href={`mailto:${c.email}`} style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:"0.5px solid #ccc", color:"#555", textDecoration:"none" }}>{c.email}</a>}
          </div>
        )}

        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:500, color:"#aaa", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8 }}>Details</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <InfoItem label="Status"        value={c.status}   />
            <InfoItem label="Industry"      value={c.industry} />
            <InfoItem label="Company"       value={c.company}  />
            <InfoItem label="Location"      value={loc}        />
            <InfoItem label="Undergrad"     value={c.ug}       />
            <InfoItem label="Grad school"   value={c.grad}     />
            <InfoItem label="Last check-in" value={d  ? fd(d)  : ""} />
            <InfoItem label="Next check-in" value={nd ? fd(nd) : ""} />
          </div>
        </div>

        {c.notes && (
          <div style={{ marginBottom:18 }}>
            <div style={{ fontSize:11, fontWeight:500, color:"#aaa", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8 }}>Prior note</div>
            <div style={{ fontSize:13, color:"#555", padding:"8px 12px", background:"#f9f9f7", borderRadius:8, borderLeft:"2px solid #ddd", lineHeight:1.6 }}>{c.notes}</div>
          </div>
        )}

        <div>
          <div style={{ fontSize:11, fontWeight:500, color:"#aaa", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8 }}>Log a note</div>
          <textarea
            value={note}
            onChange={e => setSessionNotes(p => ({ ...p, [noteKey]: e.target.value }))}
            placeholder="Add a note about this interaction…"
            rows={3}
            style={{ width:"100%", fontSize:13, padding:"8px 10px", border:"0.5px solid #e0e0de", borderRadius:8, resize:"vertical", minHeight:70, fontFamily:"inherit", background:"#f9f9f7", color:"#222", lineHeight:1.5, outline:"none", boxSizing:"border-box" }}
          />
          <button onClick={handleSaveNote} disabled={syncing} style={{ marginTop:6, fontSize:12, padding:"5px 14px", borderRadius:7, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>
            {syncing ? "Saving…" : "Save note"}
          </button>
          {saved && <span style={{ fontSize:11, color:"#3B6D11", marginLeft:8 }}>✓ Saved to sheet</span>}
        </div>
      </div>
    </div>
  );
}

function NewContactModal({ onClose, onAdd }) {
  const empty = { fn:"", ln:"", company:"", industry:"", rel:"", status:"Never Contacted", city:"", state:"", linkedin:"", email:"", ug:"", grad:"", lc:"", nc:"", notes:"" };
  const [form,    setForm]    = useState(empty);
  const [errors,  setErrors]  = useState({});
  const [syncing, setSyncing] = useState(false);

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function submit() {
    const errs = {};
    if (!form.fn.trim()) errs.fn = "Required";
    if (!form.ln.trim()) errs.ln = "Required";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const newContact = { ...form, fn: form.fn.trim(), ln: form.ln.trim() };
    onAdd(newContact);
    setSyncing(true);
    await postToSheet("new_contact", newContact);
    setSyncing(false);
    onClose();
  }

  const inp = { fontSize:13, padding:"8px 10px", border:"0.5px solid #e0e0de", borderRadius:8, background:"#f9f9f7", color:"#222", fontFamily:"inherit", outline:"none", width:"100%", boxSizing:"border-box" };
  const lbl = { fontSize:11, fontWeight:500, color:"#666", textTransform:"uppercase", letterSpacing:".04em", marginBottom:4, display:"block" };

  function Field({ label, k, type="text", placeholder="" }) {
    return (
      <div style={{ display:"flex", flexDirection:"column" }}>
        <label style={lbl}>{label}</label>
        <input type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder}
          style={{ ...inp, borderColor: errors[k] ? "#E24B4A" : "#e0e0de" }} />
        {errors[k] && <div style={{ fontSize:11, color:"#A32D2D", marginTop:2 }}>{errors[k]}</div>}
      </div>
    );
  }

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:16, border:"0.5px solid #e0e0de", width:"min(580px,100%)", maxHeight:"90vh", overflowY:"auto", padding:24 }}>

        <div style={{ display:"flex", alignItems:"flex-start", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:19, fontWeight:600, marginBottom:3 }}>New contact</div>
            <div style={{ fontSize:13, color:"#777" }}>Add someone to your network</div>
          </div>
          <button onClick={onClose} style={{ marginLeft:"auto", background:"transparent", border:"0.5px solid #ccc", borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:12, color:"#666" }}>✕ Close</button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
          <Field label="First name *" k="fn"       placeholder="Jane" />
          <Field label="Last name *"  k="ln"       placeholder="Smith" />
          <Field label="Company"      k="company"  placeholder="Acme Corp" />
          <Field label="Industry"     k="industry" placeholder="Defense, Tech…" />
          <Field label="Relationship" k="rel"      placeholder="USNA classmate, FAO…" />
          <div style={{ display:"flex", flexDirection:"column" }}>
            <label style={lbl}>Status</label>
            <select value={form.status} onChange={e => set("status", e.target.value)} style={{ ...inp, cursor:"pointer" }}>
              <option value="Never Contacted">Never Contacted</option>
              <option value="Active">Active</option>
            </select>
          </div>
          <Field label="City"          k="city"     placeholder="Arlington" />
          <Field label="State"         k="state"    placeholder="VA" />
          <Field label="LinkedIn URL"  k="linkedin" type="url"   placeholder="https://linkedin.com/in/…" />
          <Field label="Email"         k="email"    type="email" placeholder="jane@example.com" />
          <Field label="Undergrad"     k="ug"       placeholder="USNA" />
          <Field label="Grad school"   k="grad"     placeholder="Harvard" />
          <Field label="Last check-in" k="lc"       type="date" />
          <Field label="Next check-in" k="nc"       type="date" />
          <div style={{ gridColumn:"1/-1", display:"flex", flexDirection:"column" }}>
            <label style={lbl}>Notes</label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
              placeholder="How you know them, talking points…" rows={3}
              style={{ ...inp, resize:"vertical", minHeight:64 }} />
          </div>
        </div>

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", paddingTop:12, borderTop:"0.5px solid #eee" }}>
          <button onClick={onClose} style={{ fontSize:13, padding:"7px 16px", borderRadius:8, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>Cancel</button>
          <button onClick={submit} disabled={syncing} style={{ fontSize:13, fontWeight:500, padding:"7px 18px", borderRadius:8, border:"none", background:"#1a1a18", color:"#fff", cursor:"pointer" }}>
            {syncing ? "Saving…" : "Add contact"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NetworkingDashboard() {
  const [contacts,     setContacts]     = useState(SEED);
  const [selected,     setSelected]     = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [showNew,      setShowNew]      = useState(false);
  const [query,        setQuery]        = useState("");
  const [sessionNotes, setSessionNotes] = useState({});

  const { cold, overdue, active } = useMemo(() => {
    const q    = query.toLowerCase().trim();
    const list = q
      ? contacts.filter(c => [c.fn,c.ln,c.company,c.industry,c.rel,c.city,c.state,c.notes].join(" ").toLowerCase().includes(q))
      : contacts;
    const cold    = list.filter(c => c.status === "Never Contacted");
    const allAct  = list.filter(c => c.status === "Active");
    const overdue = allAct.filter(c => { const d = pd(c.lc); return d && ds(d) >= THRESHOLD; }).sort((a,b) => new Date(a.lc) - new Date(b.lc));
    const active  = allAct.filter(c => { const d = pd(c.lc); return !d || ds(d) < THRESHOLD;  }).sort((a,b) => new Date(b.lc) - new Date(a.lc));
    return { cold, overdue, active };
  }, [contacts, query]);

  const columns = [
    { key:"cold",    title:"Cold Outreach", icon:"✉️", contacts:cold    },
    { key:"overdue", title:"Overdue",       icon:"⏰", contacts:overdue },
    { key:"active",  title:"Active",        icon:"✅", contacts:active  },
  ];

  const colBadgeStyle = {
    cold:    { background:"#E6F1FB", color:"#185FA5" },
    overdue: { background:"#FAEEDA", color:"#854F0B" },
    active:  { background:"#EAF3DE", color:"#3B6D11" },
  };

  return (
    <div style={{ fontFamily:"Georgia,serif", background:"#fafaf8", minHeight:"100vh", paddingBottom:"3rem" }}>

      <div style={{ background:"#fff", borderBottom:"0.5px solid #e8e8e4", padding:"16px 24px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", marginBottom:20 }}>
        <div style={{ marginRight:4 }}>
          <div style={{ fontSize:19, fontWeight:700, letterSpacing:"-.02em", color:"#1a1a18" }}>Networking Dashboard</div>
          <div style={{ fontSize:12, color:"#999", marginTop:1 }}>{contacts.length} contacts total</div>
        </div>

        <div style={{ flex:1, minWidth:180, maxWidth:320, position:"relative" }}>
          <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:14, color:"#aaa", pointerEvents:"none" }}>🔍</span>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name, company, industry…"
            style={{ width:"100%", fontSize:13, padding:"7px 10px 7px 32px", border:"0.5px solid #e0e0de", borderRadius:8, background:"#f9f9f7", color:"#222", fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}
            onFocus={e => e.target.style.borderColor = "#999"}
            onBlur={e  => e.target.style.borderColor = "#e0e0de"}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", cursor:"pointer", fontSize:14, color:"#aaa", padding:0, lineHeight:1 }}>✕</button>
          )}
        </div>

        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {columns.map(col => (
            <div key={col.key} style={{ fontSize:12, padding:"4px 11px", borderRadius:20, fontWeight:600, ...colBadgeStyle[col.key] }}>
              {col.contacts.length} {col.title}
            </div>
          ))}
        </div>

        <button onClick={() => setShowNew(true)} style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:13, fontWeight:500, padding:"7px 16px", borderRadius:8, border:"none", background:"#1a1a18", color:"#fff", cursor:"pointer", whiteSpace:"nowrap" }}>
          + New contact
        </button>
      </div>

      {query && (
        <div style={{ padding:"0 24px 12px", fontSize:12, color:"#999" }}>
          Showing {cold.length + overdue.length + active.length} of {contacts.length} contacts for "{query}"
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:20, padding:"0 24px" }}>
        {columns.map(col => (
          <div key={col.key} style={{ minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, paddingBottom:12, borderBottom:"0.5px solid #e8e8e4" }}>
              <span>{col.icon}</span>
              <span style={{ fontSize:12, fontWeight:600, letterSpacing:".06em", textTransform:"uppercase", color:COL[col.key], flex:1 }}>{col.title}</span>
              <span style={{ fontSize:12, background:"#f5f5f3", border:"0.5px solid #e0e0de", borderRadius:20, padding:"2px 9px", color:"#777" }}>{col.contacts.length}</span>
            </div>
            {col.contacts.length === 0
              ? <div style={{ textAlign:"center", padding:"2rem .5rem", color:"#bbb", fontSize:13 }}>{query ? "No matches" : "None"}</div>
              : col.contacts.map((c, i) => (
                  <ContactCard
                    key={`${col.key}-${c.fn}-${c.ln}-${i}`}
                    c={c} idx={i} type={col.key}
                    onOpen={(contact, type) => { setSelected(contact); setSelectedType(type); }}
                    sessionNotes={sessionNotes}
                    setSessionNotes={setSessionNotes}
                  />
                ))
            }
          </div>
        ))}
      </div>

      {selected && (
        <DetailPanel
          c={selected} type={selectedType}
          onClose={() => setSelected(null)}
          sessionNotes={sessionNotes}
          setSessionNotes={setSessionNotes}
        />
      )}
      {showNew && (
        <NewContactModal
          onClose={() => setShowNew(false)}
          onAdd={c => setContacts(p => [...p, c])}
        />
      )}
    </div>
  );
}
