#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
VERSION="$(node -p "require('$ROOT/package.json').version")"
APP="$ROOT/release/mac-arm64/Meeting Notes.app"
OUTPUT="$ROOT/release/Meeting Notes-${VERSION}-arm64-mac.zip"

cd "$ROOT"
npm run build
rm -rf "$ROOT/release/mac-arm64"
rm -f "$OUTPUT"
npx electron-builder --mac zip --arm64 --publish never

# Ad-hoc signing makes the development bundle internally valid. Public downloads
# still require Developer ID signing and notarization via pack:mac:signed.
"$ROOT/scripts/adhoc-sign-macos.zsh" "$APP" "$ROOT/build/entitlements.mac.plist"
rm -f "$OUTPUT"
/usr/bin/ditto -c -k --keepParent "$APP" "$OUTPUT"
print -r -- "Ad-hoc signed development package: $OUTPUT"
