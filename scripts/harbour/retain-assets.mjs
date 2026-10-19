#!/usr/bin/env node
/** Retain exactly the current live generation, never its inherited previous generation. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { get as httpsGet } from "node:https";
import { get as httpGet } from "node:http";

export async function retainAssets(dist, origin, fetcher = fetch) {
  dist = resolve(dist);
  const localPath = resolve(dist, "asset-registry.json"), current = JSON.parse(await readFile(localPath, "utf8"));
  const url = new URL("/asset-registry.json", origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error("Retention origin must use HTTPS");
  const res = await fetcher(url, { cache: "no-store" });
  // First migration: pre-registry Pages can return its HTML SPA fallback with status 200.
  if (res.status === 404 || (res.ok && (res.headers.get("content-type") ?? "").includes("text/html"))) {
    console.log("No live asset registry yet; initial immutable deployment"); return;
  }
  if (!res.ok) throw new Error(`Live asset registry: HTTP ${res.status}`);
  const previous = await res.json();
  if (previous.version !== 1 || !/^[a-f0-9]{24}$/.test(previous.release) || !Array.isArray(previous.files) || previous.files.length > 2048) {
    throw new Error("Invalid live asset registry");
  }
  if (previous.release === current.release) { console.log("Live asset generation unchanged"); return; }
  const own = new Set(current.files.map((file) => file.url));
  let copied = 0;
  for (const file of previous.files) {
    if (!/^\/harbour\/_immutable\/[a-f0-9]{24}\/[a-zA-Z0-9_./-]+$/.test(file.url) || file.url.split("/").includes("..")
      || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > 24 * 1024 * 1024
      || !file.url.startsWith(`/harbour/_immutable/${file.sha256.slice(0, 24)}/`) || (file.encoding !== null && file.encoding !== "br")) {
      throw new Error("Unsafe live asset registry entry");
    }
    if (own.has(file.url)) continue;
    // Raw HTTP, not fetch: preserve the stored Brotli body byte-for-byte across encoder upgrades.
    const assetUrl = new URL(file.url, origin);
    const asset = await new Promise((resolveResponse, reject) => {
      const req = (assetUrl.protocol === "https:" ? httpsGet : httpGet)(assetUrl, {
        headers: { "accept-encoding": file.encoding ?? "identity" }, timeout: 30_000,
      }, resolveResponse);
      req.on("error", reject); req.on("timeout", () => req.destroy(new Error("Asset retention timeout")));
    });
    if (asset.statusCode !== 200 || (file.encoding === "br" && asset.headers["content-encoding"] !== "br")) {
      asset.destroy(); throw new Error(`Retained asset ${file.url}: HTTP ${asset.statusCode} or encoding mismatch`);
    }
    const chunks = []; let size = 0;
    for await (const chunk of asset) {
      size += chunk.length;
      if (size > file.bytes) { asset.destroy(); throw new Error(`Retained asset exceeds declared size: ${file.url}`); }
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks, size);
    if (bytes.length !== file.bytes || createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
      throw new Error(`Retained asset hash mismatch: ${file.url}`);
    }
    const target = resolve(dist, `.${file.url}`);
    await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes); copied++;
  }
  // Snapshot only the previous release's own files. Never recursively import previous.previous.
  current.previous = { release: previous.release, files: previous.files };
  await writeFile(localPath, JSON.stringify(current));
  console.log(`Retained ${copied} objects from ${previous.release}; current + previous only`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await retainAssets(process.argv[2] ?? "dist", process.argv[3] ?? "https://pharosville.pharos.watch");
}
