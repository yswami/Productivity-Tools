# Meeting Notes 0.3.4

## Fixed

- Stops automatic capture after one startup failure for the same detected meeting instead of creating repeated failed rows.
- Retries hidden audio-recorder initialization once with a fresh window.
- Shows the startup error in the Capture status while keeping manual retry available.
- Collapses continuous historical recorder-startup failures in the library without deleting the underlying records.
- Signs the bundled Whisper executable with the required library entitlement.
- Bundles a coherent Whisper and GGML runtime so offline transcription no longer fails after recording.

## Verification

- Unit coverage verifies that repeated attempts remain blocked until the meeting ends or detection changes.
- Unit coverage verifies that only continuous startup retry bursts are collapsed.
- The packaged Whisper runtime successfully transcribed a recorded WAV file from inside the final app bundle.
- The macOS app is packaged only after the previous running instance has stopped.
