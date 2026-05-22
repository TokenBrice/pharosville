#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ZERO_SHA = "0000000000000000000000000000000000000000";
const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

export function parseChangedPaths(statusOutput) {
  const paths = [];
  for (const line of statusOutput.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const rawPath = line.slice(3).trim();
    if (!rawPath) continue;
    const renameMarker = rawPath.indexOf(" -> ");
    if (renameMarker >= 0) {
      paths.push(rawPath.slice(0, renameMarker).trim());
      paths.push(rawPath.slice(renameMarker + 4).trim());
    } else {
      paths.push(rawPath);
    }
  }
  return paths;
}

export function parseGitNameStatusPaths(nameStatusOutput) {
  const paths = [];
  for (const line of nameStatusOutput.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split("\t").map((value) => value.trim()).filter(Boolean);
    const status = parts[0] ?? "";
    if (!status) continue;
    if (status.startsWith("R") || status.startsWith("C")) {
      paths.push(...parts.slice(1, 3));
      continue;
    }
    if (parts[1]) paths.push(parts[1]);
  }
  return paths;
}

export function parsePrePushUpdates(input) {
  return input.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    const [localRef, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
    if (!localRef || !localSha || !remoteRef || !remoteSha) return [];
    return [{ localRef, localSha, remoteRef, remoteSha }];
  });
}

export function changedValidationUpdatesFromPrePushInput(input) {
  return parsePrePushUpdates(input).filter((update) => (
    update.localSha !== ZERO_SHA
    && update.remoteRef.startsWith("refs/heads/")
    && update.remoteRef !== "refs/heads/main"
  ));
}

export function isDocsLikePath(path) {
  if (path.endsWith(".md")) return true;
  if (path === "README.md" || path === "AGENTS.md" || path === "CLAUDE.md") return true;
  if (path.startsWith("docs/")) return true;
  if (path.startsWith("agents/")) return true;
  return false;
}

export function chooseValidationLane(paths) {
  if (paths.length === 0) return "none";
  if (paths.every(isDocsLikePath)) return "docs";
  return "full";
}

export function changedPathsForCommitRange(update, {
  cwd = process.cwd(),
  exec = execFileSync,
  remoteName = "origin",
} = {}) {
  const baseSha = update.remoteSha === ZERO_SHA
    ? resolveNewBranchBase(update.localSha, { cwd, exec, remoteName })
    : update.remoteSha;
  const output = exec("git", ["diff", "--name-status", "-M", baseSha, update.localSha], {
    cwd,
    encoding: "utf8",
  });
  return parseGitNameStatusPaths(output);
}

export function collectPrePushChangedPaths(input, {
  cwd = process.cwd(),
  exec = execFileSync,
  remoteName = "origin",
} = {}) {
  const paths = [];
  const seen = new Set();
  for (const update of changedValidationUpdatesFromPrePushInput(input)) {
    for (const path of changedPathsForCommitRange(update, { cwd, exec, remoteName })) {
      if (seen.has(path)) continue;
      seen.add(path);
      paths.push(path);
    }
  }
  return paths;
}

function resolveNewBranchBase(localSha, { cwd, exec, remoteName }) {
  const candidates = [
    remoteName ? `${remoteName}/main` : null,
    "origin/main",
    "main",
  ].filter((value, index, values) => value && values.indexOf(value) === index);

  for (const candidate of candidates) {
    try {
      const base = exec("git", ["merge-base", localSha, candidate], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (base) return base;
    } catch {
      // Try the next likely main ref, then fall back to the empty tree.
    }
  }

  return EMPTY_TREE_SHA;
}

function runLane(lane, repoRoot) {
  if (lane === "none") {
    console.log("No changes detected. Nothing to validate.");
    return;
  }

  if (lane === "docs") {
    console.log("Detected docs-only change set. Running docs validation lane.");
    run("npm", ["run", "validate:docs"], repoRoot);
    return;
  }

  console.log("Detected code/assets/config changes. Running full validation lane.");
  run("npm", ["run", "validate"], repoRoot);
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseArgs(argv) {
  let prePush = false;
  let remoteName = "origin";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--pre-push") {
      prePush = true;
      continue;
    }
    if (arg === "--remote") {
      const value = argv[index + 1];
      if (!value) throw new Error("--remote requires a value");
      remoteName = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { prePush, remoteName };
}

function main() {
  const repoRoot = process.cwd();
  const { prePush, remoteName } = parseArgs(process.argv.slice(2));
  if (prePush) {
    const paths = collectPrePushChangedPaths(readStdin(), { cwd: repoRoot, remoteName });
    runLane(chooseValidationLane(paths), repoRoot);
    return;
  }

  const status = execFileSync("git", ["status", "--porcelain"], { cwd: repoRoot }).toString("utf8");
  const paths = parseChangedPaths(status);
  runLane(chooseValidationLane(paths), repoRoot);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
