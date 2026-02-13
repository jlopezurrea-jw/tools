const sharedSiteIdInput = document.getElementById("shared-site-id");
const sharedApiSecretInput = document.getElementById("shared-api-secret");

const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

const singleForm = document.getElementById("single-form");
const singleSubmitButton = document.getElementById("single-submit-btn");
const singleStatusLine = document.getElementById("single-status-line");
const singleResponseBox = document.getElementById("single-response-box");

const bulkLinesForm = document.getElementById("bulk-lines-form");
const bulkLinesSubmitButton = document.getElementById("bulk-lines-submit-btn");
const bulkLinesStatusLine = document.getElementById("bulk-lines-status-line");
const bulkLinesResponseBox = document.getElementById("bulk-lines-response-box");

const bulkCsvForm = document.getElementById("bulk-csv-form");
const bulkCsvSubmitButton = document.getElementById("bulk-csv-submit-btn");
const bulkCsvStatusLine = document.getElementById("bulk-csv-status-line");
const bulkCsvResponseBox = document.getElementById("bulk-csv-response-box");

const seriesCreatePlaceholderButton = document.getElementById(
  "series-create-placeholder-btn"
);
const seriesCreateTitleInput = document.getElementById("series-create-title");
const seriesPlaceholderStatusLine = document.getElementById(
  "series-placeholder-status-line"
);
const seriesPlaceholderResponseBox = document.getElementById(
  "series-placeholder-response-box"
);

const seriesMapForm = document.getElementById("series-map-form");
const seriesMapSeriesIdInput = document.getElementById("series-map-series-id");
const seriesMapSeriesTitleInput = document.getElementById(
  "series-map-series-title"
);
const seriesSeasonsContainer = document.getElementById("series-seasons-container");
const seriesAddSeasonButton = document.getElementById("series-add-season-btn");
const seriesMapSubmitButton = document.getElementById("series-map-submit-btn");
const seriesMapStatusLine = document.getElementById("series-map-status-line");
const seriesMapResponseBox = document.getElementById("series-map-response-box");

setupTabs();
setupSingleUpdateForm();
setupBulkLinesForm();
setupBulkCsvForm();
setupSeriesTools();

function setupTabs() {
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetTabId = button.dataset.targetTab;
      if (!targetTabId) {
        return;
      }

      tabButtons.forEach((candidateButton) => {
        const isActive = candidateButton === button;
        candidateButton.classList.toggle("active", isActive);
        candidateButton.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      tabPanels.forEach((panel) => {
        const isActive = panel.id === targetTabId;
        panel.classList.toggle("active", isActive);
        panel.hidden = !isActive;
      });
    });
  });
}

function setupSingleUpdateForm() {
  singleForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const connection = getConnectionSettings();
      const formData = new FormData(singleForm);
      const mediaId = String(formData.get("singleMediaId") || "").trim();
      const title = String(formData.get("singleTitle") || "");
      const description = String(formData.get("singleDescription") || "");
      const customParamsInput = String(formData.get("singleCustomParams") || "");

      if (!mediaId) {
        throw new Error("Media ID is required for single updates.");
      }

      const payload = {
        ...connection,
        mediaId,
        customParams: parseCustomParams(customParamsInput, {
          requireAtLeastOne: false,
        }),
      };

      if (title.trim()) {
        payload.title = title;
      }

      if (description.trim()) {
        payload.description = description;
      }

      await sendRequest({
        url: "/api/media/update",
        payload,
        button: singleSubmitButton,
        defaultButtonText: "Update metadata",
        loadingButtonText: "Updating...",
        statusLine: singleStatusLine,
        responseBox: singleResponseBox,
        onSuccessMessage: () => "Metadata updated successfully.",
      });
    } catch (error) {
      showFailure(singleStatusLine, singleResponseBox, error);
    }
  });
}

