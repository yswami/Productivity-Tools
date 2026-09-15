import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class MacSystemAudioCapture {
  private executable?: string;

  constructor(private readonly runtimeDirectory: string) {}

  available(): boolean {
    return fs.existsSync(this.bundlePath());
  }

  async start(outputFile: string): Promise<void> {
    const bundle = this.bundlePath();
    if (!fs.existsSync(bundle)) throw new Error("The macOS system-audio helper is not bundled.");
    const statusFile = `${outputFile}.status`;
    try { fs.rmSync(statusFile); } catch {}
    this.executable = path.join(bundle, "Contents", "MacOS", "meeting-notes-system-recorder");
    const child = spawn("/usr/bin/open", ["-n", "-a", bundle, "--args", outputFile, String(process.pid)], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (fs.existsSync(statusFile)) {
        const status = fs.readFileSync(statusFile, "utf8").trim();
        if (status === "ready") return;
        if (status.startsWith("error:")) throw new Error(status.slice(6).trim());
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error("The system-audio helper did not become ready within five seconds.");
  }

  async stop(): Promise<void> {
    if (!this.executable) return;
    try {
      await execFileAsync("/usr/bin/pkill", ["-TERM", "-f", this.executable]);
    } catch {
      // The helper may already have exited after a permission failure.
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
    this.executable = undefined;
  }

  private bundlePath(): string {
    return path.join(this.runtimeDirectory, "bin", "MeetingNotesSystemRecorder.app");
  }
}
