const form = document.getElementById("analyze-form");
const urlInput = document.getElementById("stream-url");
const pollInput = document.getElementById("poll-interval");
const jwPlayerIdInput = document.getElementById("jw-player-id");
const statusEl = document.getElementById("status");

const startBtn = document.getElementById("start-monitoring");
const stopBtn = document.getElementById("stop-monitoring");

const summaryList = document.getElementById("summary-list");
const diagnosticsList = document.getElementById("diagnostics-list");
const eventSummaryBarEl = document.getElementById("event-summary-bar");
const eventsBody = document.getElementById("events-body");
const breaksBody = document.getElementById("breaks-body");
const timelineEl = document.getElementById("timeline");
const adMarkerStatusEl = document.getElementById("ad-marker-status");
const adMarkerDetailEl = document.getElementById("ad-marker-detail");

const FETCH_TIMEOUT_MS = 15000;
const DEFAULT_PROXY_MODE = "auto";

const state = {
  polling: false,
  timer: null,
  inFlight: false,
  latest: null,
  activeInputUrl: null,
  pollManifestUrl: null,
  eventLogMap: new Map(),
  jwPlayerInstance: null,
  jwConfiguredStreamUrl: null,
  jwConfiguredPlayerId: null,
  jwAdBreakActive: false,
  lastScteEventAt: null,
  lastScteEventType: null,
  lastScteEventSource: null,
  jwScriptPlayerIdLoaded: null,
  jwScriptPromise: null,
  jwSessionErrors: [],
};

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#9e1a1a" : "#1a1f2b";
}

function clearChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function round(value, decimals = 3) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatTime(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toFixed(3);
}

function formatUtcWallClock(isoString) {
  if (!isoString) {
    return "-";
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toISOString().slice(11, 19);
}

function toIsoNow() {
  return new Date().toISOString();
}

function safeJsonStringify(value, maxLength = 300) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > maxLength) {
      return `${serialized.slice(0, maxLength)}...`;
    }
    return serialized;
  } catch (_error) {
    return String(value);
  }
}

function collectPayloadText(value, bucket, depth = 0) {
  if (depth > 5 || value === null || value === undefined) {
    return;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    bucket.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectPayloadText(item, bucket, depth + 1));
    return;
  }

  if (typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => {
      bucket.push(String(key));
      collectPayloadText(item, bucket, depth + 1);
    });
  }
}

function hasScteSignal(value) {
  const tokens = [];
  collectPayloadText(value, tokens);
  const normalized = tokens.join(" ").toLowerCase();
  return /(scte|scte35|cue-?out|cue-?in|splice|segmentation|time_signal|adbreak|daterange)/.test(
    normalized,
  );
}

function stripVolatileFields(value) {
  const volatileKeys = new Set([
    "metadataTime",
    "time",
    "timestamp",
    "position",
    "playbackPosition",
    "currentTime",
    "utcTime",
    "localTime",
    "receivedAt",
  ]);

  if (Array.isArray(value)) {
    return value.map((item) => stripVolatileFields(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const normalized = {};
  Object.keys(value)
    .sort()
    .forEach((key) => {
      if (volatileKeys.has(key)) {
        return;
      }
      normalized[key] = stripVolatileFields(value[key]);
    });
  return normalized;
}

function buildStableJwPayloadSignature(payload) {
  return safeJsonStringify(stripVolatileFields(payload), 260);
}

function compactDetails(value, maxLen = 180) {
  if (!value) {
    return "-";
  }
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) {
    return normalized;
  }
  return `${normalized.slice(0, maxLen)}...`;
}

function describeJwEvent(eventType, payload) {
  if (eventType === "adBreakStart") {
    return "Ad break started";
  }
  if (eventType === "adBreakEnd") {
    return "Ad break ended";
  }

  const tokens = [];
  collectPayloadText(payload, tokens);
  const combined = tokens.join(" ");
  const scteHexMatch = combined.match(/0x[0-9a-fA-F]{16,}/);
  if (scteHexMatch) {
    return `SCTE payload ${compactDetails(scteHexMatch[0], 90)}`;
  }

  const daterangeMatch = combined.match(/ID="?[^,\s"]+/i);
  if (daterangeMatch) {
    return `Timed metadata ${compactDetails(daterangeMatch[0], 90)}`;
  }

  return compactDetails(safeJsonStringify(stripVolatileFields(payload), 180), 180);
}

function parseInlineAttributesFromText(text) {
  const attrs = {};
  if (!text) {
    return attrs;
  }

  const normalized = String(text).replace(/^#?EXT-[^:]+:/, "");
  const regex = /([A-Za-z0-9-]+)=("[^"]*"|[^,\s]+)/g;
  let match = regex.exec(normalized);
  while (match) {
    const key = match[1].toUpperCase();
    const value = match[2].replace(/^"|"$/g, "");
    attrs[key] = value;
    match = regex.exec(normalized);
  }

  return attrs;
}

function deriveSignalTypeFromRaw(rawDetails) {
  const tokens = [];
  collectPayloadText(rawDetails, tokens);
  const normalized = tokens.join(" ").toUpperCase();

  if (normalized.includes("CUE-OUT-CONT")) {
    return "CUE-OUT-CONT";
  }
  if (normalized.includes("CUE-OUT")) {
    return "CUE-OUT";
  }
  if (normalized.includes("CUE-IN")) {
    return "CUE-IN";
  }
  if (normalized.includes("SCTE35-OUT") || normalized.includes(" OUT=0X")) {
    return "SCTE35-OUT";
  }
  if (normalized.includes("SCTE35-IN") || normalized.includes(" IN=0X")) {
    return "SCTE35-IN";
  }

  return "Unknown";
}

function extractScteAttributeSummary(rawDetails) {
  const attrs = {};
  const tokens = [];
  collectPayloadText(rawDetails, tokens);

  tokens.forEach((token) => {
    const parsed = parseInlineAttributesFromText(token);
    Object.entries(parsed).forEach(([key, value]) => {
      if (!attrs[key]) {
        attrs[key] = value;
      }
    });
  });

  const collectScalarPairs = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 5) {
      return;
    }
    Object.entries(value).forEach(([key, nested]) => {
      if (nested === undefined || nested === null) {
        return;
      }
      if (typeof nested === "object") {
        collectScalarPairs(nested, depth + 1);
        return;
      }
      const up = key.toUpperCase();
      if (!attrs[up]) {
        attrs[up] = String(nested);
      }
    });
  };

  if (rawDetails && typeof rawDetails === "object") {
    collectScalarPairs(rawDetails);
  }

  const parts = [];
  const duration = attrs.DURATION || attrs["PLANNED-DURATION"];
  if (duration) {
    parts.push(`Duration: ${compactDetails(duration, 24)}s`);
  }

  const upid = attrs.UPID || attrs["SEGMENTATION-UPID"] || attrs["X-UPID"] || attrs["X-ASSET-ID"];
  if (upid) {
    parts.push(`UPID: ${compactDetails(upid, 28)}`);
  }

  const availNum = attrs["AVAIL-NUM"] || attrs.AVAILNUM || attrs["AVAIL-NUMBER"];
  const availsExpected = attrs["AVAILS-EXPECTED"] || attrs.AVAILSEXPECTED;
  if (availNum && availsExpected) {
    parts.push(`Avail: ${availNum}/${availsExpected}`);
  } else if (availNum) {
    parts.push(`Avail: ${availNum}`);
  }

  const markerId = attrs.ID || attrs.EVENTID;
  if (markerId) {
    parts.push(`ID: ${compactDetails(markerId, 24)}`);
  }

  const sctePayload = attrs["SCTE35-OUT"] || attrs["SCTE35-IN"] || attrs.OUT || attrs.IN;
  if (sctePayload) {
    parts.push(`SCTE35: ${compactDetails(sctePayload, 28)}`);
  }

  return parts.length ? parts.join(", ") : "-";
}

