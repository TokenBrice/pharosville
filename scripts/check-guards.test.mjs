#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { crc32, deflateSync } from "node:zlib";

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
import { bundleBudgets as sharedBundleBudgets } from "./bundle-budgets.mjs";
import {
  discoverPharosApiConfig,
  loadWorktreeSharedPharosEnv,
  parseLoosePharosEnvFile,
} from "./pharosville/local-api-env.mjs";
import {
  changedValidationUpdatesFromPrePushInput,
  chooseValidationLane,
  collectPrePushChangedPaths,
  parseChangedPaths,
  parseGitNameStatusPaths,
  parsePrePushUpdates,
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
import {
  buildRuntimeFactsMarkdown,
} from "./pharosville/generate-runtime-facts.mjs";
import {
  formatGateVerdict,
} from "./pharosville/validate-deploy-gate.mjs";
import {
  MAX_SVG_BYTES,
  findMediaFileProblems,
} from "./pharosville/validate-runtime-media.mjs";
import {
  checkViewportGate,
} from "./check-viewport-gate.mjs";
import {
  REQUIRED_PERMISSIONS_POLICY_FEATURES,
  validateCsp,
  validatePermissionsPolicy,
  validateStaticHeadersText,
} from "./pharosville/check-security-headers.mjs";
import {
  compareGithubReleaseState,
  parseChangelogReleases,
  parseVersionRegistry,
  validateReleaseContract,
} from "./pharosville/release-contract.mjs";
import {
  approvalPolicyForCollaborators,
  validateBranchProtection,
  validateBranchRulesetProtection,
} from "./pharosville/check-branch-protection.mjs";
import {
  RELEASE_ACTIONS_CREDENTIAL,
  RELEASE_DEPLOY_KEY_TITLE,
  validateReleaseCredentialState,
} from "./pharosville/check-release-credentials.mjs";
import {
  FRESHNESS_INTERVAL_MULTIPLIER,
  endpointChecks as smokeEndpointChecks,
  findFreshnessProblems,
  parseProducerIntervalsByKey,
  annotated,
  reportAvailabilityWarnings,
  reportFreshness,
  reportPayloadWarnings,
} from "./smoke-live.mjs";

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
  ["README.md", "docs/pharosville/AGENT_ONBOARDING.md", "docs/a.md", "docs/b.md"],
);
assert.deepEqual(
  parseGitNameStatusPaths("A\tdocs/a.md\nD\tsrc/old.ts\nR100\tdocs/old.md\tdocs/new.md\n"),
  ["docs/a.md", "src/old.ts", "docs/old.md", "docs/new.md"],
);
assert.equal(chooseValidationLane(["README.md", "docs/pharosville/CURRENT.md"]), "docs");
assert.equal(chooseValidationLane(["README.md", "src/main.tsx"]), "full");
assert.equal(chooseValidationLane([]), "none");
assert.equal(chooseValidationLane(["AGENTS.md", "CLAUDE.md", "agents/new-plan.md"]), "docs");
assert.equal(chooseValidationLane(["docs/pharosville/CURRENT.md", "functions/api/[[path]].ts"]), "full");
assert.equal(chooseValidationLane(parseGitNameStatusPaths("D\tdocs/old.md\n")), "docs");
assert.equal(chooseValidationLane(parseGitNameStatusPaths("R100\tsrc/old.ts\tdocs/old.md\n")), "full");

