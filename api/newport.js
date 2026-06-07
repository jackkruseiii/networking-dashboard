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

    const systemPrompt = `You are an intelligence analyst preparing a weekly community briefing for a U.S. Navy officer relocating to Newport, Rhode Island in summer 2027. He wants to get smart on the community before his arrival.

Search for the latest news and information across these six categories for Newport, RI and surrounding Aquidneck Island (Middletown and Portsmouth, RI):

1. LOCAL NEWS — Top 2-3 stories from Newport This Week, Newport Daily News, Newport Patch
2. POLITICS & GOVERNMENT — City council activity, local elections, policy changes, budget news
3. SCHOOLS — Newport, Middletown, and Portsmouth school district news. Note which districts military families prefer.
4. ACTIVITIES & EVENTS — Upcoming events, festivals, recreation, dining in the next 2-4 weeks
5. QUALITY OF LIFE — Housing market, cost of living, neighborhood news, infrastructure
6. MILITARY COMMUNITY — Naval Station Newport news, base activities, military family resources

For each category provide:
- A one-sentence summary headline
- 2-3 bullet points of specific, current intel
- A "So What?" line: one sentence on why this matters for someone moving there in 2027

Return ONLY a valid JSON object, no markdown fences, no preamble:
{
  "date": "Week of [current date]",
  "topline": "One sentence overall summary of the most important thing happening in Newport this week",
  "categories": {
    "news":     { "headline": "...", "bulle
