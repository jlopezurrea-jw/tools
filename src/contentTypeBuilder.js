const HOSTING_TYPES = ["hosted", "live_bcl", "external", "ott_data"];

const FIELD_TYPE_CONFIG = {
  input: {
    label: "Input",
    requiresOptions: false,
    allows: ["placeholder", "translatable", "default"]
  },
  select: {
    label: "Select",
    requiresOptions: true,
    allows: ["placeholder", "options", "default"]
  },
  multiselect: {
    label: "Multiselect",
    requiresOptions: true,
    allows: ["options", "default", "placeholder"]
  },
  media_select: {
    label: "Media Select",
    requiresOptions: false,
    allows: []
  },
  toggle: {
    label: "Toggle",
    requiresOptions: false,
    allows: ["default"]
  },
  date: {
    label: "Date",
    requiresOptions: false,
    allows: []
  },
  date_time: {
    label: "Date Time",
    requiresOptions: false,
    allows: []
  },
  playlist_multiselect: {
    label: "Playlist Multiselect",
    requiresOptions: false,
    allows: []
  }
};

function ensureObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function parseBooleanString(value, fieldLabel) {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error(`Field "${fieldLabel}" toggle default must be true or false.`);
}

function normalizeOption(option, fieldLabel, optionIndex) {
  if (typeof option === "string") {
    const trimmed = option.trim();
    if (!trimmed) {
      throw new Error(`Field "${fieldLabel}" has an empty option at position ${optionIndex + 1}.`);
    }
    return { label: trimmed, value: trimmed };
  }

  ensureObject(
    option,
    `Field "${fieldLabel}" has invalid option at position ${optionIndex + 1}.`
  );
  const label = String(option.label || "").trim();
  const value = String(option.value || "").trim();
  if (!label || !value) {
    throw new Error(`Field "${fieldLabel}" options require both label and value.`);
  }
  return { label, value };
}

function normalizeDetails(field) {
  ensureObject(field.details, `Field "${field.label}" must include a details object.`);
  const fieldType = String(field.details.field_type || "").trim();
  const config = FIELD_TYPE_CONFIG[fieldType];
  if (!config) {
    throw new Error(`Field "${field.label}" has unsupported field_type "${fieldType}".`);
  }

  const details = { field_type: fieldType };
  const allowed = new Set(config.allows);

  if (allowed.has("placeholder") && field.details.placeholder !== undefined) {
    const placeholder = String(field.details.placeholder).trim();
    if (placeholder) {
      details.placeholder = placeholder;
    }
  }

  if (allowed.has("translatable") && field.details.translatable !== undefined) {
    details.translatable = Boolean(field.details.translatable);
  }

  if (allowed.has("default") && field.details.default !== undefined) {
    if (fieldType === "toggle") {
      details.default = parseBooleanString(field.details.default, field.label);
    } else {
      details.default = field.details.default;
    }
  }

  if (config.requiresOptions) {
    if (!Array.isArray(field.details.options) || field.details.options.length === 0) {
      throw new Error(`Field "${field.label}" requires at least one option.`);
    }
    details.options = field.details.options.map((option, index) =>
      normalizeOption(option, field.label, index)
    );
  } else if (Array.isArray(field.details.options) && field.details.options.length > 0) {
    details.options = field.details.options.map((option, index) =>
      normalizeOption(option, field.label, index)
    );
  }

  return details;
}

function normalizeField(field, sectionTitle, fieldIndex, seenParams) {
  ensureObject(
    field,
    `Field at position ${fieldIndex + 1} in section "${sectionTitle}" must be an object.`
  );

  const label = String(field.label || "").trim();
  const param = String(field.param || "").trim();
  if (!label) {
    throw new Error(`Field at position ${fieldIndex + 1} in section "${sectionTitle}" is missing label.`);
  }
  if (!param) {
    throw new Error(`Field "${label}" is missing param.`);
  }
  if (seenParams.has(param)) {
    throw new Error(`Duplicate param "${param}" detected across sections.`);
  }
  seenParams.add(param);

  const normalized = {
    description: String(field.description || "").trim(),
    details: normalizeDetails({ ...field, label }),
    label,
    param
  };

  if (field.required !== undefined) {
    normalized.required = Boolean(field.required);
  }
  if (field.read_only !== undefined) {
    normalized.read_only = Boolean(field.read_only);
  }

  return normalized;
}

