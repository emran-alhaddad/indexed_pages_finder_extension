// popup.js: sign-in, site picker, and a live view of the scan run by background.js.
const SC = 'https://www.googleapis.com/webmasters/v3';
const MAX_RENDER = 200;
const $ = (id) => document.getElementById(id);

let scanState = null;
let scanResults = null;
let filter = 'all';

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
  const sel = $('site');
  let sites;
  try {
    sites = await loadSites(token);
  } catch (e) {
    setStatus(`Could not load your sites: ${e.message}`, true);
    return;
  }
  sel.replaceChildren(...sites.map((s) => new Option(IPF.siteLabel(s), s)));
  if (!sites.length) {
    $('scanBtn').disabled = true;
    setStatus('No verified sites on this Google account. Add one in Search Console first.', true);
    return;
  }
  const { lastSite, inspectLimit } = await chrome.storage.local.get(['lastSite', 'inspectLimit']);
  if (sites.includes(lastSite)) sel.value = lastSite;
  if (inspectLimit != null) $('inspectLimit').value = inspectLimit;
  render();
}

function showSignedOut() {
  $('signedOut').hidden = false;
  $('signedIn').hidden = true;
  $('signOutBtn').hidden = true;
}

function setStatus(text, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', isError);
}

function visibleRows() {
  const q = $('search').value.trim().toLowerCase();
  return (scanResults?.rows || []).filter(
    (r) => (filter === 'all' || r.status === filter) && (!q || r.url.toLowerCase().includes(q))
  );
}

function rowItem(r) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = r.url;
  a.target = '_blank';
  a.title = r.url;
  try {
    const u = new URL(r.url);
    a.textContent = u.pathname + u.search || '/';
  } catch {
    a.textContent = r.url;
  }
  const meta = document.createElement('div');
  meta.className = 'meta';
  const status = document.createElement('span');
  status.className = `s-${r.status}`;
  status.textContent = r.coverage;
  meta.append(status);
  if (r.impressions != null) meta.append(` · ${r.clicks} clicks · ${r.impressions} impressions · pos ${r.position}`);
  if (r.lastCrawl) meta.append(` · crawled ${r.lastCrawl}`);
  li.append(a, meta);
  return li;
}

function render() {
  const running = Boolean(scanState?.running);
  $('scanBtn').hidden = running;
  $('stopBtn').hidden = !running;
  $('site').disabled = running;
  $('progress').hidden = !running;
  if (running && scanState.phase === 'inspect' && scanState.total) {
    $('progress').max = scanState.total;
    $('progress').value = scanState.done;
  } else if (running) {
    $('progress').removeAttribute('value'); // indeterminate
  }
  if (scanState) setStatus(scanState.message, scanState.phase === 'error');
  $('note').textContent = scanState?.note || '';

  const rows = scanResults?.rows || [];
  $('results').hidden = rows.length === 0;
  if (!rows.length) return;
  const c = IPF.countByStatus(rows);
  $('cAll').textContent = rows.length;
  $('cIndexed').textContent = c.indexed;
  $('cNot').textContent = c.not_indexed;
  $('cUnchecked').textContent = c.unchecked;
  const vis = visibleRows();
  $('list').replaceChildren(...vis.slice(0, MAX_RENDER).map(rowItem));
  $('more').textContent = vis.length > MAX_RENDER
    ? `Showing ${MAX_RENDER} of ${vis.length}. Export to see all.`
    : vis.length ? '' : 'No URLs match.';
}

function download(text, type, ext) {
  const site = (scanResults?.siteUrl || 'site').replace(/^sc-domain:/, '').replace(/[^a-z0-9]+/gi, '_');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = `indexed_${site}_${new Date().toISOString().slice(0, 10)}.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

document.addEventListener('DOMContentLoaded', async () => {
  ({ scanState = null, scanResults = null } = await chrome.storage.local.get(['scanState', 'scanResults']));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.scanState) scanState = changes.scanState.newValue || null;
    if (changes.scanResults) scanResults = changes.scanResults.newValue || null;
    if (changes.scanState || changes.scanResults) render();
  });

  const token = await getToken(false);
  if (token) showSignedIn(token);
  else showSignedOut();

  $('signInBtn').addEventListener('click', async () => {
    const t = await getToken(true);
    if (t) showSignedIn(t);
    else setStatus('Sign-in was cancelled.', true);
  });

  $('signOutBtn').addEventListener('click', async () => {
    const t = await getToken(false);
    if (t) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: 'POST', mode: 'no-cors' }).catch(() => {});
    await chrome.identity.clearAllCachedAuthTokens();
    await chrome.storage.local.remove(['scanState', 'scanResults', 'lastSite']);
    scanState = scanResults = null;
    showSignedOut();
  });

  $('scanBtn').addEventListener('click', () => {
    const siteUrl = $('site').value;
    const inspectLimit = Math.max(0, Math.min(2000, parseInt($('inspectLimit').value, 10) || 0));
    chrome.storage.local.set({ lastSite: siteUrl, inspectLimit });
    $('scanBtn').disabled = true;
    // Site access is needed to read sitemaps. Asked here because it needs the click; declining still runs the scan.
    chrome.permissions.request({ origins: [IPF.originPattern(siteUrl)] })
      .catch(() => false)
      .finally(() => {
        chrome.runtime.sendMessage({ action: 'scan', siteUrl, inspectLimit }, (resp) => {
          $('scanBtn').disabled = false;
          if (chrome.runtime.lastError || resp?.error) setStatus(resp?.error || chrome.runtime.lastError.message, true);
        });
      });
  });

  $('stopBtn').addEventListener('click', () => chrome.runtime.sendMessage({ action: 'stop' }));

  document.querySelectorAll('.chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      filter = chip.dataset.filter;
      document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      render();
    })
  );
  $('search').addEventListener('input', render);

  $('csvBtn').addEventListener('click', () => download(IPF.toCSV(visibleRows()), 'text/csv', 'csv'));
  $('jsonBtn').addEventListener('click', () =>
    download(JSON.stringify({ site: scanResults.siteUrl, exportedAt: new Date().toISOString(), rows: visibleRows() }, null, 2), 'application/json', 'json')
  );
  $('copyBtn').addEventListener('click', async () => {
    const rows = visibleRows();
    await navigator.clipboard.writeText(rows.map((r) => r.url).join('\n'));
    setStatus(`Copied ${rows.length} URLs.`);
  });
});
