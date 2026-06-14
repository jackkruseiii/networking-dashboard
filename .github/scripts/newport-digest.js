const https = require("https");
const nodemailer = require("nodemailer");

const CATEGORY_CONFIG = {
  news: {
    label: "Local News",
    query: "Newport Rhode Island local news this week site:newportthisweek.com OR site:whatsupnewp.com OR site:newportri.com OR site:patch.com",
    tier2: [
      { label: "The Point Association", url: "https://thepointassociation.org/our-neighborhood/" },
      { label: "Newport Life Magazine", url: "https://www.newportlifemagazine.com/" },
    ],
  },
  politics: {
    label: "Politics & Government",
    query: "Newport Rhode Island city council government politics 2026 site:whatsupnewp.com OR site:newportri.com OR site:newportthisweek.com OR site:wpri.com",
    tier2: [
      { label: "Newport City Council (ClerkBase)", url: "https://www.clerkshq.com/newport-ri" },
      { label: "Newport Public Records", url: "https://www.newportri.gov/city-hall/departments/city-clerk/Public-Records" },
      { label: "RI Open Meetings", url: "https://opengov.sos.ri.gov/" },
      { label: "RI Legislature", url: "https://www.rilegislature.gov/" },
      { label: "League of Women Voters Newport County", url: "https://my.lwv.org/rhode-island/lwv-south-county" },
    ],
  },
  schools: {
    label: "Schools",
    query: "Newport Rhode Island public schools Middletown Portsmouth school district news 2026 site:whatsupnewp.com OR site:newportthisweek.com OR site:newportri.com",
    tier2: [
      { label: "RIDE School Report Cards", url: "https://reportcard.ride.ri.gov/" },
      { label: "Newport Schools Superintendent Updates", url: "https://www.npsri.net/page/superintendents-updates" },
      { label: "Superintendent Newsletter (read manually)", url: "https://app.smore.com/n/ky19u" },
      { label: "Middletown Schools", url: "https://www.middletownschools.org/" },
      { label: "Portsmouth Schools", url: "https://www.ppsk12.us/" },
      { label: "School Liaison Officer", url: "https://www.navymwrnewport.com/child-youth/school-liaison" },
      { label: "GreatSchools Newport", url: "https://www.greatschools.org/rhode-island/newport/" },
    ],
  },
  activities: {
    label: "Activities & Events",
    query: "Newport Rhode Island events activities things to do this week site:discovernewport.org OR site:whatsupnewp.com OR site:newportthisweek.com",
    tier2: [
      { label: "Discover Newport Events", url: "https://www.discovernewport.org/events/" },
      { label: "Discover Newport: Things To Do", url: "https://www.discovernewport.org/things-to-do/" },
      { label: "WhatsUpNewp Calendar", url: "https://whatsupnewp.com/calendar/" },
      { label: "America's 250th in Newport", url: "https://www.discovernewport.org/250th/" },
    ],
  },
  qol: {
    label: "Quality of Life",
    query: "Newport Rhode Island housing cost of living real estate neighborhoods 2026 site:whatsupnewp.com OR site:newportri.com OR site:newportthisweek.com",
    tier2: [
      { label: "Redfin Newport", url: "https://www.redfin.com/city/12826/RI/Newport/housing-market" },
      { label: "Realtor Newport County", url: "https://www.realtor.com/local/market/rhode-island/newport-county" },
      { label: "Zillow Newport County", url: "https://www.zillow.com/home-values/1945/newport-county-ri/" },
      { label: "Stonelink Property Management", url: "https://www.stonelinkpm.com/newport-property-management" },
      { label: "Niche Newport", url: "https://www.niche.com/places-to-live/newport-ri/" },
      { label: "AreaVibes Newport", url: "https://www.areavibes.com/newport-ri/" },
    ],
  },
  military: {
    label: "Military Community",
    query: "Naval Station Newport Rhode Island military news Naval War College 2026 site:navymwrnewport.com OR site:usnwc.edu OR site:whatsupnewp.com",
    tier2: [
      { label: "Navy Housing NAVSTA Newport", url: "https://ffr.cnic.navy.mil/Navy-Housing/Housing-By-Region/Mid-Atlantic/NAVSTA-Newport/" },
      { label: "Balfour Beatty (On-Base Housing)", url: "https://www.navstanewporthomes.com/" },
      { label: "Fleet & Family Support Center", url: "https://www.navymwrnewport.com/programs/612ca018-9e3c-41b7-ae02-be3177ba9e14" },
      { label: "Naval War College Press", url: "https://usnwc.edu/Publications/Naval-War-College-Press/" },
      { label: "NWC Foundation", url: "https://nwcfoundation.org/" },
      { label: "Military OneSource", url: "https://www.militaryonesource.mil/" },
    ],
  },
};

