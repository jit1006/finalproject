// PRMS backend HTTP server — node:http + node:sqlite, zero dependencies.
import http from "node:http";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { db } from "./db/connection.js";
import { router, parseCookies, readJsonBody, sendJson, sendError } from "./http/index.js";

const server = http.createServer(async (req, res) => {
  const correlationId = req.headers["x-correlation-id"] ?? randomUUID();
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  // CORS for the Vite dev server (credentials included).
  res.setHeader("Access-Control-Allow-Origin", config.frontendOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Correlation-Id");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // Health check (no auth, no /api/v1 prefix).
  if (req.method === "GET" && url.pathname === "/health") {
    let dbUp = false;
    try {
      db.prepare("SELECT 1").get();
      dbUp = true;
    } catch {
      dbUp = false;
    }
    return sendJson(res, 200, { status: "ok", database: dbUp ? "up" : "down", env: config.environment });
  }

  const route = router.match(req.method, url.pathname);
  if (!route) return sendJson(res, 404, { error: { code: "NOT_FOUND", message: "No such route", correlationId } });

  try {
    const body = req.method === "POST" ? await readJsonBody(req) : {};
    const ctx = { req, res, params: route.params, body, cookies: parseCookies(req) };
    const result = route.handler(ctx);
    const resolved = result instanceof Promise ? await result : result;
    if (!res.headersSent) sendJson(res, resolved?.status ?? 200, resolved?.body ?? {});
  } catch (err) {
    sendError(res, err, correlationId);
  }
});

server.listen(config.port, () => {
  console.log(`PRMS backend (Node+SQLite) listening on http://localhost:${config.port}`);
  console.log(`DB file: ${config.databaseFile} · env: ${config.environment}`);
});
