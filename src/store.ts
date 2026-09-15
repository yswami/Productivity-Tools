import fs from "node:fs";
import path from "node:path";
import { AppSettings, MeetingRecord } from "./types";

const DEFAULT_SETTINGS: AppSettings = {
  autoCapture: true,
  enabledPlatforms: ["zoom", "google-meet", "microsoft-teams"],
  endGraceSeconds: 30,
  audioRetentionHours: 24,
  retainTranscripts: true,
  createCalendarFile: true,
  telemetryConsent: false,
  telemetryPromptSeen: false
};

interface StoredState {
  settings: AppSettings;
  meetings: MeetingRecord[];
  installationId: string;
}

export class MeetingStore {
  private readonly stateFile: string;
  private state: StoredState;

  constructor(private readonly rootDirectory: string) {
    fs.mkdirSync(rootDirectory, { recursive: true });
    this.stateFile = path.join(rootDirectory, "meeting-library.json");
    this.state = this.load();
    this.recoverInterruptedMeetings();
  }

  get settings(): AppSettings {
    return { ...this.state.settings, enabledPlatforms: [...this.state.settings.enabledPlatforms] };
  }

  get meetings(): MeetingRecord[] {
    return [...this.state.meetings].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  get installationId(): string {
    return this.state.installationId;
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    this.state.settings = { ...this.state.settings, ...patch };
    this.save();
    return this.settings;
  }

  add(meeting: MeetingRecord): void {
    this.state.meetings = [meeting, ...this.state.meetings.filter((item) => item.id !== meeting.id)];
    this.save();
  }

  update(id: string, patch: Partial<MeetingRecord>): MeetingRecord | undefined {
    const meeting = this.state.meetings.find((item) => item.id === id);
    if (!meeting) return undefined;
    Object.assign(meeting, patch);
    this.save();
    return { ...meeting };
  }

  private load(): StoredState {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.stateFile, "utf8")) as Partial<StoredState>;
      return {
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        meetings: Array.isArray(parsed.meetings) ? parsed.meetings : [],
        installationId: typeof parsed.installationId === "string" && parsed.installationId
          ? parsed.installationId
          : crypto.randomUUID()
      };
    } catch {
      return { settings: { ...DEFAULT_SETTINGS }, meetings: [], installationId: crypto.randomUUID() };
    }
  }

  private save(): void {
    const temporary = `${this.stateFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2));
    fs.renameSync(temporary, this.stateFile);
  }

  private recoverInterruptedMeetings(): void {
    let changed = false;
    for (const meeting of this.state.meetings) {
      if (meeting.status === "recording" || meeting.status === "transcribing") {
        meeting.status = "failed";
        meeting.endedAt ??= new Date().toISOString();
        meeting.error = "Capture was interrupted when Meeting Notes closed.";
        changed = true;
      }
    }
    if (changed) this.save();
  }
}
