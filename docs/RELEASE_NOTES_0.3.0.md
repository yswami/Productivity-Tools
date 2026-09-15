# Meeting Notes 0.3.0 community beta

## Highlights

- Records supported Zoom, Google Meet, and Microsoft Teams meetings.
- Transcribes microphone and system audio offline with bundled Whisper models.
- Opens full transcripts from each meeting row.
- Uses anonymous Speaker 1 and Speaker 2 turn labels when the diarization model detects a change.
- Creates an Outlook-compatible calendar file containing the complete transcript.
- Deletes raw audio after the configured retention period.
- Adds optional, content-free reliability reporting with explicit first-run consent.
- Adds an in-app GitHub release update check.

## Privacy

Audio, transcripts, meeting titles, participant names, calendar content, and local file paths stay on the computer. Reliability reporting is disabled until accepted and can be disabled in Settings.

## Free build warnings

This community build is not notarized by Apple or commercially signed for Windows. On macOS, unzip the application, move it to Applications, then right-click and choose Open on first launch. On Windows, review and acknowledge the SmartScreen warning only if the downloaded file's SHA-256 checksum matches the published release checksum.

## Checksums

Generate release checksums with `npm run release:checksums` and publish the resulting `release/SHA256SUMS.txt` beside the installers.
