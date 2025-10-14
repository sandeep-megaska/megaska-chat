// api/ingest.js  — light, controllable ingester
const crypto = require('crypto');
const { supabaseRW } = require('../lib/db');

const SITE_BASE = process.env.SITE_BASE || "https://megaska.com";
const TOKEN = process.env.INGEST_TOKEN || "";

// ---------- small helpers ----------
function sha(s){ return crypto.createHash("sha256").update(s).digest("hex"); }
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

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

// ---------- sitemap utilities (with controls) ----------
async function fetchText(u) {
  const r = await fetch(u, { headers: { "User-Agent": "megaska-ingest" } });
  return r.ok ? r.text() : "";
}
function extractLocs(xmlText) {
  return [...xmlText.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
}

function normalizeHost(h){ return h.replace(/^www\./,''); }

function allowedPath(path, allowPrefixes) {
  return allowPrefixes.some(p => path.startsWith(p));
}

async function listAllUrls(base, allowPrefixes) {
  const baseUrl = new URL(base);
  const baseHost = normalizeHost(baseUrl.hostname);

  const root = await fetchText(`${baseUrl.origin}/sitemap.xml`);
  if (!root) return [];

  let candidates = [];
  const rootLocs = extractLocs(root);

  if (/<sitemapindex[\s>]/i.test(root)) {
    // Follow each child sitemap
    for (const smUrl of rootLocs) {
      try {
        const txt = await fetchText(smUrl);
        if (txt) candidates.push(...extractLocs(txt));
      } catch {}
    }
  } else {
    candidates = rootLocs;
  }

  // filter by host + allowed prefixes
  const set = new Set();
  for (const u of candidates) {
    try {
      const uu = new URL(u);
      if (normalizeHost(uu.hostname) !== baseHost) continue;
      if (!allowedPath(uu.pathname, allowPrefixes)) continue;
      set.add(uu.toString());
    } catch {}
  }
  return Array.from(set);
}

// ---------- main handler ----------
module.exports = async (req, res) => {
  // CORS (not strictly needed)
  res.setHeader("Access-Control-Allow-Origin", "https://megaska.com");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (!TOKEN || req.query.token !== TOKEN) return res.status(401).send("Unauthorized");

  try {
    // Controls from query
    // only=pages,policies,collections,products,blogs
    const onlyParam = (req.query.only || "pages,policies").toString().toLowerCase();
    const allowPrefixes = [];
    if (onlyParam.includes("pages")) allowPrefixes.push("/pages/");
    if (onlyParam.includes("policies")) allowPrefixes.push("/policies/");
    if (onlyParam.includes("collections")) allowPrefixes.push("/collections/");
    if (onlyParam.includes("products")) allowPrefixes.push("/products/");
    if (onlyParam.includes("blogs")) allowPrefixes.push("/blogs/");

    const limit = Math.max(1, Math.min( parseInt(req.query.limit || "20", 10) || 20, 50 ));
    const offset = Math.max(0, parseInt(req.query.offset || "0", 10) || 0);

    const singleUrl = req.query.url ? req.query.url.toString() : null;

    let finalUrls = [];

    if (singleUrl) {
      finalUrls = [singleUrl];
    } else {
      const all = await listAllUrls(SITE_BASE, allowPrefixes);
      // paginate to keep function fast/light
      finalUrls = all.slice(offset, offset + limit);
      // (Optional) always make sure critical pages are included at least once
      const STATIC_URLS = [
        `${SITE_BASE.replace(/\/$/,'')}/pages/size-guide`
      ];
      for (const u of STATIC_URLS) if (!finalUrls.includes(u)) finalUrls.push(u);
    }

    let totalChunks = 0;
    let processed = 0;
    let skipped = 0;

    for (const url of finalUrls) {
      // small delay to avoid overloading
      await sleep(150);
      let html = "";
      try {
        html = await fetchText(url);
      } catch {
        skipped++; 
        continue;
      }
      if (!html) { skipped++; continue; }

      const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || "").trim();
      const text = htmlToText(html);
      if (!text) { skipped++; continue; }

      const pieces = chunk(text);
      // embed in tiny batches to stay under limits
      for (let i = 0; i < pieces.length; i += 16) {
        const batch = pieces.slice(i, i + 16);
        const vecs = await embedBatch(batch);
        for (let j = 0; j < batch.length; j++) {
          const content = batch[j];
          const hash = sha(url + "|" + content);
          await supabaseRW.from("docs").upsert(
            { url, title, content, hash, embedding: vecs[j] },
            { onConflict: "hash" }
          );
          totalChunks++;
        }
      }
      processed++;
    }

    res.json({ ok: true, urls: finalUrls.length, processed, skipped, chunks: totalChunks, limit, offset, only: allowPrefixes });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
};
