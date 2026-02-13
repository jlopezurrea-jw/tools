const path = require("node:path");

const dotenv = require("dotenv");
const express = require("express");

dotenv.config();

const app = express();
const port = Number.parseInt(process.env.PORT || "3000", 10);

const TITLE_LIMIT = 5000;
const DESCRIPTION_LIMIT = 25000;
const CUSTOM_PARAM_VALUE_LIMIT = 7500;
const MAX_BULK_ITEMS = 300;

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/media/update", async (req, res) => {
  const {
    siteId,
    apiSecret,
    mediaId,
    title,
    description,
    customParams = {},
  } = req.body || {};

  const commonError = getSiteAndSecretValidationError(siteId, apiSecret);
  if (commonError) {
    return res.status(400).json({
      ok: false,
      error: commonError,
    });
  }

  if (!isNonEmptyString(mediaId)) {
    return res.status(400).json({
      ok: false,
      error: "mediaId is required.",
    });
  }

  const metadataResult = buildMetadataForSingleUpdate({
    title,
    description,
    customParams,
  });
  if (metadataResult.error) {
    return res.status(400).json({
      ok: false,
      error: metadataResult.error,
    });
  }
  const metadata = metadataResult.metadata;

  if (Object.keys(metadata).length === 0) {
    return res.status(400).json({
      ok: false,
      error:
        "At least one metadata field is required (title, description, or custom params).",
    });
  }

  try {
    const updateResult = await updateMedia({
      siteId: siteId.trim(),
      apiSecret: apiSecret.trim(),
      mediaId: mediaId.trim(),
      metadata,
    });

    return res.status(updateResult.jwStatus).json({
      ok: updateResult.ok,
      jwStatus: updateResult.jwStatus,
      endpoint: updateResult.endpoint,
      request: { metadata },
      jwResponse: updateResult.jwResponse,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error:
        "Unable to reach JW Platform API. Verify your network and try again.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/media/bulk-custom-lines", async (req, res) => {
  const { siteId, apiSecret, mediaIds, customParams = {} } = req.body || {};

  const commonError = getSiteAndSecretValidationError(siteId, apiSecret);
  if (commonError) {
    return res.status(400).json({
      ok: false,
      error: commonError,
    });
  }

  if (!Array.isArray(mediaIds)) {
    return res.status(400).json({
      ok: false,
      error: "mediaIds must be an array of Media ID strings.",
    });
  }

  const normalizedMediaIds = [...new Set(mediaIds.map(normalizeMediaId).filter(Boolean))];
  if (normalizedMediaIds.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "At least one valid Media ID is required.",
    });
  }

  if (normalizedMediaIds.length > MAX_BULK_ITEMS) {
    return res.status(400).json({
      ok: false,
      error: `Maximum ${MAX_BULK_ITEMS} Media IDs per bulk request.`,
    });
  }

  const customParamResult = normalizeCustomParams(customParams, {
    requireAtLeastOne: true,
  });
  if (customParamResult.error) {
    return res.status(400).json({
      ok: false,
      error: customParamResult.error,
    });
  }

  const items = normalizedMediaIds.map((mediaId) => ({
    mediaId,
    metadata: { custom_params: customParamResult.customParams },
  }));

  const bulkResult = await runBulkUpdate({
    siteId: siteId.trim(),
    apiSecret: apiSecret.trim(),
    items,
  });

  return res.status(bulkResult.failed === 0 ? 200 : 207).json({
    ok: bulkResult.failed === 0,
    mode: "bulk-custom-lines",
    siteId: siteId.trim(),
    total: bulkResult.total,
    succeeded: bulkResult.succeeded,
    failed: bulkResult.failed,
    results: bulkResult.results,
  });
});

