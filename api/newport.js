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

  function extractJSON(raw) {
    const start = raw.indexOf("##JSON_START##");
    const end   = raw.indexOf("##JSON_END##");
    if (start !== -1 && end !== -1) {
      try {
        return JSON.parse(raw.slice(start + 14, end).trim());
      } catch {}
    }
    let depth = 0;
    let begin = -1;
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
    const query = CATEGORY_QUERIES[category];
    const label = CATEGORY_LABELS[category];

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
- Include the source domain (e.g. "newportri.com") for each bullet.
- Wrap your JSON in ##JSON_START## and ##JSON_END## delimiters like this:
##JSON_START##{"status":"ok","headline":"one sentence headline","bullets":["bullet 1","bullet 2","bullet 3"],"sources":["domain1.com","domain2.com"],"sowhat":"one sentence on why this matters for someone moving to Newport in 2027"}##JSON_END##`,
          messages: [{ role: "user", content: `Search for and summarize current ${label} information for Newport, RI and Aquidneck Island: ${query}` }],
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return [category, {
          headline: "API error — try refreshing",
          bullets: ["Could not reach Anthropic API."],
          sources: [],
          sowhat: "Try again in a moment.",
        }];
      }

      const text = (data.content || [])
        .map(block => (block.type === "text" ? block.text : ""))
        .filter(Boolean)
        .join("\n");

      const parsed = extractJSON(text);

      if (!parsed || parsed.status !== "ok") {
        return [category, {
          headline: "No verified data this week",
          bullets: ["Visit newportri.com or patch.com/rhode-island/newport directly."],
          sources: [],
          sowhat: "Check the source directly for the latest.",
        }];
      }

      return [category, {
        headline: parsed.headline,
        bullets:  parsed.bullets  || [],
        sources:  parsed.sources  || [],
        sowhat:   parsed.sowhat   || "",
      }];

    } catch (err) {
      return [category, {
        headline: "Error loading this category",
        bullets: ["An unexpected error occurred."],
        sources: [],
        sowhat: "Try refreshing the digest.",
      }];
    }
  }

  try {
    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

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
