# Indexed Pages Finder (Chrome Extension)

A Chrome extension that uses Google Programmable Search (Custom Search API) to collect publicly indexed URLs for one or more domains. It categorizes results into pages and assets, shows live progress, handles transient rate limits with retries, and exports results as JSON grouped by domain.

- Status labels show start attempts and error messages (e.g., HTTP 429) with up to three retries.
- Work continues in the background; closing the popup does not stop progress.
- Exported JSON groups results by each domain at the top level.

## Chrome Web Store

For non‑developers, install from the Chrome Web Store:

- Chrome Web Store listing: https://chromewebstore.google.com/detail/Indexed-Pages-Finder/<your-extension-id>

(Replace `<your-extension-id>` once the listing is published. I can update this automatically when you share the ID.)

## Features

- Enter and persist API Key, CSE ID, and domain list
- Inline validation and visibility toggles for secrets
- Progress display and background persistence
- Resilient fetching with adaptive backoff and retries
- Friendly errors for common failures (rate limits, daily quota, HTTP referer restrictions)
- JSON export grouped by domain

## Installation (Developer)

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable `Developer mode`
4. Click `Load unpacked` and select the repository root

## Configuration

- API Key: Google Cloud API key with access to Custom Search API
- CSE ID: Google Programmable Search Engine ID (cx)
- Domains: Comma-separated list (e.g., `example.com, sub.example.org`)

Notes:
- If your API key restricts HTTP referrers, Chrome extension requests may have an empty referrer. If you see an error like “Requests from referer <empty> are blocked”, adjust the key’s API restrictions to allow requests without an HTTP referrer.

## Usage

- Click the extension icon to open the popup
- Enter API Key, CSE ID, and one or more domains
- Click `Start Fetch`
- Observe progress and attempt messages (retries on 429)
- When complete, click `Download JSON`

## Demo

- Quick video walkthrough (placeholder): https://youtu.be/your-demo-link
- Steps demo:
  - Open the popup, enter API Key, CSE ID, and domains
  - Click Start; watch attempts and progress update
  - Close and reopen the popup to see background progress persist
  - Download JSON and inspect grouped domains

(If you provide a GIF or video link, I’ll embed it here.)

## Export Format

The exported JSON is grouped by domain (no top-level `pages`/`assets`). Example:

```
{
  "example.com": {
    "pages": [ { "url": "https://www.example.com/" }, ... ],
    "assets": [ { "url": "https://www.example.com/images/news/A-2.jpg" }, ... ]
  },
  "example2.com": {
    "pages": [ { "url": "https://example2.com/" }, ... ],
    "assets": [ { "url": "https://example2.com/wp-content/..." }, ... ]
  }
}
```

## How It Works

- `background.js` runs a sequential fetch pipeline per domain using the Custom Search API
  - Determines result counts and iterates through pages for both web and image search
  - Adapts delays and retries on rate limits; stops early on daily quota exceeded
  - Persists all state in `chrome.storage.local` so popup state is restored across closes
- `popup.js` provides UI, validation, and renders progress from the shared state
  - Shows attempt labels and transient error messages for start failures
  - Allows exporting grouped JSON across all domains

## Permissions

- `storage`: persist credentials and fetch state
- `downloads`: save the exported JSON
- `activeTab` (if present): standard extension capability; not required for API calls

## Development

- Edit `popup.html`, `popup.js`, and `background.js`
- Reload the extension from `chrome://extensions` after changes
- Use DevTools: right-click popup → Inspect; also check the `Service Worker` console

### Coding Guidelines

- Keep UI changes minimal and consistent with the current style
- Prefer small, focused changes with clear user outcomes
- Avoid adding runtime dependencies; this project is vanilla HTML/JS/CSS

## Troubleshooting

- HTTP 429: The extension retries automatically with exponential backoff
- `dailyLimitExceeded`: The process stops; try again after quota reset
- `Requests from referer <empty> are blocked`: Update API key restrictions in Google Cloud Console

## Roadmap

- Optional CSV export
- Include per-URL metadata (title, snippet) when available
- Pause/resume controls in the popup

## Contributing

See CONTRIBUTING.md for guidelines. Please also review our Code of Conduct.

## Security

See SECURITY.md to report vulnerabilities responsibly.

## License

Licensed under the MIT License. See `LICENSE` for details.
