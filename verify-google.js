import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ success: false, error: "GOOGLE_CLIENT_ID is not set on the server" });
  }

  const { credential } = req.body || {};
  if (!credential) {
    return res.status(400).json({ success: false, error: "Missing credential" });
  }

  // Comma-separated allowlist, e.g. "jack@gmail.com,jack@work.com"
  // If left empty, ANY verified Google account can sign in — set this in production.
  const allowedEmails = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = String(payload.email || "").toLowerCase();

    if (!payload.email_verified) {
      return res.status(401).json({ success: false, error: "Google account email is not verified." });
    }

    if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
      return res.status(403).json({ success: false, error: "This Google account isn't authorized for this app." });
    }

    return res.status(200).json({ success: true, email });
  } catch (err) {
    console.error("Google token verification failed:", err);
    return res.status(401).json({ success: false, error: "Invalid or expired sign-in. Please try again." });
  }
}
