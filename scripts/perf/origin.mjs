#!/usr/bin/env node
import http from "node:http";
import { readFile, stat, realpath } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { promisify, parseArgs } from "node:util";
import { gzip, brotliCompress, constants } from "node:zlib";

const { values } = parseArgs({ options: {
  help: { type: "boolean" }, dist: { type: "string", default: "dist" },
  port: { type: "string", default: "4180" },
} });
if (values.help) {
  console.log("Usage: node scripts/perf/origin.mjs [--dist dist] [--port 4180]\nServes a build with public/_headers, compression and the real Pages API proxy.\nLoads PHAROS_API_* exactly like Vite (development mode); never prints the key.\nLocal HTTP/1.1 only: no Cloudflare edge cache or CDN transport emulation.");
  process.exit(0);
}
const root = fileURLToPath(new URL("../../", import.meta.url));
const dist = await realpath(resolve(values.dist));
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("--port must be 1–65535");
const [{ build }, { loadEnv }, { loadWorktreeSharedPharosEnv }] = await Promise.all([
  import("esbuild"), import("vite"), import("../pharosville/local-api-env.mjs"),
]);
const config = { ...loadWorktreeSharedPharosEnv(root), ...loadEnv("development", root, "PHAROS_API_"), ...process.env };
if (!config.PHAROS_API_KEY?.trim()) throw new Error("Local API configuration missing; use npm run setup:local-api-key");
// Same default as vite.config.ts's dev proxy: a key-only .env.local targets the canonical API.
const env = { PHAROS_API_BASE: config.PHAROS_API_BASE ?? "https://api.pharos.watch", PHAROS_API_KEY: config.PHAROS_API_KEY };
const result = await build({ entryPoints: [resolve(root, "functions/api/[[path]].ts")], bundle: true, platform: "node", format: "esm", write: false, logLevel: "silent" });
const { onRequest } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const rules = [];
let rule;
for (const line of (await readFile(resolve(root, "public/_headers"), "utf8")).split(/\r?\n/)) {
  if (!line.trim() || line.trimStart().startsWith("#")) continue;
  if (!/^\s/.test(line)) {
    // Pages placeholders match one path segment; its single splat may span nested directories.
    const escaped = line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/:[A-Za-z]\w*/g, "[^/]+").replace(/\*/g, ".*");
    rule = { pattern: new RegExp(`^${escaped}$`), headers: {} };
    rules.push(rule);
  } else {
    const match = line.match(/^\s+([\w-]+):\s*(.*)$/);
    if (match && rule) rule.headers[match[1].toLowerCase()] = match[2];
  }
}
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".gz": "application/gzip", ".glb": "model/gltf-binary", ".webp": "image/webp", ".avif": "image/avif", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const compressBr = promisify(brotliCompress), compressGzip = promisify(gzip);
function accepts(header, encoding) {
  const entries = String(header ?? "").split(",").map((entry) => entry.trim().split(";"));
  const found = entries.find(([name]) => name === encoding) ?? entries.find(([name]) => name === "*");
  return !!found && !found.slice(1).some((part) => /^\s*q=0(?:\.0*)?\s*$/.test(part));
}
async function send(req, res, status, body, headers) {
  let bytes = Buffer.from(body);
  const h = { ...headers };
  const compressible = /^(text\/|application\/(?:json|javascript|manifest\+json))/.test(h["content-type"] ?? "");
  if (status === 200 && !h["content-encoding"] && compressible && bytes.length > 1000) {
    h.vary = h.vary ? `${h.vary}, Accept-Encoding` : "Accept-Encoding";
    if (accepts(req.headers["accept-encoding"], "br")) {
      bytes = await compressBr(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }); h["content-encoding"] = "br";
    } else if (accepts(req.headers["accept-encoding"], "gzip")) {
      bytes = await compressGzip(bytes); h["content-encoding"] = "gzip";
    }
  }
  if (![204, 304].includes(status)) h["content-length"] = bytes.length;
  else delete h["content-length"];
  res.writeHead(status, h);
  res.end(req.method === "HEAD" || [204, 304].includes(status) ? undefined : bytes);
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname.startsWith("/api/")) {
      // Forward validators as well as the method; browser-managed 304 body reuse stays real.
      const response = await onRequest({ request: new Request(url, { method: req.method, headers: req.headers }), env,
        params: { path: url.pathname.split("/").slice(2) }, waitUntil: (promise) => void promise.catch(() => {}) });
      await send(req, res, response.status, await response.arrayBuffer(), Object.fromEntries(response.headers));
      return;
    }
    const path = decodeURIComponent(url.pathname);
    for (const rule of rules) if (rule.pattern.test(path)) {
      for (const [name, value] of Object.entries(rule.headers)) res.setHeader(name, value);
    }
    if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405, { allow: "GET, HEAD" }); res.end(); return; }
    let file = resolve(dist, `.${path === "/" ? "/index.html" : path}`);
    if (!file.startsWith(dist + sep)) { res.writeHead(403); res.end(); return; }
    let info;
    try { info = await stat(file); if (!info.isFile()) throw new Error("not a file"); }
    catch {
      if (extname(path)) { res.writeHead(404); res.end("Not found"); return; }
      file = resolve(dist, "index.html"); info = await stat(file);
    }
    const canonical = await realpath(file);
    if (!canonical.startsWith(dist + sep)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(canonical);
    const etag = `"${createHash("sha1").update(data).digest("hex")}"`;
    // Live Pages JSON revalidates immediately; unlisted media uses its observed 60-second default.
    const headers = { "content-type": mime[extname(file)] ?? "application/octet-stream",
      "cache-control": `public, max-age=${/\.(?:json|html|webmanifest)$/.test(file) ? 0 : 60}, must-revalidate`,
      etag, "last-modified": info.mtime.toUTCString() };
    for (const rule of rules) if (rule.pattern.test(path)) Object.assign(headers, rule.headers);
    const validators = String(req.headers["if-none-match"] ?? "").split(",").map((tag) => tag.trim().replace(/^W\//, ""));
    const unchanged = req.headers["if-none-match"] !== undefined
      ? validators.includes(etag) || validators.includes("*")
      : req.headers["if-modified-since"] && Math.floor(info.mtimeMs / 1000) <= Math.floor(Date.parse(req.headers["if-modified-since"]) / 1000);
    await send(req, res, unchanged ? 304 : 200, unchanged ? Buffer.alloc(0) : data, headers);
  } catch {
    // Never log a thrown upstream error: it could contain server-only configuration.
    res.writeHead(500, { "content-type": "application/json" }); res.end('{"error":"Local origin failed"}');
  }
});
server.listen(port, "127.0.0.1", () => console.log(`Performance origin ready http://127.0.0.1:${port}/ (dist + real Pages proxy; no edge cache)`));
