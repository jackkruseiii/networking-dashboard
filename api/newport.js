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

  const CATEGORY_QUERIES = {
    news:       "Newport Rhode Island local news this week",
    politics:   "Newport Rhode Island city council government politics 2026",
    schools:    "Newport Middletown Portsmouth Rhode Island school district news 2026",
    activities: "Newport Rhode Island events festivals activities June 2026",
    qol:        "Newport Rhode Island housing cost of living neighborhoods 2026",
    military:   "Naval Station Newport Rhode Island military news 2026",
  };

  const CATEGORY_LABELS = {
    news:       "Local News",
    politics:   "Politics & Government",
    schools:    "Schools",
    activities: "Activities & Events",
    qol:        "Quality of Life",
    military:   "Military Community",
  };

  async function fetchAndSummarize(category) {
    const query = CATEGORY_QUERIES[category];
    const label = CATEGORY_LABELS[category];

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
- If search returns no results or empty content, respond ONLY with: {"status":"no_data"}
- Never fill gaps with background knowledge or assumptions.
- Every claim must be traceable to a specific search result.
- Include the source domain (e.g. "newportri.com") for each bullet.
- Respond in JSON only, no markdown, no preamble:
{"status":"ok","headline":"one sentence headline","bullets":["bullet 1","bullet 2","bullet 3"],"sources":["domain1.com","domain2.com"],"sowhat":"one sentence on why this matters for someone moving to Newport in 2027","raw_claims":["claim1","claim2","claim3"]}`,
        messages: [{ role: "user", content: `Search for and summarize current ${label} information for Newport, RI and Aquidneck Island: ${query}` }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return { status: "api_error", detail: JSON.stringify(data).slice(0, 200) };

    const text = (data.content || [])
      .map(block => (block.type === "text" ? block.text : ""))
      .filter(Boolean)
      .join("\n");

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { status: "parse_error", detail: text.slice(0, 200) };
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      return { status: "parse_error", detail: text.slice(0, 200) };
    }
  }

  async function verifyBriefing(summary) {
    if (!summary || summary.status !== "ok") return null;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: `You are a fact-checker. Given a briefing and its claims, identify any claim that appears to be assumed, inferred, or not directly supported by real search results.
Respond in JSON only, no markdown, no preamble:
{"verified":true/false,"flagged_claims":["..."],"clean_bullets":["..."],"clean_sowhat":"..."}
If verified is false, rewrite clean_bullets and clean_sowhat with flagged claims removed or softened to "reportedly".`,
        messages: [{
          role: "user",
          content: `HEADLINE: ${summary.headline}\n\nBULLETS: ${JSON.stringify(summary.bullets)}\n\nSOWHAT: ${summary.sowhat}\n\nCLAIMS TO CHECK: ${JSON.stringify(summary.raw_claims || summary.bullets)}`,
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) return null;

    const text = (data.content || [])
      .map(block => (block.type === "text" ? block.text : ""))
      .filter(Boolean)
      .join("\n");

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }

  async function processCategory(category) {
    const summary = await fetchAndSummarize(category);

    if (!summary || summary.status !== "ok") {
      return [category, {
        headline: `No verified data available (${summary?.status || "unknown"}: ${summary?.detail || "no detail"})`,
        bullets: ["Check back next week or visit the source directly."],
        sources: [],
        sowhat: "Data could not be verified from live sources this week.",
      }];
    }

    const verified = await verifyBriefing(summary);

    return [category, {
      headline: summary.headline,
      bullets:  verified ? verified.clean_bullets : summary.bullets,
      sources:  summary.sources || [],
      sowhat:   verified ? verified.clean_sowhat  : summary.sowhat,
    }];
  }

  try {
    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    // Run all 6 categories in parallel
    const results = await Promise.all(CATEGORIES.map(cat => processCategory(cat)));

    const categories = Object.fromEntries(results);

    return res.status(200).json({
      success: true,
      digest: {
        date: `Week of ${today}`,
        topline: `Newport intelligence digest for the week of ${today} — covering local news, politics, schools, activities, quality of life, and military community.`,
        categories,
      },
    });

  } catch (err) {
    console.error("Newport proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}
