// lib.js: pure helpers shared by popup.js, background.js and test.js.
const IPF = {
  // "sc-domain:example.com" -> "https://example.com", "https://www.x.com/" -> "https://www.x.com"
  siteOrigin(siteUrl) {
    return siteUrl.startsWith('sc-domain:') ? `https://${siteUrl.slice(10)}` : new URL(siteUrl).origin;
  },

  // Host permission needed to read this property's sitemaps.
  originPattern(siteUrl) {
    return siteUrl.startsWith('sc-domain:')
      ? `*://*.${siteUrl.slice(10)}/*` // *.example.com also matches example.com
      : `${new URL(siteUrl).origin}/*`;
  },

  siteLabel(siteUrl) {
    return siteUrl.startsWith('sc-domain:') ? `${siteUrl.slice(10)} (domain)` : siteUrl;
  },

  decodeXml(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  },

  // ponytail: regex instead of DOMParser because the service worker has no DOM. Fine for sitemap <loc> tags.
  parseLocs(xml) {
    return [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)]
      .map((m) => IPF.decodeXml(m[1]));
  },

  isSitemapIndex(xml) {
    return /<sitemapindex[\s>]/i.test(xml);
  },

  isoDate(d) {
    return d.toISOString().slice(0, 10);
  },

  csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  },

  CSV_COLUMNS: ['url', 'status', 'coverage', 'clicks', 'impressions', 'ctr', 'position', 'lastCrawl'],

  toCSV(rows) {
    const cols = IPF.CSV_COLUMNS;
    return [cols.join(','), ...rows.map((r) => cols.map((c) => IPF.csvCell(r[c])).join(','))].join('\n');
  },

  countByStatus(rows) {
    const c = { indexed: 0, not_indexed: 0, unchecked: 0 };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }
};

if (typeof module !== 'undefined') module.exports = IPF;
