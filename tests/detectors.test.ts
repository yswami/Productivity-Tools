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

test("does not treat the Google Meet home page as an active call", () => {
  assert.deepEqual(detectorInternals.detectWindowTitles(["Google Meet - Brave"]), {
    active: false,
    confidence: "none"
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

test("browser detector emits real tab delimiters for the parser", () => {
  const script = detectorInternals.chromiumBrowserScript("Brave Browser");
  assert.match(script, /character id 9/);
  assert.match(script, /& fieldSeparator &/);
  assert.doesNotMatch(script, /& tab &|& \(ASCII character 9\) &/);
  assert.match(script, /does not contain "meet\.google\.com\/\?"/);
  assert.match(script, /does not contain "\/home"/);
  assert.match(script, /does not contain "\/_meet\/"/);
});
