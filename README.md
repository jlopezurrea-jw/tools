# SCTE Marker Analysis Tool

Web tool to monitor SCTE markers from **HLS** and **DASH** live streams (including JWX-provided outputs).

## What it does

- Accepts an HLS (`.m3u8`) or DASH (`.mpd`) URL.
- Polls the manifest continuously to "listen" for marker updates.
- Detects common SCTE-related signals:
  - HLS: `#EXT-X-CUE-OUT`, `#EXT-X-CUE-IN`, `#EXT-X-CUE-OUT-CONT`, `#EXT-OATCLS-SCTE35`, `#EXT-X-SCTE35`, `#EXT-X-DATERANGE` with SCTE attributes.
  - DASH: `EventStream` entries (especially SCTE scheme IDs).
- Shows **where in time** each marker appears:
  - playlist offset seconds
  - program date time (when available)
- Highlights ad breaks in a timeline and tables.
- Provides troubleshooting diagnostics (warnings, errors, and informational hints).

## Run locally

```bash
npm install
npm start
```

Open: `http://localhost:3000`

## Quick demo URLs

With the app running locally, paste either of these into the UI:

- `http://localhost:3000/samples/sample-hls.m3u8`
- `http://localhost:3000/samples/sample-dash.mpd`

## Notes

- For HLS master playlists, the analyzer auto-selects the highest bandwidth variant for inspection.
- Live feeds without `PROGRAM-DATE-TIME` tags can still be analyzed, but only relative offsets are available.
- Some DASH SCTE markers can be in-band (inside segments) and may not be fully represented in the MPD alone.
