// background.js
// This service worker coordinates long‑running fetch operations
// so that progress persists even if the popup is closed.  It
// listens for messages from the popup to start a new fetch and
// maintains a shared state in chrome.storage.local under
// the key `fetchState`.

// Helper to pause between API requests
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Globals for rate‑limit management and backoff.  We start with a
// conservative delay between any two API calls.  If we hit
// rate limits, the delay will grow; on successful calls it will
// gradually shrink, but never below 800ms.
let GLOBAL_DELAY_MS = 120;
const MAX_BACKOFF_MS = 640;
const MAX_RETRIES = 6;
const MAX_START_ATTEMPTS = 3;
const ATTEMPT_RETRY_DELAY_MS = 3000;

let currentFetchToken = 0;
const REFERER_BLOCKED_MESSAGE =
  'Google Custom Search rejected this API key because it is restricted to specific HTTP referrers. Update the key to allow requests without a referrer (e.g. remove HTTP referer restrictions or use an unrestricted key).';

function isRefererBlockedError(err) {
  if (!err) return false;
  if (err.reason && typeof err.reason === 'string') {
    const reason = err.reason.toLowerCase();
    if (reason.includes('referer') || reason.includes('referrer')) return true;
  }
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('referer') && msg.includes('blocked');
}

// Generate +/-20% jitter to break up simultaneous calls
function jitter(ms) {
  const delta = Math.floor(ms * 0.2);
  return ms + (Math.random() * 2 * delta - delta);
}

// Compute exponential backoff delay with a cap.  attempt is
// 1‑based.  We cap at MAX_BACKOFF_MS.
function backoffDelay(attempt) {
  const base = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, attempt - 1));
  return Math.ceil(jitter(base));
}

/**
 * Perform a search request with retry, adaptive global throttling
 * and detection of quota errors.  This helper wraps
 * `fetchSearchPage` and manages rate limits.
 *
 * - Before each request it waits `GLOBAL_DELAY_MS` ms.
 * - On success, it shortens the global delay (but not below 800ms).
 * - On HTTP 429 or `rateLimitExceeded`, it grows the global delay
 *   and retries up to MAX_RETRIES times with exponential backoff.
 * - On `dailyLimitExceeded`, it throws an error with `reason` so
 *   that callers can abort the harvest.
 * @param {string} apiKey
 * @param {string} cseId
 * @param {string} domain
 * @param {number} startIndex
 * @param {boolean} images
 */
async function fetchWithBackoff(apiKey, cseId, domain, startIndex, images) {
  // global delay
  await sleep(GLOBAL_DELAY_MS);
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fetchSearchPage(apiKey, cseId, domain, startIndex, images);
      // success: gently shrink global delay toward 800ms
      GLOBAL_DELAY_MS = Math.max(800, Math.floor(GLOBAL_DELAY_MS * 0.9));
      return result;
    } catch (err) {
      const message = String(err.message);
      // Extract reason from error if present
      let reason = '';
      if (err && typeof err === 'object') {
        if (err.reason) reason = err.reason;
      }
      if (message.includes('dailyLimitExceeded') || reason === 'dailyLimitExceeded') {
        const e = new Error('Daily quota exceeded. Try again after reset.');
        e.reason = 'dailyLimitExceeded';
        throw e;
      }
      if (message.includes('HTTP 429') || message.includes('rateLimitExceeded') || reason === 'rateLimitExceeded') {
        lastErr = err;
        // grow global delay to be gentler, but cap at 5 seconds
        GLOBAL_DELAY_MS = Math.min(5000, Math.floor(GLOBAL_DELAY_MS * 1.5));
        // wait exponential backoff with jitter
        const waitTime = backoffDelay(attempt);
        await sleep(waitTime);
        continue;
      }
      // other errors propagate
      throw err;
    }
  }
  // exhausted retries
  const e = lastErr || new Error('Rate limit exceeded after retries');
  e.reason = e.reason || 'rateLimitExceeded';
  throw e;
}

// Define a set of extensions that we consider to be assets.  All other
// URLs will be treated as pages.
const assetExtensions = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tif', 'tiff',
  'css', 'js', 'json', 'map', 'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp4', 'mp3', 'ogg', 'wav', 'webm', 'pdf'
]);

