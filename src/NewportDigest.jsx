import { useState } from "react";

const CATEGORIES = [
  { id: "news",       label: "Local News",      icon: "📰" },
  { id: "politics",   label: "Politics & Gov",  icon: "🏛️" },
  { id: "schools",    label: "Schools",         icon: "🎓" },
  { id: "activities", label: "Activities",      icon: "🎉" },
  { id: "qol",        label: "Quality of Life", icon: "🏡" },
  { id: "military",   label: "Military",        icon: "⚓" },
];

export default function NewportDigest({ onBack }) {
  const [digest,         setDigest]         = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);

  async function generateDigest() {
    setLoading(true);
    setError(null);
    setDigest(null);
    setActiveCategory(null);

    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    try {
      const res = await fetch("/api/newport.mjs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPrompt: `Generate my Newport, RI weekly intelligence digest for the week of ${today}. Search for the latest information across all six categories and return the JSON digest.`,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Unknown error");
      setDigest(data.digest);
      setActiveCategory("news");
    } catch (err) {
      setError("Failed to generate digest: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  const active     = activeCategory && digest ? digest.categories[activeCategory] : null;
  const activeMeta = CATEGORIES.find(c => c.id === activeCategory);

  const s = {
    shell:        { minHeight: "100vh", background: "#fafaf8", fontFamily: "Georgia, serif", paddingBottom: "3rem" },
    header:       { background: "#fff", borderBottom: "0.5px solid #e8e8e4", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
    title:        { fontSize: 19, fontWeight: 700, color: "#1a1a18", letterSpacing: "-.02em" },
    sub:          { fontSize: 12, color: "#999", marginTop: 1 },
    backBtn:      { fontSize: 13, padding: "7px 14px", borderRadius: 8, border: "0.5px solid #e0e0de", background: "transparent", color: "#555", cursor: "pointer" },
    main:         { maxWidth: 720, margin: "0 auto", padding: "40px 24px" },
    genBtn:       { fontSize: 14, fontWeight: 600, padding: "11px 28px", borderRadius: 9, border: "none", background: "#0a2342", color: "#fff", cursor: "pointer" },
    topline:      { borderLeft: "3px solid #0a2342", paddingLeft: 14, marginBottom: 24 },
    toplineLabel: { fontSize: 10, letterSpacing: ".15em", color: "#0a2342", textTransform: "uppercase", marginBottom: 5 },
    toplineText:  { fontSize: 17, color: "#1a1a18", lineHeight: 1.5, fontStyle: "italic" },
    catNav:       { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 },
    panel:        { background: "#fff", border: "0.5px solid #e0e0de", borderRadius: 12, padding: "24px 28px" },
    panelCat:     { fontSize: 10, letterSpacing: ".15em", textTransform: "uppercase", color: "#0a2342", marginBottom: 6 },
    panelHead:    { fontSize: 19, fontWeight: 700, color: "#1a1a18", marginBottom: 16, lineHeight: 1.3 },
    rule:         { height: 1, background: "#f0f0ee", marginBottom: 16 },
    bullet:       { display: "flex", gap: 10, marginBottom: 12, fontSize: 14, color: "#333", lineHeight: 1.6 },
    dash:         { color: "#0a2342", fontWeight: 700, flexShrink: 0 },
    sowhat:       { background: "#f0f4f9", border: "0.5px solid #c8d8ea", borderRadius: 8, padding: "12px 16px", marginTop: 20, display: "flex", gap: 10 },
    sowhatLabel:  { fontSize: 10, letterSpacing: ".15em", textTransform: "uppercase", color: "#0a2342", flexShrink: 0, paddingTop: 2 },
    sowhatText:   { fontSize: 13, color: "#445", lineHeight: 1.5, fontStyle: "italic" },
    footer:       { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "0.5px solid #eee", paddingTop: 16, marginTop: 24 },
    dateStr:      { fontSize: 11, color: "#bbb", letterSpacing: ".05em" },
    regenBtn:     { fontSize: 12, padding: "6px 14px", borderRadius: 7, border: "0.5px solid #ccc", background: "transparent", color: "#555", cursor: "pointer" },
  };

  function catBtnStyle(id) {
    const isActive = activeCategory === id;
    return {
      fontSize: 12, padding: "7px 13px", borderRadius: 7, cursor: "pointer",
      border: isActive ? "none" : "0.5px solid #e0e0de",
      background: isActive ? "#0a2342" : "transparent",
      color: isActive ? "#fff" : "#666",
      fontFamily: "Georgia, serif",
    };
  }

  return (
    <div style={s.shell}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={onBack}>← Dashboard</button>
        <div>
          <div style={s.title}>⚓ Newport Intel Digest</div>
          <div style={s.sub}>Weekly community briefing · Aquidneck Island, RI</div>
        </div>
      </div>

      <div style={s.main}>
        {!digest && !loading && !error && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 15, color: "#999", fontStyle: "italic", maxWidth: 440, margin: "0 auto 28px", lineHeight: 1.7 }}>
              AI-powered weekly briefing on Newport, RI — news, politics, schools, events, quality of life, and military community intel in one digest.
            </div>
            <button style={s.genBtn} onClick={generateDigest}>Generate This Week's Digest</button>
            <div style={{ marginTop: 12, fontSize: 11, color: "#bbb", letterSpacing: ".05em" }}>Live web search · Takes ~20 seconds</div>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⚓</div>
            <div style={{ fontSize: 17, color: "#0a2342", fontWeight: 600, marginBottom: 6 }}>Scanning Newport sources…</div>
            <div style={{ fontSize: 13, color: "#999" }}>Searching news, politics, schools, events, and more</div>
          </div>
        )}

        {error && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#A32D2D" }}>
            <div style={{ marginBottom: 16 }}>{error}</div>
            <button style={s.genBtn} onClick={generateDigest}>Retry</button>
          </div>
        )}

        {digest && (
          <>
            <div style={s.topline}>
              <div style={s.toplineLabel}>This Week's Topline</div>
              <div style={s.toplineText}>{digest.topline}</div>
            </div>

            <div style={s.catNav}>
              {CATEGORIES.map(cat => (
                <button key={cat.id} style={catBtnStyle(cat.id)} onClick={() => setActiveCategory(cat.id)}>
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            {active && (
              <div style={s.panel}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                  <span style={{ fontSize: 26 }}>{activeMeta.icon}</span>
                  <div>
                    <div style={s.panelCat}>{activeMeta.label}</div>
                    <div style={s.panelHead}>{active.headline}</div>
                  </div>
                </div>
                <div style={s.rule} />
                {active.bullets.map((b, i) => (
                  <div key={i} style={s.bullet}>
                    <span style={s.dash}>—</span>
                    <span>{b}</span>
                  </div>
                ))}
                <div style={s.sowhat}>
                  <span style={s.sowhatLabel}>So What?</span>
                  <span style={s.sowhatText}>{active.sowhat}</span>
                </div>
              </div>
            )}

            <div style={s.footer}>
              <span style={s.dateStr}>{digest.date}</span>
              <button style={s.regenBtn} onClick={generateDigest}>↻ Refresh Digest</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
