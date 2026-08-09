// api/feedback.js — logged-in users send feedback straight to your inbox.
// Auth: any valid Google sign-in (not admin-only). CORS-locked to the site.

import nodemailer from "nodemailer";
import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogle(credential) {
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload.email_verified) throw new Error("Email not verified");
  return { email: payload.email.toLowerCase(), name: payload.name || "" };
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

  const GMAIL_FROM = process.env.GMAIL_FROM;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
  const NOTIFY_TO = process.env.GMAIL_TO || GMAIL_FROM;
  if (!GMAIL_FROM || !GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: "Email is not configured." });
  }

  let sender;
  try {
    sender = await verifyGoogle(credential);
  } catch {
    return res.status(401).json({ error: "Invalid or expired sign-in" });
  }

  const b = req.body || {};
  const message = String(b.message == null ? "" : b.message).trim().slice(0, 4000);
  const categoryRaw = String(b.category == null ? "other" : b.category).toLowerCase();
  const category = ["idea", "bug", "other"].includes(categoryRaw) ? categoryRaw : "other";
  if (!message) return res.status(400).json({ error: "Message is empty." });

  const label = { idea: "💡 Idea", bug: "🐞 Bug", other: "💬 Feedback" }[category];
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_FROM, pass: GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `"Mahan · Feedback" <${GMAIL_FROM}>`,
      to: NOTIFY_TO,
      replyTo: sender.email,
      subject: `${label} from ${sender.name || sender.email}`,
      html: `<div style="font-family:Georgia,serif;font-size:14px;color:#222;line-height:1.7;">
        <p><strong>${label}</strong></p>
        <p><strong>From:</strong> ${esc(sender.name)} &lt;${esc(sender.email)}&gt;</p>
        <hr style="border:none;border-top:0.5px solid #eee;margin:14px 0;">
        <p style="white-space:pre-wrap;">${esc(message)}</p>
        <hr style="border:none;border-top:0.5px solid #eee;margin:14px 0;">
        <p style="color:#666;font-size:13px;">Reply to this email to respond to them directly.</p>
      </div>`,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Feedback error:", err);
    return res.status(500).json({ error: "Could not send. Please try again." });
  }
}
