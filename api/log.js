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

  try {
    const email = await verifyGoogle(credential);
    const { type, data } = req.body;

    if (type === "note") {
      const timestamp = data.timestamp || new Date().toISOString();

      // Insert the interaction note
      const { error: noteError } = await supabase
        .from("interactions")
        .insert({
          user_email: email,
          contact_id: data.id,
          note:       data.note || "",
          created_at: timestamp,
        });
      if (noteError) throw noteError;

      // Auto-update last_checkin on the contact to match
      const { error: updateError } = await supabase
        .from("contacts")
        .update({ last_checkin: timestamp })
        .eq("id", data.id)
        .eq("user_email", email);
      if (updateError) throw updateError;

      return res.status(200).json({ success: true, message: "Note logged and last check-in updated" });
    }

    if (type === "new_contact") {
      const { error } = await supabase
        .from("contacts")
        .insert({
          user_email:    email,
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
          status:        data.status      || "Never Contacted",
          last_checkin:  data.lc          || null,
          next_checkin:  data.nc          || null,
          notes:         data.notes       || "",
          notes_doc:     data.notesDoc    || "",
          target_region: data.region      || "",
          country:       data.country     || "",
          branch:        data.branch      || "",
          category:      data.category    || "",
          met_context:   data.metContext  || "",
          languages:     data.languages   || "",
          rank_title:    data.rankTitle   || "",
          is_friend:     data.friend      || false,
        });
      if (error) throw error;
      return res.status(200).json({ success: true, message: "Contact added" });
    }

    return res.status(400).json({ error: "Unknown type: " + type });

  } catch (err) {
    console.error("log error:", err);
    return res.status(500).json({ error: err.message });
  }
}
