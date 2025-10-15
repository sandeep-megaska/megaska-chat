const ALLOWED = new Set([
  "https://megaska.com",
  "https://www.megaska.com",
  "https://megaska.myshopify.com",
  "http://localhost:3000",
  "https://megaska-chat.vercel.app",
]);

function pickOrigin(req: any) {
  const o = req.headers.origin || req.headers.Origin;
  return o && ALLOWED.has(o) ? o : "https://www.megaska.com";
}

export default async function handler(req: any, res: any) {
  const origin = pickOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");                // <-- add this
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");        // GET is harmless to include
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Vary", "Origin");                                          // <-- add this

  if (req.method === "OPTIONS") {                                           // preflight
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  // Validate body
  const { message, sessionId } = req.body || {};
  if (!message || !sessionId) {
    res.status(400).json({ error: "Missing message or sessionId" });
    return;
  }

  // SSE headers for the streaming response:
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // @ts-ignore
  res.flushHeaders?.();

  // stream some test tokens to prove plumbing works
  res.write(`data: ${JSON.stringify({ output_text: "Hi! " })}\n\n`);
  await new Promise(r => setTimeout(r, 150));
  res.write(`data: ${JSON.stringify({ output_text: "How can I help?" })}\n\n`);
  res.end();
}
