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

  const jwResponse = await fetch(endpoint, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiSecret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ metadata }),
  });

  const responseBody = await parseResponseBody(jwResponse);
  return {
    ok: jwResponse.ok,
    jwStatus: jwResponse.status,
    endpoint,
    jwResponse: responseBody,
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
