// api/log.js — Vercel Serverless Function
// Proxies requests from the React frontend to Google Apps Script.
// Runs server-side so there are zero CORS restrictions.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

  if (!APPS_SCRIPT_URL) {
    return res.status(500).json({ error: "APPS_SCRIPT_URL is not set" });
  }

  try {
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      redirect: "follow",
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}