/**
 * Fetch a single page of Google Custom Search results.
 * @param {string} apiKey Your API key.
 * @param {string} cseId Your Custom Search Engine ID.
 * @param {string} domain The domain to restrict search to.
 * @param {number} startIndex 1‑based starting index.
 * @param {boolean} images Whether to fetch image results instead of web pages.
 * @returns {Promise<Object>} The parsed JSON response.
 */
async function fetchSearchPage(apiKey, cseId, domain, startIndex, images) {
  const endpoint = new URL('https://customsearch.googleapis.com/customsearch/v1');
  const params = new URLSearchParams({
    key: apiKey,
    cx: cseId,
    q: `site:${domain}`,
    start: startIndex.toString(),
    num: '10'
  });
  if (images) {
    params.set('searchType', 'image');
  }
  endpoint.search = params.toString();
  const response = await fetch(endpoint.toString());
  if (!response.ok) {
    let message = `HTTP ${response.status}: ${response.statusText}`;
    let reason = '';
    try {
      const errData = await response.json();
      if (errData && errData.error) {
        if (errData.error.message) {
          message += ` - ${errData.error.message}`;
        }
        const first = Array.isArray(errData.error.errors) ? errData.error.errors[0] : null;
        if (first && first.reason) {
          reason = first.reason;
        } else if (errData.error.reason) {
          reason = errData.error.reason;
        }
      }
    } catch (e) {
      // ignore JSON parsing errors
    }
    const error = new Error(message);
    if (reason) error.reason = reason;
    throw error;
  }
  return response.json();
}

/**
 * Fetch a page with retry for rate‑limit errors.  If the API
 * returns HTTP 429, this helper will wait and retry up to three
 * times before giving up.  Other errors will be propagated
 * immediately.
 * @param {string} apiKey
 * @param {string} cseId
 * @param {string} domain
 * @param {number} startIndex
 * @param {boolean} images
 * @param {number} retries
 * @returns {Promise<Object>}
 */

/**
 * Categorise a link into pages or assets and store it into state if it
 * hasn't been seen before.
 * @param {string} link URL to categorise.
 * @param {Object} state The fetch state object.
 */
function categoriseAndStore(link, state) {
  // Only accept URLs that match the allowed domains in state.
  try {
    const urlObj = new URL(link);
    // Check that the host ends with one of the specified domains.  This also
    // allows subdomains (e.g. www.example.com) because endsWith will match
    // example.com in both cases.
    const allowed = Array.isArray(state.domains) && state.domains.some((d) => {
      try {
        return urlObj.hostname.toLowerCase().endsWith(d.toLowerCase());
      } catch (e) {
        return false;
      }
    });
    if (!allowed) {
      return; // Skip URLs that do not belong to the requested domain(s)
    }
    const pathname = urlObj.pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]+)(?:\?|#|$)/);
    let ext = '';
    if (match && match[1]) ext = match[1];
    if (assetExtensions.has(ext)) {
      if (!state.assetsResults.includes(link)) {
        state.assetsResults.push(link);
      }
    } else {
      if (!state.pagesResults.includes(link)) {
        state.pagesResults.push(link);
      }
    }
  } catch (e) {
    // Ignore unparseable URLs (e.g. x-raw-image schemes)
    return;
  }
}

/**
 * Update the fetch state in chrome.storage.local.  Because we store
 * complex nested data, we overwrite the entire state with a single
 * assignment.  All UI updates in the popup come through
 * chrome.storage.onChanged listeners.
 * @param {Object} state The current fetch state.
 */
function persistState(state) {
  if (state && typeof state === 'object' && !Array.isArray(state)) {
    if (state.fetchToken === undefined) {
      state.fetchToken = currentFetchToken;
    } else if (state.fetchToken !== currentFetchToken) {
      return;
    }
  }
  chrome.storage.local.set({ fetchState: state });
}

// A singleton to hold the current fetch state.  When no fetch is active
// this variable is null.
let currentState = null;

/**
 * Start a new harvesting operation.  If a previous operation is in
 * progress, it will be abandoned in favour of the new one.  This
 * function performs all network requests sequentially and updates
 * progress as it goes.  It makes two types of requests per domain:
 * web page results and image results.  Each request counts as a step
 * towards the total progress.
 * @param {string} apiKey The user’s API key.
 * @param {string} cseId The user’s search engine ID.
 * @param {string[]} domains A list of domains to fetch.
 */
