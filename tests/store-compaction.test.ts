import assert from "node:assert/strict";
import test from "node:test";
import { compactRecorderStartupFailures } from "../src/store";
import { MeetingRecord } from "../src/types";

function meeting(id: string, startedAt: string, error?: string): MeetingRecord {
  return {
    id,
    platform: "zoom",
    title: "Zoom Meeting",
    startedAt,
    endedAt: startedAt,
    status: error ? "failed" : "ready",
    directory: `/tmp/${id}`,
    microphoneFile: `/tmp/${id}/microphone.wav`,
    systemAudioFile: `/tmp/${id}/system.m4a`,
    error
  };
}

test("collapses a continuous recorder startup failure burst without deleting other meetings", () => {
  const startupError = "Error: The audio recorder window did not become ready within 10 seconds.";
  const meetings = [
    meeting("newest", "2026-09-22T16:00:30.000Z", startupError),
    meeting("duplicate", "2026-09-22T16:00:15.000Z", startupError),
    meeting("oldest", "2026-09-22T16:00:00.000Z", startupError),
    meeting("successful", "2026-09-22T15:59:00.000Z")
  ];

  const visible = compactRecorderStartupFailures(meetings);

  assert.deepEqual(visible.map((item) => item.id), ["newest", "successful"]);
  assert.equal(meetings.length, 4);
});

test("keeps recorder startup failures from separate attempts", () => {
  const startupError = "Error: The audio recorder window did not become ready within 10 seconds.";
  const visible = compactRecorderStartupFailures([
    meeting("later", "2026-09-22T16:05:00.000Z", startupError),
    meeting("earlier", "2026-09-22T16:00:00.000Z", startupError)
  ]);

  assert.deepEqual(visible.map((item) => item.id), ["later", "earlier"]);
});
