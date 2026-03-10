const FIELD_TYPE_CONFIG = {
  text: {
    label: "Text",
    displayOptions: ["singleLine", "multiLine", "richText"]
  },
  number: {
    label: "Number",
    displayOptions: ["default", "currency", "percentage", "rating"]
  },
  boolean: {
    label: "Boolean",
    displayOptions: ["toggle", "checkbox"]
  },
  date: {
    label: "Date",
    displayOptions: ["dateOnly", "dateTime", "monthYear"]
  },
  enum: {
    label: "Enum",
    displayOptions: ["dropdown", "radio", "tags"]
  },
  media: {
    label: "Media",
    displayOptions: ["image", "video", "file"]
  }
};

function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function ensureFieldKey(field) {
  const key = field.key || toSlug(field.name);
  if (!key) {
    throw new Error(`Field "${field.name || "unknown"}" is missing a valid key.`);
  }
  return key;
}

function validateField(field, index) {
  if (!field || typeof field !== "object") {
    throw new Error(`Field at position ${index + 1} must be an object.`);
  }

  if (!field.name || !String(field.name).trim()) {
    throw new Error(`Field at position ${index + 1} is missing a name.`);
  }

  if (!FIELD_TYPE_CONFIG[field.type]) {
    throw new Error(
      `Field "${field.name}" has unsupported type "${field.type}".`
    );
  }

  const displayOptions = FIELD_TYPE_CONFIG[field.type].displayOptions;
  if (!displayOptions.includes(field.display)) {
    throw new Error(
      `Field "${field.name}" has unsupported display "${field.display}" for type "${field.type}".`
    );
  }

  if (field.type === "enum") {
    if (!Array.isArray(field.options) || field.options.length === 0) {
      throw new Error(`Enum field "${field.name}" requires options.`);
    }
  }
}

function normalizeField(field) {
  const normalized = {
    id: ensureFieldKey(field),
    name: String(field.name).trim(),
    type: field.type,
    required: Boolean(field.required),
    display: field.display
  };

  if (field.helpText) {
    normalized.helpText = String(field.helpText).trim();
  }

  if (field.type === "enum") {
    normalized.options = field.options
      .map((option) => String(option).trim())
      .filter(Boolean)
      .map((value) => ({ label: value, value: toSlug(value) }));
  }

  return normalized;
}

function buildContentTypeDefinition(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Input payload must be an object.");
  }

  if (!input.name || !String(input.name).trim()) {
    throw new Error("Content type name is required.");
  }

  if (!Array.isArray(input.fields) || input.fields.length === 0) {
    throw new Error("At least one field is required.");
  }

  const typeId = toSlug(input.id || input.name);
  if (!typeId) {
    throw new Error("Content type id is invalid.");
  }

  const fieldIds = new Set();
  const fields = input.fields.map((field, index) => {
    validateField(field, index);
    const normalized = normalizeField(field);
    if (fieldIds.has(normalized.id)) {
      throw new Error(`Duplicate field id "${normalized.id}" detected.`);
    }
    fieldIds.add(normalized.id);
    return normalized;
  });

  return {
    schemaVersion: "1.0.0",
    platform: "JWX",
    contentType: {
      id: typeId,
      name: String(input.name).trim(),
      description: String(input.description || "").trim(),
      fields
    },
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  FIELD_TYPE_CONFIG,
  buildContentTypeDefinition,
  toSlug
};
