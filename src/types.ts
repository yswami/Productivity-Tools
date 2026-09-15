export type MeetingPlatform = "zoom" | "google-meet" | "microsoft-teams" | "manual";

export type MeetingStatus = "recording" | "transcribing" | "ready" | "failed";

export interface DetectionSnapshot {
  active: boolean;
  platform?: MeetingPlatform;
  title?: string;
  confidence: "none" | "possible" | "high";
  evidence?: string;
}

export interface MeetingRecord {
  id: string;
  platform: MeetingPlatform;
  title: string;
  startedAt: string;
  endedAt?: string;
  status: MeetingStatus;
  directory: string;
  microphoneFile?: string;
  systemAudioFile?: string;
  transcriptFile?: string;
  transcriptHtmlFile?: string;
  calendarFile?: string;
  captureWarning?: string;
  error?: string;
}

export interface AppSettings {
  autoCapture: boolean;
  enabledPlatforms: MeetingPlatform[];
  endGraceSeconds: number;
  audioRetentionHours: number;
  retainTranscripts: boolean;
  createCalendarFile: boolean;
  telemetryConsent: boolean;
  telemetryPromptSeen: boolean;
}

export interface AppSnapshot {
  detection: DetectionSnapshot;
  activeMeeting?: MeetingRecord;
  meetings: MeetingRecord[];
  settings: AppSettings;
  platform: NodeJS.Platform;
  runtimeReady: boolean;
  telemetryConfigured: boolean;
}

export interface UpdateCheckResult {
  configured: boolean;
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  error?: string;
}

export interface MeetingDetails {
  meeting: MeetingRecord;
  transcript: string;
}
