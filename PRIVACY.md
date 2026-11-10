# Privacy Policy

**Last updated:** 2026-11-10

## Overview

**Indexed Pages Finder** shows which pages of your websites Google has indexed, using your own Google Search Console data. It has no servers of its own; everything runs in your browser.

## Google account access

- You sign in with Google through Chrome's built-in sign-in (`chrome.identity`).
- The extension requests **read-only** Search Console access (`webmasters.readonly`). It can't change anything in your Search Console account or on your website.
- Your sign-in token is managed by Chrome and used only to call Google's Search Console APIs.
- **Sign out** in the popup removes the token and revokes access.

## Data we store (on your device only)

- The last site you selected and your inspection limit setting.
- The results of your last scan (URLs, index status, clicks, impressions, position).

All of it is kept in Chrome's local storage on your device and deleted when you sign out or uninstall.

## Data transmission

- Requests go only to Google's Search Console APIs (`www.googleapis.com`, `searchconsole.googleapis.com`).
- To read sitemaps, the extension fetches sitemap files from **your own site**, only after you allow access to that site.
- No data is sent to the developer or to any third party.

## Use of Google user data

Use of information received from Google APIs follows the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including its Limited Use requirements. Data is used only to show you your own indexing reports. It is not sold, not used for advertising, and not shared.

## Analytics and tracking

None.

## Permissions

- **identity:** sign in with Google.
- **storage:** remember your settings and last results locally.
- **Optional site access:** read sitemaps of the site you scan; asked per site.

## Contact

Open an issue: [github.com/emran-alhaddad/indexed_pages_finder_extension/issues](https://github.com/emran-alhaddad/indexed_pages_finder_extension/issues)
