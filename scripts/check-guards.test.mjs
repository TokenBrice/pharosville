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
import {
  checkOnboardingDocs,
  findOnboardingDocFindings,
} from "./check-agent-onboarding-docs.mjs";
import { evaluateBundleBudgets } from "./check-bundle-size.mjs";
import {
  chooseValidationLane,
  parseChangedPaths,
} from "./pharosville/validate-changed.mjs";
import {
  parseArgs as parseWorktreeArgs,
  sanitizeSegment,
} from "./pharosville/new-worktree.mjs";
import {
  formatDate,
  sanitizeSlug,
} from "./pharosville/new-agent-plan.mjs";

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
  "See `src/App.tsx:12,18-20`, `agents/example-plan.md`, `src/missing.ts:12-18`, and [guide](./guide.md).",
].join("\n");

assert.deepEqual(
  findDocumentedNpmRunCommands(markdown).map((command) => command.scriptName),
  ["typecheck", "missing-command"],
);
assert.deepEqual(
  findPathReferencesInMarkdown("docs/check.md", markdown).map((reference) => reference.target),
  ["./guide.md", "src/App.tsx", "agents/example-plan.md", "src/missing.ts"],
);

const repoRoot = resolve("/repo");
const existingPaths = new Set([
  resolve(repoRoot, "docs/check.md"),
  resolve(repoRoot, "docs/guide.md"),
  resolve(repoRoot, "agents/example-plan.md"),
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

const onboardingLintFindings = findOnboardingDocFindings(
  "docs/pharosville/TESTING.md",
  "Store candidates in `output/pharosville/pixellab-prototypes/` and use /agents/ for planing artifacts.",
);
assert.equal(onboardingLintFindings.some((finding) => finding.id === "legacy-output-path"), true);
assert.equal(onboardingLintFindings.some((finding) => finding.id === "planning-typo"), true);

const onboardingCheck = checkOnboardingDocs({
  markdownFiles: [
    {
      path: "AGENTS.md",
      text: "Use /agents/ for planning artifacts.",
    },
    {
      path: "CLAUDE.md",
      text: "# Claude Guide",
    },
  ],
});
assert.equal(onboardingCheck.findings.some((finding) => finding.id === "agents-onboarding-link"), true);
assert.equal(onboardingCheck.findings.some((finding) => finding.id === "claude-canonical-link"), true);

assert.deepEqual(
  parseChangedPaths(" M README.md\n?? docs/pharosville/AGENT_ONBOARDING.md\nR  docs/a.md -> docs/b.md\n"),
  ["README.md", "docs/pharosville/AGENT_ONBOARDING.md", "docs/b.md"],
);
assert.equal(chooseValidationLane(["README.md", "docs/pharosville/CURRENT.md"]), "docs");
assert.equal(chooseValidationLane(["README.md", "src/main.tsx"]), "full");
assert.equal(chooseValidationLane([]), "none");

assert.equal(sanitizeSegment("  Feature Branch 42 "), "feature-branch-42");
assert.deepEqual(
  parseWorktreeArgs(["new-branch", "--ref", "main", "--branch", "feat/new", "--install"]),
  { name: "new-branch", ref: "main", branch: "feat/new", install: true },
);
assert.equal(parseWorktreeArgs([]), null);

assert.equal(sanitizeSlug("  My Plan / Scope "), "my-plan-scope");
assert.equal(formatDate(new Date(Date.UTC(2026, 4, 1))), "2026-05-01");

const passingBundle = evaluateBundleBudgets([
  { fileName: "index-a1.js", gzipBytes: 10, rawBytes: 100, type: "js" },
  { fileName: "pharosville-desktop-data-b2.js", gzipBytes: 20, rawBytes: 200, type: "js" },
  { fileName: "index-c3.css", gzipBytes: 5, rawBytes: 50, type: "css" },
], {
  aggregate: { maxJsGzipBytes: 100, maxJsRawBytes: 500 },
  budgets: {
    entry: { label: "entry chunk", maxGzipBytes: 15, maxRawBytes: 150, pattern: /^index-.*\.js$/, required: true },
    desktop: { label: "desktop chunk", maxGzipBytes: 25, maxRawBytes: 250, pattern: /^pharosville-desktop-data-.*\.js$/, required: true },
    css: { label: "entry CSS", maxGzipBytes: 10, maxRawBytes: 60, pattern: /^index-.*\.css$/, required: true },
  },
});
assert.deepEqual(passingBundle.errors, []);

const failingBundle = evaluateBundleBudgets([
  { fileName: "index-a1.js", gzipBytes: 30, rawBytes: 100, type: "js" },
  { fileName: "pharosville-desktop-data-b2.js", gzipBytes: 20, rawBytes: 200, type: "js" },
  { fileName: "index-c3.css", gzipBytes: 5, rawBytes: 50, type: "css" },
], {
  aggregate: { maxJsGzipBytes: 45, maxJsRawBytes: 500 },
  budgets: {
    entry: { label: "entry chunk", maxGzipBytes: 15, maxRawBytes: 150, pattern: /^index-.*\.js$/, required: true },
    desktop: { label: "desktop chunk", maxGzipBytes: 25, maxRawBytes: 250, pattern: /^pharosville-desktop-data-.*\.js$/, required: true },
    css: { label: "entry CSS", maxGzipBytes: 10, maxRawBytes: 60, pattern: /^index-.*\.css$/, required: true },
  },
});
assert.equal(failingBundle.errors.some((error) => error.includes("entry chunk")), true);
assert.equal(failingBundle.errors.some((error) => error.includes("Total JS")), true);

console.log("Guard script self-tests passed.");
