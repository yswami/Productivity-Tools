import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";

interface CaptureStartOptions {
  sessionId: string;
  outputFile: string;
  includeSystemAudio: boolean;
}

interface CaptureStarted {
  sessionId: string;
  sampleRate: number;
}

interface PendingOperation {
  resolve: (value: CaptureStarted) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface PendingReady {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class AudioCapture {
  private window?: BrowserWindow;
  private chunks: Buffer[] = [];
  private sampleRate = 16000;
  private current?: CaptureStartOptions;
  private readyPending?: PendingReady;
  private startPending?: PendingOperation;
  private stopPending?: PendingOperation;

  constructor(private readonly rendererDirectory: string, private readonly preloadFile: string) {
    ipcMain.on("capture:ready", (event) => {
      if (!this.window || event.sender !== this.window.webContents || !this.readyPending) return;
      clearTimeout(this.readyPending.timer);
      this.readyPending.resolve();
      this.readyPending = undefined;
    });
    ipcMain.on("capture:chunk", (_event, sessionId: string, data: ArrayBuffer) => {
      if (this.current?.sessionId === sessionId) this.chunks.push(Buffer.from(data));
    });
    ipcMain.on("capture:started", (_event, payload: CaptureStarted) => {
      if (this.current?.sessionId !== payload.sessionId) return;
      this.sampleRate = payload.sampleRate;
      this.resolveOperation("start", payload);
    });
    ipcMain.on("capture:stopped", (_event, payload: CaptureStarted) => {
      if (this.current?.sessionId !== payload.sessionId) return;
      this.sampleRate = payload.sampleRate;
      this.resolveOperation("stop", payload);
    });
    ipcMain.on("capture:error", (_event, sessionId: string, message: string) => {
      if (this.current?.sessionId !== sessionId) return;
      const error = new Error(message);
      this.rejectOperation("start", error);
      this.rejectOperation("stop", error);
    });
  }

  async start(options: CaptureStartOptions): Promise<void> {
    if (this.current) throw new Error("An audio capture is already active.");
    this.current = options;
    this.chunks = [];
    let readyError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.openReadyWindow();
        readyError = undefined;
        break;
      } catch (error) {
        readyError = error;
        this.disposeWindow();
      }
    }
    if (readyError) throw readyError;

    const started = new Promise<CaptureStarted>((resolve, reject) => {
      this.startPending = this.pending(
        resolve,
        reject,
        "Microphone capture did not start within 30 seconds. Check Microphone access in System Settings and try again.",
        30000
      );
    });
    this.window!.webContents.send("capture:start", options);
    await started;
  }

  private async openReadyWindow(): Promise<void> {
    this.window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: this.preloadFile,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    const ready = new Promise<void>((resolve, reject) => {
      this.readyPending = {
        resolve,
        reject,
        timer: setTimeout(() => reject(new Error("The audio recorder window did not become ready within 10 seconds.")), 10000)
      };
    });
    this.window.webContents.once("render-process-gone", (_event, details) => {
      this.fail(`The audio recorder process stopped (${details.reason}).`);
    });
    this.window.webContents.once("did-fail-load", (_event, code, description) => {
      this.fail(`The audio recorder page failed to load (${code}: ${description}).`);
    });
    this.window.webContents.once("unresponsive", () => {
      this.fail("The audio recorder became unresponsive.");
    });
    await Promise.all([
      this.window.loadFile(path.join(this.rendererDirectory, "capture.html")),
      ready
    ]);
  }

  async stop(): Promise<string | undefined> {
    if (!this.current || !this.window) return undefined;
    const options = this.current;
    try {
      const stopped = new Promise<CaptureStarted>((resolve, reject) => {
        this.stopPending = this.pending(resolve, reject, "Audio capture did not stop within 10 seconds.", 10000);
      });
      this.window.webContents.send("capture:stop", { sessionId: options.sessionId });
      await stopped;
      this.writeWav(options.outputFile, Buffer.concat(this.chunks), this.sampleRate);
      return options.outputFile;
    } finally {
      this.dispose();
    }
  }

  abort(): void {
    this.dispose();
  }

  private pending(
    resolve: PendingOperation["resolve"],
    reject: PendingOperation["reject"],
    timeoutMessage: string,
    timeoutMs = 20000
  ): PendingOperation {
    const operation = {} as PendingOperation;
    operation.resolve = resolve;
    operation.reject = reject;
    operation.timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    return operation;
  }

  private resolveOperation(kind: "start" | "stop", payload: CaptureStarted): void {
    const operation = kind === "start" ? this.startPending : this.stopPending;
    if (!operation) return;
    clearTimeout(operation.timer);
    operation.resolve(payload);
    if (kind === "start") this.startPending = undefined;
    else this.stopPending = undefined;
  }

  private rejectOperation(kind: "start" | "stop", error: Error): void {
    const operation = kind === "start" ? this.startPending : this.stopPending;
    if (!operation) return;
    clearTimeout(operation.timer);
    operation.reject(error);
    if (kind === "start") this.startPending = undefined;
    else this.stopPending = undefined;
  }

  private fail(message: string): void {
    const error = new Error(message);
    if (this.readyPending) {
      clearTimeout(this.readyPending.timer);
      this.readyPending.reject(error);
      this.readyPending = undefined;
    }
    this.rejectOperation("start", error);
    this.rejectOperation("stop", error);
  }

  private dispose(): void {
    this.disposeWindow();
    if (this.startPending) clearTimeout(this.startPending.timer);
    if (this.stopPending) clearTimeout(this.stopPending.timer);
    this.startPending = undefined;
    this.stopPending = undefined;
    this.current = undefined;
    this.chunks = [];
  }

  private disposeWindow(): void {
    if (this.readyPending) clearTimeout(this.readyPending.timer);
    this.readyPending = undefined;
    this.window?.destroy();
    this.window = undefined;
  }

  private writeWav(outputFile: string, pcm: Buffer, sampleRate: number): void {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(outputFile, Buffer.concat([header, pcm]));
  }
}
