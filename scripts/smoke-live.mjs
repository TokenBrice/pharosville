#!/usr/bin/env node

const args = process.argv.slice(2);
let baseUrl = process.env.SMOKE_UI_URL ?? "https://pharosville.pharos.watch";
let timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 10_000);

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--url" && args[index + 1]) {
    baseUrl = args[index + 1];
    index += 1;
  } else if (args[index] === "--timeout-ms" && args[index + 1]) {
    timeoutMs = Number(args[index + 1]);
    index += 1;
  }
}

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error(`Invalid smoke timeout: ${timeoutMs}`);
}

const base = new URL(baseUrl);
base.pathname = "/";
base.search = "";
base.hash = "";

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
      throw new Error(`${url.toString()} timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}

async function expectOk(path, init) {
  const response = await smokeFetch(path, init);
  if (!response.ok) {
    throw new Error(`${new URL(path, base).toString()} returned ${response.status}`);
  }
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

const endpointChecks = [
  {
    path: "/api/stablecoins",
    validate(json) {
      assertArray(json.peggedAssets, "stablecoins.peggedAssets", { nonEmpty: true });
    },
  },
  {
    path: "/api/chains",
    validate(json) {
      assertArray(json.chains, "chains.chains", { nonEmpty: true });
      assertNumber(json.updatedAt, "chains.updatedAt");
    },
  },
  {
    path: "/api/stability-index?detail=true",
    validate(json) {
      assert(json.current === null || isRecord(json.current), "stability.current must be null or an object");
      assertArray(json.history, "stability.history");
      assert(isRecord(json.methodology), "stability.methodology must be an object");
    },
  },
  {
    path: "/api/peg-summary",
    validate(json) {
      assertArray(json.coins, "pegSummary.coins", { nonEmpty: true });
      assert(json.summary === null || isRecord(json.summary), "pegSummary.summary must be null or an object");
      assert(isRecord(json.methodology), "pegSummary.methodology must be an object");
    },
  },
  {
    path: "/api/stress-signals",
    validate(json) {
      assert(isRecord(json.signals), "stress.signals must be an object");
      assertNumber(json.updatedAt, "stress.updatedAt");
      assert(isRecord(json.methodology), "stress.methodology must be an object");
    },
  },
  {
    path: "/api/report-cards",
    validate(json) {
      assertArray(json.cards, "reportCards.cards", { nonEmpty: true });
      assert(isRecord(json.methodology), "reportCards.methodology must be an object");
      assert(isRecord(json.dependencyGraph), "reportCards.dependencyGraph must be an object");
      assertNumber(json.updatedAt, "reportCards.updatedAt");
    },
  },
];

const blockedChecks = [
  { path: "/api/health", statuses: [404] },
  { path: "/api/stability-index", statuses: [404] },
  { path: "/api/stability-index?detail=false", statuses: [404] },
  { path: "/api/stability-index?detail=true&extra=1", statuses: [404] },
  { path: "/api/stablecoins?detail=true", statuses: [404] },
  { path: "/api/report-cards?foo=bar", statuses: [404] },
  { path: "/api/stablecoins", statuses: [405], init: { method: "POST" } },
];

async function main() {
  const root = await expectOk("/");
  const rootContentType = root.headers.get("content-type") ?? "";
  assert(rootContentType.includes("text/html"), `/ returned non-HTML content-type: ${rootContentType || "missing"}`);

  for (const endpoint of endpointChecks) {
    const json = await expectJson(endpoint.path);
    endpoint.validate(json);
  }

  for (const blocked of blockedChecks) {
    await expectBlocked(blocked.path, blocked.statuses, blocked.init);
  }

  console.log(`[smoke-live] ${base.toString()} OK (${endpointChecks.length} endpoints, ${blockedChecks.length} blocked variants)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
