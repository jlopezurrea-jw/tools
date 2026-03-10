# JWX Custom Content Type Service

Service + UI for creating custom content type schemas and exporting them as JSON for upload in the JWX dashboard.

## What it does

- Lets users define a content type (name, id, description)
- Lets users add metadata fields
  - Select field type (text, number, boolean, date, enum, media)
  - Select display behavior for each field
  - Mark required fields
  - Add optional help text
  - Define enum options where needed
- Generates validated JSON schema
- Allows downloading schema as `<content_type_id>.json`

## Run locally

```bash
npm start
```

Open: `http://localhost:3000`

## API endpoints

- `GET /api/field-config`
  - Returns supported field types and display options.
- `POST /api/content-types`
  - Accepts a content type payload and returns generated JSON schema.

Example request:

```json
{
  "name": "Video Metadata",
  "description": "Metadata attached to video assets",
  "fields": [
    {
      "name": "Title",
      "type": "text",
      "display": "singleLine",
      "required": true
    },
    {
      "name": "Genre",
      "type": "enum",
      "display": "dropdown",
      "options": ["Drama", "Comedy", "Documentary"]
    }
  ]
}
```

## Tests

```bash
npm test
```
