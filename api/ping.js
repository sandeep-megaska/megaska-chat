// /api/ping.js  (CommonJS)
module.exports = (req, res) => {
  const origin = req.headers.origin || "https://megaska.com";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  res.status(200).json({ ok: true, ts: Date.now() });
};