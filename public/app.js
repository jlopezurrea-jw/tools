const form = document.querySelector("#builderForm");
const fieldTemplate = document.querySelector("#fieldTemplate");
const sectionTemplate = document.querySelector("#sectionTemplate");
const simpleFieldsContainer = document.querySelector("#simpleFieldsContainer");
const sectionsContainer = document.querySelector("#sectionsContainer");
const addSimpleFieldButton = document.querySelector("#addSimpleFieldButton");
const addSectionButton = document.querySelector("#addSectionButton");
const advancedSectionsToggle = document.querySelector("#advancedSectionsToggle");
const advancedSectionsPanel = document.querySelector("#advancedSectionsPanel");
const includeLanguagesToggle = document.querySelector("#includeLanguages");
const languagesTextWrapper = document.querySelector("#languagesTextWrapper");
const languagesText = document.querySelector("#languagesText");
const importButton = document.querySelector("#importButton");
const importFileInput = document.querySelector("#importFileInput");
const importJsonText = document.querySelector("#importJsonText");
const hostingTypeSelect = document.querySelector("#hostingType");
const messageNode = document.querySelector("#message");
const previewNode = document.querySelector("#jsonPreview");
const downloadButton = document.querySelector("#downloadButton");

let fieldTypes = {};
let latestJson = null;

function setMessage(text, type = "") {
  messageNode.textContent = text;
  messageNode.className = `message ${type}`.trim();
}

function markDirty() {
  latestJson = null;
  downloadButton.disabled = true;
}

function parseOptionsText(rawText) {
  return String(rawText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [left, right] = line.split("|");
      if (right === undefined) {
        return { label: left.trim(), value: left.trim() };
      }
      return { label: left.trim(), value: right.trim() };
    })
    .filter((option) => option.label && option.value);
}

function optionsToText(options) {
  if (!Array.isArray(options)) {
    return "";
  }
  return options
    .map((option) => {
      const label = String(option?.label || "").trim();
      const value = String(option?.value || "").trim();
      if (!label || !value) {
        return "";
      }
      return label === value ? label : `${label}|${value}`;
    })
    .filter(Boolean)
    .join("\n");
}

function parseLanguagesText(rawText) {
  return String(rawText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [codeRaw, nameRaw] = line.split("|");
      const code = String(codeRaw || "").trim().toLowerCase();
      const name = String(nameRaw || codeRaw || "").trim();
      if (!code || !name) {
        return null;
      }
      return { code, name };
    })
    .filter(Boolean);
}

function languagesToText(languages) {
  if (!Array.isArray(languages) || languages.length === 0) {
    return "";
  }
  return languages
    .map((language) => {
      const code = String(language?.code || "").trim().toLowerCase();
      const name = String(language?.name || "").trim();
      if (!code || !name) {
        return "";
      }
      return `${code}|${name}`;
    })
    .filter(Boolean)
    .join("\n");
}

function attachSortable(container, selector) {
  let draggedNode = null;

  container.addEventListener("dragstart", (event) => {
    const item = event.target.closest(selector);
    if (!item) {
      return;
    }
    draggedNode = item;
    item.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
  });

  container.addEventListener("dragend", () => {
    if (draggedNode) {
      draggedNode.classList.remove("dragging");
      draggedNode = null;
      markDirty();
    }
  });

  container.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!draggedNode) {
      return;
    }
    const targetItem = event.target.closest(selector);
    if (!targetItem || targetItem === draggedNode) {
      return;
    }
    const rect = targetItem.getBoundingClientRect();
    if (event.clientY > rect.top + rect.height / 2) {
      targetItem.after(draggedNode);
    } else {
      targetItem.before(draggedNode);
    }
  });
}

function populateFieldTypeOptions(selectNode, selectedValue) {
  selectNode.innerHTML = "";
  Object.entries(fieldTypes).forEach(([value, config]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = config.label;
    if (selectedValue === value) {
      option.selected = true;
    }
    selectNode.append(option);
  });
}

function updateFieldTypeVisibility(row) {
  const fieldType = row.querySelector('[data-field="field_type"]').value;
  const optionsWrapper = row.querySelector(".options-wrapper");
  const placeholderWrapper = row.querySelector(".placeholder-wrapper");
  const translatableWrapper = row.querySelector(".translatable-wrapper");
  const defaultWrapper = row.querySelector(".default-wrapper");
  const config = fieldTypes[fieldType] || {};
  const allowed = new Set(config.allows || []);

  optionsWrapper.classList.toggle("hidden", !config.requiresOptions);
  placeholderWrapper.classList.toggle("hidden", !allowed.has("placeholder"));
  translatableWrapper.classList.toggle("hidden", !allowed.has("translatable"));
  defaultWrapper.classList.toggle("hidden", !allowed.has("default"));
}

