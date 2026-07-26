#!/usr/bin/env node

// Usage: node scripts/smoke-live.mjs [--url <origin>] [--timeout-ms <ms>] [--strict-freshness]
//
// --url / SMOKE_UI_URL           origin to smoke (default https://pharosville.pharos.watch)
// --timeout-ms / SMOKE_TIMEOUT_MS  per-request timeout (default 10000)
// --strict-freshness / SMOKE_STRICT_FRESHNESS=1
//     Exit non-zero on anything the run reports at the warning tier: data older
//     than its producer cadence allows, and payload findings the response
//     contract permits but an operator would want to act on. Off by default so a
//     cadence blip or a schema-legal payload cannot break the canary before an
//     operator has watched the signal; on once they have, which is the only
//     thing that keeps a warning from being decoration.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const {
  PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS,
  PHAROSVILLE_SMOKE_LIVE_BLOCKED_VARIANTS,
} = require("../shared/lib/pharosville-smoke-matrix.ts");
const { CRON_INTERVALS_CLIENT } = require("../shared/lib/cron-intervals-client.ts");

const args = process.argv.slice(2);
let baseUrl = process.env.SMOKE_UI_URL ?? "https://pharosville.pharos.watch";
let timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 10_000);
let strictFreshness = process.env.SMOKE_STRICT_FRESHNESS === "1";

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--url" && args[index + 1]) {
    baseUrl = args[index + 1];
    index += 1;
  } else if (args[index] === "--timeout-ms" && args[index + 1]) {
    timeoutMs = Number(args[index + 1]);
    index += 1;
  } else if (args[index] === "--strict-freshness") {
    strictFreshness = true;
  }
}

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error(`Invalid smoke timeout: ${timeoutMs}`);
}

const base = new URL(baseUrl);
base.pathname = "/";
base.search = "";
base.hash = "";
const enforceSecurityHeaders = base.protocol === "https:";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertArray(value, label, { nonEmpty = false } = {}) {
  assert(Array.isArray(value), `${label} must be an array`);
  if (nonEmpty) assert(value.length > 0, `${label} must not be empty`);
}

const REQUIRED_SECURITY_HEADERS = [
  {
    name: "strict-transport-security",
    validate: (value) => /max-age=\d+/.test(value),
  },
  {
    name: "content-security-policy",
    validate: (value) => /default-src\s+'self'/.test(value) && /frame-ancestors\s+'none'/.test(value),
  },
  {
    name: "cross-origin-opener-policy",
    validate: (value) => /same-origin/i.test(value),
  },
  {
    name: "cross-origin-resource-policy",
    validate: (value) => /same-origin/i.test(value),
  },
  {
    name: "permissions-policy",
    validate: (value) => /autoplay=\(\)/i.test(value),
  },
  {
    name: "x-content-type-options",
    validate: (value) => /nosniff/i.test(value),
  },
  {
    name: "x-frame-options",
    validate: (value) => /deny/i.test(value),
  },
  {
    name: "referrer-policy",
    validate: (value) => /strict-origin-when-cross-origin/i.test(value),
  },
];

function assertSecurityHeaders(response, path) {
  if (!enforceSecurityHeaders) return;
  for (const { name, validate } of REQUIRED_SECURITY_HEADERS) {
    const value = response.headers.get(name);
    if (!value) {
      throw new Error(`${path} missing security header: ${name}`);
    }
    if (!validate(value)) {
      throw new Error(`${path} has invalid ${name}: ${value}`);
    }
  }
}

function assertNumber(value, label) {
  assert(typeof value === "number" && Number.isFinite(value), `${label} must be a finite number`);
}

