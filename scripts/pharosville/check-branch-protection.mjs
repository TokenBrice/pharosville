#!/usr/bin/env node
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REQUIRED_BRANCH = "main";
const REQUIRED_STATUS_CHECKS = ["typecheck", "unit", "guards", "build", "visual"];
const REQUIRED_APPROVALS = 1;
const RULESET_STATUS_CHECK_KEYS = [
  "required_status_checks",
  "required_check_names",
  "required_checks",
  "checks",
  "contexts",
];
const RULESET_APPROVAL_KEYS = [
  "required_approving_review_count",
  "required_approving_reviews",
  "required_reviews",
  "required_approvals",
  "approval_count",
  "approving_review_count",
  "required_approvals_count",
  "min_approving_review_count",
];
const RULESET_APPROVAL_NESTED_KEYS = [
  "required_approving_review_count",
  "required_approving_reviews",
  "required_reviews",
  "required_pull_request_reviews",
  "required_pull_request_approvals",
];

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

function toUnique(value) {
  return [...new Set(value)];
}

function normalizePathPattern(pattern = "") {
  return pattern.trim();
}

function wildcardMatch(pattern, branch) {
  const normalizedBranch = branch.replace(/^refs\/heads\//, "");
  const normalizedPattern = normalizePathPattern(pattern).trim();
  const expanded =
    normalizedPattern
      .replace(/\//g, "\\/")
      .replace(/\./g, "\\.")
      .replace(/\*/g, ".*");

  return new RegExp(`^(?:refs/heads/)?${expanded}$`, "i").test(normalizedBranch);
}

function getArrayFromValue(value) {
  return asArray(value).map((entry) => `${entry}`.trim()).filter(Boolean);
}

function extractFromObject(value, keys) {
  if (!value || typeof value !== "object") return [];

  const values = [];
  for (const key of keys) {
    if (key in value) {
      const nested = value[key];
      values.push(...getArrayFromValue(nested));
    }
  }
  return values;
}

function normalizeStatusCheckValue(value, options = { includeNested: true }) {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  if (typeof value === "number" || typeof value === "bigint") {
    return Number.isFinite(Number(value)) ? [`${value}`] : [];
  }
  if (typeof value === "boolean") return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeStatusCheckValue(entry, options));
  }
  if (typeof value !== "object") return [];

  const direct = extractFromObject(value, ["context", "name", "check_name", "checkName", "status_check_name", "check"]);
  if (direct.length > 0) return toUnique(direct);

  if (!options.includeNested) return [];
  const nestedKeys = ["contexts", "checks", "check_names", "required_status_checks", "required_checks", "required_status_check"];
  return nestedKeys.flatMap((key) => normalizeStatusCheckValue(value[key]));
}

function matchesBranch(branch, conditions) {
  const conditionRef = conditions?.ref_name;
  if (!conditionRef) return true;

  const include = [
    ...getArrayFromValue(conditionRef.include),
    ...getArrayFromValue(conditionRef.includes),
    ...getArrayFromValue(conditionRef.patterns),
  ];
  const exclude = [
    ...getArrayFromValue(conditionRef.exclude),
    ...getArrayFromValue(conditionRef.excludes),
  ];

  const includesAny = include.length === 0 || include.some((pattern) => wildcardMatch(pattern, branch));
  if (!includesAny) return false;
  if (exclude.some((pattern) => wildcardMatch(pattern, branch))) return false;
  return true;
}

function normalizeRuleParameter(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((entry) => `${entry}`.trim());
  return [];
}

function getRulesetRequiredStatusChecks(rule) {
  const params = rule?.parameters ?? {};
  const checks = toUnique([
    ...RULESET_STATUS_CHECK_KEYS.flatMap((key) => normalizeStatusCheckValue(params[key])),
    ...normalizeRuleParameter(params?.statusChecks),
    ...normalizeRuleParameter(params?.requiredStatusChecks),
    ...normalizeRuleParameter(params?.required_checks),
  ]).filter(Boolean);

  const strict =
    params.strict === true
    || params.strict_required_status_check === true
    || params.strict_required_status_checks_policy === true
    || params.required_status_checks_policy === true
    || params.required_status_checks_strict === true
    || params.strictRequiredStatusChecks === true
    || params.required_status_checks?.strict === true;

  return { checks, strict };
}

function getRulesetRequiredApprovals(rule) {
  const params = rule?.parameters ?? {};
  const candidateValues = [];

  for (const key of RULESET_APPROVAL_KEYS) {
    candidateValues.push(...getArrayFromValue(params[key]));
  }
  for (const value of candidateValues) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const nested = getRulesetApprovalCandidates(params);
  for (const value of nested) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function getRulesetApprovalCandidates(value) {
  if (value === null || value === undefined) return [];
  if (typeof value === "number" || typeof value === "string") {
    return getArrayFromValue(value);
  }
  if (typeof value === "boolean" || value instanceof Date) return [];
  if (typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => getRulesetApprovalCandidates(entry));
  }

  return toUnique([
    ...RULESET_APPROVAL_NESTED_KEYS.flatMap((key) => getRulesetApprovalCandidates(value[key])),
    ...getArrayFromValue(value.approval_count),
  ]);
}

