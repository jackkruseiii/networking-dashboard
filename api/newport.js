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
    // Try every possible { } pair from outermost to innermost
    const candidates = [];
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === "{") {
        let depth = 0;
        for (let j = i; j < raw.length; j++) {
          if (raw[j] === "{") depth++;
          else if (raw[j] === "}") {
            depth--;
            if (depth === 0) {
              candidates.push(raw.slice(i, j + 1));
              break;
            }
          }
        }
      }
    }
    // Try each candidate, return first valid one with "status" key
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === "object" && "status" in parsed) {
          return parsed;
        }
      } catch {}
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
- Search for current information using your web_search tool.
- Only report facts found in search results.
- If search returns nothing useful, set status to "no_data".
- Your response
