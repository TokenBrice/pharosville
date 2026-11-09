import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { requestClassifier, loadRequestClassifier } from "../tests/helpers/request-classifier.ts";
const hash = "/harbour/_immutable/123456789012345678901234/";
const registry = { urls: { "/harbour/poster-960.avif": hash + "poster.avif", "/harbour/emblems.avif": hash + "emblems.avif", "/harbour/sea-sdf.webp": hash + "sea-sdf.bin.br" }, models: { "/harbour/island.glb": { url: hash + "kit.pack.br" } } };
const classify = requestClassifier(registry, { "/assets/index-123.js": { imports: ["/assets/shell-456.js"] } }, ["/assets/index-123.js"]);
for (const path of ["kit.pack.br", "civic.pack.br", "sea-sdf.bin.br", "emblems.avif", "logos.json"]) assert.equal(classify(hash + path), true, path);
for (const path of ["/api/chains", "/assets/harbour-app-abcd.js", "/assets/react-entry-abcd.js", "/assets/new-world-dependency.js", "/src/harbour/engine/engine.ts", "/logos/usdc.svg"]) assert.equal(classify(path), true, path);
// S08-I6: the world's entry, its vendor chunks (built and dev) and packed media all count as world requests.
for (const path of ["/assets/vendor-react-abcd.js", "/assets/vendor-rendering-abcd.js", "/node_modules/.vite/deps/react-dom_client.js", "/node_modules/.vite/deps/three.js", "/src/harbour/app/react-entry.tsx", hash + "fleet.pack.br", "/harbour/island.glb"]) assert.equal(classify(path), true, path);
assert.equal(requestClassifier()("/src/welcome-handoff.ts"), false, "the welcome's own module");
for (const path of ["/assets/index-123.js", "/assets/shell-456.js", hash + "poster.avif", "/harbour/poster-960.avif", "/fonts/eb-garamond-400-latin.woff2", "/src/harbour/app/poster.ts"]) assert.equal(classify(path), false, path);
console.log("Request classifier self-check passed");

const root = mkdtempSync(resolve("agents", ".qa-classifier-"));
try {
  mkdirSync(resolve(root, "dist/assets"), { recursive: true });
  writeFileSync(resolve(root, "dist/index.html"), '<script type="module" src="/assets/index.js"></script><link rel="stylesheet" href="/assets/shell.css">');
  writeFileSync(resolve(root, "dist/asset-registry.json"), JSON.stringify(registry));
  writeFileSync(resolve(root, "dist/assets/index.js"), 'import{a}from"./shell.js";import("./world.js");import("./welcome-handoff-Ab1_c.js");');
  writeFileSync(resolve(root, "dist/assets/welcome-handoff-Ab1_c.js"), 'import{a}from"./shell.js";');
  writeFileSync(resolve(root, "dist/assets/shell.js"), 'export const a = 1;');
  const built = loadRequestClassifier(root);
  assert.equal(built('/assets/index.js'), false);
  assert.equal(built('/assets/shell.js'), false);
  assert.equal(built('/assets/shell.css'), false);
  assert.equal(built('/assets/world.js'), true);
  assert.equal(built('/assets/welcome-handoff-Ab1_c.js'), false);
  assert.equal(built(hash + 'emblems.avif'), true);
} finally { rmSync(root, { recursive: true, force: true }); }