app.post("/api/media/bulk-custom-csv", async (req, res) => {
  const { siteId, apiSecret, updates } = req.body || {};

  const commonError = getSiteAndSecretValidationError(siteId, apiSecret);
  if (commonError) {
    return res.status(400).json({
      ok: false,
      error: commonError,
    });
  }

  if (!Array.isArray(updates)) {
    return res.status(400).json({
      ok: false,
      error:
        "updates must be an array of objects with mediaId and customParams.",
    });
  }

  if (updates.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "CSV payload is empty. Add at least one media row.",
    });
  }

  if (updates.length > MAX_BULK_ITEMS) {
    return res.status(400).json({
      ok: false,
      error: `Maximum ${MAX_BULK_ITEMS} rows per CSV bulk request.`,
    });
  }

  const items = [];
  for (let index = 0; index < updates.length; index += 1) {
    const row = updates[index];

    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      return res.status(400).json({
        ok: false,
        error: `updates[${index}] must be an object.`,
      });
    }

    const mediaId = normalizeMediaId(row.mediaId);
    if (!mediaId) {
      return res.status(400).json({
        ok: false,
        error: `updates[${index}].mediaId is required.`,
      });
    }

    const customParamResult = normalizeCustomParams(row.customParams, {
      requireAtLeastOne: true,
    });
    if (customParamResult.error) {
      return res.status(400).json({
        ok: false,
        error: `updates[${index}]: ${customParamResult.error}`,
      });
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

  return res.status(bulkResult.failed === 0 ? 200 : 207).json({
    ok: bulkResult.failed === 0,
    mode: "bulk-custom-csv",
    siteId: siteId.trim(),
    total: bulkResult.total,
    succeeded: bulkResult.succeeded,
    failed: bulkResult.failed,
    results: bulkResult.results,
  });
});

