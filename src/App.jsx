import React, { useState, useMemo, useEffect } from "react";

// ─── Responsive hook ─────────────────────────────────────────────────────
function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const handle = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);
  return width;
}

// ─── API helpers ──────────────────────────────────────────────────────────
async function postToSheet(type, data) {
  try {
    const res = await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, data }),
    });
    return res.ok;
  } catch (err) { console.error("Sheet sync failed:", err); return false; }
}

async function updateContact(data) {
  try {
    const res = await fetch("/api/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "update_contact", data }),
    });
    return res.ok;
  } catch (err) { console.error("Update failed:", err); return false; }
}

function todayStr() {
  const d = new Date();
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

// ─── Sheet row mapper ─────────────────────────────────────────────────────
function mapSheetRow(row) {
  return {
    id:       String(row["ID"]                   || "").trim(),
    fn:       String(row["First name"]           || "").trim(),
    ln:       String(row["Last Name"]            || "").trim(),
    industry: String(row["Industry"]             || "").trim(),
    company:  String(row["Company"]              || "").trim(),
    linkedin: String(row["LinkedIn Profile"]     || "").trim(),
    email:    String(row["Email"]                || "").trim(),
    rel:      String(row["Relationship"]         || "").trim(),
    city:     String(row["City"]                 || "").trim(),
    state:    String(row["State"]                || "").trim(),
    ug:       String(row["Undergraduate School"] || "").trim(),
    grad:     String(row["Graduate School"]      || "").trim(),
    status:   String(row["Status"]               || "Never Contacted").trim(),
    lc:       String(row["Last Check-in Date"]   || "").trim(),
    nc:       String(row["Next Check-in Date"]   || "").trim(),
    notes:    String(row["Notes"]                || "").trim(),
  };
}

function mapInteractionRow(row) {
  return {
    id:        String(row["Contact ID"] || "").trim(),
    timestamp: String(row["Timestamp"]  || row["Logged At"] || "").trim(),
    firstName: String(row["First Name"] || "").trim(),
    lastName:  String(row["Last Name"]  || "").trim(),
    note:      String(row["Note"]       || "").trim(),
  };
}

// ─── Constants ────────────────────────────────────────────────────────────
const TODAY     = new Date();
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

function pd(s) {
  if (!s) return null;
  // Handle ISO date strings from sheets (e.g. "2026-03-20T03:00:00.000Z")
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
function ds(d)  { return Math.floor((TODAY - d) / 86400000); }
function fd(d)  { return d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }); }
function fds(d) { return d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric", hour:"2-digit", minute:"2-digit" }); }
function ini(c) { return ((c.fn||"").charAt(0) + (c.ln||"").charAt(0)).toUpperCase() || "?"; }
function lcCls(d, type) {
  if (!d) return "never";
  if (type === "overdue") return "overdue";
  if (type === "cold")    return "never";
  return ds(d) >= THRESHOLD ? "overdue" : "recent";
}

// ─── Password gate ────────────────────────────────────────────────────────
const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD || "network2026";

function PasswordGate({ onUnlock }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  function attempt() {
    if (input === APP_PASSWORD) { onUnlock(); }
    else { setError(true); setShake(true); setTimeout(() => setShake(false), 500); }
  }

  return (
    <div style={{ minHeight:"100vh", background:"#fafaf8", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Georgia,serif" }}>
      <div style={{ background:"#fff", border:"0.5px solid #e0e0de", borderRadius:16, padding:"2.5rem 2rem", width:"min(360px,90vw)", textAlign:"center", transform:shake?"translateX(-6px)":"none", transition:shake?"transform 0.1s ease":"transform 0.4s ease" }}>
        <div style={{ fontSize:28, marginBottom:8 }}>🔒</div>
        <div style={{ fontSize:19, fontWeight:700, color:"#1a1a18", marginBottom:6 }}>Networking Dashboard</div>
        <div style={{ fontSize:13, color:"#999", marginBottom:24 }}>Enter your password to continue</div>
        <input type="password" value={input} onChange={e => { setInput(e.target.value); setError(false); }}
          onKeyDown={e => e.key === "Enter" && attempt()} placeholder="Password" autoFocus
          style={{ width:"100%", fontSize:14, padding:"9px 12px", border:error?"1px solid #E24B4A":"0.5px solid #e0e0de", borderRadius:8, background:"#f9f9f7", color:"#222", fontFamily:"inherit", outline:"none", boxSizing:"border-box", marginBottom:error?6:16 }} />
        {error && <div style={{ fontSize:12, color:"#A32D2D", marginBottom:12 }}>Incorrect password</div>}
        <button onClick={attempt} style={{ width:"100%", fontSize:13, fontWeight:600, padding:"9px", borderRadius:8, border:"none", background:"#1a1a18", color:"#fff", cursor:"pointer" }}>Enter</button>
      </div>
    </div>
  );
}

// ─── Last contact badge ───────────────────────────────────────────────────
function LastContactBadge({ c, type }) {
  const d = pd(c.lc);
  if (!d) return <div style={{ fontSize:11, padding:"5px 9px", borderRadius:7, ...BADGE.never, width:"fit-content", marginBottom:9 }}>No interaction on record</div>;
  const days  = ds(d);
  const label = days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, padding:"5px 9px", borderRadius:7, ...BADGE[lcCls(d,type)], width:"fit-content", marginBottom:9 }}>
      <span style={{ fontWeight:500 }}>{fd(d)}</span>
      <span style={{ opacity:.75 }}>— {label}</span>
    </div>
  );
}

