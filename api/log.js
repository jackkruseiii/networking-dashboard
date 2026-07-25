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

    const { type, data } = req.body

    if (type === "note") {
      const { error } = await supabase
        .from("interactions")
        .insert({
          user_id: user.id,
          contact_id: data.id,
          note: data.note,
          created_at: data.timestamp || new Date().toISOString()
        })
      if (error) throw error
      return res.status(200).json({ success: true, message: "Note logged" })
    }

    if (type === "new_contact") {
      const { error } = await supabase
        .from("contacts")
        .insert({
          user_id:       user.id,
          first_name:    data.fn        || "",
          last_name:     data.ln        || "",
          industry:      data.industry  || "",
          company:       data.company   || "",
          linkedin:      data.linkedin  || "",
          email:         data.email     || "",
          office_phone:  data.officePhone || "",
          mobile_phone:  data.mobilePhone || "",
          relationship:  data.rel       || "",
          city:          data.city      || "",
          state:         data.state     || "",
          undergrad:     data.ug        || "",
          grad_school:   data.grad      || "",
          status:        data.status    || "Never Contacted",
          last_checkin:  data.lc        || null,
          next_checkin:  data.nc        || null,
          notes:         data.notes     || "",
          notes_doc:     data.notesDoc  || "",
          target_region: data.region    || "",
          is_friend:     data.friend    || false,
        })
      if (error) throw error
      return res.status(200).json({ success: true, message: "Contact added" })
    }

    return res.status(400).json({ error: "Unknown type: " + type })

  } catch (err) {
    console.error("log error:", err)
    return res.status(500).json({ error: err.message })
  }
}
