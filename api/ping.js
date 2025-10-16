// api/ping.js — universal export (works in CJS/ESM)
function handler(req, res) {
  try {
    // Node runtime path
    if (res && typeof res.status === "function") {
      res.status(200).send("ok");
      return;
    }
    // Edge/runtime-agnostic fallback
    return new Response("ok", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  } catch (e) {
    console.error("PING_FATAL:", e);
    if (res && typeof res.status === "function") {
      res.status(500).send("fail");
      return;
    }
    return new Response("fail", { status: 500 });
  }
}
module.exports = handler;
try { exports.default = handler; } catch {}