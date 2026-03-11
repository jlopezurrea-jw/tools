# SCTE Marker Analysis Tool

Static browser tool to monitor SCTE markers from **HLS** and **DASH** live streams
(including JWX-provided outputs) and compare them against what **JW Player** emits.

## What it does

- Accepts an HLS (`.m3u8`) or DASH (`.mpd`) URL.
- Polls the **live** manifest continuously every 3 seconds to "listen" for marker updates.
- For **Analyze VOD Manifest**, no manifest proxy fetch is used: the tool performs a JW Player seek-scan (0s, 10s, 20s, ...) to trigger timed metadata without manual viewing.
- Detects common SCTE-related signals:
  - HLS: `#EXT-X-CUE-OUT`, `#EXT-X-CUE-IN`, `#EXT-X-CUE-OUT-CONT`, `#EXT-OATCLS-SCTE35`, `#EXT-X-SCTE35`, `#EXT-X-DATERANGE` with SCTE attributes.
  - DASH: `EventStream` entries (especially SCTE scheme IDs).
- Shows **where in time** each marker appears:
  - playlist offset seconds
  - program date time (when available)
- Highlights ad breaks in a timeline and tables.
- Shows a simple **Ad Marker Status** indicator:
  - `AD BREAK ACTIVE`
  - `MARKER DETECTED RECENTLY`
  - `NO RECENT AD MARKER`
- Provides troubleshooting diagnostics (warnings, errors, and informational hints).
- Integrates JW Player events into the event log:
  - `meta`
  - `adBreakStart`
  - `adBreakEnd`
  - `metadataCueParsed`
  (filtered to SCTE-related payloads only)
  with clear source labels:
  - `[Manifest Parse]`
  - `[JW Event]`
- Event Log includes engineer-focused fields:
  - Wall Clock Time (UTC detect time)
  - Playback Position
  - Signal Type (`CUE-OUT`, `CUE-IN`, `CUE-OUT-CONT`, `SCTE35-OUT`, `SCTE35-IN`, `Unknown`)
  - Macros / Attributes summary
  - Per-row status badges and CUE pairing summary bar

## Run as a static site

Open `public/index.html` directly in a browser, or host the `public/` directory on any static host.

## Quick demo URLs

If you serve `public/` from a local static server, paste either of these:

- `http://localhost:PORT/samples/sample-hls.m3u8`
- `http://localhost:PORT/samples/sample-dash.mpd`

## CORS proxy behavior

Live manifest fetching is done entirely in-browser via proxy URL prepending:

- `https://corsproxy.io/?<encoded-manifest-url>`
- `https://api.allorigins.win/raw?url=<encoded-manifest-url>`

Proxy handling is automatic and hidden in the UI: the app rotates `corsproxy.io` -> `allorigins` -> `corsproxy.org` with retries.
If your URL is signed/authenticated, use it exactly as provided (adding/changing query params can invalidate the signature).

## JW Player setup

The UI includes a JW Player **Player ID** input. Enter your Player ID so the app can load:

- `https://cdn.jwplayer.com/libraries/{PLAYER_ID}.js`

Once loaded, stream playback and JW timed metadata events are captured in the Event Log.

## Notes

- For HLS master playlists, the analyzer auto-selects the highest bandwidth variant and re-polls that media playlist in listen mode.
- Live feeds without `PROGRAM-DATE-TIME` tags can still be analyzed, but only relative offsets are available.
- Some DASH SCTE markers can be in-band (inside segments) and may not be fully represented in the MPD alone.
