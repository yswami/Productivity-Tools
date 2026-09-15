import fs from "node:fs";
import path from "node:path";
import { MeetingRecord } from "./types";

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function utcStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldLine(line: string): string {
  const output: string[] = [];
  let current = "";
  let limit = 75;
  for (const character of Array.from(line)) {
    if (Buffer.byteLength(current + character, "utf8") > limit) {
      output.push(current);
      current = character;
      limit = 74;
    } else {
      current += character;
    }
  }
  output.push(current);
  return output.join("\r\n ");
}

export function writeCalendarFile(meeting: MeetingRecord): string {
  const output = path.join(meeting.directory, "meeting.ics");
  const end = meeting.endedAt ?? new Date().toISOString();
  const transcript = meeting.transcriptFile && fs.existsSync(meeting.transcriptFile)
    ? fs.readFileSync(meeting.transcriptFile, "utf8").trim()
    : "Transcript unavailable";
  const descriptionLines = [
    `Platform: ${meeting.platform}`,
    meeting.transcriptFile ? `Transcript: ${meeting.transcriptFile}` : "Transcript pending"
  ];
  if (meeting.transcriptHtmlFile) descriptionLines.push(`Readable transcript: ${meeting.transcriptHtmlFile}`);
  descriptionLines.push(
    "",
    "Full transcript:",
    "",
    transcript
  );
  const description = descriptionLines.join("\n");
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Meeting Notes//Offline Meeting Capture//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${meeting.id}@meeting-notes.local`,
    `DTSTAMP:${utcStamp(new Date().toISOString())}`,
    `DTSTART:${utcStamp(meeting.startedAt)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${escapeIcs(`Meeting Notes - ${meeting.title}`)}`,
    `LOCATION:${escapeIcs(meeting.platform)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    ""
  ].map(foldLine).join("\r\n");
  fs.writeFileSync(output, content);
  return output;
}

export const icsInternals = { escapeIcs, utcStamp, foldLine };
