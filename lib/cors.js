const ALLOWED = new Set<string>([
  "https://megaska.com",
  "https://www.megaska.com",
  "https://megaska.myshopify.com",
  "http://localhost:3000",
  "https://megaska-chat.vercel.app",
]);

export function pickOrigin(req: any) {
  const o = (req.headers.origin || req.headers.Origin) as string | undefined;
  return o && ALLOWED.has(o) ? o : "https://www.megaska.com";
}

export function setCors(req: any, res: any) {
  const origin = pickOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Vary", "Origin");
  return origin;
}
