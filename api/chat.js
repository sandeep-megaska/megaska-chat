// api/chat.js
const { supabaseRO } = require('../lib/db');

// CORS allow only your store
const ALLOWED_ORIGIN = const ALLOWED_ORIGINS = new Set([
  "https://megaska.com",
  "https://www.megaska.com",
  "https://megaska.myshopify.com",
  
  "http://localhost:3000",
  "https://megaska-chat-1m8sm48km-sandeep-megaskas-projects.vercel.app/"
]);

function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
}
// --- Canonical Megaska links (edit to match your site) ---
const CANONICAL = {
  home:       "https://megaska.com/",
  about:      "https://megaska.com/pages/about-us",
  refund:     "https://megaska.com/pages/returns-and-exchange-policy",
  shipping:   "https://megaska.com/pages/shipping-policy",
  privacy:    "https://megaska.com/pages/privacy-policy",
  terms:      "https://megaska.com/pages/terms-and-conditions",
  contact:    "https://megaska.com/pages/contact-us" // if exists
};

// Convert to a friendly block we can give the model
function canonicalBlock() {
  const lines = Object.entries(CANONICAL)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return `Use ONLY these links when you include a URL. Do NOT invent new paths.\n${lines}`;
}




async function embed(text) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text })
  });
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return j.data[0].embedding;
}

async function retrieveTopK(query, k = 5) {
  const e = await embed(query);
  // use the RPC you created in Supabase
  const { data, error } = await supabaseRO.rpc('match_docs', { query_embedding: e, match_count: k });
  if (error) throw error;
  return data || [];
}

function systemPrompt() {
  return `
You are Megaska’s support assistant. Answer ONLY using the provided Context.
- **Do not invent URLs or policies**. If you include a link, use the "Canonical Links" provided.
- Prefer concise, friendly, precise answers. If not sure, say so and mention WhatsApp +91 9650957372.
- India-only shipping. Do not mention Kuwait or other regions unless explicitly in Context.
- When relevant, cite the policy name and include the canonical link.

Output: plain text; keep it short.`;
}


module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const { message, sessionId } = req.body || {};
    if (!message || !sessionId) {
      res.setHeader("Content-Type","text/event-stream; charset=utf-8");
      res.write(`data: ${JSON.stringify({ output_text: "Missing fields" })}\n\n`);
      return res.end();
    }

    const hits = await retrieveTopK(message, 5);
    const ctx = hits.map((h, i) => 
      `(${i+1}) ${h.title || ""}\nURL: ${h.url}\n${(h.content||"").slice(0,1200)}`
    ).join("\n\n");

    const input = [
      { role: "system", content: systemPrompt() },
      { role: "user", content: [
          { type: "input_text", text: `User: ${message}` },
          { type: "input_text", text: `Context:\n${ctx || "(none)"}` }
      ]}
    ];

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini", input, stream: true, temperature: 0.2 })
    });

    res.setHeader("Content-Type","text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control","no-cache, no-transform");
    res.setHeader("Connection","keep-alive");

    if (!upstream.ok || !upstream.body) {
      res.write(`data: ${JSON.stringify({ output_text: "Assistant is busy. WhatsApp +91 9650957372." })}\n\n`);
      return res.end();
    }

    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const events = buf.split("\n\n"); buf = events.pop() || "";
      for (const evt of events) {
        const first = evt.split("\n")[0] || "";
        if (!first.includes("response.output_text.delta")) continue;
        const dataLine = evt.split("\n").find(l => l.startsWith("data: "));
        if (!dataLine) continue;
        try {
          const payload = JSON.parse(dataLine.slice(6));
          if (payload?.delta) res.write(`data: ${JSON.stringify({ output_text: payload.delta })}\n\n`);
        } catch {}
      }
    }
    res.end();
  } catch (e) {
    res.setHeader("Content-Type","text/event-stream; charset=utf-8");
    res.write(`data: ${JSON.stringify({ output_text: "Sorry—temporary issue. Please WhatsApp +91 9650957372." })}\n\n`);
    res.end();
  }
  const messages = [
  { role: "system", content: systemPrompt() },
  { role: "user", content: [
      { type: "input_text", text: `User: ${message}` },
      { type: "input_text", text: `Canonical Links:\n${canonicalBlock()}` },
      { type: "input_text", text: `Context:\n${contextText}` } // whatever you already pass from RAG
    ]}
];

};
