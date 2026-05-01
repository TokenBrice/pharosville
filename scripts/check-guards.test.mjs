#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

import {
  findSecretFindingsInText,
  shouldScanCommittedPath,
} from "./check-committed-secrets.mjs";
import {
  checkMarkdownFiles,
  checkOnboardingDocs,
  findDocumentedNpmRunCommands,
  findOnboardingDocFindings,
  findPathReferencesInMarkdown,
} from "./check-doc-paths-and-scripts.mjs";
import { evaluateBundleBudgets } from "./check-bundle-size.mjs";
import {
  discoverPharosApiConfig,
  parseLoosePharosEnvFile,
} from "./pharosville/setup-local-api-key.mjs";
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
import {
  parseArgs as parseAgentInitArgs,
} from "./pharosville/agent-init.mjs";

const neutralValue = ["alpha", "beta", "gamma", "9876543210"].join("_");
const guardedEnvKeys = [
  "FAKE_GIT_COMMON_DIR",
  "FAKE_GIT_EXIT_CODE",
  "PATH",
  "PHAROS_API_BASE",
  "PHAROS_API_KEY",
];

function withEnvPatch(patch, fn) {
  const previous = new Map();
  for (const key of guardedEnvKeys) {
    previous.set(key, process.env[key]);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const key of guardedEnvKeys) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function createApiConfigFixture() {
  const root = mkdtempSync(join(tmpdir(), "pharosville-guard-"));
  const fakeBinDir = join(root, "fake-bin");
  const fakeGitPath = join(fakeBinDir, "git");
  const mainRoot = join(root, "main-worktree");
  const worktreeRoot = join(root, "linked-worktree");
  const commonDir = join(mainRoot, ".git");
  const worktreeEnvPath = join(worktreeRoot, ".env.local");
  const mainEnvPath = join(mainRoot, ".env.local");
  const sharedEnvPath = join(commonDir, "pharosville.env.local");

  mkdirSync(fakeBinDir, { recursive: true });
  mkdirSync(commonDir, { recursive: true });
  mkdirSync(worktreeRoot, { recursive: true });

  writeFileSync(
    fakeGitPath,
    [
      "#!/usr/bin/env bash",
      'if [ "$1" = "rev-parse" ] && [ "$2" = "--git-common-dir" ]; then',
      '  if [ -n "${FAKE_GIT_COMMON_DIR:-}" ]; then',
      '    printf "%s\\n" "$FAKE_GIT_COMMON_DIR"',
      "    exit 0",
      "  fi",
      '  exit "${FAKE_GIT_EXIT_CODE:-1}"',
      "fi",
      "exit 1",
      "",
    ].join("\n"),
  );
  chmodSync(fakeGitPath, 0o755);

  return {
    root,
    fakeBinDir,
    commonDir,
    mainEnvPath,
    sharedEnvPath,
    worktreeEnvPath,
    worktreeRoot,
    cleanup() {
      rmSync(root, { force: true, recursive: true });
    },
  };
}

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
assert.equal(chooseValidationLane(["AGENTS.md", "CLAUDE.md", "agents/new-plan.md"]), "docs");
assert.equal(chooseValidationLane(["docs/pharosville/CURRENT.md", "functions/api/[[path]].ts"]), "full");

assert.deepEqual(parseChangedPaths("AM src/index.ts\n D docs/pharosville/AGENT_ONBOARDING.md\n"), [
  "src/index.ts",
  "docs/pharosville/AGENT_ONBOARDING.md",
]);
assert.deepEqual(parseChangedPaths(""), []);
assert.deepEqual(parseChangedPaths("?? docs/new guide.md\n"), ["docs/new guide.md"]);

assert.equal(sanitizeSegment("  Feature Branch 42 "), "feature-branch-42");
assert.deepEqual(
  parseWorktreeArgs(["new-branch", "--ref", "main", "--branch", "feat/new", "--install"]),
  { name: "new-branch", ref: "main", branch: "feat/new", install: true },
);
assert.equal(parseWorktreeArgs([]), null);
assert.deepEqual(parseWorktreeArgs(["sandbox"]), {
  name: "sandbox",
  ref: "HEAD",
  branch: "",
  install: false,
});
assert.equal(parseWorktreeArgs(["--ref", "main"]), null);
assert.equal(parseWorktreeArgs(["sandbox", "--ref"]), null);
assert.equal(parseWorktreeArgs(["sandbox", "--branch"]), null);
assert.equal(parseWorktreeArgs(["sandbox", "--bogus"]), null);

assert.deepEqual(parseAgentInitArgs([]), {
  worktreeName: "",
  ref: "HEAD",
  branch: "",
  install: false,
  runSetupKey: true,
  runSmoke: true,
  runOnboard: true,
  help: false,
});
assert.deepEqual(parseAgentInitArgs(["sandbox", "--install"]), {
  worktreeName: "sandbox",
  ref: "HEAD",
  branch: "",
  install: true,
  runSetupKey: true,
  runSmoke: true,
  runOnboard: true,
  help: false,
});
assert.deepEqual(parseAgentInitArgs(["--worktree", "sandbox", "--skip-smoke"]), {
  worktreeName: "sandbox",
  ref: "HEAD",
  branch: "",
  install: false,
  runSetupKey: true,
  runSmoke: false,
  runOnboard: true,
  help: false,
});
assert.equal(parseAgentInitArgs(["--ref", "main"]), null);
assert.equal(parseAgentInitArgs(["--worktree"]), null);
assert.equal(parseAgentInitArgs(["--branch", "feat/test"]), null);
assert.equal(parseAgentInitArgs(["--unknown"]), null);

const parsedLooseEnv = parseLoosePharosEnvFile("/definitely-missing/pharos.env.local");
assert.deepEqual(parsedLooseEnv, {});

const apiFixture = createApiConfigFixture();
try {
  writeFileSync(
    apiFixture.worktreeEnvPath,
    "PHAROS_API_BASE=https://worktree.example\nPHAROS_API_KEY=worktree-key\n",
  );
  writeFileSync(
    apiFixture.mainEnvPath,
    "PHAROS_API_BASE=https://main.example\nPHAROS_API_KEY=main-key\n",
  );
  writeFileSync(
    apiFixture.sharedEnvPath,
    "PHAROS_API_BASE=https://shared.example\nPHAROS_API_KEY=shared-key\n",
  );

  const fakePath = [apiFixture.fakeBinDir, process.env.PATH || ""].join(delimiter);
  const envDiscovered = withEnvPatch({
    FAKE_GIT_COMMON_DIR: apiFixture.commonDir,
    FAKE_GIT_EXIT_CODE: undefined,
    PATH: fakePath,
    PHAROS_API_BASE: "https://env.example",
    PHAROS_API_KEY: "env-key",
  }, () => discoverPharosApiConfig(apiFixture.worktreeRoot));
  assert.equal(envDiscovered.source, "process.env");
  assert.equal(envDiscovered.apiBase, "https://env.example");
  assert.equal(envDiscovered.apiKey, "env-key");
  assert.deepEqual(envDiscovered.checkedPaths, []);

  const worktreeDiscovered = withEnvPatch({
    FAKE_GIT_COMMON_DIR: apiFixture.commonDir,
    FAKE_GIT_EXIT_CODE: undefined,
    PATH: fakePath,
    PHAROS_API_BASE: undefined,
    PHAROS_API_KEY: undefined,
  }, () => discoverPharosApiConfig(apiFixture.worktreeRoot));
  assert.equal(worktreeDiscovered.source, ".env.local (current worktree)");
  assert.equal(worktreeDiscovered.apiBase, "https://worktree.example");
  assert.equal(worktreeDiscovered.apiKey, "worktree-key");
  assert.deepEqual(worktreeDiscovered.checkedPaths, [apiFixture.worktreeEnvPath]);

  writeFileSync(apiFixture.worktreeEnvPath, "PHAROS_API_BASE=https://worktree.example\n");
  const mainDiscovered = withEnvPatch({
    FAKE_GIT_COMMON_DIR: apiFixture.commonDir,
    FAKE_GIT_EXIT_CODE: undefined,
    PATH: fakePath,
    PHAROS_API_BASE: undefined,
    PHAROS_API_KEY: undefined,
  }, () => discoverPharosApiConfig(apiFixture.worktreeRoot));
  assert.equal(mainDiscovered.source, ".env.local (main worktree)");
  assert.equal(mainDiscovered.apiBase, "https://main.example");
  assert.equal(mainDiscovered.apiKey, "main-key");
  assert.deepEqual(mainDiscovered.checkedPaths, [apiFixture.worktreeEnvPath, apiFixture.mainEnvPath]);

  writeFileSync(apiFixture.mainEnvPath, "PHAROS_API_BASE=https://main.example\n");
  const sharedDiscovered = withEnvPatch({
    FAKE_GIT_COMMON_DIR: apiFixture.commonDir,
    FAKE_GIT_EXIT_CODE: undefined,
    PATH: fakePath,
    PHAROS_API_BASE: undefined,
    PHAROS_API_KEY: undefined,
  }, () => discoverPharosApiConfig(apiFixture.worktreeRoot));
  assert.equal(sharedDiscovered.source, ".git/pharosville.env.local (existing shared file)");
  assert.equal(sharedDiscovered.apiBase, "https://shared.example");
  assert.equal(sharedDiscovered.apiKey, "shared-key");
  assert.deepEqual(sharedDiscovered.checkedPaths, [
    apiFixture.worktreeEnvPath,
    apiFixture.mainEnvPath,
    apiFixture.sharedEnvPath,
  ]);

  const noGitDiscovered = withEnvPatch({
    FAKE_GIT_COMMON_DIR: undefined,
    FAKE_GIT_EXIT_CODE: "1",
    PATH: fakePath,
    PHAROS_API_BASE: "https://env.example",
    PHAROS_API_KEY: "env-key",
  }, () => discoverPharosApiConfig(apiFixture.worktreeRoot));
  assert.equal(noGitDiscovered.apiBase, "https://api.pharos.watch");
  assert.equal(noGitDiscovered.apiKey, null);
  assert.equal(noGitDiscovered.source, null);
  assert.equal(noGitDiscovered.sharedEnvPath, null);
  assert.deepEqual(noGitDiscovered.checkedPaths, []);
} finally {
  apiFixture.cleanup();
}

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
