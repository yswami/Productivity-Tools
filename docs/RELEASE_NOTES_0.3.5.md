# Meeting Notes 0.3.5

## Fixed

- Manual recordings now continue until the user presses Stop.
- Automatic meeting-disappearance detection only stops recordings that were started automatically.
- Manually starting a recording with Zoom, Google Meet, or Teams selected no longer makes it detector-controlled.

## Verification

- Manual recording was kept active beyond the configured automatic end grace period.
- Auto-detected meetings still stop after the meeting disappears.
