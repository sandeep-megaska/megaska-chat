
export default function handler(req: any, res: any) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  res.status(200).json({ ok: true, ts: Date.now() });
}


const ALLOWED = new Set([
  "https://megaska.com",
  "https://www.megaska.com",
  "https://megaska.myshopify.com",
  "http://localhost:3000",
  "https://megaska-chat.vercel.app"
]);

function pickOrigin(req: any) {
  const o = req.headers.origin || req.headers.Origin;
  return o && ALLOWED.has(o) ? o : "https://www.megaska.com";
}

export default function handler(req: any, res: any) {
  const origin = pickOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  res.status(200).json({ ok: true, ts: Date.now() });
}