// ─── Contact card ─────────────────────────────────────────────────────────
function ContactCard({ c, idx, type, onOpen, onContactedToday, sessionNotes, setSessionNotes }) {
  const key  = `${type}-${c.id||c.fn}-${c.ln}-${idx}`;
  const av   = AV[type];
  const loc  = [c.city, c.state].filter(Boolean).join(", ");
  const [showSave,   setShowSave]   = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [syncing,    setSyncing]    = useState(false);
  const [contacted,  setContacted]  = useState(false);
  const [contacting, setContacting] = useState(false);
  const note = sessionNotes[key] || "";

  async function handleSaveNote() {
    setShowSave(false); setSyncing(true);
    await postToSheet("note", { id:c.id, firstName:c.fn, lastName:c.ln, note:sessionNotes[key]||"", timestamp:new Date().toISOString() });
    setSyncing(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleContactedToday() {
    setContacting(true);
    const updated = { ...c, lc: todayStr() };
    await updateContact(updated);
    setContacting(false);
    setContacted(true);
    onContactedToday(updated);
    setTimeout(() => setContacted(false), 3000);
  }

  return (
    <div style={{ background:"#fff", border:"0.5px solid #e0e0de", borderRadius:12, padding:"14px 16px", marginBottom:10 }}
      onMouseEnter={e => e.currentTarget.style.borderColor="#bbb"}
      onMouseLeave={e => e.currentTarget.style.borderColor="#e0e0de"}>

      <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:9, cursor:"pointer" }} onClick={() => onOpen(c, type)}>
        <div style={{ width:34, height:34, minWidth:34, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:600, background:av.bg, color:av.color }}>{ini(c)}</div>
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
        <button onClick={handleContactedToday} disabled={contacting || contacted}
          style={{ fontSize:11, padding:"3px 9px", borderRadius:6, border:"0.5px solid #ccc", background:contacted?"#EAF3DE":"transparent", color:contacted?"#3B6D11":"#555", cursor:"pointer" }}>
          {contacting ? "Saving…" : contacted ? "✓ Logged" : "✓ Contacted today"}
        </button>
      </div>

      {c.notes && (
        <div style={{ fontSize:11, color:"#666", marginBottom:8, padding:"5px 8px", background:"#f9f9f7", borderRadius:6, borderLeft:"2px solid #ddd", lineHeight:1.5 }}>
          <div style={{ fontSize:10, color:"#999", marginBottom:2 }}>Prior note</div>{c.notes}
        </div>
      )}

      <textarea value={note}
        onChange={e => { setSessionNotes(p => ({ ...p, [key]: e.target.value })); setShowSave(true); }}
        onFocus={() => setShowSave(true)} placeholder="Log a new note…" rows={2}
        style={{ width:"100%", fontSize:12, padding:"7px 9px", border:"0.5px solid #e0e0de", borderRadius:7, resize:"vertical", minHeight:50, fontFamily:"inherit", background:"#f9f9f7", color:"#222", lineHeight:1.5, outline:"none", boxSizing:"border-box" }} />
      {showSave && <button onClick={handleSaveNote} disabled={syncing} style={{ marginTop:5, fontSize:11, padding:"3px 10px", borderRadius:6, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>{syncing?"Saving…":"Save note"}</button>}
      {saved && <div style={{ fontSize:10, color:"#3B6D11", marginTop:3 }}>✓ Saved to sheet</div>}
    </div>
  );
}

// ─── Reusable edit field components (must be outside DetailPanel to avoid focus loss) ───
const detailInp = { fontSize:13, padding:"7px 10px", border:"0.5px solid #e0e0de", borderRadius:8, background:"#f9f9f7", color:"#222", fontFamily:"inherit", outline:"none", width:"100%", boxSizing:"border-box" };
const detailLbl = { fontSize:10, color:"#999", textTransform:"uppercase", letterSpacing:".04em", marginBottom:3, display:"block" };

function DetailField({ label, k, type="text", form, setForm, editing }) {
  return (
    <div style={{ background:"#f9f9f7", borderRadius:8, padding:"8px 10px" }}>
      <label style={detailLbl}>{label}</label>
      {editing
        ? <input type={type} value={form[k]||""} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} style={detailInp} />
        : <div style={{ fontSize:13, color:form[k]?"#222":"#bbb", fontStyle:form[k]?"normal":"italic" }}>{form[k]||"—"}</div>
      }
    </div>
  );
}

function DetailSelectField({ label, k, options, form, setForm, editing }) {
  return (
    <div style={{ background:"#f9f9f7", borderRadius:8, padding:"8px 10px" }}>
      <label style={detailLbl}>{label}</label>
      {editing
        ? <select value={form[k]||""} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} style={{ ...detailInp, cursor:"pointer" }}>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        : <div style={{ fontSize:13, color:"#222" }}>{form[k]||"—"}</div>
      }
    </div>
  );
}

