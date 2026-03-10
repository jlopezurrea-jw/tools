const test = require("node:test");
const assert = require("node:assert/strict");
const { buildContentTypeDefinition } = require("../src/contentTypeBuilder");

test("buildContentTypeDefinition generates JWX schema in expected shape", () => {
  const output = buildContentTypeDefinition({
    name: "movie",
    display_name: "Movie",
    description: "Movie Schema",
    hosting_type: "hosted",
    is_active: true,
    is_series: false,
    searchable: true,
    languages: [{ code: "en", name: "English" }],
    sections: [
      {
        title: "General",
        fields: [
          {
            label: "Genre",
            param: "genre",
            description: "Use genre to categorize content",
            required: true,
            details: {
              field_type: "select",
              placeholder: "Select a genre",
              options: [{ label: "Action", value: "Action" }]
            }
          }
        ]
      },
      {
        title: "Access",
        fields: [
          {
            label: "Free",
            param: "free",
            details: {
              field_type: "toggle",
              default: "false"
            }
          }
        ]
      }
    ]
  });

  assert.equal(output.name, "movie");
  assert.equal(output.display_name, "Movie");
  assert.equal(output.hosting_type, "hosted");
  assert.equal(output.sections.length, 2);
  assert.equal(output.sections[0].fields[0].details.field_type, "select");
  assert.equal(output.sections[1].fields[0].details.default, false);
});

test("buildContentTypeDefinition rejects duplicate params across sections", () => {
  assert.throws(() =>
    buildContentTypeDefinition({
      name: "movie",
      display_name: "Movie",
      hosting_type: "hosted",
      sections: [
        {
          title: "General",
          fields: [{ label: "Genre", param: "genre", details: { field_type: "input" } }]
        },
        {
          title: "Access",
          fields: [{ label: "Genre Duplicate", param: "genre", details: { field_type: "input" } }]
        }
      ]
    })
  );
});

test("buildContentTypeDefinition enforces options for select fields", () => {
  assert.throws(() =>
    buildContentTypeDefinition({
      name: "movie",
      display_name: "Movie",
      hosting_type: "hosted",
      sections: [
        {
          title: "General",
          fields: [{ label: "Genre", param: "genre", details: { field_type: "select" } }]
        }
      ]
    })
  );
});

test("buildContentTypeDefinition supports simple fields input and auto-creates General section", () => {
  const output = buildContentTypeDefinition({
    name: "episode",
    display_name: "Episode",
    hosting_type: "hosted",
    fields: [
      {
        label: "Cast",
        param: "cast",
        details: { field_type: "input" }
      }
    ]
  });

  assert.equal(output.sections.length, 1);
  assert.equal(output.sections[0].title, "General");
  assert.equal(output.sections[0].fields[0].param, "cast");
});

test("buildContentTypeDefinition tolerates missing languages", () => {
  const output = buildContentTypeDefinition({
    name: "liveEvent",
    display_name: "Live Event",
    hosting_type: "live_bcl",
    languages: "invalid",
    fields: [
      {
        label: "Status",
        param: "VCH.EventState",
        details: {
          field_type: "select",
          options: [{ label: "Scheduled", value: "PRE_LIVE" }]
        }
      }
    ]
  });

  assert.deepEqual(output.languages, []);
});
