import assert from "node:assert/strict";
import test from "node:test";
import { AutoCaptureGate } from "../src/auto-capture-gate";

test("blocks repeated attempts for the same detected meeting", () => {
  const gate = new AutoCaptureGate();
  const key = "zoom:Zoom Meeting";
  assert.equal(gate.canAttempt(key), true);
  gate.block(key, "Recorder failed");
  assert.equal(gate.canAttempt(key), false);
  assert.equal(gate.pausedReason, "Recorder failed");
});

test("clears the block after the meeting ends or detection changes", () => {
  const gate = new AutoCaptureGate();
  gate.block("zoom:Zoom Meeting", "Recorder failed");
  gate.observe("");
  assert.equal(gate.canAttempt("zoom:Zoom Meeting"), true);

  gate.block("zoom:Zoom Meeting", "Recorder failed");
  gate.observe("google-meet:Weekly Review");
  assert.equal(gate.canAttempt("google-meet:Weekly Review"), true);
});
