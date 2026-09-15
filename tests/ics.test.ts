import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { icsInternals, writeCalendarFile } from "../src/ics";
import { MeetingRecord } from "../src/types";

test("escapes calendar text", () => {
  assert.equal(icsInternals.escapeIcs("One, two; three\nfour"), "One\\, two\\; three\\nfour");
});

test("formats UTC calendar timestamps", () => {
  assert.equal(icsInternals.utcStamp("2026-09-10T10:30:00.000Z"), "20260910T103000Z");
});

test("folds long calendar body lines without exceeding 75 UTF-8 bytes", () => {
  const folded = icsInternals.foldLine(`DESCRIPTION:${"meeting notes ".repeat(30)}`);
  const lines = folded.split("\r\n");
  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => Buffer.byteLength(line, "utf8") <= 75));
  assert.ok(lines.slice(1).every((line) => line.startsWith(" ")));
});

test("embeds the complete transcript in the calendar description", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "meeting-notes-ics-"));
  const transcriptFile = path.join(directory, "transcript.txt");
  fs.writeFileSync(transcriptFile, "Complete private transcript text.");
  const meeting: MeetingRecord = {
    id: "calendar-test",
    platform: "google-meet",
    title: "Project review",
    startedAt: "2026-09-10T10:30:00.000Z",
    endedAt: "2026-09-10T11:00:00.000Z",
    status: "ready",
    directory,
    transcriptFile
  };
  const calendar = fs.readFileSync(writeCalendarFile(meeting), "utf8").replace(/\r\n /g, "");
  assert.match(calendar, /Full transcript:\\n\\nComplete private transcript text\./);
  fs.rmSync(directory, { recursive: true, force: true });
});
