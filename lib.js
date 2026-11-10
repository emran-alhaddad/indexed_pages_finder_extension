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
    const c = {};
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  },

  // ---- Any-site mode (no Search Console) ----

  // "https://www.Old.com/blog" -> "old.com"
  normalizeHost(input) {
    let s = String(input).trim().toLowerCase();
    if (!/^https?:\/\//.test(s)) s = `https://${s}`;
    return new URL(s).hostname.replace(/^www\./, '');
  },

  parseRobotsSitemaps(txt) {
    return [...txt.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  },

  // Keeps pages; drops static assets and CMS plumbing that never needs a redirect.
  isPageUrl(url) {
    let u;
    try { u = new URL(url); } catch { return false; }
    const p = u.pathname.toLowerCase();
    if (/\.(jpe?g|png|gif|svg|webp|ico|bmp|tiff?|css|js|mjs|json|xml|txt|map|woff2?|ttf|otf|eot|mp[34]|webm|ogg|wav|zip|gz)$/.test(p)) return false;
    return !/(^\/wp-(json|admin|includes|content)\/|\/feed\/?$|xmlrpc\.php|^\/cdn-cgi\/)/.test(p);
  },

  // Path without query or hash; trailing slash removed except for "/".
  pathOf(url) {
    const p = new URL(url).pathname;
    return p.length > 1 ? p.replace(/\/+$/, '') : p;
  },

  // Returns fn(oldPath) -> best new path or '' (exact path first, then same last slug).
  // Slug matches only count when the slug is meaningful (4+ chars, not just a number like a page index)
  // and unique on the new site; anything ambiguous is left for a human (TODO).
  buildMatcher(newPaths) {
    const exact = new Set(newPaths);
    const slugOf = (p) => {
      const s = (p.split('/').filter(Boolean).pop() || '').toLowerCase();
      return s.length >= 4 && !/^\d+$/.test(s) ? s : '';
    };
    const bySlug = new Map();
    for (const p of newPaths) {
      const slug = slugOf(p);
      if (slug) bySlug.set(slug, bySlug.has(slug) ? null : p);
    }
    return (oldPath) => {
      if (exact.has(oldPath)) return oldPath;
      const slug = slugOf(oldPath);
      return (slug && bySlug.get(slug)) || '';
    };
  },

  REDIRECT_FORMATS: {
    csv: { label: 'CSV map', ext: 'csv' },
    nginx: { label: 'nginx', ext: 'conf' },
    apache: { label: 'Apache .htaccess', ext: 'htaccess' },
    nextjs: { label: 'Next.js redirects()', ext: 'js' },
    laravel: { label: 'Laravel routes', ext: 'php' }
  },

  // pairs: [{ from: '/old', to: '/new' | '' }]. Pairs where from === to need no rule and are skipped.
  redirectRules(pairs, format, newBase = '') {
    const base = newBase.replace(/\/+$/, '');
    if (format === 'csv') {
      return ['old_path,new_path', ...pairs.map((p) => `${IPF.csvCell(p.from)},${IPF.csvCell(p.to ? base + p.to : '')}`)].join('\n');
    }
    const todo = pairs.filter((p) => !p.to);
    const rules = pairs.filter((p) => p.to && p.to !== p.from);
    const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    const next = (s) => s.replace(/[:()*?+{}]/g, '\\$&'); // Next.js treats these as path-to-regexp syntax
    // nginx, Apache and Laravel match the decoded path, so "/%D9%85" must be written as "/م".
    const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
    const line = {
      nginx: (p) => `location = ${JSON.stringify(dec(p.from))} { return 301 ${base}${p.to}; }`,
      apache: (p) => `Redirect 301 ${JSON.stringify(dec(p.from))} ${JSON.stringify(base + p.to)}`,
      nextjs: (p) => `  { source: ${q(next(p.from))}, destination: ${q(base + p.to)}, permanent: true },`,
      laravel: (p) => `Route::permanentRedirect(${q(dec(p.from))}, ${q(base + p.to)});`
    }[format];
    const c = format === 'nextjs' || format === 'laravel' ? '//' : '#';
    const out = [`${c} ${rules.length} redirects generated by Indexed Pages Finder. Unchanged paths need no rule.`];
    if (format === 'laravel') out.unshift('<?php', '', 'use Illuminate\\Support\\Facades\\Route;', '');
    if (format === 'nextjs') out.push('module.exports = [');
    out.push(...rules.map(line));
    if (format === 'nextjs') out.push('];');
    if (todo.length) out.push('', `${c} TODO: no match found on the new site for these ${todo.length} paths:`, ...todo.map((p) => `${c}   ${p.from}`));
    return out.join('\n') + '\n';
  }
};

if (typeof module !== 'undefined') module.exports = IPF;
