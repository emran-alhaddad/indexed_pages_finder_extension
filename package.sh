#!/bin/sh
# Builds dist/indexed-pages-finder-<version>.zip for the Chrome Web Store.
set -e
cd "$(dirname "$0")"

node test.js
grep -q 'YOUR_CLIENT_ID' manifest.json && { echo "Set oauth2.client_id in manifest.json first (see README Setup)."; exit 1; }
grep -q '"key"' manifest.json && { echo 'Remove the "key" field from manifest.json; the store rejects it.'; exit 1; }

version=$(node -p 'require("./manifest.json").version')
out="dist/indexed-pages-finder-$version.zip"
mkdir -p dist
rm -f "$out"
zip -qr "$out" manifest.json background.js lib.js popup.html popup.js icons -x "*.DS_Store"
echo "Built $out"
