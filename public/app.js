const form = document.getElementById("analyze-form");
const urlInput = document.getElementById("stream-url");
const pollInput = document.getElementById("poll-interval");
const statusEl = document.getElementById("status");

const startBtn = document.getElementById("start-monitoring");
const stopBtn = document.getElementById("stop-monitoring");

const summaryList = document.getElementById("summary-list");
const diagnosticsList = document.getElementById("diagnostics-list");
const markersBody = document.getElementById("markers-body");
const breaksBody = document.getElementById("breaks-body");
const timelineEl = document.getElementById("timeline");

const state = {
  polling: false,
  timer: null,
  inFlight: false,
  latest: null,
  seenMarkers: new Map(),
};

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#9e1a1a" : "#1a1f2b";
}

function formatTime(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toFixed(3);
}

function clearChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function setSummary(data) {
  clearChildren(summaryList);

  const entries = [
    ["Detected Type", `${data.sourceType?.toUpperCase() || "-"}`],
    ["Manifest Kind", data.manifestKind || "-"],
    ["Inspecting URL", data.inspectedUrl || "-"],
    ["Live Stream", data.isLive ? "Yes" : "No"],
    ["Playlist Window (s)", formatTime(data.playlistWindowSeconds)],
    ["Target Duration (s)", formatTime(data.targetDurationSeconds)],
    ["Fetched At", data.fetchedAt || "-"],
    ["Total Markers", String(data.markers?.length || 0)],
    ["Total Breaks", String(data.adBreaks?.length || 0)],
  ];

  entries.forEach(([label, value]) => {
    const wrapper = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    wrapper.appendChild(dt);
    wrapper.appendChild(dd);
    summaryList.appendChild(wrapper);
  });
}

function setDiagnostics(data) {
  clearChildren(diagnosticsList);
  const info = data.diagnostics?.info || [];
  const warnings = data.diagnostics?.warnings || [];
  const errors = data.diagnostics?.errors || [];

  if (!info.length && !warnings.length && !errors.length) {
    const li = document.createElement("li");
    li.textContent = "No diagnostics available.";
    diagnosticsList.appendChild(li);
    return;
  }

  const appendDiagnostics = (items, className, prefix) => {
    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = className;
      li.textContent = `${prefix} ${item}`;
      diagnosticsList.appendChild(li);
    });
  };

  appendDiagnostics(errors, "diag-error", "Error:");
  appendDiagnostics(warnings, "diag-warning", "Warning:");
  appendDiagnostics(info, "diag-info", "Info:");
}

function mergeSeenMarkers(markers) {
  const now = new Date().toISOString();
  let newCount = 0;

  markers.forEach((marker) => {
    const key = marker.signature || marker.id;
    if (!state.seenMarkers.has(key)) {
      state.seenMarkers.set(key, {
        firstSeenAt: now,
        seenCount: 1,
      });
      newCount += 1;
      return;
    }

    const item = state.seenMarkers.get(key);
    item.seenCount += 1;
    state.seenMarkers.set(key, item);
  });

  return newCount;
}

function setMarkers(data) {
  clearChildren(markersBody);
  const markers = data.markers || [];

  markers
    .slice()
    .sort((a, b) => (a.offsetSeconds || 0) - (b.offsetSeconds || 0))
    .forEach((marker) => {
      const tr = document.createElement("tr");
      const seen = state.seenMarkers.get(marker.signature || marker.id);
      const cells = [
        marker.type || "-",
        formatTime(marker.offsetSeconds),
        marker.programDateTime || "-",
        `${marker.tag || "-"}${seen ? ` (seen ${seen.seenCount}x)` : ""}`,
      ];

      cells.forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      });

      markersBody.appendChild(tr);
    });
}

