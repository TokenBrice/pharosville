#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  reportFreshness,
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
assert.deepEqual(viewportGateCheck.gate, { longSide: 720, shortSide: 360 });

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
    gateSource: "export const MIN_LONG_SIDE_PX = 720;",
    clientSource: viewportGateClient,
  }),
  /Could not parse MIN_LONG_SIDE_PX \/ MIN_SHORT_SIDE_PX/,
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

const deployWorkflowSource = readFileSync(resolve(".github/workflows/deploy-cloudflare.yml"), "utf8");
assert.match(deployWorkflowSource, /npm run check:security-headers:static/);
assert.match(deployWorkflowSource, /check-security-headers\.mjs --url "\$SMOKE_UI_URL"/);
assert.match(deployWorkflowSource, /npm run check:release-contract/);
assert.match(deployWorkflowSource, /Live security-header check failed after 4 attempts/);
assert.match(deployWorkflowSource, /Live smoke failed after 4 attempts/);
assert.match(deployWorkflowSource, /steps\.pages\.outputs\.deployment_url/);
assert.match(deployWorkflowSource, /Probe canonical URL/);

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
    contexts: ["typecheck", "lint", "unit", "guards", "build", "visual", "visual-cross-browser"],
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
          { context: "typecheck" },
          { context: "lint" },
          { context: "unit" },
          { context: "guards" },
          { context: "build" },
          { context: "visual" },
          { context: "visual-cross-browser" },
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

const freshnessLog = [];
assert.equal(reportFreshness([], false, (line) => freshnessLog.push(line)), "fresh");
assert.deepEqual(freshnessLog, [], "a clean run stays quiet");

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

// The live registry must still resolve a producer interval for every smoke endpoint.
for (const check of smokeEndpointChecks) {
  assert.equal(
    Number.isFinite(check.freshness.producerIntervalSec),
    true,
    `${check.path} has no producer interval`,
  );
}

console.log("Guard script self-tests passed.");
