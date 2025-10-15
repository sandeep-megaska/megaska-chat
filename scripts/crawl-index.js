// scripts/crawl-index.js  (CommonJS)
// Run with env vars set: OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE

const fetch = require("node-fetch");
const { JSDOM } = require("jsdom");
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

// --------- CONFIG ---------
const SITE = process.env.SITE_ORIGIN || "https://megaska.com";
const SITEMAP = process.env.SITEMAP_URL || `${SITE}/sitemap.xml`;
const BATCH = 32; // embedding batch size

// Guard against placeholder envs
if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || /xxxx\.supabase\.co/i.test(process.env.NEXT_PUBLIC_SUPABASE_URL))
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL to your real Supabase project URL.");
if (!process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE.includes("YOUR_"))
  throw new Error("Set SUPABASE_SERVICE_ROLE to your real Supabase service role key.");

// --------- CLIENTS ---------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

// --------- HELPERS ---------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function decodeXmlEntities(str = "") {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function sameOrigin(u, site) {
  try { return new URL(u).origin === new URL(site).origin; } catch { return false; }
}

// Recursively yield ONLY real page URLs (no XML/asset URLs)
async function* urlsFromSitemap(sitemapUrl, siteOrigin = SITE, seen = new Set()) {
  if (seen.has(sitemapUrl)) return;
  seen.add(sitemapUrl);

  const xml = await (await fetch(sitemapUrl)).text();
  const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => decodeXmlEntities(m[1].trim()));

  for (const loc of locs) {
    // nested sitemap? Recurse inside it
    if (/\.(xml)(\?.*)?$/i.test(loc)) {
      if (sameOrigin(loc, siteOrigin)) {
        yield* urlsFromSitemap(loc, siteOrigin, seen);
      }
      continue;
    }
    // only on-site pages; skip obvious non-HTML assets
    if (!sameOrigin(loc, siteOrigin)) continue;
    if (/\.(png|jpe?g|gif|webp|svg|pdf|css|js|mp4|webm)(\?.*)?$/i.test(loc)) continue;
    yield loc;
  }
}

function cleanHTML(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  doc.querySelectorAll("script,style,noscript,svg,nav,footer").forEach(el => el.remove());
  const text = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  return text;
}

function chunk(text, size = 1000, overlap = 150) {
  const out = [];
  for (let i = 0; i < text.length; i += (size - overlap)) out.push(text.slice(i, i + size));
  return out;
}

async function embedBatch(texts) {
  const resp = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts
  });
  return resp.data.map(d => d.embedding);
}

async function upsertRows(rows) {
  const { error } = await supa.from("web_chunks").insert(rows, { upsert: true });
  if (error) throw error;
}

// --------- MAIN ---------
(async () => {
  console.log("Crawling:", SITEMAP);

  let countPages = 0, countChunks = 0;

  for await (const url of urlsFromSitemap(SITEMAP)) {
    // LOG ONLY REAL PAGES
    console.log("Fetch:", url);

    const html = await (await fetch(url)).text();
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : null;
    const text = cleanHTML(html);
    if (!text) continue;

    const parts = chunk(text);
    countPages++;

    for (let i = 0; i < parts.length; i += BATCH) {
      const slice = parts.slice(i, i + BATCH);
      const embs = await embedBatch(slice);
      const rows = slice.map((content, idx) => ({
        url, title, content, embedding: embs[idx]
      }));
      await upsertRows(rows);
      countChunks += slice.length;
      await sleep(200); // be gentle
    }
  }

  console.log(`Done. Pages: ${countPages}, Chunks: ${countChunks}`);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
