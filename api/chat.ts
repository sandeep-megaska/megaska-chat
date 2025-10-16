// /api/chat.js  (CommonJS, SSE streaming, Supabase retrieval, CORS)
const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

const ORIGINS = new Set([
  "https://megaska.com",
  "https://www.megaska.com",
]);

function setCors(res, origin) {
  const allow = origin && ORIGINS.has(origin) ? origin : "https://megaska.com";
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Vary", "Origin");
}

function decodeHTMLEntities(s = "") {
  return s
    .replace(/&ndash;/g, "–")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function dedupeByUrl(rows, maxPerUrl = 1, maxTotal = 5) {
  const seen = new Map();
  const out = [];
  for (const r of rows || []) {
    const url = String(r.url || "");
    const c = seen.get(url) || 0;
    if (url && c < maxPerUrl) {
      out.push(r);
      seen.set(url, c + 1);
      if (out.length >= maxTotal) break;
    }
  }
  return out;
}

function prioritizeCurrentUrl(rows, pageUrl) {
  if (!pageUrl) return rows || [];
  try {
    const target = new URL(pageUrl).pathname;
    return [...(rows || [])].sort((a, b) => {
      const ap = new URL(a.url).pathname;
      const bp = new URL(b.url).pathname;
      const aBoost = ap === target ? -1 : 0;
      const bBoost = bp === target ? -1 : 0;
      return aBoost - bBoost;
    });
  } catch {
    return rows || [];
  }
}

module.exports = async (req, res) => {
  try {
    setCors(res, req.headers.origin);

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    // Parse JSON body safely
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch {}
    }
    const { message, pageUrl } = body || {};
    const send = (txt) => res.write(`data: ${JSON.stringify({ output_text: txt })}\n\n`);

    if (!message || typeof message !== "string") {
      send("Please type a question."); res.end(); return;
    }

    // ---- Env checks (avoid crashing) ----
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

    if (!OPENAI_API_KEY) { send("Server is missing OPENAI_API_KEY."); res.end(); return; }
    if (!/^https:\/\/.+\.supabase\.co$/.test(SUPABASE_URL)) { send("Server config error (Supabase URL)."); res.end(); return; }
    if (!SUPABASE_ANON) { send("Server is missing Supabase anon key."); res.end(); return; }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON);

    // ------- Retrieval -------
    const query = pageUrl ? `${message}\n\nUser page: ${pageUrl}` : message;

    let top = [];
    try {
      const emb = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query,
      });
      const queryEmbedding = emb.data[0].embedding;

      const { data: matches, error } = await supa.rpc("match_web_chunks", {
        query_embedding: queryEmbedding,
        match_count: 12,
        similarity_threshold: 0.05, // a bit looser for recall
      });
      if (error) console.error("RPC error:", error);

      let rows = matches || [];
      rows = prioritizeCurrentUrl(rows, pageUrl);
      top = dedupeByUrl(rows, 1, 5);
    } catch (e) {
      console.error("Retrieval failed:", e);
    }

    const contextBlocks = (top || [])
      .map((r, i) => `[${i + 1}] URL: ${r.url}\nTITLE: ${decodeHTMLEntities(r.title || "")}\nTEXT: ${String(r.content || "").slice(0, 1400)}`)
      .join("\n\n");

    const systemPrompt = `
You are Megha, Megaska’s support agent. Answer using only the provided Context.
If the answer isn't in Context, say you don't know and suggest a closest relevant page.
- Be concise and friendly.
- Include the exact page URL when citing facts.
- Do not invent links.
`.trim();

    const userPrompt = `
User:
${message}

Context:
${contextBlocks || "(no context available)"}
`.trim();

    // ------- Stream from OpenAI -------
    try {
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      for await (const part of stream) {
        const delta = part.choices && part.choices[0] && part.choices[0].delta && part.choices[0].delta.content;
        if (delta) send(delta);
      }
    } catch (e) {
      console.error("OpenAI stream failed:", e);
      send("Sorry—something went wrong while generating the reply.");
    } finally {
      res.end();
    }
  } catch (err) {
    console.error("CHAT_FATAL:", err);
    try { res.write(`data: ${JSON.stringify({ output_text: "Sorry—server error. Please try again." })}\n\n`); } catch {}
    res.end();
  }
};
