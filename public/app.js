const form = document.querySelector("#builderForm");
const sectionsContainer = document.querySelector("#sectionsContainer");
const sectionTemplate = document.querySelector("#sectionTemplate");
const fieldTemplate = document.querySelector("#fieldTemplate");
const languageTemplate = document.querySelector("#languageTemplate");
const languagesContainer = document.querySelector("#languagesContainer");
const addSectionButton = document.querySelector("#addSectionButton");
const addLanguageButton = document.querySelector("#addLanguageButton");
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

function updateFieldTypeVisibility(row) {
  const fieldType = row.querySelector('[data-field="field_type"]').value;
  const optionsWrapper = row.querySelector(".options-wrapper");
  const placeholderWrapper = row.querySelector(".placeholder-wrapper");
  const translatableWrapper = row.querySelector(".translatable-wrapper");
  const defaultWrapper = row.querySelector(".default-wrapper");
  const allowed = new Set((fieldTypes[fieldType] || {}).allows || []);
  const requiresOptions = Boolean((fieldTypes[fieldType] || {}).requiresOptions);

  optionsWrapper.classList.toggle("hidden", !requiresOptions);
  placeholderWrapper.classList.toggle("hidden", !allowed.has("placeholder"));
  translatableWrapper.classList.toggle("hidden", !allowed.has("translatable"));
  defaultWrapper.classList.toggle("hidden", !allowed.has("default"));
}

function populateFieldTypeOptions(selectNode, selectedValue) {
  selectNode.innerHTML = "";
  Object.entries(fieldTypes).forEach(([value, config]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = config.label;
    if (selectedValue && selectedValue === value) {
      option.selected = true;
    }
    selectNode.append(option);
  });
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
      if (!option || typeof option !== "object") {
        return "";
      }
      const label = String(option.label || "").trim();
      const value = String(option.value || "").trim();
      if (!label || !value) {
        return "";
      }
      if (label === value) {
        return label;
      }
      return `${label}|${value}`;
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
    const insertAfter = event.clientY > rect.top + rect.height / 2;
    if (insertAfter) {
      targetItem.after(draggedNode);
    } else {
      targetItem.before(draggedNode);
    }
  });
}

function createLanguageRow(language = {}) {
  const fragment = languageTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".language-row");
  row.querySelector('[data-language="code"]').value = language.code || "";
  row.querySelector('[data-language="name"]').value = language.name || "";

  row.querySelector('[data-action="remove-language"]').addEventListener("click", () => {
    row.remove();
    markDirty();
    setMessage("");
  });

  row.addEventListener("input", markDirty);
  languagesContainer.append(fragment);
}

function createFieldRow(fieldsContainerNode, field = {}) {
  const fragment = fieldTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".field-row");
  const fieldTypeSelect = row.querySelector('[data-field="field_type"]');

  populateFieldTypeOptions(fieldTypeSelect, field.details?.field_type);

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
    fieldTypeSelect.selectedIndex = 0;
  }
  updateFieldTypeVisibility(row);

  row.querySelector('[data-action="remove-field"]').addEventListener("click", () => {
    row.remove();
    markDirty();
    setMessage("");
  });

  fieldTypeSelect.addEventListener("change", () => {
    updateFieldTypeVisibility(row);
    markDirty();
  });

  row.addEventListener("input", markDirty);
  row.addEventListener("change", markDirty);
  fieldsContainerNode.append(fragment);
}

function createSectionRow(section = {}) {
  const fragment = sectionTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".section-row");
  const sectionTitleInput = row.querySelector('[data-section="title"]');
  const fieldsContainerNode = row.querySelector('[data-section="fields"]');

  sectionTitleInput.value = section.title || "";

  row.querySelector('[data-action="remove-section"]').addEventListener("click", () => {
    row.remove();
    markDirty();
    setMessage("");
  });

  row.querySelector('[data-action="add-field"]').addEventListener("click", () => {
    createFieldRow(fieldsContainerNode);
    markDirty();
  });

  sectionTitleInput.addEventListener("input", markDirty);
  attachSortable(fieldsContainerNode, ".field-row");

  const fields = Array.isArray(section.fields) && section.fields.length > 0 ? section.fields : [{}];
  fields.forEach((field) => createFieldRow(fieldsContainerNode, field));

  sectionsContainer.append(fragment);
}

function clearBuilder() {
  sectionsContainer.innerHTML = "";
  languagesContainer.innerHTML = "";
}

function collectLanguages() {
  return [...languagesContainer.querySelectorAll(".language-row")]
    .map((row) => ({
      code: row.querySelector('[data-language="code"]').value.trim(),
      name: row.querySelector('[data-language="name"]').value.trim()
    }))
    .filter((language) => language.code || language.name);
}

function collectField(row) {
  const details = {
    field_type: row.querySelector('[data-field="field_type"]').value
  };

  const placeholder = row.querySelector('[data-field="placeholder"]').value.trim();
  if (placeholder) {
    details.placeholder = placeholder;
  }

  const defaultValue = row.querySelector('[data-field="default"]').value.trim();
  if (defaultValue) {
    details.default = defaultValue;
  }

  if (row.querySelector('[data-field="translatable"]').checked) {
    details.translatable = true;
  }

  const options = parseOptionsText(row.querySelector('[data-field="options"]').value);
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

function collectSections() {
  return [...sectionsContainer.querySelectorAll(".section-row")].map((sectionNode) => ({
    title: sectionNode.querySelector('[data-section="title"]').value.trim(),
    fields: [...sectionNode.querySelectorAll(".field-row")].map(collectField)
  }));
}

function collectPayload() {
  return {
    description: form.elements.description.value.trim(),
    display_name: form.elements.displayName.value.trim(),
    hosting_type: form.elements.hostingType.value,
    is_active: form.elements.isActive.checked,
    is_series: form.elements.isSeries.checked,
    languages: collectLanguages(),
    name: form.elements.name.value.trim(),
    searchable: form.elements.searchable.checked,
    sections: collectSections()
  };
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
  const data = JSON.stringify(latestJson, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${latestJson.name || "content_type"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function hydrateFormFromSchema(schema) {
  form.elements.name.value = schema.name || "";
  form.elements.displayName.value = schema.display_name || "";
  form.elements.description.value = schema.description || "";
  form.elements.hostingType.value = schema.hosting_type || "";
  form.elements.isActive.checked = schema.is_active !== undefined ? Boolean(schema.is_active) : true;
  form.elements.isSeries.checked = Boolean(schema.is_series);
  form.elements.searchable.checked = schema.searchable !== undefined ? Boolean(schema.searchable) : true;

  clearBuilder();
  (schema.languages || []).forEach((language) => createLanguageRow(language));
  if ((schema.languages || []).length === 0) {
    createLanguageRow();
  }

  (schema.sections || []).forEach((section) => createSectionRow(section));
  if ((schema.sections || []).length === 0) {
    createSectionRow();
  }
}

async function importSchema(rawText) {
  if (!rawText.trim()) {
    throw new Error("Paste JSON or select a file before importing.");
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

addSectionButton.addEventListener("click", () => {
  createSectionRow();
  markDirty();
});

addLanguageButton.addEventListener("click", () => {
  createLanguageRow();
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
    createLanguageRow();
    createSectionRow();
    attachSortable(languagesContainer, ".language-row");
    attachSortable(sectionsContainer, ".section-row");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

init();
