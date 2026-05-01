#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function usage() {
  console.error("Usage: npm run worktree:new -- <name> [--ref <git-ref>] [--branch <branch-name>] [--install]");
}

export function sanitizeSegment(value) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function parseArgs(argv) {
  const args = [...argv];
  const name = args.shift();
  if (!name || name.startsWith("-")) return null;

  const parsed = {
    name,
    ref: "HEAD",
    branch: "",
    install: false,
  };

  while (args.length > 0) {
    const token = args.shift();
    if (token === "--install") {
      parsed.install = true;
      continue;
    }
    if (token === "--ref") {
      const ref = args.shift();
      if (!ref) return null;
      parsed.ref = ref;
      continue;
    }
    if (token === "--branch") {
      const branch = args.shift();
      if (!branch) return null;
      parsed.branch = branch;
      continue;
    }
    return null;
  }

  return parsed;
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    usage();
    process.exit(1);
  }

  const repoRoot = process.cwd();
  const name = sanitizeSegment(parsed.name);
  if (!name) {
    console.error("Worktree name resolves to empty after sanitization.");
    process.exit(1);
  }

  const worktreePath = resolve(repoRoot, ".worktrees", name);
  if (existsSync(worktreePath)) {
    console.error(`Worktree path already exists: ${worktreePath}`);
    process.exit(1);
  }

  const addArgs = ["worktree", "add"];
  if (parsed.branch) {
    addArgs.push("-b", parsed.branch);
  }
  addArgs.push(worktreePath, parsed.ref);

  run("git", addArgs, repoRoot);

  if (parsed.install) {
    run("npm", ["ci"], worktreePath);
  }

  run("node", [resolve(repoRoot, "scripts/pharosville/onboard-agent.mjs")], worktreePath);

  console.log("\nWorktree ready:");
  console.log(`- path: ${worktreePath}`);
  console.log(`- ref: ${parsed.ref}`);
  console.log(`- branch: ${parsed.branch || "(detached)"}`);
  if (!parsed.install) {
    console.log("- next: run `npm ci` inside the new worktree before running tests/build.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
