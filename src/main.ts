import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, desktopCapturer, ipcMain, Notification, session, shell, systemPreferences } from "electron";
import { AudioCapture } from "./audio-capture";
import { BetaServices } from "./beta-services";
import { detectMeeting } from "./detectors";
import { writeCalendarFile } from "./ics";
import { MacSystemAudioCapture } from "./mac-system-audio";
import { applyAudioRetention } from "./retention";
import { MeetingStore } from "./store";
import { AppSnapshot, DetectionSnapshot, MeetingPlatform, MeetingRecord } from "./types";
import { OfflineTranscriber } from "./transcriber";

let mainWindow: BrowserWindow | undefined;
let store: MeetingStore;
let audioCapture: AudioCapture;
let macSystemCapture: MacSystemAudioCapture;
let transcriber: OfflineTranscriber;
let betaServices: BetaServices;
let activeMeeting: MeetingRecord | undefined;
let detection: DetectionSnapshot = { active: false, confidence: "none" };
let detectionCandidate = "";
let detectionCount = 0;
let absentSince = 0;
let transitionBusy = false;

function projectRoot(): string {
  return app.isPackaged ? app.getAppPath() : path.resolve(__dirname, "..");
}

function runtimeDirectory(): string {
  const platformName = process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : process.platform;
  return app.isPackaged
    ? path.join(process.resourcesPath, "runtime")
    : path.join(projectRoot(), "resources", "runtime", platformName);
}

function modelDirectory(): string {
  return path.join(runtimeDirectory(), "models");
}

function rendererDirectory(): string {
  return path.join(__dirname, "renderer");
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "Meeting";
}

function sessionDirectory(title: string, start: Date): string {
  const timestamp = start.toISOString().replace("T", " ").replace(/:/g, ".").replace(/\.\d{3}Z$/, "");
  return path.join(app.getPath("userData"), "Meetings", `${timestamp} ${safeFileName(title)}`);
}

function snapshot(): AppSnapshot {
  return {
    detection,
    activeMeeting,
    meetings: store.meetings,
    settings: store.settings,
    platform: process.platform,
    runtimeReady: transcriber.ready(),
    telemetryConfigured: betaServices.telemetryConfigured
  };
}

function broadcast(): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("app:snapshot", snapshot());
}

function notify(title: string, body: string): void {
  if (Notification.isSupported()) new Notification({ title, body }).show();
}

