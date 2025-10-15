// /scripts/crawl-index.js
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

const fetch = require("node-fetch");
const { JSDOM } = require("jsdom");
const { createClient } = require("@supabase/supabase-js");
const OpenAI = require("openai");

const SITE = process.env.SITE_ORIGIN || "https://megaska.com";
const SITEMAP = process.env.SITEMAP_URL || `${SITE}/sitemap.xml`;
const BATCH = 32; // embed up to 32 chunks per call (OK for text-embedding-3-small)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function* urlsFromSitemap(sitemapUrl, siteOrigin = SITE, seen = new Set()) {
  if (seen.has(sitemapUrl)) return;
  seen.add(sitemapUrl);

  const xml = await (await fetch(sitemapUrl)).text();

  // Collect all <loc> values
  const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => decodeXmlEntities(m[1].trim()));

  for (const loc of locs) {
    // If the <loc> itself is another sitemap (.xml), recurse into it
    if (/\.(xml)(\?.*)?$/i.test(loc)) {
      // stay on-site only
      if (sameOrigin(loc, siteOrigin)) {
        yield* urlsFromSitemap(loc, siteOrigin, seen);
      }
      continue;
    }
    // Yield only on-site page URLs (PDPs, collections, blogs, etc.)
    if (sameOrigin(loc, siteOrigin)) yield loc;
  }
}


function cleanHTML(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  doc.querySelectorAll("script,style,noscript,svg,nav,footer").forEach(el => el.remove());
  const text = doc.body.textContent || "";
  return text.replace(/\s+/g, " ").trim();
}

function chunk(text, size=1000, overlap=150) {
  const out = [];
  for (let i=0; i<text.length; i += (size - overlap)) out.push(text.slice(i, i + size));
  return out;
}

async function embedBatch(texts) {
  const resp = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts
  });
  return resp.data.map(d => d.embedding);
}

async function upsertRows(rows){
  // uses Supabase insert with upsert on (url, content) uniqueness if you add a constraint
  const { error } = await supa.from("web_chunks").insert(rows, { upsert: true });
  if (error) throw error;
}

(async () => {
  console.log("Crawling:", SITEMAP);
  for await (const url of urlsFromSitemap(SITEMAP)) {
    if (!url.startsWith(SITE)) continue; // stay on-site
    console.log("Fetch:", url);
    const html = await (await fetch(url)).text();
    const m = html.match(/<title>(.*?)<\/title>/i);
    const title = m ? m[1] : null;
    const text = cleanHTML(html);
    if (!text) continue;

    const parts = chunk(text);
    // embed in batches
    for (let i = 0; i < parts.length; i += BATCH) {
      const slice = parts.slice(i, i + BATCH);
      const embs = await embedBatch(slice);
      const rows = slice.map((content, idx) => ({
        url, title, content, embedding: embs[idx]
      }));
      await upsertRows(rows);
      // be a good citizen if your site has lots of pages
      await sleep(300);
    }
  }
  console.log("Done.");
})().catch(e => { console.error(e); process.exit(1); });
