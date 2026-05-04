#!/usr/bin/env node
/**
 * Drift guard for the widescreen-gate thresholds.
 *
 * The desktop-only fallback in `src/client.tsx` reads thresholds from
 * `src/systems/viewport-gate.ts`. The runtime-manifest preload in
 * `index.html` hard-codes the same dimensions in its media query (HTML can't
 * import). This script regex-extracts both and asserts they match so the two
 * gates can never silently drift apart.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const gateModulePath = resolve(repoRoot, "src/systems/viewport-gate.ts");
const indexHtmlPath = resolve(repoRoot, "index.html");

function extractGateConstants(source) {
  const longMatch = source.match(/export\s+const\s+MIN_LONG_SIDE_PX\s*=\s*(\d+)/);
  const shortMatch = source.match(/export\s+const\s+MIN_SHORT_SIDE_PX\s*=\s*(\d+)/);
  if (!longMatch || !shortMatch) {
    throw new Error("Could not parse MIN_LONG_SIDE_PX / MIN_SHORT_SIDE_PX from src/systems/viewport-gate.ts");
  }
  return { longSide: Number(longMatch[1]), shortSide: Number(shortMatch[1]) };
}

function extractHtmlMediaThresholds(source) {
  // Look for: media="(min-device-width: A) and (min-device-height: B), (min-device-width: C) and (min-device-height: D)"
  const mediaMatch = source.match(
    /media="\(min-device-width:\s*(\d+)px\)\s*and\s*\(min-device-height:\s*(\d+)px\)\s*,\s*\(min-device-width:\s*(\d+)px\)\s*and\s*\(min-device-height:\s*(\d+)px\)"/,
  );
  if (!mediaMatch) {
    throw new Error("Could not parse widescreen-gate media query from index.html");
  }
  const [, landscapeW, landscapeH, portraitW, portraitH] = mediaMatch.map(Number);
  return { landscapeW, landscapeH, portraitW, portraitH };
}

export function checkViewportGate({
  gateSource = readFileSync(gateModulePath, "utf8"),
  htmlSource = readFileSync(indexHtmlPath, "utf8"),
} = {}) {
  const gate = extractGateConstants(gateSource);
  const html = extractHtmlMediaThresholds(htmlSource);

  const errors = [];
  // Landscape orientation: long-side as width, short-side as height.
  if (html.landscapeW !== gate.longSide) {
    errors.push(`index.html landscape min-device-width=${html.landscapeW}px does not match MIN_LONG_SIDE_PX=${gate.longSide}.`);
  }
  if (html.landscapeH !== gate.shortSide) {
    errors.push(`index.html landscape min-device-height=${html.landscapeH}px does not match MIN_SHORT_SIDE_PX=${gate.shortSide}.`);
  }
  // Portrait orientation: short-side as width, long-side as height.
  if (html.portraitW !== gate.shortSide) {
    errors.push(`index.html portrait min-device-width=${html.portraitW}px does not match MIN_SHORT_SIDE_PX=${gate.shortSide}.`);
  }
  if (html.portraitH !== gate.longSide) {
    errors.push(`index.html portrait min-device-height=${html.portraitH}px does not match MIN_LONG_SIDE_PX=${gate.longSide}.`);
  }

  return { errors, gate, html };
}

function main() {
  let result;
  try {
    result = checkViewportGate();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (result.errors.length > 0) {
    console.error("Viewport-gate drift detected between src/systems/viewport-gate.ts and index.html:");
    for (const message of result.errors) console.error(`- ${message}`);
    console.error("Fix: update index.html media query to match the constants (or vice versa).");
    process.exit(1);
  }

  console.log(
    `Viewport-gate check passed (long=${result.gate.longSide}px, short=${result.gate.shortSide}px).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
