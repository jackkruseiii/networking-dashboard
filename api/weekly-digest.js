// api/weekly-digest.js
// Cron job: runs every Sunday at 11:00 UTC (8:00am Brasilia BRT)
// Reads contacts + interactions from Supabase, scores activity against
// transition goals, generates AI analysis, sends a summary email via Gmail SMTP.

import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════════════
//  GOALS — EDIT THESE NUMBERS TO MATCH REALITY
// ═══════════════════════════════════════════════════════════════════════════
const GOALS = {
  WEEKLY_OUTREACH_TARGET:    5,
  MONTHLY_NEW_CONTACT_TARGET: 8,
  COLD_MAX_AGE_DAYS:         30,
  COLD_BACKLOG_CEILING:      10,
  OVERDUE_DAYS:              90,
  STALE_SOON_DAYS:           60,
  PRIORITY_REGION:           "DFW",
  REGION_TARGET_COUNT:       100,
  PRIORITY_SECTOR:           "Education",
  SECONDARY_SECTORS:         ["Defense", "Consulting", "Government", "Energy", "Nonprofit"],
  SECTOR_TARGET_COUNT:       40,
  TRANSITION_YEAR:           2028,
};
// ═══════════════════════════════════════════════════════════════════════════

const USER_EMAIL = "jackkruseiii@gmail.com";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Auth gate ────────────────────────────────────────────────────────
  // Vercel cron automatically sends  Authorization: Bearer <CRON_SECRET>
  // when a CRON_SECRET env var is set. For manual browser testing, append
  // ?key=<CRON_SECRET> to the URL. Fails closed if CRON_SECRET is missing.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: "CRON_SECRET is not configured. Set it in Vercel env vars." });
  }
  const headerAuth = (req.headers.authorization || "").replace("Bearer ", "");
  const queryKey = (req.query && req.query.key) || "";
  if (headerAuth !== cronSecret && queryKey !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY,
    GMAIL_FROM,
    GMAIL_APP_PASSWORD,
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY || !GMAIL_FROM || !GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: "Missing required environment variables" });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Fetch all users with digest enabled ──────────────────────────────
    const { data: allUsers, error: usersError } = await supabase
      .from("user_settings")
      .select("*")
      .eq("digest_enabled", true)
      .eq("onboarding_complete", true);

    if (usersError) throw new Error("Users fetch error: " + usersError.message);
    if (!allUsers || allUsers.length === 0) {
      return res.status(200).json({ success: true, message: "No users with digest enabled" });
    }

    const results = [];

    // ── Send digest for each user ────────────────────────────────────────
    for (const userSettings of allUsers) {
      try {
        await sendDigestForUser(supabase, userSettings, ANTHROPIC_API_KEY, GMAIL_FROM, GMAIL_APP_PASSWORD);
        results.push({ email: userSettings.user_email, status: "sent" });
      } catch (err) {
        console.error(`Digest error for ${userSettings.user_email}:`, err);
        results.push({ email: userSettings.user_email, status: "error", error: err.message });
      }
    }

    return res.status(200).json({ success: true, results });

  } catch (err) {
    console.error("Weekly digest error:", err);
    return res.status(500).json({ error: err.message });
  }
}

