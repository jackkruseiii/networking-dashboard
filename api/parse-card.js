// api/parse-card.js — Vercel Serverless Function
// Reads a photo of a business card with Claude vision and returns the
// contact fields as JSON. Same auth/CORS as the other Claude proxy routes.

import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogle(credential) {
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload.email_verified) throw new Error("Email not verified");
  return payload.email.toLowerCase();
}

export default async function handler(req, res) {
  const allowedOrigins = ["https://usemahan.com", "https://www.usemahan.com"];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const credential = (req.headers.authorization || "").replace("Bearer ", "");
  if (!credential) return res.status(401).json({ error: "No credential" });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY environment variable not set" });
  }

  try {
    await verifyGoogle(credential);

    const { imageBase64, mediaType, systemPrompt } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "No image provided" });

    const media = (typeof mediaType === "string" && mediaType.startsWith("image/")) ? mediaType : "image/jpeg";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: systemPrompt || "Extract the contact fields from this business card and return ONLY a JSON object, no markdown.",
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: media, data: imageBase64 } },
              { type: "text", text: "Extract the contact fields from this business card and return ONLY the JSON object." },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "Anthropic API error" });
    }

    const text = (data.content || [])
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    return res.status(200).json({ success: true, text });

  } catch (err) {
    console.error("Card parse error:", err);
    return res.status(500).json({ error: err.message });
  }
}
