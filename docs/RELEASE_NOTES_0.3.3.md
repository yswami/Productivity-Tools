# Meeting Notes 0.3.3

## Fixed

- Stops repeatedly displaying the macOS Screen Recording permission dialog.
- Checks Screen Recording access without prompting before starting the system-audio recorder.
- Automatically disables system-audio retries when macOS reports that access is unavailable.

## Changed

- System-audio recording on macOS is now an explicit Settings option. Existing granted installations continue capturing normally.
- Microphone-only recording continues normally when system audio is disabled or unavailable.

## Verification

- All 13 unit tests pass, including settings migration and persistence coverage.
- The native recorder reports `permission-denied` without invoking the macOS permission request.
- The packaged app contains the new permission handling and passes strict code-signature validation.