function getStatusBadgeForSignal(signalType) {
  if (signalType === "CUE-OUT" || signalType === "SCTE35-OUT") {
    return { label: "✅ CUE-OUT", className: "event-status-pill event-status-out" };
  }
  if (signalType === "CUE-IN" || signalType === "SCTE35-IN") {
    return { label: "🔴 CUE-IN", className: "event-status-pill event-status-in" };
  }
  if (signalType === "CUE-OUT-CONT") {
    return { label: "⏳ CONT", className: "event-status-pill event-status-cont" };
  }
  return { label: "• Unknown", className: "event-status-pill event-status-unknown" };
}

function parseIsoDuration(iso) {
  if (!iso || typeof iso !== "string") {
    return null;
  }

  const match = iso.match(
    /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/,
  );
  if (!match) {
    return null;
  }

  const years = Number(match[1] || 0);
  const months = Number(match[2] || 0);
  const days = Number(match[3] || 0);
  const hours = Number(match[4] || 0);
  const minutes = Number(match[5] || 0);
  const seconds = Number(match[6] || 0);

  return (
    years * 31536000 +
    months * 2592000 +
    days * 86400 +
    hours * 3600 +
    minutes * 60 +
    seconds
  );
}

function parseAttributeList(value) {
  const attributes = {};
  if (!value) {
    return attributes;
  }

  const chunks = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (char === "," && !inQuotes) {
      if (current.trim()) {
        chunks.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  chunks.forEach((chunk) => {
    const separator = chunk.indexOf("=");
    if (separator === -1) {
      attributes[chunk] = true;
      return;
    }

    const key = chunk.slice(0, separator).trim();
    let val = chunk.slice(separator + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    attributes[key] = val;
  });

  return attributes;
}

function absolutizeUrl(baseUrl, child) {
  try {
    return new URL(child, baseUrl).toString();
  } catch (_error) {
    return child;
  }
}

function resolveProgramDateTime(anchor, mediaOffsetSeconds) {
  if (!anchor || !Number.isFinite(anchor.epochMs)) {
    return null;
  }
  const deltaMs = (mediaOffsetSeconds - anchor.mediaOffsetSeconds) * 1000;
  return new Date(anchor.epochMs + deltaMs).toISOString();
}

function makeMarker({
  sourceUrl,
  type,
  offsetSeconds,
  lineNumber,
  tag,
  programDateTime,
  durationSeconds = null,
  details = {},
}) {
  const signature = `${type}|${round(offsetSeconds)}|${programDateTime || "na"}|${tag}`;
  return {
    id: `${type}-${lineNumber}-${Math.abs(Math.floor((offsetSeconds || 0) * 1000))}`,
    signature,
    sourceUrl,
    type,
    offsetSeconds: round(offsetSeconds),
    programDateTime,
    lineNumber,
    tag,
    durationSeconds: durationSeconds === null ? null : round(durationSeconds),
    details,
  };
}

function detectManifestType(url, text, contentType) {
  const lowerText = (text || "").trim().slice(0, 300).toLowerCase();
  const lowerType = (contentType || "").toLowerCase();
  const lowerUrl = (url || "").toLowerCase();

  if (
    lowerText.startsWith("#extm3u") ||
    lowerType.includes("mpegurl") ||
    lowerUrl.includes(".m3u8")
  ) {
    return "hls";
  }

  if (
    lowerText.startsWith("<?xml") ||
    lowerText.includes("<mpd") ||
    lowerType.includes("dash+xml") ||
    lowerUrl.includes(".mpd")
  ) {
    return "dash";
  }

  return "unknown";
}

function getProxyCandidates(mode = DEFAULT_PROXY_MODE) {
  if (mode === "auto") {
    return ["corsproxy", "allorigins"];
  }
  return [mode];
}

function encodeManifestUrlForProxy(originalUrl) {
  // Encode the complete manifest URL as one unit so signed query strings stay intact.
  return encodeURIComponent(String(originalUrl));
}

function buildProxyUrl(proxyName, originalUrl) {
  const encodedManifestUrl = encodeManifestUrlForProxy(originalUrl);
  if (proxyName === "allorigins") {
    return `https://api.allorigins.win/raw?url=${encodedManifestUrl}`;
  }
  return `https://corsproxy.io/?${encodedManifestUrl}`;
}

async function fetchTextViaProxy(url) {
  const proxyCandidates = getProxyCandidates(DEFAULT_PROXY_MODE);
  const errors = [];

  for (const proxyName of proxyCandidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const proxyUrl = buildProxyUrl(proxyName, url);

    try {
      const response = await fetch(proxyUrl, {
        signal: controller.signal,
        redirect: "follow",
        cache: "no-store",
        headers: {
          accept: "application/vnd.apple.mpegurl,application/dash+xml,application/xml,text/plain,*/*",
        },
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${proxyName} failed (${response.status})`);
      }
      return {
        text,
        contentType: response.headers.get("content-type") || "",
        proxyUsed: proxyName,
      };
    } catch (error) {
      errors.push(`${proxyName}: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Unable to fetch manifest via proxy. ${errors.join(" | ")}`);
}

function parseHlsVariants(baseUrl, lines) {
  const variants = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF")) {
      continue;
    }

    const attributes = parseAttributeList(line.split(":").slice(1).join(":"));
    let nextUri = null;

    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim();
      if (!candidate || candidate.startsWith("#")) {
        continue;
      }
      nextUri = candidate;
      break;
    }

    if (!nextUri) {
      continue;
    }

    variants.push({
      url: absolutizeUrl(baseUrl, nextUri),
      bandwidth: Number(attributes.BANDWIDTH || 0),
      resolution: attributes.RESOLUTION || null,
      codecs: attributes.CODECS || null,
    });
  }

  return variants;
}

function pickBestVariant(variants) {
  if (!variants.length) {
    return null;
  }
  return [...variants].sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
}

function analyzeHlsMediaPlaylist(url, text, diagnostics) {
  const lines = text.split(/\r?\n/);
  const markers = [];
  const adBreaks = [];

  let mediaOffsetSeconds = 0;
  let pendingSegmentDuration = 0;
  let programDateAnchor = null;
  let targetDurationSeconds = null;
  let isLive = true;
  let parseErrors = 0;
  let openBreak = null;

  const closeOpenBreak = (endOffsetSeconds, endProgramDateTime, sourceTag) => {
    if (!openBreak) {
      return;
    }

    adBreaks.push({
      id: `break-${adBreaks.length + 1}`,
      startOffsetSeconds: round(openBreak.startOffsetSeconds),
      endOffsetSeconds: endOffsetSeconds === null ? null : round(endOffsetSeconds),
      durationSeconds:
        endOffsetSeconds === null ? null : round(endOffsetSeconds - openBreak.startOffsetSeconds),
      startProgramDateTime: openBreak.startProgramDateTime,
      endProgramDateTime: endProgramDateTime || null,
      state: endOffsetSeconds === null ? "open" : "closed",
      source: sourceTag,
    });

    openBreak = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    const currentProgramDateTime = resolveProgramDateTime(programDateAnchor, mediaOffsetSeconds);

    if (line.startsWith("#")) {
      if (line.startsWith("#EXT-X-ENDLIST")) {
        isLive = false;
      } else if (line.startsWith("#EXT-X-TARGETDURATION")) {
        const value = Number(line.split(":")[1]);
        if (Number.isFinite(value)) {
          targetDurationSeconds = value;
        }
      } else if (line.startsWith("#EXT-X-PROGRAM-DATE-TIME")) {
        const value = line.split(":").slice(1).join(":");
        const epochMs = Date.parse(value);
        if (Number.isFinite(epochMs)) {
          programDateAnchor = {
            epochMs,
            mediaOffsetSeconds,
          };
        } else {
          diagnostics.warnings.push(`Invalid PROGRAM-DATE-TIME at line ${index + 1}: ${value}`);
        }
      } else if (line.startsWith("#EXTINF")) {
        const value = line.split(":")[1]?.split(",")[0];
        const duration = Number(value);
        if (Number.isFinite(duration)) {
          pendingSegmentDuration = duration;
        } else {
          pendingSegmentDuration = 0;
          parseErrors += 1;
        }
      } else if (line.startsWith("#EXT-X-CUE-OUT")) {
        const cueInfo = line.split(":")[1] || "";
        const cueAttrs = parseAttributeList(cueInfo);
        const duration =
          Number(cueAttrs.DURATION || cueInfo) || Number(cueAttrs["PLANNED-DURATION"]) || null;

        markers.push(
          makeMarker({
            sourceUrl: url,
            type: "cue-out",
            offsetSeconds: mediaOffsetSeconds,
            lineNumber: index + 1,
            tag: line,
            programDateTime: currentProgramDateTime,
            durationSeconds: Number.isFinite(duration) ? duration : null,
            details: cueAttrs,
          }),
        );

        if (openBreak) {
          closeOpenBreak(mediaOffsetSeconds, currentProgramDateTime, "forced-close");
        }

        openBreak = {
          startOffsetSeconds: mediaOffsetSeconds,
          startProgramDateTime: currentProgramDateTime,
        };
      } else if (line.startsWith("#EXT-X-CUE-IN")) {
        markers.push(
          makeMarker({
            sourceUrl: url,
            type: "cue-in",
            offsetSeconds: mediaOffsetSeconds,
            lineNumber: index + 1,
            tag: line,
            programDateTime: currentProgramDateTime,
          }),
        );

        if (!openBreak) {
          diagnostics.warnings.push(
            `CUE-IN appeared without a matching CUE-OUT at line ${index + 1}.`,
          );
        } else {
          closeOpenBreak(mediaOffsetSeconds, currentProgramDateTime, "cue-in");
        }
      } else if (line.startsWith("#EXT-X-CUE-OUT-CONT")) {
        markers.push(
          makeMarker({
            sourceUrl: url,
            type: "cue-out-cont",
            offsetSeconds: mediaOffsetSeconds,
            lineNumber: index + 1,
            tag: line,
            programDateTime: currentProgramDateTime,
          }),
        );
      } else if (line.startsWith("#EXT-OATCLS-SCTE35") || line.startsWith("#EXT-X-SCTE35")) {
        markers.push(
          makeMarker({
            sourceUrl: url,
            type: "scte35",
            offsetSeconds: mediaOffsetSeconds,
            lineNumber: index + 1,
            tag: line,
            programDateTime: currentProgramDateTime,
          }),
        );
      } else if (line.startsWith("#EXT-X-DATERANGE")) {
        const attrs = parseAttributeList(line.split(":").slice(1).join(":"));
        const hasScteMarker =
          attrs["SCTE35-OUT"] || attrs["SCTE35-IN"] || attrs["SCTE35-CMD"] || attrs.CUE;

        if (hasScteMarker) {
          markers.push(
            makeMarker({
              sourceUrl: url,
              type: "daterange",
              offsetSeconds: mediaOffsetSeconds,
              lineNumber: index + 1,
              tag: line,
              programDateTime: attrs["START-DATE"] || currentProgramDateTime,
              durationSeconds: Number(attrs.DURATION || attrs["PLANNED-DURATION"]) || null,
              details: attrs,
            }),
          );
        }

        if (attrs["SCTE35-OUT"]) {
          if (openBreak) {
            closeOpenBreak(mediaOffsetSeconds, currentProgramDateTime, "forced-close");
          }
          openBreak = {
            startOffsetSeconds: mediaOffsetSeconds,
            startProgramDateTime: attrs["START-DATE"] || currentProgramDateTime,
          };
        }

        if (attrs["SCTE35-IN"] && openBreak) {
          closeOpenBreak(mediaOffsetSeconds, attrs["END-DATE"] || currentProgramDateTime, "daterange");
        }
      }

      continue;
    }

    if (pendingSegmentDuration > 0) {
      mediaOffsetSeconds += pendingSegmentDuration;
      pendingSegmentDuration = 0;
    }
  }

  if (openBreak) {
    closeOpenBreak(null, null, "manifest-ended");
  }

  if (parseErrors > 0) {
    diagnostics.warnings.push(`Could not parse ${parseErrors} segment duration value(s).`);
  }
  if (!markers.length) {
    diagnostics.warnings.push(
      "No SCTE-related HLS markers were detected in the current playlist window.",
    );
  }
  if (isLive && !programDateAnchor) {
    diagnostics.info.push(
      "Live playlist has no PROGRAM-DATE-TIME tags; marker times are shown as offsets only.",
    );
  }

  return {
    streamType: "hls",
    manifestKind: "media",
    inspectedUrl: url,
    playlistWindowSeconds: round(mediaOffsetSeconds),
    isLive,
    targetDurationSeconds,
    markers,
    adBreaks,
  };
}

async function analyzeHls(url, text) {
  const diagnostics = {
    info: [],
    warnings: [],
    errors: [],
  };

  const lines = text.split(/\r?\n/);
  const variants = parseHlsVariants(url, lines);

  if (variants.length > 0) {
    const bestVariant = pickBestVariant(variants);
    diagnostics.info.push(
      `Master playlist detected (${variants.length} variants). Polling selected media playlist: ${bestVariant.url}`,
    );

    const child = await fetchTextViaProxy(bestVariant.url);
    const media = analyzeHlsMediaPlaylist(bestVariant.url, child.text, diagnostics);

    return {
      ...media,
      diagnostics,
      fetchMeta: {
        proxyUsed: child.proxyUsed,
      },
      variantSelection: {
        selected: bestVariant,
        available: variants,
      },
      selectedMediaUrl: bestVariant.url,
    };
  }

  const media = analyzeHlsMediaPlaylist(url, text, diagnostics);
  return {
    ...media,
    diagnostics,
    selectedMediaUrl: url,
  };
}

function directChildrenByName(node, name) {
  return Array.from(node.children || []).filter((child) => child.localName === name);
}

function walkDashForEvents(node, periodStartSeconds, sourceUrl, markers, adBreaks, diagnostics) {
  if (!node) {
    return;
  }

  const eventStreams = directChildrenByName(node, "EventStream");
  eventStreams.forEach((eventStream) => {
    const schemeIdUri = eventStream.getAttribute("schemeIdUri") || "unknown";
    const timescale = Number(eventStream.getAttribute("timescale") || "1") || 1;
    const value = eventStream.getAttribute("value") || null;
    const events = directChildrenByName(eventStream, "Event");

    events.forEach((eventNode, index) => {
      const presentationTimeTicks = Number(eventNode.getAttribute("presentationTime") || "0") || 0;
      const durationTicks = Number(eventNode.getAttribute("duration"));
      const id = eventNode.getAttribute("id") || `${schemeIdUri}-${index + 1}`;
      const offsetSeconds = periodStartSeconds + presentationTimeTicks / timescale;
      const durationSeconds = Number.isFinite(durationTicks) ? durationTicks / timescale : null;
      const payloadHint = (eventNode.textContent || "").trim().replace(/\s+/g, " ").slice(0, 140);
      const scteFingerprint = `${schemeIdUri} ${value || ""} ${payloadHint || ""}`;
      const isScteEvent = hasScteSignal(scteFingerprint);
      if (!isScteEvent) {
        return;
      }
      const markerType = "scte35-event";

      markers.push(
        makeMarker({
          sourceUrl,
          type: markerType,
          offsetSeconds,
          lineNumber: index + 1,
          tag: `EventStream:${schemeIdUri}`,
          programDateTime: null,
          durationSeconds,
          details: {
            eventId: id,
            schemeIdUri,
            value,
            payloadHint: payloadHint || null,
          },
        }),
      );

      if (durationSeconds && durationSeconds > 0) {
        adBreaks.push({
          id: `dash-break-${adBreaks.length + 1}`,
          startOffsetSeconds: round(offsetSeconds),
          endOffsetSeconds: round(offsetSeconds + durationSeconds),
          durationSeconds: round(durationSeconds),
          startProgramDateTime: null,
          endProgramDateTime: null,
          state: "closed",
          source: `event:${schemeIdUri}`,
        });
      }
    });
  });

  directChildrenByName(node, "InbandEventStream").forEach((inband) => {
    const scheme = inband.getAttribute("schemeIdUri") || "";
    if (scheme.toLowerCase().includes("scte")) {
      diagnostics.info.push(
        `InbandEventStream (${scheme}) found. Additional SCTE cues may exist only in media segments.`,
      );
    }
  });

  directChildrenByName(node, "AdaptationSet").forEach((adaptationSet) => {
    walkDashForEvents(adaptationSet, periodStartSeconds, sourceUrl, markers, adBreaks, diagnostics);
  });
  directChildrenByName(node, "Representation").forEach((representation) => {
    walkDashForEvents(representation, periodStartSeconds, sourceUrl, markers, adBreaks, diagnostics);
  });
}

function analyzeDash(url, text) {
  const diagnostics = {
    info: [],
    warnings: [],
    errors: [],
  };

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "application/xml");
  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) {
    throw new Error(`Unable to parse MPD XML: ${parserError.textContent.trim()}`);
  }

  const mpd = xmlDoc.documentElement;
  if (!mpd || mpd.localName !== "MPD") {
    throw new Error("MPD root node not found.");
  }

  const markers = [];
  const adBreaks = [];
  const periods = directChildrenByName(mpd, "Period");

  periods.forEach((period, index) => {
    const startAttr = period.getAttribute("start");
    const startSeconds = startAttr ? parseIsoDuration(startAttr) || 0 : 0;
    if (startAttr && parseIsoDuration(startAttr) === null) {
      diagnostics.warnings.push(
        `Period ${index + 1} start (${startAttr}) could not be parsed, assuming 0s.`,
      );
    }
    walkDashForEvents(period, startSeconds, url, markers, adBreaks, diagnostics);
  });

  const type = mpd.getAttribute("type") || "static";
  const mediaPresentationDuration = parseIsoDuration(mpd.getAttribute("mediaPresentationDuration"));

  if (!markers.length) {
    diagnostics.warnings.push("No EventStream SCTE markers found in the MPD.");
  }
  if (type === "dynamic" && !mpd.getAttribute("availabilityStartTime")) {
    diagnostics.info.push(
      "Dynamic MPD has no availabilityStartTime; absolute wall-clock marker times are unavailable.",
    );
  }

  return {
    streamType: "dash",
    inspectedUrl: url,
    isLive: type === "dynamic",
    playlistWindowSeconds: round(mediaPresentationDuration),
    targetDurationSeconds: null,
    markers,
    adBreaks,
    diagnostics,
    selectedMediaUrl: url,
  };
}

async function analyzeStream(url) {
  const root = await fetchTextViaProxy(url);
  const type = detectManifestType(url, root.text, root.contentType);

  if (type === "hls") {
    const hls = await analyzeHls(url, root.text);
    return {
      ...hls,
      fetchedAt: toIsoNow(),
      sourceType: "hls",
      fetchMeta: hls.fetchMeta || { proxyUsed: root.proxyUsed },
    };
  }

  if (type === "dash") {
    const dash = analyzeDash(url, root.text);
    return {
      ...dash,
      fetchedAt: toIsoNow(),
      sourceType: "dash",
      fetchMeta: { proxyUsed: root.proxyUsed },
    };
  }

  throw new Error("Unsupported manifest type. URL must resolve to an HLS (.m3u8) or DASH (.mpd) manifest.");
}

function addEventLogEntry({
  source,
  type,
  offsetSeconds = null,
  programDateTime = null,
  details = "",
  rawDetails = null,
  uniqueKey,
}) {
  const now = toIsoNow();
  const key =
    uniqueKey ||
    `${source}|${type}|${round(offsetSeconds) || "na"}|${programDateTime || "na"}|${details}`;
  const existing = state.eventLogMap.get(key);

  if (existing) {
    existing.lastSeenAt = now;
    existing.seenCount += 1;
    state.eventLogMap.set(key, existing);
    state.lastScteEventAt = now;
    state.lastScteEventType = existing.signalType || existing.type;
    state.lastScteEventSource = existing.source;
    return false;
  }

  const signalType = deriveSignalTypeFromRaw(rawDetails || details || type);
  const macroSummary = extractScteAttributeSummary(rawDetails || details || "");

  state.eventLogMap.set(key, {
    source,
    type,
    signalType,
    macroSummary,
    offsetSeconds: round(offsetSeconds),
    programDateTime,
    details,
    rawDetails,
    firstSeenAt: now,
    lastSeenAt: now,
    seenCount: 1,
  });

  state.lastScteEventAt = now;
  state.lastScteEventType = signalType !== "Unknown" ? signalType : type;
  state.lastScteEventSource = source;

  return true;
}

function ingestManifestEvents(markers) {
  let newCount = 0;
  markers.forEach((marker) => {
    const added = addEventLogEntry({
      source: "[Manifest Parse]",
      type: marker.type,
      offsetSeconds: marker.offsetSeconds,
      programDateTime: marker.programDateTime,
      details: compactDetails(marker.tag, 180),
      rawDetails: {
        markerType: marker.type,
        tag: marker.tag,
        attributes: marker.details,
      },
      uniqueKey: `manifest|${marker.signature}`,
    });
    if (added) {
      newCount += 1;
    }
  });
  return newCount;
}

function getJwPosition(player) {
  try {
    const position = Number(player.getPosition());
    return Number.isFinite(position) ? position : null;
  } catch (_error) {
    return null;
  }
}

function registerJwEvent(eventType, payload) {
  const isAdBreakEvent = eventType === "adBreakStart" || eventType === "adBreakEnd";
  const isTimedMetadataEvent = eventType === "meta" || eventType === "metadataCueParsed";

  if (!isAdBreakEvent && !isTimedMetadataEvent) {
    return;
  }

  if (isTimedMetadataEvent && !hasScteSignal(payload)) {
    return;
  }

  if (eventType === "adBreakStart") {
    state.jwAdBreakActive = true;
  } else if (eventType === "adBreakEnd") {
    state.jwAdBreakActive = false;
  }

  const position = getJwPosition(state.jwPlayerInstance);
  const stableSignature = buildStableJwPayloadSignature(payload);
  addEventLogEntry({
    source: "[JW Event]",
    type: eventType,
    offsetSeconds: position,
    programDateTime: null,
    details: describeJwEvent(eventType, payload),
    rawDetails: payload,
    uniqueKey: `jw|${eventType}|${stableSignature}`,
  });
  renderEventLog();
}

function setSummary(data) {
  clearChildren(summaryList);
  const entries = [
    ["Detected Type", `${data.sourceType?.toUpperCase() || "-"}`],
    ["Manifest Kind", data.manifestKind || "-"],
    ["Input URL", state.activeInputUrl || "-"],
    ["Polling Manifest URL", state.pollManifestUrl || "-"],
    ["Proxy Used", data.fetchMeta?.proxyUsed || "-"],
    ["Live Stream", data.isLive ? "Yes" : "No"],
    ["Playlist Window (s)", formatTime(data.playlistWindowSeconds)],
    ["Target Duration (s)", formatTime(data.targetDurationSeconds)],
    ["Fetched At", data.fetchedAt || "-"],
    ["Manifest Markers", String(data.markers?.length || 0)],
    ["Ad Breaks", String(data.adBreaks?.length || 0)],
    ["Last SCTE Event", state.lastScteEventAt ? `${state.lastScteEventType} @ ${state.lastScteEventAt}` : "-"],
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

  const info = [...(data.diagnostics?.info || [])];
  const warnings = [...(data.diagnostics?.warnings || [])];
  const errors = [...(data.diagnostics?.errors || [])];

  state.jwSessionErrors.forEach((item) => {
    errors.push(`JW Player: ${item}`);
  });

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

function renderEventSummary(rows) {
  if (!eventSummaryBarEl) {
    return;
  }

  const outCount = rows.filter(
    (row) => row.signalType === "CUE-OUT" || row.signalType === "SCTE35-OUT",
  ).length;
  const inCount = rows.filter(
    (row) => row.signalType === "CUE-IN" || row.signalType === "SCTE35-IN",
  ).length;

  const paired = Math.min(outCount, inCount);
  let pairingText = "Paired: none yet";
  if (outCount === 0 && inCount === 0) {
    pairingText = "Paired: no CUE markers yet";
  } else if (outCount === inCount) {
    pairingText = `Paired: ${paired} matched`;
  } else if (outCount > inCount) {
    pairingText = `Orphaned: ${outCount - inCount} CUE-OUT without CUE-IN`;
  } else {
    pairingText = `Orphaned: ${inCount - outCount} CUE-IN without CUE-OUT`;
  }

  eventSummaryBarEl.innerHTML =
    `<span class="summary-chip summary-chip-out">CUE-OUT: ${outCount}</span>` +
    `<span class="summary-chip summary-chip-in">CUE-IN: ${inCount}</span>` +
    `<span class="summary-chip summary-chip-paired">${pairingText}</span>`;
}

function renderEventLog() {
  clearChildren(eventsBody);
  const rows = Array.from(state.eventLogMap.values()).sort((a, b) =>
    a.firstSeenAt > b.firstSeenAt ? -1 : 1,
  );
  renderEventSummary(rows);

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const status = getStatusBadgeForSignal(row.signalType);
    const cells = [
      row.source,
      row.signalType || "Unknown",
      formatUtcWallClock(row.firstSeenAt),
      formatTime(row.offsetSeconds),
      row.macroSummary || "-",
    ];

    const sourceTd = document.createElement("td");
    sourceTd.textContent = `${cells[0]}${row.seenCount > 1 ? ` (seen ${row.seenCount}x)` : ""}`;
    tr.appendChild(sourceTd);

    const signalTd = document.createElement("td");
    signalTd.textContent = cells[1];
    tr.appendChild(signalTd);

    const statusTd = document.createElement("td");
    const statusPill = document.createElement("span");
    statusPill.className = status.className;
    statusPill.textContent = status.label;
    statusTd.appendChild(statusPill);
    tr.appendChild(statusTd);

    const wallClockTd = document.createElement("td");
    wallClockTd.textContent = cells[2];
    tr.appendChild(wallClockTd);

    const playbackTd = document.createElement("td");
    playbackTd.textContent = cells[3];
    tr.appendChild(playbackTd);

    const macroTd = document.createElement("td");
    macroTd.textContent = cells[4];
    tr.appendChild(macroTd);

    eventsBody.appendChild(tr);
  });
}

function setAdBreaks(data) {
  clearChildren(breaksBody);
  (data.adBreaks || []).forEach((adBreak, index) => {
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

function setAdMarkerStatus(data) {
  const hasOpenManifestBreak = (data.adBreaks || []).some((item) => item.state === "open");
  const active = state.jwAdBreakActive || hasOpenManifestBreak;
  const nowMs = Date.now();
  const recentWindowMs = 2 * 60 * 1000;
  const lastEventMs = state.lastScteEventAt ? Date.parse(state.lastScteEventAt) : null;
  const isRecent =
    Number.isFinite(lastEventMs) && nowMs - lastEventMs <= recentWindowMs;

  adMarkerStatusEl.className = "marker-status";

  if (active) {
    adMarkerStatusEl.classList.add("marker-status-active");
    adMarkerStatusEl.textContent = "AD BREAK ACTIVE";
    adMarkerDetailEl.textContent =
      "SCTE ad break is currently active (from manifest and/or JW event signals).";
    return;
  }

  if (isRecent) {
    adMarkerStatusEl.classList.add("marker-status-recent");
    adMarkerStatusEl.textContent = "MARKER DETECTED RECENTLY";
    adMarkerDetailEl.textContent = `Last marker: ${state.lastScteEventType || "unknown"} from ${
      state.lastScteEventSource || "unknown source"
    } at ${state.lastScteEventAt}.`;
    return;
  }

  adMarkerStatusEl.classList.add("marker-status-clear");
  adMarkerStatusEl.textContent = "NO RECENT AD MARKER";
  adMarkerDetailEl.textContent = "No SCTE marker detected in the recent monitoring window.";
}

function render(data) {
  setSummary(data);
  setDiagnostics(data);
  setAdMarkerStatus(data);
  renderEventLog();
  setAdBreaks(data);
  setTimeline(data);
}

function resetForNewInput(url) {
  state.activeInputUrl = url;
  state.pollManifestUrl = null;
  state.latest = null;
  state.eventLogMap.clear();
  state.jwSessionErrors = [];
  state.jwConfiguredStreamUrl = null;
  state.jwConfiguredPlayerId = null;
  state.jwAdBreakActive = false;
  state.lastScteEventAt = null;
  state.lastScteEventType = null;
  state.lastScteEventSource = null;
  clearChildren(eventsBody);
  clearChildren(breaksBody);
  clearChildren(summaryList);
  clearChildren(diagnosticsList);
  clearChildren(timelineEl);
  if (eventSummaryBarEl) {
    eventSummaryBarEl.textContent = "No CUE markers detected yet.";
  }
  adMarkerStatusEl.className = "marker-status marker-status-idle";
  adMarkerStatusEl.textContent = "No data yet";
  adMarkerDetailEl.textContent = "Run Analyze Once or Start Monitoring.";
}

async function ensureJwLibrary() {
  const playerId = jwPlayerIdInput.value.trim();
  if (!playerId) {
    throw new Error("Set your JW Player ID first.");
  }

  if (window.jwplayer && state.jwScriptPlayerIdLoaded === playerId) {
    return;
  }

  if (state.jwScriptPromise && state.jwScriptPlayerIdLoaded === playerId) {
    await state.jwScriptPromise;
    return;
  }

  const existing = document.getElementById("jw-library-script");
  if (existing) {
    existing.remove();
  }

  state.jwScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "jw-library-script";
    script.src = `https://cdn.jwplayer.com/libraries/${encodeURIComponent(playerId)}.js`;
    script.async = true;
    script.onload = () => {
      state.jwScriptPlayerIdLoaded = playerId;
      resolve();
    };
    script.onerror = () => {
      state.jwScriptPromise = null;
      reject(new Error("Unable to load JW Player library from CDN."));
    };
    document.head.appendChild(script);
  });

  await state.jwScriptPromise;
}

async function setupJwPlayer(streamUrl) {
  const requestedPlayerId = jwPlayerIdInput.value.trim();
  if (!requestedPlayerId) {
    state.jwSessionErrors = ["Set your JW Player ID first."];
    return;
  }

  try {
    await ensureJwLibrary();
  } catch (error) {
    state.jwSessionErrors = [error.message];
    return;
  }

  if (!window.jwplayer) {
    state.jwSessionErrors = ["JW Player library loaded but jwplayer global is unavailable."];
    return;
  }

  if (
    state.jwPlayerInstance &&
    state.jwConfiguredStreamUrl === streamUrl &&
    state.jwConfiguredPlayerId === requestedPlayerId
  ) {
    return;
  }

  try {
    if (state.jwPlayerInstance && typeof state.jwPlayerInstance.remove === "function") {
      state.jwPlayerInstance.remove();
    }
  } catch (_error) {
    // Ignore cleanup errors and continue with a fresh setup.
  }

  try {
    const player = window.jwplayer("jw-player");
    player.setup({
      file: streamUrl,
      width: "100%",
      aspectratio: "16:9",
      autostart: false,
      controls: true,
      mute: false,
      primary: "html5",
    });

    player.on("meta", (payload) => registerJwEvent("meta", payload));
    player.on("adBreakStart", (payload) => registerJwEvent("adBreakStart", payload));
    player.on("adBreakEnd", (payload) => registerJwEvent("adBreakEnd", payload));
    player.on("metadataCueParsed", (payload) => registerJwEvent("metadataCueParsed", payload));
    player.on("error", (payload) => {
      const detail = payload?.message || safeJsonStringify(payload);
      state.jwSessionErrors = [detail];
      if (state.latest) {
        render(state.latest);
      }
    });

    state.jwSessionErrors = [];
    state.jwPlayerInstance = player;
    state.jwConfiguredStreamUrl = streamUrl;
    state.jwConfiguredPlayerId = requestedPlayerId;
  } catch (error) {
    state.jwSessionErrors = [`JW setup failed: ${error.message}`];
  }
}

function makeFriendlyAnalysisError(error) {
  const message = error?.message || "Unknown error";
  if (message.includes("Unable to fetch manifest via proxy")) {
    return (
      "Could not fetch the manifest through CORS proxies. " +
      "Auto fallback is applied automatically (corsproxy.io then allorigins). " +
      "Verify the stream URL still works in JW Player and keep signed query parameters unchanged."
    );
  }
  if (message.includes("403") || message.includes("401")) {
    return (
      "Manifest request was rejected (auth/signature issue). " +
      "If this is a signed URL, ensure it has not expired and use the exact original URL."
    );
  }
  return message;
}

async function analyzeOnce() {
  if (state.inFlight) {
    return;
  }

  const inputUrl = urlInput.value.trim();
  if (!inputUrl) {
    setStatus("Enter a URL before analyzing.", true);
    return;
  }

  let normalized;
  try {
    normalized = new URL(inputUrl);
  } catch (_error) {
    setStatus("The provided URL is invalid.", true);
    return;
  }

  if (!["http:", "https:"].includes(normalized.protocol)) {
    setStatus("Only HTTP and HTTPS URLs are supported.", true);
    return;
  }

  if (state.activeInputUrl !== normalized.toString()) {
    resetForNewInput(normalized.toString());
  }

  state.inFlight = true;
  setStatus("Analyzing stream from browser via CORS proxy...");

  try {
    const targetUrl = state.pollManifestUrl || normalized.toString();
    const analysis = await analyzeStream(targetUrl);
    analysis.inspectedUrl = targetUrl;

    state.latest = analysis;
    state.pollManifestUrl = analysis.selectedMediaUrl || targetUrl;

    const newManifestEvents = ingestManifestEvents(analysis.markers || []);
    await setupJwPlayer(normalized.toString());
    render(analysis);

    setStatus(
      `Analysis complete. ${analysis.markers?.length || 0} manifest marker(s), ${newManifestEvents} new manifest events this cycle.`,
    );
  } catch (error) {
    setStatus(`Error: ${makeFriendlyAnalysisError(error)}`, true);
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
