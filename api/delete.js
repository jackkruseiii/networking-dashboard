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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const credential = (req.headers.authorization || "").replace("Bearer ", "");
  if (!credential) return res.status(401).json({ error: "No credential" });

  try {
    const email = await verifyGoogle(credential);
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "No contact ID provided" });

    // Delete interactions first (foreign key constraint)
    const { error: intError } = await supabase
      .from("interactions")
      .delete()
      .eq("contact_id", id)
      .eq("user_email", email);
    if (intError) throw intError;

    // Then delete the contact
    const { error: contactError } = await supabase
      .from("contacts")
      .delete()
      .eq("id", id)
      .eq("user_email", email);
    if (contactError) throw contactError;

    return res.status(200).json({ success: true, message: "Contact deleted" });

  } catch (err) {
    console.error("delete error:", err);
    return res.status(500).json({ error: err.message });
  }
}
