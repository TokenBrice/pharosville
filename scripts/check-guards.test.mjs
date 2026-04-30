#!/usr/bin/env node
import assert from "node:assert/strict";
import { join, resolve } from "node:path";

import {
  findSecretFindingsInText,
  shouldScanCommittedPath,
} from "./check-committed-secrets.mjs";
import {
  checkMarkdownFiles,
  findDocumentedNpmRunCommands,
  findPathReferencesInMarkdown,
} from "./check-doc-paths-and-scripts.mjs";

const neutralValue = ["alpha", "beta", "gamma", "9876543210"].join("_");

assert.equal(shouldScanCommittedPath("src/App.tsx"), true);
assert.equal(shouldScanCommittedPath("node_modules/pkg/index.js"), false);
assert.equal(shouldScanCommittedPath("dist/assets/app.js"), false);
assert.equal(shouldScanCommittedPath("reports/output.json"), false);
assert.equal(shouldScanCommittedPath("public/logo.png"), false);

assert.equal(
  findSecretFindingsInText("docs/example.md", "PHAROS_API_KEY=<placeholder>").length,
  0,
);
assert.equal(
  findSecretFindingsInText("src/example.ts", `PHAROS_API_KEY="${neutralValue}"`).length,
  1,
);

const markdown = [
  "Run `npm run typecheck`, then `npm run missing-command`.",
  "See `src/App.tsx`, `src/missing.ts:12-18`, and [guide](./guide.md).",
].join("\n");

assert.deepEqual(
  findDocumentedNpmRunCommands(markdown).map((command) => command.scriptName),
  ["typecheck", "missing-command"],
);
assert.deepEqual(
  findPathReferencesInMarkdown("docs/check.md", markdown).map((reference) => reference.target),
  ["./guide.md", "src/App.tsx", "src/missing.ts"],
);

const repoRoot = resolve("/repo");
const existingPaths = new Set([
  resolve(repoRoot, "docs/check.md"),
  resolve(repoRoot, "docs/guide.md"),
  resolve(repoRoot, "src/App.tsx"),
]);
const result = checkMarkdownFiles({
  repoRoot,
  markdownFiles: [{ path: "docs/check.md", text: markdown }],
  packageScripts: new Set(["typecheck"]),
  exists: (filePath) => existingPaths.has(resolve(filePath)),
});

assert.deepEqual(
  result.missingScripts.map((finding) => finding.scriptName),
  ["missing-command"],
);
assert.deepEqual(
  result.missingPaths.map((finding) => join(finding.checkedPath)),
  ["src/missing.ts"],
);

console.log("Guard script self-tests passed.");
