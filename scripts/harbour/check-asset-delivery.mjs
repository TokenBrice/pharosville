#!/usr/bin/env node
/** Targeted Pages transport check; uses the maintained shared browser, never launches another one. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { brotliDecompressSync } from "node:zlib";
import { captureLock, connectShared } from "./shared-browser.mjs";

const [dist, origin] = process.argv.slice(2);
if (!dist || !origin) throw new Error("Usage: node scripts/harbour/check-asset-delivery.mjs BUILT_DIR https://PREVIEW.pages.dev");
const registry = JSON.parse(await readFile(resolve(dist, "asset-registry.json"), "utf8"));
const expected = await Promise.all(registry.files.map(async (file) => {
  const stored = await readFile(resolve(dist, `.${file.url}`));
  if (createHash("sha256").update(stored).digest("hex") !== file.sha256) throw new Error(`Local hash mismatch: ${file.url}`);
  const bytes = file.encoding === "br" ? brotliDecompressSync(stored) : stored;
  return { ...file, decodedHash: createHash("sha256").update(bytes).digest("hex"), decodedBytes: bytes.length };
}));
const release = await captureLock();
let browser, context;
try {
  browser = await connectShared(); context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin);
  const results = await page.evaluate(async (files) => {
    Object.defineProperty(window, "DecompressionStream", { value: undefined, configurable: true });
    const failures = [];
    for (const file of files) {
      const response = await fetch(file.url), bytes = await response.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((n) => n.toString(16).padStart(2, "0")).join("");
      if (response.status !== 200 || hash !== file.decodedHash || bytes.byteLength !== file.decodedBytes
        || !response.headers.get("cache-control")?.includes("immutable")
        || (file.encoding && response.headers.get("content-encoding") !== file.encoding)
        || (file.type && response.headers.get("content-type") !== file.type)) failures.push(file.url);
    }
    return { userAgent: navigator.userAgent, objects: files.length, jsDecompressionStream: typeof DecompressionStream, failures };
  }, expected);
  console.log(JSON.stringify(results, null, 2));
  if (results.failures.length) throw new Error("Browser HTTP asset transport mismatch");
} finally {
  await context?.close(); await browser?.close(); await release();
}
