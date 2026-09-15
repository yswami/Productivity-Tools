import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { UpdateCheckResult } from "./types";

export type TelemetryEvent =
  | "app_started"
  | "telemetry_enabled"
  | "recording_started"
  | "recording_completed"
  | "recording_failed"
  | "transcription_completed"
  | "transcription_failed"
  | "calendar_created";

const EVENT_PROPERTIES: Record<TelemetryEvent, Set<string>> = {
  app_started: new Set(),
  telemetry_enabled: new Set(),
  recording_started: new Set(["platform"]),
  recording_completed: new Set(["platform", "duration_minutes"]),
  recording_failed: new Set(["platform", "stage"]),
  transcription_completed: new Set(["platform"]),
  transcription_failed: new Set(["platform"]),
  calendar_created: new Set(["platform"])
};

interface BetaConfig {
  telemetryEndpoint: string;
  releasesApiUrl: string;
  releasesPageUrl: string;
  privacyPolicyUrl: string;
}

const EMPTY_CONFIG: BetaConfig = {
  telemetryEndpoint: "",
  releasesApiUrl: "",
  releasesPageUrl: "",
  privacyPolicyUrl: ""
};

function loadConfig(): BetaConfig {
  const configuredPath = process.env.MEETING_NOTES_BETA_CONFIG;
  const file = configuredPath || (app.isPackaged
    ? path.join(process.resourcesPath, "beta-config.json")
    : path.join(app.getAppPath(), "build", "beta-config.json"));
  try {
    return { ...EMPTY_CONFIG, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return { ...EMPTY_CONFIG };
  }
}

function normalizeVersion(value: string): number[] {
  return value.replace(/^v/i, "").split(".").slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const left = normalizeVersion(candidate);
  const right = normalizeVersion(current);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}

export class BetaServices {
  private readonly config = loadConfig();

  constructor(
    private readonly installationId: string,
    private readonly hasConsent: () => boolean
  ) {}

  get telemetryConfigured(): boolean {
    return this.config.telemetryEndpoint.startsWith("https://");
  }

  get privacyPolicyUrl(): string {
    return this.config.privacyPolicyUrl;
  }

  async capture(event: TelemetryEvent, properties: Record<string, string | number | boolean> = {}): Promise<void> {
    if (!this.telemetryConfigured || !this.hasConsent()) return;
    const allowedProperties = EVENT_PROPERTIES[event];
    const safeProperties = Object.fromEntries(
      Object.entries(properties)
        .filter(([key, value]) => allowedProperties.has(key) && ["string", "number", "boolean"].includes(typeof value))
        .slice(0, 12)
    );
    try {
      await fetch(this.config.telemetryEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event,
          installation_id: this.installationId,
          app_version: app.getVersion(),
          platform: process.platform,
          architecture: process.arch,
          properties: safeProperties
        }),
        signal: AbortSignal.timeout(5000)
      });
    } catch {
      // Reliability metrics must never interfere with local meeting capture.
    }
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    const currentVersion = app.getVersion();
    if (!this.config.releasesApiUrl.startsWith("https://")) {
      return { configured: false, updateAvailable: false, currentVersion };
    }
    try {
      const response = await fetch(this.config.releasesApiUrl, {
        headers: { accept: "application/vnd.github+json", "user-agent": "Meeting-Notes-Desktop" },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error(`Release service returned ${response.status}`);
      const release = await response.json() as { tag_name?: string; html_url?: string };
      const latestVersion = release.tag_name?.replace(/^v/i, "");
      if (!latestVersion) throw new Error("Latest release has no version tag.");
      return {
        configured: true,
        updateAvailable: isNewerVersion(latestVersion, currentVersion),
        currentVersion,
        latestVersion,
        releaseUrl: release.html_url || this.config.releasesPageUrl
      };
    } catch (error) {
      return { configured: true, updateAvailable: false, currentVersion, error: String(error) };
    }
  }
}