// ─── Detail / Edit panel ──────────────────────────────────────────────────
function DetailPanel({ c, type, onClose, onSaved, interactions, sessionNotes, setSessionNotes }) {
  const [editing,  setEditing]  = useState(false);
  const [form,     setForm]     = useState({ ...c });
  const [saving,   setSaving]   = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [noteSyncing, setNoteSyncing] = useState(false);

  if (!c) return null;
  const av  = AV[type] || AV.active;
  const d   = pd(editing ? form.lc : c.lc);
  const nd  = pd(editing ? form.nc : c.nc);
  const loc = [c.city, c.state].filter(Boolean).join(", ");
  const cls = lcCls(d, type);
  const days = d ? ds(d) : null;
  const dl   = days === null ? null : days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
  const noteKey = `detail-${c.fn}-${c.ln}`;
  const note    = sessionNotes[noteKey] || "";

  // Filter interactions — match by ID first, fall back to name for legacy entries
  const history = interactions
    .filter(i => {
      if (i.id && c.id) return i.id === c.id;
      return i.firstName.toLowerCase() === c.fn.toLowerCase() && i.lastName.toLowerCase() === c.ln.toLowerCase();
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  async function handleSaveEdit() {
    setSaving(true);
    await updateContact(form);
    setSaving(false);
    setEditing(false);
    onSaved(form);
  }

  async function handleSaveNote() {
    setNoteSyncing(true);
    await postToSheet("note", { id:c.id, firstName:c.fn, lastName:c.ln, note, timestamp:new Date().toISOString() });
    setNoteSyncing(false);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  }



  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", zIndex:200, display:"flex", alignItems:window.innerWidth<640?"flex-end":"center", justifyContent:"center", padding:window.innerWidth<640?0:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:window.innerWidth<640?"16px 16px 0 0":16, border:"0.5px solid #e0e0de", width:window.innerWidth<640?"100%":"min(580px,100%)", maxHeight:window.innerWidth<640?"92vh":"88vh", overflowY:"auto", padding:window.innerWidth<640?"20px 16px":24 }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"flex-start", gap:14, marginBottom:18 }}>
          <div style={{ width:52, height:52, minWidth:52, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:600, background:av.bg, color:av.color }}>{ini(editing?form:c)}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:20, fontWeight:600, marginBottom:3 }}>{editing ? `${form.fn} ${form.ln}` : `${c.fn} ${c.ln}`}</div>
            <div style={{ fontSize:13, color:"#777" }}>{c.rel || (c.company || "—")}</div>
          </div>
          <div style={{ display:"flex", gap:8, flexShrink:0 }}>
            {!editing && (
              <button onClick={() => setEditing(true)} style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>✏️ Edit</button>
            )}
            {editing && (
              <>
                <button onClick={handleSaveEdit} disabled={saving} style={{ fontSize:12, fontWeight:600, padding:"5px 14px", borderRadius:7, border:"none", background:"#1a1a18", color:"#fff", cursor:"pointer" }}>{saving?"Saving…":"Save"}</button>
                <button onClick={() => { setEditing(false); setForm({ ...c }); }} style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>Cancel</button>
              </>
            )}
            <button onClick={onClose} style={{ background:"transparent", border:"0.5px solid #ccc", borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:12, color:"#666" }}>✕</button>
          </div>
        </div>

        {/* Last contact badge */}
        <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, padding:"5px 10px", borderRadius:8, marginBottom:16, ...BADGE[cls], width:"fit-content" }}>
          {d ? <><span style={{ fontWeight:500 }}>Last contact: {fd(d)}</span><span style={{ opacity:.75 }}>— {dl}</span></> : <span>No interaction on record</span>}
        </div>

        {/* Links */}
        {(c.linkedin || c.email) && !editing && (
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
            {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:"0.5px solid #ccc", color:"#555", textDecoration:"none" }}>LinkedIn ↗</a>}
            {c.email    && <a href={`mailto:${c.email}`} style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:"0.5px solid #ccc", color:"#555", textDecoration:"none" }}>{c.email}</a>}
          </div>
        )}

        {/* Details grid */}
        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:500, color:"#aaa", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8 }}>Details</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <DetailSelectField label="Status"       k="status"   options={["Never Contacted","Active","Inactive"]} form={form} setForm={setForm} editing={editing} />
            <DetailField label="Industry"      k="industry" form={form} setForm={setForm} editing={editing} />
            <DetailField label="Company"       k="company"  form={form} setForm={setForm} editing={editing} />
            <DetailField label="Relationship"  k="rel"      form={form} setForm={setForm} editing={editing} />
            <DetailField label="City"          k="city"     form={form} setForm={setForm} editing={editing} />
            <DetailField label="State"         k="state"    form={form} setForm={setForm} editing={editing} />
            <DetailField label="Undergrad"     k="ug"       form={form} setForm={setForm} editing={editing} />
            <DetailField label="Grad school"   k="grad"     form={form} setForm={setForm} editing={editing} />
            <DetailField label="LinkedIn"      k="linkedin" form={form} setForm={setForm} editing={editing} />
            <DetailField label="Email"         k="email"    type="email" form={form} setForm={setForm} editing={editing} />
            <DetailField label="Last check-in" k="lc"       type="date"  form={form} setForm={setForm} editing={editing} />
            <DetailField label="Next check-in" k="nc"       type="date"  form={form} setForm={setForm} editing={editing} />
          </div>
        </div>

        {/* Log a note */}
        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:500, color:"#aaa", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8 }}>Log a note</div>
          <textarea value={note} onChange={e => setSessionNotes(p => ({ ...p, [noteKey]: e.target.value }))}
            placeholder="Add a note about this interaction…" rows={3}
            style={{ width:"100%", fontSize:13, padding:"8px 10px", border:"0.5px solid #e0e0de", borderRadius:8, resize:"vertical", minHeight:70, fontFamily:"inherit", background:"#f9f9f7", color:"#222", lineHeight:1.5, outline:"none", boxSizing:"border-box" }} />
          <button onClick={handleSaveNote} disabled={noteSyncing} style={{ marginTop:6, fontSize:12, padding:"5px 14px", borderRadius:7, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>
            {noteSyncing ? "Saving…" : "Save note"}
          </button>
          {noteSaved && <span style={{ fontSize:11, color:"#3B6D11", marginLeft:8 }}>✓ Saved to sheet</span>}
        </div>

        {/* Interaction history */}
        <div>
          <div style={{ fontSize:11, fontWeight:500, color:"#aaa", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8 }}>
            Interaction history {history.length > 0 && <span style={{ fontWeight:400 }}>({history.length})</span>}
          </div>
          {history.length === 0
            ? <div style={{ fontSize:13, color:"#bbb", fontStyle:"italic" }}>No interactions logged yet.</div>
            : history.map((h, i) => {
                const d = pd(h.timestamp);
                return (
                  <div key={i} style={{ padding:"10px 12px", background:"#f9f9f7", borderRadius:8, marginBottom:8, borderLeft:"3px solid #e0e0de" }}>
                    <div style={{ fontSize:11, color:"#999", marginBottom:4 }}>{d ? fds(d) : h.timestamp}</div>
                    <div style={{ fontSize:13, color:"#333", lineHeight:1.5 }}>{h.note}</div>
                  </div>
                );
              })
          }
        </div>
      </div>
    </div>
  );
}

