# Contributing

Thanks for your interest in contributing! This project welcomes issues and pull requests.

## How to Contribute

- Open an issue first for significant changes to discuss approach and scope
- Keep PRs small, focused, and easy to review
- Use clear commit messages and describe user-visible behavior changes

## Local Setup

- Load the extension via `chrome://extensions` → `Load unpacked`
- Edit `popup.html`, `popup.js`, and `background.js`
- Use DevTools (Inspect popup and service worker) for debugging

## Coding Style

- Vanilla JS/HTML/CSS
- Keep changes minimal; match existing patterns and naming
- Avoid introducing new build tooling or dependencies

## Testing

- Validate manual flows: start, retries on 429, background persistence, export JSON
- Verify JSON grouping by multiple domains

## Pull Request Checklist

- Linked issue (if applicable)
- Screenshots / JSON samples for UX/data changes
- Minimal surface area: only touch relevant files

## Releases

- Bump version in `manifest.json` when preparing a release
- Provide brief release notes (what changed, why it matters)

## Code of Conduct

This project adheres to the Contributor Covenant. See CODE_OF_CONDUCT.md.

