// api/newport.js — Weekly Newport Intel email (Vercel Cron)
// Runs on a schedule, generates the Newport digest via Claude (web search),
// and emails it to you. No longer called from the app UI.
// Auth: Vercel cron sends Authorization: Bearer <CRON_SECRET> automatically.
// Manual test / send-now: visit  /api/newport?key=<CRON_SECRET>

import nodemailer from "nodemailer";

const CATEGORIES = [
  { id: "news",       label: "Local News",      icon: "📰" },
  { id: "politics",   label: "Politics & Gov",  icon: "🏛️" },
  { id: "schools",    label: "Schools",         icon: "🎓" },
  { id: "activities", label: "Activities",      icon: "🎉" },
  { id: "qol",        label: "Quality of Life", icon: "🏡" },
  { id: "military",   label: "Military",        icon: "⚓" },
];

const TIER2 = {
  news: [
    { label: "The Point Association", url: "https://thepointassociation.org/our-neighborhood/" },
    { label: "Newport Life Magazine", url: "https://www.newportlifemagazine.com/" },
  ],
  politics: [
    { label: "Newport City Council (ClerkBase)", url: "https://www.clerkshq.com/newport-ri" },
    { label: "Newport Public Records", url: "https://www.newportri.gov/city-hall/departments/city-clerk/Public-Records" },
    { label: "RI Open Meetings", url: "https://opengov.sos.ri.gov/" },
    { label: "Middletown Records", url: "https://www.middletownri.gov/289/Records-Department" },
    { label: "Portsmouth Records", url: "https://portsmouthri.gov/1762/Records-Licenses" },
    { label: "RI Legislature", url: "https://www.rilegislature.gov/" },
    { label: "League of Women Voters Newport County", url: "https://my.lwv.org/rhode-island/lwv-south-county" },
  ],
  schools: [
    { label: "RIDE School Report Cards", url: "https://reportcard.ride.ri.gov/" },
    { label: "RIDE Data Center", url: "https://datacenter.ride.ri.gov/" },
    { label: "Newport Schools Superintendent Updates", url: "https://www.npsri.net/page/superintendents-updates" },
    { label: "Superintendent Newsletter (read manually)", url: "https://app.smore.com/n/ky19u" },
    { label: "Middletown Schools", url: "https://www.middletownschools.org/" },
    { label: "Portsmouth Schools", url: "https://www.ppsk12.us/" },
    { label: "School Liaison Officer", url: "https://www.navymwrnewport.com/child-youth/school-liaison" },
    { label: "GreatSchools Newport", url: "https://www.greatschools.org/rhode-island/newport/" },
  ],
  activities: [
    { label: "Discover Newport Events", url: "https://www.discovernewport.org/events/" },
    { label: "Discover Newport: Things To Do", url: "https://www.discovernewport.org/things-to-do/" },
    { label: "WhatsUpNewp Calendar", url: "https://whatsupnewp.com/calendar/" },
    { label: "Newport This Week Calendar", url: "https://www.newportthisweek.com/category/calendar/" },
    { label: "America's 250th in Newport", url: "https://www.discovernewport.org/250th/" },
  ],
  qol: [
    { label: "Redfin Newport", url: "https://www.redfin.com/city/12826/RI/Newport/housing-market" },
    { label: "Realtor Newport County", url: "https://www.realtor.com/local/market/rhode-island/newport-county" },
    { label: "Zillow Newport County", url: "https://www.zillow.com/home-values/1945/newport-county-ri/" },
    { label: "Stonelink Property Management", url: "https://www.stonelinkpm.com/newport-property-management" },
    { label: "Niche Newport", url: "https://www.niche.com/places-to-live/newport-ri/" },
    { label: "AreaVibes Newport", url: "https://www.areavibes.com/newport-ri/" },
  ],
  military: [
    { label: "Navy Housing NAVSTA Newport", url: "https://ffr.cnic.navy.mil/Navy-Housing/Housing-By-Region/Mid-Atlantic/NAVSTA-Newport/" },
    { label: "Balfour Beatty (On-Base Housing)", url: "https://www.navstanewporthomes.com/" },
    { label: "Fleet & Family Support Center", url: "https://www.navymwrnewport.com/programs/612ca018-9e3c-41b7-ae02-be3177ba9e14" },
    { label: "Naval War College Press", url: "https://usnwc.edu/Publications/Naval-War-College-Press/" },
    { label: "NWC Foundation", url: "https://nwcfoundation.org/" },
    { label: "Military OneSource", url: "https://www.militaryonesource.mil/" },
  ],
};