// ─── New contact modal ────────────────────────────────────────────────────
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
    const newContact = { ...form, fn:form.fn.trim(), ln:form.ln.trim() };
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
          style={{ ...inp, borderColor:errors[k]?"#E24B4A":"#e0e0de" }} />
        {errors[k] && <div style={{ fontSize:11, color:"#A32D2D", marginTop:2 }}>{errors[k]}</div>}
      </div>
    );
  }

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", zIndex:200, display:"flex", alignItems:window.innerWidth<640?"flex-end":"center", justifyContent:"center", padding:window.innerWidth<640?0:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:window.innerWidth<640?"16px 16px 0 0":16, border:"0.5px solid #e0e0de", width:window.innerWidth<640?"100%":"min(580px,100%)", maxHeight:window.innerWidth<640?"92vh":"90vh", overflowY:"auto", padding:window.innerWidth<640?"20px 16px":24 }}>
        <div style={{ display:"flex", alignItems:"flex-start", marginBottom:20 }}>
          <div><div style={{ fontSize:19, fontWeight:600, marginBottom:3 }}>New contact</div><div style={{ fontSize:13, color:"#777" }}>Add someone to your network</div></div>
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
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="How you know them, talking points…" rows={3}
              style={{ ...inp, resize:"vertical", minHeight:64 }} />
          </div>
        </div>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", paddingTop:12, borderTop:"0.5px solid #eee" }}>
          <button onClick={onClose} style={{ fontSize:13, padding:"7px 16px", borderRadius:8, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>Cancel</button>
          <button onClick={submit} disabled={syncing} style={{ fontSize:13, fontWeight:500, padding:"7px 18px", borderRadius:8, border:"none", background:"#1a1a18", color:"#fff", cursor:"pointer" }}>{syncing?"Saving…":"Add contact"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────
export default function NetworkingDashboard() {
  const width = useWindowWidth();
  const isMobile = width < 640;
  const [collapsed, setCollapsed] = useState({cold:false, overdue:false, active:false});
  const [unlocked,     setUnlocked]     = useState(false);
  const [contacts,     setContacts]     = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [loadError,    setLoadError]    = useState(null);
  const [selected,     setSelected]     = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [showNew,      setShowNew]      = useState(false);
  const [query,        setQuery]        = useState("");
  const [sessionNotes, setSessionNotes] = useState({});

  function fetchData(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    fetch("/api/contacts")
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setContacts((data.contacts || []).map(mapSheetRow).filter(c => c.fn || c.ln));
          setInteractions((data.interactions || []).map(mapInteractionRow));
        } else {
          setLoadError("Could not load contacts from sheet.");
        }
        setLoading(false);
        setRefreshing(false);
      })
      .catch(err => { console.error(err); setLoadError("Network error loading contacts."); setLoading(false); setRefreshing(false); });
  }

  useEffect(() => {
    if (!unlocked) return;
    fetchData();
  }, [unlocked]);

  const { cold, overdue, active } = useMemo(() => {
    const q    = query.toLowerCase().trim();
    const list = q ? contacts.filter(c => [c.fn,c.ln,c.company,c.industry,c.rel,c.city,c.state,c.notes].join(" ").toLowerCase().includes(q)) : contacts;
    const cold    = list.filter(c => c.status === "Never Contacted");
    const allAct  = list.filter(c => c.status === "Active");
    const overdue = allAct.filter(c => { const d=pd(c.lc); return d && ds(d)>=THRESHOLD; }).sort((a,b)=>new Date(a.lc)-new Date(b.lc));
    const active  = allAct.filter(c => { const d=pd(c.lc); return !d||ds(d)<THRESHOLD; }).sort((a,b)=>new Date(b.lc)-new Date(a.lc));
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

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#fafaf8", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Georgia,serif" }}>
      <div style={{ textAlign:"center", color:"#999" }}><div style={{ fontSize:24, marginBottom:12 }}>⏳</div><div style={{ fontSize:14 }}>Loading contacts…</div></div>
    </div>
  );

  if (loadError) return (
    <div style={{ minHeight:"100vh", background:"#fafaf8", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Georgia,serif" }}>
      <div style={{ textAlign:"center", color:"#A32D2D" }}><div style={{ fontSize:24, marginBottom:12 }}>⚠️</div><div style={{ fontSize:14 }}>{loadError}</div></div>
    </div>
  );

  return (
    <div style={{ fontFamily:"Georgia,serif", background:"#fafaf8", minHeight:"100vh", paddingBottom:"3rem" }}>

      <div style={{ background:"#fff", borderBottom:"0.5px solid #e8e8e4", padding:isMobile?"12px 16px":"16px 24px", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:20 }}>
        <div style={{ marginRight:4 }}>
          <div style={{ fontSize:isMobile?16:19, fontWeight:700, letterSpacing:"-.02em", color:"#1a1a18" }}>Networking Dashboard</div>
          <div style={{ fontSize:12, color:"#999", marginTop:1 }}>{contacts.length} contacts total</div>
        </div>
        <div style={{ flex:1, minWidth:140, maxWidth:320, position:"relative" }}>
          <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:14, color:"#aaa", pointerEvents:"none" }}>🔍</span>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, company, industry…"
            style={{ width:"100%", fontSize:13, padding:"7px 10px 7px 32px", border:"0.5px solid #e0e0de", borderRadius:8, background:"#f9f9f7", color:"#222", fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}
            onFocus={e => e.target.style.borderColor="#999"} onBlur={e => e.target.style.borderColor="#e0e0de"} />
          {query && <button onClick={() => setQuery("")} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", cursor:"pointer", fontSize:14, color:"#aaa", padding:0, lineHeight:1 }}>✕</button>}
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {columns.map(col => (
            <div key={col.key} style={{ fontSize:12, padding:"4px 11px", borderRadius:20, fontWeight:600, ...colBadgeStyle[col.key] }}>
              {col.contacts.length} {col.title}
            </div>
          ))}
        </div>
        <button onClick={() => fetchData(true)} disabled={refreshing} title="Reload contacts from sheet"
          style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:13, padding:"7px 12px", borderRadius:8, border:"0.5px solid #e0e0de", background:"#fff", color:"#555", cursor:"pointer", whiteSpace:"nowrap" }}>
          {refreshing ? "⏳" : "🔄"}
        </button>
        <button onClick={() => setShowNew(true)} style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:13, fontWeight:500, padding:"7px 16px", borderRadius:8, border:"none", background:"#1a1a18", color:"#fff", cursor:"pointer", whiteSpace:"nowrap" }}>
          + New contact
        </button>
      </div>

      {query && <div style={{ padding:isMobile?"0 12px 12px":"0 24px 12px", fontSize:12, color:"#999" }}>Showing {cold.length+overdue.length+active.length} of {contacts.length} contacts for "{query}"</div>}

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"repeat(3,minmax(0,1fr))", gap:isMobile?12:20, padding:isMobile?"0 12px":"0 24px" }}>
        {columns.map(col => (
          <div key={col.key} style={{ minWidth:0 }}>
            <div
              onClick={() => isMobile && setCollapsed(p => ({ ...p, [col.key]: !p[col.key] }))}
              style={{ display:"flex", alignItems:"center", gap:8, marginBottom:collapsed[col.key]?0:14, paddingBottom:12, borderBottom:"0.5px solid #e8e8e4", background:isMobile?"#fff":"transparent", padding:isMobile?"10px 12px":"0 0 12px 0", borderRadius:isMobile?(collapsed[col.key]?10:"10px 10px 0 0"):0, border:isMobile?"0.5px solid #e0e0de":"none", borderBottom:"0.5px solid #e8e8e4", cursor:isMobile?"pointer":"default", userSelect:"none" }}>
              <span style={{ fontSize:isMobile?16:14 }}>{col.icon}</span>
              <span style={{ fontSize:isMobile?14:12, fontWeight:600, letterSpacing:".06em", textTransform:"uppercase", color:COL[col.key], flex:1 }}>{col.title}</span>
              <span style={{ fontSize:12, background:"#f5f5f3", border:"0.5px solid #e0e0de", borderRadius:20, padding:"2px 9px", color:"#777" }}>{col.contacts.length}</span>
              {isMobile && <span style={{ fontSize:14, color:"#999", marginLeft:4 }}>{collapsed[col.key] ? "▸" : "▾"}</span>}
            </div>
            {!collapsed[col.key] && (col.contacts.length === 0
              ? <div style={{ textAlign:"center", padding:"2rem .5rem", color:"#bbb", fontSize:13 }}>{query?"No matches":"None"}</div>
              : col.contacts.map((c, i) => (
                  <ContactCard key={`${col.key}-${c.id||c.fn}-${c.ln}-${i}`} c={c} idx={i} type={col.key}
                    onOpen={(contact, type) => { setSelected(contact); setSelectedType(type); }}
                    onContactedToday={updated => setContacts(prev => prev.map(ct => ct.id === updated.id ? updated : ct))}
                    sessionNotes={sessionNotes} setSessionNotes={setSessionNotes} />
                ))
            )}
          </div>
        ))}
      </div>

      {selected && (
        <DetailPanel c={selected} type={selectedType} onClose={() => setSelected(null)}
          interactions={interactions}
          onSaved={updated => {
            setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
            setSelected(updated);
          }}
          sessionNotes={sessionNotes} setSessionNotes={setSessionNotes} />
      )}

      {showNew && (
        <NewContactModal onClose={() => setShowNew(false)}
          onAdd={c => setContacts(p => [...p, c])} />
      )}
    </div>
  );
}
