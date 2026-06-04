// api/contacts.js — Vercel Serverless Function
// Reads all contacts from Google Sheet and returns them as JSON.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

  if (!APPS_SCRIPT_URL) {
    return res.status(500).json({ error: "APPS_SCRIPT_URL is not set" });
  }

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "GET",
      redirect: "follow",
    });

    const text = await response.text();
    const data = JSON.parse(text);

    return res.status(200).json(data);

  } catch (err) {
    console.error("Contacts fetch error:", err);
    return res.status(500).json({ error: err.message });
  }
}