const runtimeFactsMarkdown = buildRuntimeFactsMarkdown();
assert.match(runtimeFactsMarkdown, /^# PharosVille Runtime Facts/);
assert.match(runtimeFactsMarkdown, /## API Allowlist/);
assert.match(runtimeFactsMarkdown, /## Bundle Budgets/);
assert.equal(sharedBundleBudgets.desktop.label, "desktop lazy chunk");
assert.equal(sharedBundleBudgets.renderer.label, "Three.js renderer chunk");
assert.equal(sharedBundleBudgets.renderer.required, true);
assert.equal(
  validateCsp("default-src 'self'; script-src 'self' https://*.googletagmanager.com").some((finding) => finding.includes("wildcard")),
  true,
);
assert.equal(validatePermissionsPolicy("autoplay=(), camera=()").some((finding) => finding.includes("display-capture")), true);
assert.equal(REQUIRED_PERMISSIONS_POLICY_FEATURES.includes("screen-wake-lock"), true);
assert.deepEqual(validateStaticHeadersText(readFileSync(resolve("public/_headers"), "utf8")), []);

const viewportGateSource = [
  "export const MIN_LONG_SIDE_PX = 720;",
  "export const MIN_SHORT_SIDE_PX = 360;",
  "export const MIN_WIDE_LONG_SIDE_PX = 1200;",
  "export const MIN_WIDE_SHORT_SIDE_PX = 640;",
].join("\n");
const viewportGateClient = [
  'import { isWidescreenViewport } from "./systems/viewport-gate";',
  'const Desktop = lazy(() => import("./pharosville-desktop-data"));',
  "isWidescreenViewport(window.screen.width, window.screen.height);",
].join("\n");
const viewportGateCheck = checkViewportGate({
  gateSource: viewportGateSource,
  clientSource: viewportGateClient,
});
assert.deepEqual(viewportGateCheck.errors, []);
assert.deepEqual(viewportGateCheck.gate, {
  longSide: 720,
  shortSide: 360,
  wideLongSide: 1200,
  wideShortSide: 640,
});

const driftedViewportGateCheck = checkViewportGate({
  gateSource: viewportGateSource,
  clientSource: viewportGateClient.replace(
    'import("./pharosville-desktop-data")',
    'import("./world")',
  ),
});
assert.deepEqual(driftedViewportGateCheck.errors, [
  "src/client.tsx must lazy-import ./pharosville-desktop-data after the viewport gate.",
]);
assert.throws(
  () => checkViewportGate({
    gateSource: [
      "export const MIN_LONG_SIDE_PX = 720;",
      "export const MIN_SHORT_SIDE_PX = 360;",
    ].join("\n"),
    clientSource: viewportGateClient,
  }),
  /Could not parse standard and wide-profile thresholds/,
);

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
assert.equal(
  packageJson.scripts["check:security-headers:static"],
  "node scripts/pharosville/check-security-headers.mjs --static",
);
assert.match(packageJson.scripts["validate:docs"], /check:security-headers:static/);
assert.doesNotMatch(packageJson.scripts["validate:docs"], /check:security-headers(?!:static)/);

const deployGateSource = readFileSync(resolve("scripts/pharosville/validate-deploy-gate.mjs"), "utf8");
assert.match(deployGateSource, /check:security-headers:static/);
assert.doesNotMatch(deployGateSource, /check:security-headers(?!:static)/);

// A skipped perf tripwire still exits 0 — CI has no GPU to measure — but the
// run must never read as if the frame time had been checked.
assert.notEqual(formatGateVerdict("skipped"), formatGateVerdict("measured"));
assert.match(formatGateVerdict("skipped"), /^PHAROSVILLE_DEPLOY_GATE: PASS_PERF_SKIPPED\b/);
assert.match(formatGateVerdict("measured"), /^PHAROSVILLE_DEPLOY_GATE: PASS\b/);
assert.doesNotMatch(formatGateVerdict("measured"), /SKIP/);
assert.equal(formatGateVerdict("skipped").includes("NOT measured"), true);

const deployWorkflowSource = readFileSync(resolve(".github/workflows/deploy-cloudflare.yml"), "utf8");
assert.match(deployWorkflowSource, /npm run validate/);
assert.match(deployWorkflowSource, /check-security-headers\.mjs --url "\$SMOKE_UI_URL"/);
assert.match(deployWorkflowSource, /npm run smoke:live -- --url "\$SMOKE_UI_URL"/);
assert.match(deployWorkflowSource, /cloudflare\/wrangler-action@ebbaa1584979971c8614a24965b4405ff95890e0/);
assert.match(deployWorkflowSource, /steps\.pages\.outputs\.deployment-url/);
assert.match(deployWorkflowSource, /npm run test:visual:dist:dom:firefox/);
assert.doesNotMatch(deployWorkflowSource, /for attempt in/);

const releaseWorkflowSource = readFileSync(resolve(".github/workflows/release.yml"), "utf8");
assert.match(releaseWorkflowSource, /workflow_run:/);
assert.match(releaseWorkflowSource, /Deploy to Cloudflare Pages/);
assert.match(releaseWorkflowSource, /historical-backfill/);
assert.match(releaseWorkflowSource, /gh release create/);
assert.match(releaseWorkflowSource, /ssh-key: \$\{\{ secrets\.RELEASE_TAG_SSH_KEY \}\}/);
assert.match(releaseWorkflowSource, /git tag -a "\$RELEASE_TAG" "\$TARGET_SHA"/);
assert.match(releaseWorkflowSource, /git push origin "refs\/tags\/\$RELEASE_TAG"/);
assert.match(releaseWorkflowSource, /--verify-tag/);
assert.match(releaseWorkflowSource, /audit-github/);
assert.match(packageJson.scripts["check:release-admin"], /check:release-credentials/);

assert.deepEqual(
  validateReleaseCredentialState({
    deployKeys: [{ read_only: false, title: RELEASE_DEPLOY_KEY_TITLE }],
    secrets: [{ name: RELEASE_ACTIONS_CREDENTIAL }],
  }).failures,
  [],
);
assert.deepEqual(
  validateReleaseCredentialState({
    deployKeys: [{ read_only: true, title: RELEASE_DEPLOY_KEY_TITLE }],
    secrets: [],
  }).failures,
  [
    `Actions secret ${RELEASE_ACTIONS_CREDENTIAL} is missing`,
    `deploy key ${RELEASE_DEPLOY_KEY_TITLE} must allow write access`,
  ],
);

const releaseChangelogFixture = [
  "# Changelog",
  "",
  "## v0.2.0 - 2026-02-02 - Second",
  "",
  "Second release notes.",
  "",
  "## v0.1.0 - 2026-01-01 - First",
  "",
  "First release notes.",
].join("\n");
const releaseVersionFixture = [
  "export const PHAROSVILLE_RELEASE_VERSIONS = {",
  '  first: "v0.1.0",',
  '  second: "v0.2.0",',
  "} as const;",
  "export const PHAROSVILLE_LATEST_VERSION = PHAROSVILLE_RELEASE_VERSIONS.second;",
].join("\n");
assert.deepEqual(
  parseChangelogReleases(releaseChangelogFixture).map((release) => release.version),
  ["v0.2.0", "v0.1.0"],
);
assert.equal(parseVersionRegistry(releaseVersionFixture).latestVersion, "v0.2.0");
assert.deepEqual(
  validateReleaseContract({
    changelogSource: releaseChangelogFixture,
    versionSource: releaseVersionFixture,
  }).errors,
  [],
);
assert.match(
  validateReleaseContract({
    changelogSource: releaseChangelogFixture.replace("## v0.2.0", "## v0.0.9"),
    versionSource: releaseVersionFixture,
  }).errors.join("\n"),
  /ordered newest semantic version first|missing from/,
);
const releaseStateFixture = parseChangelogReleases(releaseChangelogFixture);
assert.deepEqual(
  compareGithubReleaseState({
    releases: releaseStateFixture,
    githubReleases: [
      { isDraft: false, name: "v0.2.0 - Second", tagName: "v0.2.0" },
      { isDraft: false, name: "v0.1.0 - First", tagName: "v0.1.0" },
    ],
    gitTags: ["v0.1.0", "v0.2.0", "checkpoint"],
  }),
  [],
);
assert.deepEqual(
  compareGithubReleaseState({
    releases: releaseStateFixture,
    githubReleases: [{ isDraft: false, name: "v0.2.0 - Second", tagName: "v0.2.0" }],
    gitTags: ["v0.2.0"],
  }),
  ["Missing Git tag: v0.1.0.", "Missing published GitHub Release: v0.1.0."],
);

const soloApprovalPolicy = approvalPolicyForCollaborators([
  { permissions: { admin: true, push: true } },
]);
assert.deepEqual(soloApprovalPolicy, { maximum: 0, minimum: 0, writeCapableCount: 1 });
assert.deepEqual(
  approvalPolicyForCollaborators([
    { permissions: { admin: true, push: true } },
    { permissions: { admin: false, push: true } },
  ]),
  { maximum: 1, minimum: 1, writeCapableCount: 2 },
);
const branchProtectionFixture = {
  allow_deletions: { enabled: false },
  allow_force_pushes: { enabled: false },
  enforce_admins: { enabled: true },
  required_pull_request_reviews: { required_approving_review_count: 0 },
  required_status_checks: {
    contexts: ["validate", "visual"],
    strict: true,
  },
};
assert.deepEqual(
  validateBranchProtection(branchProtectionFixture, "main", soloApprovalPolicy).failures,
  [],
);
assert.match(
  validateBranchProtection({
    ...branchProtectionFixture,
    required_pull_request_reviews: { required_approving_review_count: 1 },
  }, "main", soloApprovalPolicy).failures.join("\n"),
  /authors cannot self-approve/,
);
const rulesetFixture = {
  conditions: { ref_name: { include: ["main"] } },
  name: "Protect main",
  rules: [
    {
      parameters: {
        required_approving_review_count: 0,
      },
      type: "pull_request",
    },
    {
      parameters: {
        required_status_checks: [
          { context: "validate" },
          { context: "visual" },
        ],
        strict_required_status_checks_policy: true,
      },
      type: "required_status_checks",
    },
  ],
  target: "branch",
};
assert.deepEqual(
  validateBranchRulesetProtection(rulesetFixture, "main", soloApprovalPolicy).failures,
  [],
);
assert.match(
  validateBranchRulesetProtection({
    ...rulesetFixture,
    rules: rulesetFixture.rules.filter((rule) => rule.type !== "pull_request"),
  }, "main", soloApprovalPolicy).failures.join("\n"),
  /pull-request rule is missing/,
);

assert.doesNotMatch(packageJson.scripts["test:visual:dist:static"], /resizing below/);
assert.match(packageJson.scripts["test:visual:dist:static"], /@visual-static|resized below/);

assert.deepEqual(parseChangedPaths("AM src/index.ts\n D docs/pharosville/AGENT_ONBOARDING.md\n"), [
  "src/index.ts",
  "docs/pharosville/AGENT_ONBOARDING.md",
]);
assert.deepEqual(parseChangedPaths(""), []);
assert.deepEqual(parseChangedPaths("?? docs/new guide.md\n"), ["docs/new guide.md"]);

const zeroSha = "0000000000000000000000000000000000000000";
const prePushInput = [
  "refs/heads/feature aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa refs/heads/feature bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  `refs/heads/new cccccccccccccccccccccccccccccccccccccccc refs/heads/new ${zeroSha}`,
  "refs/heads/main dddddddddddddddddddddddddddddddddddddddd refs/heads/main eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  `refs/heads/delete ${zeroSha} refs/heads/delete ffffffffffffffffffffffffffffffffffffffff`,
  `refs/tags/v1 gggggggggggggggggggggggggggggggggggggggg refs/tags/v1 ${zeroSha}`,
].join("\n");
assert.equal(parsePrePushUpdates(prePushInput).length, 5);
assert.deepEqual(
  changedValidationUpdatesFromPrePushInput(prePushInput).map((update) => update.remoteRef),
  ["refs/heads/feature", "refs/heads/new"],
);

const diffCalls = [];
const prePushPaths = collectPrePushChangedPaths(prePushInput, {
  remoteName: "upstream",
  exec(_command, args) {
    if (args[0] === "merge-base") {
      assert.equal(args[2], "upstream/main");
      return "main-base\n";
    }
    if (args[0] === "diff") {
      diffCalls.push(args.slice(3));
      if (args[3] === "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") {
        return "A\tdocs/range.md\nR100\tdocs/old.md\tdocs/new.md\n";
      }
      if (args[3] === "main-base") {
        return "D\tsrc/deleted.ts\n";
      }
    }
    throw new Error(`Unexpected fake git call: ${args.join(" ")}`);
  },
});
assert.deepEqual(diffCalls, [
  ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
  ["main-base", "cccccccccccccccccccccccccccccccccccccccc"],
]);
assert.deepEqual(prePushPaths, ["docs/range.md", "docs/old.md", "docs/new.md", "src/deleted.ts"]);
assert.equal(chooseValidationLane(prePushPaths), "full");

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
  const sharedEnv = withEnvPatch({
    FAKE_GIT_COMMON_DIR: apiFixture.commonDir,
    FAKE_GIT_EXIT_CODE: undefined,
    PATH: fakePath,
    PHAROS_API_BASE: undefined,
    PHAROS_API_KEY: undefined,
  }, () => loadWorktreeSharedPharosEnv(apiFixture.worktreeRoot));
  assert.deepEqual(sharedEnv, {
    PHAROS_API_BASE: "https://shared.example",
    PHAROS_API_KEY: "shared-key",
  });

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

const forbiddenBundle = evaluateBundleBudgets([
  { fileName: "index-a1.js", gzipBytes: 10, rawBytes: 100, type: "js" },
  { fileName: "three.webgpu-deadbeef.js", gzipBytes: 10, rawBytes: 100, type: "js" },
], {
  aggregate: { maxJsGzipBytes: 100, maxJsRawBytes: 500 },
  budgets: {
    entry: { label: "entry chunk", maxGzipBytes: 15, maxRawBytes: 150, pattern: /^index-.*\.js$/, required: true },
  },
});
assert.equal(
  forbiddenBundle.errors.some((error) => error.includes("Forbidden WebGPU renderer chunk")),
  true,
);

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

const freshnessSource = {
  producerIntervalSec: 900,
  readUpdatedAt: (json) => json.updatedAt,
};
const freshNow = 1_785_060_000;

assert.deepEqual(
  findFreshnessProblems("/api/chains", { updatedAt: freshNow - 600 }, freshnessSource, freshNow),
  [],
);
assert.deepEqual(
  findFreshnessProblems("/api/chains", { updatedAt: freshNow - 2700 }, freshnessSource, freshNow),
  [],
  "exactly the budget still passes",
);

const stalePayload = findFreshnessProblems(
  "/api/chains",
  { updatedAt: freshNow - 86_400 },
  freshnessSource,
  freshNow,
);
assert.equal(stalePayload.length, 1);
assert.equal(stalePayload[0].includes("over the 2700s budget"), true);

assert.equal(
  findFreshnessProblems("/api/chains", {}, freshnessSource, freshNow)[0].includes("no publication timestamp"),
  true,
);

const staleMeta = findFreshnessProblems(
  "/api/stablecoins",
  { updatedAt: freshNow - 60, _meta: { status: "stale", ageSeconds: 90_000 } },
  freshnessSource,
  freshNow,
);
assert.equal(staleMeta.length, 2);
assert.equal(staleMeta.some((problem) => problem.includes('_meta.status "stale"')), true);
assert.equal(staleMeta.some((problem) => problem.includes("_meta.ageSeconds 90000")), true);

assert.deepEqual(
  findFreshnessProblems(
    "/api/stablecoins",
    { updatedAt: freshNow - 60, _meta: { status: "degraded", ageSeconds: 60 } },
    freshnessSource,
    freshNow,
  ),
  [],
  "degraded within budget is not a canary finding",
);

assert.equal(FRESHNESS_INTERVAL_MULTIPLIER, 3);

assert.deepEqual(
  parseProducerIntervalsByKey(
    [
      "export const REGISTRY = {",
      '  alpha: { key: "alpha", queryKey: ["alpha"], producerIntervalSec: CRON_INTERVALS["sync-alpha"] },',
      '  beta: { key: "beta", queryKey: ["beta"], producerIntervalSec: CRON_INTERVALS["sync-beta"] },',
      "};",
    ].join("\n"),
    { "sync-alpha": 900, "sync-beta": 1800 },
  ),
  { alpha: 900, beta: 1800 },
);

assert.throws(
  () => parseProducerIntervalsByKey(
    '  alpha: { producerIntervalSec: CRON_INTERVALS["sync-alpha"] },',
    {},
  ),
  /unknown cron job: sync-alpha/,
);
assert.throws(
  () => parseProducerIntervalsByKey("export const REGISTRY = {};", {}),
  /Could not parse producer intervals/,
);

// `annotated` switches format on GITHUB_ACTIONS, so these assertions set it
// explicitly rather than inheriting it: the ambient value differs between a
// developer's shell and a runner, and a guard that only holds in one of them is
// not a guard. Both formats are pinned here.
const withGithubActions = (value, run) => {
  const previous = process.env.GITHUB_ACTIONS;
  if (value === undefined) delete process.env.GITHUB_ACTIONS;
  else process.env.GITHUB_ACTIONS = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.GITHUB_ACTIONS;
    else process.env.GITHUB_ACTIONS = previous;
  }
};

const freshnessLog = [];
assert.equal(reportFreshness([], false, (line) => freshnessLog.push(line)), "fresh");
assert.deepEqual(freshnessLog, [], "a clean run stays quiet");

withGithubActions(undefined, () => {
  assert.equal(
    reportFreshness(["/api/chains is stale"], false, (line) => freshnessLog.push(line)),
    "1 freshness warning(s)",
    "warning tier reports without failing",
  );
  assert.equal(freshnessLog.some((line) => line.includes("WARNING (1)")), true);
  assert.equal(freshnessLog.includes("- /api/chains is stale"), true);

  assert.throws(
    () => reportFreshness(["/api/chains is stale"], true, (line) => freshnessLog.push(line)),
    /1 stale endpoint\(s\) under --strict-freshness/,
    "strict tier fails the canary",
  );
  assert.equal(freshnessLog.some((line) => line.includes("FAILED (1)")), true);
});

// On a runner the same findings must become workflow commands, or a green
// scheduled run hides them in a log tail nobody reads.
withGithubActions("true", () => {
  const annotatedLog = [];
  reportFreshness(["/api/chains is stale"], false, (line) => annotatedLog.push(line));
  assert.equal(annotatedLog.includes("::warning::/api/chains is stale"), true);
  assert.throws(
    () => reportFreshness(["/api/chains is stale"], true, (line) => annotatedLog.push(line)),
    /1 stale endpoint\(s\) under --strict-freshness/,
  );
  assert.equal(annotatedLog.includes("::error::/api/chains is stale"), true);
});

// A mint-burn payload the response schema permits — `scope` is optional and
// `coins` has no minimum — must pass the gate. If it failed, the deploy smoke
// would exhaust its retries and the canary would email admins twice an hour
// over a payload nothing is wrong with.
const mintBurnCheck = smokeEndpointChecks.find((check) => check.path === "/api/mint-burn-flows");
assert.ok(mintBurnCheck, "the smoke allowlist must still cover /api/mint-burn-flows");
assert.deepEqual(
  mintBurnCheck.validate({
    gauge: { score: 4 },
    coins: [{ symbol: "USDC" }],
    updatedAt: 1_785_060_000,
    scope: { chainIds: ["1"], label: "all chains" },
  }),
  [],
);

const mintBurnWarnings = mintBurnCheck.validate({ gauge: {}, coins: [], updatedAt: 1_785_060_000 });
assert.equal(mintBurnWarnings.length, 2);
assert.equal(mintBurnWarnings.some((warning) => warning.includes("no coins")), true);
assert.equal(mintBurnWarnings.some((warning) => warning.includes("scope.chainIds")), true);

// What the schema does guarantee stays a hard failure.
assert.throws(
  () => mintBurnCheck.validate({ coins: [], updatedAt: 1 }),
  /gauge must be an object/,
);
assert.throws(
  () => mintBurnCheck.validate({ gauge: {}, coins: [] }),
  /updatedAt must be a finite number/,
);

const payloadWarningLog = [];
assert.equal(reportPayloadWarnings([], false, (line) => payloadWarningLog.push(line)), "payloads clean");
assert.deepEqual(payloadWarningLog, [], "a clean run stays quiet");
assert.equal(
  reportPayloadWarnings(mintBurnWarnings, false, (line) => payloadWarningLog.push(line)),
  "2 payload warning(s)",
  "contract-legal findings report without failing",
);
assert.equal(payloadWarningLog.some((line) => line.includes("payload WARNING (2)")), true);

// A warning tier nothing can escalate is decoration: an empty scope.chainIds
// marks every harbour untracked and would otherwise deploy green and silent.
assert.throws(
  () => reportPayloadWarnings(mintBurnWarnings, true, (line) => payloadWarningLog.push(line)),
  /2 payload warning\(s\) under --strict-freshness/,
  "the strict flag enforces payload findings too",
);
assert.equal(payloadWarningLog.some((line) => line.includes("payload FAILED (2)")), true);

const reportCardsCheck = smokeEndpointChecks.find((check) => check.path === "/api/report-cards");
assert.equal(reportCardsCheck?.warningOnly, true, "report cards stay probed as warning-tier enrichment");
assert.equal(
  smokeEndpointChecks.find((check) => check.path === "/api/chains")?.warningOnly,
  false,
  "essential feeds remain hard failures",
);
const availabilityWarningLog = [];
assert.equal(
  reportAvailabilityWarnings(["/api/report-cards is unavailable"], false, (line) => availabilityWarningLog.push(line)),
  "1 availability warning(s)",
);
assert.equal(availabilityWarningLog.some((line) => line.includes("enrichment availability WARNING (1)")), true);
assert.throws(
  () => reportAvailabilityWarnings(["/api/report-cards is unavailable"], true, (line) => availabilityWarningLog.push(line)),
  /1 unavailable enrichment feed\(s\) under --strict-freshness/,
);

// The other escalation path: on GitHub Actions each finding becomes a run
// annotation, so a green canary still surfaces them somewhere a human looks.
const previousGithubActions = process.env.GITHUB_ACTIONS;
process.env.GITHUB_ACTIONS = "true";
assert.equal(annotated("/api/chains is stale", false), "::warning::/api/chains is stale");
assert.equal(annotated("/api/chains is stale", true), "::error::/api/chains is stale");
delete process.env.GITHUB_ACTIONS;
assert.equal(annotated("/api/chains is stale", false), "- /api/chains is stale");
if (previousGithubActions !== undefined) process.env.GITHUB_ACTIONS = previousGithubActions;

// The live registry must still resolve a producer interval for every smoke endpoint.
for (const check of smokeEndpointChecks) {
  assert.equal(
    Number.isFinite(check.freshness.producerIntervalSec),
    true,
    `${check.path} has no producer interval`,
  );
}

function buildPngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, "latin1");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function buildValidPng(side = 32) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header[8] = 8;
  header[9] = 6;
  // Deterministic noise: compressible pixels would leave an IDAT too short to truncate.
  const scanlines = Buffer.alloc(side * (side * 4 + 1));
  let seed = 1;
  for (let index = 0; index < scanlines.length; index += 1) {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    scanlines[index] = (seed >>> 16) % 256;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    buildPngChunk("IHDR", header),
    buildPngChunk("IDAT", deflateSync(scanlines)),
    buildPngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const validPng = buildValidPng();
assert.equal(validPng.length > 600, true, "the PNG fixture must survive being truncated to 600 bytes");
assert.deepEqual(findMediaFileProblems("/logos/ok.png", validPng), []);

// The shape of public/logos/340-rwausdi.png: an IDAT header promising bytes the file never delivers.
const truncatedPngProblems = findMediaFileProblems("/logos/cut.png", validPng.subarray(0, 600));
assert.equal(truncatedPngProblems.length, 1);
assert.match(truncatedPngProblems[0], /PNG chunk IDAT declares \d+ bytes but only \d+ are present/);

// Losing only the trailing IEND is still a truncation.
assert.deepEqual(
  findMediaFileProblems("/logos/no-end.png", validPng.subarray(0, validPng.length - 12)),
  ["PNG is truncated: the stream never reaches IEND"],
);

assert.deepEqual(findMediaFileProblems("/logos/empty.png", Buffer.alloc(0)), ["file is empty"]);
assert.deepEqual(findMediaFileProblems("/logos/stub.png", Buffer.alloc(32)), [
  "file is only 32 bytes, too small to hold an image",
]);
assert.deepEqual(findMediaFileProblems("/logos/text.png", Buffer.from("not an image at all".repeat(8))), [
  "is not a recognizable image: no PNG, JPEG, WebP, or SVG container found",
]);

// A PNG named .jpg still decodes everywhere, so it must not fail the guard.
assert.deepEqual(findMediaFileProblems("/logos/306-gusd.jpg", validPng), []);
// Swapping vector for raster does break, because the served media type is wrong.
assert.match(
  findMediaFileProblems("/logos/fake.svg", validPng)[0],
  /is a PNG behind a \.svg extension/,
);

const validSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">',
  '<circle cx="12" cy="12" r="10" fill="#0b1d2a" />',
  "</svg>",
].join("\n");
assert.deepEqual(findMediaFileProblems("/logos/ok.svg", Buffer.from(validSvg)), []);
assert.deepEqual(
  findMediaFileProblems("/logos/cut.svg", Buffer.from(validSvg.slice(0, 90))),
  ["SVG is truncated: no closing </svg> tag"],
);
assert.deepEqual(
  findMediaFileProblems("/logos/sizeless.svg", Buffer.from(validSvg.replace(' viewBox="0 0 24 24"', ""))),
  ["SVG has neither a viewBox nor an intrinsic width/height, so it has no size to render at"],
);

const bitmapSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">',
  `<image href="data:image/png;base64,${validPng.toString("base64")}" width="24" height="24" />`,
  "</svg>",
].join("\n");
assert.match(
  findMediaFileProblems("/logos/bitmap.svg", Buffer.from(bitmapSvg))[0],
  /is a bitmap wearing an \.svg extension: \d+% of the file is base64 raster data/,
);
assert.match(
  findMediaFileProblems("/logos/huge.svg", Buffer.from(validSvg.replace("</svg>", `<!--${"x".repeat(MAX_SVG_BYTES)}-->\n</svg>`)))[0],
  /far past the \d+ KB ceiling for vector art/,
);

