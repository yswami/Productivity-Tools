# Meeting Notes

Published in the `Productivity-Tools` repository.

Meeting Notes is a private desktop meeting recorder for Zoom, Google Meet, and Microsoft Teams. It captures microphone and meeting-system audio, transcribes locally with `whisper.cpp`, keeps a searchable local meeting library, and can create an Outlook-compatible calendar event without an LLM.

This project is separate from `meeting-notes-to-outlook`; installing or testing it does not replace the existing Zoom monitor.

## Privacy defaults

- Audio and transcripts remain on the computer.
- No GPT or cloud transcription is used.
- Anonymous reliability events are off until the user explicitly opts in.
- Reliability events never contain meeting content, names, audio, transcripts, calendar content, or file paths.
- Raw audio is deleted after 24 hours by default.
- Transcripts are retained unless the user changes that policy.
- An active recording is always visible in the app.

Users are responsible for following applicable recording-consent laws and company policies.

## Calendar behavior

After transcription, the app opens an Outlook-compatible `.ics` event containing the actual start/end time and the full transcript in its body. The user confirms Save in Outlook. This avoids Graph API, OAuth, SSO consent, and LLM usage while still creating the event in the Outlook account already configured on the computer.

## Notes and speakers

Click any meeting row to read its complete transcript inside the app. The readable HTML file and meeting folder are also available from that view.

The bundled `small.en-tdrz` Whisper model detects speaker changes locally. Meeting/system audio is shown as anonymous `Speaker 1` and `Speaker 2` turns, while the microphone track is labelled `You`. This is experimental turn detection, not voice identification: labels may alternate incorrectly when people interrupt one another, and the app does not infer real names.

## Development

```sh
npm install
./scripts/prepare-macos-runtime.zsh
npm run test:unit
npm run dev
```

## Packaging

Build the macOS package on macOS:

```sh
npm run pack:mac
```

Build the Windows NSIS installer and portable executable on Windows:

```powershell
./scripts/prepare-windows-runtime.ps1
npm run pack:win
```

For an unsigned package test from macOS, the official prebuilt Windows Whisper runtime can be staged with:

```sh
npm run prepare:win-on-mac
npm run pack:win
```

The GitHub Actions workflow builds both platforms on native runners. This matters because cross-platform packagers cannot reliably compile and sign native macOS and Windows components from one host.

The local artifacts are unsigned development builds. Public distribution without Gatekeeper or SmartScreen warnings requires identity-verified signing accounts. Certificates and private keys must stay in the developer's Keychain, Windows certificate store, or CI secret store and must never be committed to this project.

The free community beta intentionally ships unsigned or ad-hoc-signed builds. Testers may need to right-click and choose Open on macOS or acknowledge SmartScreen on Windows. Official Apple notarization and commercial Windows signing are optional future expenses, not requirements for building or testing the app.

For macOS, enroll in the Apple Developer Program, install a `Developer ID Application` certificate in Keychain, and save notarization credentials with `xcrun notarytool store-credentials`. Then run:

```sh
APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)" \
APPLE_NOTARY_PROFILE="meeting-notes-notary" \
npm run pack:mac:signed
```

For Windows direct downloads, obtain an organization-validated code-signing certificate or configure Microsoft Artifact Signing. With a PFX stored outside this repository, run on Windows:

```powershell
$env:WIN_CSC_LINK = "C:\secure\meeting-notes-signing.pfx"
$securePassword = Read-Host "Certificate password" -AsSecureString
$env:WIN_CSC_KEY_PASSWORD = [Net.NetworkCredential]::new("", $securePassword).Password
npm run pack:win:signed
```

The current Mac artifact targets Apple Silicon; the Windows artifact targets x64.

## Detection behavior

- Zoom desktop: detects native meeting controls.
- Microsoft Teams desktop: detects meeting/call windows.
- Google Meet and Teams web: detects supported browser meeting tabs. Browser detections must remain stable before automatic capture begins.
- Manual capture remains available for unusual meeting layouts or locked-down browsers.

## Runtime permissions

macOS requires Microphone, Screen & System Audio Recording, Accessibility, and browser Automation access. Windows requires Microphone and screen/system-audio permission. The first capture prompts for any missing permission.

## Free community beta

Join the beta and request a download at [yswami.github.io/Productivity-Tools](https://yswami.github.io/Productivity-Tools/). Published builds and checksums are also available on the [GitHub Releases page](https://github.com/yswami/Productivity-Tools/releases/latest).

The `site` and `supabase` folders provide an optional, zero-cost beta distribution layer:

- GitHub Pages hosts the signup site and policies.
- Supabase Free provides passwordless signup, download-request records, and opt-in reliability events.
- GitHub Releases hosts the large Mac and Windows packages.
- The desktop app sends no analytics until the tester accepts the first-run consent prompt.

See [Community beta operations](docs/COMMUNITY_BETA.md) for setup and release instructions.
