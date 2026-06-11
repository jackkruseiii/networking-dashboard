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

  try {
    const { userPrompt } = req.body;

    const systemPrompt = `You are an intelligence analyst briefing a U.S. Navy officer moving to Newport, RI in summer 2027.

Search for current news across these six categories for Newport and Aquidneck Island (Middletown, Portsmouth RI):
1. LOCAL NEWS - recent headlines
2. POLITICS - city council, elections, local government
3. SCHOOLS - Newport, Middletown, Portsmouth districts; which do military families prefer
4. ACTIVITIES - upcoming events, dining, recreation
5. QUALITY OF LIFE - housing, cost of living, neighborhoods
6. MILITARY - Naval Station Newport, base news, family resources

For sources, include only the domain name (e.g. "newportri.com", "patch.com") not full URLs.

Return ONLY this JSON, no markdown, no preamble:
{"date":"Week of [date]","topline":"one sentence summary","categories":{"news":{"headline":"...","bullets":["...","..."],"sources":["https://...","https://..."],"sowhat":"..."},"politics":{"headline":"...","bullets":["...","..."],"sources":["https://...","https://..."],"sowhat":"..."},"schools":{"headline":"...","bullets":["...","..."],"sources":["https://...","https://..."],"sowhat":"..."},"activities":{"headline":"...","bullets":["...","..."],"sources":["https://...","https://..."],"sowhat":"..."},"qol":{"headline":"...","bullets":["...","..."],"sources":["https://...","https://..."],"sowhat":"..."},"military":{"headline":"...","bullets":["...","..."],"sources":["https://...","https://..."],"sowhat":"..."}}}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 5000,
        system: systemPrompt,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const rawText = await response.text();

    if (!response.ok) {
      return res.status(200).json({ success: false, error: "Anthropic error: " + rawText.slice(0, 500) });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      return res.status(200).json({ success: false, error: "Could not parse Anthropic response: " + rawText.slice(0, 300) });
    }

    const fullText = (data.content || [])
      .map(block => (block.type === "text" ? block.text : ""))
      .filter(Boolean)
      .join("\n");

    if (!fullText) {
      return res.status(200).json({ success: false, error: "No text in response. Full response: " + JSON.stringify(data).slice(0, 300) });
    }

    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(200).json({ success: false, error: "No JSON found in response: " + fullText.slice(0, 300) });
    }
    const clean = jsonMatch[0];

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return res.status(200).json({ success: false, error: "Could not parse digest JSON: " + clean.slice(0, 300) });
    }

    return res.status(200).json({ success: true, digest: parsed });

  } catch (err) {
    console.error("Newport proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}
