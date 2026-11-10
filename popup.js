// popup.js: two modes ("My sites" via Search Console, "Any site" via sitemaps + Wayback),
// a live view of the scan run by background.js, and exports including redirect rules.
const SC = 'https://www.googleapis.com/webmasters/v3';
const MAX_RENDER = 200;
const $ = (id) => document.getElementById(id);

const STATUS = {
  indexed: { label: 'Indexed', cls: 'ok' },
  not_indexed: { label: 'Not indexed', cls: 'bad' },
  unchecked: { label: 'Unchecked', cls: 'warn' },
  sitemap: { label: 'In sitemap', cls: 'ok' },
  archive: { label: 'Archive only', cls: 'warn' }
};
const ORDER = { gsc: ['indexed', 'not_indexed', 'unchecked'], any: ['sitemap', 'archive'] };

let scanState = null;
const results = { gsc: null, any: null }; // last scan of each mode, kept apart
let mode = 'gsc';
let filter = 'all';
const cur = () => results[mode];

// ---------- theme ----------
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function currentTheme() {
  return document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

// ---------- mode ----------
function setMode(m) {
  mode = m;
  filter = 'all';
  const any = mode === 'any';
  $('tabGsc').setAttribute('aria-selected', String(!any));
  $('tabAny').setAttribute('aria-selected', String(any));
  $('paneGsc').hidden = any;
  $('paneAny').hidden = !any;
  chrome.storage.local.set({ mode });
  render();
}

// ---------- Search Console sign-in ----------
async function getToken(interactive) {
  try {
    const { token } = await chrome.identity.getAuthToken({ interactive });
    return token || null;
  } catch {
    return null;
  }
}

async function loadSites(token) {
  const res = await fetch(`${SC}/sites`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error?.message || `HTTP ${res.status}`);
  const { siteEntry = [] } = await res.json();
  return siteEntry
    .filter((s) => s.permissionLevel !== 'siteUnverifiedUser')
    .map((s) => s.siteUrl)
    .sort((a, b) => IPF.siteLabel(a).localeCompare(IPF.siteLabel(b)));
}

async function showSignedIn(token) {
  $('signedOut').hidden = true;
  $('signedIn').hidden = false;
  $('signOutBtn').hidden = false;
  let sites;
  try {
    sites = await loadSites(token);
  } catch (e) {
    setStatus(`Could not load your sites: ${e.message}`, true);
    return;
  }
  $('site').replaceChildren(...sites.map((s) => new Option(IPF.siteLabel(s), s)));
  if (!sites.length) {
    $('scanBtn').disabled = true;
    setStatus('No verified sites on this Google account. Try Any site instead.', true);
    return;
  }
  const { lastSite, inspectLimit } = await chrome.storage.local.get(['lastSite', 'inspectLimit']);
  if (sites.includes(lastSite)) $('site').value = lastSite;
  if (inspectLimit != null) $('inspectLimit').value = inspectLimit;
}

function showSignedOut() {
  $('signedOut').hidden = false;
  $('signedIn').hidden = true;
  $('signOutBtn').hidden = true;
}

// ---------- rendering ----------
function setStatus(text, isError = false, note = '') {
  const el = $('status');
  el.textContent = text || '';
  el.classList.toggle('error', isError);
  if (note) {
    const n = document.createElement('span');
    n.className = 'note';
    n.textContent = note;
    el.append(n);
  }
}

function visibleRows() {
  const q = $('search').value.trim().toLowerCase();
  return (cur()?.rows || []).filter(
    (r) => (filter === 'all' || r.status === filter) && (!q || r.url.toLowerCase().includes(q))
  );
}

function displayPath(url) {
  try {
    const u = new URL(url);
    return decodeURI(u.pathname + u.search);
  } catch {
    return url;
  }
}

function rowItem(r) {
  const li = document.createElement('li');
  const dot = document.createElement('span');
  dot.className = `sw ${STATUS[r.status]?.cls || 'all'}`;
  const a = document.createElement('a');
  a.href = r.url;
  a.target = '_blank';
  a.title = r.url;
  a.textContent = displayPath(r.url);
  const n = document.createElement('span');
  n.className = 'n';
  if (r.clicks != null) {
    n.textContent = `${r.clicks.toLocaleString()} clk`;
    n.title = `${r.clicks} clicks · ${r.impressions} impressions · position ${r.position}`;
  } else if (r.lastCrawl) {
    n.textContent = r.lastCrawl;
    n.title = 'Last crawled by Google';
  }
  const why = document.createElement('span');
  why.className = `why${r.status === 'not_indexed' ? ' bad' : ''}`;
  why.textContent = r.coverage;
  li.append(dot, a, n, why);
  return li;
}

function renderSummary(rows, mode) {
  const counts = IPF.countByStatus(rows);
  const keys = ORDER[mode] || Object.keys(counts);
  $('total').textContent = rows.length.toLocaleString();
  $('sumText').textContent = `pages · ${IPF.siteLabel(cur().siteUrl)}`;

  $('meter').classList.toggle('filtered', filter !== 'all');
  $('meter').replaceChildren(...keys.filter((k) => counts[k]).map((k) => {
    const s = document.createElement('span');
    s.className = `${STATUS[k].cls}${filter === k ? ' on' : ''}`;
    s.style.flexGrow = counts[k];
    return s;
  }));

  const btn = (key, label, cls, count) => {
    const b = document.createElement('button');
    b.setAttribute('aria-pressed', String(filter === key));
    const sw = document.createElement('span');
    sw.className = `sw ${cls}`;
    const num = document.createElement('b');
    num.textContent = count.toLocaleString();
    b.append(sw, label, ' ', num);
    b.addEventListener('click', () => { filter = filter === key && key !== 'all' ? 'all' : key; render(); });
    return b;
  };
  $('total').setAttribute('aria-pressed', String(filter === 'all'));
  $('legend').replaceChildren(...keys.map((k) => btn(k, STATUS[k].label, STATUS[k].cls, counts[k] || 0)));
}

function render() {
  const running = Boolean(scanState?.running);
  // While a scan runs, the Scan button of the mode that started it becomes Stop.
  const runMode = scanState?.mode === 'any' ? 'any' : 'gsc';
  for (const [id, m] of [['scanBtn', 'gsc'], ['scanAnyBtn', 'any']]) {
    const stop = running && runMode === m;
    $(id).textContent = stop ? 'Stop' : 'Scan';
    $(id).classList.toggle('ghost', stop);
    $(id).disabled = running && !stop;
  }
  $('site').disabled = $('host').disabled = running;
  $('track').hidden = !running;
  const determinate = running && scanState.phase === 'inspect' && scanState.total;
  $('track').classList.toggle('busy', running && !determinate);
  $('bar').style.transform = determinate ? `scaleX(${scanState.done / scanState.total})` : '';
  // The summary already says "done"; the readout only speaks while running, on errors, or with a note.
  // Only show the readout for the scan of the mode on screen.
  const st = scanState && (scanState.mode || 'gsc') === mode ? scanState : null;
  if (st) setStatus(st.phase === 'done' && !st.note ? '' : st.message, st.phase === 'error', st.note);
  else if (!running) setStatus('');

  const rows = cur()?.rows || [];
  $('results').hidden = rows.length === 0;
  if (!rows.length) return;
  if (filter !== 'all' && !rows.some((r) => r.status === filter)) filter = 'all';
  renderSummary(rows, mode);
  const vis = visibleRows();
  $('list').replaceChildren(...vis.slice(0, MAX_RENDER).map(rowItem));
  $('more').textContent = vis.length > MAX_RENDER
    ? `Showing ${MAX_RENDER} of ${vis.length.toLocaleString()}. Export to get all of them.`
    : vis.length ? '' : 'No paths match this filter.';
}

// ---------- exports ----------
function download(text, type, ext, prefix = 'pages') {
  const site = (cur()?.siteUrl || 'site').replace(/^sc-domain:/, '').replace(/[^a-z0-9]+/gi, '_');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = `${prefix}_${site}_${new Date().toISOString().slice(0, 10)}.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function uniquePaths(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    let p;
    try { p = IPF.pathOf(r.url); } catch { continue; }
    if (p !== '/' && !seen.has(p)) { seen.add(p); out.push(p); }
  }
  return out;
}

async function exportRedirects() {
  const format = $('format').value;
  const raw = $('newSite').value.trim();
  const paths = uniquePaths(visibleRows());
  if (!paths.length) return setStatus('No paths to export.', true);
  if (!raw && format !== 'csv') return setStatus('Enter the new site to match paths against.', true);

  let match = () => '';
  let base = '';
  if (raw) {
    let host;
    try { host = IPF.normalizeHost(raw); } catch { return setStatus('That new site address is not valid.', true); }
    base = `https://${host}`;
    setStatus(`Reading ${host} sitemaps to match paths…`);
    const granted = await chrome.permissions.request({ origins: [`*://*.${host}/*`] }).catch(() => false);
    if (!granted) return setStatus(`Allow access to ${host} so its sitemap can be read.`, true);
    const resp = await chrome.runtime.sendMessage({ action: 'newSitePaths', host });
    if (resp?.error) return setStatus(resp.error, true);
    if (!resp?.paths?.length) setStatus(`No sitemap found on ${host}; every path is marked TODO.`, true);
    match = IPF.buildMatcher(resp?.paths || []);
  }
  const pairs = paths.map((from) => ({ from, to: match(from) }));
  const matched = pairs.filter((p) => p.to).length;
  const text = IPF.redirectRules(pairs, format, format === 'csv' ? base : '');
  const { ext } = IPF.REDIRECT_FORMATS[format];
  download(text, 'text/plain', ext, `redirects_${format}`);
  setStatus(`${paths.length} paths · ${matched} matched · ${paths.length - matched} TODO.`);
}

