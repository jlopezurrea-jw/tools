const { XMLParser } = require("fast-xml-parser");
const { URL } = require("node:url");

const FETCH_TIMEOUT_MS = 12000;

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

  // Approximation is acceptable for diagnostics/timeline display.
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

  for (const chunk of chunks) {
    const separator = chunk.indexOf("=");
    if (separator === -1) {
      attributes[chunk] = true;
      continue;
    }

    const key = chunk.slice(0, separator).trim();
    let val = chunk.slice(separator + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    attributes[key] = val;
  }

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
    id: `${type}-${lineNumber}-${Math.abs(
      Math.floor((offsetSeconds || 0) * 1000),
    )}`,
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

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "scte-marker-analyzer/1.0",
      },
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    return {
      text,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function detectManifestType(url, text, contentType) {
  const lowerText = (text || "").trim().slice(0, 200).toLowerCase();
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

function pickBestVariant(variants) {
  if (!variants.length) {
    return null;
  }

  const sorted = [...variants].sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
  return sorted[0];
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
        endOffsetSeconds === null
          ? null
          : round(endOffsetSeconds - openBreak.startOffsetSeconds),
      startProgramDateTime: openBreak.startProgramDateTime,
      endProgramDateTime: endProgramDateTime || null,
      state: endOffsetSeconds === null ? "open" : "closed",
      source: sourceTag,
    });

    openBreak = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const currentProgramDateTime = resolveProgramDateTime(
      programDateAnchor,
      mediaOffsetSeconds,
    );

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
          diagnostics.warnings.push(
            `Invalid PROGRAM-DATE-TIME at line ${index + 1}: ${value}`,
          );
        }
      } else if (line.startsWith("#EXTINF")) {
        const value = line.split(":")[1]?.split(",")[0];
        const duration = Number(value);
        if (Number.isFinite(duration)) {
          pendingSegmentDuration = duration;
        } else {
          parseErrors += 1;
          pendingSegmentDuration = 0;
        }
      } else if (line.startsWith("#EXT-X-CUE-OUT")) {
        const cueInfo = line.split(":")[1] || "";
        const cueAttrs = parseAttributeList(cueInfo);
        const duration =
          Number(cueAttrs.DURATION || cueInfo) ||
          Number(cueAttrs["PLANNED-DURATION"]) ||
          null;

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

    // Media segment URI line.
    if (pendingSegmentDuration > 0) {
      mediaOffsetSeconds += pendingSegmentDuration;
      pendingSegmentDuration = 0;
    }
  }

  if (openBreak) {
    closeOpenBreak(null, null, "manifest-ended");
  }

  if (parseErrors > 0) {
    diagnostics.warnings.push(
      `Could not parse ${parseErrors} segment duration value(s) in the playlist.`,
    );
  }

  if (!markers.length) {
    diagnostics.warnings.push(
      "No SCTE-related HLS markers were detected in the current playlist window.",
    );
  }

  if (isLive && !programDateAnchor) {
    diagnostics.info.push(
      "Live playlist has no PROGRAM-DATE-TIME tags; marker times are shown as playlist offsets only.",
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
      `Master playlist detected (${variants.length} variants). Using highest bandwidth variant: ${bestVariant.url}`,
    );

    const child = await fetchText(bestVariant.url);
    const media = analyzeHlsMediaPlaylist(bestVariant.url, child.text, diagnostics);
    return {
      ...media,
      diagnostics,
      variantSelection: {
        selected: bestVariant,
        available: variants,
      },
    };
  }

  const media = analyzeHlsMediaPlaylist(url, text, diagnostics);
  return {
    ...media,
    diagnostics,
  };
}

function extractEventPayload(eventNode) {
  if (!eventNode || typeof eventNode !== "object") {
    return null;
  }

  if (typeof eventNode["#text"] === "string") {
    return eventNode["#text"].slice(0, 120);
  }

  const keys = Object.keys(eventNode).filter((key) => !key.startsWith("@_"));
  if (!keys.length) {
    return null;
  }

  return `${keys[0]}`;
}

