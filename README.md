# JWX Internal Metadata Updater

Simple internal web tool for updating media metadata on a JWX property through
the JW Platform Management API.

This tool updates:

- `title`
- `description`
- `custom_params` (key/value strings)

using the endpoint documented in the API reference:

- `PATCH https://api.jwplayer.com/v2/sites/{site_id}/media/{media_id}/`

and `Authorization: Bearer {api_secret}`.

---

## What this app does

1. Serves a small internal UI.
2. Collects:
   - Property ID (`site_id`)
   - Media ID (`media_id`)
   - Optional title
   - Optional description
   - Optional custom params
3. Sends the update through a backend endpoint so your API secret is never
   exposed to the browser.

---

## Prerequisites

- Node.js 20+ (Node 22 works)
- A JWX Management API secret for the property you want to edit

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

### 3) Configure environment variables

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Then edit `.env`:

```env
JWP_API_SECRET=your_real_management_api_secret
PORT=3000
```

### 4) Run the app

```bash
npm start
```

The server starts at:

- `http://localhost:3000`

### 5) Use the UI

1. Enter **Property ID** (`site_id`).
2. Enter **Media ID** (`media_id`).
3. Add any metadata fields you want to update:
   - title
   - description
   - custom params (`key=value`, one per line)
4. Click **Update metadata**.
5. Review the result panel for HTTP status and API response body.

---

## Custom parameter format

Use one key/value pair per line:

```text
department=marketing
campaign=internal_q1
owner=content-ops
```

---

## API payload sent by this tool

The backend sends:

```json
{
  "metadata": {
    "title": "New title",
    "description": "New description",
    "custom_params": {
      "department": "marketing"
    }
  }
}
```

Only fields you provide are included.

---

## Notes

- The backend validates required IDs and metadata limits before calling JWX.
- If no metadata fields are provided, the request is rejected.
- If the API secret is missing, the tool returns a server-side configuration
  error.
