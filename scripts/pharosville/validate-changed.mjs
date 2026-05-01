#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

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
      paths.push(rawPath.slice(renameMarker + 4).trim());
    } else {
      paths.push(rawPath);
    }
  }
  return paths;
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

function main() {
  const repoRoot = process.cwd();
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: repoRoot }).toString("utf8");
  const paths = parseChangedPaths(status);
  const lane = chooseValidationLane(paths);

  if (lane === "none") {
    console.log("No local changes detected. Nothing to validate.");
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