function setupBulkLinesForm() {
  bulkLinesForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const connection = getConnectionSettings();
      const formData = new FormData(bulkLinesForm);
      const mediaIdsInput = String(formData.get("bulkLinesMediaIds") || "");
      const customParamsInput = String(formData.get("bulkLinesCustomParams") || "");

      const mediaIds = parseMediaIds(mediaIdsInput);
      if (mediaIds.length === 0) {
        throw new Error("Add at least one Media ID for bulk line updates.");
      }

      const customParams = parseCustomParams(customParamsInput, {
        requireAtLeastOne: true,
      });

      await sendRequest({
        url: "/api/media/bulk-custom-lines",
        payload: {
          ...connection,
          mediaIds,
          customParams,
        },
        button: bulkLinesSubmitButton,
        defaultButtonText: "Run bulk custom parameter update",
        loadingButtonText: "Running bulk update...",
        statusLine: bulkLinesStatusLine,
        responseBox: bulkLinesResponseBox,
        onSuccessMessage: (_response, data) =>
          `Bulk update completed. ${data.succeeded}/${data.total} succeeded.`,
      });
    } catch (error) {
      showFailure(bulkLinesStatusLine, bulkLinesResponseBox, error);
    }
  });
}

function setupBulkCsvForm() {
  bulkCsvForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const connection = getConnectionSettings();
      const formData = new FormData(bulkCsvForm);
      const file = formData.get("bulkCsvFile");
      if (!(file instanceof File) || file.size === 0) {
        throw new Error("Choose a CSV file before running the CSV bulk update.");
      }

      const csvText = await file.text();
      const updates = parseCsvUpdates(csvText);

      await sendRequest({
        url: "/api/media/bulk-custom-csv",
        payload: {
          ...connection,
          updates,
        },
        button: bulkCsvSubmitButton,
        defaultButtonText: "Run CSV bulk custom parameter update",
        loadingButtonText: "Processing CSV...",
        statusLine: bulkCsvStatusLine,
        responseBox: bulkCsvResponseBox,
        onSuccessMessage: (_response, data) =>
          `CSV bulk update completed. ${data.succeeded}/${data.total} succeeded.`,
      });
    } catch (error) {
      showFailure(bulkCsvStatusLine, bulkCsvResponseBox, error);
    }
  });
}

function setupSeriesTools() {
  addSeasonEditor(1);

  seriesCreatePlaceholderButton.addEventListener("click", async () => {
    try {
      const connection = getConnectionSettings();
      const seriesName = seriesCreateTitleInput.value.trim();
      if (!seriesName) {
        throw new Error("Series name is required before creating a placeholder.");
      }

      await sendRequest({
        url: "/api/series/create-placeholder",
        payload: {
          ...connection,
          seriesName,
        },
        button: seriesCreatePlaceholderButton,
        defaultButtonText: "Create placeholder series",
        loadingButtonText: "Creating series...",
        statusLine: seriesPlaceholderStatusLine,
        responseBox: seriesPlaceholderResponseBox,
        onSuccessMessage: (_response, data) => {
          const seriesId = data?.seriesId || "";
          const strategy = data?.strategy || "";
          if (seriesId) {
            seriesMapSeriesIdInput.value = seriesId;
            if (strategy === "metadata.empty") {
              return `Placeholder series created. SeriesID: ${seriesId} (created without metadata.title).`;
            }
            return `Placeholder series created. SeriesID: ${seriesId}`;
          }

          return "Placeholder series request completed.";
        },
      });
    } catch (error) {
      showFailure(seriesPlaceholderStatusLine, seriesPlaceholderResponseBox, error);
    }
  });

  seriesAddSeasonButton.addEventListener("click", () => {
    addSeasonEditor(getNextSeasonNumber());
  });

  seriesSeasonsContainer.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const removeButton = target.closest(".remove-season-button");
    if (!removeButton) {
      return;
    }

    const seasonEditor = removeButton.closest(".season-editor");
    if (!(seasonEditor instanceof HTMLElement)) {
      return;
    }

    const seasonEditors = seriesSeasonsContainer.querySelectorAll(".season-editor");
    if (seasonEditors.length <= 1) {
      clearSeasonEditor(seasonEditor);
      return;
    }

    seasonEditor.remove();
  });

  seriesMapForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const connection = getConnectionSettings();
      const seriesId = seriesMapSeriesIdInput.value.trim();
      if (!seriesId) {
        throw new Error("SeriesID is required to map seasons and episodes.");
      }
      const seriesTitle = seriesMapSeriesTitleInput.value.trim();

      const seasons = collectSeasonMappings();

      await sendRequest({
        url: "/api/series/map-seasons-episodes",
        payload: {
          ...connection,
          seriesId,
          seriesTitle,
          seasons,
        },
        button: seriesMapSubmitButton,
        defaultButtonText: "Map seasons and episodes",
        loadingButtonText: "Mapping seasons...",
        statusLine: seriesMapStatusLine,
        responseBox: seriesMapResponseBox,
        onSuccessMessage: (_response, data) => {
          const titleStatus = data?.seriesTitleUpdate?.attempted
            ? data?.seriesTitleUpdate?.ok
              ? " Series title updated."
              : " Series title update failed."
            : "";

          return `Season mapping completed. ${data?.seasons?.succeeded ?? 0}/${
            data?.seasons?.total ?? 0
          } seasons succeeded.${titleStatus}`;
        },
      });
    } catch (error) {
      showFailure(seriesMapStatusLine, seriesMapResponseBox, error);
    }
  });
}

