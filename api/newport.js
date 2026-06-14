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

  const CATEGORIES = ["news", "politics", "schools", "activities", "qol", "military"];

  const CATEGORY_CONFIG = {
    news: {
      label: "Local News",
      query: "Newport Rhode Island local news this week site:newportthisweek.com OR site:whatsupnewp.com OR site:newportbuzz.substack.com OR site:newportri.com OR site:patch.com/rhode-island/newport",
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
        { label: "Middletown Records", url: "https://www.middletownri.gov/289/Records-Department" },
        { label: "Portsmouth Records", url: "https://portsmouthri.gov/1762/Records-Licenses" },
        { label: "RI Legislature", url: "https://www.rilegislature.gov/" },
        { label: "League of Women Voters Newport County", url: "https://my.lwv.org/rhode-island/lwv-south-county" },
      ],
    },
    schools: {
      label: "Schools",
      query: "Newport Rhode Island public schools Middletown Portsmouth school district news 2026 site:whatsupnewp.com OR site:newportthisweek.com OR site:newportri.com",
      tier2: [
        { label: "RIDE School Report Cards", url: "https://reportcard.ride.ri.gov/" },
        { label: "RIDE Data Center", url: "https://datacenter.ride.ri.gov/" },
        { label: "Newport Schools Superintendent Updates", url: "https://www.npsri.net/page/superintendents-updates" },
        { label: "Superintendent Newsletter (Smore — read manually)", url: "https://app.smore.com/n/ky19u" },
        { label: "Middletown Schools", url: "https://www.middletownschools.org/" },
        { label: "Portsmouth Schools", url: "https://www.ppsk12.us/" },
        { label: "School Liaison Officer (NAVSTA Newport)", url: "https://www.navymwrnewport.com/child-youth/school-liaison" },
        { label: "GreatSchools Newport", url: "https://www.greatschools.org/rhode-island/newport/" },
      ],
    },
    activities: {
      label: "Activities & Events",
      query: "Newport Rhode Island events activities things to do this week site:discovernewport.org OR site:whatsupnewp.com OR site:newportthisweek.com OR site:newportlifemagazine.com",
      tier2: [
        { label: "Discover Newport Events Calendar", url: "https://www.discovernewport.org/events/" },
        { label: "Discover Newport: Things To Do", url: "https://www.discovernewport.org/things-to-do/" },
        { label: "Annual Special Events", url: "https://www.discovernewport.org/events/annual-events/" },
        { label: "America's 250th in Newport", url: "https://www.discovernewport.org/250th/" },
        { label: "WhatsUpNewp Calendar", url: "https://whatsupnewp.com/calendar/" },
      ],
    },
    qol: {
      label: "Quality of Life",
      query: "Newport Rhode Island housing cost of living real estate neighborhoods quality of life 2026 site:whatsupnewp.com OR site:newportri.com OR site:newportthisweek.com",
      tier2: [
        { label: "Redfin Newport Housing Market", url: "https://www.redfin.com/city/12826/RI/Newport/housing-market" },
        { label: "Realtor Newport County Market", url: "https://www.realtor.com/local/market/rhode-island/newport-county" },
        { label: "Zillow Newport County", url: "https://www.zillow.com/home-values/1945/newport-county-ri/" },
        { label: "Stonelink Property Management", url: "https://www.stonelinkpm.com/newport-property-management" },
        { label: "RI Real Estate Services Reports", url: "https://www.rirealestateservices.com/blank-5" },
        { label: "AreaVibes Newport", url: "https://www.areavibes.com/newport-ri/" },
        { label: "Niche Newport", url: "https://www.niche.com/places-to-live/newport-ri/" },
      ],
    },
    military: {
      label: "Military Community",
      query: "Naval Station Newport Rhode Island military news Naval War College 2026 site:navymwrnewport.com OR site:usnwc.edu OR site:whatsupnewp.com OR site:newportri.com",
      tier2: [
        { label: "Navy Housing — NAVSTA Newport", url: "https://ffr.cnic.navy.mil/Navy-Housing/Housing-By-Region/Mid-Atlantic/NAVSTA-Newport/" },
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

  async function processCategory(category) {
    const { label, query, tier2 } = CATEGORY_CONFIG[category];
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          system: `You are a news briefing writer for a U.S. Navy officer relocating to Newport, RI in summer 2027.
RULES:
- Only use facts that appear in the search results returned by your web_search tool.
- If search returns no results, respond with: ##JSON_START##{"status":"no_data"}##JSON_END##
- Never fill gaps with background knowledge or assumptions.
- Every claim must be traceable to a specific search result.
- Include the source domain (e.g. "newportthisweek.com") for each bullet.
- Wrap your JSON in ##JSON_START## and ##JSON_END## delimiters:
##JSON_START##{"status":"ok","headline":"one sentence headline","bullets":["bullet 1","bullet 2","bullet 3"],"sources":["domain1.com","domain2.com"],"sowhat":"one sentence on why this matters for someone moving to Newport in 2027"}##JSON_END##`,
          messages: [{ role: "user", content: `Search for and summarize current ${label} information for Newport, RI and Aquidneck Island. Prioritize these sources: ${query}` }],
        }),
      });

      const data = await response.json();
      if (!response.ok) return [category, { headline: "API error — try refreshing", bullets: ["Could not reach Anthropic API."], sources: [], sowhat: "Try again in a moment.", tier2 }];

      const text = (data.content || []).map(b => b.type === "text" ? b.text : "").filter(Boolean).join("\n");
      const parsed = extractJSON(text);

      if (!parsed || parsed.status !== "ok") {
        return [category, { headline: "No verified data this week", bullets: ["Visit the sources below directly for the latest."], sources: [], sowhat: "Check the Tier 2 sources directly.", tier2 }];
      }

      return [category, { headline: parsed.headline, bullets: parsed.bullets || [], sources: parsed.sources || [], sowhat: parsed.sowhat || "", tier2 }];
    } catch (err) {
      return [category, { headline: "Error loading this category", bullets: ["An unexpected error occurred."], sources: [], sowhat: "Try refreshing the digest.", tier2: CATEGORY_CONFIG[category].tier2 }];
    }
  }

  async function getNotable() {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
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
          system: `You are researching key Newport, Rhode Island community figures for a military officer relocating there in 2027.
Search for a Newport, RI community figure currently in the news — could be a local elected official, school superintendent, Naval Station Newport commander, Naval War College president, state legislator representing Aquidneck Island, or prominent civic/cultural leader.
Pick whoever is most relevant or newsworthy right now.
Only use facts from search results. Never invent details.
Wrap your JSON in ##JSON_START## and ##JSON_END##:
##JSON_START##{"name":"Full Name","role":"Their title and organization","bio":"2-3 sentences about who they are and what they do","relevance":"One sentence on why this person matters to an incoming military family","source":"domain.com"}##JSON_END##`,
          messages: [{ role: "user", content: "Search for a notable Newport RI community leader currently in the news and return their profile." }],
        }),
      });

      const data = await response.json();
      if (!response.ok) return null;
      const text = (data.content || []).map(b => b.type === "text" ? b.text : "").filter(Boolean).join("\n");
      return extractJSON(text);
    } catch {
      return null;
    }
  }

  try {
    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const [categoryResults, notable] = await Promise.all([
      Promise.all(CATEGORIES.map(cat => processCategory(cat))),
      getNotable(),
    ]);

    const categories = Object.fromEntries(categoryResults);

    return res.status(200).json({
      success: true,
      digest: {
        date: `Week of ${today}`,
        topline: `Newport intelligence digest for the week of ${today} — covering local news, politics, schools, activities, quality of life, and military community.`,
        categories,
        notable: notable || null,
      },
    });

  } catch (err) {
    console.error("Newport proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}
