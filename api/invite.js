// api/invite.js
// Called manually to send an invite email to a new user.
// The invites row must already exist in Supabase with status: approved.
// POST with { email: "their@email.com" }
// Secured by requiring the ADMIN_SECRET env var in the Authorization header.

import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

  // Simple admin auth — set ADMIN_SECRET in Vercel env vars
  const auth = (req.headers.authorization || "").replace("Bearer ", "");
  if (!auth || auth !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Missing email" });

  try {
    // Verify invite exists and is approved
    const { data: invite, error } = await supabase
      .from("invites")
      .select("status")
      .eq("email", email.toLowerCase())
      .single();

    if (error || !invite) {
      return res.status(404).json({ error: "No invite found for this email. Add them to the invites table first." });
    }
    if (invite.status !== "approved") {
      return res.status(400).json({ error: "Invite status is not approved." });
    }

    // Send the email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_FROM, pass: process.env.GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `"Jack Kruse" <${process.env.GMAIL_FROM}>`,
      to: email,
      subject: "You're invited to Mahan — my military transition networking tool",
      html: buildInviteEmail(email),
    });

    return res.status(200).json({ success: true, message: `Invite email sent to ${email}` });

  } catch (err) {
    console.error("Invite email error:", err);
    return res.status(500).json({ error: err.message });
  }
}

function buildInviteEmail(recipientEmail) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Georgia,serif;background:#f4f4f0;margin:0;padding:20px;">
<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0e0da;">

  <div style="background:#0a2342;padding:28px 32px;">
    <div style="font-size:11px;color:#c9a84c;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;">Personal invitation</div>
    <div style="font-size:26px;font-weight:700;color:#fff;margin-bottom:6px;">You're in.</div>
    <div style="font-size:14px;color:#8fadc8;line-height:1.5;">I built something I wish had existed when I started thinking about my transition — and I want you to have access to it.</div>
  </div>

  <div style="padding:28px 32px;">

    <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 18px 0;">
      I'm Jack Kruse — Navy Captain, currently serving as Military Group Chief at the U.S. Embassy in Brasília. I retire in 2028 and I've been building toward that transition for the past year. One of the things I noticed early on is that managing a professional network across hundreds of contacts — keeping track of who you've talked to, what was said, who you need to follow up with, and which relationships are going cold — is genuinely hard. There's no good tool for it that actually understands what military transition looks like.
    </p>

    <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 18px 0;">
      So I built one. I named it <strong>Mahan</strong> — after Alfred Thayer Mahan, the naval officer who stepped off the quarterdeck, started writing, and became the most influential strategic thinker of his era. He's the original military-to-civilian intellectual transition story. The name felt right.
    </p>

    <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 24px 0;">
      I'm sharing it with a small group of people I trust. You're one of them. Here's what you're getting access to:
    </p>

    <div style="background:#f9f9f7;border-radius:10px;padding:20px 24px;margin-bottom:24px;border-left:3px solid #0a2342;">
      <div style="font-size:11px;font-weight:600;color:#0a2342;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;">What Mahan does</div>

      <div style="margin-bottom:14px;">
        <div style="font-size:14px;font-weight:600;color:#1a1a18;margin-bottom:4px;">📋 Contact tracking</div>
        <div style="font-size:14px;color:#555;line-height:1.6;">A clean kanban board — Active, Overdue, Cold Outreach, Inactive. Every contact shows how long it's been since you last touched them. Color-coded so you see at a glance what needs attention.</div>
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-size:14px;font-weight:600;color:#1a1a18;margin-bottom:4px;">📝 Interaction logging</div>
        <div style="font-size:14px;color:#555;line-height:1.6;">Log a note directly on any contact card — what you talked about, what was promised, what the next step is. Every note is timestamped and shows up in that contact's history. Logging a note automatically updates their last check-in date.</div>
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-size:14px;font-weight:600;color:#1a1a18;margin-bottom:4px;">💬 LinkedIn message drafts</div>
        <div style="font-size:14px;color:#555;line-height:1.6;">Open any contact, hit "Draft LinkedIn message" — Claude reads their profile info and your interaction history and writes a warm, personalized outreach message. Under 150 words, ready to copy.</div>
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-size:14px;font-weight:600;color:#1a1a18;margin-bottom:4px;">📬 Weekly Sunday digest</div>
        <div style="font-size:14px;color:#555;line-height:1.6;">Every Sunday morning you get an email briefing: your outreach numbers vs. your goals, who's overdue, who's going quiet, and an AI analysis of your networking patterns across the past 90 days. It surfaces things a week-by-week view misses — unresolved commitments, cooling relationships, sectors you're neglecting.</div>
      </div>

      <div>
        <div style="font-size:14px;font-weight:600;color:#1a1a18;margin-bottom:4px;">⚙️ Personalized to your transition</div>
        <div style="font-size:14px;color:#555;line-height:1.6;">When you first sign in, a quick setup wizard asks about your transition year, target region, target sector, and outreach goals. The digest and priority rankings are calibrated to your specific situation — not a generic sales cadence.</div>
      </div>
    </div>

    <div style="background:#EAF3DE;border-radius:10px;padding:18px 22px;margin-bottom:28px;">
      <div style="font-size:14px;font-weight:600;color:#3B6D11;margin-bottom:8px;">How to get started</div>
      <ol style="font-size:14px;color:#333;line-height:1.8;margin:0;padding-left:20px;">
        <li>Go to <a href="https://usemahan.com" style="color:#0a2342;font-weight:600;">usemahan.com</a></li>
        <li>Sign in with the Google account this email was sent to</li>
        <li>Complete the 5-minute setup wizard</li>
        <li>Add your first contact and start logging</li>
      </ol>
    </div>

    <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 14px 0;">
      Your data is completely private. I can't see your contacts or your notes. Each account is fully isolated. This is your tool, your network, your transition.
    </p>

    <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 24px 0;">
      I'm still building this — if something doesn't work right or you have an idea for how to make it better, reply to this email and tell me. I want this to be genuinely useful.
    </p>

    <p style="font-size:15px;color:#333;line-height:1.7;margin:0;">
      Fair winds,<br>
      <strong>Jack</strong><br>
      <span style="font-size:13px;color:#999;">Military Group Chief, U.S. Embassy Brasília<br>
      Navy Captain (O-6), retiring 2028</span>
    </p>

  </div>

  <div style="background:#0a2342;padding:16px 32px;display:flex;align-items:center;justify-content:space-between;">
    <div style="font-size:12px;color:#8fadc8;">Mahan · usemahan.com</div>
    <a href="https://usemahan.com" style="font-size:12px;font-weight:600;color:#c9a84c;text-decoration:none;">Sign in →</a>
  </div>

</div>
</body>
</html>`;
}