async function startHarvest(apiKey, cseId, domains, context = {}) {
  const attempt = context.attempt || 1;
  const maxAttempts = context.maxAttempts || 1;
  const token = context.token ?? currentFetchToken;

  // Initialise new state for this attempt
  const state = {
    running: true,
    domains,
    pagesResults: [],
    assetsResults: [],
    totalSteps: 0,
    completedSteps: 0,
    status: '',
    startedAt: Date.now(),
    attempt,
    maxAttempts,
    attemptLabel: `Starting attempt ${attempt} ...`,
    attemptError: '',
    retryScheduled: false,
    fetchToken: token
  };
  currentState = state;
  persistState(state);

  const fail = (message, reason, recoverable = true) => {
    state.running = false;
    state.attemptLabel = '';
    state.attemptError = message;
    state.retryScheduled = false;
    state.status = message;
    state.fetchToken = token;
    persistState(state);
    return { success: false, message, reason, recoverable };
  };

  // Build tasks array with counts for each domain
  const tasks = [];
  for (const domain of domains) {
    // Fetch the first page of web results to determine total pages
    let pagesCount = 1;
    try {
      const firstPage = await fetchWithBackoff(apiKey, cseId, domain, 1, false);
      const items = firstPage.items || [];
      items.forEach((item) => categoriseAndStore(item.link, state));
      const totalStr = firstPage.searchInformation && firstPage.searchInformation.totalResults;
      let totalNum = 0;
      if (totalStr) totalNum = parseInt(totalStr, 10);
      pagesCount = totalNum > 0 ? Math.ceil(totalNum / 10) : 1;
      // API caps at 100 results
      pagesCount = Math.min(10, pagesCount);
      state.completedSteps++;
      state.attemptLabel = '';
      state.attemptError = '';
      state.status = `Fetched ${domain} page 1 of ${pagesCount}`;
      persistState(state);
    } catch (err) {
      if (err && err.reason === 'dailyLimitExceeded') {
        return fail('Stopped: Google Custom Search daily quota exceeded. Please retry after reset.', 'dailyLimitExceeded', false);
      }
      if (err && (err.reason === 'rateLimitExceeded' || String(err.message).toLowerCase().includes('rate limit'))) {
        return fail('Rate limit exceeded. Please try again later.', 'rateLimitExceeded', true);
      }
      if (isRefererBlockedError(err)) {
        return fail(REFERER_BLOCKED_MESSAGE, 'httpRefererRestricted', false);
      }
      return fail(`Error fetching ${domain} pages: ${err.message}`, err && err.reason, true);
    }
    // Fetch the first page of image results to determine total image pages
    let imagePages = 1;
    try {
      const firstImage = await fetchWithBackoff(apiKey, cseId, domain, 1, true);
      const items = firstImage.items || [];
      items.forEach((item) => categoriseAndStore(item.link, state));
      const totalStr = firstImage.searchInformation && firstImage.searchInformation.totalResults;
      let totalNum = 0;
      if (totalStr) totalNum = parseInt(totalStr, 10);
      imagePages = totalNum > 0 ? Math.ceil(totalNum / 10) : 1;
      imagePages = Math.min(10, imagePages);
      state.completedSteps++;
      state.attemptLabel = '';
      state.attemptError = '';
      state.status = `Fetched ${domain} images page 1 of ${imagePages}`;
      persistState(state);
    } catch (err) {
      if (err && err.reason === 'dailyLimitExceeded') {
        return fail('Stopped: Google Custom Search daily quota exceeded. Please retry after reset.', 'dailyLimitExceeded', false);
      }
      if (err && (err.reason === 'rateLimitExceeded' || String(err.message).toLowerCase().includes('rate limit'))) {
        return fail('Rate limit exceeded. Please try again later.', 'rateLimitExceeded', true);
      }
      if (isRefererBlockedError(err)) {
        return fail(REFERER_BLOCKED_MESSAGE, 'httpRefererRestricted', false);
      }
      return fail(`Error fetching ${domain} images: ${err.message}`, err && err.reason, true);
    }
    // Add to tasks; we start from page 2 because page 1 already fetched
    tasks.push({ domain, pagesCount, imagePages });
    // Add to total steps both page and image counts
    state.totalSteps += pagesCount + imagePages;
  }
  // Persist initial counts after computing totals
  persistState(state);
  // Now process remaining pages sequentially
  for (const task of tasks) {
    const { domain, pagesCount, imagePages } = task;
    // Web pages beyond the first page
    for (let pageNum = 2; pageNum <= pagesCount; pageNum++) {
      state.status = `Fetching ${domain} pages (${pageNum}/${pagesCount})`;
      persistState(state);
      try {
        const data = await fetchWithBackoff(apiKey, cseId, domain, 1 + (pageNum - 1) * 10, false);
        (data.items || []).forEach((item) => categoriseAndStore(item.link, state));
      } catch (err) {
        // If quota or rate limits are exceeded, abort the harvest immediately
        if (err && err.reason === 'dailyLimitExceeded') {
          return fail('Stopped: Google Custom Search daily quota exceeded. Please retry after reset.', 'dailyLimitExceeded', false);
        }
        if (err && (err.reason === 'rateLimitExceeded' || String(err.message).includes('rate limit'))) {
          return fail('Rate limit exceeded. Please try again later.', 'rateLimitExceeded', true);
        }
        if (isRefererBlockedError(err)) {
          return fail(REFERER_BLOCKED_MESSAGE, 'httpRefererRestricted', false);
        }
        state.status = `Error on ${domain} page ${pageNum}: ${err.message}`;
        persistState(state);
      }
      state.completedSteps++;
      persistState(state);
      await sleep(1000);
    }
    // Image pages beyond the first page
    for (let pageNum = 2; pageNum <= imagePages; pageNum++) {
      state.status = `Fetching ${domain} images (${pageNum}/${imagePages})`;
      persistState(state);
      try {
        const data = await fetchWithBackoff(apiKey, cseId, domain, 1 + (pageNum - 1) * 10, true);
        (data.items || []).forEach((item) => categoriseAndStore(item.link, state));
      } catch (err) {
        if (err && err.reason === 'dailyLimitExceeded') {
          return fail('Stopped: Google Custom Search daily quota exceeded. Please retry after reset.', 'dailyLimitExceeded', false);
        }
        if (err && (err.reason === 'rateLimitExceeded' || String(err.message).includes('rate limit'))) {
          return fail('Rate limit exceeded. Please try again later.', 'rateLimitExceeded', true);
        }
        if (isRefererBlockedError(err)) {
          return fail(REFERER_BLOCKED_MESSAGE, 'httpRefererRestricted', false);
        }
        state.status = `Error on ${domain} image page ${pageNum}: ${err.message}`;
        persistState(state);
      }
      state.completedSteps++;
      persistState(state);
      await sleep(1000);
    }
  }
  // Mark finished
  state.running = false;
  state.attemptLabel = '';
  state.attemptError = '';
  state.retryScheduled = false;
  state.status = `Fetched ${state.pagesResults.length + state.assetsResults.length} URLs.`;
  persistState(state);
  return { success: true };
}