function walkDashForEvents(container, periodStartSeconds, sourceUrl, markers, adBreaks, diagnostics) {
  if (!container || typeof container !== "object") {
    return;
  }

  for (const eventStream of asArray(container.EventStream)) {
    const schemeIdUri = eventStream["@_schemeIdUri"] || "unknown";
    const timescale = Number(eventStream["@_timescale"] || 1) || 1;
    const value = eventStream["@_value"] || null;
    const events = asArray(eventStream.Event);

    for (let idx = 0; idx < events.length; idx += 1) {
      const event = events[idx];
      const presentationTimeTicks = Number(event["@_presentationTime"] || 0) || 0;
      const durationTicks = Number(event["@_duration"]);
      const id = event["@_id"] || `${schemeIdUri}-${idx + 1}`;

      const offsetSeconds = periodStartSeconds + presentationTimeTicks / timescale;
      const durationSeconds = Number.isFinite(durationTicks) ? durationTicks / timescale : null;
      const markerType = schemeIdUri.toLowerCase().includes("scte") ? "scte35-event" : "dash-event";

      markers.push(
        makeMarker({
          sourceUrl,
          type: markerType,
          offsetSeconds,
          lineNumber: idx + 1,
          tag: `EventStream:${schemeIdUri}`,
          programDateTime: null,
          durationSeconds,
          details: {
            eventId: id,
            schemeIdUri,
            value,
            payloadHint: extractEventPayload(event),
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
    }
  }

  for (const inband of asArray(container.InbandEventStream)) {
    const scheme = inband["@_schemeIdUri"] || "";
    if (scheme.toLowerCase().includes("scte")) {
      diagnostics.info.push(
        `InbandEventStream (${scheme}) detected: additional SCTE markers may be carried inside media segments, not only in the MPD.`,
      );
    }
  }

  for (const adaptationSet of asArray(container.AdaptationSet)) {
    walkDashForEvents(adaptationSet, periodStartSeconds, sourceUrl, markers, adBreaks, diagnostics);
  }

  for (const representation of asArray(container.Representation)) {
    walkDashForEvents(representation, periodStartSeconds, sourceUrl, markers, adBreaks, diagnostics);
  }
}

function analyzeDash(url, text) {
  const diagnostics = {
    info: [],
    warnings: [],
    errors: [],
  };

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    parseTagValue: false,
  });

  let mpd;
  try {
    mpd = parser.parse(text)?.MPD;
  } catch (error) {
    throw new Error(`Unable to parse MPD XML: ${error.message}`);
  }

  if (!mpd) {
    throw new Error("MPD root node not found.");
  }

  const markers = [];
  const adBreaks = [];
  const periods = asArray(mpd.Period);

  periods.forEach((period, index) => {
    const startAttr = period["@_start"];
    const startSeconds = startAttr ? parseIsoDuration(startAttr) || 0 : 0;
    if (startAttr && parseIsoDuration(startAttr) === null) {
      diagnostics.warnings.push(
        `Period ${index + 1} start time (${startAttr}) could not be parsed, assuming 0s.`,
      );
    }
    walkDashForEvents(period, startSeconds, url, markers, adBreaks, diagnostics);
  });

  const type = mpd["@_type"] || "static";
  const mediaPresentationDuration = parseIsoDuration(mpd["@_mediaPresentationDuration"]);

  if (!markers.length) {
    diagnostics.warnings.push("No EventStream SCTE markers found in the MPD.");
  }

  if (type === "dynamic" && !mpd["@_availabilityStartTime"]) {
    diagnostics.info.push(
      "Dynamic MPD has no availabilityStartTime; absolute wall-clock times may be unavailable.",
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
  };
}

async function analyzeStream(url) {
  const initialFetch = await fetchText(url);
  const type = detectManifestType(url, initialFetch.text, initialFetch.contentType);

  if (type === "hls") {
    const result = await analyzeHls(url, initialFetch.text);
    return {
      ...result,
      fetchedAt: new Date().toISOString(),
      sourceType: "hls",
    };
  }

  if (type === "dash") {
    const result = analyzeDash(url, initialFetch.text);
    return {
      ...result,
      fetchedAt: new Date().toISOString(),
      sourceType: "dash",
    };
  }

  throw new Error(
    "Unsupported manifest type. URL must resolve to an HLS (.m3u8) or DASH (.mpd) manifest.",
  );
}

module.exports = {
  analyzeStream,
};
