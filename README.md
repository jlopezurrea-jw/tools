# JWX Internal Metadata Updater

Simple internal web tool for updating media metadata on a JWX property through the
JW Platform Management API.

The app uses:

- Endpoint: `PATCH https://api.jwplayer.com/v2/sites/{site_id}/media/{media_id}/`
- Auth header: `Authorization: Bearer {api_secret}`

---

## Features

The UI has three tabs:

1. **Single update**
   - Input: Property ID, API Secret, Media ID
   - Optional updates: `title`, `description`, `custom_params`

2. **Bulk custom params (lines)**
   - Input: Property ID, API Secret
   - Input multiple Media IDs (one per line)
   - Applies one shared custom-parameter set to all listed Media IDs

3. **Bulk custom params (CSV)**
   - Input: Property ID, API Secret
   - Upload CSV where:
     - first column header is `MediaID`
     - remaining column headers are custom-parameter keys
     - each row updates one media item with row-specific custom-parameter values

4. **Series setup**
   - Input: Property ID, API Secret
   - Create a new series
   - Define seasons
   - Define episode mappings (Media IDs with episode numbers) for each season

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

### Single update tab

- Supports metadata update for one Media ID.
- Includes `title`, `description`, and `custom_params`.
- If you provide only one field, only that field is sent.

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

This tab creates a series and then creates each provided season under that
series, including episode assignments.

Required fields:

- `seriesTitle`
- `seasons` JSON array

Season JSON shape:

```json
[
  {
    "number": 1,
    "title": "Season 1",
    "description": "Optional text",
    "episodes": [
      { "mediaId": "AbCd1234", "episodeNumber": 1 },
      { "mediaId": "XyZ987ab", "episodeNumber": 2 }
    ]
  }
]
```

Sort options (optional):

- `sort.season`: `asc` or `dsc`
- `sort.episode`: `asc` or `dsc`

---

## Payload examples

Single update request payload:

```json
{
  "siteId": "abc12345",
  "apiSecret": "your_secret",
  "mediaId": "AbCd1234",
  "title": "New title",
  "description": "New description",
  "customParams": {
    "department": "marketing"
  }
}
```

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

Series setup request payload:

```json
{
  "siteId": "abc12345",
  "apiSecret": "your_secret",
  "seriesTitle": "My New Series",
  "sort": {
    "season": "asc",
    "episode": "asc"
  },
  "seasons": [
    {
      "number": 1,
      "title": "Season 1",
      "description": "Optional",
      "episodes": [
        { "mediaId": "AbCd1234", "episodeNumber": 1 },
        { "mediaId": "XyZ987ab", "episodeNumber": 2 }
      ]
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
