// popup.js
// Front‑end script for the Index Harvester extension.  It manages
// UI interactions and reflects the state of the harvesting operation
// maintained by the background service worker.  Results are not
// computed here; instead, they are fetched by the service worker.

// Helper to set up visibility toggles for password inputs
function setupToggle(svgId, inputId) {
  const toggle = document.getElementById(svgId);
  const input = document.getElementById(inputId);
  let visible = false;
  toggle.addEventListener('click', () => {
    visible = !visible;
    input.type = visible ? 'text' : 'password';
    // Highlight the icon when visible
    toggle.style.fill = visible ? 'var(--primary)' : 'rgba(255,255,255,0.6)';
  });
}

// Global variables to hold fetched results and state
let currentState = null;

// Restore user preferences and fetch state on load
document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const cseIdInput = document.getElementById('cseId');
  const domainsInput = document.getElementById('domains');
  const startBtn = document.getElementById('startBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const progressContainer = document.getElementById('progressContainer');
  const progressEl = document.getElementById('progress');
  const statusEl = document.getElementById('status');

  // Configure visibility toggles
  setupToggle('toggleApi', 'apiKey');
  setupToggle('toggleCse', 'cseId');

  // Load saved credentials and domains
  chrome.storage.local.get(['apiKey', 'cseId', 'domains', 'fetchState'], (data) => {
    if (data.apiKey) apiKeyInput.value = data.apiKey;
    if (data.cseId) cseIdInput.value = data.cseId;
    if (data.domains) domainsInput.value = data.domains;
    if (data.fetchState) currentState = data.fetchState;
    updateUI();
  });

  // Persist values as the user types.  This prevents accidental
  // data loss if the popup is closed before starting a fetch.
  apiKeyInput.addEventListener('input', () => {
    const val = apiKeyInput.value.trim();
    chrome.storage.local.set({ apiKey: val });
  });
  cseIdInput.addEventListener('input', () => {
    const val = cseIdInput.value.trim();
    chrome.storage.local.set({ cseId: val });
  });
  domainsInput.addEventListener('input', () => {
    const val = domainsInput.value.trim();
    chrome.storage.local.set({ domains: val });
  });

  // Update UI whenever fetch state changes in storage
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.fetchState) {
      currentState = changes.fetchState.newValue;
      updateUI();
    }
  });

  // Start a new harvest when the user clicks the start button
  startBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const cseId = cseIdInput.value.trim();
    const domainsStr = domainsInput.value.trim();
    if (!apiKey || !cseId || !domainsStr) {
      statusEl.textContent = 'Please fill in all fields.';
      return;
    }
    const domains = domainsStr.split(/\s*,\s*/).filter(Boolean);
    if (domains.length === 0) {
      statusEl.textContent = 'Please enter at least one domain.';
      return;
    }
    // Save the credentials and domains for future sessions
    chrome.storage.local.set({ apiKey, cseId, domains: domainsStr });
    // Initiate the harvest via the background script
    chrome.runtime.sendMessage({ action: 'startFetch', apiKey, cseId, domains }, (response) => {
      // If there is a runtime error (e.g. the background script failed to
      // respond), reflect that in the UI rather than leaving it stuck on
      // "Starting…".  Otherwise, set an optimistic starting state; real
      // progress will come from onChanged.
      if (chrome.runtime.lastError) {
        currentState = {
          running: false,
          domains,
          pagesResults: [],
          assetsResults: [],
          totalSteps: 0,
          completedSteps: 0,
          status: `Failed to start: ${chrome.runtime.lastError.message}`,
          startedAt: Date.now()
        };
        chrome.storage.local.set({ fetchState: currentState });
        updateUI();
        return;
      }
      currentState = {
        running: true,
        domains,
        pagesResults: [],
        assetsResults: [],
        totalSteps: 0,
        completedSteps: 0,
        status: 'Starting…',
        startedAt: Date.now()
      };
      chrome.storage.local.set({ fetchState: currentState });
      updateUI();
    });
  });

  // Download the harvested URLs when the user clicks download
  downloadBtn.addEventListener('click', () => {
    if (!currentState || currentState.running) return;
    const pages = (currentState.pagesResults || []).map((u) => ({ url: u }));
    const assets = (currentState.assetsResults || []).map((u) => ({ url: u }));
    const output = { pages, assets };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    // Build filename: index_<domains>_<timestamp>.json
    const domains = Array.isArray(currentState.domains) && currentState.domains.length > 0 ? currentState.domains : ['domain'];
    const namePart = domains
      .map((d) => d.replace(/[^a-zA-Z0-9]/g, '_'))
      .join('_')
      .slice(0, 50); // limit length
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${namePart || 'index'}_${timestamp}.json`;
    chrome.downloads.download({ url, filename, saveAs: true }, () => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = `Download failed: ${chrome.runtime.lastError.message}`;
      } else {
        statusEl.textContent = 'Download started.';
      }
    });
  });

  /**
   * Update the user interface to reflect the current state.  This
   * function hides or shows the progress bar, enables or disables
   * buttons, and updates the status text.
   */
  function updateUI() {
    // Initialise UI element values from the current state
    if (!currentState) {
      progressContainer.style.display = 'none';
      startBtn.disabled = false;
      downloadBtn.disabled = true;
      statusEl.textContent = '';
      return;
    }
    const running = currentState.running;
    const total = currentState.totalSteps || 0;
    const completed = currentState.completedSteps || 0;
    // If running and there are steps, show the progress bar
    if (running) {
      progressContainer.style.display = 'block';
      progressEl.max = total > 0 ? total : 100;
      progressEl.value = completed;
      statusEl.textContent = currentState.status || `Fetching… (${completed}/${total})`;
      startBtn.disabled = true;
      downloadBtn.disabled = true;
    } else {
      // Not running; show completion message and enable download
      progressContainer.style.display = 'none';
      startBtn.disabled = false;
      const totalUrls = (currentState.pagesResults?.length || 0) + (currentState.assetsResults?.length || 0);
      statusEl.textContent = currentState.status || `Fetched ${totalUrls} URLs.`;
      downloadBtn.disabled = totalUrls === 0;
    }
  }
});