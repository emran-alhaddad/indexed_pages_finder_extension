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
  { indexed: 2, not_indexed: 1, unchecked: 0 }
);

console.log('ok');
