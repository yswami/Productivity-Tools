import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDetectorStop } from "../src/capture-lifecycle";

test("manual recordings never stop when detection is absent", () => {
  const decision = evaluateDetectorStop({
    startedAutomatically: false,
    detectionMatches: false,
    absentSince: 1_000,
    now: 120_000,
    graceSeconds: 30
  });

  assert.deepEqual(decision, { absentSince: 0, shouldStop: false });
});

test("automatic recordings stop after the detection grace period", () => {
  const waiting = evaluateDetectorStop({
    startedAutomatically: true,
    detectionMatches: false,
    absentSince: 0,
    now: 1_000,
    graceSeconds: 30
  });
  assert.deepEqual(waiting, { absentSince: 1_000, shouldStop: false });

  const expired = evaluateDetectorStop({
    startedAutomatically: true,
    detectionMatches: false,
    absentSince: waiting.absentSince,
    now: 31_000,
    graceSeconds: 30
  });
  assert.equal(expired.shouldStop, true);
});

test("matching detection clears an automatic recording's absence timer", () => {
  const decision = evaluateDetectorStop({
    startedAutomatically: true,
    detectionMatches: true,
    absentSince: 1_000,
    now: 20_000,
    graceSeconds: 30
  });

  assert.deepEqual(decision, { absentSince: 0, shouldStop: false });
});
