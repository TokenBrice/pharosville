#!/usr/bin/env node
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { discoverPharosApiConfig } from "./setup-local-api-key.mjs";

const require = createRequire(import.meta.url);
const { PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS } = require("../../shared/lib/pharosville-smoke-matrix.ts");

async function smokeEndpoint(apiBase, apiKey, path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
    redirect: "manual",
  });

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const okJson = response.ok && (contentType.includes("application/json") || contentType.includes("+json"));
  if (!okJson) {
    const snippet = (await response.text()).slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(`${path} -> ${response.status} ${response.statusText} (${contentType || "no content-type"}) ${snippet}`);
  }

  await response.arrayBuffer();
  return {
    status: response.status,
    dataAge: response.headers.get("x-data-age") ?? "n/a",
    cacheControl: response.headers.get("cache-control") ?? "n/a",
  };
}

async function main() {
  const discovered = discoverPharosApiConfig(process.cwd());
  if (!discovered.apiKey) {
    console.error("No local PHAROS_API_KEY found for API smoke.");
    if (discovered.checkedPaths.length > 0) {
      console.error("Checked:");
      for (const path of discovered.checkedPaths) {
        console.error(`- ${path}`);
      }
    }
    process.exit(1);
  }

  console.log(`Using API base: ${discovered.apiBase}`);
  console.log(`API key source: ${discovered.source}`);

  const failures = [];
  for (const endpoint of PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS) {
    try {
      const result = await smokeEndpoint(discovered.apiBase, discovered.apiKey, endpoint);
      console.log(`✓ ${endpoint} (${result.status}) age=${result.dataAge} cache=${result.cacheControl}`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
      console.error(`✗ ${endpoint}`);
    }
  }

  if (failures.length > 0) {
    console.error("\nLocal API smoke failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("\nLocal API smoke passed for all allowlisted endpoints.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
