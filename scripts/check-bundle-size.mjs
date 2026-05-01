#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export const bundleBudgets = {
  entry: {
    label: "entry chunk",
    pattern: /^index-[A-Za-z0-9_-]+\.js$/,
    maxRawBytes: 300 * 1024,
    maxGzipBytes: 90 * 1024,
    required: true,
  },
  desktop: {
    label: "desktop lazy chunk",
    pattern: /^pharosville-desktop-data-[A-Za-z0-9_-]+\.js$/,
    maxRawBytes: 950 * 1024,
    maxGzipBytes: 275 * 1024,
    required: true,
  },
  css: {
    label: "entry CSS",
    pattern: /^index-[A-Za-z0-9_-]+\.css$/,
    maxRawBytes: 32 * 1024,
    maxGzipBytes: 8 * 1024,
    required: true,
  },
};

export const aggregateBudgets = {
  maxJsRawBytes: 1_250 * 1024,
  maxJsGzipBytes: 375 * 1024,
};

export function collectBundleChunks(distRoot = resolve(process.cwd(), "dist")) {
  const assetsRoot = join(distRoot, "assets");
  if (!existsSync(assetsRoot)) {
    throw new Error(`Missing ${relative(process.cwd(), assetsRoot)}. Run npm run build before npm run check:bundle-size.`);
  }

  return readdirSync(assetsRoot)
    .filter((fileName) => /\.(?:js|css)$/.test(fileName))
    .map((fileName) => {
      const path = join(assetsRoot, fileName);
      const bytes = readFileSync(path);
      return {
        fileName,
        gzipBytes: gzipSync(bytes).length,
        path,
        rawBytes: statSync(path).size,
        type: fileName.endsWith(".css") ? "css" : "js",
      };
    })
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
}

export function evaluateBundleBudgets(chunks, {
  budgets = bundleBudgets,
  aggregate = aggregateBudgets,
} = {}) {
  const errors = [];
  const checks = [];

  for (const [key, budget] of Object.entries(budgets)) {
    const matches = chunks.filter((chunk) => budget.pattern.test(basename(chunk.fileName)));
    if (matches.length === 0) {
      if (budget.required) errors.push(`Missing ${budget.label} matching ${budget.pattern}.`);
      continue;
    }
    if (matches.length > 1) {
      errors.push(`Expected one ${budget.label}, found ${matches.length}: ${matches.map((chunk) => chunk.fileName).join(", ")}`);
      continue;
    }
    const chunk = matches[0];
    checks.push({ key, label: budget.label, ...chunk, budget });
    if (chunk.rawBytes > budget.maxRawBytes) {
      errors.push(`${budget.label} ${chunk.fileName} is ${formatBytes(chunk.rawBytes)} raw; budget is ${formatBytes(budget.maxRawBytes)}.`);
    }
    if (chunk.gzipBytes > budget.maxGzipBytes) {
      errors.push(`${budget.label} ${chunk.fileName} is ${formatBytes(chunk.gzipBytes)} gzip; budget is ${formatBytes(budget.maxGzipBytes)}.`);
    }
  }

  const jsChunks = chunks.filter((chunk) => chunk.type === "js");
  const jsRawBytes = sum(jsChunks, "rawBytes");
  const jsGzipBytes = sum(jsChunks, "gzipBytes");
  if (jsRawBytes > aggregate.maxJsRawBytes) {
    errors.push(`Total JS is ${formatBytes(jsRawBytes)} raw; budget is ${formatBytes(aggregate.maxJsRawBytes)}.`);
  }
  if (jsGzipBytes > aggregate.maxJsGzipBytes) {
    errors.push(`Total JS is ${formatBytes(jsGzipBytes)} gzip; budget is ${formatBytes(aggregate.maxJsGzipBytes)}.`);
  }

  return {
    checks,
    errors,
    totals: {
      cssGzipBytes: sum(chunks.filter((chunk) => chunk.type === "css"), "gzipBytes"),
      cssRawBytes: sum(chunks.filter((chunk) => chunk.type === "css"), "rawBytes"),
      jsGzipBytes,
      jsRawBytes,
    },
  };
}

export function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function sum(items, key) {
  return items.reduce((total, item) => total + item[key], 0);
}

function main() {
  let chunks;
  try {
    chunks = collectBundleChunks();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const result = evaluateBundleBudgets(chunks);
  for (const check of result.checks) {
    console.log(`${check.label}: ${check.fileName} ${formatBytes(check.rawBytes)} raw / ${formatBytes(check.gzipBytes)} gzip`);
  }
  console.log(`Total JS: ${formatBytes(result.totals.jsRawBytes)} raw / ${formatBytes(result.totals.jsGzipBytes)} gzip`);
  console.log(`Total CSS: ${formatBytes(result.totals.cssRawBytes)} raw / ${formatBytes(result.totals.cssGzipBytes)} gzip`);

  if (result.errors.length > 0) {
    console.error("Bundle size check failed:");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log("Bundle size check passed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