async function startFetchWithAttempts(apiKey, cseId, domains, token) {
  for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt++) {
    if (token !== currentFetchToken) return;
    const result = await startHarvest(apiKey, cseId, domains, { attempt, maxAttempts: MAX_START_ATTEMPTS, token });
    if (token !== currentFetchToken) return;
    if (result.success) {
      return;
    }
    const recoverable = result.recoverable !== false;
    if (!recoverable || attempt === MAX_START_ATTEMPTS) {
      currentState.retryScheduled = false;
      currentState.fetchToken = token;
      persistState(currentState);
      return;
    }
    currentState.retryScheduled = true;
    currentState.fetchToken = token;
    persistState(currentState);
    await sleep(ATTEMPT_RETRY_DELAY_MS);
  }
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startFetch') {
    const { apiKey, cseId, domains } = message;
    const token = ++currentFetchToken;
    startFetchWithAttempts(apiKey, cseId, domains, token).catch((err) => {
      console.error('startFetchWithAttempts failed', err);
    });
    sendResponse({ started: true });
    return true; // indicates asynchronous processing
  } else if (message.action === 'getState') {
    // Respond with current state; if no state, return null
    sendResponse({ state: currentState });
    return true;
  } else if (message.action === 'resetState') {
    currentState = null;
    currentFetchToken++;
    chrome.storage.local.remove('fetchState');
    sendResponse({ reset: true });
    return true;
  }
  return false;
});
