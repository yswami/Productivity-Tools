# Meeting Notes 0.3.2 community beta

## Fixed

- Keeps the normal "Looking for Zoom, Google Meet, or Microsoft Teams..." status while idle.
- Runs Teams and browser meeting probes independently so one blocked permission cannot disable every detector.
- Preserves permission-free Zoom detection through Zoom's meeting media process.
- Uploads the large Windows release files sequentially for more reliable GitHub publishing.

## Verification

- All unit tests pass.
- The macOS detector returns a clean inactive result when no meeting is running.
- Zoom automatic recording was verified in the preceding 0.3.1 build and uses the same process-based detection path.