// Rasters other than PNG get the same treatment: the container must match the bytes.
function buildJpegSegment(marker, payload) {
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = marker;
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

const jpegBody = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  buildJpegSegment(0xe0, Buffer.concat([Buffer.from("JFIF", "latin1"), Buffer.alloc(10)])),
  buildJpegSegment(0xc0, Buffer.from([0x08, 0x00, 0x20, 0x00, 0x20, 0x01, 0x01, 0x11, 0x00])),
  buildJpegSegment(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
  Buffer.alloc(64, 0x7a),
]);
assert.deepEqual(findMediaFileProblems("/logos/cut.jpg", jpegBody), [
  "JPEG is truncated: the scan never reaches an EOI marker",
]);
assert.deepEqual(
  findMediaFileProblems("/logos/ok.jpg", Buffer.concat([jpegBody, Buffer.from([0xff, 0xd9])])),
  [],
);

const webpBody = Buffer.concat([
  Buffer.from("RIFF", "latin1"),
  Buffer.alloc(4),
  Buffer.from("WEBPVP8L", "latin1"),
  Buffer.alloc(4),
  Buffer.alloc(64, 0x2f),
]);
webpBody.writeUInt32LE(webpBody.length - 8, 4);
webpBody.writeUInt32LE(64, 16);
assert.deepEqual(findMediaFileProblems("/logos/ok.webp", webpBody), []);
webpBody.writeUInt32LE(4096, 16);
assert.deepEqual(findMediaFileProblems("/logos/cut.webp", webpBody), [
  "WebP chunk VP8L declares 4096 bytes but only 64 are present",
]);

console.log("Guard script self-tests passed.");
