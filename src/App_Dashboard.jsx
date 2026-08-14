import React, { useState, useMemo, useEffect, useRef } from "react";

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

// ─── Auth session helpers ─────────────────────────────────────────────────
const AUTH_STORAGE_KEY = "crm_auth_session";
const AUTH_SESSION_DAYS = 30;
const ADMIN_EMAILS = ["jackkruseiii@gmail.com"]; // who can see/use the Invite panel

function readAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.email || !parsed.ts) return null;
    const ageMs = Date.now() - parsed.ts;
    if (ageMs > AUTH_SESSION_DAYS * 86400000) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

function writeAuthSession(email, credential, onboardingComplete) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ email, credential, onboardingComplete, ts: Date.now() }));
  } catch {}
}

function clearAuthSession() {
  try { localStorage.removeItem(AUTH_STORAGE_KEY); } catch {}
}

function getStoredCredential() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.credential || null;
  } catch { return null; }
}

// ─── API helpers ──────────────────────────────────────────────────────────
async function postToSheet(type, data) {
  try {
    const credential = getStoredCredential();
    const res = await fetch("/api/log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(credential ? { "Authorization": `Bearer ${credential}` } : {}),
      },
      body: JSON.stringify({ type, data }),
    });
    return res.ok;
  } catch (err) { console.error("Sheet sync failed:", err); return false; }
}

async function updateContact(data) {
  try {
    const credential = getStoredCredential();
    const res = await fetch("/api/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(credential ? { "Authorization": `Bearer ${credential}` } : {}),
      },
      body: JSON.stringify({ type: "update_contact", data }),
    });
    return res.ok;
  } catch (err) { console.error("Update failed:", err); return false; }
}

function todayStr() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

async function autoMarkInactive(contact) {
  const updated = { ...contact, status: "Inactive" };
  await updateContact(updated);
  await postToSheet("note", {
    id: contact.id,
    firstName: contact.fn,
    lastName: contact.ln,
    note: `Auto-moved to Inactive — ${INACTIVE_THRESHOLD} days since last contact (${contact.lc ? new Date(contact.lc).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }) : "unknown"}).`,
    timestamp: new Date().toISOString(),
  });
  return updated;
}

// ─── LinkedIn message generator ───────────────────────────────────────────
async function generateEmailDraft(contact, interactions) {
  const history = interactions
    .filter(i => i.id && contact.id && i.id === contact.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 5);

  const isCold = contact.status === "Never Contacted";
  const checkinDate = pd(contact.lc);
  const daysSinceContact = checkinDate ? ds(checkinDate) : null;

  const connectionAnchor = (() => {
    const rel = (contact.rel || "").toLowerCase();
    const ug  = (contact.ug  || "").toLowerCase();
    if (rel.includes("woodberry") || ug.includes("woodberry")) return "Woodberry Forest";
    if (rel.includes("usna") || ug.includes("usna") || rel.includes("classmate") || rel.includes("fao")) return "USNA and our shared military background";
    if (rel.includes("military") || rel.includes("navy") || rel.includes("admiral") || rel.includes("general")) return "our shared military background";
    return "our shared connection";
  })();

  const systemPrompt = `You are writing LinkedIn messages on behalf of Jack Kruse.

ABOUT JACK:
- Current role: Military Group Chief at the U.S. Embassy in Brazil, leading security cooperation including military equipment sales, training and education, and operations and exercises planning
- Background: Navy FAO (Foreign Area Officer) with extensive assignments in Africa and Europe. Earlier career as a Naval Aviator.
- Transitioning out of the military in 2028-2029 and actively learning from others about their career transitions and what it's like to work in various sectors
- Primary interest: Education sector, but adapts based on the contact's industry
- Location: Brazil — never suggest in-person meetings or coffee

LINKEDIN MESSAGE RULES:
- This is a LinkedIn message, not an email — keep it tight, warm, and conversational
- Under 150 words — punchy, not long-winded
- No subject line
- No formal opener like "Dear" — just use their first name
- No formal sign-off — end naturally, just "— Jack" or similar
- Always lead with the shared connection anchor provided
- Briefly mention Jack's current role at the US Embassy Brazil
- Reference his Naval Aviator and FAO background naturally if relevant
- The ask is a 20-minute Google Meet call
- Tailor the curiosity angle to their specific industry
- Never suggest coffee, lunch, or in-person meetings
- Warm, collegial tone — like a message from a fellow military professional`;

  const locationStr = contact.city ? contact.city + (contact.state ? ", " + contact.state : "") : "unknown";
  const lastContactStr = checkinDate ? fd(checkinDate) + " (" + daysSinceContact + " days ago)" : "never";
  const historyText = history.length > 0
    ? "PRIOR INTERACTIONS:\n" + history.map(h => "- " + (h.timestamp ? new Date(h.timestamp).toLocaleDateString() : "unknown date") + ": " + h.note).join("\n")
    : "No prior interactions logged.";

  const userPrompt = [
    "Write a " + (isCold ? "cold outreach" : "follow-up") + " LinkedIn message to " + contact.fn + " " + contact.ln + ".",
    "",
    "CONTACT INFO:",
    "- Name: " + contact.fn + " " + contact.ln,
    "- Company: " + (contact.company || "unknown"),
    "- Industry: " + (contact.industry || "unknown"),
    "- Location: " + locationStr,
    "- Relationship: " + (contact.rel || "none noted"),
    "- Connection anchor: " + connectionAnchor,
    "- Last contact: " + lastContactStr,
    "- Notes: " + (contact.notes || "none"),
    "",
    historyText,
    "",
    isCold ? "First ever outreach — no prior contact." : "Follow-up — reference the existing relationship naturally.",
    "",
    "Write the LinkedIn message now. No subject line. Start directly with their first name."
  ].join("\n");

  const credential = getStoredCredential();
  const response = await fetch("/api/draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(credential ? { "Authorization": `Bearer ${credential}` } : {}),
    },
    body: JSON.stringify({ systemPrompt, userPrompt }),
  });

  const data = await response.json();
  const body = data.text || "";
  return { subject: "", body };
}

// ─── LinkedIn profile text parser ─────────────────────────────────────────
async function parseLinkedInProfile(pastedText) {
  const systemPrompt = `You extract structured contact information from raw LinkedIn profile text that a user copy-pasted from a browser.

Return ONLY a JSON object with these exact keys (use empty string "" if not found):
{
  "fn": "first name",
  "ln": "last name",
  "company": "current company",
  "industry": "best-guess industry based on role/company",
  "city": "city",
  "state": "state or region",
  "ug": "undergraduate school if mentioned",
  "grad": "graduate school if mentioned",
  "notes": "1-2 sentence summary of their role/background, useful as a quick reference note"
}

Rules:
- Return ONLY the JSON object, no markdown formatting, no backticks, no preamble
- If you can't confidently determine a field, use an empty string
- For city/state, use their listed location
- Keep "notes" concise — just enough to remember who they are`;

  const userPrompt = "Extract contact info from this LinkedIn profile text:\n\n" + pastedText;

  const credential = getStoredCredential();
  const response = await fetch("/api/draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(credential ? { "Authorization": `Bearer ${credential}` } : {}),
    },
    body: JSON.stringify({ systemPrompt, userPrompt }),
  });

  const data = await response.json();
  const text = (data.text || "").trim();

  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Failed to parse LinkedIn extraction result:", err, text);
    return null;
  }
}

// ─── Supabase row mappers ─────────────────────────────────────────────────
function mapSupabaseRow(row) {
  return {
    id:          String(row.id            || ""),
    fn:          String(row.first_name    || ""),
    ln:          String(row.last_name     || ""),
    industry:    String(row.industry      || ""),
    company:     String(row.company       || ""),
    linkedin:    String(row.linkedin      || ""),
    email:       String(row.email         || ""),
    officePhone: String(row.office_phone  || ""),
    mobilePhone: String(row.mobile_phone  || ""),
    rel:         String(row.relationship  || ""),
    city:        String(row.city          || ""),
    state:       String(row.state         || ""),
    ug:          String(row.undergrad     || ""),
    grad:        String(row.grad_school   || ""),
    status:      String(row.status        || "Never Contacted"),
    lc:          row.last_checkin ? new Date(row.last_checkin).toISOString().split("T")[0] : "",
    nc:          row.next_checkin ? new Date(row.next_checkin).toISOString().split("T")[0] : "",
    notes:       String(row.notes         || ""),
    notesDoc:    String(row.notes_doc     || ""),
    region:      String(row.target_region || ""),
    friend:      row.is_friend === true,
    country:     String(row.country      || ""),
    branch:      String(row.branch       || ""),
    category:    String(row.category     || ""),
    metContext:  String(row.met_context  || ""),
    languages:   String(row.languages    || ""),
    rankTitle:   String(row.rank_title   || ""),
  };
}

function mapSupabaseInteraction(row) {
  return {
    id:        String(row.contact_id || ""),
    timestamp: String(row.created_at || ""),
    firstName: "",
    lastName:  "",
    note:      String(row.note       || ""),
  };
}

// ─── Constants ────────────────────────────────────────────────────────────
const TODAY               = new Date();
const THRESHOLD           = 90;
const INACTIVE_THRESHOLD  = 180;
const AV = {
  cold:     { bg:"#E6F1FB", color:"#0C447C" },
  overdue:  { bg:"#FAEEDA", color:"#633806" },
  active:   { bg:"#EAF3DE", color:"#3B6D11" },
  inactive: { bg:"#F0F0EE", color:"#777"    },
};
const COL   = { cold:"#185FA5", overdue:"#854F0B", active:"#3B6D11", inactive:"#888" };
const BADGE = {
  never:   { background:"#f5f5f3", border:"1px solid #ddd",    color:"#999"    },
  overdue: { background:"#FAEEDA", border:"1px solid #EF9F27", color:"#854F0B" },
  recent:  { background:"#EAF3DE", border:"1px solid #97C459", color:"#3B6D11" },
};

