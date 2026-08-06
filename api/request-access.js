// api/request-access.js — public endpoint (no sign-in required).
// Outsiders submit their email + military affiliation; it emails the request
// to you so you can invite them from the admin panel. CORS-locked to the site.

import nodemailer from "nodemailer";

export default async function handler(req, res) {
  const allowedOrigins = ["https://usemahan.com", "https://www.usemahan.com"];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const GMAIL_FROM = process.env.GMAIL_FROM;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
  const NOTIFY_TO = process.env.GMAIL_TO || GMAIL_FROM;
  if (!GMAIL_FROM || !GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: "Email is not configured." });
  }

  const b = req.body || {};

  // Honeypot: bots fill the hidden "website" field. Pretend success, send nothing.
  if (b.website) return res.status(200).json({ success: true });

  const clip = (s, n) => String(s == null ? "" : s).trim().slice(0, n);
  const name = clip(b.name, 120);
  const email = clip(b.email, 200).toLowerCase();
  const affiliation = clip(b.affiliation, 300);
  const note = clip(b.note, 1000);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_FROM, pass: GMAIL_APP_PASSWORD },
    });

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
        <p style="color:#666;font-size:13px;">To grant access: open Mahan &rarr; <strong>&#9993; Invite</strong> &rarr; enter <strong>${esc(email)}</strong> &rarr; Send. (Reply to this email to reach them directly.)</p>
      </div>`,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Access request error:", err);
    return res.status(500).json({ error: "Could not submit your request. Please try again." });
  }
}