async function smokeFetch(path, init = {}) {
  const url = new URL(path, base);
  try {
    return await fetch(url, {
      redirect: "manual",
      ...init,
      headers: {
        Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        ...init.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new Error(`${url.toString()} timed out after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  }
}

async function expectOk(path, init) {
  const response = await smokeFetch(path, init);
  if (!response.ok) {
    throw new Error(`${new URL(path, base).toString()} returned ${response.status}`);
  }
  assertSecurityHeaders(response, path);
  return response;
}

async function expectJson(path) {
  const response = await expectOk(path);
  const proxyMarker = response.headers.get("x-pharosville-proxy");
  assert(proxyMarker === "1", `${path} is missing x-pharosville-proxy: 1`);

  const contentType = response.headers.get("content-type") ?? "";
  assert(contentType.includes("application/json"), `${path} returned non-JSON content-type: ${contentType || "missing"}`);

  const json = await response.json();
  assert(isRecord(json), `${path} returned a non-object JSON payload`);
  return json;
}

async function expectBlocked(path, expectedStatuses, init) {
  const response = await smokeFetch(path, init);
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${new URL(path, base).toString()} should be blocked with ${expectedStatuses.join("/")} but got ${response.status}`);
  }
}

const endpointValidatorsByPath = {
  "/api/stablecoins": (json) => {
    assertArray(json.peggedAssets, "stablecoins.peggedAssets", { nonEmpty: true });
  },
  "/api/chains": (json) => {
    assertArray(json.chains, "chains.chains", { nonEmpty: true });
    assertNumber(json.updatedAt, "chains.updatedAt");
  },
  "/api/stability-index?detail=true": (json) => {
    assert(json.current === null || isRecord(json.current), "stability.current must be null or an object");
    assertArray(json.history, "stability.history");
    assert(isRecord(json.methodology), "stability.methodology must be an object");
  },
  "/api/peg-summary": (json) => {
    assertArray(json.coins, "pegSummary.coins", { nonEmpty: true });
    assert(json.summary === null || isRecord(json.summary), "pegSummary.summary must be null or an object");
    assert(isRecord(json.methodology), "pegSummary.methodology must be an object");
  },
  "/api/stress-signals": (json) => {
    assert(isRecord(json.signals), "stress.signals must be an object");
    assertNumber(json.updatedAt, "stress.updatedAt");
    assert(isRecord(json.methodology), "stress.methodology must be an object");
  },
  "/api/report-cards": (json) => {
    assertArray(json.cards, "reportCards.cards", { nonEmpty: true });
    assert(isRecord(json.methodology), "reportCards.methodology must be an object");
    assert(isRecord(json.dependencyGraph), "reportCards.dependencyGraph must be an object");
    assertNumber(json.updatedAt, "reportCards.updatedAt");
  },
  // `scope` is `.optional()` in MintBurnFlowsResponseSchema and `coins` carries
  // no minimum, so neither can be a hard gate: a contract-legal payload would
  // fail the deploy smoke through every retry and email admins twice an hour.
  // Both still matter enough to say out loud, so they go to the warning tier.
  "/api/mint-burn-flows": (json) => {
    assert(isRecord(json.gauge), "mintBurn.gauge must be an object");
    assertArray(json.coins, "mintBurn.coins");
    assertNumber(json.updatedAt, "mintBurn.updatedAt");

    const warnings = [];
    if (json.coins.length === 0) {
      warnings.push("/api/mint-burn-flows carries no coins, so no ship shows a flow");
    }
    // The harbour allocation renormalises over this scope, so an empty or
    // missing chain list silently marks every harbour untracked.
    if (!isRecord(json.scope) || !Array.isArray(json.scope.chainIds) || json.scope.chainIds.length === 0) {
      warnings.push("/api/mint-burn-flows has no scope.chainIds, so every harbour reads untracked");
    }
    return warnings;
  },
};

// Data older than this many producer intervals means the upstream writer is
// stuck rather than merely late.
export const FRESHNESS_INTERVAL_MULTIPLIER = 3;

// The endpoint registry is TypeScript with extensionless imports Node cannot
// require, so read its cadence wiring out of the source instead of restating
// the intervals here.
export function parseProducerIntervalsByKey(registrySource, cronIntervals) {
  const intervals = {};
  for (const match of registrySource.matchAll(/(\w+):\s*\{[^}]*?producerIntervalSec:\s*CRON_INTERVALS\["([^"]+)"]/g)) {
    const [, key, job] = match;
    const interval = cronIntervals[job];
    if (!Number.isFinite(interval)) {
      throw new Error(`Endpoint registry entry ${key} references unknown cron job: ${job}`);
    }
    intervals[key] = interval;
  }
  if (Object.keys(intervals).length === 0) {
    throw new Error("Could not parse producer intervals from the PharosVille endpoint registry.");
  }
  return intervals;
}

const producerIntervalsByKey = parseProducerIntervalsByKey(
  readFileSync(new URL("../shared/lib/pharosville-endpoint-registry.ts", import.meta.url), "utf8"),
  CRON_INTERVALS_CLIENT,
);

// Where each payload carries its publication time. Only the endpoints that ship
// an `_meta` envelope get the status/ageSeconds half of the check.
const freshnessSourcesByPath = {
  "/api/stablecoins": { key: "stablecoins", readUpdatedAt: (json) => json._meta?.updatedAt },
  "/api/chains": { key: "chains", readUpdatedAt: (json) => json.updatedAt },
  "/api/stability-index?detail=true": { key: "stability", readUpdatedAt: (json) => json.current?.computedAt },
  "/api/peg-summary": { key: "pegSummary", readUpdatedAt: (json) => json.methodology?.asOf },
  "/api/stress-signals": { key: "stress", readUpdatedAt: (json) => json.updatedAt },
  "/api/report-cards": { key: "reportCards", readUpdatedAt: (json) => json.updatedAt },
  "/api/mint-burn-flows": { key: "mintBurn", readUpdatedAt: (json) => json.updatedAt },
};

export function findFreshnessProblems(path, json, freshness, nowSec) {
  const budgetSec = freshness.producerIntervalSec * FRESHNESS_INTERVAL_MULTIPLIER;
  const problems = [];

  const updatedAt = freshness.readUpdatedAt(json);
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) {
    problems.push(`${path} exposes no publication timestamp to age-check`);
  } else {
    const ageSec = Math.round(nowSec - updatedAt);
    if (ageSec > budgetSec) {
      problems.push(`${path} was published ${ageSec}s ago, over the ${budgetSec}s budget (${FRESHNESS_INTERVAL_MULTIPLIER}x the ${freshness.producerIntervalSec}s producer interval)`);
    }
  }

  const meta = json._meta;
  if (isRecord(meta)) {
    if (meta.status !== "fresh" && meta.status !== "degraded") {
      problems.push(`${path} reports _meta.status ${JSON.stringify(meta.status)}`);
    }
    if (typeof meta.ageSeconds === "number" && Number.isFinite(meta.ageSeconds) && meta.ageSeconds > budgetSec) {
      problems.push(`${path} reports _meta.ageSeconds ${Math.round(meta.ageSeconds)}, over the ${budgetSec}s budget`);
    }
  }

  return problems;
}

// A finding the canary tolerates still has to reach somebody. On GitHub Actions
// that means a workflow command, which the runner lifts onto the run page and
// the checks API: a green scheduled run's log tail is a place nobody looks, so a
// warning printed only there is decoration.
export function annotated(finding, strict) {
  return process.env.GITHUB_ACTIONS === "true"
    ? `::${strict ? "error" : "warning"}::${finding}`
    : `- ${finding}`;
}

// Warning tier by default: report loudly, keep the canary green. Strict mode is
// the opt-in that turns the same findings into a failure.
export function reportFreshness(problems, strict, log = console.error) {
  if (problems.length === 0) return "fresh";
  log(`[smoke-live] data freshness ${strict ? "FAILED" : "WARNING"} (${problems.length}):`);
  for (const problem of problems) log(annotated(problem, strict));
  if (strict) {
    throw new Error(`[smoke-live] ${problems.length} stale endpoint(s) under --strict-freshness`);
  }
  return `${problems.length} freshness warning(s)`;
}

// Payload findings a validator wants an operator to see but the response
// contract permits. They must not fail the run by default — a schema-legal
// payload that reddens the canary every half hour trains the operator to ignore
// it — but --strict-freshness is that operator saying they have now watched the
// signal and want it enforced, so it covers these too.
export function reportPayloadWarnings(warnings, strict, log = console.error) {
  if (warnings.length === 0) return "payloads clean";
  log(`[smoke-live] payload ${strict ? "FAILED" : "WARNING"} (${warnings.length}):`);
  for (const warning of warnings) log(annotated(warning, strict));
  if (strict) {
    throw new Error(`[smoke-live] ${warnings.length} payload warning(s) under --strict-freshness`);
  }
  return `${warnings.length} payload warning(s)`;
}

export const endpointChecks = PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS.map((path) => {
  const validate = endpointValidatorsByPath[path];
  if (!validate) {
    throw new Error(`Missing smoke validator for allowlisted endpoint: ${path}`);
  }
  const source = freshnessSourcesByPath[path];
  if (!source) {
    throw new Error(`Missing smoke freshness source for allowlisted endpoint: ${path}`);
  }
  const producerIntervalSec = producerIntervalsByKey[source.key];
  if (!Number.isFinite(producerIntervalSec)) {
    throw new Error(`Endpoint registry has no producer interval for key: ${source.key}`);
  }
  return { path, validate, freshness: { ...source, producerIntervalSec } };
});

async function main() {
  const root = await expectOk("/");
  const rootContentType = root.headers.get("content-type") ?? "";
  assert(rootContentType.includes("text/html"), `/ returned non-HTML content-type: ${rootContentType || "missing"}`);

  const nowSec = Date.now() / 1000;
  const freshnessProblems = [];
  const payloadWarnings = [];
  for (const endpoint of endpointChecks) {
    const json = await expectJson(endpoint.path);
    payloadWarnings.push(...(endpoint.validate(json) ?? []));
    freshnessProblems.push(...findFreshnessProblems(endpoint.path, json, endpoint.freshness, nowSec));
  }

  for (const blocked of PHAROSVILLE_SMOKE_LIVE_BLOCKED_VARIANTS) {
    await expectBlocked(blocked.path, blocked.statuses, blocked.init);
  }

  const payloads = reportPayloadWarnings(payloadWarnings, strictFreshness);
  const freshness = reportFreshness(freshnessProblems, strictFreshness);
  console.log(`[smoke-live] ${base.toString()} OK (${endpointChecks.length} endpoints, ${PHAROSVILLE_SMOKE_LIVE_BLOCKED_VARIANTS.length} blocked variants, ${freshness}, ${payloads})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
