#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
RUNTIME="$ROOT/resources/runtime/win"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

rm -rf "$RUNTIME"
mkdir -p "$RUNTIME/bin" "$RUNTIME/models"

curl -L "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip" -o "$TEMP_DIR/whisper-win.zip"
unzip -q "$TEMP_DIR/whisper-win.zip" -d "$TEMP_DIR/whisper"
find "$TEMP_DIR/whisper" -type f \( -name 'whisper-cli.exe' -o -name '*.dll' \) -exec cp {} "$RUNTIME/bin/" \;

if [[ -f "$ROOT/resources/runtime/mac/models/ggml-base.en.bin" ]]; then
  cp "$ROOT/resources/runtime/mac/models/ggml-base.en.bin" "$RUNTIME/models/ggml-base.en.bin"
else
  curl -L "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin" -o "$RUNTIME/models/ggml-base.en.bin"
fi

if [[ -f "$ROOT/resources/runtime/mac/models/ggml-small.en-tdrz.bin" ]]; then
  cp "$ROOT/resources/runtime/mac/models/ggml-small.en-tdrz.bin" "$RUNTIME/models/ggml-small.en-tdrz.bin"
else
  curl -L "https://huggingface.co/akashmjn/tinydiarize-whisper.cpp/resolve/main/ggml-small.en-tdrz.bin" -o "$RUNTIME/models/ggml-small.en-tdrz.bin"
fi

[[ -f "$RUNTIME/bin/whisper-cli.exe" ]]
[[ -f "$RUNTIME/models/ggml-base.en.bin" ]]
[[ -f "$RUNTIME/models/ggml-small.en-tdrz.bin" ]]
echo "Prepared Windows runtime: $RUNTIME"
