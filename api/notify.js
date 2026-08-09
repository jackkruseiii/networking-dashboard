// api/notify.js — one endpoint for two kinds of emails to you:
//   type:"feedback"        -> from a signed-in user (Google auth required)
//   type:"access-request"  -> from a logged-out visitor (public)
// CORS-locked to the site. Replaces feedback.js + request-access.js.

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

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (s, n) => String(s == null ? "" : s).trim().slice(0, n);

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

  const GMAIL_FROM = process.env.GMAIL_FROM;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
  const NOTIFY_TO = process.env.GMAIL_TO || GMAIL_FROM;
  if (!GMAIL_FROM || !GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: "Email is not configured." });
  }

  const b = req.body || {};
  const type = b.type;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_FROM, pass: GMAIL_APP_PASSWORD },
  });

  try {
    // ── Feedback from a signed-in user ────────────────────────────────
    if (type === "feedback") {
      const credential = (req.headers.authorization || "").replace("Bearer ", "");
      if (!credential) return res.status(401).json({ error: "No credential" });

      let sender;
      try { sender = await verifyGoogle(credential); }
      catch { return res.status(401).json({ error: "Invalid or expired sign-in" }); }

      const message = clip(b.message, 4000);
      const catRaw = String(b.category || "other").toLowerCase();
      const category = ["idea", "bug", "other"].includes(catRaw) ? catRaw : "other";
      if (!message) return res.status(400).json({ error: "Message is empty." });

      const label = { idea: "💡 Idea", bug: "🐞 Bug", other: "💬 Feedback" }[category];
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
    }

    // ── Access request from a logged-out visitor (public) ─────────────
    if (type === "access-request") {
      if (b.website) return res.status(200).json({ success: true }); // honeypot
      const name = clip(b.name, 120);
      const email = clip(b.email, 200).toLowerCase();
      const affiliation = clip(b.affiliation, 300);
      const note = clip(b.note, 1000);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Please enter a valid email address." });
      }

      await transporter.sendMail({
        from: `"Mahan · Access Request" <${GMAIL_FROM}>`,
        to: NOTIFY_TO,
        replyTo: email,
        subject: `Mahan access request — ${name || email}`,
        html: `<div style="font-family:Georgia,serif;font-size:14px;color:#222;line-height:1.7;">
          <p>New access request for Mahan:</p>
          <p><strong>Name:</strong> ${esc(name) || "&mdash;"}<br>
          <strong>Email:</strong> ${esc(email)}<br>
          <strong>Military affiliation:</strong> ${esc(affiliation) || "&mdash;"}</p>
          ${note ? `<p><strong>Note:</strong><br>${esc(note)}</p>` : ""}
          <hr style="border:none;border-top:0.5px solid #eee;margin:16px 0;">
          <p style="color:#666;font-size:13px;">To grant access: open Mahan &rarr; <strong>&#9993; Invite</strong> &rarr; enter <strong>${esc(email)}</strong> &rarr; Send.</p>
        </div>`,
      });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "Unknown notify type." });

  } catch (err) {
    console.error("Notify error:", err);
    return res.status(500).json({ error: "Could not send. Please try again." });
  }
}
