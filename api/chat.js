// api/chat.js
const { supabaseRO } = require('../lib/db');
// pages/api/chat.ts
import type { NextApiRequest, NextApiResponse } from "next";

const ALLOWED = new Set([
  "https://megaska.com",
  "https://www.megaska.com",
  "https://megaska.myshopify.com",
  "http://localhost:3000",
  "https://megaska-chat.vercel.app",
]);

function pickOrigin(req: NextApiRequest) {
  const o = (req.headers.origin || req.headers.Origin) as string | undefined;
  return o && ALLOWED.has(o) ? o : "https://www.megaska.com";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const origin = pickOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  // Validate body early so we don't stream on bad input
  const { message, sessionId } = (req.body || {}) as { message?: string; sessionId?: string };
  if (!message || !sessionId) {
    res.status(400).json({ error: "Missing message or sessionId" });
    return;
  }

  // Start SSE
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  // Helpful: flush headers immediately
  // @ts-ignore
  res.flushHeaders?.();

  // Send some tokens (dummy stream)
  res.write(`data: ${JSON.stringify({ output_text: "Hi! " })}\n\n`);
  await new Promise(r => setTimeout(r, 200));
  res.write(`data: ${JSON.stringify({ output_text: "How can I help?" })}\n\n`);

  res.end();
}

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
