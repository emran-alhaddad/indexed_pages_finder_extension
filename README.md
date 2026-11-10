# Indexed Pages Finder (Chrome Extension)

See which of your pages Google has indexed, which are missing, and why, using your own Google Search Console data. No API keys: sign in with Google and pick a site.

Install: [Chrome Web Store listing](https://chromewebstore.google.com/detail/indexed-pages-finder/kocknephdohmkkncdocjfchbdelhmoin)

> v3 replaces the Google Custom Search API, which Google shuts down on January 1, 2027, with the Search Console API.

## What it does

1. **Indexed pages:** every page that showed up in Google Search in the last 16 months, with clicks, impressions, CTR and average position.
2. **Sitemap pages:** reads your sitemaps (from Search Console, or `/sitemap.xml`) to find pages that never appeared in search.
3. **Real index status:** runs Google's URL Inspection on those pages and reports the exact reason, for example "Crawled - currently not indexed" or "Excluded by noindex tag". Limited to 2,000 checks per site per day by Google.
4. Filter by Indexed, Not indexed or Unchecked, search the list, and export to CSV or JSON, or copy the URLs.

Scans run in the background, so closing the popup doesn't stop them. A Stop button keeps partial results.

## Setup (developer, one time)

The extension needs an OAuth client ID so users can sign in with Google.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Search Console API**.
2. Configure the **OAuth consent screen** and add the scope `https://www.googleapis.com/auth/webmasters.readonly`.
3. Go to **Credentials**, then **Create OAuth client ID**, and choose **Chrome Extension**. Use the item ID `kocknephdohmkkncdocjfchbdelhmoin`.
4. Put the client ID into `manifest.json` under `oauth2.client_id`.
5. For local testing, make the unpacked extension use the store ID: copy the public key from the Chrome Web Store Developer Dashboard (**Package**, then **View public key**) into `manifest.json` as `"key": "..."`.

Then open `chrome://extensions`, enable Developer mode, and click **Load unpacked** on this folder.

`webmasters.readonly` is a sensitive scope. Until Google verifies the consent screen, users see an "unverified app" warning and you're limited to 100 test users. Submit the app for verification before you publish v3.

## Files

- `background.js`: the scan pipeline (Search Analytics, then sitemaps, then URL Inspection), with retries on 401, 429 and 5xx errors.
- `popup.html`, `popup.js`: sign-in, site picker, progress, results list and exports.
- `lib.js`: pure helpers shared by both, tested by `node test.js`.

## Permissions

- `identity`: Google sign-in (read-only Search Console access).
- `storage`: remembers the last site and the last scan results.
- Optional site access: requested per site, only to read that site's sitemaps.

## License

MIT. See `LICENSE`. Also see CONTRIBUTING.md, CODE_OF_CONDUCT.md and SECURITY.md.
