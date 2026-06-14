#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_URL = "https://pharosville.pharos.watch";
const DEFAULT_PATHS = ["/", "/api/stablecoins", "/api/chains"];

export const REQUIRED_PERMISSIONS_POLICY_FEATURES = [
  "accelerometer",
  "ambient-light-sensor",
  "autoplay",
  "battery",
  "camera",
  "clipboard-read",
  "display-capture",
  "document-domain",
  "encrypted-media",
  "fullscreen",
  "geolocation",
  "gyroscope",
  "magnetometer",
  "microphone",
  "midi",
  "payment",
  "picture-in-picture",
  "publickey-credentials-get",
  "screen-wake-lock",
  "serial",
  "sync-xhr",
  "usb",
  "web-share",
  "xr-spatial-tracking",
];

const REQUIRED_CSP_DIRECTIVES = {
  "base-uri": ["'self'"],
  "connect-src": ["'self'"],
  "default-src": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
  "img-src": ["'self'"],
  "object-src": ["'none'"],
  "script-src": ["'self'"],
  "style-src": ["'self'"],
};

function parsePolicyDirectives(value) {
  const directives = new Map();
  for (const part of value.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...sources] = tokens;
    directives.set(name.toLowerCase(), sources);
  }
  return directives;
}

function parsePermissionsDirectives(value) {
  const directives = new Map();
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const name = trimmed.slice(0, equalsIndex).trim().toLowerCase();
    const allowlist = trimmed.slice(equalsIndex + 1).trim();
    directives.set(name, allowlist);
  }
  return directives;
}

export function validateCsp(value) {
  const findings = [];
  const directives = parsePolicyDirectives(value);

  for (const [name, requiredSources] of Object.entries(REQUIRED_CSP_DIRECTIVES)) {
    const sources = directives.get(name);
    if (!sources) {
      findings.push(`missing ${name}`);
      continue;
    }
    for (const source of requiredSources) {
      if (!sources.includes(source)) findings.push(`${name} missing ${source}`);
    }
  }

  for (const [name, sources] of directives) {
    for (const source of sources) {
      if (source === "*" || /^https:\/\/\*\./i.test(source)) {
        findings.push(`${name} uses wildcard source ${source}`);
      }
    }
  }

  return findings;
}

export function validatePermissionsPolicy(value) {
  const findings = [];
  const directives = parsePermissionsDirectives(value);

  for (const feature of REQUIRED_PERMISSIONS_POLICY_FEATURES) {
    const allowlist = directives.get(feature);
    if (!allowlist) {
      findings.push(`missing ${feature}=()`);
      continue;
    }
    if (allowlist !== "()") {
      findings.push(`${feature} must be denied with ()`);
    }
  }

  return findings;
}

export const SECURITY_HEADER_DEFINITIONS = {
  "strict-transport-security": {
    label: "HSTS",
    findings: (value) => (/max-age=\d+/.test(value) ? [] : ["missing or malformed max-age"]),
    message: "missing or malformed max-age",
  },
  "content-security-policy": {
    label: "CSP",
    findings: validateCsp,
    message: "missing required directives or contains wildcard sources",
  },
  "cross-origin-opener-policy": {
    label: "COOP",
    findings: (value) => (/same-origin/i.test(value) ? [] : ["must be same-origin"]),
    message: "must be same-origin",
  },
  "cross-origin-resource-policy": {
    label: "CORP",
    findings: (value) => (/same-origin/i.test(value) ? [] : ["must be same-origin"]),
    message: "must be same-origin",
  },
  "x-content-type-options": {
    label: "X-Content-Type-Options",
    findings: (value) => (/nosniff/i.test(value) ? [] : ["must be nosniff"]),
    message: "must be nosniff",
  },
  "x-frame-options": {
    label: "X-Frame-Options",
    findings: (value) => (/deny/i.test(value) ? [] : ["must be DENY"]),
    message: "must be DENY",
  },
  "referrer-policy": {
    label: "Referrer-Policy",
    findings: (value) => (/strict-origin-when-cross-origin/i.test(value) ? [] : ["must be strict-origin-when-cross-origin"]),
    message: "must be strict-origin-when-cross-origin",
  },
  "permissions-policy": {
    label: "Permissions-Policy",
    findings: validatePermissionsPolicy,
    message: "must be explicitly deny-by-default",
  },
};

function usage() {
  return [
    "Usage: node scripts/pharosville/check-security-headers.mjs [--url <https://pharosville.pharos.watch>]",
    "       node scripts/pharosville/check-security-headers.mjs --static [public/_headers]",
    "",
    "Verifies required response security headers for key public and API endpoints,",
    "or statically parses public/_headers before deploy.",
  ].join("\n");
}

function parseArgs(argv) {
  let baseUrl = process.env.SMOKE_UI_URL || DEFAULT_URL;
  let staticHeadersPath = null;

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
    if (arg === "--static") {
      const next = argv[index + 1];
      if (next && !next.startsWith("--")) {
        staticHeadersPath = next;
        index += 1;
      } else {
        staticHeadersPath = "public/_headers";
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { baseUrl, staticHeadersPath };
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
        findings: (value) => (value === "1" ? [] : ["missing from API responses"]),
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
    const findings = check.findings(value);
    if (findings.length > 0) {
      throw new Error(`${path} failed ${check.label} validation: ${findings.join(", ")}; received '${value}'`);
    }
  }

  return response;
}

export function parseCloudflareHeaders(text) {
  const blocks = new Map();
  let activeRoute = null;

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;

    if (/^\S/.test(rawLine)) {
      activeRoute = rawLine.trim();
      if (!blocks.has(activeRoute)) blocks.set(activeRoute, new Map());
      continue;
    }

    if (!activeRoute) continue;
    const headerLine = rawLine.trim();
    const colonIndex = headerLine.indexOf(":");
    if (colonIndex === -1) continue;
    const name = headerLine.slice(0, colonIndex).trim().toLowerCase();
    const value = headerLine.slice(colonIndex + 1).trim();
    blocks.get(activeRoute).set(name, value);
  }

  return blocks;
}

export function validateStaticHeadersText(text) {
  const findings = [];
  const blocks = parseCloudflareHeaders(text);
  const rootHeaders = blocks.get("/*");
  if (!rootHeaders) {
    return ["public/_headers missing /* route policy block"];
  }

  for (const [name, config] of Object.entries(SECURITY_HEADER_DEFINITIONS)) {
    const value = rootHeaders.get(name);
    if (!value) {
      findings.push(`/* missing ${config.label} (${name})`);
      continue;
    }
    const headerFindings = config.findings(value);
    for (const finding of headerFindings) {
      findings.push(`/* ${config.label}: ${finding}`);
    }
  }

  return findings;
}

function checkStaticHeadersFile(headersPath) {
  const resolvedPath = resolve(headersPath);
  const findings = validateStaticHeadersText(readFileSync(resolvedPath, "utf8"));
  if (findings.length > 0) {
    throw new Error(`Static security header policy failed:\n- ${findings.join("\n- ")}`);
  }
  console.log(`Static security header policy checks passed for ${headersPath}.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.staticHeadersPath) {
    checkStaticHeadersFile(args.staticHeadersPath);
    return;
  }

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