async function startMeeting(title: string, platform: MeetingPlatform): Promise<MeetingRecord> {
  if (activeMeeting) return activeMeeting;
  transitionBusy = true;
  const started = new Date();
  const directory = sessionDirectory(title, started);
  fs.mkdirSync(directory, { recursive: true });
  const id = `${started.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  const microphoneFile = path.join(directory, process.platform === "win32" ? "meeting-audio.wav" : "microphone-audio.wav");
  const systemAudioFile = process.platform === "darwin" ? path.join(directory, "system-audio.m4a") : undefined;
  const meeting: MeetingRecord = {
    id,
    platform,
    title: safeFileName(title),
    startedAt: started.toISOString(),
    status: "recording",
    directory,
    microphoneFile,
    systemAudioFile
  };
  activeMeeting = meeting;
  store.add(meeting);
  broadcast();

  try {
    if (process.platform === "darwin") {
      const status = systemPreferences.getMediaAccessStatus("microphone");
      if (status === "not-determined") {
        const granted = await systemPreferences.askForMediaAccess("microphone");
        if (!granted) throw new Error("Microphone access was not granted. Enable Meeting Notes in System Settings > Privacy & Security > Microphone.");
      } else if (status !== "granted") {
        throw new Error(`Microphone access is ${status}. Enable Meeting Notes in System Settings > Privacy & Security > Microphone.`);
      }
    }
    await audioCapture.start({ sessionId: id, outputFile: microphoneFile, includeSystemAudio: process.platform === "win32" });
    if (process.platform === "darwin" && systemAudioFile && macSystemCapture.available()) {
      try {
        await macSystemCapture.start(systemAudioFile);
      } catch (error) {
        meeting.captureWarning = `System audio unavailable: ${String(error)}`;
        store.update(id, { captureWarning: meeting.captureWarning });
        notify("Meeting Notes", "Microphone recording started, but system audio needs permission.");
      }
    }
    notify("Meeting Notes", `Recording ${meeting.title}`);
    void betaServices.capture("recording_started", { platform });
    return meeting;
  } catch (error) {
    audioCapture.abort();
    activeMeeting = undefined;
    store.update(id, { status: "failed", error: String(error), endedAt: new Date().toISOString() });
    void betaServices.capture("recording_failed", { stage: "capture", platform });
    broadcast();
    throw error;
  } finally {
    transitionBusy = false;
  }
}

async function stopMeeting(): Promise<MeetingRecord | undefined> {
  if (!activeMeeting || transitionBusy) return activeMeeting;
  transitionBusy = true;
  const meeting = activeMeeting;
  try {
    if (process.platform === "darwin") await macSystemCapture.stop();
    await audioCapture.stop();
    const endedAt = new Date().toISOString();
    meeting.endedAt = endedAt;
    meeting.status = "transcribing";
    store.update(meeting.id, meeting);
    activeMeeting = undefined;
    broadcast();

    const result = await transcriber.transcribeMeeting(meeting);
    meeting.transcriptFile = result.textFile;
    meeting.transcriptHtmlFile = result.htmlFile;
    meeting.status = "ready";
    void betaServices.capture("recording_completed", {
      platform: meeting.platform,
      duration_minutes: Math.max(1, Math.round((Date.parse(endedAt) - Date.parse(meeting.startedAt)) / 60000))
    });
    void betaServices.capture("transcription_completed", { platform: meeting.platform });
    if (store.settings.createCalendarFile) {
      meeting.calendarFile = writeCalendarFile(meeting);
      void betaServices.capture("calendar_created", { platform: meeting.platform });
    }
    store.update(meeting.id, meeting);
    notify("Meeting Notes", `Transcript ready: ${meeting.title}`);
    if (meeting.calendarFile) await shell.openPath(meeting.calendarFile);
    return meeting;
  } catch (error) {
    meeting.status = "failed";
    meeting.error = String(error);
    meeting.endedAt ??= new Date().toISOString();
    store.update(meeting.id, meeting);
    activeMeeting = undefined;
    notify("Meeting Notes", `Capture needs attention: ${meeting.title}`);
    void betaServices.capture("transcription_failed", { platform: meeting.platform });
    return meeting;
  } finally {
    transitionBusy = false;
    broadcast();
  }
}

async function pollDetection(): Promise<void> {
  if (transitionBusy) return;
  detection = await detectMeeting();
  const key = detection.active ? `${detection.platform}:${detection.title}` : "";
  if (key && key === detectionCandidate) detectionCount += 1;
  else {
    detectionCandidate = key;
    detectionCount = key ? 1 : 0;
  }

  if (!activeMeeting) {
    absentSince = 0;
    const settings = store.settings;
    const enabled = detection.platform && settings.enabledPlatforms.includes(detection.platform);
    const stable = detection.confidence === "high" || detectionCount >= 3;
    if (settings.autoCapture && detection.active && enabled && stable) {
      await startMeeting(detection.title ?? "Meeting", detection.platform!);
    }
  } else if (detection.active && detection.platform === activeMeeting.platform) {
    absentSince = 0;
  } else {
    absentSince ||= Date.now();
    if (Date.now() - absentSince >= store.settings.endGraceSeconds * 1000) {
      absentSince = 0;
      await stopMeeting();
    }
  }
  broadcast();
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 820,
    minHeight: 600,
    backgroundColor: "#f5f7f8",
    title: "Meeting Notes",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  void mainWindow.loadFile(path.join(rendererDirectory(), "index.html"));
}

function configureWindowsLoopback(): void {
  if (process.platform !== "win32") return;
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ["screen"] });
    callback({ video: sources[0], audio: "loopback" });
  });
}

function registerIpc(): void {
  ipcMain.handle("app:snapshot", () => snapshot());
  ipcMain.handle("meeting:start", (_event, payload: { title?: string; platform?: MeetingPlatform }) =>
    startMeeting(payload.title?.trim() || "Manual Meeting", payload.platform || "manual"));
  ipcMain.handle("meeting:stop", () => stopMeeting());
  ipcMain.handle("meeting:details", (_event, id: string) => {
    const meeting = store.meetings.find((candidate) => candidate.id === id);
    if (!meeting) throw new Error("Meeting not found.");
    const transcript = meeting.transcriptFile && fs.existsSync(meeting.transcriptFile)
      ? fs.readFileSync(meeting.transcriptFile, "utf8")
      : meeting.status === "failed"
        ? `Transcript failed: ${meeting.error || "Unknown error"}`
        : "The transcript is not ready yet.";
    return { meeting, transcript };
  });
  ipcMain.handle("settings:update", (_event, patch) => {
    const previouslyEnabled = store.settings.telemetryConsent;
    store.updateSettings(patch);
    if (!previouslyEnabled && store.settings.telemetryConsent) void betaServices.capture("telemetry_enabled");
    broadcast();
    return store.settings;
  });
  ipcMain.handle("app:check-updates", () => betaServices.checkForUpdates());
  ipcMain.handle("app:open-external", (_event, url: string) => {
    if (!/^https:\/\//.test(url)) throw new Error("Only HTTPS links are allowed.");
    return shell.openExternal(url);
  });
  ipcMain.handle("file:open", (_event, file: string) => shell.openPath(file));
  ipcMain.handle("folder:open", (_event, directory: string) => shell.openPath(directory));
}

app.whenReady().then(() => {
  const dataRoot = app.getPath("userData");
  store = new MeetingStore(dataRoot);
  betaServices = new BetaServices(store.installationId, () => store.settings.telemetryConsent);
  transcriber = new OfflineTranscriber(runtimeDirectory(), modelDirectory());
  audioCapture = new AudioCapture(rendererDirectory(), path.join(__dirname, "capture-preload.js"));
  macSystemCapture = new MacSystemAudioCapture(runtimeDirectory());
  configureWindowsLoopback();
  registerIpc();
  createMainWindow();
  void betaServices.capture("app_started");
  void pollDetection();
  setInterval(() => void pollDetection(), 5000);
  setInterval(() => applyAudioRetention(store.meetings, store.settings.audioRetentionHours), 5 * 60 * 1000);
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !activeMeeting) app.quit();
});
