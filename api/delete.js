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

    const { id } = req.body
    if (!id) return res.status(400).json({ error: "No contact ID provided" })

    // Delete interactions first (foreign key constraint)
    const { error: intError } = await supabase
      .from("interactions")
      .delete()
      .eq("contact_id", id)
      .eq("user_id", user.id)

    if (intError) throw intError

    // Then delete the contact
    const { error: contactError } = await supabase
      .from("contacts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id) // security — can only delete own contacts

    if (contactError) throw contactError

    return res.status(200).json({ success: true, message: "Contact deleted" })

  } catch (err) {
    console.error("delete error:", err)
    return res.status(500).json({ error: err.message })
  }
}
