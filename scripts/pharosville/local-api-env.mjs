#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const DEFAULT_PHAROS_API_BASE = "https://api.pharos.watch";
export const PHAROS_SHARED_ENV_FILE = "pharosville.env.local";

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

export function pharosApiEnvPaths(repoRoot = process.cwd(), commonDir = resolveGitCommonDir(repoRoot)) {
  if (!commonDir) {
    return {
      mainEnvPath: null,
      sharedEnvPath: null,
      worktreeEnvPath: resolve(repoRoot, ".env.local"),
    };
  }

  const mainRoot = dirname(commonDir);
  return {
    mainEnvPath: join(mainRoot, ".env.local"),
    sharedEnvPath: join(commonDir, PHAROS_SHARED_ENV_FILE),
    worktreeEnvPath: resolve(repoRoot, ".env.local"),
  };
}

export function discoverPharosApiConfig(repoRoot = process.cwd()) {
  const commonDir = resolveGitCommonDir(repoRoot);
  if (!commonDir) {
    return {
      apiBase: DEFAULT_PHAROS_API_BASE,
      apiKey: null,
      source: null,
      sourcePath: null,
      sharedEnvPath: null,
      checkedPaths: [],
    };
  }

  const checkedPaths = [];
  const {
    mainEnvPath,
    sharedEnvPath,
    worktreeEnvPath,
  } = pharosApiEnvPaths(repoRoot, commonDir);

  const envApiKey = process.env.PHAROS_API_KEY?.trim() ?? "";
  const envApiBase = process.env.PHAROS_API_BASE?.trim() ?? "";
  if (envApiKey) {
    return {
      apiBase: envApiBase || DEFAULT_PHAROS_API_BASE,
      apiKey: envApiKey,
      source: "process.env",
      sourcePath: null,
      sharedEnvPath,
      checkedPaths,
    };
  }

  checkedPaths.push(worktreeEnvPath);
  const worktreeEnv = parseLoosePharosEnvFile(worktreeEnvPath);
  if (worktreeEnv.PHAROS_API_KEY?.trim()) {
    return {
      apiBase: worktreeEnv.PHAROS_API_BASE?.trim() || DEFAULT_PHAROS_API_BASE,
      apiKey: worktreeEnv.PHAROS_API_KEY.trim(),
      source: ".env.local (current worktree)",
      sourcePath: worktreeEnvPath,
      sharedEnvPath,
      checkedPaths,
    };
  }

  if (mainEnvPath !== worktreeEnvPath) {
    checkedPaths.push(mainEnvPath);
    const mainEnv = parseLoosePharosEnvFile(mainEnvPath);
    if (mainEnv.PHAROS_API_KEY?.trim()) {
      return {
        apiBase: mainEnv.PHAROS_API_BASE?.trim() || DEFAULT_PHAROS_API_BASE,
        apiKey: mainEnv.PHAROS_API_KEY.trim(),
        source: ".env.local (main worktree)",
        sourcePath: mainEnvPath,
        sharedEnvPath,
        checkedPaths,
      };
    }
  }

  checkedPaths.push(sharedEnvPath);
  const sharedEnv = parseLoosePharosEnvFile(sharedEnvPath);
  if (sharedEnv.PHAROS_API_KEY?.trim()) {
    return {
      apiBase: sharedEnv.PHAROS_API_BASE?.trim() || DEFAULT_PHAROS_API_BASE,
      apiKey: sharedEnv.PHAROS_API_KEY.trim(),
      source: ".git/pharosville.env.local (existing shared file)",
      sourcePath: sharedEnvPath,
      sharedEnvPath,
      checkedPaths,
    };
  }

  return {
    apiBase: DEFAULT_PHAROS_API_BASE,
    apiKey: null,
    source: null,
    sourcePath: null,
    sharedEnvPath,
    checkedPaths,
  };
}

export function discoverLocalPharosApiKey(repoRoot = process.cwd()) {
  const discovered = discoverPharosApiConfig(repoRoot);
  if (discovered.apiKey) {
    return {
      keyFound: true,
      source: formatLocalApiKeySource(discovered),
    };
  }

  return {
    keyFound: false,
    source: null,
    hints: discovered.checkedPaths,
  };
}

export function loadWorktreeSharedPharosEnv(repoRoot = process.cwd()) {
  const commonDir = resolveGitCommonDir(repoRoot);
  if (!commonDir) return {};

  const {
    mainEnvPath,
    sharedEnvPath,
    worktreeEnvPath,
  } = pharosApiEnvPaths(repoRoot, commonDir);
  const merged = {};
  const candidateFiles = [
    mainEnvPath !== worktreeEnvPath ? mainEnvPath : null,
    sharedEnvPath,
  ].filter((value) => Boolean(value));

  for (const filePath of candidateFiles) {
    Object.assign(merged, parseLoosePharosEnvFile(filePath));
  }

  return merged;
}

function formatLocalApiKeySource(discovered) {
  if (discovered.source === "process.env") return "process.env.PHAROS_API_KEY";
  if (discovered.source === ".env.local (current worktree)") return ".env.local";
  if (discovered.source === ".env.local (main worktree)" && discovered.sourcePath) {
    return `${discovered.sourcePath} (main worktree)`;
  }
  if (discovered.source === ".git/pharosville.env.local (existing shared file)" && discovered.sourcePath) {
    return `${discovered.sourcePath} (shared git env)`;
  }
  return discovered.source;
}
