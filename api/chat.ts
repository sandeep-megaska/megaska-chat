// pages/api/chat.ts

import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();           // no body, no SSE headers
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { message, sessionId } = (req.body || {}) as { message?: string; sessionId?: string };
  if (!message || !sessionId) {
    res.status(400).json({ error: "Missing message or sessionId" });
    return;
  }

  // SSE headers ONLY for POST:
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // @ts-ignore
  res.flushHeaders?.();

  const tick = (t: string) => res.write(`data: ${JSON.stringify({ output_text: t })}\n\n`);
  ["Hello", "!", " How", " can", " I", " assist", " you", " today", "?"].forEach((t, i) =>
    setTimeout(() => tick(t), 80 * i)
  );
  setTimeout(() => res.end(), 900);
}

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

function setCors(req: NextApiRequest, res: NextApiResponse) {
  const origin = pickOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Vary", "Origin");
  return origin;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    // IMPORTANT: return immediately—no SSE headers, no body
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { message, sessionId } = (req.body || {}) as { message?: string; sessionId?: string };
  if (!message || !sessionId) {
    res.status(400).json({ error: "Missing message or sessionId" });
    return;
  }

  // SSE headers ONLY for the POST stream:
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // @ts-ignore
  res.flushHeaders?.();

  // demo stream
  const tick = (t: string) => res.write(`data: ${JSON.stringify({ output_text: t })}\n\n`);
  ["Hello", "!", " How", " can", " I", " assist", " you", " today", "?"].forEach((t, i) =>
    setTimeout(() => tick(t), 80 * i)
  );

  setTimeout(() => res.end(), 900);
}
