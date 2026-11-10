// background.js: runs scans in the service worker so they survive the popup closing.
// A scan has 3 phases:
//   1. Search Analytics: every page with search impressions in the last 16 months (definitely indexed).
//   2. Sitemaps: URLs the site says exist but that had no impressions (status unknown).
//   3. URL Inspection: asks Google for the real index status of those unknown URLs (2,000/day per site).
importScripts('lib.js');

const SC = 'https://www.googleapis.com/webmasters/v3';
const INSPECT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const MAX_SITEMAP_URLS = 50000;

class Stopped extends Error {}
let ctl = null; // { stopped, done } for the scan in progress

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getToken() {
  const { token } = await chrome.identity.getAuthToken({ interactive: false });
  if (!token) throw new Error('Not signed in. Open the popup and sign in again.');
  return token;
}

async function api(url, body) {
  let token = await getToken();
  for (let attempt = 0; ; attempt++) {
    if (ctl.stopped) throw new Stopped();
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.ok) return res.json();
    const err = await res.json().catch(() => ({}));
    const message = err.error?.message || `HTTP ${res.status}`;
    if (attempt < 4 && res.status === 401) {
      await chrome.identity.removeCachedAuthToken({ token });
      token = await getToken();
      continue;
    }
    if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
      await sleep(2000 * 2 ** attempt); // 2s, 4s, 8s, 16s
      continue;
    }
    throw Object.assign(new Error(message), { status: res.status });
  }
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // .xml.gz files that the server did not already decompress start with the gzip magic bytes
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  return new TextDecoder().decode(buf);
}

async function readSitemaps(siteUrl) {
  const listed = await api(`${SC}/sites/${encodeURIComponent(siteUrl)}/sitemaps`).catch((e) => {
    if (e instanceof Stopped) throw e;
    return {};
  });
  const queue = (listed.sitemap || []).map((s) => s.path);
  if (!queue.length) queue.push(`${IPF.siteOrigin(siteUrl)}/sitemap.xml`);
  const seen = new Set();
  const urls = new Set();
  let failed = 0;
  while (queue.length && seen.size < 500 && urls.size < MAX_SITEMAP_URLS) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    if (ctl.stopped) throw new Stopped();
    try {
      const xml = await fetchText(path);
      const locs = IPF.parseLocs(xml);
      if (IPF.isSitemapIndex(xml)) queue.push(...locs);
      else locs.forEach((u) => urls.add(u));
    } catch (e) {
      failed++;
    }
  }
  return { urls: [...urls], failed, read: seen.size - failed };
}

async function scan({ siteUrl, inspectLimit }) {
  const rows = new Map();
  const st = { running: true, siteUrl, phase: 'pages', message: 'Reading pages from Search Console…', note: '', done: 0, total: 0, startedAt: Date.now() };
  const save = (withRows) => {
    const data = { scanState: { ...st, counts: IPF.countByStatus(rows.values()) } };
    if (withRows) data.scanResults = { siteUrl, finishedAt: Date.now(), rows: [...rows.values()] };
    return chrome.storage.local.set(data);
  };
  save(true);

  try {
    // 1. Pages with impressions
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 16);
    const queryUrl = `${SC}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
    for (let startRow = 0; startRow < 500000; startRow += 25000) {
      const data = await api(queryUrl, {
        startDate: IPF.isoDate(start), endDate: IPF.isoDate(end),
        dimensions: ['page'], rowLimit: 25000, startRow, dataState: 'all'
      });
      for (const r of data.rows || []) {
        rows.set(r.keys[0], {
          url: r.keys[0], status: 'indexed', coverage: 'Has search impressions',
          clicks: r.clicks, impressions: r.impressions,
          ctr: +(r.ctr * 100).toFixed(2), position: +r.position.toFixed(1)
        });
      }
      st.message = `Found ${rows.size} pages with search impressions…`;
      save();
      if ((data.rows || []).length < 25000) break;
    }
    save(true);

    // 2. Sitemaps
    st.phase = 'sitemaps';
    st.message = 'Reading sitemaps…';
    save();
    const allowed = await chrome.permissions.contains({ origins: [IPF.originPattern(siteUrl)] });
    if (!allowed) {
      st.note = 'Sitemaps skipped: allow site access when asked to also find pages that are not indexed.';
    } else {
      const sm = await readSitemaps(siteUrl);
      for (const u of sm.urls) {
        if (!rows.has(u)) rows.set(u, { url: u, status: 'unchecked', coverage: 'In sitemap, no search impressions' });
      }
      if (!sm.read) st.note = 'No readable sitemap found. Only pages with search impressions are listed.';
      save(true);
    }

    // 3. URL Inspection for unknown URLs
    const queue = [...rows.values()].filter((r) => r.status === 'unchecked').slice(0, inspectLimit);
    st.phase = 'inspect';
    st.total = queue.length;
    for (const row of queue) {
      st.message = `Checking index status ${st.done + 1} of ${st.total}…`;
      save();
      try {
        const res = await api(INSPECT, { inspectionUrl: row.url, siteUrl });
        const s = res.inspectionResult?.indexStatusResult || {};
        row.status = s.verdict === 'PASS' ? 'indexed' : 'not_indexed';
        row.coverage = s.coverageState || s.verdict || 'Unknown';
        row.lastCrawl = s.lastCrawlTime ? s.lastCrawlTime.slice(0, 10) : '';
      } catch (e) {
        if (e instanceof Stopped) throw e;
        if (e.status === 429) {
          st.note = 'Inspection quota reached (2,000 per site per day). Run again tomorrow to check the rest.';
          break;
        }
        row.coverage = `Check failed: ${e.message}`;
      }
      st.done++;
      if (st.done % 20 === 0) save(true);
    }

    st.phase = 'done';
    st.message = 'Done.';
  } catch (e) {
    st.phase = e instanceof Stopped ? 'stopped' : 'error';
    st.message = e instanceof Stopped ? 'Stopped. Results so far are kept.' : e.message;
  }
  st.running = false;
  await save(true);
}

// A service worker restart kills any scan in progress; don't leave the popup showing "running" forever.
chrome.storage.local.get('scanState').then(({ scanState }) => {
  if (scanState?.running && !ctl) {
    chrome.storage.local.set({ scanState: { ...scanState, running: false, phase: 'error', message: 'Scan was interrupted. Run it again.' } });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'scan') {
    if (ctl && !ctl.done) {
      sendResponse({ error: 'A scan is already running.' });
      return;
    }
    const mine = (ctl = { stopped: false, done: false });
    scan(msg).finally(() => { mine.done = true; });
    sendResponse({ started: true });
  } else if (msg.action === 'stop') {
    if (ctl) ctl.stopped = true;
    sendResponse({ ok: true });
  }
});
