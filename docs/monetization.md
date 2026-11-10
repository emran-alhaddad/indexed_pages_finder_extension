# Monetization plan

## Recommendation: freemium (free tier plus a Pro subscription)

**Free:** one site and up to 100 index checks per scan, which covers everything v3 does today.

**Pro, about $4/month or $29/year:**
- Unlimited sites, and checks up to Google's 2,000 per day.
- Scheduled scans (`chrome.alarms`) with alerts when a page drops out of Google's index.
- History: compare this scan with the last one to see new and lost pages.
- One-click export to Google Sheets.

**Payments:** [ExtensionPay](https://extensionpay.com) (Stripe underneath, no server needed, takes 5%). Setup takes about 1 hour.

**Rough math:** 1,000 weekly users × 2% who pay × $4 is about $80/month. It grows with users, and SEO tools convert better than average because people use them for work.

## Why not ads

- Ads inside the popup are allowed if disclosed, but a popup gets a few seconds of attention, so expect a few dollars a month.
- Injecting ads into websites, or replacing affiliate links, breaks Chrome Web Store policy and gets the extension removed.
- Ads also conflict with the privacy policy ("no tracking") and the Google API Limited Use rules, which ban using Google user data for ads.

## Other small income

- An affiliate link to an SEO tool (Ahrefs, Semrush) in a "Fix not-indexed pages" help link. It must be clearly labelled.
- A "Buy me a coffee" link in the popup footer. No risk, but low income.

## Order

1. Ship v3, pass Google OAuth verification, and get users.
2. Add history and scheduled alerts. These are what people will pay for.
3. Put them behind ExtensionPay.
