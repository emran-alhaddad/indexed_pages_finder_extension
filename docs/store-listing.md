# Chrome Web Store: v3.0.0 submission

Copy each block into the matching field in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Store listing

**Summary (132 chars max)**

```
See which of your pages Google has indexed, which are missing, and why. Free, read-only, powered by your Search Console data.
```

**Description**

```
Find out exactly which pages of your website Google has indexed, and which ones it hasn't.

Indexed Pages Finder reads your own Google Search Console data. No API keys, no setup: sign in with Google, pick your site, click Find indexed pages.

WHAT YOU GET
• Every page that appeared in Google Search in the last 16 months, with clicks, impressions, CTR and average position
• Pages in your sitemap that never showed up in search
• Google's real index status for those pages, with the reason: "Crawled - currently not indexed", "Excluded by noindex tag", "Duplicate without user-selected canonical" and more
• Filters for Indexed / Not indexed / Unchecked, plus URL search
• Export to CSV or JSON, or copy URLs in one click
• Any site, no account: every URL of any domain from its sitemaps + the Wayback Machine, perfect for client sites and migrations
• Redirect rules: match old paths to the new site and export nginx, Apache (.htaccess), Next.js or Laravel rules, or a CSV map
• Scans keep running when you close the popup; Stop keeps partial results

PRIVATE BY DESIGN
• Read-only access: it cannot change anything in Search Console or on your site
• No servers, no analytics, no tracking; results stay in your browser
• Sign out removes access instantly

REQUIREMENTS
My sites mode needs your site verified in Google Search Console (free). Google allows 2,000 index-status checks per site per day. Any site mode needs nothing.

NEW IN 3.0
Rebuilt on the Search Console API. The old Custom Search API is being shut down by Google, so API keys and CSE IDs are no longer needed.

Free and open source: https://github.com/emran-alhaddad/indexed_pages_finder_extension
```

**Category:** Developer Tools (or Productivity)

**Screenshots:** upload `docs/screenshots/*.png` (1280×800, three images).

## Privacy practices tab

**Single purpose**

```
Shows which pages of the user's own websites are indexed by Google, using the user's Google Search Console data.
```

**Permission justifications**

| Permission | Justification |
|---|---|
| `identity` | Signs the user in with Google to read their own Search Console data (read-only scope webmasters.readonly). |
| `storage` | Saves the selected site and the last scan results locally so they persist when the popup closes. |
| Host: `www.googleapis.com`, `searchconsole.googleapis.com` | Calls the Google Search Console API (site list, search analytics, sitemaps, URL inspection). |
| Optional host: `https://*/*`, `http://*/*` | Requested at runtime only for the site the user chooses to scan (to read its sitemap files) and for web.archive.org (to list archived URLs of that site in Any site mode). Never requested for other sites. |

**Remote code:** No, I am not using remote code.

**Data usage:** tick **Authentication information** only (the Google sign-in token, used only to call Search Console). Leave everything else unticked. Tick all three certifications (not sold, not used for unrelated purposes, not used for creditworthiness).

**Privacy policy URL:**

```
https://emran-alhaddad.github.io/indexed_pages_finder_extension/privacy.html
```

This page is served by GitHub Pages from `docs/` on master.

## Google OAuth app (Cloud Console project `indexed-pages-finder`)

- `webmasters.readonly` is a **non-sensitive** scope, so no scope verification or demo video is needed.
- Branding: home page `https://emran-alhaddad.github.io/indexed_pages_finder_extension/`, privacy `.../privacy.html`, authorized domain `emran-alhaddad.github.io`.
- Don't upload a logo on the Branding page; a logo triggers brand verification.
- Publishing status must be **In production**, or only test users can sign in.
