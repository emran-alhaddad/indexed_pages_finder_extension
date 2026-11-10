// Run: node test.js
const assert = require('assert');
const IPF = require('./lib.js');

assert.strictEqual(IPF.siteOrigin('sc-domain:example.com'), 'https://example.com');
assert.strictEqual(IPF.siteOrigin('https://www.example.com/blog/'), 'https://www.example.com');
assert.strictEqual(IPF.originPattern('sc-domain:example.com'), '*://*.example.com/*');
assert.strictEqual(IPF.originPattern('https://www.example.com/'), 'https://www.example.com/*');

const index = `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://x.com/a.xml</loc></sitemap></sitemapindex>`;
assert.ok(IPF.isSitemapIndex(index));
assert.deepStrictEqual(IPF.parseLocs(index), ['https://x.com/a.xml']);

const urlset = `<urlset><url><loc>
  https://x.com/?a=1&amp;b=2 </loc></url><url><loc><![CDATA[https://x.com/p]]></loc></url></urlset>`;
assert.ok(!IPF.isSitemapIndex(urlset));
assert.deepStrictEqual(IPF.parseLocs(urlset), ['https://x.com/?a=1&b=2', 'https://x.com/p']);

assert.strictEqual(
  IPF.toCSV([{ url: 'https://x.com/a,b', status: 'indexed', coverage: 'Say "hi"', clicks: 3 }]),
  'url,status,coverage,clicks,impressions,ctr,position,lastCrawl\n"https://x.com/a,b",indexed,"Say ""hi""",3,,,,'
);

assert.deepStrictEqual(
  IPF.countByStatus([{ status: 'indexed' }, { status: 'indexed' }, { status: 'not_indexed' }]),
  { indexed: 2, not_indexed: 1 }
);

// Any-site mode
assert.strictEqual(IPF.normalizeHost('https://www.Old.com/blog?x=1'), 'old.com');
assert.strictEqual(IPF.normalizeHost('old.com'), 'old.com');
assert.deepStrictEqual(IPF.parseRobotsSitemaps('User-agent: *\nSitemap: https://a.com/s1.xml\nsitemap:https://a.com/s2.xml'), ['https://a.com/s1.xml', 'https://a.com/s2.xml']);
assert.ok(IPF.isPageUrl('https://a.com/blog/post'));
assert.ok(IPF.isPageUrl('https://a.com/guide.pdf'));
assert.ok(!IPF.isPageUrl('https://a.com/logo.PNG'));
assert.ok(!IPF.isPageUrl('https://a.com/wp-json/wp/v2/posts'));
assert.ok(!IPF.isPageUrl('https://a.com/blog/feed/'));
assert.strictEqual(IPF.pathOf('https://a.com/blog/post/?utm=1#x'), '/blog/post');
assert.strictEqual(IPF.pathOf('https://a.com/'), '/');

const match = IPF.buildMatcher(['/about', '/articles/seo-tips', '/']);
assert.strictEqual(match('/about'), '/about');
assert.strictEqual(match('/blog/seo-tips'), '/articles/seo-tips');
assert.strictEqual(match('/gone'), '');
const m2 = IPF.buildMatcher(['/met/2', '/a/guide', '/b/guide', '/career']);
assert.strictEqual(m2('/2007/page/2'), '', 'numeric slugs never match');
assert.strictEqual(m2('/old/guide'), '', 'ambiguous slugs never match');
assert.strictEqual(m2('/blog/career'), '/career');

const pairs = [{ from: '/about', to: '/about' }, { from: '/blog/seo-tips', to: '/articles/seo-tips' }, { from: '/%D9%85', to: '/m' }, { from: '/gone', to: '' }];
assert.strictEqual(IPF.redirectRules(pairs, 'csv', 'https://new.com/'), 'old_path,new_path\n/about,https://new.com/about\n/blog/seo-tips,https://new.com/articles/seo-tips\n/%D9%85,https://new.com/m\n/gone,');
const nginx = IPF.redirectRules(pairs, 'nginx');
assert.ok(nginx.includes('location = "/blog/seo-tips" { return 301 /articles/seo-tips; }'));
assert.ok(nginx.includes('location = "/م"'), 'nginx paths are decoded');
assert.ok(!nginx.includes('location = "/about"'), 'unchanged paths skipped');
assert.ok(nginx.includes('#   /gone'), 'unmatched listed as TODO');
const next = IPF.redirectRules([{ from: '/a:b', to: '/c' }], 'nextjs');
assert.ok(next.includes("{ source: '/a\\\\:b', destination: '/c', permanent: true },") && next.includes('module.exports = ['));
assert.ok(IPF.redirectRules(pairs, 'laravel').startsWith('<?php'));
assert.ok(IPF.redirectRules(pairs, 'apache').includes('Redirect 301 "/blog/seo-tips" "/articles/seo-tips"'));

assert.strictEqual(IPF.siteLabel('https://acq-c.com/'), 'acq-c.com');
assert.strictEqual(IPF.siteLabel('sc-domain:x.com'), 'x.com (domain)');

console.log('ok');
