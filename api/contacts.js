import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })

  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: "No authorization header" })

  try {
    // Verify the user's JWT from Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    )
    if (authError || !user) return res.status(401).json({ error: "Unauthorized" })

    // Fetch contacts for this user only
    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })

    if (contactsError) throw contactsError

    // Fetch interactions for this user only
    const { data: interactions, error: intError } = await supabase
      .from("interactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (intError) throw intError

    return res.status(200).json({ success: true, contacts, interactions })

  } catch (err) {
    console.error("contacts error:", err)
    return res.status(500).json({ error: err.message })
  }
}