function setAdBreaks(data) {
  clearChildren(breaksBody);
  const breaks = data.adBreaks || [];

  breaks.forEach((adBreak, index) => {
    const tr = document.createElement("tr");
    const cells = [
      String(index + 1),
      formatTime(adBreak.startOffsetSeconds),
      formatTime(adBreak.endOffsetSeconds),
      formatTime(adBreak.durationSeconds),
      adBreak.state || "-",
    ];

    cells.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });

    breaksBody.appendChild(tr);
  });
}

function getTimelineWindow(data) {
  if (Number.isFinite(data.playlistWindowSeconds) && data.playlistWindowSeconds > 0) {
    return data.playlistWindowSeconds;
  }

  const markerMax = (data.markers || []).reduce((max, marker) => {
    return Math.max(max, Number(marker.offsetSeconds || 0));
  }, 0);

  const breakMax = (data.adBreaks || []).reduce((max, adBreak) => {
    const end = Number(adBreak.endOffsetSeconds || adBreak.startOffsetSeconds || 0);
    return Math.max(max, end);
  }, 0);

  return Math.max(markerMax, breakMax, 60);
}

function setTimeline(data) {
  clearChildren(timelineEl);
  const windowSeconds = getTimelineWindow(data);

  const base = document.createElement("div");
  base.className = "timeline-base";
  timelineEl.appendChild(base);

  (data.adBreaks || []).forEach((adBreak) => {
    const start = Number(adBreak.startOffsetSeconds || 0);
    const end = Number(adBreak.endOffsetSeconds || windowSeconds);
    const leftPct = (start / windowSeconds) * 100;
    const widthPct = Math.max(((end - start) / windowSeconds) * 100, 0.5);
    const div = document.createElement("div");
    div.className = "timeline-break";
    div.style.left = `${leftPct}%`;
    div.style.width = `${widthPct}%`;
    div.title = `Ad break ${formatTime(start)}s - ${formatTime(end)}s`;
    timelineEl.appendChild(div);
  });

  (data.markers || []).forEach((marker) => {
    const offset = Number(marker.offsetSeconds || 0);
    const leftPct = (offset / windowSeconds) * 100;

    const markerLine = document.createElement("div");
    markerLine.className = "timeline-marker";
    markerLine.style.left = `${leftPct}%`;
    markerLine.title = `${marker.type} @ ${formatTime(offset)}s`;
    timelineEl.appendChild(markerLine);

    const label = document.createElement("div");
    label.className = "timeline-label";
    label.style.left = `${leftPct}%`;
    label.textContent = marker.type;
    timelineEl.appendChild(label);
  });
}

function render(data) {
  setSummary(data);
  setDiagnostics(data);
  setMarkers(data);
  setAdBreaks(data);
  setTimeline(data);
}

async function analyzeOnce() {
  if (state.inFlight) {
    return;
  }

  const url = urlInput.value.trim();
  if (!url) {
    setStatus("Enter a URL before analyzing.", true);
    return;
  }

  state.inFlight = true;
  setStatus("Analyzing stream...");

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Analysis failed.");
    }

    state.latest = payload;
    const newMarkers = mergeSeenMarkers(payload.markers || []);
    render(payload);
    setStatus(
      `Analysis complete. ${payload.markers?.length || 0} marker(s), ${newMarkers} new marker(s) since monitoring started.`,
    );
  } catch (error) {
    setStatus(`Error: ${error.message}`, true);
  } finally {
    state.inFlight = false;
  }
}

function stopMonitoring() {
  state.polling = false;
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus("Monitoring stopped.");
}

function startMonitoring() {
  const intervalSec = Math.max(2, Number(pollInput.value) || 8);
  if (state.polling) {
    return;
  }

  state.polling = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  setStatus(`Monitoring started. Polling every ${intervalSec} second(s).`);

  analyzeOnce();
  state.timer = setInterval(() => {
    analyzeOnce();
  }, intervalSec * 1000);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  analyzeOnce();
});

startBtn.addEventListener("click", startMonitoring);
stopBtn.addEventListener("click", stopMonitoring);
