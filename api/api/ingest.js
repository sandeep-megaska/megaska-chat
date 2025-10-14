// api/ingest.js
const crypto = require('crypto');
const { supabaseRW } = require('../lib/db');

const SITE_BASE = process.env.SITE_BASE || "https://www.megaska.com";
const TOKEN = process.env.INGEST_TOKEN || "";

function sha(s){ return crypto.createHash("sha256").update(s).digest("hex"); }

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function chunk(text, max = 1200) {
  const out = []; let buf = "";
  for (const s of text.split(/(?<=[.?!])\s+/)) {
    if ((buf + " " + s).length > max) { if (buf) out.push(buf.trim()); buf = s; }
    else buf += " " + s;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

async function getSitemapUrls(base) {
  const sm = await fetch(`${base}/sitemap.xml`).then(r=>r.text());
  const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  return urls.filter(u =>
    u.startsWith(`${base}/pages/`) ||
    u.startsWith(`${base}/policies/`) ||
    u.startsWith(`${base}/blogs/`) ||
    u.startsWith(`${base}/collections/`) ||
    u.startsWith(`${base}/products/`)
  );
}

async function embedBatch(texts) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts })
  });
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return j.data.map(d => d.embedding);
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "https://megaska.com");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    return res.status(204).end();
  }
  // Protect ingestion
  if (!TOKEN || req.query.token !== TOKEN) return res.status(401).send("Unauthorized");

  try {
    const urls = await getSitemapUrls(SITE_BASE);
    let totalChunks = 0;

    for (const url of urls) {
      const html = await fetch(url, { headers: { "User-Agent": "megaska-ingest" }}).then(r=>r.text()).catch(()=> "");
      if (!html) continue;
      const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || "").trim();
      const text = htmlToText(html);
      const pieces = chunk(text);

      // Embed in batches of 32
      for (let i = 0; i < pieces.length; i += 32) {
        const batch = pieces.slice(i, i + 32);
        const vecs = await embedBatch(batch);
        for (let j = 0; j < batch.length; j++) {
          const content = batch[j];
          const hash = sha(url + "|" + content);
          await supabaseRW.from("docs").upsert({
            url, title, content, hash, embedding: vecs[j]
          }, { onConflict: "hash" });
          totalChunks++;
        }
      }
    }
    res.json({ ok: true, urls: urls.length, chunks: totalChunks });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
};