async function sendDigestForUser(supabase, userSettings, ANTHROPIC_API_KEY, GMAIL_FROM, GMAIL_APP_PASSWORD) {
  const email = userSettings.user_email;

  // Build GOALS from user settings
  const GOALS = {
    WEEKLY_OUTREACH_TARGET:     userSettings.weekly_outreach_target    || 5,
    MONTHLY_NEW_CONTACT_TARGET: userSettings.monthly_new_contact_target || 8,
    COLD_MAX_AGE_DAYS:          userSettings.cold_max_age_days          || 30,
    COLD_BACKLOG_CEILING:       userSettings.cold_backlog_ceiling        || 10,
    OVERDUE_DAYS:               userSettings.overdue_days               || 90,
    STALE_SOON_DAYS:            userSettings.stale_soon_days            || 60,
    PRIORITY_REGION:            userSettings.priority_region            || "DFW",
    REGION_TARGET_COUNT:        userSettings.region_target_count        || 100,
    PRIORITY_SECTOR:            userSettings.priority_sector            || "Education",
    SECONDARY_SECTORS:          userSettings.secondary_sectors          || ["Defense","Consulting","Government"],
    SECTOR_TARGET_COUNT:        userSettings.sector_target_count        || 40,
    TRANSITION_YEAR:            userSettings.transition_year            || 2028,
    DIGEST_TO:                  userSettings.digest_email               || email,
    DISPLAY_NAME:               userSettings.display_name              || email.split("@")[0],
    ORIENTATION:                userSettings.orientation               || "transition",
    FOCUS_REGIONS:              (userSettings.focus_regions || "").split(",").map(x => x.trim()).filter(Boolean),
    CURRENT_POST:               userSettings.current_post              || "",
  };
  const isCareer = GOALS.ORIENTATION === "career";

    // ── 1. Fetch data from Supabase ────────────────────────────────────────
    const { data: rawContacts, error: ce } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_email", email);
    if (ce) throw new Error("Contacts fetch error: " + ce.message);

    const { data: rawInteractions, error: ie } = await supabase
      .from("interactions")
      .select("*")
      .eq("user_email", email)
      .order("created_at", { ascending: false });
    if (ie) throw new Error("Interactions fetch error: " + ie.message);

    // ── 2. Map rows ────────────────────────────────────────────────────────
    const contacts = (rawContacts || []).map(r => ({
      id:       String(r.id            || ""),
      fn:       String(r.first_name    || "").trim(),
      ln:       String(r.last_name     || "").trim(),
      industry: String(r.industry      || "").trim(),
      company:  String(r.company       || "").trim(),
      status:   String(r.status        || "").trim(),
      lc:       r.last_checkin ? new Date(r.last_checkin).toISOString() : "",
      nc:       r.next_checkin ? new Date(r.next_checkin).toISOString() : "",
      notes:    String(r.notes         || "").trim(),
      rel:      String(r.relationship  || "").trim(),
      region:   String(r.target_region || "").trim(),
      addedAt:  r.created_at ? new Date(r.created_at).toISOString() : "",
      friend:   r.is_friend === true,
    })).filter(c => c.fn || c.ln);

    // Deduplicate interactions: same contact + same note text (first 80 chars) within 24 hours
    const rawInts = (rawInteractions || []).map(r => ({
      id:        String(r.contact_id || ""),
      timestamp: String(r.created_at || ""),
      note:      String(r.note       || "").trim(),
    }));

    const seenInts = new Set();
    const interactions = rawInts.filter(i => {
      const key = i.id + "||" + i.note.toLowerCase().slice(0, 80);
      if (seenInts.has(key)) return false;
      seenInts.add(key);
      return true;
    });

    // ── 3. Helpers ────────────────────────────────────────────────────────
    const TODAY = new Date();

    function pd(s)  { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d; }
    function ds(d)  { return Math.floor((TODAY - d) / 86400000); }
    function fd(d)  { return d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }); }
    function daysAgo(n) { return new Date(TODAY.getTime() - n * 86400000); }
    function norm(s) { return (s || "").trim().toLowerCase(); }
    function inFocus(c) {
      if (!GOALS.FOCUS_REGIONS.length) return false;
      const hay = norm((c.country || "") + " " + (c.region || ""));
      return GOALS.FOCUS_REGIONS.some(r => hay.includes(norm(r)));
    }
    function esc(s) {
      return String(s || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }
    function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }

    const isCold     = c => norm(c.status) === "never contacted";
    const isInactive = c => norm(c.status) === "inactive";
    const isActive   = c => !isCold(c) && !isInactive(c);

    function interactionsFor(c) {
      return interactions.filter(i => i.id && c.id && i.id === c.id);
    }

    const AUTO_NOTE_PATTERNS = ["auto-moved to inactive", "contact archived", "contact restored"];
    const isRealOutreach = i => !AUTO_NOTE_PATTERNS.some(p => norm(i.note).includes(p));

    const realInteractions = interactions.filter(isRealOutreach);

    function countBetween(list, startDaysAgo, endDaysAgo) {
      const start = daysAgo(startDaysAgo);
      const end   = daysAgo(endDaysAgo);
      return list.filter(i => { const d = pd(i.timestamp); return d && d >= start && d < end; }).length;
    }

    // ── 4. Activity trends ────────────────────────────────────────────────
    const thisWeekCount = countBetween(realInteractions, 7, 0);
    const lastWeekCount = countBetween(realInteractions, 14, 7);
    const last30Count   = countBetween(realInteractions, 30, 0);
    const last90Count   = countBetween(realInteractions, 90, 0);
    const weeklyAvg30   = Math.round((last30Count / 30) * 7 * 10) / 10;
    const weeklyAvg90   = Math.round((last90Count / 90) * 7 * 10) / 10;

    const trendDelta = thisWeekCount - lastWeekCount;
    const trendLabel = trendDelta > 0 ? `up ${trendDelta} vs last week`
                     : trendDelta < 0 ? `down ${Math.abs(trendDelta)} vs last week`
                     : "flat vs last week";

    const newLast30 = contacts.filter(c => { const d = pd(c.addedAt); return d && ds(d) <= 30; }).length;

    // ── 5. Contact health buckets ─────────────────────────────────────────
    const activeContacts = contacts.filter(isActive);

    function enrich(c) {
      const d    = pd(c.lc);
      const last = interactionsFor(c)
        .filter(isRealOutreach)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      return {
        ...c,
        daysSince:       d ? ds(d) : null,
        lastContactDate: d ? fd(d) : "never",
        lastNote:        last?.note || c.notes || "",
        touchCount:      interactionsFor(c).filter(isRealOutreach).length,
      };
    }

    const overdue = activeContacts
      .map(enrich)
      .filter(c => c.daysSince !== null && c.daysSince >= GOALS.OVERDUE_DAYS)
      .sort((a, b) => b.daysSince - a.daysSince);

    const staleSoon = activeContacts
      .map(enrich)
      .filter(c => c.daysSince !== null &&
                   c.daysSince >= GOALS.STALE_SOON_DAYS &&
                   c.daysSince < GOALS.OVERDUE_DAYS)
      .sort((a, b) => b.daysSince - a.daysSince);

    const coldContacts = contacts.filter(isCold).map(c => {
      const added = pd(c.addedAt);
      return { ...c, ageDays: added ? ds(added) : null, addedDate: added ? fd(added) : "unknown" };
    }).sort((a, b) => (b.ageDays || 0) - (a.ageDays || 0));

    const coldOverAge = coldContacts.filter(c => c.ageDays !== null && c.ageDays > GOALS.COLD_MAX_AGE_DAYS);

    const sevenDaysAgo = daysAgo(7);
    const newlyInactive = contacts.filter(c => {
      if (!isInactive(c)) return false;
      return interactionsFor(c).some(i =>
        norm(i.note).includes("auto-moved to inactive") && pd(i.timestamp) >= sevenDaysAgo
      );
    });

    // ── 6. Goal scorecard ─────────────────────────────────────────────────
    const regionCount = contacts.filter(c => norm(c.region) === norm(GOALS.PRIORITY_REGION)).length;
    const sectorCount = contacts.filter(c => norm(c.industry).includes(norm(GOALS.PRIORITY_SECTOR))).length;

    const focusCount = contacts.filter(c => inFocus(c)).length;
    const scorecard = isCareer ? [
      { label:"Network total",    value: contacts.length,  target:null, hit:true,                 detail: activeContacts.length + " active" },
      { label:"In focus regions", value: focusCount,       target:null, hit:true,                 detail: (GOALS.FOCUS_REGIONS.join(", ") || "set focus regions").slice(0,42) },
      { label:"Going cold now",   value: overdue.length,   target:0,    hit: overdue.length === 0, detail: "overdue " + GOALS.OVERDUE_DAYS + "d+", lowerIsBetter:true },
      { label:"Cooling soon",     value: staleSoon.length, target:null, hit:true,                 detail: "approaching overdue" },
      { label:"Reconnected (7d)", value: thisWeekCount,    target:null, hit: thisWeekCount > 0,   detail: "30-day avg " + weeklyAvg30 + "/wk" },
    ] : [
      {
        label:  "Outreach this week",
        value:  thisWeekCount,
        target: GOALS.WEEKLY_OUTREACH_TARGET,
        hit:    thisWeekCount >= GOALS.WEEKLY_OUTREACH_TARGET,
        detail: trendLabel + " · 30-day avg " + weeklyAvg30 + "/wk",
      },
      {
        label:  "New contacts (30d)",
        value:  newLast30,
        target: GOALS.MONTHLY_NEW_CONTACT_TARGET,
        hit:    newLast30 >= GOALS.MONTHLY_NEW_CONTACT_TARGET,
        detail: "network total " + contacts.length,
      },
      {
        label:  GOALS.PRIORITY_REGION + " contacts",
        value:  regionCount,
        target: GOALS.REGION_TARGET_COUNT,
        hit:    regionCount >= GOALS.REGION_TARGET_COUNT,
        detail: pct(regionCount, GOALS.REGION_TARGET_COUNT) + "% of target",
      },
      {
        label:  GOALS.PRIORITY_SECTOR + " sector",
        value:  sectorCount,
        target: GOALS.SECTOR_TARGET_COUNT,
        hit:    sectorCount >= GOALS.SECTOR_TARGET_COUNT,
        detail: pct(sectorCount, GOALS.SECTOR_TARGET_COUNT) + "% of target",
      },
      {
        label:  "Cold backlog",
        value:  coldContacts.length,
        target: GOALS.COLD_BACKLOG_CEILING,
        hit:    coldContacts.length <= GOALS.COLD_BACKLOG_CEILING,
        detail: coldOverAge.length + " aged past " + GOALS.COLD_MAX_AGE_DAYS + "d",
        lowerIsBetter: true,
      },
    ];

    // ── 7. Priority ranking ───────────────────────────────────────────────
    function priorityScore(c) {
      let score = 0;
      if (c.daysSince !== null) score += c.daysSince;
      else if (c.ageDays != null) score += c.ageDays;
      if (isCareer) {
        if (inFocus(c)) score += 50;
        if (norm(c.category) === "military") score += 10;
      } else {
        if (norm(c.region).includes(norm(GOALS.PRIORITY_REGION))) score += 40;
        if (norm(c.industry).includes(norm(GOALS.PRIORITY_SECTOR))) score += 40;
        if (GOALS.SECONDARY_SECTORS.some(s => norm(c.industry).includes(norm(s)))) score += 15;
      }
      if (c.friend) score += 20;
      if (c.touchCount > 2) score += 15;
      return score;
    }

    const priorityPool = [
      ...overdue,
      ...staleSoon,
      ...coldOverAge.map(c => ({ ...c, daysSince: null, lastNote: c.notes, touchCount: 0 })),
    ];
    const topPriority = priorityPool
      .map(c => ({ ...c, _score: priorityScore(c) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 8);

    // ── 8. Recent interactions (display) ─────────────────────────────────
    const recentInteractions = realInteractions
      .filter(i => { const d = pd(i.timestamp); return d && d >= sevenDaysAgo; })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map(i => {
        const contact = contacts.find(c => i.id && c.id && i.id === c.id)
          || { fn: "", ln: "", company: "", industry: "", region: "" };
        const d = pd(i.timestamp);
        return {
          ...i,
          contactName:   (contact.fn + " " + contact.ln).trim(),
          company:       contact.company,
          industry:      contact.industry,
          region:        contact.region,
          formattedDate: d ? fd(d) : "",
        };
      });

    // ── 9. AI analysis ────────────────────────────────────────────────────
    const scorecardText = scorecard.map(s =>
      `- ${s.label}: ${s.value}${s.target != null ? ` (target ${s.lowerIsBetter ? "≤" : ""}${s.target})` : ""} — ${s.hit ? "ON TRACK" : "NEEDS ATTENTION"}. ${s.detail}`
    ).join("\n");

    const priorityText = topPriority.length === 0
      ? "No contacts currently flagged."
      : topPriority.map(c => {
          const age = c.daysSince !== null
            ? `${c.daysSince} days since last contact`
            : `cold, added ${c.ageDays != null ? c.ageDays + " days ago" : "unknown"}, never contacted`;
          return `- ${c.fn} ${c.ln} (${c.company || "no company"}, ${c.industry || "no industry"}${c.region ? ", region: " + c.region : ""}) — ${age}. ${c.touchCount} prior touches. Note: "${(c.lastNote || "none").slice(0, 200)}"`;
        }).join("\n");

    const interactionsText = recentInteractions.length === 0
      ? "No outreach logged this week."
      : recentInteractions.map(i =>
          `- ${i.formattedDate}: ${i.contactName} (${i.company || "—"}, ${i.industry || "—"}) — "${i.note}"`
        ).join("\n");

    const last90Text = realInteractions
      .filter(i => { const d = pd(i.timestamp); return d && d >= daysAgo(90) && d < sevenDaysAgo; })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 25)
      .map(i => {
        const contact = contacts.find(c => i.id && c.id && i.id === c.id)
          || { fn: "", ln: "", company: "" };
        return `- ${i.formattedDate || ""}: ${(contact.fn + " " + contact.ln).trim()} (${contact.company || "—"}) — "${i.note}"`;
      }).join("\n") || "No prior interactions in the last 90 days.";

    const newlyInactiveText = newlyInactive.length === 0
      ? "None this week."
      : newlyInactive.map(c => `- ${c.fn} ${c.ln} (${c.company}) — auto-moved to Inactive after 180+ days`).join("\n");

    const aiPrompt = isCareer ? `You are the strategic advisor helping ${GOALS.DISPLAY_NAME}, a military Foreign Area Officer maintaining a professional network across a long career — they are NOT transitioning out. ${GOALS.CURRENT_POST ? "Current post: " + GOALS.CURRENT_POST + ". " : ""}Their network centers on these regions/countries: ${GOALS.FOCUS_REGIONS.join(", ") || "not yet specified"}. All outreach is remote — never suggest in-person meetings.

CORE MISSION — read before recommending:
- The goal is keeping a career-long international network warm across rotations and tours — host-nation counterparts, attachés, diplomats, and peers built up over many posts. There is no exit date and no sales quota.
- The single most valuable thing you do is surface relationships that are quietly decaying: people who mattered, whom they have not touched in a long time, especially in their focus regions — before those relationships go cold for good.
- Strongly prefer contacts in the focus regions and contacts with a real prior relationship (multiple past touches, friends, specific commitments). Deprioritize thin or one-off contacts.
- Do NOT chase weekly volume for its own sake. A steady maintenance cadence beats bursts. Do not manufacture urgency where a relationship is genuinely on a slow, healthy simmer.

NETWORK HEALTH (current standing):
${scorecardText}

ACTIVITY TREND:
- Reconnected this week: ${thisWeekCount}
- Last week: ${lastWeekCount}
- 30-day average: ${weeklyAvg30}/week
- 90-day average: ${weeklyAvg90}/week
- Network size: ${contacts.length} total (${activeContacts.length} active, ${coldContacts.length} cold, ${contacts.filter(isInactive).length} inactive)

MOST AT-RISK RELATIONSHIPS (ranked by time since last contact + focus-region fit + relationship depth):
${priorityText}

RECONNECTED THIS WEEK:
${interactionsText}

PRIOR 90 DAYS OF INTERACTIONS (context — unresolved threads, promised follow-ups, people cooling off):
${last90Text}

CONTACTS AUTO-MOVED TO INACTIVE THIS WEEK:
${newlyInactiveText}

Write a briefing with exactly these three sections, using these exact headers:

ASSESSMENT
Two or three sentences on the state of the network this week — is it being maintained, or is the cold list growing? Reference specific numbers. Be honest, not encouraging for its own sake.

PATTERNS
Two or three observations only visible across the full 90 days — a whole region going quiet, a key counterpart cooling off, promised follow-ups that never happened, a cadence slipping. This is the most valuable section: surface what a week-by-week view would miss.

THIS WEEK
Exactly 5 numbered actions, ranked most important first. Each must name a specific person and say concretely what to do and why that relationship is worth saving now. Strongly prefer people in the focus regions (${GOALS.FOCUS_REGIONS.join(", ") || "your key regions"}) and people with a real prior relationship going quiet. Never suggest generic CRM housekeeping — every action is a real human contact. One or two sentences each.` : `You are the strategic advisor reviewing weekly networking activity for ${GOALS.DISPLAY_NAME}, a military officer transitioning to civilian life. They are targeting the ${GOALS.PRIORITY_REGION} area in ${GOALS.TRANSITION_YEAR}. Primary sector interest: ${GOALS.PRIORITY_SECTOR}. Secondary interests: ${GOALS.SECONDARY_SECTORS.join(", ")}. All outreach is remote — never suggest in-person meetings or coffee.

CRITICAL TRANSITION TIMELINE CONTEXT — read this before making any recommendations:
- It is currently ${TODAY.toLocaleDateString("en-US", { month:"long", year:"numeric" })}. This person is ${GOALS.TRANSITION_YEAR - TODAY.getFullYear()} years from their transition year.
- At this stage, the right posture depends on time remaining. If 2+ years out: STRATEGIC RELATIONSHIP MAINTENANCE — not aggressive activation. Contacts who have offered future help are intentionally parked, not stalling.
- Do NOT flag contacts as neglected if their notes indicate they are intentionally on a slow burn or offered help for a future date.
- Flag as genuinely urgent ONLY: contacts who made specific time-sensitive offers, contacts whose circumstances are changing, and contacts who explicitly requested a follow-up that hasn't happened.
- Be a strategic advisor who understands the full transition arc, not a sales manager chasing weekly numbers.

GOAL SCORECARD (current standing):
${scorecardText}

ACTIVITY TREND:
- This week: ${thisWeekCount} outreach logged (target ${GOALS.WEEKLY_OUTREACH_TARGET})
- Last week: ${lastWeekCount}
- 30-day average: ${weeklyAvg30}/week
- 90-day average: ${weeklyAvg90}/week
- Network size: ${contacts.length} total (${activeContacts.length} active, ${coldContacts.length} cold, ${contacts.filter(isInactive).length} inactive)

HIGHEST-PRIORITY CONTACTS (ranked by neglect + strategic fit):
${priorityText}

OUTREACH THIS WEEK:
${interactionsText}

PRIOR 90 DAYS OF INTERACTIONS (context — look for unresolved threads, promised introductions, and commitments that never materialized):
${last90Text}

CONTACTS AUTO-MOVED TO INACTIVE THIS WEEK:
${newlyInactiveText}

Write a briefing with exactly these three sections, using these exact headers:

ASSESSMENT
Two or three sentences on how the week actually went against the goals above. Be honest — if he is behind on outreach or the cold backlog is growing, say so plainly. Reference specific numbers. Do not be encouraging for its own sake.

PATTERNS
Two or three observations that are only visible by looking back across the full 90 days — unresolved commitments, promised introductions that never happened, relationships cooling off, sectors or regions being neglected, or a cadence that is slipping. This is the most valuable section: surface what a week-by-week view would miss.

THIS WEEK
Exactly 5 numbered actions, ranked most important first. Each must name a specific person and state concretely what to do and why it matters to the ${GOALS.TRANSITION_YEAR} transition. Prefer contacts who advance the ${GOALS.PRIORITY_REGION} or ${GOALS.PRIORITY_SECTOR} goals. Never suggest generic CRM housekeeping like "update your notes" — every action must be a real human contact. One or two sentences each.`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: aiPrompt }],
      }),
    });

    const aiData = await aiRes.json();
    if (!aiRes.ok) throw new Error("Anthropic API error: " + (aiData.error?.message || aiRes.status));
    const aiText = aiData.content?.[0]?.text?.trim() || "No analysis generated.";

    function section(name, next) {
      const re = new RegExp(name + "\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:" + next + ")\\s*\\n|$)", "i");
      const m = aiText.match(re);
      return m ? m[1].trim() : "";
    }
    const assessment = section("ASSESSMENT", "PATTERNS|THIS WEEK");
    const patterns   = section("PATTERNS",   "THIS WEEK");
    const actions    = section("THIS WEEK",  "$^") || aiText;

    // ── 10. Build HTML email ──────────────────────────────────────────────
    const dateStr = TODAY.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });

    function scorecardHTML() {
      return scorecard.map(s => {
        const color = s.hit ? "#3B6D11" : "#854F0B";
        const bg    = s.hit ? "#EAF3DE" : "#FAEEDA";
        return `
        <div style="flex:1;min-width:150px;background:${bg};border-radius:8px;padding:12px 14px;margin:0 6px 10px 0;">
          <div style="font-size:11px;color:#777;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">${esc(s.label)}</div>
          <div style="font-size:22px;font-weight:700;color:${color};line-height:1.1;">
            ${s.value}${s.target != null ? `<span style="font-size:13px;color:#999;font-weight:400;"> / ${s.lowerIsBetter ? "max " : ""}${s.target}</span>` : ""}
          </div>
          <div style="font-size:11px;color:#777;margin-top:3px;">${esc(s.detail)}</div>
        </div>`;
      }).join("");
    }

    function paraHTML(text) {
      if (!text) return "";
      return text.split("\n").filter(l => l.trim()).map(l =>
        `<p style="font-size:14px;color:#333;line-height:1.65;margin:0 0 10px 0;">${esc(l.replace(/^[-•]\s*/, ""))}</p>`
      ).join("");
    }

    function actionItemsHTML() {
      const lines = actions.split("\n").filter(l => l.trim());
      return lines.map(line => {
        const clean = line.replace(/^\d+\.\s*/, "").replace(/^[-•]\s*/, "").trim();
        if (!clean) return "";
        const num = line.match(/^(\d+)\./)?.[1] || "•";
        return `
          <div style="display:flex;gap:12px;margin-bottom:14px;">
            <div style="width:24px;height:24px;border-radius:50%;background:#0a2342;color:#fff;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">${num}</div>
            <div style="font-size:14px;color:#333;line-height:1.6;">${esc(clean)}</div>
          </div>`;
      }).join("");
    }

    function contactRowsHTML(list, badgeFn) {
      if (list.length === 0) {
        return `<tr><td colspan="4" style="padding:12px;color:#999;font-style:italic;font-size:14px;">Nothing flagged here.</td></tr>`;
      }
      return list.map(c => `
        <tr style="border-bottom:1px solid #f0f0ec;">
          <td style="padding:10px 12px;font-size:14px;font-weight:600;color:#1a1a18;">${esc(c.fn + " " + c.ln)}${c.friend ? ' <span style="font-size:11px;">🤝</span>' : ""}</td>
          <td style="padding:10px 12px;font-size:13px;color:#555;">${esc(c.company || "—")}${c.region ? `<div style="font-size:11px;color:#0a66c2;">🎯 ${esc(c.region)}</div>` : ""}</td>
          <td style="padding:10px 12px;font-size:13px;">${badgeFn(c)}</td>
          <td style="padding:10px 12px;font-size:12px;color:#777;max-width:200px;">${esc(c.lastNote ? c.lastNote.slice(0, 80) + (c.lastNote.length > 80 ? "…" : "") : "—")}</td>
        </tr>`).join("");
    }

    const overdueBadge = c => `<span style="background:#FAEEDA;color:#854F0B;padding:3px 8px;border-radius:5px;font-weight:600;">${c.daysSince}d</span>`;
    const staleBadge   = c => `<span style="background:#FFF6E0;color:#8a6d1f;padding:3px 8px;border-radius:5px;font-weight:600;">${c.daysSince}d</span>`;

    function coldRowsHTML() {
      if (coldContacts.length === 0) {
        return `<tr><td colspan="4" style="padding:12px;color:#999;font-style:italic;font-size:14px;">No cold contacts — pipeline is clear.</td></tr>`;
      }
      return coldContacts.slice(0, 12).map(c => {
        const over = c.ageDays !== null && c.ageDays > GOALS.COLD_MAX_AGE_DAYS;
        return `
        <tr style="border-bottom:1px solid #f0f0ec;">
          <td style="padding:10px 12px;font-size:14px;font-weight:600;color:#1a1a18;">${esc(c.fn + " " + c.ln)}</td>
          <td style="padding:10px 12px;font-size:13px;color:#555;">${esc(c.company || "—")}${c.region ? `<div style="font-size:11px;color:#0a66c2;">🎯 ${esc(c.region)}</div>` : ""}</td>
          <td style="padding:10px 12px;font-size:13px;">
            <span style="background:${over ? "#FAEEDA" : "#E6F1FB"};color:${over ? "#854F0B" : "#185FA5"};padding:3px 8px;border-radius:5px;font-weight:600;">
              ${c.ageDays !== null ? c.ageDays + "d waiting" : "added ?"}
            </span>
          </td>
          <td style="padding:10px 12px;font-size:12px;color:#777;max-width:200px;">${esc(c.industry || "—")}</td>
        </tr>`;
      }).join("");
    }

    function interactionRowsHTML() {
      if (recentInteractions.length === 0) {
        return `<p style="color:#999;font-style:italic;font-size:14px;padding:12px 0;">No outreach logged this week.</p>`;
      }
      return recentInteractions.map(i => `
        <div style="padding:12px;background:#f9f9f7;border-radius:8px;margin-bottom:10px;border-left:3px solid #e0e0de;">
          <div style="font-size:12px;color:#999;margin-bottom:4px;">${esc(i.formattedDate)} · <strong style="color:#555;">${esc(i.contactName)}</strong>${i.company ? " · " + esc(i.company) : ""}</div>
          <div style="font-size:14px;color:#333;line-height:1.5;">${esc(i.note)}</div>
        </div>`).join("");
    }

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Georgia,serif;background:#f4f4f0;margin:0;padding:20px;">
<div style="max-width:660px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0e0da;">

  <div style="background:#0a2342;padding:24px 28px;">
    <div style="font-size:11px;color:#c9a84c;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px;">${isCareer ? "Career Network Digest" : "Weekly Networking Digest"}</div>
    <div style="font-size:24px;font-weight:700;color:#fff;margin-bottom:4px;">Sunday Briefing</div>
    <div style="font-size:13px;color:#8fadc8;">${dateStr} · ${isCareer ? (GOALS.CURRENT_POST ? esc(GOALS.CURRENT_POST) : "Career network") : (GOALS.TRANSITION_YEAR - TODAY.getFullYear()) + " years to transition"}</div>
  </div>

  <div style="padding:20px 22px 6px 22px;background:#f9f9f7;border-bottom:1px solid #e8e8e4;">
    <div style="font-size:11px;font-weight:600;color:#777;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Goal Scorecard</div>
    <div style="display:flex;flex-wrap:wrap;">
      ${scorecardHTML()}
    </div>
  </div>

  <div style="padding:24px 28px;">

    ${assessment ? `
    <div style="margin-bottom:26px;">
      <div style="font-size:11px;font-weight:600;color:#c9a84c;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Assessment</div>
      <div style="font-size:18px;font-weight:600;color:#1a1a18;margin-bottom:12px;">How the week went</div>
      <div style="background:#f9f9f7;border-radius:10px;padding:16px 18px;border-left:3px solid #0a2342;">
        ${paraHTML(assessment)}
      </div>
    </div>` : ""}

    ${patterns ? `
    <div style="margin-bottom:26px;">
      <div style="font-size:11px;font-weight:600;color:#854F0B;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Patterns</div>
      <div style="font-size:18px;font-weight:600;color:#1a1a18;margin-bottom:12px;">What the 90-day view shows</div>
      <div style="background:#FFFBF2;border-radius:10px;padding:16px 18px;border-left:3px solid #c9a84c;">
        ${paraHTML(patterns)}
      </div>
    </div>` : ""}

    <div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:600;color:#3B6D11;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Action Plan</div>
      <div style="font-size:18px;font-weight:600;color:#1a1a18;margin-bottom:16px;">Do these five things</div>
      <div style="background:#f9f9f7;border-radius:10px;padding:16px 18px;">
        ${actionItemsHTML()}
      </div>
    </div>

    <div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:600;color:#854F0B;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Needs Attention</div>
      <div style="font-size:18px;font-weight:600;color:#1a1a18;margin-bottom:16px;">Overdue — ${GOALS.OVERDUE_DAYS}+ days (${overdue.length})</div>
      <table style="width:100%;border-collapse:collapse;background:#fafaf8;border-radius:10px;overflow:hidden;border:1px solid #e8e8e4;">
        <thead>
          <tr style="background:#f5f5f3;border-bottom:1px solid #e0e0da;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Name</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Company</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Silent</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Last note</th>
          </tr>
        </thead>
        <tbody>${contactRowsHTML(overdue, overdueBadge)}</tbody>
      </table>
    </div>

    <div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:600;color:#8a6d1f;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Early Warning</div>
      <div style="font-size:18px;font-weight:600;color:#1a1a18;margin-bottom:16px;">Going quiet — ${GOALS.STALE_SOON_DAYS}-${GOALS.OVERDUE_DAYS - 1} days (${staleSoon.length})</div>
      <div style="font-size:12px;color:#999;margin-bottom:10px;">Reach these before they become overdue.</div>
      <table style="width:100%;border-collapse:collapse;background:#fafaf8;border-radius:10px;overflow:hidden;border:1px solid #e8e8e4;">
        <tbody>${contactRowsHTML(staleSoon.slice(0, 10), staleBadge)}</tbody>
      </table>
    </div>

    <div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:600;color:#185FA5;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Pipeline</div>
      <div style="font-size:18px;font-weight:600;color:#1a1a18;margin-bottom:16px;">Cold — never contacted (${coldContacts.length})</div>
      <div style="font-size:12px;color:#999;margin-bottom:10px;">${coldOverAge.length} have been waiting longer than your ${GOALS.COLD_MAX_AGE_DAYS}-day rule.</div>
      <table style="width:100%;border-collapse:collapse;background:#fafaf8;border-radius:10px;overflow:hidden;border:1px solid #e8e8e4;">
        <tbody>${coldRowsHTML()}</tbody>
      </table>
    </div>

    ${newlyInactive.length > 0 ? `
    <div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:600;color:#777;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Auto-Moved This Week</div>
      <div style="font-size:18px;font-weight:600;color:#1a1a18;margin-bottom:16px;">Moved to Inactive (${newlyInactive.length})</div>
      <div style="background:#f9f9f7;border-radius:10px;padding:14px 16px;border:1px solid #e0e0da;">
        ${newlyInactive.map(c => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0ec;">
            <div style="width:28px;height:28px;border-radius:50%;background:#F0F0EE;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#777;flex-shrink:0;">${esc((c.fn[0]||"") + (c.ln[0]||""))}</div>
            <div style="flex:1;font-size:14px;color:#333;">${esc(c.fn + " " + c.ln)} <span style="color:#999;font-size:12px;">· ${esc(c.company || "—")}</span></div>
            <div style="font-size:11px;padding:2px 8px;border-radius:5px;background:#F0F0EE;color:#777;">💤 Inactive</div>
          </div>`).join("")}
      </div>
    </div>` : ""}

    <div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:600;color:#3B6D11;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">This Week</div>
      <div style="font-size:18px;font-weight:600;color:#1a1a18;margin-bottom:16px;">Outreach logged (${recentInteractions.length})</div>
      ${interactionRowsHTML()}
    </div>

  </div>

  <div style="background:#0a2342;padding:16px 28px;text-align:center;">
    <div style="font-size:12px;color:#8fadc8;">Mahan · Weekly Digest</div>
    <div style="font-size:11px;color:#4a6a8a;margin-top:4px;">Sent every Sunday at 8:00am Brasilia time</div>
  </div>

</div>
</body>
</html>`;

    // ── 11. Send via Gmail SMTP ───────────────────────────────────────────
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_FROM, pass: GMAIL_APP_PASSWORD },
    });

    const onTrack = scorecard.filter(s => s.hit).length;
    await transporter.sendMail({
      from: `"Mahan" <${GMAIL_FROM}>`,
      to: GOALS.DIGEST_TO,
      subject: `📋 Weekly Digest — ${thisWeekCount}/${GOALS.WEEKLY_OUTREACH_TARGET} outreach, ${overdue.length} overdue, ${onTrack}/${scorecard.length} goals on track`,
      html,
    });
}
