import type { NextApiRequest, NextApiResponse } from "next";
import { setCors } from "../../../lib/cors";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCors(req, res);

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method Not Allowed" }); return; }

  const { message, sessionId } = (req.body || {}) as { message?: string; sessionId?: string };
  if (!message || !sessionId) { res.status(400).json({ error: "Missing message or sessionId" }); return; }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // @ts-ignore
  res.flushHeaders?.();

  const send = (t: string) => res.write(`data: ${JSON.stringify({ output_text: t })}\n\n`);
  const parts = ["Hello","!"," How"," can"," I"," assist"," you"," today","?"];
  for (const p of parts) { send(p); await sleep(80); }
  res.end();
}
