import assert from "node:assert/strict";
import test from "node:test";
import { cleanTranscript, labelSpeakerTurns } from "../src/transcriber";

test("cleans timestamps and non-speech markers", () => {
  const raw = "[00:00:00.000 --> 00:00:01.000] Hello\n[BLANK_AUDIO]\n(inaudible)\nWorld";
  assert.equal(cleanTranscript(raw), "Hello\nWorld");
});

test("labels anonymous speaker turns", () => {
  const raw = "Good morning. [SPEAKER_TURN]\nMorning.\n[SPEAKER_TURN] Let us begin.";
  assert.equal(labelSpeakerTurns(raw), "Speaker 1: Good morning.\n\nSpeaker 2: Morning.\n\nSpeaker 1: Let us begin.");
});

test("ignores empty turn segments", () => {
  assert.equal(labelSpeakerTurns("[BLANK_AUDIO] [SPEAKER_TURN] A useful sentence."), "Speaker 2: A useful sentence.");
});
