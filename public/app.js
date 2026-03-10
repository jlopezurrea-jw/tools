const form = document.querySelector("#builderForm");
const fieldsContainer = document.querySelector("#fieldsContainer");
const fieldTemplate = document.querySelector("#fieldTemplate");
const addFieldButton = document.querySelector("#addFieldButton");
const messageNode = document.querySelector("#message");
const previewNode = document.querySelector("#jsonPreview");
const downloadButton = document.querySelector("#downloadButton");

let fieldConfig = {};
let latestJson = null;

function setMessage(text, type = "") {
  messageNode.textContent = text;
  messageNode.className = `message ${type}`.trim();
}

function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function populateTypeOptions(typeSelect) {
  typeSelect.innerHTML = "";
  Object.entries(fieldConfig).forEach(([value, config]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = config.label;
    typeSelect.append(option);
  });
}

function populateDisplayOptions(typeSelect, displaySelect) {
  const selectedType = typeSelect.value;
  const config = fieldConfig[selectedType];
  displaySelect.innerHTML = "";
  config.displayOptions.forEach((displayValue) => {
    const option = document.createElement("option");
    option.value = displayValue;
    option.textContent = displayValue;
    displaySelect.append(option);
  });
}

function toggleEnumOptions(typeSelect, optionsWrapper) {
  optionsWrapper.classList.toggle("hidden", typeSelect.value !== "enum");
}

function createFieldRow() {
  const fragment = fieldTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".field-row");
  const typeSelect = row.querySelector('[data-field="type"]');
  const displaySelect = row.querySelector('[data-field="display"]');
  const optionsWrapper = row.querySelector(".options-wrapper");
  const removeButton = row.querySelector('[data-action="remove"]');
  const nameInput = row.querySelector('[data-field="name"]');
  const keyInput = row.querySelector('[data-field="key"]');

  populateTypeOptions(typeSelect);
  populateDisplayOptions(typeSelect, displaySelect);
  toggleEnumOptions(typeSelect, optionsWrapper);

  typeSelect.addEventListener("change", () => {
    populateDisplayOptions(typeSelect, displaySelect);
    toggleEnumOptions(typeSelect, optionsWrapper);
  });

  nameInput.addEventListener("blur", () => {
    if (!keyInput.value.trim()) {
      keyInput.value = toSlug(nameInput.value);
    }
  });

  removeButton.addEventListener("click", () => {
    row.remove();
    setMessage("");
    latestJson = null;
    downloadButton.disabled = true;
  });

  fieldsContainer.append(fragment);
}

function collectFields() {
  const rows = [...fieldsContainer.querySelectorAll(".field-row")];
  return rows.map((row) => {
    const field = {
      name: row.querySelector('[data-field="name"]').value,
      key: row.querySelector('[data-field="key"]').value,
      type: row.querySelector('[data-field="type"]').value,
      display: row.querySelector('[data-field="display"]').value,
      required: row.querySelector('[data-field="required"]').checked,
      helpText: row.querySelector('[data-field="helpText"]').value
    };

    if (field.type === "enum") {
      field.options = row
        .querySelector('[data-field="options"]')
        .value.split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }

    return field;
  });
}

async function loadFieldConfig() {
  const response = await fetch("/api/field-config");
  if (!response.ok) {
    throw new Error("Could not load field configuration.");
  }
  fieldConfig = await response.json();
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
  const typeId = latestJson.contentType.id;
  const data = JSON.stringify(latestJson, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${typeId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("Generating schema...");

  const payload = {
    name: form.elements.name.value,
    id: form.elements.id.value,
    description: form.elements.description.value,
    fields: collectFields()
  };

  try {
    const schema = await generateSchema(payload);
    latestJson = schema;
    previewNode.textContent = JSON.stringify(schema, null, 2);
    downloadButton.disabled = false;
    setMessage("Schema generated successfully.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
});

downloadButton.addEventListener("click", downloadSchema);
addFieldButton.addEventListener("click", createFieldRow);

async function init() {
  try {
    await loadFieldConfig();
    createFieldRow();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

init();
