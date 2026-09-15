#!/bin/zsh
set -euo pipefail

APP="${1:?Pass the path to the macOS app bundle}"
ENTITLEMENTS="${2:-}"

# Re-sign every nested Mach-O first so macOS sees one consistent identity.
while IFS= read -r -d '' candidate; do
  if /usr/bin/file "$candidate" | /usr/bin/grep -q 'Mach-O'; then
    /usr/bin/codesign --force --options runtime --timestamp=none --sign - "$candidate"
  fi
done < <(/usr/bin/find "$APP/Contents" -type f -print0)

# Seal nested code containers from the deepest path outward.
while IFS= read -r bundle; do
  if [[ "$bundle" == *.app && -n "$ENTITLEMENTS" ]]; then
    /usr/bin/codesign --force --options runtime --timestamp=none --entitlements "$ENTITLEMENTS" --sign - "$bundle"
  else
    /usr/bin/codesign --force --options runtime --timestamp=none --sign - "$bundle"
  fi
done < <(/usr/bin/find "$APP/Contents" -depth -type d \( -name '*.framework' -o -name '*.app' -o -name '*.xpc' \) -print)

if [[ -n "$ENTITLEMENTS" ]]; then
  /usr/bin/codesign --force --options runtime --timestamp=none --entitlements "$ENTITLEMENTS" --sign - "$APP"
else
  /usr/bin/codesign --force --options runtime --timestamp=none --sign - "$APP"
fi

/usr/bin/codesign --verify --deep --strict --verbose=2 "$APP"
