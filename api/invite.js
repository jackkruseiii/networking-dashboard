// api/invite.js
// Sends an invite from the in-app admin panel.
// Auth: the caller must be signed in with Google AND be on the ADMIN_EMAILS list.
// POST { email, version:"personal"|"professional" }.
// Creates/approves the invites row AND emails the welcome — one step.

import nodemailer from "nodemailer";
import { OAuth2Client } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Who is allowed to send invites. Comma-separated env override, else this default.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "jackkruseiii@gmail.com")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

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

  // Admin auth — must be a valid Google sign-in on the ADMIN_EMAILS list
  const credential = (req.headers.authorization || "").replace("Bearer ", "");
  if (!credential) return res.status(401).json({ error: "No credential" });

  let callerEmail;
  try {
    callerEmail = await verifyGoogle(credential);
  } catch {
    return res.status(401).json({ error: "Invalid or expired sign-in" });
  }
  if (!ADMIN_EMAILS.includes(callerEmail)) {
    return res.status(403).json({ error: "Not authorized to send invites" });
  }

  const { email, version } = req.body || {};
  if (!email) return res.status(400).json({ error: "Missing email" });
  const target = String(email).trim().toLowerCase();
  const v = (version === "professional" || version === "pro") ? "professional" : "personal";

  try {
    // Create or approve the invite row — no separate Supabase step needed.
    const { data: existing } = await supabase
      .from("invites")
      .select("email")
      .eq("email", target)
      .maybeSingle();

    if (existing) {
      const { error: upErr } = await supabase
        .from("invites")
        .update({ status: "approved", invited_by: callerEmail })
        .eq("email", target);
      if (upErr) throw upErr;
    } else {
      const { error: insErr } = await supabase
        .from("invites")
        .insert({ email: target, invited_by: callerEmail, status: "approved" });
      if (insErr) throw insErr;
    }

    // Send the welcome email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_FROM, pass: process.env.GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `"Jack Kruse" <${process.env.GMAIL_FROM}>`,
      to: target,
      subject: "You're invited to Mahan — my military transition networking tool",
      html: buildInviteEmail(target, v),
    });

    return res.status(200).json({ success: true, message: `Invite (${v}) sent to ${target}. Access granted.` });

  } catch (err) {
    console.error("Invite error:", err);
    return res.status(500).json({ error: err.message });
  }
}

