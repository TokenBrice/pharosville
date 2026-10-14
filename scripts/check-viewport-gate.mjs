#!/usr/bin/env node
/**
 * Guard the viewport-gate lazy boundary.
 *
 * `src/client.tsx` must evaluate the shared viewport predicates before it
 * imports the Harbour runtime chunk. This keeps world data, Three.js,
 * and GLB requests off blocked viewports without duplicating thresholds.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const gateModulePath = resolve(repoRoot, "src/systems/viewport-gate.ts");
const clientModulePath = resolve(repoRoot, "src/client.tsx");

function extractGateConstants(source) {
  const longMatch = source.match(/export\s+const\s+MIN_LONG_SIDE_PX\s*=\s*(\d+)/);
  const shortMatch = source.match(/export\s+const\s+MIN_SHORT_SIDE_PX\s*=\s*(\d+)/);
  if (!longMatch || !shortMatch) {
    throw new Error("Could not parse the size-profile thresholds from src/systems/viewport-gate.ts");
  }
  return {
    longSide: Number(longMatch[1]),
    shortSide: Number(shortMatch[1]),
  };
}

export function checkViewportGate({
  gateSource = readFileSync(gateModulePath, "utf8"),
  clientSource = readFileSync(clientModulePath, "utf8"),
} = {}) {
  const gate = extractGateConstants(gateSource);
  const errors = [];

  if (!clientSource.includes("isWidescreenViewport(window.screen.width, window.screen.height)")) {
    errors.push("src/client.tsx must apply isWidescreenViewport to the physical screen before mounting the world.");
  }
  if (!clientSource.includes("canViewportShowMap(window.innerWidth, window.innerHeight)")) {
    errors.push("src/client.tsx must apply canViewportShowMap to the window before mounting the world.");
  }
  if (/matchMedia\([^)]*orientation/.test(clientSource)) {
    errors.push("src/client.tsx must not gate on (orientation: portrait); both gate halves are size tests.");
  }
  if (!clientSource.includes('import("./harbour/app/harbour-app")')) {
    errors.push("src/client.tsx must lazy-import ./harbour/app/harbour-app after the viewport gate.");
  }
  if (/from\s+["']\.\/harbour\/(?!app\/poster["'])[^"']*["']/.test(clientSource)) {
    errors.push("src/client.tsx must not statically import the Harbour runtime (only ./harbour/app/poster).");
  }

  return { errors, gate };
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
    console.error("Viewport-gate boundary check failed:");
    for (const message of result.errors) console.error(`- ${message}`);
    process.exit(1);
  }

  console.log(
    `Viewport-gate check passed (size profile ${result.gate.longSide}×${result.gate.shortSide}px, sorted; the Harbour runtime remains lazy).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
