#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
RUNTIME="$ROOT/resources/runtime/mac"
INSTALLED_RUNTIME="$HOME/Library/Application Support/MeetingNotesToOutlook/runtime"
INSTALLER_RUNTIME="$ROOT/../meeting-notes-to-outlook/dist/Zoom Transcript Monitor Installer.app/Contents/Resources/meeting-notes-to-outlook"
PROJECT_RUNTIME="$ROOT/../meeting-notes-to-outlook"
HELPER_APP="$RUNTIME/bin/MeetingNotesSystemRecorder.app"

SOURCE_RUNTIME=""
for candidate in "$INSTALLED_RUNTIME" "$INSTALLER_RUNTIME" "$PROJECT_RUNTIME"; do
  if [[ -x "$candidate/bin/whisper-runtime/bin/whisper-cli" && -f "$candidate/models/ggml-base.en.bin" ]]; then
    SOURCE_RUNTIME="$candidate"
    break
  fi
done

if [[ -z "$SOURCE_RUNTIME" ]]; then
  print -u2 -r -- "A usable local Whisper runtime was not found."
  print -u2 -r -- "Build whisper.cpp or place whisper-cli and ggml-base.en.bin under resources/runtime/mac."
  exit 1
fi

rm -rf "$RUNTIME"
mkdir -p "$RUNTIME/bin" "$RUNTIME/models" "$HELPER_APP/Contents/MacOS"
cp "$ROOT/native/macos/MeetingNotesSystemRecorder-Info.plist" "$HELPER_APP/Contents/Info.plist"
if ! CLANG_MODULE_CACHE_PATH="${TMPDIR%/}/meeting-notes-clang-cache" swiftc "$ROOT/native/macos/system-audio-recorder.swift" \
  -o "$HELPER_APP/Contents/MacOS/meeting-notes-system-recorder"; then
  PREBUILT_HELPER="$SOURCE_RUNTIME/bin/MeetingSystemAudioRecorder.app/Contents/MacOS/system-audio-recorder"
  if [[ ! -x "$PREBUILT_HELPER" ]]; then
    print -u2 -r -- "The Swift toolchain failed and no prebuilt ScreenCaptureKit helper is available."
    exit 1
  fi
  cp "$PREBUILT_HELPER" "$HELPER_APP/Contents/MacOS/meeting-notes-system-recorder"
  print -r -- "Used the existing compiled ScreenCaptureKit helper because the local Swift SDK is mismatched."
fi
codesign --force --sign - "$HELPER_APP" >/dev/null

cp "$ROOT/native/macos/transcribe-audio.zsh" "$RUNTIME/transcribe-audio.zsh"
mkdir -p "$RUNTIME/bin/whisper-runtime/bin"
cp "$SOURCE_RUNTIME/bin/whisper-runtime/bin/whisper-cli" "$RUNTIME/bin/whisper-runtime/bin/whisper-cli"
if [[ -d "$SOURCE_RUNTIME/bin/whisper-runtime/lib" ]]; then
  cp -R "$SOURCE_RUNTIME/bin/whisper-runtime/lib" "$RUNTIME/bin/whisper-runtime/lib"
fi
if [[ -d "$SOURCE_RUNTIME/bin/whisper-runtime/libexec" ]]; then
  cp -R "$SOURCE_RUNTIME/bin/whisper-runtime/libexec" "$RUNTIME/bin/whisper-runtime/libexec"
fi
cp "$SOURCE_RUNTIME/models/ggml-base.en.bin" "$RUNTIME/models/ggml-base.en.bin"
if [[ -f "$SOURCE_RUNTIME/models/ggml-small.en-tdrz.bin" ]]; then
  cp "$SOURCE_RUNTIME/models/ggml-small.en-tdrz.bin" "$RUNTIME/models/ggml-small.en-tdrz.bin"
elif [[ -f "$ROOT/.cache/ggml-small.en-tdrz.bin" ]]; then
  cp "$ROOT/.cache/ggml-small.en-tdrz.bin" "$RUNTIME/models/ggml-small.en-tdrz.bin"
else
  print -u2 -r -- "Speaker turn model missing. Download ggml-small.en-tdrz.bin into $ROOT/.cache first."
  exit 1
fi
chmod +x "$RUNTIME/transcribe-audio.zsh"

print -r -- "Prepared macOS runtime from: $SOURCE_RUNTIME"
print -r -- "Runtime output: $RUNTIME"
