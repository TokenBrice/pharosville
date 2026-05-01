#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_API_BASE = "https://api.pharos.watch";
const sharedEnvFileName = "pharosville.env.local";

export function parseLoosePharosEnvFile(filePath) {
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

export function resolveGitCommonDir(repoRoot = process.cwd()) {
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

export function discoverPharosApiConfig(repoRoot = process.cwd()) {
  const commonDir = resolveGitCommonDir(repoRoot);
  if (!commonDir) {
    return {
      apiBase: DEFAULT_API_BASE,
      apiKey: null,
      source: null,
      sharedEnvPath: null,
      checkedPaths: [],
    };
  }

  const checkedPaths = [];
  const sharedEnvPath = join(commonDir, sharedEnvFileName);
  const mainRoot = dirname(commonDir);
  const worktreeEnvPath = resolve(repoRoot, ".env.local");
  const mainEnvPath = join(mainRoot, ".env.local");

  const envApiKey = process.env.PHAROS_API_KEY?.trim() ?? "";
  const envApiBase = process.env.PHAROS_API_BASE?.trim() ?? "";
  if (envApiKey) {
    return {
      apiBase: envApiBase || DEFAULT_API_BASE,
      apiKey: envApiKey,
      source: "process.env",
      sharedEnvPath,
      checkedPaths,
    };
  }

  checkedPaths.push(worktreeEnvPath);
  const worktreeEnv = parseLoosePharosEnvFile(worktreeEnvPath);
  if (worktreeEnv.PHAROS_API_KEY?.trim()) {
    return {
      apiBase: worktreeEnv.PHAROS_API_BASE?.trim() || DEFAULT_API_BASE,
      apiKey: worktreeEnv.PHAROS_API_KEY.trim(),
      source: ".env.local (current worktree)",
      sharedEnvPath,
      checkedPaths,
    };
  }

  if (mainEnvPath !== worktreeEnvPath) {
    checkedPaths.push(mainEnvPath);
    const mainEnv = parseLoosePharosEnvFile(mainEnvPath);
    if (mainEnv.PHAROS_API_KEY?.trim()) {
      return {
        apiBase: mainEnv.PHAROS_API_BASE?.trim() || DEFAULT_API_BASE,
        apiKey: mainEnv.PHAROS_API_KEY.trim(),
        source: ".env.local (main worktree)",
        sharedEnvPath,
        checkedPaths,
      };
    }
  }

  checkedPaths.push(sharedEnvPath);
  const sharedEnv = parseLoosePharosEnvFile(sharedEnvPath);
  if (sharedEnv.PHAROS_API_KEY?.trim()) {
    return {
      apiBase: sharedEnv.PHAROS_API_BASE?.trim() || DEFAULT_API_BASE,
      apiKey: sharedEnv.PHAROS_API_KEY.trim(),
      source: ".git/pharosville.env.local (existing shared file)",
      sharedEnvPath,
      checkedPaths,
    };
  }

  return {
    apiBase: DEFAULT_API_BASE,
    apiKey: null,
    source: null,
    sharedEnvPath,
    checkedPaths,
  };
}

export function writeSharedPharosEnv(sharedEnvPath, apiBase, apiKey) {
  const fileBody = [
    "# Shared local secret file for all linked pharosville worktrees.",
    "# Do not commit. Keep server-side only.",
    `PHAROS_API_BASE=${apiBase}`,
    `PHAROS_API_KEY=${apiKey}`,
    "",
  ].join("\n");

  writeFileSync(sharedEnvPath, fileBody, { mode: 0o600 });
  chmodSync(sharedEnvPath, 0o600);
}

function main() {
  const repoRoot = process.cwd();
  const discovered = discoverPharosApiConfig(repoRoot);
  if (!discovered.sharedEnvPath) {
    console.error("Failed to resolve git common directory. Run this inside the pharosville repository.");
    process.exit(1);
  }

  if (!discovered.apiKey) {
    console.error("No PHAROS_API_KEY found in environment or local env files.");
    if (discovered.checkedPaths.length > 0) {
      console.error("Checked:");
      for (const path of discovered.checkedPaths) {
        console.error(`- ${path}`);
      }
    }
    process.exit(1);
  }

  writeSharedPharosEnv(discovered.sharedEnvPath, discovered.apiBase, discovered.apiKey);
  console.log(`Shared local API env updated at ${discovered.sharedEnvPath}`);
  console.log(`Source used: ${discovered.source}`);
  console.log("PHAROS_API_KEY value was written without being printed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
