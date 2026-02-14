# JWX Internal Metadata Updater

Simple internal web tool for updating media metadata on a JWX property through the
JW Platform Management API.

The app uses:

- Endpoint: `PATCH https://api.jwplayer.com/v2/sites/{site_id}/media/{media_id}/`
- Auth header: `Authorization: Bearer {api_secret}`

---

## Features

The UI has four tabs:

1. **Bulk custom params (lines)**
   - Input: Property ID, API Secret
   - Input multiple Media IDs (one per line)
   - Applies one shared custom-parameter set to all listed Media IDs

2. **Bulk custom params (CSV)**
   - Input: Property ID, API Secret
   - Upload CSV where:
     - first column header is `MediaID`
     - remaining column headers are custom-parameter keys
     - each row updates one media item with row-specific custom-parameter values

3. **Series setup**
   - Input: Property ID, API Secret
   - One-click placeholder series creation (returns `SeriesID`)
   - Season/episode mapping workspace
   - `+ Season` flow for adding multiple seasons with media toolboxes

4. **Bulk series create (CSV)**
   - Input: Property ID, API Secret
   - Upload one CSV file
   - Creates multiple series, their seasons, and episode mappings in one run

---

## Prerequisites

- Node.js 20+ (Node 22 works)
- A JWX Management API secret for the property you want to edit (entered in the UI)

---

## Step-by-step setup

### 1) Get your Management API secret

In the JWX dashboard:

1. Open **Developer Tools** -> **Management API**.
2. Select your property.
3. Create an API key if needed.
4. Copy the **secret** value.

Keep this secret private.

### 2) Install dependencies

```bash
npm install
```

### 3) Configure environment variables (optional)

Only `PORT` is used by default.

Create a `.env` file from `.env.example` if you want a custom port:

```bash
cp .env.example .env
```

Example:

```env
PORT=3000
```

### 4) Run the app

```bash
npm start
```

The server starts at:

- `http://localhost:3000`

### 5) Use the UI

1. Enter **Property ID** (`site_id`) at the top.
2. Enter **API Secret** at the top.
3. Choose a tab and submit your update request.
4. Review the result panel for status and per-item responses.

---

## Tab details

### Bulk custom params (lines) tab

Media IDs input example:

```text
AbCd1234
XyZ987ab
QwEr4567
```

Custom params input example:

```text
department=marketing
campaign=internal_q1
owner=content-ops
```

All listed Media IDs receive the same `custom_params` payload.

### Bulk custom params (CSV) tab

CSV example:

```csv
MediaID,department,campaign,owner
AbCd1234,marketing,winter,content-ops
XyZ987ab,sales,spring,news-team
QwEr4567,finance,q1,team-b
```

- `MediaID` is required in each row.
- Empty custom-parameter cells are ignored.
- Rows without custom-parameter values are skipped.

### Series setup tab

This tab now uses a two-step workflow:

1. **Create placeholder series**
   - Click **Create placeholder series**
   - Tool creates a placeholder series (auto-generated label if needed)
   - Returned `SeriesID` is displayed and auto-filled into Step 2

2. **Map seasons and episodes**
   - Enter or confirm `SeriesID`
   - Optional: set `Series Title` for the series dashboard label
   - Title update runs after create/map and includes media-title fallback for dashboard visibility
   - Add season cards with **+ Season**
   - Left side: season number and optional season title
   - Right side: Media toolbox using `MediaID` (one per line)
   - Episode numbers are assigned automatically by line order
     (`line 1 = episode 1`, `line 2 = episode 2`, etc.)

### Bulk series create (CSV) tab

CSV columns:

- `Series Title` (required)
- `Season Title` (required)
- `Season Number` (required, positive integer)
- `Episode Number` (required, positive integer)
- `MediaID` (required)

Recommended format: one row per episode.
You can still provide multiple Media IDs in one cell with `|` or `;`.

```csv
Series Title,Season Title,Season Number,Episode Number,MediaID
My Drama Series,Season 1,1,1,AbCd1234
My Drama Series,Season 1,1,2,XyZ987ab
My Drama Series,Season 2,2,1,QwEr4567
Nature Stories,Origins,1,1,RtYu5678;UiOp7890
```

How it works:

1. Groups CSV rows by `Series Title`.
2. Creates a placeholder series per group.
3. Applies `Series Title` after creation (series endpoint first, then media endpoint fallback).
4. Creates seasons and episode mappings from each grouped row set.

---

## Payload examples

Bulk lines request payload:

```json
{
  "siteId": "abc12345",
  "apiSecret": "your_secret",
  "mediaIds": ["AbCd1234", "XyZ987ab"],
  "customParams": {
    "department": "marketing",
    "campaign": "winter"
  }
}
```

Bulk CSV request payload (after parsing in browser):

```json
{
  "siteId": "abc12345",
  "apiSecret": "your_secret",
  "updates": [
    {
      "mediaId": "AbCd1234",
      "customParams": {
        "department": "marketing",
        "campaign": "winter"
      }
    }
  ]
}
```

Series placeholder request payload:

```json
{
  "siteId": "abc12345",
  "apiSecret": "your_secret"
}
```

Series mapping request payload:

```json
{
  "siteId": "abc12345",
  "apiSecret": "your_secret",
  "seriesId": "Series12345",
  "seriesTitle": "My Drama Series",
  "seasons": [
    {
      "number": 1,
      "title": "Season 1",
      "mediaIds": ["AbCd1234", "XyZ987ab"]
    }
  ]
}
```

Bulk series CSV request payload (after parsing in browser):

```json
{
  "siteId": "abc12345",
  "apiSecret": "your_secret",
  "rows": [
    {
      "seriesTitle": "My Drama Series",
      "seasonTitle": "Season 1",
      "seasonNumber": 1,
      "episodeNumber": 1,
      "mediaIds": ["AbCd1234"]
    },
    {
      "seriesTitle": "My Drama Series",
      "seasonTitle": "Season 1",
      "seasonNumber": 1,
      "episodeNumber": 2,
      "mediaIds": ["QwEr4567"]
    }
  ]
}
```

---

## Notes

- The backend validates required IDs and metadata limits before calling JW APIs.
- Bulk endpoints accept up to 300 items per request.
- API responses include per-item status/results for bulk operations.
- Series setup returns a `seriesId` plus per-season creation results.
- Series flows support series title updates via `seriesTitle` (`Series Title` in CSV).
- If the series endpoint does not reflect the title in dashboard, the backend also
  updates the linked media item title as a fallback.
- Placeholder series creation starts with empty metadata and only falls back to
  auto-title when required by tenant schema.
- CSV parser also accepts older aliases (`MediaIDs` column name) for
  backward compatibility.
