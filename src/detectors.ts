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

async function runMacDetectorScript(script: string): Promise<DetectionSnapshot | undefined> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", script], { timeout: 3000 });
    const result = parseDetectorOutput(stdout);
    return result.active ? result : undefined;
  } catch {
    return undefined;
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

  const teamsScript = String.raw`
on run
  tell application "System Events"
    repeat with processName in {"Microsoft Teams", "MSTeams", "Microsoft Teams (work or school)"}
      if exists process processName then
        tell process processName
          repeat with windowName in (name of every window)
            set titleText to windowName as text
            if titleText contains "Meeting" or titleText contains "Call" then
              return "microsoft-teams" & tab & titleText & tab & "high" & tab & "Teams meeting window"
            end if
          end repeat
        end tell
      end if
    end repeat
  end tell
  return "none" & tab & "" & tab & "none" & tab & ""
end run`;

  const teams = await runMacDetectorScript(teamsScript);
  if (teams) return teams;

  const browserScript = String.raw`
on run
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

  const browserMeeting = await runMacDetectorScript(browserScript);
  return browserMeeting ?? { active: false, confidence: "none" };
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
