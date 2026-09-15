#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
VERSION="$(node -p "require('$ROOT/package.json').version")"
: "${APPLE_SIGNING_IDENTITY:?Set APPLE_SIGNING_IDENTITY to your Developer ID Application certificate name}"
: "${APPLE_NOTARY_PROFILE:?Set APPLE_NOTARY_PROFILE to your notarytool Keychain profile name}"

cd "$ROOT"
rm -rf release
CSC_NAME="$APPLE_SIGNING_IDENTITY" npx electron-builder --mac dir --arm64

APP="$ROOT/release/mac-arm64/Meeting Notes.app"
SUBMISSION="$ROOT/release/Meeting-Notes-notarization.zip"
FINAL="$ROOT/release/Meeting Notes-${VERSION}-arm64-mac-signed.zip"

/usr/bin/ditto -c -k --keepParent "$APP" "$SUBMISSION"
xcrun notarytool submit "$SUBMISSION" --keychain-profile "$APPLE_NOTARY_PROFILE" --wait
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
spctl --assess --type execute --verbose=2 "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
rm -f "$SUBMISSION"
/usr/bin/ditto -c -k --keepParent "$APP" "$FINAL"
print -r -- "Signed and notarized package: $FINAL"
