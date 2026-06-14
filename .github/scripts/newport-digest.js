const https = require("https");
const nodemailer = require("nodemailer");

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
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  return null;
}

function callAnthropic(system, userMsg, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
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

function buildEmail(digest, notable, today) {
  const CATEGORY_LABELS = {
    news: "Local News", politics: "Politics & Government",
    schools: "Schools", activities: "Activities & Events",
    qol: "Quality of Life", military: "Military Community",
  };

  const catHTML = Object.entries(digest.categories || {}).map(([key, cat]) => {
    const tier2 = TIER2[key] || [];
    return `
    <div style="margin-bottom:32px;padding:20px 24px;background:#fff;border:1px solid #e0e0de;border-radius:10px;">
      <div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#0a2342;margin-bottom:6px;">${CATEGORY_LABELS[key] || key}</div>
      <div style="font-size:18px;font-weight:700;color:#1a1a18;margin-bottom:14px;line-height:1.3;">${cat.headline || ""}</div>
      <hr style="border:none;border-top:1px solid #f0f0ee;margin-bottom:14px;">
      ${(cat.bullets || []).map(b => `<div style="display:flex;gap:10px;margin-bottom:10px;font-size:14px;color:#333;line-height:1.6;"><span style="color:#0a2342;font-weight:700;flex-shrink:0;">—</span><span>${b}</span></div>`).join("")}
      ${cat.sowhat ? `<div style="background:#f0f4f9;border:1px solid #c8d8ea;border-radius:8px;padding:12px 16px;margin-top:16px;"><span style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#0a2342;margin-right:8px;">So What?</span><span style="font-size:13px;color:#445;font-style:italic;">${cat.sowhat}</span></div>` : ""}
      ${cat.sources && cat.sources.length > 0 ? `<div style="margin-top:12px;"><div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#999;margin-bottom:6px;">Sources</div>${cat.sources.map(s => `<div style="margin-bottom:3px;"><a href="${s.startsWith("http") ? s : "https://" + s}" style="font-size:12px;color:#0a2342;">${s}</a></div>`).join("")}</div>` : ""}
      ${tier2.length > 0 ? `<div style="margin-top:16px;padding-top:14px;border-top:1px solid #f0f0ee;"><div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#bbb;margin-bottom:8px;">Go Deeper</div><div style="display:flex;flex-wrap:wrap;gap:6px;">${tier2.map(link => `<a href="${link.url}" style="font-size:11px;padding:4px 10px;border:1px solid #e0e0de;border-radius:6px;color:#666;text-decoration:none;background:#fafaf8;">${link.label}</a>`).join("")}</div></div>` : ""}
    </div>`;
  }).join("");

  const notableHTML = notable ? `
    <div style="margin-bottom:32px;padding:20px 24px;background:#fff;border:1px solid #e0e0de;border-radius:10px;">
      <div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#c8a96e;margin-bottom:10px;">⭐ Newport Notable</div>
      <div style="font-size:18px;font-weight:700;color:#1a1a18;margin-bottom:2px;">${notable.name}</div>
      <div style="font-size:12px;color:#999;margin-bottom:12px;">${notable.role}</div>
      <hr style="border:none;border-top:1px solid #f0f0ee;margin-bottom:12px;">
      <div style="font-size:14px;color:#333;line-height:1.7;margin-bottom:10px;">${notable.bio}</div>
      <div style="font-size:13px;color:#0a2342;font-style:italic;">Why it matters: ${notable.relevance}</div>
      ${notable.source ? `<div style="margin-top:10px;"><a href="https://${notable.source}" style="font-size:12px;color:#0a2342;">${notable.source}</a></div>` : ""}
    </div>` : "";

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#fafaf8;font-family:Georgia,serif;">
  <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
    <div style="margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #0a2342;">
      <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#0a2342;margin-bottom:6px;">NAVAL STATION NEWPORT</div>
      <div style="font-size:26px;font-weight:700;color:#1a1a18;margin-bottom:4px;">⚓ Newport Intel Digest</div>
      <div style="font-size:12px;color:#999;">${today} · Aquidneck Island, RI</div>
    </div>
    ${digest.topline ? `<div style="border-left:3px solid #0a2342;padding-left:14px;margin-bottom:24px;"><div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#0a2342;margin-bottom:5px;">This Week's Topline</div><div style="font-size:17px;color:#1a1a18;line-height:1.5;font-style:italic;">${digest.topline}</div></div>` : ""}
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
  console.log("Generating digest for", today);

  const digestSystem = `You are an intelligence analyst briefing a U.S. Navy officer moving to Newport, RI in summer 2027. Search for current news across these six categories for Newport and Aquidneck Island (Middletown, Portsmouth RI):
1. LOCAL NEWS - recent headlines from newportthisweek.com, whatsupnewp.com, newportbuzz.substack.com, newportri.com
2. POLITICS - city council, elections, local government from whatsupnewp.com, newportri.com, newportthisweek.com
3. SCHOOLS - Newport, Middletown, Portsmouth districts. Note which districts military families prefer.
4. ACTIVITIES - upcoming events, dining, recreation from discovernewport.org, whatsupnewp.com, newportthisweek.com
5. QUALITY OF LIFE - housing, cost of living, neighborhoods
6. MILITARY - Naval Station Newport, Naval War College news from navymwrnewport.com, usnwc.edu

Return ONLY this JSON, no markdown, no preamble, no code fences:
{"date":"Week of [date]","topline":"one sentence summary","categories":{"news":{"headline":"...","bullets":["...","...","..."],"sources":["domain.com"],"sowhat":"..."},"politics":{"headline":"...","bullets":["...","...","..."],"sources":["domain.com"],"sowhat":"..."},"schools":{"headline":"...","bullets":["...","...","..."],"sources":["domain.com"],"sowhat":"..."},"activities":{"headline":"...","bullets":["...","...","..."],"sources":["domain.com"],"sowhat":"..."},"qol":{"headline":"...","bullets":["...","...","..."],"sources":["domain.com"],"sowhat":"..."},"military":{"headline":"...","bullets":["...","...","..."],"sources":["domain.com"],"sowhat":"..."}}}`;

  const notableSystem = `You are researching Newport RI community figures for a military officer relocating in 2027. Search for a notable Newport RI leader currently in the news. Only use facts from search results. Return ONLY this JSON, no markdown, no preamble:
{"name":"Full Name","role":"title and org","bio":"2-3 sentences","relevance":"why this matters to an incoming military family","source":"domain.com"}`;

  const [digestText, notableText] = await Promise.all([
    callAnthropic(digestSystem, `Generate my Newport RI weekly intelligence digest for the week of ${today}. Search all six categories and return the JSON.`, 5000),
    callAnthropic(notableSystem, "Search for a notable Newport RI community leader currently in the news and return only the JSON.", 600),
  ]);

  console.log("Digest raw (first 300):", digestText.slice(0, 300));
  console.log("Notable raw (first 300):", notableText.slice(0, 300));

  const digest = extractJSON(digestText);
  const notable = extractJSON(notableText);

  if (!digest) {
    console.error("Could not parse digest JSON. Raw:", digestText.slice(0, 500));
    process.exit(1);
  }

  const html = buildEmail(digest, notable, today);

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
