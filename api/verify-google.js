import { OAuth2Client } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { credential } = req.body || {};
  if (!credential) {
    return res.status(400).json({ success: false, error: "Missing credential" });
  }

  try {
    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = String(payload.email || "").toLowerCase();

    if (!payload.email_verified) {
      return res.status(401).json({ success: false, error: "Google account email is not verified." });
    }

    // Check invites table
    const { data: invite, error } = await supabase
      .from("invites")
      .select("status")
      .eq("email", email)
      .single();

    if (error || !invite) {
      return res.status(403).json({
        success: false,
        error: "You don't have access to Mahan yet. Request an invite from Jack.",
      });
    }

    if (invite.status !== "approved") {
      return res.status(403).json({
        success: false,
        error: invite.status === "pending"
          ? "Your invite is pending approval. You'll get access soon."
          : "Your access has been revoked. Contact Jack for help.",
      });
    }

    // Mark invite as accepted if first time
    await supabase
      .from("invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("email", email)
      .is("accepted_at", null);

    // Check if user has settings row — create one if not (first login)
    const { data: settings } = await supabase
      .from("user_settings")
      .select("onboarding_complete")
      .eq("user_email", email)
      .single();

    if (!settings) {
      await supabase.from("user_settings").insert({
        user_email: email,
        digest_email: email,
        onboarding_complete: false,
      });
    }

    return res.status(200).json({
      success: true,
      email,
      onboardingComplete: settings?.onboarding_complete ?? false,
    });

  } catch (err) {
    console.error("Google token verification failed:", err);
    return res.status(401).json({ success: false, error: "Invalid or expired sign-in. Please try again." });
  }
}
