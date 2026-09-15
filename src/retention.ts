import fs from "node:fs";
import { MeetingRecord } from "./types";

export function applyAudioRetention(meetings: MeetingRecord[], retentionHours: number, now = Date.now()): string[] {
  if (retentionHours <= 0) return [];
  const cutoff = now - retentionHours * 60 * 60 * 1000;
  const removed: string[] = [];
  for (const meeting of meetings) {
    if (meeting.status === "recording" || !meeting.endedAt || new Date(meeting.endedAt).getTime() > cutoff) continue;
    for (const file of [meeting.microphoneFile, meeting.systemAudioFile]) {
      if (!file || !fs.existsSync(file)) continue;
      fs.rmSync(file, { force: true });
      removed.push(file);
    }
  }
  return removed;
}
