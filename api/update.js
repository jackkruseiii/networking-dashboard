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
    const { data } = req.body;

    const updates = {
      first_name:    data.fn          || "",
      last_name:     data.ln          || "",
      industry:      data.industry    || "",
      company:       data.company     || "",
      linkedin:      data.linkedin    || "",
      email:         data.email       || "",
      office_phone:  data.officePhone || "",
      mobile_phone:  data.mobilePhone || "",
      relationship:  data.rel         || "",
      city:          data.city        || "",
      state:         data.state       || "",
      undergrad:     data.ug          || "",
      grad_school:   data.grad        || "",
      status:        data.status      || "",
      last_checkin:  data.lc          || null,
      next_checkin:  data.nc          || null,
      notes:         data.notes       || "",
      notes_doc:     data.notesDoc    || "",
      target_region: data.region      || "",
    };

    // Only update is_friend when explicitly sent
    if (data.col1 !== undefined) {
      updates.is_friend = data.col1 === "true";
    }

    const { error } = await supabase
      .from("contacts")
      .update(updates)
      .eq("id", data.id)
      .eq("user_email", email);

    if (error) throw error;

    return res.status(200).json({ success: true, message: "Contact updated" });

  } catch (err) {
    console.error("update error:", err);
    return res.status(500).json({ error: err.message });
  }
}
