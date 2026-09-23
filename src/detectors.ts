import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DetectionSnapshot, MeetingPlatform } from "./types";

const execFileAsync = promisify(execFile);

interface MacDetectorResult {
  detection?: DetectionSnapshot;
  error?: string;
}

async function macProcessExists(name: string): Promise<boolean> {
  try {
    await execFileAsync("/usr/bin/pgrep", ["-x", name], { timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

async function runMacDetectorScript(script: string, timeout = 3000): Promise<MacDetectorResult> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", script], { timeout });
    const result = parseDetectorOutput(stdout);
    return result.active ? { detection: result } : {};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const permissionDenied = /not authorized|not permitted|assistive access|(-1743)|(-25211)/i.test(message);
    return {
      error: permissionDenied
        ? "Auto-detection permission is unavailable. Allow Meeting Notes under Privacy & Security > Automation and Accessibility."
        : `Auto-detection check failed: ${message.split("\n")[0]}`
    };
  }
}

function cleanTitle(value: string, platform: MeetingPlatform): string {
  return value
    .replace(/\s*[-|]\s*(Brave|Google Chrome|Microsoft Edge|Safari|Firefox)\s*$/i, "")
    .replace(/\s*[-|]\s*(Google Meet|Microsoft Teams|Zoom Workplace|Zoom)\s*$/i, "")
    .replace(/^Meeting controls\s*[-|]\s*/i, "")
    .trim() || `${platform === "google-meet" ? "Google Meet" : platform === "microsoft-teams" ? "Microsoft Teams" : "Zoom"} Meeting`;
}

async function detectMac(windowTitles: string[]): Promise<DetectionSnapshot> {
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

  const visibleMeeting = detectWindowTitles(windowTitles);
  if (visibleMeeting.active) return visibleMeeting;

  const browserScripts = [
    chromiumBrowserScript("Google Chrome"),
    chromiumBrowserScript("Brave Browser"),
    chromiumBrowserScript("Microsoft Edge"),
    safariBrowserScript()
  ];
  let detectorError = "";
  const browserResults = await Promise.all(browserScripts.map((script) => runMacDetectorScript(script, 10_000)));
  for (const browser of browserResults) {
    if (browser.detection) return browser.detection;
    detectorError ||= browser.error ?? "";
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
  if (teams.detection) return teams.detection;
  detectorError ||= teams.error ?? "";
  return { active: false, confidence: "none", evidence: detectorError || undefined };
}

function chromiumBrowserScript(applicationName: string): string {
  return String.raw`
on run
  tell application "${applicationName}"
    if it is running then
      repeat with browserWindow in windows
        repeat with browserTab in tabs of browserWindow
          set tabUrl to URL of browserTab
          set tabTitle to title of browserTab
          if tabUrl contains "meet.google.com/" and tabUrl does not contain "/landing" then
            return "google-meet" & tab & tabTitle & tab & "high" & tab & "Google Meet call tab in ${applicationName}"
          end if
          if (tabUrl contains "teams.microsoft.com/" or tabUrl contains "teams.cloud.microsoft/") and (tabTitle contains "Meeting" or tabTitle contains "Call") then
            return "microsoft-teams" & tab & tabTitle & tab & "high" & tab & "Teams call tab in ${applicationName}"
          end if
        end repeat
      end repeat
    end if
  end tell
  return "none" & tab & "" & tab & "none" & tab & ""
end run`;
}

function safariBrowserScript(): string {
  return String.raw`
on run
  tell application "Safari"
    if it is running then
      repeat with browserWindow in windows
        repeat with browserTab in tabs of browserWindow
          set tabUrl to URL of browserTab
          set tabTitle to name of browserTab
          if tabUrl contains "meet.google.com/" and tabUrl does not contain "/landing" then
            return "google-meet" & tab & tabTitle & tab & "high" & tab & "Google Meet call tab in Safari"
          end if
          if (tabUrl contains "teams.microsoft.com/" or tabUrl contains "teams.cloud.microsoft/") and (tabTitle contains "Meeting" or tabTitle contains "Call") then
            return "microsoft-teams" & tab & tabTitle & tab & "high" & tab & "Teams call tab in Safari"
          end if
        end repeat
      end repeat
    end if
  end tell
  return "none" & tab & "" & tab & "none" & tab & ""
end run`;
}

function detectWindowTitles(windowTitles: string[]): DetectionSnapshot {
  for (const rawTitle of windowTitles) {
    const title = rawTitle.trim();
    if (/\bGoogle Meet\b|\bMeet\s*[-|]/i.test(title)) {
      return {
        active: true,
        platform: "google-meet",
        title: cleanTitle(title, "google-meet"),
        confidence: "high",
        evidence: "Visible Google Meet call window"
      };
    }
    if (/(Microsoft Teams|\bTeams\b).*(Meeting|Call)|(Meeting|Call).*(Microsoft Teams|\bTeams\b)/i.test(title)) {
      return {
        active: true,
        platform: "microsoft-teams",
        title: cleanTitle(title, "microsoft-teams"),
        confidence: "high",
        evidence: "Visible Microsoft Teams call window"
      };
    }
  }
  return { active: false, confidence: "none" };
}

async function detectWindows(): Promise<DetectionSnapshot> {
  const script = String.raw`
$candidates = Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | ForEach-Object {
  [PSCustomObject]@{ Name = $_.ProcessName; Title = $_.MainWindowTitle }
}
$zoom = $candidates | Where-Object { $_.Name -match 'Zoom' -and $_.Title -match 'Meeting|Webinar|Zoom Meeting' } | Select-Object -First 1
if ($zoom) { Write-Output (@("zoom", $zoom.Title, "high", "Zoom meeting window") -join [char]9); exit }
$teams = $candidates | Where-Object { $_.Title -match '(Microsoft Teams|Teams).*(Meeting|Call)|(Meeting|Call).*(Microsoft Teams|Teams)' } | Select-Object -First 1
if ($teams) { Write-Output (@("microsoft-teams", $teams.Title, "high", "Teams meeting window") -join [char]9); exit }
$meet = $candidates | Where-Object { $_.Title -match 'Google Meet|Meet -' } | Select-Object -First 1
if ($meet) { Write-Output (@("google-meet", $meet.Title, "high", "Visible Google Meet call window") -join [char]9); exit }
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

export async function detectMeeting(windowTitles: string[] = []): Promise<DetectionSnapshot> {
  if (process.platform === "darwin") return detectMac(windowTitles);
  if (process.platform === "win32") return detectWindows();
  return { active: false, confidence: "none", evidence: "Unsupported platform" };
}

export const detectorInternals = { cleanTitle, parseDetectorOutput, detectWindowTitles };
