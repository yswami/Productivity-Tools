const state = { snapshot: null, startedAt: 0, timer: null };
const $ = (selector) => document.querySelector(selector);

function platformName(platform) {
  return { zoom: "Zoom", "google-meet": "Google Meet", "microsoft-teams": "Microsoft Teams", manual: "Manual" }[platform] || platform;
}

function formatDate(iso) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function formatDuration(meeting) {
  const start = new Date(meeting.startedAt).getTime();
  const end = meeting.endedAt ? new Date(meeting.endedAt).getTime() : Date.now();
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  return `${minutes} min`;
}

function render(snapshot) {
  state.snapshot = snapshot;
  $("#runtime-status").textContent = snapshot.runtimeReady ? "Offline transcription ready" : "Whisper runtime needs installation";
  const detector = snapshot.detection;
  $("#detector-status").textContent = detector.active
    ? `${platformName(detector.platform)} detected: ${detector.title} (${detector.confidence})`
    : "Looking for Zoom, Google Meet, or Microsoft Teams...";

  const bar = $("#recording-bar");
  bar.hidden = !snapshot.activeMeeting;
  $("#start-button").disabled = Boolean(snapshot.activeMeeting);
  if (snapshot.activeMeeting) {
    $("#recording-title").textContent = `Recording ${snapshot.activeMeeting.title}`;
    state.startedAt = new Date(snapshot.activeMeeting.startedAt).getTime();
    startTimer();
  } else stopTimer();

  const search = $("#search").value.trim().toLowerCase();
  const meetings = snapshot.meetings.filter((meeting) => !search || `${meeting.title} ${meeting.platform}`.toLowerCase().includes(search));
  $("#meeting-count").textContent = `${snapshot.meetings.length} meeting${snapshot.meetings.length === 1 ? "" : "s"}`;
  $("#empty-state").hidden = meetings.length > 0;
  const rows = meetings.map((meeting) => `
    <tr class="meeting-row" data-meeting-id="${escapeHtml(meeting.id)}" tabindex="0">
      <td><div class="meeting-title" title="${escapeHtml(meeting.title)}">${escapeHtml(meeting.title)}</div></td>
      <td><span class="platform ${meeting.platform}">${platformName(meeting.platform)}</span></td>
      <td>${formatDate(meeting.startedAt)}</td>
      <td>${formatDuration(meeting)}</td>
      <td><span class="status ${meeting.status}" title="${escapeHtml(meeting.captureWarning || "")}">${meeting.status}${meeting.captureWarning ? " (mic only)" : ""}</span></td>
      <td><button class="row-action" data-directory="${escapeHtml(meeting.directory)}" title="Open meeting folder" aria-label="Open meeting folder">↗</button></td>
    </tr>`).join("");
  const body = $("#meeting-rows");
  if (body.innerHTML !== rows) {
    body.innerHTML = rows;
    body.querySelectorAll(".row-action").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      window.meetingNotes.openFolder(button.dataset.directory);
    }));
    body.querySelectorAll(".meeting-row").forEach((row) => {
      row.addEventListener("click", () => showMeetingNotes(row.dataset.meetingId));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showMeetingNotes(row.dataset.meetingId);
        }
      });
    });
  }
  loadSettings(snapshot.settings);
  if (snapshot.telemetryConfigured && !snapshot.settings.telemetryPromptSeen && !$("#telemetry-dialog").open) {
    $("#telemetry-dialog").showModal();
  }
}

async function showMeetingNotes(id) {
  const dialog = $("#notes-dialog");
  $("#notes-content").textContent = "Loading...";
  dialog.showModal();
  try {
    const details = await window.meetingNotes.details(id);
    const meeting = details.meeting;
    $("#notes-title").textContent = meeting.title;
    $("#notes-meta").textContent = `${platformName(meeting.platform)} · ${formatDate(meeting.startedAt)} · ${formatDuration(meeting)}`;
    $("#notes-content").textContent = details.transcript;
    $("#notes-folder").onclick = () => window.meetingNotes.openFolder(meeting.directory);
    $("#notes-readable").hidden = !meeting.transcriptHtmlFile;
    $("#notes-readable").onclick = () => window.meetingNotes.openFile(meeting.transcriptHtmlFile);
  } catch (error) {
    $("#notes-content").textContent = `Unable to load these notes. ${error}`;
  }
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function startTimer() {
  if (state.timer) return;
  const tick = () => {
    const elapsed = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
    $("#recording-time").textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  };
  tick();
  state.timer = setInterval(tick, 1000);
}

function stopTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

function loadSettings(settings) {
  $("#auto-capture").checked = settings.autoCapture;
  $("#platform-zoom").checked = settings.enabledPlatforms.includes("zoom");
  $("#platform-meet").checked = settings.enabledPlatforms.includes("google-meet");
  $("#platform-teams").checked = settings.enabledPlatforms.includes("microsoft-teams");
  $("#retention").value = String(settings.audioRetentionHours);
  $("#calendar-file").checked = settings.createCalendarFile;
  $("#telemetry-consent").checked = settings.telemetryConsent;
  $("#telemetry-consent").disabled = !state.snapshot?.telemetryConfigured;
}

$("#start-button").addEventListener("click", async () => {
  const title = $("#manual-title").value.trim() || "Manual Meeting";
  await window.meetingNotes.start(title, $("#manual-platform").value);
});
$("#stop-button").addEventListener("click", () => window.meetingNotes.stop());
$("#search").addEventListener("input", () => state.snapshot && render(state.snapshot));
$("#settings-button").addEventListener("click", () => $("#settings-dialog").showModal());
$("#close-notes").addEventListener("click", () => $("#notes-dialog").close());
$("#open-library").addEventListener("click", () => {
  const directory = state.snapshot?.activeMeeting?.directory || state.snapshot?.meetings?.[0]?.directory;
  if (directory) window.meetingNotes.openFolder(directory);
});
$("#save-settings").addEventListener("click", async (event) => {
  event.preventDefault();
  const enabledPlatforms = [$("#platform-zoom"), $("#platform-meet"), $("#platform-teams")].filter((input) => input.checked).map((input) => input.value);
  await window.meetingNotes.updateSettings({
    autoCapture: $("#auto-capture").checked,
    enabledPlatforms,
    audioRetentionHours: Number($("#retention").value),
    createCalendarFile: $("#calendar-file").checked,
    telemetryConsent: $("#telemetry-consent").checked,
    telemetryPromptSeen: true
  });
  $("#settings-dialog").close();
});

$("#telemetry-decline").addEventListener("click", async () => {
  await window.meetingNotes.updateSettings({ telemetryConsent: false, telemetryPromptSeen: true });
  $("#telemetry-dialog").close();
});

$("#telemetry-accept").addEventListener("click", async () => {
  const configured = Boolean(state.snapshot?.telemetryConfigured);
  await window.meetingNotes.updateSettings({ telemetryConsent: configured, telemetryPromptSeen: true });
  $("#telemetry-dialog").close();
});

$("#check-updates").addEventListener("click", async () => {
  const status = $("#update-status");
  status.textContent = "Checking...";
  const result = await window.meetingNotes.checkForUpdates();
  if (result.error) status.textContent = "Update check failed. Try again later.";
  else if (!result.configured) status.textContent = "Update checking is not configured in this build.";
  else if (result.updateAvailable) {
    status.textContent = `Version ${result.latestVersion} is available.`;
    if (result.releaseUrl) window.meetingNotes.openExternal(result.releaseUrl);
  } else status.textContent = `Version ${result.currentVersion} is current.`;
});

window.meetingNotes.onSnapshot(render);
window.meetingNotes.snapshot().then(render);
