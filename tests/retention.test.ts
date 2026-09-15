import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyAudioRetention } from "../src/retention";
import { MeetingStore } from "../src/store";
import { MeetingRecord } from "../src/types";

test("removes expired audio but keeps transcripts", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "meeting-notes-retention-"));
  const audio = path.join(directory, "audio.wav");
  const transcript = path.join(directory, "transcript.txt");
  fs.writeFileSync(audio, "audio");
  fs.writeFileSync(transcript, "transcript");
  const meeting: MeetingRecord = {
    id: "test",
    platform: "zoom",
    title: "Test",
    startedAt: "2026-09-08T09:00:00.000Z",
    endedAt: "2026-09-08T10:00:00.000Z",
    status: "ready",
    directory,
    microphoneFile: audio,
    transcriptFile: transcript
  };
  const removed = applyAudioRetention([meeting], 24, new Date("2026-09-10T10:00:00.000Z").getTime());
  assert.deepEqual(removed, [audio]);
  assert.equal(fs.existsSync(audio), false);
  assert.equal(fs.existsSync(transcript), true);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("recovers an interrupted recording on startup", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "meeting-notes-store-"));
  fs.writeFileSync(path.join(root, "meeting-library.json"), JSON.stringify({
    settings: {},
    meetings: [{
      id: "interrupted",
      platform: "zoom",
      title: "Interrupted meeting",
      startedAt: "2026-01-01T10:00:00.000Z",
      status: "recording",
      directory: root
    }]
  }));
  const store = new MeetingStore(root);
  assert.equal(store.meetings[0].status, "failed");
  assert.match(store.meetings[0].error ?? "", /interrupted/i);
  fs.rmSync(root, { recursive: true, force: true });
});

test("defaults reliability sharing to off and persists an anonymous installation id", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "meeting-notes-privacy-"));
  const first = new MeetingStore(root);
  assert.equal(first.settings.telemetryConsent, false);
  assert.equal(first.settings.telemetryPromptSeen, false);
  const installationId = first.installationId;
  assert.match(installationId, /^[0-9a-f-]{36}$/i);
  first.updateSettings({ telemetryPromptSeen: true });
  const second = new MeetingStore(root);
  assert.equal(second.installationId, installationId);
  assert.equal(second.settings.telemetryConsent, false);
  fs.rmSync(root, { recursive: true, force: true });
});
