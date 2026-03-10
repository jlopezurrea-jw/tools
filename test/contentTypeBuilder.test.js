const test = require("node:test");
const assert = require("node:assert/strict");
const { buildContentTypeDefinition } = require("../src/contentTypeBuilder");

test("buildContentTypeDefinition generates normalized schema", () => {
  const output = buildContentTypeDefinition({
    name: "Asset Metadata",
    fields: [
      {
        name: "Title",
        type: "text",
        display: "singleLine",
        required: true
      },
      {
        name: "Category",
        type: "enum",
        display: "dropdown",
        options: ["News", "Sports"]
      }
    ]
  });

  assert.equal(output.platform, "JWX");
  assert.equal(output.contentType.id, "asset_metadata");
  assert.equal(output.contentType.fields[0].id, "title");
  assert.deepEqual(output.contentType.fields[1].options, [
    { label: "News", value: "news" },
    { label: "Sports", value: "sports" }
  ]);
});

test("buildContentTypeDefinition rejects duplicate field ids", () => {
  assert.throws(() =>
    buildContentTypeDefinition({
      name: "Asset Metadata",
      fields: [
        { name: "Title", type: "text", display: "singleLine" },
        { name: "title", type: "text", display: "singleLine" }
      ]
    })
  );
});
