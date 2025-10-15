const ALLOWED = new Set([
  "https://megaska.com",
  "https://www.megaska.com",
  "https://megaska.myshopify.com",
  "http://localhost:3000",
  "https://megaska-chat.vercel.app"
]);

function pickOrigin(req: Request) {
  const o = req.headers.get("origin");
  return o && ALLOWED.has(o) ? o : "https://www.megaska.com";
}

export async function OPTIONS(req: Request) {
  const origin = pickOrigin(req);
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "content-type, authorization",
      "Vary": "Origin"
    }
  });
}

export async function GET(req: Request) {
  const origin = pickOrigin(req);
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin"
    }
  });
}
