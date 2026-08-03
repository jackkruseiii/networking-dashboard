// api/backup.js — Daily database backup (Vercel Cron)
// Reads the full contacts + interactions tables from Supabase and emails
// them to you as CSV attachments. A disaster-recovery snapshot.
// Auth: Vercel cron sends Authorization: Bearer <CRON_SECRET> automatically.
// Manual run / backup-now: visit  /api/backup?key=<CRON_SECRET>

import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Convert an array of row objects to a CSV string.
// Every field is quoted and embedded quotes are doubled, so commas,
// quotes, and newlines inside notes are all handled safely.
function toCSV(rows) {
  if (!rows || rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '""';
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\r\n");
  return header + "\r\n" + body + "\r\n";
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // ── Auth gate (same CRON_SECRET as the other crons) ───────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: "CRON_SECRET is not configured. Set it in Vercel env vars." });
  }
  const headerAuth = (req.headers.authorization || "").replace("Bearer ", "");
  const queryKey = (req.query && req.query.key) || "";
  if (headerAuth !== cronSecret && queryKey !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const GMAIL_FROM = process.env.GMAIL_FROM;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
  const BACKUP_TO = process.env.GMAIL_TO || GMAIL_FROM;
  if (!GMAIL_FROM || !GMAIL_APP_PASSWORD) {
    return res.status(500).json({ error: "Missing env: GMAIL_FROM / GMAIL_APP_PASSWORD" });
  }

  try {
    // Full-table reads — no user filter; this is a whole-database snapshot.
    const { data: contacts, error: ce } = await supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: true });
    if (ce) throw ce;

    const { data: interactions, error: ie } = await supabase
      .from("interactions")
      .select("*")
      .order("created_at", { ascending: true });
    if (ie) throw ie;

    const contactsCSV = toCSV(contacts || []);
    const interactionsCSV = toCSV(interactions || []);
    const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_FROM, pass: GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `"Mahan · Backup" <${GMAIL_FROM}>`,
      to: BACKUP_TO,
      subject: `🗄️ Mahan backup — ${stamp} (${(contacts || []).length} contacts, ${(interactions || []).length} interactions)`,
      text:
        `Automated Mahan database backup.\n\n` +
        `Date:         ${stamp}\n` +
        `Contacts:     ${(contacts || []).length}\n` +
        `Interactions: ${(interactions || []).length}\n\n` +
        `Two CSV files are attached — each email is a full snapshot of the database.\n` +
        `To restore: import the CSVs back into the matching Supabase tables\n` +
        `(Table Editor > Insert > Import data from CSV). Keep these emails, or set up\n` +
        `a Gmail filter to file them into a "Mahan Backups" label automatically.`,
      attachments: [
        { filename: `mahan-contacts-${stamp}.csv`, content: contactsCSV, contentType: "text/csv" },
        { filename: `mahan-interactions-${stamp}.csv`, content: interactionsCSV, contentType: "text/csv" },
      ],
    });

    return res.status(200).json({
      success: true,
      date: stamp,
      contacts: (contacts || []).length,
      interactions: (interactions || []).length,
      sentTo: BACKUP_TO,
    });
  } catch (err) {
    console.error("Backup error:", err);
    return res.status(500).json({ error: err.message });
  }
}
