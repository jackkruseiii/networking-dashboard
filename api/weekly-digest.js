// api/weekly-digest.js
// Cron job: runs every Sunday at 11:00 UTC (8:00am Brasilia BRT)
// Reads contacts + interactions from Google Sheet, generates AI action items,
// sends a summary email via Gmail SMTP.

import nodemailer from "nodemailer";

export default async function handler(req, res) {
  // Allow manual trigger via GET for testing, cron uses GET too
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    APPS_SCRIPT_URL,
    ANTHROPIC_API_KEY,
    GMAIL_FROM,
    GMAIL_APP_PASSWORD,
    GMAIL_TO,
  } = process.env;

  if (!APPS_SCRIPT_URL || !ANTHROPIC_API_KEY || !GMAIL_FROM || !GMAIL_APP_PASSWORD || !GMAIL_TO) {
    return res.status(500).json({ error: "Missing required environment variables" });
  }

  try {
    // ── 1. Fetch contacts and interactions from Google Sheet ──────────────
    const sheetRes = await fetch(APPS_SCRIPT_URL, { redirect: "follow" });
    const sheetData = await sheetRes.json();

    if (!sheetData.success) {
      throw new Error("Failed to fetch sheet data: " + JSON.stringify(sheetData));
    }

    const contacts = (sheetData.contacts || []).map(row => ({
      id:       String(row["ID"]                   || "").trim(),
      fn:       String(row["First name"]           || "").trim(),
      ln:       String(row["Last Name"]            || "").trim(),
      industry: String(row["Industry"]             || "").trim(),
      company:  String(row["Company"]              || "").trim(),
      status:   String(row["Status"]               || "").trim(),
      lc:       String(row["Last Check-in Date"]   || "").trim(),
      nc:       String(row["Next Check-in Date"]   || "").trim(),
      notes:    String(row["Notes"]                || "").trim(),
      rel:      String(row["Relationship"]         || "").trim(),
    })).filter(c => c.fn || c.ln);

    const interactions = (sheetData.interactions || []).map(row => ({
      id:        String(row["Contact ID"] || "").trim(),
      timestamp: String(row["Timestamp"]  || "").trim(),
      firstName: String(row["First Name"] || "").trim(),
      lastName:  String(row["Last Name"]  || "").trim(),
      note:      String(row["Note"]       || "").trim(),
    }));

    // ── 2. Identify overdue contacts ──────────────────────────────────────
    const TODAY = new Date();
    const THRESHOLD = 90;

    function pd(s) { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d; }
    function ds(d) { return Math.floor((TODAY - d) / 86400000); }
    function fd(d) { return d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }); }

    const overdue = contacts
      .filter(c => c.status === "Active")
      .filter(c => { const d = pd(c.lc); return d && ds(d) >= THRESHOLD; })
      .sort((a, b) => new Date(a.lc) - new Date(b.lc))
      .map(c => {
        const d = pd(c.lc);
        const lastInteraction = interactions
          .filter(i => i.id === c.id)
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        return {
          ...c,
          daysOverdue: ds(d),
          lastContactDate: fd(d),
          lastNote: lastInteraction?.note || c.notes || "",
        };
      });

    // ── 3. Interactions from last 7 days ──────────────────────────────────
    const sevenDaysAgo = new Date(TODAY.getTime() - 7 * 24 * 60 * 60 * 1000);

    // ── 2b. Contacts auto-moved to Inactive this week ────────────────────
    const newlyInactive = contacts.filter(c => {
      if (c.status !== "Inactive") return false;
      const autoNote = interactions.find(i =>
        i.id === c.id &&
        i.note.includes("Auto-moved to Inactive") &&
        pd(i.timestamp) >= sevenDaysAgo
      );
      return !!autoNote;
    });

    const recentInteractions = interactions
      .filter(i => { const d = pd(i.timestamp); return d && d >= sevenDaysAgo; })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map(i => {
        const contact = contacts.find(c => c.id === i.id) ||
          { fn: i.firstName, ln: i.lastName, company: "", industry: "" };
        const d = pd(i.timestamp);
        return {
          ...i,
          contactName: `${contact.fn} ${contact.ln}`.trim(),
          company: contact.company,
          industry: contact.industry,
          formattedDate: d ? fd(d) : "",
        };
      });

    // ── 4. Generate AI action items via Claude ────────────────────────────
    const overdueText = overdue.length === 0
      ? "No overdue contacts this week."
      : overdue.map(c =>
          `- ${c.fn} ${c.ln} (${c.company}, ${c.industry}) — ${c.daysOverdue} days overdue. Last contact: ${c.lastContactDate}. Note: "${c.lastNote}"`
        ).join("\n");

    const interactionsText = recentInteractions.length === 0
      ? "No interactions logged this week."
      : recentInteractions.map(i =>
          `- ${i.formattedDate}: ${i.contactName} (${i.company}) — "${i.note}"`
        ).join("\n");

    const newlyInactiveText = newlyInactive.length === 0
      ? "None this week."
      : newlyInactive.map(c => `- ${c.fn} ${c.ln} (${c.company}) — auto-moved to Inactive after 180+ days`).join("\n");

    const aiPrompt = `You are reviewing the weekly networking activity for Jack Kruse, a Navy FAO and Military Group Chief at the U.S. Embassy Brazil, transitioning out of the military in 2028-2029. His primary focus is the education sector.

OVERDUE CONTACTS (Active, 90+ days since last contact):
${overdueText}

CONTACTS AUTO-MOVED TO INACTIVE THIS WEEK (180+ days, no contact):
${newlyInactiveText}

INTERACTIONS THIS WEEK:
${interactionsText}

Based on this information, identify 3-5 specific, actionable follow-up items Jack should prioritize this week. Be specific — reference actual names and context from the notes. Flag any mentions of promised follow-ups, introductions, or next steps that haven't happened yet. Prioritize education sector contacts given Jack's transition focus.

Format as a numbered list. Each item should be 1-2 sentences max. Be direct and practical.`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: aiPrompt }],
      }),
    });

    const aiData = await aiRes.json();
    const actionItems = aiData.content?.[0]?.text?.trim() || "No action items generated.";

    // ── 5. Build HTML email ───────────────────────────────────────────────
    const dateStr = TODAY.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });

    function overdueRowsHTML() {
      if (overdue.length === 0) return `<tr><td colspan="4" style="padding:12px;color:#999;font-style:italic;font-size:14px;">No overdue contacts — great work!</td></tr>`;
      return overdue.map(c => `
        <tr style="border-bottom:1px solid #f0f0ec;">
          <td style="padding:10px 12px;font-size:14px;font-weight:600;color:#1a1a18;">${c.fn} ${c.ln}</td>
          <td style="padding:10px 12px;font-size:13px;color:#555;">${c.company || "—"}</td>
          <td style="padding:10px 12px;font-size:13px;">
            <span style="background:#FAEEDA;color:#854F0B;padding:3px 8px;border-radius:5px;font-weight:600;">${c.daysOverdue}d overdue</span>
          </td>
          <td style="padding:10px 12px;font-size:12px;color:#777;max-width:200px;">${c.lastNote ? c.lastNote.slice(0, 80) + (c.lastNote.length > 80 ? "…" : "") : "—"}</td>
        </tr>`).join("");
    }

    function interactionRowsHTML() {
      if (recentInteractions.length === 0) return `<p style="color:#999;font-style:italic;font-size:14px;padding:12px 0;">No interactions logged this week.</p>`;
      return recentInteractions.map(i => `
        <div style="padding:12px;background:#f9f9f7;border-radius:8px;margin-bottom:10px;border-left:3px solid #e0e0de;">
          <div style="font-size:12px;color:#999;margin-bottom:4px;">${i.formattedDate} · <strong style="color:#555;">${i.contactName}</strong>${i.company ? ` · ${i.company}` : ""}</div>
          <div style="font-size:14px;color:#333;line-height:1.5;">${i.note}</div>
        </div>`).join("");
    }

    function actionItemsHTML() {
      const lines = actionItems.split("\n").filter(l => l.trim());
      return lines.map(line => {
        const clean = line.replace(/^\d+\.\s*/, "").trim();
        const num = line.match(/^(\d+)\./)?.[1] || "•";
        return `
          <div style="display:flex;gap:12px;margin-bottom:14px;">
            <div style="width:24px;height:24px;border-radius:50%;background:#0a2342;color:#fff;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">${num}</div>
            <div style="font-size:14px;color:#333;line-height:1.6;">${clean}</div>
          </div>`;
      }).join("");
    }

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Georgia,serif;background:#f4f4f0;margin:0;padding:20px;">
<div style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0e0da;">

  <!-- Header -->
  <div style="background:#0a2342;padding:24px 28px;">
    <div style="font-size:11px;color:#c9a84c;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px;">Weekly Networking Digest</div>
    <div style="font-size:24px;font-weight:700;color:#fff;margin-bottom:4px;">Sunday Briefing</div>
    <div style="font-size:13px;color:#8fadc8;">${dateStr}</div>
  </div>

  <!-- Summary bar -->
  <div style="background:#f9f9f7;border-bottom:1px solid #e8e8e4;padding:14px 28px;display:flex;gap:24px;">
    <div style="text-align:center;">
      <div style="font-size:24px;font-weight:700;color:#854F0B;">${overdue.length}</div>
      <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.05em;">Overdue</div>
    </div>
    <div style="text-align:center;">
      <div style="font-size:24px;font-weight:700;color:#3B6D11;">${recentInteractions.length}</div>
      <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.05em;">This week</div>
    </div>
    <div style="text-align:center;">
      <div style="font-size:24px;font-weight:700;color:#0a2342;">${contacts.filter(c=>c.status==="Active").length}</div>
      <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.05em;">Active</div>
    </div>
    <div style="text-align:center;">
      <div style="font-size:24px;font-weight:700;color:#555;">${contacts.filter(c=>c.status==="Never Contacted").length}</div>
      <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.05em;">Cold</div>
    </div>
  </div>

  <div style="padding:24px 28px;">

    <!-- Action items -->
    <div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:600;color:#c9a84c;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">AI Suggested Actions</div>
      <div style="font-size:18px;font-weight:600;color:#1a1a18;margin-bottom:16px;">This week's priorities</div>
      <div style="background:#f9f9f7;border-radius:10px;padding:16px 18px;">
        ${actionItemsHTML()}
      </div>
    </div>

    <!-- Overdue contacts -->
    <div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:600;color:#854F0B;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Needs Attention</div>
      <div style="font-size:18px;font-weight:600;color:#1a1a18;margin-bottom:16px;">Overdue contacts (${overdue.length})</div>
      <table style="width:100%;border-collapse:collapse;background:#fafaf8;border-radius:10px;overflow:hidden;border:1px solid #e8e8e4;">
        <thead>
          <tr style="background:#f5f5f3;border-bottom:1px solid #e0e0da;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Name</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Company</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Status</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:.05em;font-weight:600;">Last note</th>
          </tr>
        </thead>
        <tbody>
          ${overdueRowsHTML()}
        </tbody>
      </table>
    </div>

    ${newlyInactive.length > 0 ? `
    <!-- Newly inactive -->
    <div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:600;color:#777;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Auto-Moved This Week</div>
      <div style="font-size:18px;font-weight:600;color:#1a1a18;margin-bottom:16px;">Moved to Inactive (${newlyInactive.length})</div>
      <div style="background:#f9f9f7;border-radius:10px;padding:14px 16px;border:1px solid #e0e0da;">
        ${newlyInactive.map(c => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0ec;">
            <div style="width:28px;height:28px;border-radius:50%;background:#F0F0EE;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#777;flex-shrink:0;">${(c.fn[0]||"") + (c.ln[0]||"")}</div>
            <div style="flex:1;font-size:14px;color:#333;">${c.fn} ${c.ln} <span style="color:#999;font-size:12px;">· ${c.company || "—"}</span></div>
            <div style="font-size:11px;padding:2px 8px;border-radius:5px;background:#F0F0EE;color:#777;">💤 Inactive</div>
          </div>`).join("")}
      </div>
    </div>` : ""}

    <!-- Recent interactions -->
    <div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:600;color:#3B6D11;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">This Week</div>
      <div style="font-size:18px;font-weight:600;color:#1a1a18;margin-bottom:16px;">Interactions logged (${recentInteractions.length})</div>
      ${interactionRowsHTML()}
    </div>

  </div>

  <!-- Footer -->
  <div style="background:#0a2342;padding:16px 28px;text-align:center;">
    <div style="font-size:12px;color:#8fadc8;">Networking Dashboard · Weekly Digest</div>
    <div style="font-size:11px;color:#4a6a8a;margin-top:4px;">Sent every Sunday at 8:00am Brasilia time</div>
  </div>

</div>
</body>
</html>`;

    // ── 6. Send via Gmail SMTP ────────────────────────────────────────────
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: GMAIL_FROM,
        pass: GMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: `"Networking Dashboard" <${GMAIL_FROM}>`,
      to: GMAIL_TO,
      subject: `📋 Weekly Networking Digest — ${overdue.length} overdue, ${recentInteractions.length} interactions this week`,
      html,
    });

    return res.status(200).json({
      success: true,
      overdue: overdue.length,
      interactions: recentInteractions.length,
      message: `Digest sent to ${GMAIL_TO}`,
    });

  } catch (err) {
    console.error("Weekly digest error:", err);
    return res.status(500).json({ error: err.message });
  }
}