function validateBranchRulesetProtection(ruleset, branch) {
  const failures = [];
  const checks = [];
  const rules = Array.isArray(ruleset?.rules) ? ruleset.rules : [];

  if (ruleset?.target && ruleset.target !== "branch") {
    failures.push(`ruleset target is ${ruleset.target}, expected branch`);
  }

  const statusRule = rules.find((rule) => rule?.type === "required_status_checks");
  const reviewRule = rules.find(
    (rule) => rule?.type === "required_approving_review_count" || rule?.type === "pull_request" || rule?.type === "required_pull_request_reviews",
  );

  if (!statusRule) {
    failures.push("required status-checks rule is missing in ruleset");
  } else {
    const { checks: required, strict } = getRulesetRequiredStatusChecks(statusRule);
    checks.push(...required);
    if (!strict) {
      failures.push("required_status_checks strict mode is not enabled (branch must be up to date before merge)");
    }

    const missingChecks = REQUIRED_STATUS_CHECKS.filter((checkName) => !required.includes(checkName));
    if (missingChecks.length > 0) {
      failures.push(`required status checks missing: ${missingChecks.join(", ")}`);
    }
  }

  const requiredApprovals = getRulesetRequiredApprovals(reviewRule);
  if (requiredApprovals < REQUIRED_APPROVALS) {
    failures.push(`required approving reviews is ${requiredApprovals}, expected ${REQUIRED_APPROVALS}+`);
  }

  return {
    checks: toUnique(checks),
    failures,
    isActive: matchesBranch(branch, ruleset?.conditions ?? {}),
    name: ruleset?.name || "unnamed ruleset",
  };
}

function findRuleSets(payload) {
  if (Array.isArray(payload)) return payload;
  return [
    ...asArray(payload?.rulesets),
    ...asArray(payload?.repository_rulesets),
    ...asArray(payload?.items),
  ];
}

function formatRulesetResult(branch, validations) {
  const passing = validations.filter((validation) => validation.failures.length === 0 && validation.isActive);
  if (passing.length > 0) {
    return {
      checks: toUnique(passing.flatMap((validation) => validation.checks)),
      failures: [],
      activeName: passing.map((validation) => validation.name).join(", "),
    };
  }

  const activeRules = validations.filter((validation) => validation.isActive);
  if (activeRules.length === 0) {
    return {
      checks: [],
      failures: [`no active ruleset found for branch ${branch}`],
      activeName: "none",
    };
  }

  return {
    checks: toUnique(validations.flatMap((validation) => validation.checks)),
    failures: activeRules.flatMap((validation) => {
      const prefix = validation.name;
      if (validation.failures.length === 0) return [];
      return validation.failures.map((failure) => `${prefix}: ${failure}`);
    }),
    activeName: activeRules.map((validation) => validation.name).join(", "),
  };
}

function validateBranchRulesets(payload, branch) {
  const rulesets = findRuleSets(payload)
    .filter((ruleset) => ruleset && typeof ruleset === "object");

  if (rulesets.length === 0) {
    return {
      checks: [],
      failures: ["no rulesets are configured for this repository"],
      activeName: "none",
    };
  }

  const validations = rulesets.map((ruleset) => validateBranchRulesetProtection(ruleset, branch));
  const result = formatRulesetResult(branch, validations);
  return {
    checks: result.checks,
    failures: result.failures,
    activeName: result.activeName,
  };
}

function usage() {
  return [
    "Usage: node scripts/pharosville/check-branch-protection.mjs [--repo <owner/repo>] [--branch <branch-name>]",
    "",
    "Checks the GitHub branch protection settings for the target branch and",
    "validates required status checks + merge controls.",
  ].join("\n");
}

function parseArgs(argv) {
  let repo = process.env.GITHUB_REPOSITORY ?? null;
  let branch = REQUIRED_BRANCH;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }

    if (arg === "--repo") {
      const value = argv[index + 1];
      if (!value) throw new Error("--repo requires an owner/repo value");
      repo = value;
      index += 1;
      continue;
    }

    if (arg === "--branch") {
      const value = argv[index + 1];
      if (!value) throw new Error("--branch requires a branch name");
      branch = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { repo, branch };
}

function resolveRepository(repoArg) {
  if (!repoArg) throw new Error("No repository context found. Set GITHUB_REPOSITORY or pass --repo owner/repo.");
  if (repoArg === ".") {
    throw new Error("Invalid repository argument: .");
  }

  if (repoArg.includes("/")) {
    const [owner, repo] = repoArg.split("/");
    if (!owner || !repo) throw new Error(`Invalid repo format: ${repoArg}`);
    return { owner, repo: repo.replace(/\\.git$/, "") };
  }

  const gitUrl = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
  const httpsMatch = /^https?:\\/\\/github\\.com\\/([^/]+)\\/([^/]+?)(?:\\.git)?$/.exec(gitUrl);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  const sshMatch = /^git@github\\.com:([^/]+)\\/([^/]+?)(?:\\.git)?$/.exec(gitUrl);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  throw new Error(`Cannot parse GitHub repo from origin remote: ${gitUrl}`);
}

