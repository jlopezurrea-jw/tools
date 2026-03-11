const express = require("express");
const path = require("node:path");
const { analyzeStream } = require("./src/analyzer");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "scte-marker-analyzer",
    now: new Date().toISOString(),
  });
});

app.post("/api/analyze", async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    res.status(400).json({
      error: "A stream URL is required.",
    });
    return;
  }

  let normalized;
  try {
    normalized = new URL(url);
  } catch (_error) {
    res.status(400).json({
      error: "The provided URL is invalid.",
    });
    return;
  }

  if (!["http:", "https:"].includes(normalized.protocol)) {
    res.status(400).json({
      error: "Only HTTP and HTTPS URLs are supported.",
    });
    return;
  }

  try {
    const analysis = await analyzeStream(normalized.toString());
    res.json(analysis);
  } catch (error) {
    res.status(422).json({
      error: error.message,
    });
  }
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`SCTE analyzer running at http://localhost:${port}`);
});
