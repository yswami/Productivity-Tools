#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
WHISPER_CLI="$SCRIPT_DIR/bin/whisper-runtime/bin/whisper-cli"
MODEL_FILE="${WHISPER_MODEL_FILE:-$SCRIPT_DIR/models/ggml-base.en.bin}"
BACKEND_DIR="$SCRIPT_DIR/bin/whisper-runtime/libexec"

if [[ -z "${GGML_BACKEND_PATH:-}" && -d "$BACKEND_DIR" ]]; then
  cpu_brand="$(/usr/sbin/sysctl -n machdep.cpu.brand_string 2>/dev/null || true)"
  case "$cpu_brand" in
    *M1*) backend_file="$BACKEND_DIR/libggml-cpu-apple_m1.so" ;;
    *M4*) backend_file="$BACKEND_DIR/libggml-cpu-apple_m4.so" ;;
    *M2*|*M3*) backend_file="$BACKEND_DIR/libggml-cpu-apple_m2_m3.so" ;;
    *) backend_file="$BACKEND_DIR/libggml-cpu-apple_m2_m3.so" ;;
  esac
  if [[ -f "$backend_file" ]]; then
    export GGML_BACKEND_PATH="$backend_file"
  fi
fi

if [[ -z "${AUDIO_FILE:-}" || -z "${TRANSCRIPT_FILE:-}" ]]; then
  print -u2 -r -- "AUDIO_FILE and TRANSCRIPT_FILE must be set"
  exit 2
fi
if [[ ! -x "$WHISPER_CLI" || ! -f "$MODEL_FILE" ]]; then
  print -u2 -r -- "The bundled offline Whisper runtime is incomplete."
  exit 1
fi

WORK_DIR="${SESSION_DIR:-${TRANSCRIPT_FILE:h}}/.meeting-notes-whisper-${RANDOM}"
WAV_FILE="$WORK_DIR/input.wav"
RAW_TRANSCRIPT="$WORK_DIR/transcript.raw.txt"
mkdir -p "$WORK_DIR" "${TRANSCRIPT_FILE:h}"

cleanup() { rm -rf "$WORK_DIR" }

if ! /usr/bin/afconvert "$AUDIO_FILE" "$WAV_FILE" -f WAVE -d LEI16@16000 -c 1; then
  cleanup
  exit 1
fi
whisper_args=(-m "$MODEL_FILE" -f "$WAV_FILE" -l en -sns -np -ng)
[[ "${WHISPER_TINY_DIARIZE:-0}" == "1" ]] && whisper_args+=(-tdrz)
if ! "$WHISPER_CLI" "${whisper_args[@]}" > "$RAW_TRANSCRIPT"; then
  cleanup
  exit 1
fi

if [[ ! -s "$RAW_TRANSCRIPT" ]]; then
  print -u2 -r -- "Whisper did not produce transcript text."
  cleanup
  exit 1
fi

/usr/bin/awk '
  {
    cleaned = $0
    gsub(/\[[0-9:.[:space:]-]+--?>[0-9:.[:space:]-]+\]/, "", cleaned)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", cleaned)
    lower = tolower(cleaned)
    if (lower == "" || lower == "[blank_audio]" || lower == "[blank audio]" ||
        lower == "(beep)" || lower == "(inaudible)" || lower == "[inaudible]" ||
        lower == "[music]" || lower == "[noise]") next
    print cleaned
  }
' "$RAW_TRANSCRIPT" > "$TRANSCRIPT_FILE"

[[ -s "$TRANSCRIPT_FILE" ]] || print -r -- "No clear speech detected in this audio track." > "$TRANSCRIPT_FILE"
cleanup
