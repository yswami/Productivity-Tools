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

export class AudioCapture {
  private window?: BrowserWindow;
  private chunks: Buffer[] = [];
  private sampleRate = 16000;
  private current?: CaptureStartOptions;
  private startPending?: PendingOperation;
  private stopPending?: PendingOperation;

  constructor(private readonly rendererDirectory: string, private readonly preloadFile: string) {
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
    this.window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: this.preloadFile,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    await this.window.loadFile(path.join(this.rendererDirectory, "capture.html"));
    const started = new Promise<CaptureStarted>((resolve, reject) => {
      this.startPending = this.pending(resolve, reject, "Audio capture did not start within 20 seconds.");
    });
    this.window.webContents.send("capture:start", options);
    await started;
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

  private dispose(): void {
    if (this.startPending) clearTimeout(this.startPending.timer);
    if (this.stopPending) clearTimeout(this.stopPending.timer);
    this.startPending = undefined;
    this.stopPending = undefined;
    this.window?.destroy();
    this.window = undefined;
    this.current = undefined;
    this.chunks = [];
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