function addSeasonEditor(defaultNumber) {
  const seasonEditor = document.createElement("section");
  seasonEditor.className = "season-editor";
  seasonEditor.innerHTML = `
    <div class="season-editor-grid">
      <div class="season-left">
        <label>Season Number</label>
        <input
          class="season-number-input"
          type="number"
          min="1"
          step="1"
          placeholder="1"
        />
      </div>
      <div class="season-right">
        <label>MediaIDs toolbox (one per line)</label>
        <textarea
          class="season-media-ids-input"
          rows="7"
          placeholder="AbCd1234&#10;XyZ987ab&#10;QwEr4567"
        ></textarea>
        <p class="hint">
          Episode numbers are assigned by order: first line = episode 1, second line = episode 2, etc.
        </p>
      </div>
    </div>
    <div class="season-editor-actions">
      <button type="button" class="remove-season-button secondary-button">Remove season</button>
    </div>
  `;

  const seasonNumberInput = seasonEditor.querySelector(".season-number-input");
  if (seasonNumberInput instanceof HTMLInputElement && Number.isInteger(defaultNumber)) {
    seasonNumberInput.value = String(defaultNumber);
  }

  seriesSeasonsContainer.append(seasonEditor);
}

function clearSeasonEditor(seasonEditor) {
  const numberInput = seasonEditor.querySelector(".season-number-input");
  const mediaInput = seasonEditor.querySelector(".season-media-ids-input");

  if (numberInput instanceof HTMLInputElement) {
    numberInput.value = "1";
  }

  if (mediaInput instanceof HTMLTextAreaElement) {
    mediaInput.value = "";
  }
}

function getNextSeasonNumber() {
  const values = Array.from(
    seriesSeasonsContainer.querySelectorAll(".season-number-input")
  )
    .map((input) => Number(input.value))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (values.length === 0) {
    return 1;
  }

  return Math.max(...values) + 1;
}

function collectSeasonMappings() {
  const seasonEditors = Array.from(
    seriesSeasonsContainer.querySelectorAll(".season-editor")
  );
  if (seasonEditors.length === 0) {
    throw new Error("Add at least one season before mapping episodes.");
  }

  const seenSeasonNumbers = new Set();

  return seasonEditors.map((seasonEditor, seasonIndex) => {
    const numberInput = seasonEditor.querySelector(".season-number-input");
    const mediaInput = seasonEditor.querySelector(".season-media-ids-input");

    if (!(numberInput instanceof HTMLInputElement)) {
      throw new Error(`Season ${seasonIndex + 1} is missing number input.`);
    }

    if (!(mediaInput instanceof HTMLTextAreaElement)) {
      throw new Error(`Season ${seasonIndex + 1} is missing MediaID toolbox.`);
    }

    const number = Number(numberInput.value);
    if (!Number.isInteger(number) || number <= 0) {
      throw new Error(`Season ${seasonIndex + 1} must have a positive number.`);
    }

    if (seenSeasonNumbers.has(number)) {
      throw new Error(`Duplicate season number detected: ${number}.`);
    }
    seenSeasonNumbers.add(number);

    const mediaIds = [
      ...new Set(
        mediaInput.value
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      ),
    ];

    if (mediaIds.length === 0) {
      throw new Error(
        `Season ${seasonIndex + 1} must include at least one MediaID.`
      );
    }

    return {
      number,
      mediaIds,
    };
  });
}

function getConnectionSettings() {
  const siteId = sharedSiteIdInput.value.trim();
  const apiSecret = sharedApiSecretInput.value.trim();

  if (!siteId) {
    throw new Error("Property ID (site_id) is required.");
  }

  if (!apiSecret) {
    throw new Error("API Secret is required.");
  }

  return { siteId, apiSecret };
}

