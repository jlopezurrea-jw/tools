const path = require("node:path");

const dotenv = require("dotenv");
const express = require("express");

dotenv.config();

const app = express();
const port = Number.parseInt(process.env.PORT || "3000", 10);

const TITLE_LIMIT = 5000;
const DESCRIPTION_LIMIT = 25000;
const CUSTOM_PARAM_VALUE_LIMIT = 7500;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/media/update", async (req, res) => {
  const {
    siteId,
    mediaId,
    title,
    description,
    customParams = {},
  } = req.body || {};

  if (!isNonEmptyString(siteId)) {
    return res.status(400).json({
      ok: false,
      error: "siteId is required.",
    });
  }

  if (!isNonEmptyString(mediaId)) {
    return res.status(400).json({
      ok: false,
      error: "mediaId is required.",
    });
  }

  const metadata = {};

  if (title !== undefined) {
    if (typeof title !== "string") {
      return res.status(400).json({
        ok: false,
        error: "title must be a string.",
      });
    }

    const normalizedTitle = title.trim();
    if (normalizedTitle.length > TITLE_LIMIT) {
      return res.status(400).json({
        ok: false,
        error: `title exceeds ${TITLE_LIMIT} characters.`,
      });
    }

    if (normalizedTitle) {
      metadata.title = normalizedTitle;
    }
  }

  if (description !== undefined) {
    if (typeof description !== "string") {
      return res.status(400).json({
        ok: false,
        error: "description must be a string.",
      });
    }

    const normalizedDescription = description.trim();
    if (normalizedDescription.length > DESCRIPTION_LIMIT) {
      return res.status(400).json({
        ok: false,
        error: `description exceeds ${DESCRIPTION_LIMIT} characters.`,
      });
    }

    if (normalizedDescription) {
      metadata.description = normalizedDescription;
    }
  }

  if (customParams !== undefined) {
    if (
      customParams === null ||
      typeof customParams !== "object" ||
      Array.isArray(customParams)
    ) {
      return res.status(400).json({
        ok: false,
        error: "customParams must be an object of key/value string pairs.",
      });
    }

    const normalizedCustomParams = {};
    for (const [rawKey, rawValue] of Object.entries(customParams)) {
      const key = rawKey.trim();
      if (!key) {
        return res.status(400).json({
          ok: false,
          error: "customParams keys cannot be empty.",
        });
      }

      if (typeof rawValue !== "string") {
        return res.status(400).json({
          ok: false,
          error: `customParams.${key} must be a string.`,
        });
      }

      const value = rawValue.trim();
      if (value.length > CUSTOM_PARAM_VALUE_LIMIT) {
        return res.status(400).json({
          ok: false,
          error: `customParams.${key} exceeds ${CUSTOM_PARAM_VALUE_LIMIT} characters.`,
        });
      }

      normalizedCustomParams[key] = value;
    }

    if (Object.keys(normalizedCustomParams).length > 0) {
      metadata.custom_params = normalizedCustomParams;
    }
  }

  if (Object.keys(metadata).length === 0) {
    return res.status(400).json({
      ok: false,
      error:
        "At least one metadata field is required (title, description, or custom params).",
    });
  }

  const apiSecret = process.env.JWP_API_SECRET;
  if (!isNonEmptyString(apiSecret)) {
    return res.status(500).json({
      ok: false,
      error:
        "JWP_API_SECRET is not set on the server. Add it to your environment before retrying.",
    });
  }

  const endpoint = `https://api.jwplayer.com/v2/sites/${encodeURIComponent(
    siteId.trim()
  )}/media/${encodeURIComponent(mediaId.trim())}/`;

  try {
    const jwResponse = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiSecret.trim()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ metadata }),
    });

    const responseBody = await parseResponseBody(jwResponse);
    return res.status(jwResponse.status).json({
      ok: jwResponse.ok,
      jwStatus: jwResponse.status,
      endpoint,
      request: { metadata },
      jwResponse: responseBody,
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

app.listen(port, () => {
  console.log(`JWX metadata tool running on http://localhost:${port}`);
});

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
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
