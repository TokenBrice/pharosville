#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const DEFAULT_URL = "https://pharosville.pharos.watch";
const DEFAULT_PATHS = ["/", "/api/stablecoins", "/api/chains"];

const SECURITY_HEADER_DEFINITIONS = {
  "strict-transport-security": {
    label: "HSTS",
    validate: (value) => /max-age=\d+/.test(value),
    message: "missing or malformed max-age",
  },
  "content-security-policy": {
    label: "CSP",
    validate: (value) => {
      if (!/default-src\s+'self'/.test(value)) return false;
      if (!/base-uri\s+'self'/.test(value)) return false;
      if (!/connect-src\s+[^;]*'self'/.test(value)) return false;
      if (!/frame-ancestors\s+'none'/.test(value)) return false;
      if (!/object-src\s+'none'/.test(value)) return false;
      if (!/form-action\s+'self'/.test(value)) return false;
      if (!/img-src\s+[^;]*self/.test(value)) return false;
      if (!/style-src\s+[^;]*self/.test(value)) return false;
      if (!/script-src\s+[^;]*self/.test(value)) return false;
      return true;
    },
    message: "missing required directives (base-uri/connect-src/default-src/form-action/object-src/style-src/script-src/img-src/frame-ancestors)",
  },
  "cross-origin-opener-policy": {
    label: "COOP",
    validate: (value) => /same-origin/i.test(value),
    message: "must be same-origin",
  },
  "cross-origin-resource-policy": {
    label: "CORP",
    validate: (value) => /same-origin/i.test(value),
    message: "must be same-origin",
  },
  "x-content-type-options": {
    label: "X-Content-Type-Options",
    validate: (value) => /nosniff/i.test(value),
    message: "must be nosniff",
  },
  "x-frame-options": {
    label: "X-Frame-Options",
    validate: (value) => /deny/i.test(value),
    message: "must be DENY",
  },
  "referrer-policy": {
    label: "Referrer-Policy",
    validate: (value) => /strict-origin-when-cross-origin/i.test(value),
    message: "must be strict-origin-when-cross-origin",
  },
  "permissions-policy": {
    label: "Permissions-Policy",
    validate: (value) => /autoplay=\(\)/i.test(value),
    message: "must be explicitly deny-by-default",
  },
};

function usage() {
  return [
    "Usage: node scripts/pharosville/check-security-headers.mjs [--url <https://pharosville.pharos.watch>]",
    "",
    "Verifies required response security headers for key public and API endpoints.",
  ].join("\n");
}

function parseArgs(argv) {
  let baseUrl = process.env.SMOKE_UI_URL || DEFAULT_URL;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--url") {
      const value = argv[index + 1];
      if (!value) throw new Error("--url requires a value");
      baseUrl = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { baseUrl };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function getPathChecks(path) {
  const baseChecks = Object.entries(SECURITY_HEADER_DEFINITIONS).map(([name, config]) => {
    return {
      name,
      ...config,
    };
  });

  if (path.startsWith("/api/")) {
    return [
      ...baseChecks,
      {
        name: "x-pharosville-proxy",
        label: "x-pharosville-proxy",
        validate: (value) => value === "1",
        message: "missing from API responses",
      },
    ];
  }

  return baseChecks;
}

async function fetchWithTimeout(url, timeoutMs = 12_000) {
  return fetch(url, {
    headers: {
      Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function checkPath(base, path) {
  const url = new URL(path, base).toString();
  const response = await fetchWithTimeout(url);
  assert(response.ok, `${path} must return success (${response.status})`);

  for (const check of getPathChecks(path)) {
    const value = response.headers.get(check.name);
    if (!value) {
      throw new Error(`${path} missing ${check.label} (${check.name})`);
    }
    if (!check.validate(value)) {
      throw new Error(`${path} failed ${check.label} validation: ${check.message}; received '${value}'`);
    }
  }

  return response;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = new URL(args.baseUrl);

  if (base.protocol !== "https:") {
    throw new Error(`Security header verification requires HTTPS. Received ${base.protocol}`);
  }

  console.log(`Checking security headers for ${base.toString().replace(/\/$/, "")}`);
  for (const path of DEFAULT_PATHS) {
    const response = await checkPath(base, path);
    const contentType = response.headers.get("content-type") ?? "";
    console.log(`- ${path}: ${response.status} (${contentType})`);
  }

  console.log("\nSecurity header policy checks passed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