function createFieldRow(containerNode, field = {}) {
  const fragment = fieldTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".field-row");
  const typeSelect = row.querySelector('[data-field="field_type"]');

  populateFieldTypeOptions(typeSelect, field.details?.field_type);
  row.querySelector('[data-field="label"]').value = field.label || "";
  row.querySelector('[data-field="param"]').value = field.param || "";
  row.querySelector('[data-field="description"]').value = field.description || "";
  row.querySelector('[data-field="required"]').checked = Boolean(field.required);
  row.querySelector('[data-field="read_only"]').checked = Boolean(field.read_only);
  row.querySelector('[data-field="placeholder"]').value = field.details?.placeholder || "";
  row.querySelector('[data-field="default"]').value =
    field.details?.default !== undefined ? String(field.details.default) : "";
  row.querySelector('[data-field="translatable"]').checked = Boolean(field.details?.translatable);
  row.querySelector('[data-field="options"]').value = optionsToText(field.details?.options);

  if (!field.details?.field_type) {
    typeSelect.selectedIndex = 0;
  }
  updateFieldTypeVisibility(row);

  row.querySelector('[data-action="remove-field"]').addEventListener("click", () => {
    row.remove();
    markDirty();
  });
  typeSelect.addEventListener("change", () => {
    updateFieldTypeVisibility(row);
    markDirty();
  });
  row.addEventListener("input", markDirty);
  row.addEventListener("change", markDirty);
  containerNode.append(fragment);
}

function createSectionRow(section = {}) {
  const fragment = sectionTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".section-row");
  const titleInput = row.querySelector('[data-section="title"]');
  const sectionFieldsContainer = row.querySelector('[data-section="fields"]');
  titleInput.value = section.title || "";

  row.querySelector('[data-action="remove-section"]').addEventListener("click", () => {
    row.remove();
    markDirty();
  });
  row.querySelector('[data-action="add-field"]').addEventListener("click", () => {
    createFieldRow(sectionFieldsContainer);
    markDirty();
  });
  titleInput.addEventListener("input", markDirty);

  const fields = Array.isArray(section.fields) && section.fields.length ? section.fields : [{}];
  fields.forEach((field) => createFieldRow(sectionFieldsContainer, field));
  attachSortable(sectionFieldsContainer, ".field-row");
  sectionsContainer.append(fragment);
}

function collectField(row) {
  const details = { field_type: row.querySelector('[data-field="field_type"]').value };
  const placeholder = row.querySelector('[data-field="placeholder"]').value.trim();
  const defaultValue = row.querySelector('[data-field="default"]').value.trim();
  const options = parseOptionsText(row.querySelector('[data-field="options"]').value);

  if (placeholder) {
    details.placeholder = placeholder;
  }
  if (defaultValue) {
    details.default = defaultValue;
  }
  if (row.querySelector('[data-field="translatable"]').checked) {
    details.translatable = true;
  }
  if (options.length > 0) {
    details.options = options;
  }

  const field = {
    description: row.querySelector('[data-field="description"]').value.trim(),
    details,
    label: row.querySelector('[data-field="label"]').value.trim(),
    param: row.querySelector('[data-field="param"]').value.trim()
  };

  if (row.querySelector('[data-field="required"]').checked) {
    field.required = true;
  }
  if (row.querySelector('[data-field="read_only"]').checked) {
    field.read_only = true;
  }
  return field;
}

function collectSimpleFields() {
  return [...simpleFieldsContainer.querySelectorAll(".field-row")].map(collectField);
}

function collectSections() {
  return [...sectionsContainer.querySelectorAll(".section-row")].map((sectionNode) => ({
    title: sectionNode.querySelector('[data-section="title"]').value.trim(),
    fields: [...sectionNode.querySelectorAll(".field-row")].map(collectField)
  }));
}

function getAllSectionFields() {
  return collectSections().flatMap((section) => section.fields || []);
}

function setAdvancedSectionsEnabled(enabled) {
  advancedSectionsToggle.checked = enabled;
  advancedSectionsPanel.classList.toggle("hidden", !enabled);
}

function collectPayload() {
  const payload = {
    description: form.elements.description.value.trim(),
    display_name: form.elements.displayName.value.trim(),
    hosting_type: form.elements.hostingType.value,
    is_active: form.elements.isActive.checked,
    is_series: form.elements.isSeries.checked,
    name: form.elements.name.value.trim(),
    searchable: form.elements.searchable.checked
  };

  payload.languages = includeLanguagesToggle.checked
    ? parseLanguagesText(languagesText.value)
    : [];

  if (advancedSectionsToggle.checked) {
    payload.sections = collectSections();
  } else {
    payload.fields = collectSimpleFields();
  }

  return payload;
}

async function loadConfig() {
  const response = await fetch("/api/field-config");
  if (!response.ok) {
    throw new Error("Could not load field configuration.");
  }
  return response.json();
}