function normalizeSection(section, sectionIndex, seenParams) {
  ensureObject(section, `Section at position ${sectionIndex + 1} must be an object.`);
  const title = String(section.title || "").trim();
  if (!title) {
    throw new Error(`Section at position ${sectionIndex + 1} is missing title.`);
  }
  if (!Array.isArray(section.fields) || section.fields.length === 0) {
    throw new Error(`Section "${title}" must include at least one field.`);
  }

  return {
    title,
    fields: section.fields.map((field, fieldIndex) =>
      normalizeField(field, title, fieldIndex, seenParams)
    )
  };
}

function normalizeLanguages(languages) {
  if (!Array.isArray(languages)) {
    return [];
  }

  return languages
    .map((language) => {
      if (!language) {
        return null;
      }

      if (typeof language === "string") {
        const codeFromString = language.trim();
        if (!codeFromString) {
          return null;
        }
        return { code: codeFromString.toLowerCase(), name: codeFromString };
      }

      if (typeof language !== "object" || Array.isArray(language)) {
        return null;
      }

      const code = String(language.code || "").trim();
      const name = String(language.name || "").trim();
      if (!code || !name) {
        return null;
      }
      return { code: code.toLowerCase(), name };
    })
    .filter(Boolean);
}

function normalizeSections(input) {
  if (Array.isArray(input.sections) && input.sections.length > 0) {
    const seenParams = new Set();
    return input.sections.map((section, index) =>
      normalizeSection(section, index, seenParams)
    );
  }

  if (Array.isArray(input.fields) && input.fields.length > 0) {
    const seenParams = new Set();
    return [
      {
        title: String(input.default_section_title || "General").trim() || "General",
        fields: input.fields.map((field, index) =>
          normalizeField(field, "General", index, seenParams)
        )
      }
    ];
  }

  throw new Error("At least one field is required.");
}

function normalizeOptionalBoolean(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return Boolean(value);
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

function normalizeTopLevelString(input, candidates) {
  for (const key of candidates) {
    if (input[key] !== undefined && input[key] !== null) {
      const output = String(input[key]).trim();
      if (output) {
        return output;
      }
    }
  }
  return "";
}

function buildContentTypeDefinition(input) {
  ensureObject(input, "Input payload must be an object.");

  const name = normalizeTopLevelString(input, ["name"]);
  if (!name) {
    throw new Error("Content type name is required.");
  }

  const displayName = normalizeTopLevelString(input, ["display_name", "displayName"]) || name;
  const hostingType = normalizeTopLevelString(input, ["hosting_type", "hostingType"]);
  if (!hostingType) {
    throw new Error("hosting_type is required.");
  }
  if (!HOSTING_TYPES.includes(hostingType)) {
    throw new Error(
      `hosting_type "${hostingType}" is unsupported. Allowed values: ${HOSTING_TYPES.join(", ")}.`
    );
  }

  const sections = normalizeSections(input);

  return {
    description: normalizeOptionalText(input.description),
    display_name: displayName,
    hosting_type: hostingType,
    is_active: normalizeOptionalBoolean(input.is_active, true),
    is_series: normalizeOptionalBoolean(input.is_series, false),
    languages: normalizeLanguages(input.languages || []),
    name,
    searchable: normalizeOptionalBoolean(input.searchable, true),
    sections
  };
}

module.exports = {
  HOSTING_TYPES,
  FIELD_TYPE_CONFIG,
  buildContentTypeDefinition
};
