# JWX Custom Content Type Service

Service + UI for creating JWX content type schemas and exporting upload-ready JSON.

## What it does

- Uses the same schema shape as your JWX examples:
  - `description`, `display_name`, `hosting_type`, `is_active`, `is_series`, `languages`, `name`, `searchable`, `sections`
- Section-based builder:
  - Add/remove/reorder sections
  - Add/remove/reorder fields inside each section
- Field builder supports:
  - `input`, `select`, `multiselect`, `media_select`, `toggle`, `date`, `date_time`, `playlist_multiselect`
  - `required`, `read_only`, `default`, `placeholder`, `translatable`, `options`
- Strict server-side validation and normalization
- Import existing schema JSON into the UI, edit, then re-export
- Download generated schema as `<name>.json`

## Run locally

```bash
npm start
```

Open: `http://localhost:3000`

## API endpoints

- `GET /api/field-config`
  - Returns supported hosting types and field type capabilities.
- `POST /api/content-types`
  - Accepts schema payload and returns validated/normalized JWX JSON.

Example request:

```json
{
  "description": "Movie Schema",
  "display_name": "Movie",
  "hosting_type": "hosted",
  "is_active": true,
  "is_series": false,
  "languages": [{ "code": "en", "name": "English" }],
  "name": "movie",
  "searchable": true,
  "sections": [
    {
      "title": "General",
      "fields": [
        {
          "description": "Use genre to categorize content",
          "details": {
            "field_type": "select",
            "placeholder": "Select a genre",
            "options": [
              { "label": "Action", "value": "Action" },
              { "label": "Comedy", "value": "Comedy" }
            ]
          },
          "label": "Genre",
          "param": "genre",
          "required": true
        }
      ]
    }
  ]
}
```

## Tests

```bash
npm test
```
