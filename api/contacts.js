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
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const credential = (req.headers.authorization || "").replace("Bearer ", "");
  if (!credential) return res.status(401).json({ error: "No credential" });

  try {
    const email = await verifyGoogle(credential);

    const { data: contacts, error: ce } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_email", email)
      .order("updated_at", { ascending: false });
    if (ce) throw ce;

    const { data: interactions, error: ie } = await supabase
      .from("interactions")
      .select("*")
      .eq("user_email", email)
      .order("created_at", { ascending: false });
    if (ie) throw ie;

    return res.status(200).json({ success: true, contacts, interactions });
  } catch (err) {
    console.error("contacts error:", err);
    return res.status(500).json({ error: err.message });
  }
}
