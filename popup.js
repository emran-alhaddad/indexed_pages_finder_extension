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
  const attemptLabel = document.getElementById('attemptLabel');
  const attemptErrorEl = document.getElementById('attemptError');
  const fieldErrors = {
    apiKey: document.getElementById('apiKeyError'),
    cseId: document.getElementById('cseIdError'),
    domains: document.getElementById('domainsError')
  };
  const formFields = {
    apiKey: {
      input: apiKeyInput,
      errorEl: fieldErrors.apiKey,
      validate: (value) => (value ? '' : 'API key is required.')
    },
    cseId: {
      input: cseIdInput,
      errorEl: fieldErrors.cseId,
      validate: (value) => (value ? '' : 'CSE ID is required.')
    },
    domains: {
      input: domainsInput,
      errorEl: fieldErrors.domains,
      validate: (value) => {
        if (!value) return 'Domain list is required.';
        const domains = value.split(/\s*,\s*/).filter(Boolean);
        if (domains.length === 0) return 'Enter at least one domain.';
        return '';
      }
    }
  };

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
    validateField('apiKey');
    if (!currentState || !currentState.running) statusEl.textContent = '';
  });
  cseIdInput.addEventListener('input', () => {
    const val = cseIdInput.value.trim();
    chrome.storage.local.set({ cseId: val });
    validateField('cseId');
    if (!currentState || !currentState.running) statusEl.textContent = '';
  });
  domainsInput.addEventListener('input', () => {
    const val = domainsInput.value.trim();
    chrome.storage.local.set({ domains: val });
    validateField('domains');
    if (!currentState || !currentState.running) statusEl.textContent = '';
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
    const allValid = validateAll();
    if (!allValid) {
      statusEl.textContent = 'Please fix the highlighted fields.';
      return;
    }
    const apiKey = apiKeyInput.value.trim();
    const cseId = cseIdInput.value.trim();
    const domainsStr = domainsInput.value.trim();
    const domains = domainsStr.split(/\s*,\s*/).filter(Boolean);
    if (domains.length === 0) {
      const field = domainsInput.closest('.field');
      if (field) field.classList.add('invalid');
      fieldErrors.domains.textContent = 'Enter at least one domain.';
      domainsInput.setAttribute('aria-invalid', 'true');
      statusEl.textContent = 'Please fix the highlighted fields.';
      return;
    }
    statusEl.textContent = '';
    attemptErrorEl.style.display = 'none';
    attemptErrorEl.textContent = '';
    attemptLabel.textContent = 'Starting attempt 1 ...';
    attemptLabel.style.display = 'block';
    startBtn.disabled = true;
    // Save the credentials and domains for future sessions
    chrome.storage.local.set({ apiKey, cseId, domains: domainsStr });
    chrome.runtime.sendMessage({ action: 'startFetch', apiKey, cseId, domains }, () => {
      if (chrome.runtime.lastError) {
        const failureMessage = `Failed to start: ${chrome.runtime.lastError.message}`;
        attemptLabel.style.display = 'none';
        attemptErrorEl.textContent = failureMessage;
        attemptErrorEl.style.display = 'block';
        statusEl.textContent = failureMessage;
        startBtn.disabled = false;
      }
    });
  });

  // Download the harvested URLs when the user clicks download
  downloadBtn.addEventListener('click', () => {
    if (!currentState || currentState.running) return;
    const rawPages = Array.isArray(currentState.pagesResults) ? currentState.pagesResults : [];
    const rawAssets = Array.isArray(currentState.assetsResults) ? currentState.assetsResults : [];
    const normaliseDomain = (domain) => {
      if (!domain) return '';
      let input = domain.trim();
      if (!input) return '';
      if (!/^https?:\/\//i.test(input)) {
        input = `https://${input}`;
      }
      try {
        const parsed = new URL(input);
        return parsed.hostname.toLowerCase().replace(/^www\./, '');
      } catch (e) {
        return input.replace(/^www\./, '').split('/')[0].toLowerCase();
      }
    };
    const seenDomains = new Set();
    const domainConfigs = (Array.isArray(currentState.domains) ? currentState.domains : [])
      .map((d) => normaliseDomain(d))
      .filter((domain) => {
        if (!domain || seenDomains.has(domain)) return false;
        seenDomains.add(domain);
        return true;
      })
      .sort((a, b) => b.length - a.length);
    const domainGroups = {};
    const domainOrder = [];
    const ensureGroup = (key) => {
      const label = key || 'unknown';
      if (!domainGroups[label]) {
        domainGroups[label] = { pages: [], assets: [] };
        domainOrder.push(label);
      }
      return domainGroups[label];
    };
    const matchDomain = (url) => {
      try {
        const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
        for (const domain of domainConfigs) {
          if (hostname === domain || hostname.endsWith(`.${domain}`)) {
            return domain;
          }
        }
        return hostname || url;
      } catch (e) {
        return url;
      }
    };
    rawPages.forEach((url) => {
      const entry = { url };
      const domainKey = matchDomain(url);
      ensureGroup(domainKey).pages.push(entry);
    });
    rawAssets.forEach((url) => {
      const entry = { url };
      const domainKey = matchDomain(url);
      ensureGroup(domainKey).assets.push(entry);
    });
    // Ensure configured domains appear even if empty
    domainConfigs.forEach((domainKey) => ensureGroup(domainKey));
    const output = {};
    domainOrder.forEach((domainKey) => {
      const group = domainGroups[domainKey];
      if (!group.pages.length && !group.assets.length && domainOrder.length === 1) {
        return;
      }
      output[domainKey] = {
        pages: group.pages,
        assets: group.assets
      };
    });
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
    const attemptLabelText = currentState?.attemptLabel || '';
    const attemptErrorText = currentState?.attemptError || '';
    if (attemptLabel) {
      attemptLabel.textContent = attemptLabelText;
      attemptLabel.style.display = attemptLabelText ? 'block' : 'none';
    }
    if (attemptErrorEl) {
      attemptErrorEl.textContent = attemptErrorText;
      attemptErrorEl.style.display = attemptErrorText ? 'block' : 'none';
    }
    const running = Boolean(currentState?.running);
    const retryScheduled = Boolean(currentState?.retryScheduled);
    // Initialise UI element values from the current state
    if (!currentState) {
      progressContainer.style.display = 'none';
      startBtn.disabled = false;
      downloadBtn.disabled = true;
      if (!attemptLabelText && !attemptErrorText) {
        statusEl.textContent = '';
      }
      return;
    }
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
    if (running || retryScheduled || attemptLabelText) {
      startBtn.disabled = true;
    }
  }

  function validateField(key) {
    const fieldConfig = formFields[key];
    if (!fieldConfig) return true;
    const { input, errorEl, validate } = fieldConfig;
    const value = input.value.trim();
    const message = validate(value);
    const fieldWrapper = input.closest('.field');
    if (message) {
      if (fieldWrapper) fieldWrapper.classList.add('invalid');
      if (errorEl) errorEl.textContent = message;
      input.setAttribute('aria-invalid', 'true');
      return false;
    }
    if (fieldWrapper) fieldWrapper.classList.remove('invalid');
    if (errorEl) errorEl.textContent = '';
    input.removeAttribute('aria-invalid');
    return true;
  }

  function validateAll() {
    return Object.keys(formFields).every((key) => validateField(key));
  }
});