async function generateSchema(payload) {
  const response = await fetch("/api/content-types", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Failed to generate schema.");
  }
  return body;
}

function downloadSchema() {
  if (!latestJson) {
    return;
  }
  const blob = new Blob([JSON.stringify(latestJson, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${latestJson.name || "content_type"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearBuilder() {
  simpleFieldsContainer.innerHTML = "";
  sectionsContainer.innerHTML = "";
}

function hydrateFormFromSchema(schema) {
  form.elements.name.value = schema.name || "";
  form.elements.displayName.value = schema.display_name || "";
  form.elements.description.value = schema.description || "";
  form.elements.hostingType.value = schema.hosting_type || "";
  form.elements.isActive.checked = schema.is_active !== undefined ? Boolean(schema.is_active) : true;
  form.elements.isSeries.checked = Boolean(schema.is_series);
  form.elements.searchable.checked = schema.searchable !== undefined ? Boolean(schema.searchable) : true;

  const hasLanguages = Array.isArray(schema.languages) && schema.languages.length > 0;
  includeLanguagesToggle.checked = hasLanguages;
  languagesTextWrapper.classList.toggle("hidden", !hasLanguages);
  languagesText.value = languagesToText(schema.languages);

  clearBuilder();
  const sections = Array.isArray(schema.sections) ? schema.sections : [];
  if (sections.length <= 1) {
    setAdvancedSectionsEnabled(false);
    const fields = sections[0]?.fields || [];
    (fields.length ? fields : [{}]).forEach((field) => createFieldRow(simpleFieldsContainer, field));
  } else {
    setAdvancedSectionsEnabled(true);
    sections.forEach((section) => createSectionRow(section));
  }
}

async function importSchema(rawText) {
  if (!rawText.trim()) {
    throw new Error("Paste JSON or choose a file first.");
  }
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("Import JSON is invalid.");
  }
  const validated = await generateSchema(parsed);
  hydrateFormFromSchema(validated);
  latestJson = validated;
  previewNode.textContent = JSON.stringify(validated, null, 2);
  downloadButton.disabled = false;
  setMessage("Schema imported and validated successfully.", "success");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("Generating schema...");
  try {
    const schema = await generateSchema(collectPayload());
    latestJson = schema;
    previewNode.textContent = JSON.stringify(schema, null, 2);
    downloadButton.disabled = false;
    setMessage("Schema generated successfully.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
});

includeLanguagesToggle.addEventListener("change", () => {
  languagesTextWrapper.classList.toggle("hidden", !includeLanguagesToggle.checked);
  markDirty();
});

advancedSectionsToggle.addEventListener("change", () => {
  const enabled = advancedSectionsToggle.checked;
  setAdvancedSectionsEnabled(enabled);

  if (enabled && sectionsContainer.children.length === 0) {
    const fields = collectSimpleFields();
    sectionsContainer.innerHTML = "";
    createSectionRow({
      title: "General",
      fields: fields.length ? fields : [{}]
    });
  }

  if (!enabled) {
    const flattenedFields = getAllSectionFields();
    simpleFieldsContainer.innerHTML = "";
    (flattenedFields.length ? flattenedFields : [{}]).forEach((field) =>
      createFieldRow(simpleFieldsContainer, field)
    );
  }
  markDirty();
});

addSimpleFieldButton.addEventListener("click", () => {
  createFieldRow(simpleFieldsContainer);
  markDirty();
});

addSectionButton.addEventListener("click", () => {
  createSectionRow();
  markDirty();
});

downloadButton.addEventListener("click", downloadSchema);

importButton.addEventListener("click", async () => {
  try {
    const file = importFileInput.files[0];
    if (file) {
      const raw = await file.text();
      importJsonText.value = raw;
      await importSchema(raw);
      return;
    }
    await importSchema(importJsonText.value);
  } catch (error) {
    setMessage(error.message, "error");
  }
});

importFileInput.addEventListener("change", async () => {
  const file = importFileInput.files[0];
  if (!file) {
    return;
  }
  try {
    const raw = await file.text();
    importJsonText.value = raw;
    await importSchema(raw);
  } catch (error) {
    setMessage(error.message, "error");
  }
});

async function init() {
  try {
    const config = await loadConfig();
    fieldTypes = config.fieldTypes;
    hostingTypeSelect.innerHTML = "";
    config.hostingTypes.forEach((hostingType) => {
      const option = document.createElement("option");
      option.value = hostingType;
      option.textContent = hostingType;
      hostingTypeSelect.append(option);
    });
    createFieldRow(simpleFieldsContainer);
    attachSortable(simpleFieldsContainer, ".field-row");
    attachSortable(sectionsContainer, ".section-row");
    setAdvancedSectionsEnabled(false);
    languagesTextWrapper.classList.add("hidden");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

init();
