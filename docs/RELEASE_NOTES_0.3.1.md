# Meeting Notes 0.3.1 community beta

## Fixed

- Waits for the hidden audio recorder to finish loading before asking it to start microphone capture.
- Checks macOS microphone permission before beginning a recording and reports a specific settings error when access is unavailable.
- Reports recorder page load, crash, and unresponsive failures instead of ending with a generic timeout.
- Extends the microphone startup window to 30 seconds for Macs that take longer to complete the first privacy check.
- Detects an active Zoom meeting from Zoom's meeting-only media process without relying on menu text or Accessibility access.
- Includes the macOS Automation entitlement required to inspect Google Meet tabs and shows a permission diagnostic instead of silently remaining on "Looking for...".

## Verification

- Unit tests pass.
- A controlled macOS recording produced microphone audio, an offline transcript, and a calendar file.

This community build remains ad-hoc signed rather than Apple-notarized. On first launch, right-click the app and choose Open if macOS displays a verification warning.