app.post("/api/series/create-with-seasons", async (req, res) => {
  const {
    siteId,
    apiSecret,
    seriesTitle,
    sort = {},
    seasons = [],
  } = req.body || {};

  const commonError = getSiteAndSecretValidationError(siteId, apiSecret);
  if (commonError) {
    return res.status(400).json({
      ok: false,
      error: commonError,
    });
  }

  if (!isNonEmptyString(seriesTitle)) {
    return res.status(400).json({
      ok: false,
      error: "seriesTitle is required.",
    });
  }

  const sortResult = normalizeSeriesSort(sort);
  if (sortResult.error) {
    return res.status(400).json({
      ok: false,
      error: sortResult.error,
    });
  }

  const seasonsResult = normalizeSeriesSeasons(seasons);
  if (seasonsResult.error) {
    return res.status(400).json({
      ok: false,
      error: seasonsResult.error,
    });
  }
  const normalizedSeasons = seasonsResult.seasons;

  const seriesMetadata = { title: seriesTitle.trim() };
  if (Object.keys(sortResult.sort).length > 0) {
    seriesMetadata.sort = sortResult.sort;
  }

  let createdSeries;
  try {
    createdSeries = await createSeries({
      siteId: siteId.trim(),
      apiSecret: apiSecret.trim(),
      metadata: seriesMetadata,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error:
        "Unable to reach JW Platform API while creating the series. Verify your network and retry.",
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const seriesId = extractResourceId(createdSeries.jwResponse);
  if (!createdSeries.ok || !seriesId) {
    return res.status(createdSeries.jwStatus).json({
      ok: false,
      mode: "series-create-with-seasons",
      series: {
        ok: createdSeries.ok,
        jwStatus: createdSeries.jwStatus,
        endpoint: createdSeries.endpoint,
        request: { metadata: seriesMetadata },
        seriesId: seriesId || null,
        jwResponse: createdSeries.jwResponse,
      },
      seasons: {
        total: normalizedSeasons.length,
        succeeded: 0,
        failed: normalizedSeasons.length,
        results: [],
      },
    });
  }

  const seasonResults = [];
  for (const season of normalizedSeasons) {
    try {
      const createdSeason = await createSeason({
        siteId: siteId.trim(),
        apiSecret: apiSecret.trim(),
        seriesId,
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

  const seasonSucceeded = seasonResults.filter((result) => result.ok).length;
  const seasonFailed = seasonResults.length - seasonSucceeded;
  const statusCode = seasonFailed === 0 ? 201 : 207;

  return res.status(statusCode).json({
    ok: seasonFailed === 0,
    mode: "series-create-with-seasons",
    series: {
      ok: createdSeries.ok,
      jwStatus: createdSeries.jwStatus,
      endpoint: createdSeries.endpoint,
      request: { metadata: seriesMetadata },
      seriesId,
      jwResponse: createdSeries.jwResponse,
    },
    seasons: {
      total: seasonResults.length,
      succeeded: seasonSucceeded,
      failed: seasonFailed,
      results: seasonResults,
    },
  });
});

app.listen(port, () => {
  console.log(`JWX metadata tool running on http://localhost:${port}`);
});

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
    return {
      error: "At least one custom parameter is required.",
    };
  }

  return { customParams: normalizedCustomParams };
}

function normalizeSeriesSort(sort) {
  if (sort === null || sort === undefined) {
    return { sort: {} };
  }

  if (typeof sort !== "object" || Array.isArray(sort)) {
    return { error: "sort must be an object with optional season/episode keys." };
  }

  const allowedValues = new Set(["asc", "dsc"]);
  const normalizedSort = {};

  if (sort.season !== undefined) {
    if (typeof sort.season !== "string" || !allowedValues.has(sort.season.trim())) {
      return { error: "sort.season must be either 'asc' or 'dsc'." };
    }
    normalizedSort.season = sort.season.trim();
  }

  if (sort.episode !== undefined) {
    if (
      typeof sort.episode !== "string" ||
      !allowedValues.has(sort.episode.trim())
    ) {
      return { error: "sort.episode must be either 'asc' or 'dsc'." };
    }
    normalizedSort.episode = sort.episode.trim();
  }

  return { sort: normalizedSort };
}

function normalizeSeriesSeasons(seasons) {
  if (!Array.isArray(seasons)) {
    return { error: "seasons must be an array." };
  }

  if (seasons.length === 0) {
    return { error: "At least one season definition is required." };
  }

  if (seasons.length > MAX_BULK_ITEMS) {
    return { error: `Maximum ${MAX_BULK_ITEMS} seasons per request.` };
  }

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

    const metadata = { number };
    if (season.title !== undefined) {
      if (typeof season.title !== "string") {
        return { error: `seasons[${seasonIndex}].title must be a string.` };
      }
      const title = season.title.trim();
      if (title) {
        metadata.title = title;
      }
    }

    if (season.description !== undefined) {
      if (typeof season.description !== "string") {
        return { error: `seasons[${seasonIndex}].description must be a string.` };
      }
      const description = season.description.trim();
      if (description) {
        metadata.description = description;
      }
    }

    if (!Array.isArray(season.episodes) || season.episodes.length === 0) {
      return {
        error: `seasons[${seasonIndex}].episodes must be a non-empty array.`,
      };
    }

    const media = [];
    const usedEpisodeNumbers = new Set();
    for (let episodeIndex = 0; episodeIndex < season.episodes.length; episodeIndex += 1) {
      const episode = season.episodes[episodeIndex];
      if (
        episode === null ||
        typeof episode !== "object" ||
        Array.isArray(episode)
      ) {
        return {
          error: `seasons[${seasonIndex}].episodes[${episodeIndex}] must be an object.`,
        };
      }

      if (!isNonEmptyString(episode.mediaId)) {
        return {
          error: `seasons[${seasonIndex}].episodes[${episodeIndex}].mediaId is required.`,
        };
      }

      const episodeNumber = toPositiveInteger(episode.episodeNumber);
      if (episodeNumber === null) {
        return {
          error: `seasons[${seasonIndex}].episodes[${episodeIndex}].episodeNumber must be a positive integer.`,
        };
      }

      if (usedEpisodeNumbers.has(episodeNumber)) {
        return {
          error: `seasons[${seasonIndex}] contains duplicate episodeNumber ${episodeNumber}.`,
        };
      }
      usedEpisodeNumbers.add(episodeNumber);

      media.push({
        id: episode.mediaId.trim(),
        episode_number: episodeNumber,
      });
    }

    normalizedSeasons.push({
      number,
      metadata,
      relationships: { media },
    });
  }

  return { seasons: normalizedSeasons };
}

async function runBulkUpdate({ siteId, apiSecret, items }) {
  const results = [];

  for (const item of items) {
    try {
      const updateResult = await updateMedia({
        siteId,
        apiSecret,
        mediaId: item.mediaId,
        metadata: item.metadata,
      });

      results.push({
        mediaId: item.mediaId,
        ok: updateResult.ok,
        jwStatus: updateResult.jwStatus,
        endpoint: updateResult.endpoint,
        request: { metadata: item.metadata },
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

async function updateMedia({ siteId, apiSecret, mediaId, metadata }) {
  const endpoint = `https://api.jwplayer.com/v2/sites/${encodeURIComponent(
    siteId
  )}/media/${encodeURIComponent(mediaId)}/`;

  return jwRequest({
    endpoint,
    method: "PATCH",
    apiSecret,
    body: { metadata },
  });
}

async function createSeries({ siteId, apiSecret, metadata }) {
  const endpoint = `https://api.jwplayer.com/v2/sites/${encodeURIComponent(
    siteId
  )}/series/`;

  return jwRequest({
    endpoint,
    method: "POST",
    apiSecret,
    body: { metadata },
  });
}

async function createSeason({ siteId, apiSecret, seriesId, season }) {
  const endpoint = `https://api.jwplayer.com/v2/sites/${encodeURIComponent(
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

async function jwRequest({ endpoint, method, apiSecret, body }) {
  const jwResponse = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${apiSecret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const jwResponseBody = await parseResponseBody(jwResponse);
  return {
    ok: jwResponse.ok,
    jwStatus: jwResponse.status,
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
