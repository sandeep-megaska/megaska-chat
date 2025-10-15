// api/chat.js
const { supabaseRO } = require('../lib/db');

const ALLOWED_ORIGINS = new Set([
  "https://megaska.com",
  "https://www.megaska.com",
  "https://megaska.myshopify.com",
  "http://localhost:3000",
  "https://megaska-chat.vercel.app" // stable Vercel domain (NO trailing slash)
]);

function pickOrigin(req) {
  const o = req.headers.origin || req.headers.Origin;
  return (o && ALLOWED_ORIGINS.has(o)) ? o : "https://www.megaska.com";
}

function setCORS(req, res) {
  const origin = pickOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Vary", "Origin");
}

module.exports = async (req, res) => {
  setCORS(req, res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    const { message, sessionId } = req.body || {};
    if (!message || !sessionId) {
      res.setHeader("Content-Type","text/event-stream; charset=utf-8");
      res.write(`data: ${JSON.stringify({ output_text: "Missing fields" })}\n\n`);
      return res.end(); // IMPORTANT: return
    }

    // ... your RAG + OpenAI streaming code unchanged ...

    res.setHeader("Content-Type","text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control","no-cache, no-transform");
    res.setHeader("Connection","keep-alive");

    // if upstream fails:
    // res.write(`data: ${JSON.stringify({ output_text: "Assistant is busy. WhatsApp +91 9650957372." })}\n\n`);
    // return res.end();

    // str
