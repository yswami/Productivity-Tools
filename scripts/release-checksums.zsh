#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
OUTPUT="$ROOT/release/SHA256SUMS.txt"
VERSION="$(node -p "require('$ROOT/package.json').version")"
FILES=(
  "$ROOT/release/Meeting Notes-${VERSION}-arm64-mac.zip"
  "$ROOT/release/Meeting Notes-${VERSION}-Windows-Setup-x64.exe"
  "$ROOT/release/Meeting Notes-${VERSION}-Windows-Portable-x64.exe"
)

for file in "${FILES[@]}"; do
  [[ -f "$file" ]] || { print -u2 -r -- "Missing release file: $file"; exit 1; }
done

cd "$ROOT/release"
/usr/bin/shasum -a 256 "${FILES[@]:t}" > "$OUTPUT"
print -r -- "Wrote $OUTPUT"
