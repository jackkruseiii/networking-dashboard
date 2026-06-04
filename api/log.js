// api/log.js — Vercel Serverless Function
// This runs on Vercel's servers, not in the browser.
// No CORS restrictions. Calls Google Apps Script directly.

export default async function handler(req, res) {
  // Allow requests from your own frontend only
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

  if (!APPS_SCRIPT_URL) {
    return res.status(500).json({ error: "APPS_SCRIPT_URL environment variable not set" });
  }

  try {
    const body = req.body;

    // Call Google Apps Script from the server — no browser, no CORS
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "follow",
    });

    // Apps Script returns 302 redirects on success — that's normal
    // We just confirm the request completed
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: err.message });
  }
}
