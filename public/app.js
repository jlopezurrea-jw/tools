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

const seriesForm = document.getElementById("series-form");
const seriesSubmitButton = document.getElementById("series-submit-btn");
const seriesStatusLine = document.getElementById("series-status-line");
const seriesResponseBox = document.getElementById("series-response-box");

setupTabs();
setupSingleUpdateForm();
setupBulkLinesForm();
setupBulkCsvForm();
setupSeriesForm();

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

function setupSeriesForm() {
  seriesForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const connection = getConnectionSettings();
      const formData = new FormData(seriesForm);
      const seriesTitle = String(formData.get("seriesTitle") || "").trim();
      const seriesSeasonSort = String(formData.get("seriesSeasonSort") || "").trim();
      const seriesEpisodeSort = String(
        formData.get("seriesEpisodeSort") || ""
      ).trim();
      const seasonsJsonInput = String(formData.get("seriesSeasonsJson") || "");

      if (!seriesTitle) {
        throw new Error("Series title is required.");
      }

      const sort = {};
      if (seriesSeasonSort) {
        sort.season = seriesSeasonSort;
      }
      if (seriesEpisodeSort) {
        sort.episode = seriesEpisodeSort;
      }

      const seasons = parseSeriesSeasonsJson(seasonsJsonInput);

      await sendRequest({
        url: "/api/series/create-with-seasons",
        payload: {
          ...connection,
          seriesTitle,
          sort,
          seasons,
        },
        button: seriesSubmitButton,
        defaultButtonText: "Create series and seasons",
        loadingButtonText: "Creating series...",
        statusLine: seriesStatusLine,
        responseBox: seriesResponseBox,
        onSuccessMessage: (_response, data) => {
          const seriesId = data?.series?.seriesId || "(unknown)";
          const succeeded = data?.seasons?.succeeded ?? 0;
          const total = data?.seasons?.total ?? 0;
          return `Series created (${seriesId}). Seasons created: ${succeeded}/${total}.`;
        },
      });
    } catch (error) {
      showFailure(seriesStatusLine, seriesResponseBox, error);
    }
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

function parseSeriesSeasonsJson(input) {
  if (!input.trim()) {
    throw new Error("Seasons JSON is required.");
  }

  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error("Seasons JSON is invalid. Verify the JSON format.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Seasons JSON must be a non-empty array.");
  }

  return parsed.map((season, seasonIndex) => {
    if (season === null || typeof season !== "object" || Array.isArray(season)) {
      throw new Error(`Season ${seasonIndex + 1} must be an object.`);
    }

    const normalizedSeason = {};
    const number = Number(season.number);
    if (!Number.isInteger(number) || number <= 0) {
      throw new Error(
        `Season ${seasonIndex + 1} must include a positive number value.`
      );
    }
    normalizedSeason.number = number;

    if (season.title !== undefined) {
      if (typeof season.title !== "string") {
        throw new Error(`Season ${seasonIndex + 1} title must be a string.`);
      }
      const title = season.title.trim();
      if (title) {
        normalizedSeason.title = title;
      }
    }

    if (season.description !== undefined) {
      if (typeof season.description !== "string") {
        throw new Error(
          `Season ${seasonIndex + 1} description must be a string.`
        );
      }
      const description = season.description.trim();
      if (description) {
        normalizedSeason.description = description;
      }
    }

    if (!Array.isArray(season.episodes) || season.episodes.length === 0) {
      throw new Error(
        `Season ${seasonIndex + 1} must include a non-empty episodes array.`
      );
    }

    normalizedSeason.episodes = season.episodes.map((episode, episodeIndex) => {
      if (
        episode === null ||
        typeof episode !== "object" ||
        Array.isArray(episode)
      ) {
        throw new Error(
          `Season ${seasonIndex + 1}, episode ${
            episodeIndex + 1
          } must be an object.`
        );
      }

      const mediaId = String(episode.mediaId || "").trim();
      if (!mediaId) {
        throw new Error(
          `Season ${seasonIndex + 1}, episode ${
            episodeIndex + 1
          } must include mediaId.`
        );
      }

      const episodeNumber = Number(episode.episodeNumber);
      if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) {
        throw new Error(
          `Season ${seasonIndex + 1}, episode ${
            episodeIndex + 1
          } must include a positive episodeNumber.`
        );
      }

      return { mediaId, episodeNumber };
    });

    return normalizedSeason;
  });
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
