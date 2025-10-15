// /lib/cors.js
const ALLOWED = new Set([
  "https://megaska.com",
  "https://www.megaska.com",
  "https://megaska.myshopify.com",
  "http://localhost:3000",
  "https://megaska-chat.vercel.app",
]);

function pickOrigin(req) {
  const o = req.headers.origin || req.headers.Origin;
  return o && ALLOWED.has(o) ? o : "https://www.megaska.com";
}

function setCors(req, res) {
  const origin = pickOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Vary", "Origin");
  return origin;
}

module.exports = { setCors, pickOrigin };