function hasGhCli() {
  try {
    execSync("gh --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runGhApiJson(path) {
  const output = execSync(`gh api ${path}`, { encoding: "utf8", stdio: "pipe" });
  const raw = output.trim();
  if (!raw) throw new Error(`Empty response from gh api ${path}`);
  return JSON.parse(raw);
}

function validateBranchProtection(payload, branch) {
  const failures = [];
  const checks = Array.isArray(payload?.required_status_checks?.contexts)
    ? payload.required_status_checks.contexts
    : [];
  const missingChecks = REQUIRED_STATUS_CHECKS.filter((checkName) => !checks.includes(checkName));

  if (!payload?.required_status_checks) {
    failures.push("required_status_checks is not configured");
  } else {
    if (payload.required_status_checks.strict !== true) {
      failures.push("required_status_checks.strict is not enabled (branch must be up to date before merge)");
    }
    if (missingChecks.length > 0) {
      failures.push(`required status checks missing: ${missingChecks.join(", ")}`);
    }
  }

  const approvalCount = payload?.required_pull_request_reviews?.required_approving_review_count ?? 0;
  if (approvalCount < REQUIRED_APPROVALS) {
    failures.push(`required approving reviews is ${approvalCount}, expected ${REQUIRED_APPROVALS}+`);
  }

  if (payload?.enforce_admins?.enabled !== true) {
    failures.push("enforce_admins is not enabled");
  }

  if (payload?.allow_force_pushes?.enabled === true) {
    failures.push("force pushes are allowed (must be blocked)");
  }

  if (payload?.allow_deletions?.enabled === true) {
    failures.push("branch deletion is allowed (must be blocked)");
  }

  return {
    branch,
    checks,
    failures,
  };
}

function printFailure(message) {
  console.error(message);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { owner, repo } = resolveRepository(args.repo);
  const branch = args.branch || REQUIRED_BRANCH;
  const endpoint = `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`;

  if (!hasGhCli()) {
    printFailure("GitHub CLI is required for this check. Install `gh` and authenticate: `gh auth login`.");
    process.exit(1);
  }

  let payload;
  try {
    payload = runGhApiJson(endpoint);
  } catch (error) {
    try {
      const rulesetPayload = runGhApiJson(`/repos/${owner}/${repo}/rulesets`);
      const rulesetResult = validateBranchRulesets(rulesetPayload, branch);
      if (rulesetResult.failures.length === 0) {
        console.log(`Branch protection check for ${owner}/${repo}#${branch}`);
        console.log(`- Active rulesets: ${rulesetResult.activeName}`);
        console.log(`- Required status checks: ${rulesetResult.checks.length === 0 ? "<none>" : rulesetResult.checks.join(", ")}`);
        console.log("\n✓ PASS: ruleset policy enforces merge-gate requirements.");
        process.exit(0);
      }

      console.error(`Unable to read classic branch protection: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`\n✗ FAIL: ${branch} ruleset policy is incomplete.`);
      for (const failure of rulesetResult.failures) {
        console.error(`- ${failure}`);
      }
      console.error(`\nActionable command: gh api -X POST /repos/${owner}/${repo}/rulesets --input -`);
      console.error("\nExpected required checks:");
      for (const required of REQUIRED_STATUS_CHECKS) {
        console.error(`- ${required}`);
      }
      process.exit(1);
    } catch (rulesError) {
      const message = error instanceof Error ? error.message : String(error);
      printFailure(`Unable to read branch protection from ${owner}/${repo}@${branch}: ${message}`);
      printFailure("If this branch uses a new GitHub ruleset instead of classic protection, check that ruleset has matching required checks.");
      printFailure(`Ruleset inspection also failed: ${rulesError instanceof Error ? rulesError.message : String(rulesError)}`);
      process.exit(1);
    }
  }

  const { checks, failures } = validateBranchProtection(payload, branch);
  console.log(`Branch protection check for ${owner}/${repo}#${branch}`);
  console.log(`- Protection: ${payload.url}`);
  console.log(`- Required status checks: ${checks.length === 0 ? "<none>" : checks.join(", ")}`);
  if (failures.length === 0) {
    console.log(`\n✓ PASS: ${branch} protection enforces merge-gate requirements.`);
    process.exit(0);
  }

  console.error(`\n✗ FAIL: ${branch} protection is incomplete.`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(`\nActionable command: gh api -X PUT ${endpoint} --input -`);
  console.error("\nExpected required checks:");
  for (const required of REQUIRED_STATUS_CHECKS) {
    console.error(`- ${required}`);
  }
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    printFailure(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
