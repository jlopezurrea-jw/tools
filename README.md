# JWX Internal Metadata Updater (Static)

Internal web tool for updating JWX media metadata directly from the browser using
the JW Platform Management API.

## What changed

This project is now **fully static**:

- No Express server
- No `/api/*` proxy routes
- Frontend calls `https://api.jwplayer.com` directly with `fetch`
- `siteId` and `apiSecret` are entered in the UI and used per request
- Player library script is loaded from `Player ID` using:
  `https://cdn.jwplayer.com/libraries/{PLAYER_ID}.js`

## Features

The UI has four tabs:

1. **Single update**
   - Update one media item (`title`, `description`, `custom_params`)
2. **Bulk custom params (lines)**
   - Apply shared custom params to many Media IDs
3. **Bulk custom params (CSV)**
   - Upload CSV: `MediaID,<custom_param_1>,<custom_param_2>,...`
4. **Series setup**
   - Create placeholder series
   - Map seasons and episodes to a series

Connection settings also include:

- **Player ID** (optional): dynamically injects JW Player library script

## Metadata merge behavior

Before a media update, the app fetches existing metadata and merges changes:

- Existing `custom_params` are preserved
- New keys are added
- Matching keys are overwritten with incoming values
- Existing keys not present in the request remain untouched

## Local run

No Node backend is required.

```bash
npm start
```

This serves `public/` as static files at:

- `http://localhost:3000`

You can also host the `public/` directory on any static host (including GitLab Pages).

## GitLab Pages

Deploy the static files from `public/` and open the hosted page.
The app will call JW APIs directly from the browser.

## Security note

Because this is a browser-only app, the API secret is used client-side.
Use this only as an internal trusted tool and avoid exposing it publicly.

## Troubleshooting

- If you see `HTTP 501 Unsupported method ('POST')`, your browser is likely
  running an older cached script that still targets `/api/*` backend routes.
  Hard refresh (Ctrl/Cmd+Shift+R) and reload the page.