function extractJSON(raw) {
  const start = raw.indexOf("##JSON_START##");
  const end = raw.indexOf("##JSON_END##");
  if (start !== -1 && end !== -1) {
    try { return JSON.parse(raw.slice(start + 14, end).trim()); } catch {}
  }
  let depth = 0, begin = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "{") { if (begin === -1) begin = i; depth++; }
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0 && begin !== -1) {
        try { return JSON.parse(raw.slice(begin, i + 1)); } catch { begin = -1; }
      }
    }
  }
  return null;
}

function callAnthropic(system, userMsg) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system,
      messages: [{ role: "user", content: userMsg }],
    });
    const req = https.request({
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const text = (parsed.content || []).map(b => b.type === "text" ? b.text : "").filter(Boolean).join("\n");
          resolve(text);
        } catch { resolve(""); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function processCategory(category) {
  const { label, query, tier2 } = CATEGORY_CONFIG[category];
  const system = `You are a news briefing writer for a U.S. Navy officer relocating to Newport, RI in summer 2027.
RULES:
- Only use facts from search results returned by your web_search tool.
- If no results, respond with: ##JSON_START##{"status":"no_data"}##JSON_END##
- Never fill gaps with background knowledge.
- Wrap JSON in ##JSON_START## and ##JSON_END##:
##JSON_START##{"status":"ok","headline":"one sentence headline","bullets":["bullet 1","bullet 2","bullet 3"],"sources":["domain1.com","domain2.com"],"sowhat":"one sentence on why this matters for someone moving to Newport in 2027"}##JSON_END##`;
  const text = await callAnthropic(system, `Search for current ${label} info for Newport RI and Aquidneck Island. Prioritize: ${query}`);
  const parsed = extractJSON(text);
  if (!parsed || parsed.status !== "ok") {
    return { label, headline: "No verified data this week", bullets: ["Visit sources below directly."], sources: [], sowhat: "", tier2 };
  }
  return { label, headline: parsed.headline, bullets: parsed.bullets || [], sources: parsed.sources || [], sowhat: parsed.sowhat || "", tier2 };
}

async function getNotable() {
  const system = `You are researching Newport RI community figures for a military officer relocating in 2027.
Search for a notable Newport RI leader currently in the news — elected official, school superintendent, Naval Station CO, Naval War College president, state legislator, or civic leader.
Only use facts from search results.
Wrap JSON in ##JSON_START## and ##JSON_END##:
##JSON_START##{"name":"Full Name","role":"title and org","bio":"2-3 sentences","relevance":"why this matters to an incoming military family","source":"domain.com"}##JSON_END##`;
  const text = await callAnthropic(system, "Search for a notable Newport RI community leader currently in the news.");
  return extractJSON(text);
}

function buildEmail(categories, notable, date) {
  const catHTML = Object.entries(categories).map(([, cat]) => `
    <div style="margin-bottom:32px;padding:20px 24px;background:#fff;border:1px solid #e0e0de;border-radius:10px;">
      <div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#0a2342;margin-bottom:6px;">${cat.label}</div>
      <div style="font-size:18px;font-weight:700;color:#1a1a18;margin-bottom:14px;line-height:1.3;">${cat.headline}</div>
      <hr style="border:none;border-top:1px solid #f0f0ee;margin-bottom:14px;">
      ${cat.bullets.map(b => `<div style="display:flex;gap:10px;margin-bottom:10px;font-size:14px;color:#333;line-height:1.6;"><span style="color:#0a2342;font-weight:700;flex-shrink:0;">—</span><span>${b}</span></div>`).join("")}
      ${cat.sowhat ? `<div style="background:#f0f4f9;border:1px solid #c8d8ea;border-radius:8px;padding:12px 16px;margin-top:16px;"><span style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#0a2342;margin-right:8px;">So What?</span><span style="font-size:13px;color:#445;font-style:italic;">${cat.sowhat}</span></div>` : ""}
      ${cat.sources && cat.sources.length > 0 ? `<div style="margin-top:12px;"><div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#999;margin-bottom:6px;">Sources</div>${cat.sources.map(s => `<div style="margin-bottom:3px;"><a href="${s.startsWith("http") ? s : "https://" + s}" style="font-size:12px;color:#0a2342;">${s}</a></div>`).join("")}</div>` : ""}
      ${cat.tier2 && cat.tier2.length > 0 ? `<div style="margin-top:16px;padding-top:14px;border-top:1px solid #f0f0ee;"><div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#bbb;margin-bottom:8px;">Go Deeper</div><div style="display:flex;flex-wrap:wrap;gap:6px;">${cat.tier2.map(link => `<a href="${link.url}" style="font-size:11px;padding:4px 10px;border:1px solid #e0e0de;border-radius:6px;color:#666;text-decoration:none;background:#fafaf8;">${link.label}</a>`).join("")}</div></div>` : ""}
    </div>
  `).join("");

  const notableHTML = notable ? `
    <div style="margin-bottom:32px;padding:20px 24px;background:#fff;border:1px solid #e0e0de;border-radius:10px;">
      <div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#c8a96e;margin-bottom:10px;">⭐ Newport Notable</div>
      <div style="font-size:18px;font-weight:700;color:#1a1a18;margin-bottom:2px;">${notable.name}</div>
      <div style="font-size:12px;color:#999;margin-bottom:12px;">${notable.role}</div>
      <hr style="border:none;border-top:1px solid #f0f0ee;margin-bottom:12px;">
      <div style="font-size:14px;color:#333;line-height:1.7;margin-bottom:10px;">${notable.bio}</div>
      <div style="font-size:13px;color:#0a2342;font-style:italic;">Why it matters: ${notable.relevance}</div>
      ${notable.source ? `<div style="margin-top:10px;"><a href="https://${notable.source}" style="font-size:12px;color:#0a2342;">${notable.source}</a></div>` : ""}
    </div>
  ` : "";

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#fafaf8;font-family:Georgia,serif;">
  <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
    <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #0a2342;">
      <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#0a2342;margin-bottom:6px;">NAVAL STATION NEWPORT</div>
      <div style="font-size:26px;font-weight:700;color:#1a1a18;margin-bottom:4px;">⚓ Newport Intel Digest</div>
      <div style="font-size:12px;color:#999;">${date} · Aquidneck Island, RI</div>
    </div>
    ${notableHTML}
    ${catHTML}
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#bbb;text-align:center;">
      Newport Intelligence Digest · AI-generated with live web search · Verify claims before acting on them
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const CATEGORIES = ["news", "politics", "schools", "activities", "qol", "military"];

  console.log("Generating digest for", today);

  const [categoryResults, notable] = await Promise.all([
    Promise.all(CATEGORIES.map(cat => processCategory(cat).then(r => [cat, r]))),
    getNotable(),
  ]);

  const categories = Object.fromEntries(categoryResults);
  const html = buildEmail(categories, notable, today);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "jackkruseiii@gmail.com",
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: '"Newport Intel Digest" <jackkruseiii@gmail.com>',
    to: "jackkruseiii@gmail.com",
    subject: `⚓ Newport Intel Digest — ${today}`,
    html,
  });

  console.log("Digest sent successfully for", today);
}

main().catch(err => { console.error(err); process.exit(1); });
