import assert from "node:assert/strict";
import test from "node:test";
import { detectorInternals } from "../src/detectors";

test("parses a supported detector result", () => {
  assert.deepEqual(detectorInternals.parseDetectorOutput("google-meet\tWeekly Review - Google Meet\tpossible\tMeet tab\n"), {
    active: true,
    platform: "google-meet",
    title: "Weekly Review",
    confidence: "possible",
    evidence: "Meet tab"
  });
});

test("returns inactive for unsupported detector output", () => {
  assert.deepEqual(detectorInternals.parseDetectorOutput("none\t\tnone\t\n"), { active: false, confidence: "none" });
});

test("detects Google Meet from a browser-agnostic window title", () => {
  assert.deepEqual(detectorInternals.detectWindowTitles(["Weekly Planning - Google Meet - Brave"]), {
    active: true,
    platform: "google-meet",
    title: "Weekly Planning",
    confidence: "high",
    evidence: "Visible Google Meet call window"
  });
});

test("detects Microsoft Teams calls from a browser-agnostic window title", () => {
  assert.deepEqual(detectorInternals.detectWindowTitles(["Project review | Microsoft Teams Meeting"]), {
    active: true,
    platform: "microsoft-teams",
    title: "Project review | Microsoft Teams Meeting",
    confidence: "high",
    evidence: "Visible Microsoft Teams call window"
  });
});
