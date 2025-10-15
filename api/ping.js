module.exports = (req, res) => {
  const origin = req.headers.origin || req.headers.Origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.status(200).json({ ok: true, ts: Date.now() });
};
