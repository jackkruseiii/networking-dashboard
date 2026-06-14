export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
  }

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
    // fallback: find first { and last }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
    return null;
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

    return res.status(200).json({
      success: true,
      digest: {
        date: digest.date || `Week of ${today}`,
        topline: digest.topline || "",
        categories,
        notable: notable || null,
      },
    });

  } catch (err) {
    console.error("Newport proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}
