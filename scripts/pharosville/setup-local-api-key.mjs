#!/usr/bin/env node
import { chmodSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { discoverPharosApiConfig } from "./local-api-env.mjs";

export {
  DEFAULT_PHAROS_API_BASE,
  PHAROS_SHARED_ENV_FILE,
  discoverPharosApiConfig,
  discoverLocalPharosApiKey,
  loadWorktreeSharedPharosEnv,
  parseLoosePharosEnvFile,
  pharosApiEnvPaths,
  resolveGitCommonDir,
} from "./local-api-env.mjs";

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
