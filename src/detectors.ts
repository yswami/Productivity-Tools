import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DetectionSnapshot, MeetingPlatform } from "./types";

const execFileAsync = promisify(execFile);

async function macProcessExists(name: string): Promise<boolean> {
  try {
    await execFileAsync("/usr/bin/pgrep", ["-x", name], { timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

function cleanTitle(value: string, platform: MeetingPlatform): string {
  return value
    .replace(/\s*[-|]\s*(Google Meet|Microsoft Teams|Zoom Workplace|Zoom)\s*$/i, "")
    .replace(/^Meeting controls\s*[-|]\s*/i, "")
    .trim() || `${platform === "google-meet" ? "Google Meet" : platform === "microsoft-teams" ? "Microsoft Teams" : "Zoom"} Meeting`;
}

async function detectMac(): Promise<DetectionSnapshot> {
  // Zoom creates CptHost only while meeting media is active. This avoids
  // depending on localized menu text or macOS Accessibility permission.
  if (await macProcessExists("CptHost")) {
    return {
      active: true,
      platform: "zoom",
      title: "Zoom Meeting",
      confidence: "high",
      evidence: "Zoom meeting media process"
    };
  }

  const script = String.raw`
on run
  tell application "System Events"
    if exists process "zoom.us" then
      tell process "zoom.us"
        try
          set menuNames to {}
          repeat with menuBarItem in menu bar items of menu bar 1
            try
              set menuNames to menuNames & (name of menu items of menu 1 of menuBarItem)
            end try
          end repeat
          set flatItems to menuNames as text
          if flatItems contains "Leave Meeting" or flatItems contains "End Meeting" or flatItems contains "Leave Webinar" or flatItems contains "End Webinar" then
            set candidate to "Zoom Meeting"
            try
              repeat with windowName in (name of every window)
                if windowName is not "" and windowName does not contain "Zoom Workplace" then
                  set candidate to windowName as text
                  exit repeat
                end if
              end repeat
            end try
            return "zoom" & tab & candidate & tab & "high" & tab & "Zoom meeting controls"
          end if
        end try
      end tell
    end if

    repeat with processName in {"Microsoft Teams", "MSTeams", "Microsoft Teams (work or school)"}
      if exists process processName then
        tell process processName
          try
            repeat with windowName in (name of every window)
              set titleText to windowName as text
              if titleText contains "Meeting" or titleText contains "Call" then
                return "microsoft-teams" & tab & titleText & tab & "high" & tab & "Teams meeting window"
              end if
            end repeat
          end try
        end tell
      end if
    end repeat
  end tell

  tell application "Google Chrome"
    if it is running then
      repeat with browserWindow in windows
        repeat with browserTab in tabs of browserWindow
          set tabUrl to URL of browserTab
          set tabTitle to title of browserTab
          if tabUrl contains "meet.google.com/" and tabUrl does not contain "/landing" then
            return "google-meet" & tab & tabTitle & tab & "possible" & tab & "Google Meet browser tab"
          end if
          if tabUrl contains "teams.microsoft.com/" and (tabTitle contains "Meeting" or tabTitle contains "Call") then
            return "microsoft-teams" & tab & tabTitle & tab & "possible" & tab & "Teams browser tab"
          end if
        end repeat
      end repeat
    end if
  end tell
  return "none" & tab & "" & tab & "none" & tab & ""
end run`;

  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", script], { timeout: 5000 });
    return parseDetectorOutput(stdout);
  } catch (error) {
    return { active: false, confidence: "none", evidence: `macOS detector unavailable: ${String(error)}` };
  }
}

async function detectWindows(): Promise<DetectionSnapshot> {
  const script = String.raw`
$candidates = Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | ForEach-Object {
  [PSCustomObject]@{ Name = $_.ProcessName; Title = $_.MainWindowTitle }
}
$zoom = $candidates | Where-Object { $_.Name -match 'Zoom' -and $_.Title -match 'Meeting|Webinar|Zoom Meeting' } | Select-Object -First 1
if ($zoom) { Write-Output (@("zoom", $zoom.Title, "high", "Zoom meeting window") -join [char]9); exit }
$teams = $candidates | Where-Object { $_.Name -match 'Teams|ms-teams' -and $_.Title -match 'Meeting|Call' } | Select-Object -First 1
if ($teams) { Write-Output (@("microsoft-teams", $teams.Title, "high", "Teams meeting window") -join [char]9); exit }
$meet = $candidates | Where-Object { $_.Name -match 'chrome|msedge' -and $_.Title -match 'Google Meet|Meet -' } | Select-Object -First 1
if ($meet) { Write-Output (@("google-meet", $meet.Title, "possible", "Google Meet active browser tab") -join [char]9); exit }
Write-Output (@("none", "", "none", "") -join [char]9)`;

  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 5000 });
    return parseDetectorOutput(stdout);
  } catch (error) {
    return { active: false, confidence: "none", evidence: `Windows detector unavailable: ${String(error)}` };
  }
}

function parseDetectorOutput(output: string): DetectionSnapshot {
  const [platformText, rawTitle = "", confidenceText = "none", evidence = ""] = output.trim().split("\t");
  if (!(["zoom", "google-meet", "microsoft-teams"] as string[]).includes(platformText)) {
    return { active: false, confidence: "none" };
  }
  const platform = platformText as MeetingPlatform;
  const confidence = confidenceText === "high" ? "high" : "possible";
  return { active: true, platform, title: cleanTitle(rawTitle, platform), confidence, evidence };
}

export async function detectMeeting(): Promise<DetectionSnapshot> {
  if (process.platform === "darwin") return detectMac();
  if (process.platform === "win32") return detectWindows();
  return { active: false, confidence: "none", evidence: "Unsupported platform" };
}

export const detectorInternals = { cleanTitle, parseDetectorOutput };
