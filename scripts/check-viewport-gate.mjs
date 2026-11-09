#!/usr/bin/env node
/**
 * Guard the viewport-gate lazy boundary at its real owner.
 *
 * `src/main.tsx` is the React-free entry that admits or denies the world (S08-I6): it must evaluate the
 * shared viewport predicates on the physical screen AND the window before it imports the Harbour runtime
 * chunk, and below the gate it may load only the welcome's own module. This keeps world data, Three.js
 * and GLB requests off blocked viewports without duplicating thresholds.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const gateModulePath = resolve(repoRoot, "src/systems/viewport-gate.ts");
const entryModulePath = resolve(repoRoot, "src/main.tsx");
const welcomeModulePath = resolve(repoRoot, "src/welcome-handoff.ts");

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

const importsOf = (source) => [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)].map((match) => match[1]);

export function checkViewportGate({
  gateSource = readFileSync(gateModulePath, "utf8"),
  entrySource = readFileSync(entryModulePath, "utf8"),
  welcomeSource = readFileSync(welcomeModulePath, "utf8"),
} = {}) {
  const gate = extractGateConstants(gateSource);
  const errors = [];

  if (!entrySource.includes("isWidescreenViewport(window.screen.width, window.screen.height)")) {
    errors.push("src/main.tsx must apply isWidescreenViewport to the physical screen before mounting the world.");
  }
  if (!entrySource.includes("canViewportShowMap(window.innerWidth, window.innerHeight)")) {
    errors.push("src/main.tsx must apply canViewportShowMap to the window before mounting the world.");
  }
  if (/orientation\s*:\s*(?:portrait|landscape)/.test(entrySource)) {
    errors.push("src/main.tsx must not gate on (orientation: portrait); both gate halves are size tests.");
  }
  const imports = importsOf(entrySource);
  if (!imports.includes("./harbour/app/react-entry")) {
    errors.push("src/main.tsx must lazy-import ./harbour/app/react-entry after the viewport gate.");
  }
  const strayImports = imports.filter((specifier) => ![
    "./error-reporter", "./systems/viewport-gate", "./harbour/app/poster", "./harbour/app/react-entry", "./welcome-handoff",
  ].includes(specifier));
  if (strayImports.length > 0) {
    errors.push(`src/main.tsx may import only the shell, the gate, the poster, the welcome and (lazily) the world: ${strayImports.join(", ")}.`);
  }
  if (/from\s+["']\.\/harbour\/(?!app\/poster["'])[^"']*["']/.test(entrySource)) {
    errors.push("src/main.tsx must not statically import the Harbour runtime (only ./harbour/app/poster).");
  }
  const preload = entrySource.indexOf("data-pv-preload"), denied = entrySource.indexOf("if (!next)");
  if (preload < 0 || denied < 0 || preload < denied) {
    errors.push("src/main.tsx must activate the inert world hints (data-pv-preload) only after the denied branch returns.");
  }
  const welcomeImports = importsOf(welcomeSource).filter((specifier) => !/^(?:\.\/systems\/viewport-gate|(?:\.\.\/|@)shared\/lib\/selection-link)$/.test(specifier));
  if (welcomeImports.length > 0) {
    errors.push(`src/welcome-handoff.ts loads below the gate and may import only the gate and the subject codec: ${welcomeImports.join(", ")}.`);
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
    `Viewport-gate check passed (size profile ${result.gate.longSide}×${result.gate.shortSide}px, sorted; src/main.tsx admits, the Harbour runtime remains lazy).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