function pd(s) {
  if (!s) return null;
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

// ─── Google Sign-In gate ───────────────────────────────────────────────────
function GoogleSignInGate({ onUnlock }) {
  const buttonRef        = useRef(null);
  const [error,     setError]     = useState("");
  const [verifying, setVerifying] = useState(false);
  const [sdkReady,  setSdkReady]  = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  // Request-access form state
  const [showRequest, setShowRequest] = useState(false);
  const [rName,  setRName]  = useState("");
  const [rEmail, setREmail] = useState("");
  const [rAff,   setRAff]   = useState("");
  const [rNote,  setRNote]  = useState("");
  const [honeypot,   setHoneypot]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [reqError,   setReqError]   = useState("");

  async function handleCredentialResponse(response) {
    setVerifying(true);
    setError("");
    try {
      const res = await fetch("/api/verify-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });
      const data = await res.json();
      if (data.success) {
        writeAuthSession(data.email, response.credential, data.onboardingComplete);
        onUnlock(data.email, data.onboardingComplete);
      } else {
        setError(data.error || "This Google account isn't on the invite list yet.");
        try {
          const p = JSON.parse(atob(response.credential.split(".")[1]));
          if (p.email && !rEmail) setREmail(p.email);
          if (p.name && !rName) setRName(p.name);
        } catch {}
        setShowRequest(true);
      }
    } catch (err) {
      console.error("Google verify failed:", err);
      setError("Sign-in failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  useEffect(() => {
    if (!clientId) return;
    function init() {
      if (!window.google || !window.google.accounts) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredentialResponse });
      if (buttonRef.current) {
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline", size: "large", text: "signin_with", shape: "pill", width: 280,
        });
      }
      setSdkReady(true);
    }
    if (window.google && window.google.accounts) { init(); return; }
    const existing = document.getElementById("google-identity-script");
    if (existing) { existing.addEventListener("load", init); return; }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.id = "google-identity-script";
    script.async = true;
    script.defer = true;
    script.onload = init;
    document.body.appendChild(script);
  }, [clientId]);

  async function submitRequest() {
    const email = rEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setReqError("Please enter a valid email address."); return; }
    setSubmitting(true); setReqError("");
    try {
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "access-request", name: rName, email, affiliation: rAff, note: rNote, website: honeypot }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Something went wrong. Please try again.");
      setSubmitted(true);
    } catch (err) {
      setReqError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const features = [
    ["📋", "Track every contact", "A kanban board that surfaces who needs attention and who's going cold."],
    ["📝", "Log your conversations", "Timestamped notes on every person, so nothing slips through."],
    ["💬", "AI-drafted outreach", "Personalized LinkedIn messages from your history, ready to send."],
    ["📬", "Weekly digest", "A Sunday email on your progress, overdue follow-ups, and blind spots."],
    ["⚙️", "Built for the transition", "Calibrated to your target region, sector, and timeline."],
  ];

  const inputStyle = { width:"100%", fontSize:14, padding:"9px 11px", border:"0.5px solid #d8d8d4", borderRadius:8, background:"#fff", color:"#222", fontFamily:"inherit", outline:"none", boxSizing:"border-box" };

  return (
    <div style={{ minHeight:"100vh", background:"#fafaf8", fontFamily:"Georgia,serif", padding:"24px 16px" }}>
      <div style={{ maxWidth:600, margin:"0 auto" }}>
        <div style={{ background:"#fff", border:"0.5px solid #e0e0de", borderRadius:16, overflow:"hidden" }}>

          <div style={{ background:"#0a2342", padding:"30px 32px" }}>
            <div style={{ fontSize:30, marginBottom:6 }}>⚓</div>
            <div style={{ fontSize:26, fontWeight:700, color:"#fff", letterSpacing:"-.02em" }}>Mahan</div>
            <div style={{ fontSize:14, color:"#8fadc8", marginTop:4, lineHeight:1.5 }}>A networking CRM for the military-to-civilian transition.</div>
          </div>

          <div style={{ padding:"26px 32px" }}>
            <p style={{ fontSize:15, color:"#333", lineHeight:1.7, margin:"0 0 20px 0" }}>
              Everyone says <em>network, network, network</em> — but keeping hundreds of conversations straight is the hard part. Mahan is a private, personal CRM built to do exactly that as you plan your move out of uniform.
            </p>

            <div style={{ background:"#f9f9f7", borderRadius:10, padding:"18px 20px", marginBottom:24, borderLeft:"3px solid #0a2342" }}>
              {features.map(([icon, title, desc], i) => (
                <div key={i} style={{ marginBottom: i === features.length - 1 ? 0 : 12 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:"#1a1a18" }}>{icon} {title}</div>
                  <div style={{ fontSize:13, color:"#666", lineHeight:1.5, marginTop:2 }}>{desc}</div>
                </div>
              ))}
            </div>

            <div style={{ textAlign:"center", paddingBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:600, color:"#444", marginBottom:12 }}>Already invited? Sign in.</div>
              {!clientId && (
                <div style={{ fontSize:12, color:"#A32D2D", marginBottom:12 }}>Missing VITE_GOOGLE_CLIENT_ID environment variable.</div>
              )}
              <div style={{ display:"flex", justifyContent:"center", minHeight:44 }}>
                <div ref={buttonRef} />
              </div>
              {clientId && !sdkReady && <div style={{ fontSize:12, color:"#999", marginTop:8 }}>Loading sign-in…</div>}
              {verifying && <div style={{ fontSize:12, color:"#999", marginTop:8 }}>Verifying…</div>}
              {error && <div style={{ fontSize:12, color:"#A32D2D", marginTop:10, lineHeight:1.5 }}>{error}</div>}
            </div>

            <div style={{ height:1, background:"#eee", margin:"22px 0" }} />

            {!showRequest && !submitted && (
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:13, color:"#666", marginBottom:10 }}>Not on the list yet?</div>
                <button onClick={() => setShowRequest(true)}
                  style={{ fontSize:13, fontWeight:600, padding:"9px 20px", borderRadius:9, border:"0.5px solid #0a2342", background:"#fff", color:"#0a2342", cursor:"pointer" }}>
                  Request access →
                </button>
              </div>
            )}

            {submitted && (
              <div style={{ background:"#EAF3DE", border:"0.5px solid #c5e0a5", borderRadius:10, padding:"16px 18px", textAlign:"center" }}>
                <div style={{ fontSize:15, fontWeight:600, color:"#3B6D11", marginBottom:4 }}>✓ Request sent</div>
                <div style={{ fontSize:13, color:"#3B6D11", lineHeight:1.6 }}>Thanks — Jack will review it and follow up by email if you're a fit. You can close this page.</div>
              </div>
            )}

            {showRequest && !submitted && (
              <div>
                <div style={{ fontSize:13, fontWeight:600, color:"#444", marginBottom:12 }}>Request access</div>

                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:12, color:"#666", marginBottom:5 }}>Name</div>
                  <input value={rName} onChange={e => setRName(e.target.value)} placeholder="Your name" style={inputStyle} />
                </div>
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:12, color:"#666", marginBottom:5 }}>Email <span style={{ color:"#bbb" }}>(the Google account you'll sign in with)</span></div>
                  <input value={rEmail} onChange={e => setREmail(e.target.value)} type="email" placeholder="you@example.com" style={inputStyle} />
                </div>
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:12, color:"#666", marginBottom:5 }}>Military affiliation</div>
                  <input value={rAff} onChange={e => setRAff(e.target.value)} placeholder="e.g., Navy — active duty, retiring 2027" style={inputStyle} />
                </div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:12, color:"#666", marginBottom:5 }}>Anything else? <span style={{ color:"#bbb" }}>(optional)</span></div>
                  <textarea value={rNote} onChange={e => setRNote(e.target.value)} rows={3} placeholder="How you heard about Mahan, who referred you, etc." style={{ ...inputStyle, resize:"vertical" }} />
                </div>

                <input value={honeypot} onChange={e => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off"
                  style={{ position:"absolute", left:"-9999px", width:1, height:1, opacity:0 }} aria-hidden="true" />

                {reqError && <div style={{ fontSize:12, color:"#A32D2D", marginBottom:12 }}>{reqError}</div>}

                <button onClick={submitRequest} disabled={submitting || !rEmail.trim()}
                  style={{ width:"100%", fontSize:14, fontWeight:600, padding:"11px", borderRadius:9, border:"none", background:"#0a2342", color:"#fff", cursor:(submitting||!rEmail.trim())?"default":"pointer", opacity:(submitting||!rEmail.trim())?0.5:1 }}>
                  {submitting ? "Sending…" : "Send request"}
                </button>
              </div>
            )}

          </div>
        </div>

        <div style={{ textAlign:"center", fontSize:11, color:"#bbb", marginTop:14, letterSpacing:".05em" }}>Mahan · usemahan.com</div>
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
function ContactCard({ c, idx, type, onOpen, onContactedToday, onFriendToggle, sessionNotes, setSessionNotes }) {
  const key  = `${type}-${c.id||c.fn}-${c.ln}-${idx}`;
  const av   = AV[type];
  const loc  = [c.city, c.state].filter(Boolean).join(", ");
  const [showSave,       setShowSave]       = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [syncing,        setSyncing]        = useState(false);
  const [contacted,      setContacted]      = useState(false);
  const [contacting,     setContacting]     = useState(false);
  const [togglingFriend, setTogglingFriend] = useState(false);
  const note = sessionNotes[key] || "";

  const cardBg     = c.friend ? "#eaf4ff" : "#fff";
  const cardBorder = c.friend ? "0.5px solid #b3d4f5" : "0.5px solid #e0e0de";

  async function handleFriendToggle(e) {
    e.stopPropagation();
    setTogglingFriend(true);
    const updated = { ...c, friend: !c.friend };
    await updateContact({ ...updated, col1: updated.friend ? "true" : "" });
    setTogglingFriend(false);
    onFriendToggle(updated);
  }

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
    <div style={{ background:cardBg, border:cardBorder, borderRadius:12, padding:"14px 16px", marginBottom:10 }}
      onMouseEnter={e => e.currentTarget.style.borderColor="#bbb"}
      onMouseLeave={e => e.currentTarget.style.borderColor=cardBorder.replace("0.5px solid ","")}>

      <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:9, cursor:"pointer" }} onClick={() => onOpen(c, type)}>
        <div style={{ width:34, height:34, minWidth:34, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:600, background:av.bg, color:av.color }}>{ini(c)}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:600, lineHeight:1.2, marginBottom:2 }}>{c.fn} {c.ln}</div>
          <div style={{ fontSize:11, color:"#777" }}>{c.rel || (c.company || "—")}</div>
        </div>
        <button onClick={handleFriendToggle} disabled={togglingFriend} title={c.friend ? "Remove personal friend" : "Mark as personal friend"}
          style={{ background:c.friend?"#dbeeff":"transparent", border:c.friend?"0.5px solid #b3d4f5":"0.5px solid #ddd", borderRadius:20, padding:"2px 8px", fontSize:12, cursor:"pointer", color:c.friend?"#1565a8":"#bbb", flexShrink:0, transition:"all .15s" }}>
          🤝
        </button>
      </div>

      <LastContactBadge c={c} type={type} />

      {(c.industry || c.company || loc) && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:9 }}>
          {c.industry && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, border:"0.5px solid #e0e0de", color:"#666", background:"#f9f9f7" }}>{c.industry}</span>}
          {c.company  && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, border:"0.5px solid #e0e0de", color:"#666", background:"#f9f9f7" }}>{c.company}</span>}
          {loc        && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, border:"0.5px solid #e0e0de", color:"#666", background:"#f9f9f7" }}>📍 {loc}</span>}
          {c.region   && <span style={{ fontSize:10, padding:"2px 7px", borderRadius:5, border:"0.5px solid #cfe2f3", color:"#0a66c2", background:"#f0f6fb", fontWeight:600 }}>🎯 {c.region}</span>}
        </div>
      )}

      <div style={{ display:"flex", gap:6, marginBottom:9, flexWrap:"wrap" }}>
        <button onClick={() => onOpen(c, type)} style={{ fontSize:11, padding:"3px 9px", borderRadius:6, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>View profile</button>
        {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" style={{ fontSize:11, padding:"3px 9px", borderRadius:6, border:"0.5px solid #ccc", color:"#555", textDecoration:"none" }}>LinkedIn</a>}
        {c.email    && <a href={`mailto:${c.email}`} style={{ fontSize:11, padding:"3px 9px", borderRadius:6, border:"0.5px solid #ccc", color:"#555", textDecoration:"none" }}>Email</a>}
        {c.notesDoc && <a href={c.notesDoc} target="_blank" rel="noreferrer" style={{ fontSize:11, padding:"3px 9px", borderRadius:6, border:"0.5px solid #ccc", color:"#555", textDecoration:"none" }}>📄 Notes</a>}
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
      {saved && <div style={{ fontSize:10, color:"#3B6D11", marginTop:3 }}>✓ Saved</div>}
    </div>
  );
}

// ─── Reusable edit field components ──────────────────────────────────────
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
function DetailPanel({ c, type, onClose, onSaved, onDeleted, interactions, sessionNotes, setSessionNotes, career }) {
  const [editing,           setEditing]           = useState(false);
  const [form,              setForm]              = useState({ ...c });
  const [saving,            setSaving]            = useState(false);
  const [noteSaved,         setNoteSaved]         = useState(false);
  const [noteSyncing,       setNoteSyncing]       = useState(false);
  const [draftLoading,      setDraftLoading]      = useState(false);
  const [draft,             setDraft]             = useState(null);
  const [confirmArchive,    setConfirmArchive]    = useState(false);
  const [archiving,         setArchiving]         = useState(false);
  const [confirmHardDelete, setConfirmHardDelete] = useState(false);
  const [hardDeleting,      setHardDeleting]      = useState(false);

  if (!c) return null;
  const av   = AV[type] || AV.active;
  const d    = pd(editing ? form.lc : c.lc);
  const cls  = lcCls(d, type);
  const days = d ? ds(d) : null;
  const dl   = days === null ? null : days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
  const noteKey = `detail-${c.id}`;
  const note    = sessionNotes[noteKey] || "";

  const history = interactions
    .filter(i => i.id && c.id && i.id === c.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  async function handleSaveEdit() {
    setSaving(true);
    const payload = { ...form, col1: form.friend ? "true" : "" };
    await updateContact(payload);
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

  async function handleGenerateDraft() {
    setDraftLoading(true);
    setDraft(null);
    const result = await generateEmailDraft(c, interactions);
    setDraft(result);
    setDraftLoading(false);
  }

  async function handleArchive() {
    setArchiving(true);
    const updated = { ...c, status: "Inactive" };
    await updateContact(updated);
    await postToSheet("note", {
      id: c.id, firstName: c.fn, lastName: c.ln,
      note: "Contact archived (moved to Inactive).",
      timestamp: new Date().toISOString(),
    });
    setArchiving(false);
    onDeleted(updated);
  }

  async function handleHardDelete() {
    setHardDeleting(true);
    try {
      const credential = getStoredCredential();
      await fetch("/api/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(credential ? { "Authorization": `Bearer ${credential}` } : {}),
        },
        body: JSON.stringify({ id: c.id }),
      });
    } catch (err) { console.error("Delete failed:", err); }
    setHardDeleting(false);
    onDeleted(null);
  }

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", zIndex:200, display:"flex", alignItems:window.innerWidth<640?"flex-end":"center", justifyContent:"center", padding:window.innerWidth<640?0:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:window.innerWidth<640?"16px 16px 0 0":16, border:"0.5px solid #e0e0de", width:window.innerWidth<640?"100%":"min(580px,100%)", maxHeight:window.innerWidth<640?"92vh":"88vh", overflowY:"auto", padding:window.innerWidth<640?"20px 16px":24 }}>

        <div style={{ display:"flex", alignItems:"flex-start", gap:14, marginBottom:18 }}>
          <div style={{ width:52, height:52, minWidth:52, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:600, background:av.bg, color:av.color }}>{ini(editing?form:c)}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:20, fontWeight:600, marginBottom:3 }}>
              {editing ? `${form.fn} ${form.ln}` : `${c.fn} ${c.ln}`}
              {(editing ? form.friend : c.friend) && <span style={{ marginLeft:8, fontSize:12, padding:"2px 9px", borderRadius:10, background:"#dbeeff", color:"#1565a8", border:"0.5px solid #b3d4f5", fontWeight:600 }}>🤝 Personal Friend</span>}
            </div>
            <div style={{ fontSize:13, color:"#777" }}>{c.rel || (c.company || "—")}</div>
          </div>
          <div style={{ display:"flex", gap:8, flexShrink:0, flexWrap:"wrap", justifyContent:"flex-end" }}>
            {!editing && <button onClick={() => { setEditing(true); setConfirmArchive(false); setConfirmHardDelete(false); }} style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>✏️ Edit</button>}
            {editing && <>
              <button onClick={handleSaveEdit} disabled={saving} style={{ fontSize:12, fontWeight:600, padding:"5px 14px", borderRadius:7, border:"none", background:"#1a1a18", color:"#fff", cursor:"pointer" }}>{saving?"Saving…":"Save"}</button>
              <button onClick={() => { setEditing(false); setForm({ ...c }); }} style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>Cancel</button>
            </>}
            <button onClick={onClose} style={{ background:"transparent", border:"0.5px solid #ccc", borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:12, color:"#666" }}>✕</button>
          </div>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, padding:"5px 10px", borderRadius:8, marginBottom:16, ...BADGE[cls], width:"fit-content" }}>
          {d ? <><span style={{ fontWeight:500 }}>Last contact: {fd(d)}</span><span style={{ opacity:.75 }}>— {dl}</span></> : <span>No interaction on record</span>}
        </div>

        {(c.linkedin || c.email || c.notesDoc || c.officePhone || c.mobilePhone) && !editing && (
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
            {c.linkedin    && <a href={c.linkedin} target="_blank" rel="noreferrer" style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:"0.5px solid #ccc", color:"#555", textDecoration:"none" }}>LinkedIn ↗</a>}
            {c.email       && <a href={`mailto:${c.email}`} style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:"0.5px solid #ccc", color:"#555", textDecoration:"none" }}>{c.email}</a>}
            {c.officePhone && <a href={`tel:${c.officePhone}`} style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:"0.5px solid #ccc", color:"#555", textDecoration:"none" }}>☎ {c.officePhone}</a>}
            {c.mobilePhone && <a href={`tel:${c.mobilePhone}`} style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:"0.5px solid #ccc", color:"#555", textDecoration:"none" }}>📱 {c.mobilePhone}</a>}
            {c.notesDoc    && <a href={c.notesDoc} target="_blank" rel="noreferrer" style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:"0.5px solid #ccc", color:"#555", textDecoration:"none" }}>📄 Open notes ↗</a>}
          </div>
        )}

        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:500, color:"#aaa", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8 }}>Details</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            <DetailSelectField label="Status"       k="status"   options={["Never Contacted","Active","Inactive"]} form={form} setForm={setForm} editing={editing} />
            <DetailField label="Industry"      k="industry"    form={form} setForm={setForm} editing={editing} />
            <DetailField label="Company"       k="company"     form={form} setForm={setForm} editing={editing} />
            <DetailField label="Relationship"  k="rel"         form={form} setForm={setForm} editing={editing} />
            <DetailField label="City"          k="city"        form={form} setForm={setForm} editing={editing} />
            <DetailField label="State"         k="state"       form={form} setForm={setForm} editing={editing} />
            <DetailField label="Undergrad"     k="ug"          form={form} setForm={setForm} editing={editing} />
            <DetailField label="Grad school"   k="grad"        form={form} setForm={setForm} editing={editing} />
            <DetailField label="LinkedIn"      k="linkedin"    form={form} setForm={setForm} editing={editing} />
            <DetailField label="Email"         k="email"       type="email" form={form} setForm={setForm} editing={editing} />
            <DetailField label="Office Phone"  k="officePhone" form={form} setForm={setForm} editing={editing} />
            <DetailField label="Mobile Phone"  k="mobilePhone" form={form} setForm={setForm} editing={editing} />
            <DetailField label="Last check-in" k="lc"          type="date" form={form} setForm={setForm} editing={editing} />
            <DetailField label="Next check-in" k="nc"          type="date" form={form} setForm={setForm} editing={editing} />
            <DetailField label="Notes Doc URL" k="notesDoc"    form={form} setForm={setForm} editing={editing} />
            <DetailField label="Target Region" k="region"      form={form} setForm={setForm} editing={editing} />
            {career && (<>
            <DetailField label="Country"           k="country"    form={form} setForm={setForm} editing={editing} />
            <DetailField label="Service / branch"  k="branch"     form={form} setForm={setForm} editing={editing} />
            <DetailSelectField label="Category"    k="category"   options={["","Military","Diplomatic","Government","Business","Academia","Other"]} form={form} setForm={setForm} editing={editing} />
            <DetailField label="Where met / tour"  k="metContext" form={form} setForm={setForm} editing={editing} />
            <DetailField label="Language(s)"       k="languages"  form={form} setForm={setForm} editing={editing} />
            <DetailField label="Rank / title"      k="rankTitle"  form={form} setForm={setForm} editing={editing} />
            </>)}
          </div>
          {editing && (
            <div style={{ marginTop:10 }}>
              <button onClick={() => setForm(p => ({ ...p, friend: !p.friend }))}
                style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:20, border:form.friend?"2px solid #1565a8":"1.5px solid #ccc", background:form.friend?"#dbeeff":"#fff", color:form.friend?"#1565a8":"#888", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                <span style={{ fontSize:16 }}>🤝</span>
                {form.friend ? "Personal Friend" : "Mark as Personal Friend"}
              </button>
            </div>
          )}
        </div>

        {!editing && (
          <div style={{ marginBottom:18, padding:"12px 14px", background:"#fafaf8", borderRadius:10, border:"0.5px solid #eee" }}>
            <div style={{ fontSize:11, fontWeight:500, color:"#aaa", textTransform:"uppercase", letterSpacing:".05em", marginBottom:10 }}>Remove contact</div>
            {!confirmArchive && !confirmHardDelete && (
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button onClick={() => setConfirmArchive(true)} style={{ fontSize:12, padding:"5px 14px", borderRadius:7, border:"0.5px solid #f0c8c3", background:"#fdf0ee", color:"#c0392b", cursor:"pointer" }}>🗄 Archive (move to Inactive)</button>
                <button onClick={() => setConfirmHardDelete(true)} style={{ fontSize:12, padding:"5px 14px", borderRadius:7, border:"0.5px solid #f0c8c3", background:"#fdf0ee", color:"#c0392b", cursor:"pointer" }}>🗑 Delete permanently</button>
              </div>
            )}
            {confirmArchive && (
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <span style={{ fontSize:12, color:"#c0392b", fontWeight:500 }}>Move {c.fn} to Inactive? History is preserved.</span>
                <button onClick={handleArchive} disabled={archiving} style={{ fontSize:12, fontWeight:600, padding:"5px 14px", borderRadius:7, border:"none", background:"#c0392b", color:"#fff", cursor:"pointer" }}>{archiving?"Archiving…":"Yes, archive"}</button>
                <button onClick={() => setConfirmArchive(false)} style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>Cancel</button>
              </div>
            )}
            {confirmHardDelete && (
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <span style={{ fontSize:12, color:"#c0392b", fontWeight:500 }}>Permanently delete {c.fn} {c.ln}? This cannot be undone.</span>
                <button onClick={handleHardDelete} disabled={hardDeleting} style={{ fontSize:12, fontWeight:600, padding:"5px 14px", borderRadius:7, border:"none", background:"#7b0000", color:"#fff", cursor:"pointer" }}>{hardDeleting?"Deleting…":"Yes, delete forever"}</button>
                <button onClick={() => setConfirmHardDelete(false)} style={{ fontSize:12, padding:"5px 12px", borderRadius:7, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>Cancel</button>
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:500, color:"#aaa", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8 }}>Log a note</div>
          <textarea value={note} onChange={e => setSessionNotes(p => ({ ...p, [noteKey]: e.target.value }))}
            placeholder="Add a note about this interaction…" rows={3}
            style={{ width:"100%", fontSize:13, padding:"8px 10px", border:"0.5px solid #e0e0de", borderRadius:8, resize:"vertical", minHeight:70, fontFamily:"inherit", background:"#f9f9f7", color:"#222", lineHeight:1.5, outline:"none", boxSizing:"border-box" }} />
          <button onClick={handleSaveNote} disabled={noteSyncing} style={{ marginTop:6, fontSize:12, padding:"5px 14px", borderRadius:7, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>
            {noteSyncing ? "Saving…" : "Save note"}
          </button>
          {noteSaved && <span style={{ fontSize:11, color:"#3B6D11", marginLeft:8 }}>✓ Saved</span>}
        </div>

        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:11, fontWeight:500, color:"#aaa", textTransform:"uppercase", letterSpacing:".05em", marginBottom:8 }}>LinkedIn message</div>
          <button onClick={handleGenerateDraft} disabled={draftLoading}
            style={{ fontSize:13, fontWeight:500, padding:"8px 16px", borderRadius:8, border:"none", background:"#0a2342", color:"#fff", cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
            {draftLoading ? "✍️ Drafting…" : "💬 Draft LinkedIn message"}
          </button>
          {draft && (
            <div style={{ marginTop:12 }}>
              <div style={{ background:"#f9f9f7", border:"0.5px solid #e0e0de", borderRadius:10, padding:"14px 16px", marginBottom:10 }}>
                <div style={{ fontSize:11, color:"#999", textTransform:"uppercase", letterSpacing:".04em", marginBottom:6 }}>Ready to copy</div>
                <div style={{ fontSize:13, color:"#333", lineHeight:1.7, whiteSpace:"pre-wrap" }}>{draft.body}</div>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button onClick={() => navigator.clipboard.writeText(draft.body)} style={{ fontSize:12, fontWeight:500, padding:"6px 14px", borderRadius:7, border:"none", background:"#0a66c2", color:"#fff", cursor:"pointer" }}>Copy for LinkedIn</button>
                <button onClick={handleGenerateDraft} disabled={draftLoading} style={{ fontSize:12, padding:"6px 14px", borderRadius:7, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>Regenerate</button>
              </div>
            </div>
          )}
        </div>

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
const modalInp = { fontSize:13, padding:"8px 10px", border:"0.5px solid #e0e0de", borderRadius:8, background:"#f9f9f7", color:"#222", fontFamily:"inherit", outline:"none", width:"100%", boxSizing:"border-box" };
const modalLbl = { fontSize:11, fontWeight:500, color:"#666", textTransform:"uppercase", letterSpacing:".04em", marginBottom:4, display:"block" };

function ModalField({ label, k, type="text", placeholder="", form, set, errors }) {
  return (
    <div style={{ display:"flex", flexDirection:"column" }}>
      <label style={modalLbl}>{label}</label>
      <input type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder}
        style={{ ...modalInp, borderColor:errors[k]?"#E24B4A":"#e0e0de" }} />
      {errors[k] && <div style={{ fontSize:11, color:"#A32D2D", marginTop:2 }}>{errors[k]}</div>}
    </div>
  );
}

async function parseBusinessCard(imageBase64, mediaType) {
  const systemPrompt = `You extract structured contact information from a photo of a business card.

Return ONLY a JSON object with these exact keys (use empty string "" if not found):
{
  "fn": "first name",
  "ln": "last name",
  "company": "company or organization",
  "industry": "best-guess industry based on title/company",
  "email": "email address",
  "officePhone": "office / main / work / direct phone",
  "mobilePhone": "mobile / cell phone",
  "city": "city",
  "state": "state or region",
  "linkedin": "LinkedIn URL if printed on the card",
  "notes": "the person's job title/role, plus anything else useful as a quick reference"
}

Rules:
- Return ONLY the JSON object, no markdown, no backticks, no preamble
- If a field isn't on the card, use an empty string
- If two numbers are labeled (O/M/C/Cell/Direct/Mobile), map office vs mobile accordingly; a single unlabeled number goes in mobilePhone
- Put the person's job title in "notes"`;

  const credential = getStoredCredential();
  const response = await fetch("/api/draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(credential ? { "Authorization": `Bearer ${credential}` } : {}),
    },
    body: JSON.stringify({ imageBase64, mediaType, systemPrompt }),
  });

  const data = await response.json();
  const text = (data.text || "").trim();

  try {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// Read an image File, downscale to a max dimension, return { base64, mediaType } as JPEG.
function fileToResizedBase64(file, maxDim = 1568, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode that image."));
      img.onload = () => {
        let width = img.width, height = img.height;
        if (Math.max(width, height) > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function NewContactModal({ onClose, onAdd, career }) {
  const empty = { fn:"", ln:"", company:"", industry:"", rel:"", status:"Never Contacted", city:"", state:"", linkedin:"", email:"", officePhone:"", mobilePhone:"", ug:"", grad:"", lc:"", nc:"", notes:"", notesDoc:"", region:"", friend:false, country:"", branch:"", category:"", metContext:"", languages:"", rankTitle:"" };
  const [form,    setForm]    = useState(empty);
  const [errors,  setErrors]  = useState({});
  const [syncing, setSyncing] = useState(false);
  const [liText,  setLiText]  = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed,  setParsed]  = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned,  setScanned]  = useState(false);

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleParseLinkedIn() {
    if (!liText.trim()) return;
    setParsing(true); setParsed(false);
    const result = await parseLinkedInProfile(liText);
    setParsing(false);
    if (result) {
      setForm(p => ({ ...p, fn:result.fn||p.fn, ln:result.ln||p.ln, company:result.company||p.company, industry:result.industry||p.industry, city:result.city||p.city, state:result.state||p.state, ug:result.ug||p.ug, grad:result.grad||p.grad, notes:result.notes||p.notes }));
      setParsed(true);
      setTimeout(() => setParsed(false), 3000);
    } else {
      alert("Couldn't parse that text — fill in manually.");
    }
  }

  async function handleScanCard(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setScanning(true); setScanned(false);
    try {
      const { base64, mediaType } = await fileToResizedBase64(file);
      const r = await parseBusinessCard(base64, mediaType);
      if (r) {
        setForm(p => ({ ...p,
          fn:r.fn||p.fn, ln:r.ln||p.ln, company:r.company||p.company, industry:r.industry||p.industry,
          email:r.email||p.email, officePhone:r.officePhone||p.officePhone, mobilePhone:r.mobilePhone||p.mobilePhone,
          city:r.city||p.city, state:r.state||p.state, linkedin:r.linkedin||p.linkedin, notes:r.notes||p.notes }));
        setScanned(true);
        setTimeout(() => setScanned(false), 3000);
      } else {
        alert("Couldn't read that card — try a clearer, straight-on photo or fill in manually.");
      }
    } catch (err) {
      alert(err.message || "Something went wrong reading the card.");
    } finally {
      setScanning(false);
    }
  }

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

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", zIndex:200, display:"flex", alignItems:window.innerWidth<640?"flex-end":"center", justifyContent:"center", padding:window.innerWidth<640?0:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:window.innerWidth<640?"16px 16px 0 0":16, border:"0.5px solid #e0e0de", width:window.innerWidth<640?"100%":"min(580px,100%)", maxHeight:window.innerWidth<640?"92vh":"90vh", overflowY:"auto", padding:window.innerWidth<640?"20px 16px":24 }}>
        <div style={{ display:"flex", alignItems:"flex-start", marginBottom:20 }}>
          <div><div style={{ fontSize:19, fontWeight:600, marginBottom:3 }}>New contact</div><div style={{ fontSize:13, color:"#777" }}>Add someone to your network</div></div>
          <button onClick={onClose} style={{ marginLeft:"auto", background:"transparent", border:"0.5px solid #ccc", borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:12, color:"#666" }}>✕ Close</button>
        </div>

        <div style={{ background:"#f0f6fb", border:"0.5px solid #cfe2f3", borderRadius:10, padding:"14px 16px", marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:600, color:"#0a66c2", marginBottom:6 }}>💼 Paste from LinkedIn (optional)</div>
          <textarea value={liText} onChange={e => setLiText(e.target.value)} placeholder="Paste LinkedIn profile text here…" rows={4}
            style={{ width:"100%", fontSize:12, padding:"8px 10px", border:"0.5px solid #cfe2f3", borderRadius:8, background:"#fff", color:"#222", fontFamily:"inherit", outline:"none", resize:"vertical", boxSizing:"border-box", marginBottom:8 }} />
          <button onClick={handleParseLinkedIn} disabled={parsing || !liText.trim()}
            style={{ fontSize:12, fontWeight:500, padding:"6px 14px", borderRadius:7, border:"none", background:"#0a66c2", color:"#fff", cursor:liText.trim()?"pointer":"default", opacity:liText.trim()?1:0.5 }}>
            {parsing ? "✍️ Parsing…" : "Fill fields from LinkedIn"}
          </button>
          {parsed && <span style={{ fontSize:11, color:"#3B6D11", marginLeft:8 }}>✓ Fields filled — review and edit as needed</span>}
        </div>

        <div style={{ background:"#f4f0fb", border:"0.5px solid #ddd0f0", borderRadius:10, padding:"14px 16px", marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:600, color:"#6b3fb0", marginBottom:6 }}>📇 Scan a business card (optional)</div>
          <div style={{ fontSize:11, color:"#777", marginBottom:8 }}>Take a photo or pick one — Claude reads it and fills the fields below.</div>
          <label style={{ display:"inline-block", fontSize:12, fontWeight:500, padding:"6px 14px", borderRadius:7, background: scanning ? "#9a86c4" : "#6b3fb0", color:"#fff", cursor: scanning ? "default" : "pointer" }}>
            {scanning ? "🔍 Reading card…" : "📷 Scan business card"}
            <input type="file" accept="image/*" capture="environment" onChange={handleScanCard} disabled={scanning} style={{ display:"none" }} />
          </label>
          {scanned && <span style={{ fontSize:11, color:"#3B6D11", marginLeft:8 }}>✓ Fields filled — review and edit as needed</span>}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
          <ModalField label="First name *" k="fn"          placeholder="Jane"                          form={form} set={set} errors={errors} />
          <ModalField label="Last name *"  k="ln"          placeholder="Smith"                         form={form} set={set} errors={errors} />
          <ModalField label="Company"      k="company"     placeholder="Acme Corp"                     form={form} set={set} errors={errors} />
          <ModalField label="Industry"     k="industry"    placeholder="Defense, Tech…"                form={form} set={set} errors={errors} />
          <ModalField label="Relationship" k="rel"         placeholder="USNA classmate, FAO…"          form={form} set={set} errors={errors} />
          <div style={{ display:"flex", flexDirection:"column" }}>
            <label style={modalLbl}>Status</label>
            <select value={form.status} onChange={e => set("status", e.target.value)} style={{ ...modalInp, cursor:"pointer" }}>
              <option value="Never Contacted">Never Contacted</option>
              <option value="Active">Active</option>
            </select>
          </div>
          <ModalField label="City"          k="city"        placeholder="Arlington"                     form={form} set={set} errors={errors} />
          <ModalField label="State"         k="state"       placeholder="VA"                            form={form} set={set} errors={errors} />
          <ModalField label="LinkedIn URL"  k="linkedin"    type="url" placeholder="https://linkedin.com/in/…" form={form} set={set} errors={errors} />
          <ModalField label="Email"         k="email"       type="email" placeholder="jane@example.com" form={form} set={set} errors={errors} />
          <ModalField label="Office Phone"  k="officePhone" placeholder="+1 817 555 0100"              form={form} set={set} errors={errors} />
          <ModalField label="Mobile Phone"  k="mobilePhone" placeholder="+55 61 99999 0000"            form={form} set={set} errors={errors} />
          <ModalField label="Undergrad"     k="ug"          placeholder="USNA"                         form={form} set={set} errors={errors} />
          <ModalField label="Grad school"   k="grad"        placeholder="Harvard"                      form={form} set={set} errors={errors} />
          <ModalField label="Last check-in" k="lc"          type="date"                                form={form} set={set} errors={errors} />
          <ModalField label="Next check-in" k="nc"          type="date"                                form={form} set={set} errors={errors} />
          <ModalField label="Notes Doc URL" k="notesDoc"    type="url" placeholder="https://docs.google.com/…" form={form} set={set} errors={errors} />
          <ModalField label="Target Region" k="region"      placeholder="DFW, Newport…"                form={form} set={set} errors={errors} />
          {career && (<>
          <ModalField label="Country"          k="country"    placeholder="Brazil, Indonesia…"    form={form} set={set} errors={errors} />
          <ModalField label="Service / branch" k="branch"     placeholder="US Army, PLA Navy…"     form={form} set={set} errors={errors} />
          <div style={{ display:"flex", flexDirection:"column" }}>
            <label style={modalLbl}>Category</label>
            <select value={form.category} onChange={e => set("category", e.target.value)} style={{ ...modalInp, cursor:"pointer" }}>
              <option value="">—</option>
              <option value="Military">Military</option>
              <option value="Diplomatic">Diplomatic</option>
              <option value="Government">Government</option>
              <option value="Business">Business</option>
              <option value="Academia">Academia</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <ModalField label="Where you met / tour" k="metContext" placeholder="Manila tour, PACOM conf…" form={form} set={set} errors={errors} />
          <ModalField label="Language(s)"      k="languages"  placeholder="Portuguese, Spanish…"   form={form} set={set} errors={errors} />
          <ModalField label="Rank / title"     k="rankTitle"  placeholder="COL, Attaché…"          form={form} set={set} errors={errors} />
          </>)}
          <div style={{ gridColumn:"1/-1", display:"flex", flexDirection:"column" }}>
            <label style={modalLbl}>Notes</label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="How you know them, talking points…" rows={3}
              style={{ ...modalInp, resize:"vertical", minHeight:64 }} />
          </div>
          <div style={{ gridColumn:"1/-1" }}>
            <button type="button" onClick={() => set("friend", !form.friend)}
              style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"8px 16px", borderRadius:20, border:form.friend?"2px solid #1565a8":"1.5px solid #ccc", background:form.friend?"#dbeeff":"#fff", color:form.friend?"#1565a8":"#888", fontSize:13, fontWeight:600, cursor:"pointer" }}>
              <span style={{ fontSize:16 }}>🤝</span>
              {form.friend ? "Personal Friend" : "Mark as Personal Friend"}
            </button>
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

// ─── Settings API helpers ─────────────────────────────────────────────────
async function fetchSettings() {
  const credential = getStoredCredential();
  const res = await fetch("/api/settings", {
    headers: { ...(credential ? { "Authorization": `Bearer ${credential}` } : {}) }
  });
  const data = await res.json();
  return data.settings || null;
}

async function saveSettings(updates) {
  const credential = getStoredCredential();
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(credential ? { "Authorization": `Bearer ${credential}` } : {}),
    },
    body: JSON.stringify(updates),
  });
  return res.ok;
}

// ─── Onboarding wizard ────────────────────────────────────────────────────
function OnboardingWizard({ email, onComplete }) {
  const [step,   setStep]   = useState(0);
  const [saving, setSaving] = useState(false);
  const [form,   setForm]   = useState({
    display_name:             "",
    orientation:              "transition",
    current_post:             "",
    focus_regions:            "",
    transition_year:          2028,
    priority_region:          "DFW",
    priority_sector:          "Education",
    secondary_sectors:        ["Defense","Consulting","Government","Energy","Nonprofit"],
    weekly_outreach_target:   5,
    monthly_new_contact_target: 8,
    region_target_count:      100,
    sector_target_count:      40,
    overdue_days:             90,
    stale_soon_days:          60,
    cold_max_age_days:        30,
    cold_backlog_ceiling:     10,
    digest_email:             email,
    digest_enabled:           true,
  });

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  const welcomeStep = {
    title: "Welcome to Mahan",
    subtitle: "Let's set up your account in a few quick steps.",
    content: (
      <div>
        <div style={{ marginBottom:16 }}>
          <label style={modalLbl}>Your name</label>
          <input value={form.display_name} onChange={e => set("display_name", e.target.value)} placeholder="Jack" style={modalInp} />
        </div>
        <div>
          <label style={modalLbl}>Digest email address</label>
          <input type="email" value={form.digest_email} onChange={e => set("digest_email", e.target.value)} placeholder="you@gmail.com" style={modalInp} />
          <div style={{ fontSize:11, color:"#999", marginTop:4 }}>Where your Sunday digest gets sent</div>
        </div>
      </div>
    )
  };

  const orientationStep = {
    title: "What should Mahan help you with?",
    subtitle: "This shapes your weekly digest. You can change it anytime in Settings.",
    content: (
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {[
          ["transition", "Building toward my transition", "Track contacts and ramp outreach toward a target exit year."],
          ["career", "Managing my network while I keep serving", "Keep contacts across posts and tours warm over a long career."],
        ].map(([id, label, desc]) => {
          const active = form.orientation === id;
          return (
            <button key={id} onClick={() => set("orientation", id)}
              style={{ textAlign:"left", padding:"14px 16px", borderRadius:12, cursor:"pointer",
                border: active ? "2px solid #0a2342" : "0.5px solid #d8d8d4", background: active ? "#f0f4f9" : "#fff" }}>
              <div style={{ fontSize:15, fontWeight:600, color:"#1a1a18", marginBottom:3 }}>{label}</div>
              <div style={{ fontSize:13, color:"#777", lineHeight:1.5 }}>{desc}</div>
            </button>
          );
        })}
      </div>
    )
  };

  const timelineStep = {
    title: "Your transition timeline",
    subtitle: "When and where are you heading?",
    content: (
      <div>
        <div style={{ marginBottom:16 }}>
          <label style={modalLbl}>Target retirement / transition year</label>
          <input type="number" value={form.transition_year} onChange={e => set("transition_year", parseInt(e.target.value))} min={2024} max={2040} style={modalInp} />
        </div>
        <div>
          <label style={modalLbl}>Target region (city / metro area)</label>
          <input value={form.priority_region} onChange={e => set("priority_region", e.target.value)} placeholder="DFW, DC, Austin…" style={modalInp} />
          <div style={{ fontSize:11, color:"#999", marginTop:4 }}>Your contacts in this region get priority weighting</div>
        </div>
        <div style={{ marginTop:16 }}>
          <label style={modalLbl}>Region contact target</label>
          <input type="number" value={form.region_target_count} onChange={e => set("region_target_count", parseInt(e.target.value))} style={modalInp} />
          <div style={{ fontSize:11, color:"#999", marginTop:4 }}>How many contacts you want in your target region by transition</div>
        </div>
      </div>
    )
  };

  const sectorStep = {
    title: "Your target sector",
    subtitle: "What kind of work are you heading toward?",
    content: (
      <div>
        <div style={{ marginBottom:16 }}>
          <label style={modalLbl}>Primary sector</label>
          <input value={form.priority_sector} onChange={e => set("priority_sector", e.target.value)} placeholder="Education, Defense, Government…" style={modalInp} />
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={modalLbl}>Secondary sectors (comma separated)</label>
          <input value={form.secondary_sectors.join(", ")}
            onChange={e => set("secondary_sectors", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
            placeholder="Defense, Consulting, Government" style={modalInp} />
        </div>
        <div>
          <label style={modalLbl}>Sector contact target</label>
          <input type="number" value={form.sector_target_count} onChange={e => set("sector_target_count", parseInt(e.target.value))} style={modalInp} />
        </div>
      </div>
    )
  };

  const outreachStep = {
    title: "Outreach goals",
    subtitle: "Set your weekly networking targets.",
    content: (
      <div>
        <div style={{ marginBottom:16 }}>
          <label style={modalLbl}>Weekly outreach target (interactions per week)</label>
          <input type="number" value={form.weekly_outreach_target} onChange={e => set("weekly_outreach_target", parseInt(e.target.value))} min={1} max={50} style={modalInp} />
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={modalLbl}>Monthly new contacts target</label>
          <input type="number" value={form.monthly_new_contact_target} onChange={e => set("monthly_new_contact_target", parseInt(e.target.value))} min={0} max={100} style={modalInp} />
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={modalLbl}>Overdue threshold (days without contact)</label>
          <input type="number" value={form.overdue_days} onChange={e => set("overdue_days", parseInt(e.target.value))} min={7} max={365} style={modalInp} />
        </div>
        <div>
          <label style={modalLbl}>Early warning threshold (days)</label>
          <input type="number" value={form.stale_soon_days} onChange={e => set("stale_soon_days", parseInt(e.target.value))} min={7} max={365} style={modalInp} />
          <div style={{ fontSize:11, color:"#999", marginTop:4 }}>Contacts approaching overdue get flagged at this point</div>
        </div>
      </div>
    )
  };

  const careerFocusStep = {
    title: "Your post & network",
    subtitle: "Where you are and where your network lives.",
    content: (
      <div>
        <div style={{ marginBottom:16 }}>
          <label style={modalLbl}>Current post</label>
          <input value={form.current_post} onChange={e => set("current_post", e.target.value)} placeholder="e.g., Brasília, Bogotá…" style={modalInp} />
        </div>
        <div style={{ marginBottom:16 }}>
          <label style={modalLbl}>Focus regions / countries</label>
          <input value={form.focus_regions} onChange={e => set("focus_regions", e.target.value)} placeholder="Brazil, PACOM, Colombia…" style={modalInp} />
          <div style={{ fontSize:11, color:"#999", marginTop:4 }}>Your digest watches for contacts in these areas going cold</div>
        </div>
        <div>
          <label style={modalLbl}>Flag a contact as going cold after (days)</label>
          <input type="number" value={form.overdue_days} onChange={e => set("overdue_days", parseInt(e.target.value))} min={7} max={365} style={modalInp} />
        </div>
      </div>
    )
  };

  const summaryStep = {
    title: "You're all set",
    subtitle: form.orientation === "career"
      ? "Your digest will keep your network warm every Sunday."
      : "Your digest will be personalized to these goals every Sunday.",
    content: (
      <div style={{ background:"#f9f9f7", borderRadius:10, padding:"16px 18px" }}>
        {(form.orientation === "career"
          ? [
              ["Name", form.display_name || "—"],
              ["Digest email", form.digest_email],
              ["Mode", "Career — network maintenance"],
              ["Current post", form.current_post || "—"],
              ["Focus regions", form.focus_regions || "—"],
              ["Cold flag", form.overdue_days + " days"],
            ]
          : [
              ["Name", form.display_name || "—"],
              ["Digest email", form.digest_email],
              ["Mode", "Transition"],
              ["Transition year", form.transition_year],
              ["Target region", form.priority_region + " (target: " + form.region_target_count + ")"],
              ["Primary sector", form.priority_sector],
              ["Weekly outreach", form.weekly_outreach_target + "/week"],
            ]
        ).map(([label, value]) => (
          <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"0.5px solid #e8e8e4", fontSize:13 }}>
            <span style={{ color:"#999" }}>{label}</span>
            <span style={{ fontWeight:500, color:"#1a1a18" }}>{value}</span>
          </div>
        ))}
      </div>
    )
  };

  const steps = form.orientation === "career"
    ? [welcomeStep, orientationStep, careerFocusStep, summaryStep]
    : [welcomeStep, orientationStep, timelineStep, sectorStep, outreachStep, summaryStep];

  async function finish() {
    setSaving(true);
    await saveSettings({ ...form, onboarding_complete: true });
    setSaving(false);
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...parsed, onboardingComplete: true }));
    }
    onComplete(form);
  }

  const current = steps[step] || steps[steps.length - 1];
  const isLast  = step >= steps.length - 1;

  return (
    <div style={{ minHeight:"100vh", background:"#fafaf8", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Georgia,serif", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:16, border:"0.5px solid #e0e0de", width:"min(520px,100%)", overflow:"hidden" }}>
        <div style={{ background:"#0a2342", padding:"24px 28px" }}>
          <div style={{ fontSize:11, color:"#c9a84c", letterSpacing:".12em", textTransform:"uppercase", marginBottom:6 }}>Mahan · Setup</div>
          <div style={{ fontSize:20, fontWeight:700, color:"#fff", marginBottom:4 }}>{current.title}</div>
          <div style={{ fontSize:13, color:"#8fadc8" }}>{current.subtitle}</div>
          <div style={{ display:"flex", gap:6, marginTop:16 }}>
            {steps.map((_, i) => (
              <div key={i} style={{ height:3, flex:1, borderRadius:2, background: i <= step ? "#c9a84c" : "rgba(255,255,255,.2)" }} />
            ))}
          </div>
        </div>
        <div style={{ padding:"24px 28px" }}>
          {current.content}
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:24, paddingTop:16, borderTop:"0.5px solid #eee" }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s-1)}
                style={{ fontSize:13, padding:"8px 16px", borderRadius:8, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>
                Back
              </button>
            )}
            {!isLast && (
              <button onClick={() => setStep(s => s+1)}
                style={{ fontSize:13, fontWeight:600, padding:"8px 20px", borderRadius:8, border:"none", background:"#0a2342", color:"#fff", cursor:"pointer" }}>
                Next
              </button>
            )}
            {isLast && (
              <button onClick={finish} disabled={saving}
                style={{ fontSize:13, fontWeight:600, padding:"8px 20px", borderRadius:8, border:"none", background:"#2e7d4f", color:"#fff", cursor:"pointer" }}>
                {saving ? "Saving…" : "Get started →"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Settings panel ───────────────────────────────────────────────────────
function SettingsPanel({ settings, onClose, onSaved }) {
  const [form,   setForm]   = useState({ ...settings });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSave() {
    setSaving(true);
    await saveSettings(form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved(form);
  }

  const sectionStyle = { marginBottom:24 };
  const headStyle = { fontSize:11, fontWeight:600, color:"#aaa", textTransform:"uppercase", letterSpacing:".05em", marginBottom:12, paddingBottom:8, borderBottom:"0.5px solid #eee" };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:16, border:"0.5px solid #e0e0de", width:"min(560px,100%)", maxHeight:"90vh", overflowY:"auto", padding:24 }}>

        <div style={{ display:"flex", alignItems:"center", marginBottom:24 }}>
          <div>
            <div style={{ fontSize:19, fontWeight:600 }}>Digest Settings</div>
            <div style={{ fontSize:13, color:"#777", marginTop:2 }}>Customize your weekly briefing</div>
          </div>
          <button onClick={onClose} style={{ marginLeft:"auto", background:"transparent", border:"0.5px solid #ccc", borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:12, color:"#666" }}>✕</button>
        </div>

        <div style={sectionStyle}>
          <div style={headStyle}>Account</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div>
              <label style={detailLbl}>Display name</label>
              <input value={form.display_name||""} onChange={e => set("display_name", e.target.value)} style={detailInp} />
            </div>
            <div>
              <label style={detailLbl}>Digest email</label>
              <input type="email" value={form.digest_email||""} onChange={e => set("digest_email", e.target.value)} style={detailInp} />
            </div>
          </div>
          <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:10 }}>
            <label style={{ fontSize:13, color:"#555" }}>Weekly digest enabled</label>
            <button onClick={() => set("digest_enabled", !form.digest_enabled)}
              style={{ padding:"4px 12px", borderRadius:20, border:`1.5px solid ${form.digest_enabled?"#2e7d4f":"#ccc"}`, background:form.digest_enabled?"#EAF3DE":"#fff", color:form.digest_enabled?"#2e7d4f":"#888", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {form.digest_enabled ? "On" : "Off"}
            </button>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={headStyle}>Mode</div>
          <div style={{ display:"flex", gap:8 }}>
            {[["transition","Transition","Ramp toward a dated exit"],["career","Career","Keep your network warm while serving"]].map(([id,label,hint]) => {
              const active = (form.orientation || "transition") === id;
              return (
                <button key={id} onClick={() => set("orientation", id)}
                  style={{ flex:1, textAlign:"left", padding:"10px 12px", borderRadius:9, cursor:"pointer",
                    border: active ? "1.5px solid #0a2342" : "0.5px solid #d8d8d4", background: active ? "#f0f4f9" : "#fff" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#1a1a18" }}>{label}</div>
                  <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{hint}</div>
                </button>
              );
            })}
          </div>
          {form.orientation === "career" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:12 }}>
              <div>
                <label style={detailLbl}>Current post</label>
                <input value={form.current_post||""} onChange={e => set("current_post", e.target.value)} placeholder="e.g., Brasília" style={detailInp} />
              </div>
              <div>
                <label style={detailLbl}>Focus regions / countries</label>
                <input value={form.focus_regions||""} onChange={e => set("focus_regions", e.target.value)} placeholder="Brazil, PACOM…" style={detailInp} />
              </div>
            </div>
          )}
        </div>

        {form.orientation !== "career" && (<>
        <div style={sectionStyle}>
          <div style={headStyle}>Transition timeline</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div>
              <label style={detailLbl}>Transition year</label>
              <input type="number" value={form.transition_year||2028} onChange={e => set("transition_year", parseInt(e.target.value))} style={detailInp} />
            </div>
            <div>
              <label style={detailLbl}>Target region</label>
              <input value={form.priority_region||""} onChange={e => set("priority_region", e.target.value)} style={detailInp} />
            </div>
            <div>
              <label style={detailLbl}>Region contact target</label>
              <input type="number" value={form.region_target_count||100} onChange={e => set("region_target_count", parseInt(e.target.value))} style={detailInp} />
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={headStyle}>Target sector</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div>
              <label style={detailLbl}>Primary sector</label>
              <input value={form.priority_sector||""} onChange={e => set("priority_sector", e.target.value)} style={detailInp} />
            </div>
            <div>
              <label style={detailLbl}>Sector contact target</label>
              <input type="number" value={form.sector_target_count||40} onChange={e => set("sector_target_count", parseInt(e.target.value))} style={detailInp} />
            </div>
            <div style={{ gridColumn:"1/-1" }}>
              <label style={detailLbl}>Secondary sectors (comma separated)</label>
              <input value={(form.secondary_sectors||[]).join(", ")}
                onChange={e => set("secondary_sectors", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                style={detailInp} />
            </div>
          </div>
        </div>

        </>)}

        <div style={sectionStyle}>
          <div style={headStyle}>Outreach goals</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div>
              <label style={detailLbl}>Weekly outreach target</label>
              <input type="number" value={form.weekly_outreach_target||5} onChange={e => set("weekly_outreach_target", parseInt(e.target.value))} style={detailInp} />
            </div>
            <div>
              <label style={detailLbl}>Monthly new contacts target</label>
              <input type="number" value={form.monthly_new_contact_target||8} onChange={e => set("monthly_new_contact_target", parseInt(e.target.value))} style={detailInp} />
            </div>
            <div>
              <label style={detailLbl}>Overdue threshold (days)</label>
              <input type="number" value={form.overdue_days||90} onChange={e => set("overdue_days", parseInt(e.target.value))} style={detailInp} />
            </div>
            <div>
              <label style={detailLbl}>Early warning threshold (days)</label>
              <input type="number" value={form.stale_soon_days||60} onChange={e => set("stale_soon_days", parseInt(e.target.value))} style={detailInp} />
            </div>
            <div>
              <label style={detailLbl}>Cold max age (days)</label>
              <input type="number" value={form.cold_max_age_days||30} onChange={e => set("cold_max_age_days", parseInt(e.target.value))} style={detailInp} />
            </div>
            <div>
              <label style={detailLbl}>Cold backlog ceiling</label>
              <input type="number" value={form.cold_backlog_ceiling||10} onChange={e => set("cold_backlog_ceiling", parseInt(e.target.value))} style={detailInp} />
            </div>
          </div>
        </div>

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", paddingTop:12, borderTop:"0.5px solid #eee" }}>
          <button onClick={onClose} style={{ fontSize:13, padding:"8px 16px", borderRadius:8, border:"0.5px solid #ccc", background:"transparent", color:"#555", cursor:"pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ fontSize:13, fontWeight:600, padding:"8px 20px", borderRadius:8, border:"none", background:"#0a2342", color:"#fff", cursor:"pointer" }}>
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────
function FeedbackModal({ onClose }) {
  const [message,  setMessage]  = useState("");
  const [category, setCategory] = useState("idea");
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [error,    setError]    = useState("");

  async function send() {
    if (!message.trim()) { setError("Add a note first."); return; }
    setSending(true); setError("");
    try {
      const credential = getStoredCredential();
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(credential ? { "Authorization": `Bearer ${credential}` } : {}),
        },
        body: JSON.stringify({ type: "feedback", message: message.trim(), category }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Couldn't send. Try again.");
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const small = typeof window !== "undefined" && window.innerWidth < 640;
  const cats = [["idea", "💡 Idea"], ["bug", "🐞 Bug"], ["other", "💬 Other"]];

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", zIndex:200, display:"flex", alignItems:small?"flex-end":"center", justifyContent:"center", padding:small?0:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:small?"16px 16px 0 0":16, border:"0.5px solid #e0e0de", width:small?"100%":"min(460px,100%)", maxHeight:small?"92vh":"90vh", overflowY:"auto", padding:small?"20px 16px":24 }}>
        <div style={{ display:"flex", alignItems:"flex-start", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:19, fontWeight:600, marginBottom:3 }}>Send feedback</div>
            <div style={{ fontSize:13, color:"#777" }}>Goes straight to Jack</div>
          </div>
          <button onClick={onClose} style={{ marginLeft:"auto", background:"transparent", border:"0.5px solid #ccc", borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:12, color:"#666" }}>✕ Close</button>
        </div>

        {sent ? (
          <div style={{ background:"#EAF3DE", border:"0.5px solid #c5e0a5", borderRadius:10, padding:"16px 18px", textAlign:"center" }}>
            <div style={{ fontSize:15, fontWeight:600, color:"#3B6D11", marginBottom:4 }}>✓ Thank you</div>
            <div style={{ fontSize:13, color:"#3B6D11", lineHeight:1.6 }}>Your feedback is on its way to Jack.</div>
            <button onClick={onClose} style={{ marginTop:14, fontSize:13, fontWeight:500, padding:"8px 18px", borderRadius:8, border:"0.5px solid #c5e0a5", background:"#fff", color:"#3B6D11", cursor:"pointer" }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              {cats.map(([id, label]) => {
                const active = category === id;
                return (
                  <button key={id} onClick={() => setCategory(id)}
                    style={{ flex:1, fontSize:12, fontWeight:600, padding:"8px 6px", borderRadius:8, cursor:"pointer",
                      border: active ? "1.5px solid #0a2342" : "0.5px solid #d8d8d4",
                      background: active ? "#f0f4f9" : "#fff", color:"#1a1a18" }}>
                    {label}
                  </button>
                );
              })}
            </div>

            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
              placeholder="What's working, what's not, what you'd love to see…"
              style={{ width:"100%", fontSize:14, padding:"10px 12px", border:"0.5px solid #d8d8d4", borderRadius:8, background:"#fff", color:"#222", fontFamily:"inherit", outline:"none", resize:"vertical", boxSizing:"border-box", marginBottom:12 }} />

            {error && <div style={{ fontSize:12, color:"#A32D2D", marginBottom:12 }}>{error}</div>}

            <button onClick={send} disabled={sending || !message.trim()}
              style={{ width:"100%", fontSize:14, fontWeight:600, padding:"11px", borderRadius:9, border:"none", background:"#0a2342", color:"#fff", cursor:(sending||!message.trim())?"default":"pointer", opacity:(sending||!message.trim())?0.5:1 }}>
              {sending ? "Sending…" : "Send feedback"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function InviteModal({ onClose }) {
  const [email,     setEmail]     = useState("");
  const [version,   setVersion]   = useState("personal");
  const [sending,   setSending]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [invites,   setInvites]   = useState(null); // null = loading
  const [busyEmail, setBusyEmail] = useState("");

  async function callInvite(body) {
    const credential = getStoredCredential();
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(credential ? { "Authorization": `Bearer ${credential}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || "Request failed");
    return data;
  }

  async function loadList() {
    try {
      const data = await callInvite({ action: "list" });
      setInvites(data.invites || []);
    } catch {
      setInvites([]);
    }
  }

  useEffect(() => { loadList(); }, []);

  async function send() {
    const addr = email.trim().toLowerCase();
    if (!addr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setResult({ ok: false, msg: "Enter a valid email address." });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      await callInvite({ action: "send", email: addr, version });
      setResult({ ok: true, msg: `Sent the ${version} invite to ${addr}. They now have access.` });
      setEmail("");
      loadList();
    } catch (err) {
      setResult({ ok: false, msg: err.message });
    } finally {
      setSending(false);
    }
  }

  async function setStatus(addr, action) {
    setBusyEmail(addr);
    setResult(null);
    try {
      await callInvite({ action, email: addr });
      await loadList();
    } catch (err) {
      setResult({ ok: false, msg: err.message });
    } finally {
      setBusyEmail("");
    }
  }

  const small = typeof window !== "undefined" && window.innerWidth < 640;

  function statusChip(st) {
    if (st === "approved") return { bg:"#EAF3DE", fg:"#3B6D11", label:"Active" };
    if (st === "revoked")  return { bg:"#FBEAEA", fg:"#A32D2D", label:"Revoked" };
    return { bg:"#FBF3E0", fg:"#8A6D1B", label: st ? st.charAt(0).toUpperCase() + st.slice(1) : "Pending" };
  }

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", zIndex:200, display:"flex", alignItems:small?"flex-end":"center", justifyContent:"center", padding:small?0:16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:small?"16px 16px 0 0":16, border:"0.5px solid #e0e0de", width:small?"100%":"min(480px,100%)", maxHeight:small?"92vh":"90vh", overflowY:"auto", padding:small?"20px 16px":24 }}>
        <div style={{ display:"flex", alignItems:"flex-start", marginBottom:18 }}>
          <div>
            <div style={{ fontSize:19, fontWeight:600, marginBottom:3 }}>Invite someone</div>
            <div style={{ fontSize:13, color:"#777" }}>Grants access and emails them the welcome</div>
          </div>
          <button onClick={onClose} style={{ marginLeft:"auto", background:"transparent", border:"0.5px solid #ccc", borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:12, color:"#666" }}>✕ Close</button>
        </div>

        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12, fontWeight:600, color:"#444", marginBottom:6 }}>Email address</div>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="their@email.com"
            style={{ width:"100%", fontSize:14, padding:"9px 11px", border:"0.5px solid #d8d8d4", borderRadius:8, background:"#fff", color:"#222", fontFamily:"inherit", outline:"none", boxSizing:"border-box" }} />
          <div style={{ fontSize:11, color:"#999", marginTop:6 }}>Must be the Google account they'll sign in with.</div>
        </div>

        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:600, color:"#444", marginBottom:8 }}>Version</div>
          <div style={{ display:"flex", gap:8 }}>
            {[
              { id:"personal",     label:"Personal",     hint:"includes the sailing joke" },
              { id:"professional", label:"Professional", hint:"joke removed" },
            ].map(opt => {
              const active = version === opt.id;
              return (
                <button key={opt.id} onClick={() => setVersion(opt.id)}
                  style={{ flex:1, textAlign:"left", padding:"10px 12px", borderRadius:9, cursor:"pointer",
                    border: active ? "1.5px solid #0a2342" : "0.5px solid #d8d8d4",
                    background: active ? "#f0f4f9" : "#fff" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"#1a1a18" }}>{opt.label}</div>
                  <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{opt.hint}</div>
                </button>
              );
            })}
          </div>
        </div>

        {result && (
          <div style={{ fontSize:13, lineHeight:1.5, padding:"10px 12px", borderRadius:8, marginBottom:16,
            background: result.ok ? "#EAF3DE" : "#FBEAEA",
            color: result.ok ? "#3B6D11" : "#A32D2D",
            border: `0.5px solid ${result.ok ? "#c5e0a5" : "#e5b8b8"}` }}>
            {result.ok ? "✓ " : "⚠️ "}{result.msg}
          </div>
        )}

        <button onClick={send} disabled={sending || !email.trim()}
          style={{ width:"100%", fontSize:14, fontWeight:600, padding:"11px", borderRadius:9, border:"none",
            background:"#0a2342", color:"#fff", cursor:(sending||!email.trim())?"default":"pointer",
            opacity:(sending||!email.trim())?0.5:1 }}>
          {sending ? "Sending…" : "Send invite"}
        </button>

        <div style={{ marginTop:24, borderTop:"0.5px solid #eee", paddingTop:18 }}>
          <div style={{ display:"flex", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#444" }}>People with access</div>
            <button onClick={loadList} title="Refresh"
              style={{ marginLeft:"auto", fontSize:11, padding:"3px 8px", borderRadius:6, border:"0.5px solid #e0e0de", background:"#fff", color:"#777", cursor:"pointer" }}>↻</button>
          </div>

          {invites === null && <div style={{ fontSize:13, color:"#999" }}>Loading…</div>}
          {invites && invites.length === 0 && <div style={{ fontSize:13, color:"#999" }}>No invites yet.</div>}

          {invites && invites.map(inv => {
            const chip = statusChip(inv.status);
            const busy = busyEmail === inv.email;
            return (
              <div key={inv.email} style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 0", borderBottom:"0.5px solid #f2f2ee" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, color:"#1a1a18", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{inv.email}</div>
                  <div style={{ fontSize:11, color:"#aaa" }}>
                    {inv.accepted_at
                      ? "Joined " + new Date(inv.accepted_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})
                      : "Not signed in yet"}
                  </div>
                </div>
                <span style={{ fontSize:11, fontWeight:600, padding:"3px 8px", borderRadius:6, background:chip.bg, color:chip.fg, whiteSpace:"nowrap" }}>{chip.label}</span>
                {inv.status === "approved" ? (
                  <button onClick={() => setStatus(inv.email, "revoke")} disabled={busy}
                    style={{ fontSize:11, padding:"5px 10px", borderRadius:7, border:"0.5px solid #e5b8b8", background:"#fff", color:"#A32D2D", cursor:busy?"default":"pointer", opacity:busy?0.5:1, whiteSpace:"nowrap" }}>
                    {busy ? "…" : "Revoke"}
                  </button>
                ) : (
                  <button onClick={() => setStatus(inv.email, "approve")} disabled={busy}
                    style={{ fontSize:11, padding:"5px 10px", borderRadius:7, border:"0.5px solid #c5e0a5", background:"#fff", color:"#3B6D11", cursor:busy?"default":"pointer", opacity:busy?0.5:1, whiteSpace:"nowrap" }}>
                    {busy ? "…" : "Re-approve"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function NetworkingDashboard({ onNewport }) {
  const width    = useWindowWidth();
  const isMobile = width < 640;
  const [collapsed,        setCollapsed]        = useState({cold:false, overdue:false, active:false});
  const [userEmail,        setUserEmail]        = useState(null);
  const [showOnboarding,   setShowOnboarding]   = useState(false);
  const [userSettings,     setUserSettings]     = useState(null);
  const [showSettings,     setShowSettings]     = useState(false);
  const unlocked = !!userEmail;
  const isAdmin = ADMIN_EMAILS.includes((userEmail || "").toLowerCase());
  const [contacts,        setContacts]        = useState([]);
  const [interactions,    setInteractions]    = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [loadError,       setLoadError]       = useState(null);
  const [selected,        setSelected]        = useState(null);
  const [selectedType,    setSelectedType]    = useState(null);
  const [showNew,         setShowNew]         = useState(false);
  const [showInvite,      setShowInvite]      = useState(false);
  const [showFeedback,    setShowFeedback]    = useState(false);
  const [query,           setQuery]           = useState("");
  const [regionFilter,    setRegionFilter]    = useState("");
  const [activeColFilter, setActiveColFilter] = useState("");
  const [sessionNotes,    setSessionNotes]    = useState({});

  useEffect(() => {
    const session = readAuthSession();
    if (session) {
      setUserEmail(session.email);
      if (session.onboardingComplete === false) {
        setShowOnboarding(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!userEmail || showOnboarding) return;
    fetchSettings().then(s => { if (s) setUserSettings(s); });
  }, [userEmail, showOnboarding]);

  function handleSignOut() {
    clearAuthSession();
    setUserEmail(null);
    setUserSettings(null);
    setShowOnboarding(false);
  }

  function handleUnlock(email, onboardingComplete) {
    setUserEmail(email);
    if (onboardingComplete === false) setShowOnboarding(true);
  }

  function fetchData(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    const credential = getStoredCredential();
    fetch("/api/contacts", {
      headers: { ...(credential ? { "Authorization": `Bearer ${credential}` } : {}) }
    })
      .then(r => {
        // If auth error, clear session and force re-login
        if (r.status === 401 || r.status === 403) {
          clearAuthSession();
          setUserEmail(null);
          setLoading(false);
          setRefreshing(false);
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        if (data.success) {
          setContacts((data.contacts || []).map(mapSupabaseRow).filter(c => c.fn || c.ln));
          setInteractions((data.interactions || []).map(mapSupabaseInteraction));
        } else {
          // If error looks auth-related, clear session
          if (data.error && (data.error.includes('401') || data.error.includes('credential') || data.error.includes('Unauthorized'))) {
            clearAuthSession();
            setUserEmail(null);
          } else {
            setLoadError("Could not load contacts.");
          }
        }
        setLoading(false);
        setRefreshing(false);
      })
      .catch(err => {
        console.error(err);
        setLoadError("Network error loading contacts.");
        setLoading(false);
        setRefreshing(false);
      });
  }

  useEffect(() => {
    if (!unlocked) return;
    fetchData();
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked || contacts.length === 0) return;
    const toDeactivate = contacts.filter(c => {
      if (c.status !== "Active") return false;
      const d = pd(c.lc);
      return d && ds(d) >= INACTIVE_THRESHOLD;
    });
    if (toDeactivate.length === 0) return;
    toDeactivate.forEach(async c => {
      const updated = await autoMarkInactive(c);
      setContacts(prev => prev.map(x => x.id === updated.id ? updated : x));
    });
  }, [unlocked, contacts.length]);

  const regionOptions = useMemo(() => {
    const set = new Set(contacts.map(c => c.region).filter(Boolean));
    return Array.from(set).sort();
  }, [contacts]);

  const { cold, overdue, active, inactive } = useMemo(() => {
    const q    = query.toLowerCase().trim();
    let list   = q ? contacts.filter(c => [c.fn,c.ln,c.company,c.industry,c.rel,c.city,c.state,c.notes].join(" ").toLowerCase().includes(q)) : contacts;
    if (regionFilter) list = list.filter(c => c.region === regionFilter);
    const norm = s => (s || "").trim().toLowerCase();
    const cold     = list.filter(c => norm(c.status) === "never contacted");
    const inactive = list.filter(c => norm(c.status) === "inactive").sort((a,b) => new Date(b.lc) - new Date(a.lc));
    const allAct   = list.filter(c => { const s = norm(c.status); return s !== "never contacted" && s !== "inactive"; });
    const overdue  = allAct.filter(c => { const d=pd(c.lc); return d && ds(d)>=THRESHOLD; }).sort((a,b) => new Date(a.lc) - new Date(b.lc));
    const active   = allAct.filter(c => { const d=pd(c.lc); return !d||ds(d)<THRESHOLD; }).sort((a,b) => new Date(b.lc) - new Date(a.lc));
    return { cold, overdue, active, inactive };
  }, [contacts, query, regionFilter]);

  const columns = [
    { key:"active",   title:"Active",        icon:"✅", contacts:active   },
    { key:"overdue",  title:"Overdue",       icon:"⏰", contacts:overdue  },
    { key:"cold",     title:"Cold Outreach", icon:"✉️", contacts:cold     },
    { key:"inactive", title:"Inactive",      icon:"💤", contacts:inactive },
  ];

  const colBadgeStyle = {
    active:   { background:"#EAF3DE", color:"#3B6D11" },
    overdue:  { background:"#FAEEDA", color:"#854F0B" },
    cold:     { background:"#E6F1FB", color:"#185FA5" },
    inactive: { background:"#F0F0EE", color:"#777"    },
  };

  if (!unlocked) return <GoogleSignInGate onUnlock={handleUnlock} />;

  if (showOnboarding) return (
    <OnboardingWizard email={userEmail} onComplete={settings => {
      setUserSettings(settings);
      setShowOnboarding(false);
    }} />
  );

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#fafaf8", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Georgia,serif" }}>
      <div style={{ textAlign:"center", color:"#999" }}><div style={{ fontSize:24, marginBottom:12 }}>⏳</div><div style={{ fontSize:14 }}>Loading contacts…</div></div>
    </div>
  );

  if (loadError) return (
    <div style={{ minHeight:"100vh", background:"#fafaf8", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Georgia,serif" }}>
      <div style={{ textAlign:"center", color:"#A32D2D" }}>
        <div style={{ fontSize:24, marginBottom:12 }}>⚠️</div>
        <div style={{ fontSize:14, marginBottom:16 }}>{loadError}</div>
        <button onClick={() => { clearAuthSession(); setUserEmail(null); setLoadError(null); }}
          style={{ fontSize:13, padding:"8px 18px", borderRadius:8, border:"none", background:"#1a1a18", color:"#fff", cursor:"pointer" }}>
          Sign in again
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily:"Georgia,serif", background:"#fafaf8", minHeight:"100vh", paddingBottom:"3rem" }}>

      <div style={{ background:"#fff", borderBottom:"0.5px solid #e8e8e4", padding:isMobile?"12px 16px":"16px 24px", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:20 }}>
        <div style={{ marginRight:4 }}>
          <div style={{ fontSize:isMobile?16:19, fontWeight:700, letterSpacing:"-.02em", color:"#1a1a18" }}>Mahan</div>
          <div style={{ fontSize:12, color:"#999", marginTop:1 }}>{contacts.length} contacts</div>
        </div>
        <div style={{ flex:1, minWidth:140, maxWidth:320, position:"relative" }}>
          <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:14, color:"#aaa", pointerEvents:"none" }}>🔍</span>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, company, industry…"
            style={{ width:"100%", fontSize:13, padding:"7px 10px 7px 32px", border:"0.5px solid #e0e0de", borderRadius:8, background:"#f9f9f7", color:"#222", fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}
            onFocus={e => e.target.style.borderColor="#999"} onBlur={e => e.target.style.borderColor="#e0e0de"} />
          {query && <button onClick={() => setQuery("")} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"transparent", border:"none", cursor:"pointer", fontSize:14, color:"#aaa", padding:0, lineHeight:1 }}>✕</button>}
        </div>
        {regionOptions.length > 0 && (
          <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
            style={{ fontSize:13, padding:"7px 10px", borderRadius:8, border:regionFilter?"1px solid #0a66c2":"0.5px solid #e0e0de", background:regionFilter?"#f0f6fb":"#f9f9f7", color:regionFilter?"#0a66c2":"#555", fontFamily:"inherit", outline:"none", cursor:"pointer", fontWeight:regionFilter?600:400 }}>
            <option value="">🎯 All regions</option>
            {regionOptions.map(r => <option key={r} value={r}>🎯 {r} only</option>)}
          </select>
        )}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {columns.map(col => {
            const isActive = activeColFilter === col.key;
            return (
              <button key={col.key} onClick={() => setActiveColFilter(isActive ? "" : col.key)}
                style={{ fontSize:12, padding:"4px 11px", borderRadius:20, fontWeight:600, cursor:"pointer", border:"none", outline:isActive?"2px solid currentColor":"none", outlineOffset:2, opacity:activeColFilter && !isActive ? 0.45 : 1, ...colBadgeStyle[col.key] }}>
                {col.contacts.length} {col.title}
              </button>
            );
          })}
          {activeColFilter && (
            <button onClick={() => setActiveColFilter("")} style={{ fontSize:12, padding:"4px 11px", borderRadius:20, fontWeight:400, cursor:"pointer", border:"0.5px solid #ccc", background:"transparent", color:"#888" }}>
              ✕ Show all
            </button>
          )}
        </div>
        <button onClick={() => fetchData(true)} disabled={refreshing} title="Refresh"
          style={{ fontSize:13, padding:"7px 12px", borderRadius:8, border:"0.5px solid #e0e0de", background:"#fff", color:"#555", cursor:"pointer" }}>
          {refreshing ? "⏳" : "🔄"}
        </button>
        {isAdmin && (
          <button onClick={() => setShowInvite(true)} title="Send an invite"
            style={{ fontSize:13, fontWeight:500, padding:"7px 14px", borderRadius:8, border:"0.5px solid #0a2342", background:"#fff", color:"#0a2342", cursor:"pointer", whiteSpace:"nowrap" }}>
            ✉️ Invite
          </button>
        )}
        <button onClick={() => setShowNew(true)} style={{ fontSize:13, fontWeight:500, padding:"7px 16px", borderRadius:8, border:"none", background:"#1a1a18", color:"#fff", cursor:"pointer", whiteSpace:"nowrap" }}>
          + New contact
        </button>
        <button onClick={() => setShowFeedback(true)} title="Send feedback"
          style={{ fontSize:13, padding:"7px 12px", borderRadius:8, border:"0.5px solid #e0e0de", background:"#fff", color:"#555", cursor:"pointer" }}>
          💬
        </button>
        <button onClick={() => setShowSettings(true)} title="Settings"
          style={{ fontSize:13, padding:"7px 12px", borderRadius:8, border:"0.5px solid #e0e0de", background:"#fff", color:"#555", cursor:"pointer" }}>
          ⚙️
        </button>
        <button onClick={handleSignOut} title={userEmail || "Sign out"}
          style={{ fontSize:12, padding:"7px 12px", borderRadius:8, border:"0.5px solid #e0e0de", background:"#fff", color:"#999", cursor:"pointer", whiteSpace:"nowrap" }}>
          Sign out
        </button>
      </div>

      {(query || regionFilter || activeColFilter) && (
        <div style={{ padding:isMobile?"0 12px 12px":"0 24px 12px", fontSize:12, color:"#999" }}>
          Showing {cold.length+overdue.length+active.length+inactive.length} of {contacts.length} contacts
          {query && ` for "${query}"`}
          {regionFilter && <span> · 🎯 <strong style={{color:"#0a66c2"}}>{regionFilter}</strong></span>}
          {activeColFilter && <span> · filtered to <strong style={{color:COL[activeColFilter]}}>{columns.find(c=>c.key===activeColFilter)?.title}</strong></span>}
        </div>
      )}

      {activeColFilter ? (() => {
        const col = columns.find(c => c.key === activeColFilter);
        return (
          <div style={{ padding:isMobile?"0 12px":"0 24px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16, paddingBottom:12, borderBottom:"0.5px solid #e8e8e4" }}>
              <span style={{ fontSize:14 }}>{col.icon}</span>
              <span style={{ fontSize:13, fontWeight:600, letterSpacing:".06em", textTransform:"uppercase", color:COL[col.key] }}>{col.title}</span>
              <span style={{ fontSize:12, background:"#f5f5f3", border:"0.5px solid #e0e0de", borderRadius:20, padding:"2px 9px", color:"#777" }}>{col.contacts.length}</span>
            </div>
            {col.contacts.length === 0
              ? <div style={{ textAlign:"center", padding:"3rem", color:"#bbb", fontSize:13 }}>No contacts in this column</div>
              : <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"repeat(3,minmax(0,1fr))", gap:isMobile?12:16 }}>
                  {col.contacts.map((c, i) => (
                    <ContactCard key={`${col.key}-${c.id}-${i}`} c={c} idx={i} type={col.key}
                      onOpen={(contact, type) => { setSelected(contact); setSelectedType(type); }}
                      onContactedToday={updated => setContacts(prev => prev.map(ct => ct.id === updated.id ? updated : ct))}
                      onFriendToggle={updated => setContacts(prev => prev.map(ct => ct.id === updated.id ? updated : ct))}
                      sessionNotes={sessionNotes} setSessionNotes={setSessionNotes} />
                  ))}
                </div>
            }
          </div>
        );
      })() : (
        <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"repeat(3,minmax(0,1fr))", gap:isMobile?12:20, padding:isMobile?"0 12px":"0 24px" }}>
          {columns.map(col => (
            <div key={col.key} style={{ minWidth:0 }}>
              <div onClick={() => isMobile && setCollapsed(p => ({ ...p, [col.key]: !p[col.key] }))}
                style={{ display:"flex", alignItems:"center", gap:8, marginBottom:collapsed[col.key]?0:14, paddingBottom:12, background:isMobile?"#fff":"transparent", padding:isMobile?"10px 12px":"0 0 12px 0", borderRadius:isMobile?(collapsed[col.key]?10:"10px 10px 0 0"):0, border:isMobile?"0.5px solid #e0e0de":"none", borderBottom:"0.5px solid #e8e8e4", cursor:isMobile?"pointer":"default", userSelect:"none" }}>
                <span style={{ fontSize:isMobile?16:14 }}>{col.icon}</span>
                <span style={{ fontSize:isMobile?14:12, fontWeight:600, letterSpacing:".06em", textTransform:"uppercase", color:COL[col.key], flex:1 }}>{col.title}</span>
                <span style={{ fontSize:12, background:"#f5f5f3", border:"0.5px solid #e0e0de", borderRadius:20, padding:"2px 9px", color:"#777" }}>{col.contacts.length}</span>
                {isMobile && <span style={{ fontSize:14, color:"#999", marginLeft:4 }}>{collapsed[col.key] ? "▸" : "▾"}</span>}
              </div>
              {!collapsed[col.key] && (col.contacts.length === 0
                ? <div style={{ textAlign:"center", padding:"2rem .5rem", color:"#bbb", fontSize:13 }}>{query?"No matches":"None"}</div>
                : col.contacts.map((c, i) => (
                    <ContactCard key={`${col.key}-${c.id}-${i}`} c={c} idx={i} type={col.key}
                      onOpen={(contact, type) => { setSelected(contact); setSelectedType(type); }}
                      onContactedToday={updated => setContacts(prev => prev.map(ct => ct.id === updated.id ? updated : ct))}
                      onFriendToggle={updated => setContacts(prev => prev.map(ct => ct.id === updated.id ? updated : ct))}
                      sessionNotes={sessionNotes} setSessionNotes={setSessionNotes} />
                  ))
              )}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <DetailPanel c={selected} type={selectedType} career={userSettings?.orientation === "career"}
          onClose={() => { setSelected(null); setSelectedType(null); }}
          interactions={interactions}
          onSaved={updated => { setContacts(prev => prev.map(c => c.id === updated.id ? updated : c)); setSelected(updated); }}
          onDeleted={updated => {
            if (updated === null) {
              setContacts(prev => prev.filter(c => c.id !== selected.id));
            } else {
              setContacts(prev => prev.map(c => c.id === updated.id ? updated : c));
            }
            setSelected(null); setSelectedType(null);
          }}
          sessionNotes={sessionNotes} setSessionNotes={setSessionNotes} />
      )}

      {showNew && (
        <NewContactModal onClose={() => setShowNew(false)} onAdd={c => setContacts(p => [...p, c])} career={userSettings?.orientation === "career"} />
      )}

      {showInvite && (
        <InviteModal onClose={() => setShowInvite(false)} />
      )}

      {showFeedback && (
        <FeedbackModal onClose={() => setShowFeedback(false)} />
      )}

      {showSettings && userSettings && (
        <SettingsPanel
          settings={userSettings}
          onClose={() => setShowSettings(false)}
          onSaved={updated => { setUserSettings(updated); setShowSettings(false); }}
        />
      )}
    </div>
  );
}
