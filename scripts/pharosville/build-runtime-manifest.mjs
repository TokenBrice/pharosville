#!/usr/bin/env node
/**
 * NFS4 #15: emit a slim runtime variant of the asset manifest.
 *
 * The full `public/pharosville/assets/manifest.json` is the authoring source
 * (~50 KB) and stays unchanged for the validator + offline tooling. The
 * browser only reads a small subset of fields, so this script writes
 * `public/pharosville/assets/manifest.runtime.json` with everything but the
 * authoring metadata — the runtime variant is what is preloaded and fetched
 * by `asset-manager.ts`.
 *
 * Importable: `import { stripAuthoringFields } from "./build-runtime-manifest.mjs"`
 *   used by the Vite plugin/dev middleware in `vite.config.ts` so dev and
 *   build agree on the trimmed shape.
 *
 * CLI: `node scripts/pharosville/build-runtime-manifest.mjs` writes the file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const AUTHORING_ENTRY_FIELDS = [
  "prompt",
  "promptKey",
  "promptProvenance",
  "semanticRole",
  "criticalReason",
  "paletteKeys",
  "tool",
];

const AUTHORING_STYLE_FIELDS = [
  "anchor",
  "generationDefaults",
];

/**
 * Returns a deep-cloned manifest with authoring-only fields stripped from
 * each asset entry and the style block. Pure (no I/O).
 */
export function stripAuthoringFields(manifest) {
  const clone = {
    ...manifest,
    assets: (manifest.assets ?? []).map((entry) => stripEntry(entry)),
  };
  if (manifest.style && typeof manifest.style === "object") {
    clone.style = stripStyle(manifest.style);
  }
  return clone;
}

function stripEntry(entry) {
  const next = { ...entry };
  for (const field of AUTHORING_ENTRY_FIELDS) {
    delete next[field];
  }
  return next;
}

function stripStyle(style) {
  const next = { ...style };
  for (const field of AUTHORING_STYLE_FIELDS) {
    delete next[field];
  }
  return next;
}

export function buildRuntimeManifest(sourcePath) {
  const text = readFileSync(sourcePath, "utf8");
  return stripAuthoringFields(JSON.parse(text));
}

export function writeRuntimeManifest(sourcePath, runtimePath) {
  const runtime = buildRuntimeManifest(sourcePath);
  writeFileSync(runtimePath, JSON.stringify(runtime), "utf8");
  return runtime;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = process.cwd();
  const source = resolve(repoRoot, "public/pharosville/assets/manifest.json");
  const target = resolve(repoRoot, "public/pharosville/assets/manifest.runtime.json");
  writeRuntimeManifest(source, target);
  console.log(`Runtime manifest written to ${target}`);
}
