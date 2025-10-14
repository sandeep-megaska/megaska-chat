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