function parseMediaIds(input) {
  const mediaIds = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return [...new Set(mediaIds)];
}

function parseCustomParams(input, { requireAtLeastOne }) {
  const result = {};
  const lines = input.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i].trim();
    if (!rawLine) {
      continue;
    }

    const separatorIndex = rawLine.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(
        `Custom parameter line ${i + 1} is invalid. Use key=value format.`
      );
    }

    const key = rawLine.slice(0, separatorIndex).trim();
    const value = rawLine.slice(separatorIndex + 1).trim();
    if (!key) {
      throw new Error(
        `Custom parameter line ${i + 1} has an empty key. Use key=value format.`
      );
    }

    result[key] = value;
  }

  if (requireAtLeastOne && Object.keys(result).length === 0) {
    throw new Error("Add at least one custom parameter.");
  }

  return result;
}

function parseCsvUpdates(csvText) {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    throw new Error("CSV file must include a header row and at least one data row.");
  }

  const header = rows[0].map((value) => value.trim());
  if (header.length < 2) {
    throw new Error(
      "CSV header must include MediaID and at least one custom parameter column."
    );
  }

  if (header[0].toLowerCase() !== "mediaid") {
    throw new Error("First CSV column must be named MediaID.");
  }

  const customParamKeys = header.slice(1).map((key) => key.trim());
  if (customParamKeys.some((key) => !key)) {
    throw new Error("CSV custom parameter headers cannot be empty.");
  }

  const uniqueHeaderCount = new Set(customParamKeys.map((key) => key.toLowerCase())).size;
  if (uniqueHeaderCount !== customParamKeys.length) {
    throw new Error("CSV custom parameter headers must be unique.");
  }

  const updates = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rowIsEmpty = row.every((cell) => cell.trim() === "");
    if (rowIsEmpty) {
      continue;
    }

    const mediaId = (row[0] || "").trim();
    if (!mediaId) {
      throw new Error(`CSV row ${rowIndex + 1} is missing MediaID.`);
    }

    const customParams = {};
    for (let columnIndex = 1; columnIndex < header.length; columnIndex += 1) {
      const key = customParamKeys[columnIndex - 1];
      const value = (row[columnIndex] || "").trim();
      if (value) {
        customParams[key] = value;
      }
    }

    if (Object.keys(customParams).length === 0) {
      continue;
    }

    updates.push({ mediaId, customParams });
  }

  if (updates.length === 0) {
    throw new Error(
      "CSV file does not contain any rows with MediaID and custom parameter values."
    );
  }

  return updates;
}

function parseCsvRows(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];

    if (inQuotes) {
      if (char === '"') {
        if (csvText[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (char === "\r") {
      if (csvText[i + 1] === "\n") {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (inQuotes) {
    throw new Error("CSV format error: unmatched quote.");
  }

  row.push(cell);
  const hasTrailingData = row.length > 1 || row[0].trim() !== "";
  if (hasTrailingData) {
    rows.push(row);
  }

  return rows;
}

async function sendRequest({
  url,
  payload,
  button,
  defaultButtonText,
  loadingButtonText,
  statusLine,
  responseBox,
  onSuccessMessage,
}) {
  setButtonLoading(button, true, loadingButtonText);
  showStatus(statusLine, "Sending request...", false);
  responseBox.textContent = "";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await readJsonResponse(response);
    if (response.ok) {
      const successMessage = onSuccessMessage
        ? onSuccessMessage(response, data)
        : `Request succeeded. HTTP ${response.status}.`;
      showStatus(statusLine, successMessage, false);
    } else {
      showStatus(statusLine, `Request failed. HTTP ${response.status}.`, true);
    }

    responseBox.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    showFailure(statusLine, responseBox, error);
  } finally {
    setButtonLoading(button, false, defaultButtonText);
  }
}

function showFailure(statusLine, responseBox, error) {
  const message =
    error instanceof Error
      ? error.message
      : "Unexpected error while processing the request.";
  showStatus(statusLine, message, true);
  responseBox.textContent = String(error);
}

function showStatus(statusLine, message, isError) {
  statusLine.textContent = message;
  statusLine.style.color = isError ? "#b91c1c" : "#065f46";
}

function setButtonLoading(button, isLoading, text) {
  button.disabled = isLoading;
  button.textContent = text;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return { raw: await response.text() };
  }

  try {
    return await response.json();
  } catch {
    return { parseError: "Failed to parse JSON response body." };
  }
}
