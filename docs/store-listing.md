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
• Scans keep running when you close the popup; Stop keeps partial results

PRIVATE BY DESIGN
• Read-only access: it cannot change anything in Search Console or on your site
• No servers, no analytics, no tracking; results stay in your browser
• Sign out removes access instantly

REQUIREMENTS
Your site must be verified in Google Search Console (free). Google allows 2,000 index-status checks per site per day.

NEW IN 3.0
Rebuilt on the Search Console API. The old Custom Search API is being shut down by Google, so API keys and CSE IDs are no longer needed.

Free and open source: https://github.com/emran-alhaddad/indexed_pages_finder_extension
```

**Category:** Developer Tools (or Productivity)

**Screenshots:** upload `docs/screenshots/*.png` (1280×800).

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
| Optional host: `https://*/*`, `http://*/*` | Requested at runtime only for the site the user chooses to scan, to read that site's sitemap files. Never requested for other sites. |

**Remote code:** No, I am not using remote code.

**Data usage:** tick **Authentication information** only (the Google sign-in token, used only to call Search Console). Leave everything else unticked. Tick all three certifications (not sold, not used for unrelated purposes, not used for creditworthiness).

**Privacy policy URL:**

```
https://github.com/emran-alhaddad/indexed_pages_finder_extension/blob/master/PRIVACY.md
```

This URL only works after the branch is merged to master. The live policy must match v3 before you submit.

## Google OAuth verification (Cloud Console, separate from the store)

Required before the public can sign in without an "unverified app" warning.

- App homepage: the Chrome Web Store listing URL.
- Privacy policy: the same PRIVACY.md URL as above.
- Scope justification: "Read-only access to show the user which of their own verified sites' pages are indexed. Data stays in the browser."
- Demo video: a short unlisted YouTube recording of sign-in → scan → results, with the consent screen visible.
