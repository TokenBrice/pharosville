#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const requiredPaths = [
  "AGENTS.md",
  "README.md",
  "docs/pharosville-page.md",
  "docs/pharosville/AGENT_ONBOARDING.md",
  "docs/pharosville/CURRENT.md",
  "docs/pharosville/CHANGE_PLAYBOOK.md",
  "docs/pharosville/TESTING.md",
  "agents",
  "outputs",
];

const supportedNodeMajor = 24;
const sharedEnvFileName = "pharosville.env.local";

function summarizeGitStatus(repoRoot) {
  try {
    const output = execFileSync("git", ["status", "--short"], { cwd: repoRoot }).toString("utf8").trim();
    if (!output) return { clean: true, lines: [] };
    return { clean: false, lines: output.split(/\r?\n/) };
  } catch {
    return { clean: false, lines: ["unable to read git status"] };
  }
}

function validateRequiredPaths(repoRoot) {
  const missing = [];
  for (const relativePath of requiredPaths) {
    if (!existsSync(resolve(repoRoot, relativePath))) {
      missing.push(relativePath);
    }
  }
  return missing;
}

function hasLegacyOutputArtifacts(repoRoot) {
  const legacyOutputPath = resolve(repoRoot, "output");
  if (!existsSync(legacyOutputPath)) return false;
  return readdirSync(legacyOutputPath).length > 0;
}

function detectExpectedNodeMajor(repoRoot) {
  try {
    const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
    const enginesNode = packageJson?.engines?.node;
    const majorMatch = typeof enginesNode === "string" ? enginesNode.match(/>=\s*(\d+)/) : null;
    return majorMatch ? Number(majorMatch[1]) : supportedNodeMajor;
  } catch {
    return supportedNodeMajor;
  }
}

function parseLoosePharosEnvFile(filePath) {
  try {
    const file = readFileSync(filePath, "utf8");
    return Object.fromEntries(file.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^\s*(PHAROS_API_(?:BASE|KEY))\s*(?:=|:)\s*(.*?)\s*$/);
      if (!match) return [];
      const value = match[2].replace(/^([`'"])(.*)\1$/, "$2").trim();
      return [[match[1], value]];
    }));
  } catch {
    return {};
  }
}

function resolveGitCommonDir(repoRoot) {
  try {
    const rawPath = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: repoRoot })
      .toString("utf8")
      .trim();
    if (!rawPath) return null;
    return isAbsolute(rawPath) ? rawPath : resolve(repoRoot, rawPath);
  } catch {
    return null;
  }
}

function discoverLocalPharosApiKey(repoRoot) {
  const envKey = process.env.PHAROS_API_KEY?.trim();
  if (envKey) return { source: "process.env.PHAROS_API_KEY", keyFound: true };

  const worktreeEnvPath = resolve(repoRoot, ".env.local");
  if (parseLoosePharosEnvFile(worktreeEnvPath).PHAROS_API_KEY?.trim()) {
    return { source: ".env.local", keyFound: true };
  }

  const commonDir = resolveGitCommonDir(repoRoot);
  if (!commonDir) return { source: null, keyFound: false };

  const commonRootEnvPath = join(dirname(commonDir), ".env.local");
  if (commonRootEnvPath !== worktreeEnvPath && parseLoosePharosEnvFile(commonRootEnvPath).PHAROS_API_KEY?.trim()) {
    return { source: `${commonRootEnvPath} (main worktree)`, keyFound: true };
  }

  const sharedGitEnvPath = join(commonDir, sharedEnvFileName);
  if (parseLoosePharosEnvFile(sharedGitEnvPath).PHAROS_API_KEY?.trim()) {
    return { source: `${sharedGitEnvPath} (shared git env)`, keyFound: true };
  }

  return {
    source: null,
    keyFound: false,
    hints: [".env.local", commonRootEnvPath, sharedGitEnvPath],
  };
}

function main() {
  const repoRoot = process.cwd();
  const actualNodeMajor = Number(process.versions.node.split(".")[0]);
  const expectedNodeMajor = detectExpectedNodeMajor(repoRoot);
  const missingPaths = validateRequiredPaths(repoRoot);
  const status = summarizeGitStatus(repoRoot);
  const legacyOutputWarning = hasLegacyOutputArtifacts(repoRoot);
  const apiKeyStatus = discoverLocalPharosApiKey(repoRoot);

  console.log("PharosVille agent onboarding check");
  console.log(`- Node: v${process.versions.node} (expected major ${expectedNodeMajor})`);
  console.log(`- Git worktree: ${status.clean ? "clean" : "dirty"}`);
  console.log(`- Required files/directories: ${missingPaths.length === 0 ? "present" : "missing entries found"}`);
  if (apiKeyStatus.keyFound) {
    console.log(`- Local API key source: ${apiKeyStatus.source}`);
  } else {
    console.log("- Local API key source: not found");
  }

  if (!status.clean) {
    console.log("- Dirty entries:");
    for (const line of status.lines.slice(0, 10)) {
      console.log(`  ${line}`);
    }
    if (status.lines.length > 10) {
      console.log(`  ...and ${status.lines.length - 10} more`);
    }
  }

  if (missingPaths.length > 0) {
    console.log("- Missing required onboarding paths:");
    for (const missingPath of missingPaths) {
      console.log(`  ${missingPath}`);
    }
  }

  if (legacyOutputWarning) {
    console.log("- Warning: legacy scratch directory 'output/' contains files. New scratch work should use 'outputs/'.");
  }
  if (actualNodeMajor !== expectedNodeMajor) {
    console.log(
      `- Warning: expected Node major ${expectedNodeMajor}, current runtime is ${actualNodeMajor}.`,
    );
  }
  if (!apiKeyStatus.keyFound) {
    console.log("- Warning: ships/API data will not load in `npm run dev` without PHAROS_API_KEY.");
    if (apiKeyStatus.hints?.length) {
      console.log("- Checked locations:");
      for (const hint of apiKeyStatus.hints) {
        console.log(`  ${hint}`);
      }
    }
  }

  console.log("\nRecommended next commands:");
  console.log("1. npm run validate:docs");
  console.log("2. npm test -- src   # if code semantics changed");
  console.log("3. npm run validate:release   # before claiming release confidence");

  const failedChecks = [];
  if (missingPaths.length > 0) {
    failedChecks.push("Required onboarding files/directories are missing.");
  }

  if (failedChecks.length > 0) {
    console.error("\nOnboarding check failed:");
    for (const message of failedChecks) {
      console.error(`- ${message}`);
    }
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
