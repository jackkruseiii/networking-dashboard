import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: "No authorization header" })

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    )
    if (authError || !user) return res.status(401).json({ error: "Unauthorized" })

    const { data } = req.body

    // Build update object — only include fields that were sent
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
    }

    // Only update is_friend when explicitly sent
    if (data.col1 !== undefined) {
      updates.is_friend = data.col1 === "true"
    }

    const { error } = await supabase
      .from("contacts")
      .update(updates)
      .eq("id", data.id)
      .eq("user_id", user.id) // security — can only update own contacts

    if (error) throw error

    return res.status(200).json({ success: true, message: "Contact updated" })

  } catch (err) {
    console.error("update error:", err)
    return res.status(500).json({ error: err.message })
  }
}
