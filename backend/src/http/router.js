// Tiny zero-dependency router over node:http. Supports path params (:name),
// JSON body parsing, cookies, and the standard error shape.
import { AppError } from "../errors.js";

export class Router {
  constructor() {
    /** @type {{method:string, parts:string[], handler:Function}[]} */
    this.routes = [];
  }

  add(method, pattern, handler) {
    this.routes.push({ method, parts: pattern.split("/").filter(Boolean), handler });
  }
  get(p, h) { this.add("GET", p, h); }
  post(p, h) { this.add("POST", p, h); }

  match(method, pathname) {
    const segs = pathname.split("/").filter(Boolean);
    for (const r of this.routes) {
      if (r.method !== method || r.parts.length !== segs.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < r.parts.length; i++) {
        const p = r.parts[i];
        if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(segs[i]);
        else if (p !== segs[i]) { ok = false; break; }
      }
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie ?? "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) reject(new AppError("UNPROCESSABLE", "Body too large", 413));
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new AppError("UNPROCESSABLE", "Invalid JSON body", 400));
      }
    });
    req.on("error", reject);
  });
}

export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

export function sendError(res, err, correlationId = "n/a") {
  const e = err instanceof AppError ? err : new AppError("INTERNAL", "Internal server error", 500);
  if (!(err instanceof AppError)) console.error(err);
  sendJson(res, e.status, {
    error: { code: e.code, message: e.message, fieldErrors: e.fieldErrors ?? {}, correlationId },
  });
}
