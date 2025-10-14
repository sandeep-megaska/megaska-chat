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
  // Normalize host (treat www and non-www the same)
  const baseUrl = new URL(base);
  const baseHost = baseUrl.hostname.replace(/^www\./, '');

  async function fetchText(u) {
    const r = await fetch(u);
    return r.ok ? r.text() : "";
  }
  function extractLocs(xmlText) {
    return [...xmlText.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  }

  // 1) Fetch the root sitemap
  const rootText = await fetchText(`${baseUrl.origin}/sitemap.xml`);
  if (!rootText) return [];

  // 2) If it's a sitemap index, follow each child sitemap; otherwise use the root <loc> list
  let candidates = [];
  const rootLocs = extractLocs(rootText);
  if (/<sitemapindex[\s>]/i.test(rootText)) {
    for (const smUrl of rootLocs) {
      try {
        const txt = await fetchText(smUrl);
        if (txt) candidates.push(...extractLocs(txt));
      } catch {}
    }
  } else {
    candidates = rootLocs;
  }

  // 3) Keep only URLs on our domain (ignore www) and allowed paths
  const wanted = new Set();
  for (const u of candidates) {
    try {
      const url = new URL(u);
      const host = url.hostname.replace(/^www\./, '');
      if (host !== baseHost) continue;

      const p = url.pathname;
      if (
        p.startsWith('/pages/') ||
        p.startsWith('/policies/') ||
        p.startsWith('/blogs/') ||
        p.startsWith('/collections/') ||
        p.startsWith('/products/')
      ) {
        wanted.add(url.toString());
      }
    } catch {}
  }
  return Array.from(wanted);
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