function extractJSON(raw) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try { return JSON.parse(jsonMatch[0]); } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  return null;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildEmail(d) {
  const navy = "#0a2342";

  const catHtml = CATEGORIES.map(cat => {
    const c = d.categories[cat.id];
    if (!c) return "";
    const bullets = (c.bullets || []).map(b =>
      `<div style="margin-bottom:8px;font-size:14px;color:#333;line-height:1.6;"><span style="color:${navy};font-weight:700;">—</span> ${esc(b)}</div>`
    ).join("");
    const sowhat = c.sowhat
      ? `<div style="background:#f0f4f9;border:0.5px solid #c8d8ea;border-radius:8px;padding:10px 14px;margin-top:14px;font-size:13px;color:#445;font-style:italic;line-height:1.5;"><strong style="font-style:normal;color:${navy};font-size:10px;letter-spacing:.1em;text-transform:uppercase;">So What? </strong>${esc(c.sowhat)}</div>`
      : "";
    const sources = (c.sources && c.sources.length)
      ? `<div style="font-size:11px;color:#999;margin-top:10px;">Sources: ${c.sources.map(s => esc(s)).join(", ")}</div>`
      : "";
    const tier2 = (c.tier2 && c.tier2.length)
      ? `<div style="margin-top:10px;">${c.tier2.map(l =>
          `<a href="${esc(l.url)}" style="display:inline-block;font-size:11px;color:#666;text-decoration:none;border:0.5px solid #e0e0de;border-radius:6px;padding:3px 9px;margin:0 5px 5px 0;background:#fafaf8;">${esc(l.label)}</a>`
        ).join("")}</div>`
      : "";
    return `<div style="background:#fff;border:0.5px solid #e0e0de;border-radius:12px;padding:20px 24px;margin-bottom:16px;">
      <div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:${navy};margin-bottom:4px;">${cat.icon} ${esc(cat.label)}</div>
      <div style="font-size:17px;font-weight:700;color:#1a1a18;margin-bottom:12px;line-height:1.3;">${esc(c.headline)}</div>
      ${bullets}${sowhat}${sources}${tier2}
    </div>`;
  }).join("");

  const notableHtml = d.notable ? `<div style="background:#fff;border:0.5px solid #e0e0de;border-radius:12px;padding:20px 24px;margin-bottom:16px;">
      <div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#c8a96e;margin-bottom:8px;">⭐ Newport Notable</div>
      <div style="font-size:18px;font-weight:700;color:#1a1a18;">${esc(d.notable.name)}</div>
      <div style="font-size:12px;color:#999;margin-bottom:10px;">${esc(d.notable.role)}</div>
      <div style="font-size:14px;color:#333;line-height:1.7;margin-bottom:8px;">${esc(d.notable.bio)}</div>
      <div style="font-size:13px;color:${navy};font-style:italic;line-height:1.5;">Why it matters: ${esc(d.notable.relevance)}</div>
      ${d.notable.source ? `<div style="margin-top:8px;font-size:11px;"><a href="https://${esc(d.notable.source)}" style="color:${navy};">${esc(d.notable.source)}</a></div>` : ""}
    </div>` : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Georgia,serif;background:#fafaf8;margin:0;padding:20px;">
<div style="max-width:640px;margin:0 auto;">
  <div style="background:${navy};border-radius:12px 12px 0 0;padding:24px 28px;">
    <div style="font-size:11px;color:#c9a84c;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px;">Weekly Community Briefing · Aquidneck Island, RI</div>
    <div style="font-size:24px;font-weight:700;color:#fff;">⚓ Newport Intel Digest</div>
    <div style="font-size:13px;color:#8fadc8;margin-top:4px;">${esc(d.date)}</div>
  </div>
  <div style="background:#fafaf8;border:0.5px solid #e8e8e4;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px;">
    ${d.topline ? `<div style="border-left:3px solid ${navy};padding-left:14px;margin-bottom:20px;">
      <div style="font-size:10px;letter-spacing:.15em;color:${navy};text-transform:uppercase;margin-bottom:5px;">This Week's Topline</div>
      <div style="font-size:16px;color:#1a1a18;line-height:1.5;font-style:italic;">${esc(d.topline)}</div>
    </div>` : ""}
    ${notableHtml}
    ${catHtml}
    <div style="border-top:0.5px solid #eee;padding-top:14px;margin-top:8px;font-size:11px;color:#bbb;">Mahan · Newport Intel · sent weekly</div>
  </div>
</div>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // ── Auth gate (same CRON_SECRET as the weekly digest) ─────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: "CRON_SECRET is not configured. Set it in Vercel env vars." });
  }
  const headerAuth = (req.headers.authorization || "").replace("Bearer ", "");
  const queryKey = (req.query && req.query.key) || "";
  if (headerAuth !== cronSecret && queryKey !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const GMAIL_FROM = process.env.GMAIL_FROM;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
  const DIGEST_TO = process.env.GMAIL_TO || GMAIL_FROM;

  if (!ANTHROPIC_API_KEY || !GMAIL_FROM || !GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: "Missing env: ANTHROPIC_API_KEY / GMAIL_FROM / GMAIL_APP_PASSWORD" });
  }

  const systemPrompt = `You are an intelligence analyst briefing a U.S. Navy officer moving to Newport, RI in summer 2027. Search for current news across these six categories for Newport and Aquidneck Island (Middletown, Portsmouth RI):
1. LOCAL NEWS - recent headlines from newportthisweek.com, whatsupnewp.com, newportbuzz.substack.com, newportri.com
2. POLITICS - city council, elections, local government from whatsupnewp.com, newportri.com, newportthisweek.com
3. SCHOOLS - Newport, Middletown, Portsmouth districts from whatsupnewp.com, newportthisweek.com, newportri.com. Note which districts military families prefer.
4. ACTIVITIES - upcoming events, dining, recreation from discovernewport.org, whatsupnewp.com, newportthisweek.com
5. QUALITY OF LIFE - housing, cost of living, neighborhoods from whatsupnewp.com, newportri.com
6. MILITARY - Naval Station Newport, Naval War College news from navymwrnewport.com, usnwc.edu, whatsupnewp.com

Return ONLY this JSON, no markdown, no preamble, no code fences:
{"date":"Week of [date]","topline":"one sentence summary of most important thing happening in Newport this week","categories":{"news":{"headline":"...","bullets":["...","...","..."],"sources":["domain.com"],"sowhat":"..."},"politics":{"headline":"...","bullets":["...","...","..."],"sources":["domain.com"],"sowhat":"..."},"schools":{"headline":"...","bullets":["...","...","..."],"sources":["domain.com"],"sowhat":"..."},"activities":{"headline":"...","bullets":["...","...","..."],"sources":["domain.com"],"sowhat":"..."},"qol":{"headline":"...","bullets":["...","...","..."],"sources":["domain.com"],"sowhat":"..."},"military":{"headline":"...","bullets":["...","...","..."],"sources":["domain.com"],"sowhat":"..."}}}`;

  try {
    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    // Call 1: Main digest
    const digestResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 5000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        system: systemPrompt,
        messages: [{ role: "user", content: `Generate my Newport RI weekly intelligence digest for the week of ${today}. Search all six categories and return the JSON.` }],
      }),
    });

    const digestData = await digestResponse.json();
    if (!digestResponse.ok) {
      return res.status(500).json({ success: false, error: digestData.error?.message || "Anthropic API error" });
    }

    const digestText = (digestData.content || [])
      .map(b => b.type === "text" ? b.text : "")
      .filter(Boolean)
      .join("\n");

    const digest = extractJSON(digestText);
    if (!digest) {
      return res.status(500).json({ success: false, error: "Could not parse digest: " + digestText.slice(0, 300) });
    }

    // Call 2: Notable
    const notableResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 600,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        system: `You are researching Newport RI community figures for a military officer relocating in 2027. Search for a notable Newport RI leader currently in the news — elected official, school superintendent, Naval Station CO, Naval War College president, state legislator, or civic leader. Only use facts from search results. Return ONLY this JSON, no markdown, no preamble:
{"name":"Full Name","role":"title and org","bio":"2-3 sentences","relevance":"why this matters to an incoming military family","source":"domain.com"}`,
        messages: [{ role: "user", content: "Search for a notable Newport RI community leader currently in the news and return only the JSON." }],
      }),
    });

    const notableData = await notableResponse.json();
    const notableText = (notableData.content || [])
      .map(b => b.type === "text" ? b.text : "")
      .filter(Boolean)
      .join("\n");
    const notable = extractJSON(notableText);

    // Attach tier2 links to each category
    const categories = {};
    for (const [key, val] of Object.entries(digest.categories || {})) {
      categories[key] = { ...val, tier2: TIER2[key] || [] };
    }

    const fullDigest = {
      date: digest.date || `Week of ${today}`,
      topline: digest.topline || "",
      categories,
      notable: notable || null,
    };

    // Send the email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_FROM, pass: GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `"Mahan · Newport Intel" <${GMAIL_FROM}>`,
      to: DIGEST_TO,
      subject: `⚓ Newport Intel — ${fullDigest.date}`,
      html: buildEmail(fullDigest),
    });

    return res.status(200).json({ success: true, sentTo: DIGEST_TO, date: fullDigest.date });

  } catch (err) {
    console.error("Newport email error:", err);
    return res.status(500).json({ error: err.message });
  }
}