function buildInviteEmail(recipientEmail, version = "personal") {
  // The only paragraph that differs between the two versions:
  const mahanStory = version === "professional"
    ? `I named it <strong>Mahan</strong> — yes, <em>that</em> Mahan — the naval officer who stepped off the quarterdeck, started writing, and became the most influential strategic thinker of his era. He's the original military-to-civilian transition story.`
    : `I named it <strong>Mahan</strong> — yes, <em>that</em> Mahan — the naval officer who stepped off the quarterdeck, started writing, and became the most influential strategic thinker of his era. He's the original military-to-civilian transition story. Plus he had horrible seamanship with numerous mishaps throughout his career and somehow still made Captain. If you've seen me on a sailboat, you'd know this name just felt right.`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Georgia,serif;background:#f4f4f0;margin:0;padding:20px;">
<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0e0da;">

  <div style="background:#0a2342;padding:28px 32px;">
    <div style="font-size:11px;color:#c9a84c;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;">Personal invitation</div>
    <div style="font-size:26px;font-weight:700;color:#fff;">You're in.</div>
  </div>

  <div style="padding:28px 32px;">

    <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 18px 0;">
      As I started thinking about my transition, everyone told me NETWORK, NETWORK, NETWORK — and I realized I had no way to track all those conversations. So I built a tool to do just that, and I want you to have it.
    </p>

    <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 18px 0;">
      Keeping a professional network straight — who you've talked to, what was said, who's owed a follow-up, and which relationships are quietly going cold — is genuinely hard. And there's no good tool for it that actually understands what a military transition looks like.
    </p>

    <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 24px 0;">
      ${mahanStory}
    </p>

    <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 24px 0;">
      I'm sharing it with a small group of people I trust. You're one of them. Here's what you're getting:
    </p>

    <div style="background:#f9f9f7;border-radius:10px;padding:20px 24px;margin-bottom:24px;border-left:3px solid #0a2342;">
      <div style="font-size:11px;font-weight:600;color:#0a2342;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;">What Mahan does</div>

      <div style="margin-bottom:14px;">
        <div style="font-size:14px;font-weight:600;color:#1a1a18;margin-bottom:4px;">📋 Contact tracking</div>
        <div style="font-size:14px;color:#555;line-height:1.6;">A clean kanban board — Active, Overdue, Cold Outreach, Inactive — color-coded so you see what needs attention at a glance.</div>
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-size:14px;font-weight:600;color:#1a1a18;margin-bottom:4px;">📝 Interaction logging</div>
        <div style="font-size:14px;color:#555;line-height:1.6;">Log a note on any contact: what you discussed, what was promised, the next step. Every note is timestamped and auto-updates their last check-in.</div>
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-size:14px;font-weight:600;color:#1a1a18;margin-bottom:4px;">💬 LinkedIn message drafts</div>
        <div style="font-size:14px;color:#555;line-height:1.6;">Claude reads the contact's info and your interaction history and writes a warm, personalized outreach message, ready to copy.</div>
      </div>

      <div style="margin-bottom:14px;">
        <div style="font-size:14px;font-weight:600;color:#1a1a18;margin-bottom:4px;">📬 Weekly Sunday digest</div>
        <div style="font-size:14px;color:#555;line-height:1.6;">An email briefing: your numbers vs. your goals, who's overdue, who's going quiet, and an AI read on your networking patterns.</div>
      </div>

      <div>
        <div style="font-size:14px;font-weight:600;color:#1a1a18;margin-bottom:4px;">⚙️ Personalized to your transition</div>
        <div style="font-size:14px;color:#555;line-height:1.6;">A quick setup asks your transition year, target region, target sector, and goals, then calibrates everything to you.</div>
      </div>
    </div>

    <div style="background:#EAF3DE;border-radius:10px;padding:18px 22px;margin-bottom:24px;">
      <div style="font-size:14px;font-weight:600;color:#3B6D11;margin-bottom:8px;">How to get started</div>
      <ol style="font-size:14px;color:#333;line-height:1.8;margin:0;padding-left:20px;">
        <li>Go to <a href="https://usemahan.com" style="color:#0a2342;font-weight:600;">usemahan.com</a></li>
        <li>Sign in with the Google account this email was sent to</li>
        <li>Complete the 5-minute setup wizard</li>
        <li>Add your first contact and start logging</li>
      </ol>
    </div>

    <div style="background:#eef3f9;border-radius:10px;padding:18px 22px;margin-bottom:28px;">
      <div style="font-size:14px;font-weight:600;color:#0a2342;margin-bottom:8px;">📱 Put it on your phone</div>
      <div style="font-size:14px;color:#333;line-height:1.7;margin-bottom:10px;">Mahan installs like a real app — no App Store, no download.</div>
      <div style="font-size:14px;color:#333;line-height:1.7;margin-bottom:8px;"><strong>iPhone:</strong> open <a href="https://usemahan.com" style="color:#0a2342;font-weight:600;">usemahan.com</a> in Safari, tap the Share button (the square with an up arrow), scroll down, and tap <strong>Add to Home Screen</strong>.</div>
      <div style="font-size:14px;color:#333;line-height:1.7;margin-bottom:10px;"><strong>Android:</strong> open <a href="https://usemahan.com" style="color:#0a2342;font-weight:600;">usemahan.com</a> in Chrome, tap the <strong>⋮</strong> menu (top right), and tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>).</div>
      <div style="font-size:14px;color:#555;line-height:1.6;">You'll get a Mahan icon on your home screen that opens full-screen, just like a native app.</div>
    </div>

    <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 14px 0;">
      Your data is completely private. I can't see your contacts or your notes. Each account is fully isolated — your network, your notes, your transition.
    </p>

    <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 24px 0;">
      I'm still building this, so if something's broken or you've got an idea to make it better, just reply and tell me. I want it to be genuinely useful.
    </p>

    <p style="font-size:15px;color:#333;line-height:1.7;margin:0;">
      Full Speed Ahead,<br>
      <strong>Jack</strong>
    </p>

  </div>

  <div style="background:#0a2342;padding:16px 32px;">
    <div style="font-size:12px;color:#8fadc8;">Mahan · usemahan.com</div>
  </div>

</div>
</body>
</html>`;
}
