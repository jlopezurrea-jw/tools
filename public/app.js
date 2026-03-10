const sharedSiteIdInput = document.getElementById("shared-site-id");
const sharedApiSecretInput = document.getElementById("shared-api-secret");

const JW_API_BASE = "https://api.jwplayer.com";
const TITLE_LIMIT = 5000;
const DESCRIPTION_LIMIT = 25000;
const CUSTOM_PARAM_VALUE_LIMIT = 7500;
const MAX_BULK_ITEMS = 300;

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

      const seasons = collectSeasonMappings();

      await sendRequest({
        url: "/api/series/map-seasons-episodes",
        payload: {
          ...connection,
          seriesId,
          seasons,
        },
        button: seriesMapSubmitButton,
        defaultButtonText: "Map seasons and episodes",
        loadingButtonText: "Mapping seasons...",
        statusLine: seriesMapStatusLine,
        responseBox: seriesMapResponseBox,
        onSuccessMessage: (_response, data) =>
          `Season mapping completed. ${data?.seasons?.succeeded ?? 0}/${
            data?.seasons?.total ?? 0
          } seasons succeeded.`,
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
    const { status, data } = await handleApiRequest(url, payload);
    if (status >= 200 && status < 300) {
      const successMessage = onSuccessMessage
        ? onSuccessMessage({ status, ok: true }, data)
        : `Request succeeded. HTTP ${status}.`;
      showStatus(statusLine, successMessage, false);
    } else {
      showStatus(statusLine, `Request failed. HTTP ${status}.`, true);
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

async function handleApiRequest(url, payload) {
  if (url === "/api/media/update") {
    return handleMediaUpdate(payload);
  }
  if (url === "/api/media/bulk-custom-lines") {
    return handleBulkCustomLines(payload);
  }
  if (url === "/api/media/bulk-custom-csv") {
    return handleBulkCustomCsv(payload);
  }
  if (url === "/api/series/create-placeholder") {
    return handleSeriesCreatePlaceholder(payload);
  }
  if (url === "/api/series/map-seasons-episodes") {
    return handleSeriesMapSeasonsEpisodes(payload);
  }

  return {
    status: 404,
    data: { ok: false, error: `Unknown API route: ${url}` },
  };
}

async function handleMediaUpdate(payload) {
  const {
    siteId,
    apiSecret,
    mediaId,
    title,
    description,
    customParams = {},
  } = payload || {};

  const commonError = getSiteAndSecretValidationError(siteId, apiSecret);
  if (commonError) {
    return { status: 400, data: { ok: false, error: commonError } };
  }

  if (!isNonEmptyString(mediaId)) {
    return { status: 400, data: { ok: false, error: "mediaId is required." } };
  }

  const metadataResult = buildMetadataForSingleUpdate({
    title,
    description,
    customParams,
  });
  if (metadataResult.error) {
    return { status: 400, data: { ok: false, error: metadataResult.error } };
  }

  const metadata = metadataResult.metadata;
  if (Object.keys(metadata).length === 0) {
    return {
      status: 400,
      data: {
        ok: false,
        error:
          "At least one metadata field is required (title, description, or custom params).",
      },
    };
  }

  try {
    const additiveMetadataResult = await resolveAdditiveMediaMetadata({
      siteId: siteId.trim(),
      apiSecret: apiSecret.trim(),
      mediaId: mediaId.trim(),
      incomingMetadata: metadata,
    });

    if (additiveMetadataResult.error) {
      return {
        status: additiveMetadataResult.jwStatus || 502,
        data: {
          ok: false,
          error:
            additiveMetadataResult.error ||
            "Unable to load existing media metadata before update.",
          mediaLookup: additiveMetadataResult.mediaLookup || null,
        },
      };
    }

    if (Object.keys(additiveMetadataResult.metadata).length === 0) {
      return {
        status: 200,
        data: {
          ok: true,
          jwStatus: 200,
          endpoint: null,
          request: { metadata: {} },
          skipped: true,
          message: "No metadata changes to apply. Existing metadata was left untouched.",
          additiveSummary: additiveMetadataResult.summary,
          mediaLookup: additiveMetadataResult.mediaLookup,
        },
      };
    }

    const updateResult = await updateMedia({
      siteId: siteId.trim(),
      apiSecret: apiSecret.trim(),
      mediaId: mediaId.trim(),
      metadata: additiveMetadataResult.metadata,
    });

    return {
      status: updateResult.jwStatus,
      data: {
        ok: updateResult.ok,
        jwStatus: updateResult.jwStatus,
        endpoint: updateResult.endpoint,
        request: { metadata: additiveMetadataResult.metadata },
        additiveSummary: additiveMetadataResult.summary,
        mediaLookup: additiveMetadataResult.mediaLookup,
        jwResponse: updateResult.jwResponse,
      },
    };
  } catch (error) {
    return {
      status: 502,
      data: {
        ok: false,
        error: "Unable to reach JW Platform API. Verify your network and try again.",
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function handleBulkCustomLines(payload) {
  const { siteId, apiSecret, mediaIds, customParams = {} } = payload || {};

  const commonError = getSiteAndSecretValidationError(siteId, apiSecret);
  if (commonError) {
    return { status: 400, data: { ok: false, error: commonError } };
  }

  if (!Array.isArray(mediaIds)) {
    return {
      status: 400,
      data: { ok: false, error: "mediaIds must be an array of Media ID strings." },
    };
  }

  const normalizedMediaIds = [...new Set(mediaIds.map(normalizeMediaId).filter(Boolean))];
  if (normalizedMediaIds.length === 0) {
    return {
      status: 400,
      data: { ok: false, error: "At least one valid Media ID is required." },
    };
  }

  if (normalizedMediaIds.length > MAX_BULK_ITEMS) {
    return {
      status: 400,
      data: {
        ok: false,
        error: `Maximum ${MAX_BULK_ITEMS} Media IDs per bulk request.`,
      },
    };
  }

  const customParamResult = normalizeCustomParams(customParams, {
    requireAtLeastOne: true,
  });
  if (customParamResult.error) {
    return { status: 400, data: { ok: false, error: customParamResult.error } };
  }

  const items = normalizedMediaIds.map((normalizedMediaId) => ({
    mediaId: normalizedMediaId,
    metadata: { custom_params: customParamResult.customParams },
  }));

  const bulkResult = await runBulkUpdate({
    siteId: siteId.trim(),
    apiSecret: apiSecret.trim(),
    items,
  });

  return {
    status: bulkResult.failed === 0 ? 200 : 207,
    data: {
      ok: bulkResult.failed === 0,
      mode: "bulk-custom-lines",
      siteId: siteId.trim(),
      total: bulkResult.total,
      succeeded: bulkResult.succeeded,
      failed: bulkResult.failed,
      results: bulkResult.results,
    },
  };
}

async function handleBulkCustomCsv(payload) {
  const { siteId, apiSecret, updates } = payload || {};

  const commonError = getSiteAndSecretValidationError(siteId, apiSecret);
  if (commonError) {
    return { status: 400, data: { ok: false, error: commonError } };
  }

  if (!Array.isArray(updates)) {
    return {
      status: 400,
      data: {
        ok: false,
        error: "updates must be an array of objects with mediaId and customParams.",
      },
    };
  }

  if (updates.length === 0) {
    return {
      status: 400,
      data: { ok: false, error: "CSV payload is empty. Add at least one media row." },
    };
  }

  if (updates.length > MAX_BULK_ITEMS) {
    return {
      status: 400,
      data: {
        ok: false,
        error: `Maximum ${MAX_BULK_ITEMS} rows per CSV bulk request.`,
      },
    };
  }

  const items = [];
  for (let index = 0; index < updates.length; index += 1) {
    const row = updates[index];
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      return { status: 400, data: { ok: false, error: `updates[${index}] must be an object.` } };
    }

    const mediaId = normalizeMediaId(row.mediaId);
    if (!mediaId) {
      return { status: 400, data: { ok: false, error: `updates[${index}].mediaId is required.` } };
    }

    const customParamResult = normalizeCustomParams(row.customParams, {
      requireAtLeastOne: true,
    });
    if (customParamResult.error) {
      return {
        status: 400,
        data: { ok: false, error: `updates[${index}]: ${customParamResult.error}` },
      };
    }

    items.push({
      mediaId,
      metadata: { custom_params: customParamResult.customParams },
    });
  }

  const bulkResult = await runBulkUpdate({
    siteId: siteId.trim(),
    apiSecret: apiSecret.trim(),
    items,
  });

  return {
    status: bulkResult.failed === 0 ? 200 : 207,
    data: {
      ok: bulkResult.failed === 0,
      mode: "bulk-custom-csv",
      siteId: siteId.trim(),
      total: bulkResult.total,
      succeeded: bulkResult.succeeded,
      failed: bulkResult.failed,
      results: bulkResult.results,
    },
  };
}

async function handleSeriesCreatePlaceholder(payload) {
  const { siteId, apiSecret, seriesName, seriesTitle } = payload || {};

  const commonError = getSiteAndSecretValidationError(siteId, apiSecret);
  if (commonError) {
    return { status: 400, data: { ok: false, error: commonError } };
  }

  const requestedSeriesName = isNonEmptyString(seriesName)
    ? seriesName.trim()
    : isNonEmptyString(seriesTitle)
      ? seriesTitle.trim()
      : "";

  if (!requestedSeriesName) {
    return { status: 400, data: { ok: false, error: "seriesName is required." } };
  }

  try {
    let metadataUsed = { title: requestedSeriesName };
    let strategy = "metadata.title";
    let createdSeries = await createSeries({
      siteId: siteId.trim(),
      apiSecret: apiSecret.trim(),
      metadata: metadataUsed,
    });

    if (!createdSeries.ok && hasTitleUnexpectedError(createdSeries.jwResponse)) {
      metadataUsed = {};
      strategy = "metadata.empty";
      createdSeries = await createSeries({
        siteId: siteId.trim(),
        apiSecret: apiSecret.trim(),
        metadata: metadataUsed,
      });
    }

    const seriesId = extractResourceId(createdSeries.jwResponse);
    const ok = createdSeries.ok && isNonEmptyString(seriesId);
    return {
      status: createdSeries.jwStatus,
      data: {
        ok,
        mode: "series-create-placeholder",
        seriesId: seriesId || null,
        seriesName: requestedSeriesName,
        strategy,
        series: {
          ok: createdSeries.ok,
          jwStatus: createdSeries.jwStatus,
          endpoint: createdSeries.endpoint,
          request: { metadata: metadataUsed },
          jwResponse: createdSeries.jwResponse,
        },
      },
    };
  } catch (error) {
    return {
      status: 502,
      data: {
        ok: false,
        error:
          "Unable to reach JW Platform API while creating the placeholder series. Verify your network and retry.",
        details: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function handleSeriesMapSeasonsEpisodes(payload) {
  const { siteId, apiSecret, seriesId, seasons } = payload || {};

  const commonError = getSiteAndSecretValidationError(siteId, apiSecret);
  if (commonError) {
    return { status: 400, data: { ok: false, error: commonError } };
  }

  if (!isNonEmptyString(seriesId)) {
    return { status: 400, data: { ok: false, error: "seriesId is required." } };
  }

  const normalizedResult = normalizeSeasonMediaMappings(seasons);
  if (normalizedResult.error) {
    return { status: 400, data: { ok: false, error: normalizedResult.error } };
  }

  const normalizedSeasons = normalizedResult.seasons;
  const seasonResults = [];
  for (const season of normalizedSeasons) {
    try {
      const createdSeason = await createSeason({
        siteId: siteId.trim(),
        apiSecret: apiSecret.trim(),
        seriesId: seriesId.trim(),
        season,
      });

      seasonResults.push({
        seasonNumber: season.number,
        ok: createdSeason.ok,
        jwStatus: createdSeason.jwStatus,
        endpoint: createdSeason.endpoint,
        request: {
          metadata: season.metadata,
          relationships: season.relationships,
        },
        seasonId: extractResourceId(createdSeason.jwResponse),
        jwResponse: createdSeason.jwResponse,
      });
    } catch (error) {
      seasonResults.push({
        seasonNumber: season.number,
        ok: false,
        jwStatus: 502,
        error:
          "Unable to reach JW Platform API while creating the season. Verify your network and retry.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const succeeded = seasonResults.filter((result) => result.ok).length;
  const failed = seasonResults.length - succeeded;
  return {
    status: failed === 0 ? 201 : 207,
    data: {
      ok: failed === 0,
      mode: "series-map-seasons-episodes",
      seriesId: seriesId.trim(),
      seasons: {
        total: seasonResults.length,
        succeeded,
        failed,
        results: seasonResults,
      },
    },
  };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function getSiteAndSecretValidationError(siteId, apiSecret) {
  if (!isNonEmptyString(siteId)) {
    return "siteId is required.";
  }
  if (!isNonEmptyString(apiSecret)) {
    return "apiSecret is required.";
  }
  return null;
}

function normalizeMediaId(mediaId) {
  return isNonEmptyString(mediaId) ? mediaId.trim() : "";
}

function buildMetadataForSingleUpdate({ title, description, customParams }) {
  const metadata = {};

  if (title !== undefined) {
    if (typeof title !== "string") {
      return { error: "title must be a string." };
    }
    const normalizedTitle = title.trim();
    if (normalizedTitle.length > TITLE_LIMIT) {
      return { error: `title exceeds ${TITLE_LIMIT} characters.` };
    }
    if (normalizedTitle) {
      metadata.title = normalizedTitle;
    }
  }

  if (description !== undefined) {
    if (typeof description !== "string") {
      return { error: "description must be a string." };
    }
    const normalizedDescription = description.trim();
    if (normalizedDescription.length > DESCRIPTION_LIMIT) {
      return { error: `description exceeds ${DESCRIPTION_LIMIT} characters.` };
    }
    if (normalizedDescription) {
      metadata.description = normalizedDescription;
    }
  }

  const customParamResult = normalizeCustomParams(customParams, {
    requireAtLeastOne: false,
  });
  if (customParamResult.error) {
    return { error: customParamResult.error };
  }

  if (Object.keys(customParamResult.customParams).length > 0) {
    metadata.custom_params = customParamResult.customParams;
  }

  return { metadata };
}

function normalizeCustomParams(customParams, { requireAtLeastOne }) {
  if (
    customParams === null ||
    customParams === undefined ||
    typeof customParams !== "object" ||
    Array.isArray(customParams)
  ) {
    return { error: "customParams must be an object of key/value string pairs." };
  }

  const normalizedCustomParams = {};
  for (const [rawKey, rawValue] of Object.entries(customParams)) {
    const key = rawKey.trim();
    if (!key) {
      return { error: "customParams keys cannot be empty." };
    }

    if (typeof rawValue !== "string") {
      return { error: `customParams.${key} must be a string.` };
    }

    const value = rawValue.trim();
    if (value.length > CUSTOM_PARAM_VALUE_LIMIT) {
      return {
        error: `customParams.${key} exceeds ${CUSTOM_PARAM_VALUE_LIMIT} characters.`,
      };
    }

    normalizedCustomParams[key] = value;
  }

  if (requireAtLeastOne && Object.keys(normalizedCustomParams).length === 0) {
    return { error: "At least one custom parameter is required." };
  }

  return { customParams: normalizedCustomParams };
}

function normalizeSeasonMediaMappings(seasons) {
  if (!Array.isArray(seasons)) {
    return { error: "seasons must be an array." };
  }
  if (seasons.length === 0) {
    return { error: "At least one season is required." };
  }
  if (seasons.length > MAX_BULK_ITEMS) {
    return { error: `Maximum ${MAX_BULK_ITEMS} seasons per request.` };
  }

  const seenSeasonNumbers = new Set();
  const normalizedSeasons = [];
  for (let seasonIndex = 0; seasonIndex < seasons.length; seasonIndex += 1) {
    const season = seasons[seasonIndex];
    if (season === null || typeof season !== "object" || Array.isArray(season)) {
      return { error: `seasons[${seasonIndex}] must be an object.` };
    }

    const number = toPositiveInteger(season.number);
    if (number === null) {
      return { error: `seasons[${seasonIndex}].number must be a positive integer.` };
    }
    if (seenSeasonNumbers.has(number)) {
      return { error: `Duplicate season number detected: ${number}.` };
    }
    seenSeasonNumbers.add(number);

    if (!Array.isArray(season.mediaIds) || season.mediaIds.length === 0) {
      return { error: `seasons[${seasonIndex}].mediaIds must be a non-empty array.` };
    }

    const normalizedMediaIds = [
      ...new Set(season.mediaIds.map(normalizeMediaId).filter(Boolean)),
    ];
    if (normalizedMediaIds.length === 0) {
      return {
        error: `seasons[${seasonIndex}].mediaIds must include at least one valid Media ID.`,
      };
    }

    const media = normalizedMediaIds.map((normalizedMediaId, mediaIndex) => ({
      id: normalizedMediaId,
      episode_number: mediaIndex + 1,
    }));

    normalizedSeasons.push({
      number,
      metadata: { number },
      relationships: { media },
    });
  }

  return { seasons: normalizedSeasons };
}

async function runBulkUpdate({ siteId, apiSecret, items }) {
  const results = [];

  for (const item of items) {
    try {
      const additiveMetadataResult = await resolveAdditiveMediaMetadata({
        siteId,
        apiSecret,
        mediaId: item.mediaId,
        incomingMetadata: item.metadata,
      });

      if (additiveMetadataResult.error) {
        results.push({
          mediaId: item.mediaId,
          ok: false,
          jwStatus: additiveMetadataResult.jwStatus || 502,
          error:
            additiveMetadataResult.error ||
            "Unable to load existing media metadata before update.",
          mediaLookup: additiveMetadataResult.mediaLookup || null,
        });
        continue;
      }

      if (Object.keys(additiveMetadataResult.metadata).length === 0) {
        results.push({
          mediaId: item.mediaId,
          ok: true,
          jwStatus: 200,
          endpoint: null,
          request: { metadata: {} },
          skipped: true,
          message: "No metadata changes to apply. Existing metadata was left untouched.",
          additiveSummary: additiveMetadataResult.summary,
          mediaLookup: additiveMetadataResult.mediaLookup,
          jwResponse: null,
        });
        continue;
      }

      const updateResult = await updateMedia({
        siteId,
        apiSecret,
        mediaId: item.mediaId,
        metadata: additiveMetadataResult.metadata,
      });

      results.push({
        mediaId: item.mediaId,
        ok: updateResult.ok,
        jwStatus: updateResult.jwStatus,
        endpoint: updateResult.endpoint,
        request: { metadata: additiveMetadataResult.metadata },
        additiveSummary: additiveMetadataResult.summary,
        mediaLookup: additiveMetadataResult.mediaLookup,
        jwResponse: updateResult.jwResponse,
      });
    } catch (error) {
      results.push({
        mediaId: item.mediaId,
        ok: false,
        jwStatus: 502,
        error: "Unable to reach JW Platform API. Verify your network and retry.",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const succeeded = results.filter((result) => result.ok).length;
  return {
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  };
}

async function resolveAdditiveMediaMetadata({
  siteId,
  apiSecret,
  mediaId,
  incomingMetadata,
}) {
  const mediaLookup = await getMedia({ siteId, apiSecret, mediaId });
  if (!mediaLookup.ok) {
    return {
      error:
        "Could not read current media metadata. Update skipped to avoid overwriting existing metadata.",
      jwStatus: mediaLookup.jwStatus,
      mediaLookup: {
        ok: mediaLookup.ok,
        jwStatus: mediaLookup.jwStatus,
        endpoint: mediaLookup.endpoint,
        jwResponse: mediaLookup.jwResponse,
      },
    };
  }

  const existingMetadata = extractMediaMetadata(mediaLookup.jwResponse);
  const additiveResult = buildAdditiveMetadata({
    existingMetadata,
    incomingMetadata,
  });

  return {
    metadata: additiveResult.metadata,
    summary: additiveResult.summary,
    mediaLookup: {
      ok: mediaLookup.ok,
      jwStatus: mediaLookup.jwStatus,
      endpoint: mediaLookup.endpoint,
      jwResponse: mediaLookup.jwResponse,
    },
  };
}

function buildAdditiveMetadata({ existingMetadata, incomingMetadata }) {
  const metadata = {};
  const summary = {
    added: {
      title: false,
      description: false,
      customParamKeys: [],
    },
    overwritten: {
      title: false,
      description: false,
      customParamKeys: [],
    },
    unchanged: {
      title: false,
      description: false,
      customParamKeys: [],
    },
  };

  if (isNonEmptyString(incomingMetadata.title)) {
    const incomingTitle = incomingMetadata.title.trim();
    if (!isNonEmptyString(existingMetadata.title)) {
      metadata.title = incomingTitle;
      summary.added.title = true;
    } else if (existingMetadata.title.trim() !== incomingTitle) {
      metadata.title = incomingTitle;
      summary.overwritten.title = true;
    } else {
      summary.unchanged.title = true;
    }
  }

  if (isNonEmptyString(incomingMetadata.description)) {
    const incomingDescription = incomingMetadata.description.trim();
    if (!isNonEmptyString(existingMetadata.description)) {
      metadata.description = incomingDescription;
      summary.added.description = true;
    } else if (existingMetadata.description.trim() !== incomingDescription) {
      metadata.description = incomingDescription;
      summary.overwritten.description = true;
    } else {
      summary.unchanged.description = true;
    }
  }

  const incomingCustomParams = toPlainObject(incomingMetadata.custom_params);
  if (incomingCustomParams) {
    const existingCustomParams = toPlainObject(existingMetadata.custom_params) || {};
    const mergedCustomParams = { ...existingCustomParams };

    for (const [key, value] of Object.entries(incomingCustomParams)) {
      if (Object.prototype.hasOwnProperty.call(existingCustomParams, key)) {
        const existingValue = existingCustomParams[key];
        if (existingValue === value) {
          summary.unchanged.customParamKeys.push(key);
        } else {
          summary.overwritten.customParamKeys.push(key);
        }
        mergedCustomParams[key] = value;
        continue;
      }

      mergedCustomParams[key] = value;
      summary.added.customParamKeys.push(key);
    }

    if (
      summary.added.customParamKeys.length > 0 ||
      summary.overwritten.customParamKeys.length > 0
    ) {
      metadata.custom_params = mergedCustomParams;
    }
  }

  return { metadata, summary };
}

function extractMediaMetadata(payload) {
  if (payload === null || typeof payload !== "object") {
    return {};
  }

  const candidates = [
    payload.metadata,
    payload.data?.metadata,
    payload.data?.attributes?.metadata,
    payload.attributes?.metadata,
    payload.data?.attributes,
    payload.attributes,
    payload.data,
    payload,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeMediaMetadataCandidate(candidate);
    if (Object.keys(normalized).length > 0) {
      return normalized;
    }
  }

  return {};
}

function normalizeMediaMetadataCandidate(candidate) {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {};
  }

  const metadata = {};
  if (typeof candidate.title === "string") {
    metadata.title = candidate.title;
  }
  if (typeof candidate.description === "string") {
    metadata.description = candidate.description;
  }

  const customParams = toPlainObject(candidate.custom_params);
  if (customParams) {
    metadata.custom_params = customParams;
  }

  return metadata;
}

function toPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}

async function updateMedia({ siteId, apiSecret, mediaId, metadata }) {
  const endpoint = `${JW_API_BASE}/v2/sites/${encodeURIComponent(
    siteId
  )}/media/${encodeURIComponent(mediaId)}/`;
  return jwRequest({
    endpoint,
    method: "PATCH",
    apiSecret,
    body: { metadata },
  });
}

async function getMedia({ siteId, apiSecret, mediaId }) {
  const endpoint = `${JW_API_BASE}/v2/sites/${encodeURIComponent(
    siteId
  )}/media/${encodeURIComponent(mediaId)}/`;
  return jwRequest({
    endpoint,
    method: "GET",
    apiSecret,
  });
}

async function createSeries({ siteId, apiSecret, metadata }) {
  const endpoint = `${JW_API_BASE}/v2/sites/${encodeURIComponent(siteId)}/series/`;
  return jwRequest({
    endpoint,
    method: "POST",
    apiSecret,
    body: { metadata },
  });
}

async function createSeason({ siteId, apiSecret, seriesId, season }) {
  const endpoint = `${JW_API_BASE}/v2/sites/${encodeURIComponent(
    siteId
  )}/series/${encodeURIComponent(seriesId)}/seasons/`;
  return jwRequest({
    endpoint,
    method: "POST",
    apiSecret,
    body: {
      metadata: season.metadata,
      relationships: season.relationships,
    },
  });
}

function extractResourceId(payload) {
  if (payload === null || payload === undefined) {
    return null;
  }
  if (typeof payload === "object" && isNonEmptyString(payload.id)) {
    return payload.id.trim();
  }
  return null;
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function hasTitleUnexpectedError(jwResponse) {
  if (jwResponse === null || typeof jwResponse !== "object") {
    return false;
  }
  const errors = Array.isArray(jwResponse.errors) ? jwResponse.errors : [];
  return errors.some((error) => {
    const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";
    const description =
      typeof error?.description === "string" ? error.description.toLowerCase() : "";
    return (
      code === "invalid_body" &&
      description.includes("title") &&
      description.includes("unexpected")
    );
  });
}

async function jwRequest({ endpoint, method, apiSecret, body }) {
  const headers = {
    Authorization: `Bearer ${apiSecret}`,
    Accept: "application/json",
  };

  const requestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestInit.body = JSON.stringify(body);
  }

  const response = await fetch(endpoint, requestInit);
  const jwResponseBody = await parseResponseBody(response);
  return {
    ok: response.ok,
    jwStatus: response.status,
    endpoint,
    jwResponse: jwResponseBody,
  };
}

async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType) {
    return null;
  }

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return { parseError: "Failed to parse JSON response body." };
    }
  }

  return response.text();
}
