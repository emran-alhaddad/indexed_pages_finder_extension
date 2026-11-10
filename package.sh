#!/bin/sh
# Builds dist/indexed-pages-finder-<version>.zip for the Chrome Web Store.
# manifest.json keeps "key" so unpacked builds get the store ID (needed for Google sign-in);
# the store rejects that field, so it is stripped from the zipped copy.
set -e
cd "$(dirname "$0")"

node test.js
grep -q 'YOUR_CLIENT_ID' manifest.json && { echo "Set oauth2.client_id in manifest.json first (see README Setup)."; exit 1; }

version=$(node -p 'require("./manifest.json").version')
out="$PWD/dist/indexed-pages-finder-$version.zip"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

cp -R background.js lib.js popup.html popup.js icons "$tmp/"
node -e 'const m=require("./manifest.json"); delete m.key; require("fs").writeFileSync(process.argv[1], JSON.stringify(m, null, 2) + "\n")' "$tmp/manifest.json"

mkdir -p dist
rm -f "$out"
(cd "$tmp" && zip -qr "$out" . -x "*.DS_Store")
echo "Built $out"
