// GET /api/fetchdebug?url=https://megaska.com/pages/size-guide
module.exports = async (req, res) => {
  try {
    const u = (req.query.url || "").toString();
    if (!u) return res.status(400).json({ ok: false, error: "Missing ?url=" });
    const t0 = Date.now();
    const r = await fetch(u, { headers: { "User-Agent": "megaska-ingest" } });
    const html = await r.text();
    const t1 = Date.now();
    const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || "").trim();
    return res.json({
      ok: true,
      status: r.status,
      took_ms: t1 - t0,
      bytes: html.length,
      title: title.slice(0,120),
      snippet: html.slice(0, 400).replace(/\s+/g, " ")
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
};
