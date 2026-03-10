const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildContentTypeDefinition,
  FIELD_TYPE_CONFIG,
  HOSTING_TYPES
} = require("./src/contentTypeBuilder");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

function serveStatic(req, res) {
  const safePath = req.url === "/" ? "/index.html" : req.url;
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(resolvedPath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": getContentType(resolvedPath) });
    res.end(content);
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/field-config") {
    return sendJson(res, 200, {
      hostingTypes: HOSTING_TYPES,
      fieldTypes: FIELD_TYPE_CONFIG
    });
  }

  if (req.method === "POST" && req.url === "/api/content-types") {
    try {
      const payload = await parseBody(req);
      const definition = buildContentTypeDefinition(payload);
      return sendJson(res, 200, definition);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "GET") {
    return serveStatic(req, res);
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Custom content type service listening on http://localhost:${PORT}`);
});
