import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MeetingRecord } from "./types";

const execFileAsync = promisify(execFile);

const IGNORED_AUDIO = new Set(["[blank_audio]", "[blank audio]", "(beep)", "(inaudible)", "[inaudible]", "[music]", "[noise]"]);

export function cleanTranscript(raw: string): string {
  return raw.split(/\r?\n/)
    .map((line) => line.replace(/\[[0-9:.\s-]+--?>[0-9:.\s-]+\]/g, "").trim())
    .filter((line) => line && !IGNORED_AUDIO.has(line.toLowerCase()))
    .join("\n");
}

export function labelSpeakerTurns(raw: string): string {
  const parts = raw.split(/\s*\[SPEAKER_TURN\]\s*/i);
  const labelled: string[] = [];
  let speaker = 1;
  for (const part of parts) {
    const text = cleanTranscript(part);
    if (text) labelled.push(`Speaker ${speaker}: ${text}`);
    speaker = speaker === 1 ? 2 : 1;
  }
  return labelled.join("\n\n") || "No clear speech detected in this audio track.";
}

export class OfflineTranscriber {
  constructor(private readonly runtimeDirectory: string, private readonly modelDirectory: string) {}

  ready(): boolean {
    if (process.platform === "darwin") return fs.existsSync(this.macScript());
    if (process.platform === "win32") return fs.existsSync(this.windowsCli()) && fs.existsSync(this.modelFile());
    return false;
  }

  async transcribeMeeting(meeting: MeetingRecord): Promise<{ textFile: string; htmlFile: string }> {
    const sections: string[] = [];
    if (meeting.systemAudioFile && fs.existsSync(meeting.systemAudioFile) && fs.statSync(meeting.systemAudioFile).size > 4096) {
      const output = path.join(meeting.directory, "system-audio-transcript.txt");
      await this.transcribeFile(meeting.systemAudioFile, output);
      const raw = fs.readFileSync(output, "utf8");
      const text = this.usesDiarizationModel() ? labelSpeakerTurns(raw) : `Speaker 1: ${cleanTranscript(raw)}`;
      sections.push(`Meeting/system audio transcript (anonymous speaker turns):\n\n${text}`);
    }
    if (meeting.microphoneFile && fs.existsSync(meeting.microphoneFile) && fs.statSync(meeting.microphoneFile).size > 44) {
      const output = path.join(meeting.directory, "microphone-transcript.txt");
      await this.transcribeFile(meeting.microphoneFile, output);
      const text = cleanTranscript(fs.readFileSync(output, "utf8")) || "No clear speech detected in this audio track.";
      sections.push(`Microphone transcript:\n\nYou: ${text}`);
    }
    if (sections.length === 0) throw new Error("No usable meeting audio was captured.");

    const textFile = path.join(meeting.directory, "transcript.txt");
    const htmlFile = path.join(meeting.directory, "transcript.html");
    const header = [
      "Private offline meeting transcript",
      "",
      `Meeting: ${meeting.title}`,
      `Platform: ${meeting.platform}`,
      `Started: ${meeting.startedAt}`,
      `Ended: ${meeting.endedAt ?? ""}`,
      ""
    ].join("\n");
    const transcript = `${header}${sections.join("\n\n---\n\n")}\n`;
    fs.writeFileSync(textFile, transcript);
    fs.writeFileSync(htmlFile, this.renderHtml(meeting, transcript));
    return { textFile, htmlFile };
  }

  private async transcribeFile(audioFile: string, outputFile: string): Promise<void> {
    if (process.platform === "darwin") {
      await execFileAsync("/bin/zsh", [this.macScript()], {
        env: {
          ...process.env,
          AUDIO_FILE: audioFile,
          TRANSCRIPT_FILE: outputFile,
          SESSION_DIR: path.dirname(audioFile),
          WHISPER_MODEL_FILE: this.modelFile(),
          WHISPER_TINY_DIARIZE: this.usesDiarizationModel() ? "1" : "0"
        },
        maxBuffer: 20 * 1024 * 1024
      });
      return;
    }
    if (process.platform === "win32") {
      const args = ["-m", this.modelFile(), "-f", audioFile, "-l", "en", "-np"];
      if (this.usesDiarizationModel()) args.push("-tdrz");
      const result = await execFileAsync(this.windowsCli(), args, {
        maxBuffer: 20 * 1024 * 1024
      });
      if (!result.stdout.trim()) throw new Error("Whisper did not produce a transcript.");
      fs.writeFileSync(outputFile, result.stdout);
      return;
    }
    throw new Error("Offline transcription is not supported on this platform.");
  }

  private macScript(): string {
    return path.join(this.runtimeDirectory, "transcribe-audio.zsh");
  }

  private windowsCli(): string {
    return path.join(this.runtimeDirectory, "bin", "whisper-cli.exe");
  }

  private modelFile(): string {
    const diarizationModel = path.join(this.modelDirectory, "ggml-small.en-tdrz.bin");
    return fs.existsSync(diarizationModel) ? diarizationModel : path.join(this.modelDirectory, "ggml-base.en.bin");
  }

  private usesDiarizationModel(): boolean {
    return this.modelFile().endsWith("-tdrz.bin");
  }

  private renderHtml(meeting: MeetingRecord, transcript: string): string {
    const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(meeting.title)}</title><style>body{font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#202124;margin:0;background:#f3f5f7}main{max-width:960px;margin:32px auto;padding:32px;background:#fff;border:1px solid #dfe3e8;border-radius:8px}h1{font-size:26px;margin:0 0 8px}.meta{color:#667085;margin-bottom:28px}pre{font:15px/1.6 inherit;white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:720px){main{margin:0;border:0;border-radius:0;padding:20px}}</style></head><body><main><h1>${escape(meeting.title)}</h1><div class="meta">${escape(meeting.platform)} · ${escape(meeting.startedAt)}</div><pre>${escape(transcript)}</pre></main></body></html>`;
  }
}