// ---------- wiring ----------
document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['scanState', 'results_gsc', 'results_any', 'scanResults', 'mode', 'theme', 'lastHost', 'newSite', 'format']);
  scanState = stored.scanState || null;
  results.gsc = stored.results_gsc || stored.scanResults || null; // scanResults: key used before per-mode results
  results.any = stored.results_any || null;
  applyTheme(stored.theme);
  setMode(stored.mode || 'gsc');
  if (stored.lastHost) $('host').value = stored.lastHost;
  if (stored.newSite) $('newSite').value = stored.newSite;
  $('format').replaceChildren(...Object.entries(IPF.REDIRECT_FORMATS).map(([k, v]) => new Option(v.label, k)));
  if (stored.format) $('format').value = stored.format;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.scanState) scanState = changes.scanState.newValue || null;
    if (changes.results_gsc) results.gsc = changes.results_gsc.newValue || null;
    if (changes.results_any) results.any = changes.results_any.newValue || null;
    if (changes.scanState || changes.results_gsc || changes.results_any) render();
  });
  render();

  const token = await getToken(false);
  if (token) showSignedIn(token);
  else showSignedOut();

  $('themeBtn').addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    chrome.storage.local.set({ theme: next });
  });
  $('tabGsc').addEventListener('click', () => setMode('gsc'));
  $('tabAny').addEventListener('click', () => { setMode('any'); $('host').focus(); });
  document.querySelector('[data-goto="any"]').addEventListener('click', () => { setMode('any'); $('host').focus(); });

  $('signInBtn').addEventListener('click', async () => {
    const t = await getToken(true);
    if (t) showSignedIn(t);
    else setStatus('Sign-in was cancelled.', true);
  });

  $('signOutBtn').addEventListener('click', async () => {
    const t = await getToken(false);
    if (t) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: 'POST', mode: 'no-cors' }).catch(() => {});
    await chrome.identity.clearAllCachedAuthTokens();
    await chrome.storage.local.remove(['lastSite']);
    showSignedOut();
  });

  const start = (msg) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError || resp?.error) setStatus(resp?.error || chrome.runtime.lastError.message, true);
    });
  };

  const stopIfRunning = () => {
    if (!scanState?.running) return false;
    chrome.runtime.sendMessage({ action: 'stop' });
    return true;
  };

  $('scanBtn').addEventListener('click', () => {
    if (stopIfRunning()) return;
    const siteUrl = $('site').value;
    const inspectLimit = Math.max(0, Math.min(2000, parseInt($('inspectLimit').value, 10) || 0));
    chrome.storage.local.set({ lastSite: siteUrl, inspectLimit });
    // Site access lets the scan read sitemaps; declining still runs the Search Console part.
    chrome.permissions.request({ origins: [IPF.originPattern(siteUrl)] })
      .catch(() => false)
      .finally(() => start({ action: 'scan', siteUrl, inspectLimit }));
  });

  const scanAny = () => {
    if (stopIfRunning()) return;
    let host;
    try { host = IPF.normalizeHost($('host').value); } catch { host = ''; }
    if (!host || !host.includes('.')) return setStatus('Enter a domain like oldclient.com.', true);
    $('host').value = host;
    chrome.storage.local.set({ lastHost: host });
    chrome.permissions.request({ origins: [`*://*.${host}/*`, 'https://web.archive.org/*'] })
      .catch(() => false)
      .then((ok) => ok ? start({ action: 'scan', host }) : setStatus(`Allow access to ${host} and web.archive.org to scan.`, true));
  };
  $('scanAnyBtn').addEventListener('click', scanAny);
  $('host').addEventListener('keydown', (e) => { if (e.key === 'Enter') scanAny(); });

  $('total').addEventListener('click', () => { filter = 'all'; render(); });
  $('search').addEventListener('input', render);

  $('csvBtn').addEventListener('click', () => download(IPF.toCSV(visibleRows()), 'text/csv', 'csv'));
  $('jsonBtn').addEventListener('click', () =>
    download(JSON.stringify({ site: cur().siteUrl, source: mode, exportedAt: new Date().toISOString(), rows: visibleRows() }, null, 2), 'application/json', 'json')
  );
  $('copyBtn').addEventListener('click', async () => {
    const rows = visibleRows();
    await navigator.clipboard.writeText(rows.map((r) => r.url).join('\n'));
    setStatus(`Copied ${rows.length.toLocaleString()} URLs.`);
  });
  $('newSite').addEventListener('change', () => chrome.storage.local.set({ newSite: $('newSite').value.trim() }));
  $('format').addEventListener('change', () => chrome.storage.local.set({ format: $('format').value }));
  $('rulesBtn').addEventListener('click', () => exportRedirects().catch((e) => setStatus(e.message, true)));
});
