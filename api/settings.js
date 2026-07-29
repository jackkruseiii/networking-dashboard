import { OAuth2Client } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const credential = (req.headers.authorization || "").replace("Bearer ", "");
  if (!credential) return res.status(401).json({ error: "No credential" });

  try {
    const email = await verifyGoogle(credential);

    // GET — fetch user settings
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_email", email)
        .single();
      if (error) throw error;
      return res.status(200).json({ success: true, settings: data });
    }

    // POST — update user settings
    if (req.method === "POST") {
      const updates = req.body;

      // Whitelist allowed fields
      const allowed = [
        "display_name", "digest_email", "transition_year",
        "priority_region", "priority_sector", "secondary_sectors",
        "region_target_count", "sector_target_count",
        "weekly_outreach_target", "monthly_new_contact_target",
        "overdue_days", "stale_soon_days",
        "cold_max_age_days", "cold_backlog_ceiling",
        "digest_enabled", "onboarding_complete",
      ];

      const filtered = Object.fromEntries(
        Object.entries(updates).filter(([k]) => allowed.includes(k))
      );

      if (Object.keys(filtered).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const { error } = await supabase
        .from("user_settings")
        .update(filtered)
        .eq("user_email", email);

      if (error) throw error;
      return res.status(200).json({ success: true, message: "Settings updated" });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (err) {
    console.error("settings error:", err);
    return res.status(500).json({ error: err.message });
  }
}
