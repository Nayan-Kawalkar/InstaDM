// Local preview of the dashboard + API without Vercel: `npm run local`
// Reads .env, serves public/, and routes /api/<name> to api/<name>.js.
// Without Upstash env vars, data is kept in memory (lost on restart).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT) || 3000;

// load .env (does not override variables already set)
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}
if (!process.env.DASHBOARD_PASSWORD) console.warn("⚠  DASHBOARD_PASSWORD is not set in .env, so you can't log in.");

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    try {
      const api = url.pathname.match(/^\/api\/([a-z0-9-]+)$/);
      if (api) {
        const mod = await import(pathToFileURL(path.join(root, "api", api[1] + ".js")).href);
        const handler = mod[req.method];
        if (!handler) return send(res, 405, "Method not allowed");
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
        const response = await handler(request);
        const headers = Object.fromEntries(response.headers);
        // browsers drop Secure cookies on plain http (except localhost in some) — strip for local dev
        if (headers["set-cookie"]) headers["set-cookie"] = headers["set-cookie"].replace("; Secure", "");
        res.writeHead(response.status, headers);
        return res.end(Buffer.from(await response.arrayBuffer()));
      }
      let file = path.join(root, "public", url.pathname === "/" ? "index.html" : url.pathname);
      if (!file.startsWith(path.join(root, "public")) || !fs.existsSync(file)) return send(res, 404, "Not found");
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      console.error(e);
      send(res, 500, String(e?.message ?? e));
    }
  })
  .listen(PORT, () => console.log(`InstaDM dashboard: http://localhost:${PORT}`));

function send(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain" });
  res.end(text);
}
