import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PHAROSVILLE_API_CLIENT_ENDPOINTS } from "../../shared/lib/pharosville-api-client-contract";
import { RUNTIME_ACTIVE_IDS } from "../../shared/lib/stablecoins/runtime-registry";
import { PHAROSVILLE_API_ENDPOINT_PATHS } from "../../shared/lib/pharosville-api-endpoints";
import {
  PHAROSVILLE_PROXY_BLOCKED_VARIANTS,
  PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS,
  type PharosVilleSmokeBlockedVariant,
} from "../../shared/lib/pharosville-smoke-matrix";
import { onRequest } from "./[[path]]";
import { endpointProjector, type ProjectionJson } from "./_project";
import type { PharosVilleApiEndpointKey } from "../../shared/types/pharosville-endpoint-keys";
import { PHAROSVILLE_API_PAYLOAD_SCHEMAS } from "../../shared/types/pharosville";
import { isRenderableWorldPayload } from "../../src/lib/world-payload-guard";

function makeContext(url: string, init?: {
  env?: Record<string, string | undefined>;
  headers?: HeadersInit;
  method?: string;
  waitUntilPromises?: Promise<unknown>[];
}) {
  const requestInit: RequestInit = {
    method: init?.method ?? "GET",
  };
  if (init?.headers) requestInit.headers = init.headers;
  return {
    request: new Request(url, requestInit),
    env: {
      PHAROS_API_BASE: "https://api.pharos.watch",
      PHAROS_API_KEY: "test-proxy-key",
      ...init?.env,
    },
    params: {},
    ...(init?.waitUntilPromises
      ? { waitUntil: (promise: Promise<unknown>) => init.waitUntilPromises?.push(promise) }
      : {}),
  };
}

class MemoryEdgeCache {
  readonly putUrls: string[] = [];
  readonly responses = new Map<string, Response>();

  async match(request: Request): Promise<Response | undefined> {
    return this.responses.get(request.url)?.clone();
  }

  async put(request: Request, response: Response): Promise<void> {
    this.putUrls.push(request.url);
    this.responses.set(request.url, response.clone());
  }
}

function installEdgeCache(cache: MemoryEdgeCache): void {
  vi.stubGlobal("caches", { default: cache });
}

function isMethodBlockedVariant(
  variant: PharosVilleSmokeBlockedVariant,
): variant is PharosVilleSmokeBlockedVariant & { init: { method: "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" } } {
  return Boolean(variant.init?.method);
}

const PROXY_BLOCKED_METHOD_VARIANTS = PHAROSVILLE_PROXY_BLOCKED_VARIANTS.filter(isMethodBlockedVariant);
const PROXY_BLOCKED_QUERY_VARIANTS = PHAROSVILLE_PROXY_BLOCKED_VARIANTS.filter((variant) => !variant.init);
const UNLISTED_API_PATH = PROXY_BLOCKED_QUERY_VARIANTS.find((variant) => variant.path === "/api/health")?.path ?? "/api/health";
const NON_EXACT_ENDPOINT_QUERY_VARIANTS = PROXY_BLOCKED_QUERY_VARIANTS
  .filter((variant) => variant.path !== UNLISTED_API_PATH)
  .map((variant) => variant.path);


const projectionMeta = { updatedAt: 1_700_000_000, ageSeconds: 5, status: "degraded", warning: "fixture", dependencies: { test: { updatedAt: null, status: "unavailable" } } };
const projectionFixtures: Array<{ key: PharosVilleApiEndpointKey; input: ProjectionJson; expected: ProjectionJson }> = [
  {
    key: "stablecoins",
    input: { _meta: projectionMeta, fxFallbackRates: { USD: 1 }, peggedAssets: [{ id: "live-unregistered", name: "Fixture", symbol: "FIX", pegType: "peggedUSD", chains: ["Ethereum", "Unknown"], circulating: { peggedUSD: 100 }, circulatingPrevDay: { peggedUSD: 90 }, circulatingPrevWeek: null, circulatingPrevMonth: { peggedUSD: 70 }, chainCirculating: { Ethereum: { current: 100, circulatingPrevDay: 90 }, Unknown: { current: null }, Missing: null }, price: 1, geckoId: "fixture" }] },
    expected: { _meta: projectionMeta, peggedAssets: [{ id: "live-unregistered", name: "Fixture", symbol: "FIX", pegType: "peggedUSD", chains: ["Ethereum", "Unknown"], circulating: { peggedUSD: 100 }, circulatingPrevDay: { peggedUSD: 90 }, circulatingPrevWeek: null, circulatingPrevMonth: { peggedUSD: 70 }, chainCirculating: { Ethereum: { current: 100 }, Unknown: { current: null }, Missing: null } }] },
  },
  {
    key: "chains",
    input: { _meta: projectionMeta, globalTotalUsd: 100, globalChange7dPct: -2, chains: [{ id: "ethereum", name: "Ethereum", totalUsd: 100, healthScore: null, change24hPct: 1, change7dPct: -2, change30dPct: null, healthFactors: { quality: 1 }, topStablecoins: [] }] },
    expected: { _meta: projectionMeta, globalChange7dPct: -2, chains: [{ id: "ethereum", name: "Ethereum", totalUsd: 100, healthScore: null, change24hPct: 1, change7dPct: -2, change30dPct: null }] },
  },
  {
    key: "stability",
    input: { _meta: projectionMeta, current: { score: 80, band: "STEADY", avg24h: 79, components: { severity: 5, breadth: 3, stressBreadth: 2, trend: -10, extra: 999 }, contributors: [], computedAt: 100 }, history: [...Array.from({ length: 40 }, (_, i) => ({ date: 40 - i, score: 80 + i / 10, band: "STEADY", methodologyVersion: "v9" })), { date: 100, score: null }], methodology: {} },
    expected: { _meta: projectionMeta, current: { score: 80, band: "STEADY", avg24h: 79, components: { severity: 5, breadth: 3, stressBreadth: 2, trend: -10 } }, history: Array.from({ length: 30 }, (_, i) => ({ date: i + 11, score: 80 + (29 - i) / 10 })) },
  },
  {
    key: "pegSummary",
    input: { _meta: projectionMeta, coins: [{ id: "fixture", currentDeviationBps: null, activeDepeg: false, pegScore: null, pegReference: { valueUsd: 1, source: "median", contributorCount: 3, internal: true }, symbol: "FIX" }, { id: "unknown", currentDeviationBps: null, activeDepeg: false, pegScore: null, pegReference: null }], methodology: {}, summary: null },
    expected: { _meta: projectionMeta, coins: [{ id: "fixture", currentDeviationBps: null, activeDepeg: false, pegScore: null, pegReference: { valueUsd: 1, source: "median", contributorCount: 3 } }, { id: "unknown", currentDeviationBps: null, activeDepeg: false, pegScore: null, pegReference: null }] },
  },
  {
    key: "stress",
    input: { _meta: projectionMeta, updatedAt: 100, signals: { fixture: { score: 0, band: "UNKNOWN", computedAt: 100, signals: {} }, missing: null } },
    expected: { _meta: projectionMeta, signals: { fixture: { score: 0, band: "UNKNOWN" }, missing: null } },
  },
  {
    key: "mintBurn",
    input: { _meta: projectionMeta, gauge: { score: null }, hourly: [{ hourTs: 100, netFlowUsd: null, mintVolumeUsd: 0, burnVolumeUsd: 0, valuation: "partial" }, { hourTs: 200, netFlowUsd: 10, mintVolumeUsd: 20, burnVolumeUsd: 10 }], scope: { chainIds: ["ethereum"], label: "Scope" }, coins: [{ stablecoinId: "fixture", mintVolume24hUsd: 0, burnVolume24hUsd: 0, netFlow24hUsd: null, netFlow7dUsd: null, netFlow30dUsd: 100, coverage: { status: "unavailable", isPartial: true }, valuation: { window24h: { completeness: "partial" } } }] },
    expected: { _meta: projectionMeta, hourly: [{ hourTs: 100, netFlowUsd: null, mintVolumeUsd: 0, burnVolumeUsd: 0 }, { hourTs: 200, netFlowUsd: 10, mintVolumeUsd: 20, burnVolumeUsd: 10 }], scope: { chainIds: ["ethereum"] }, coins: [{ stablecoinId: "fixture", mintVolume24hUsd: 0, burnVolume24hUsd: 0, netFlow24hUsd: null, netFlow7dUsd: null, coverage: { status: "unavailable" } }] },
  },
];
describe("PharosVille API proxy", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(projectionFixtures)("preserves the complete $key world and panel fixture", ({ key, input, expected }) => {
    const original = structuredClone(input);
    const result = endpointProjector(key)(input);
    expect(result).toEqual(expected);
    expect(input).toEqual(original);
    expect(PHAROSVILLE_API_PAYLOAD_SCHEMAS[key].safeParse(result).success).toBe(true);
    expect(isRenderableWorldPayload(key, result)).toBe(true);
    expect(endpointProjector(key)(result)).toEqual(result);
  });

  it("retains stability's structural history when there is no current reading", () => {
    expect(endpointProjector("stability")({ current: null, history: [], _meta: null, methodology: {} }))
      .toEqual({ current: null, history: [], _meta: null });
  });

  it.each(["strong", "weak", "list", "wildcard", "mismatch"])("honours %s GET validators on projected misses and cache hits", async (kind) => {
    const cache = new MemoryEdgeCache();
    installEdgeCache(cache);
    const waitUntilPromises: Promise<unknown>[] = [];
    const url = "https://pharosville.pharos.watch/api/chains";
    const fixture = projectionFixtures.find((entry) => entry.key === "chains")!;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(fixture.input, {
      headers: { etag: '"upstream"', "x-data-age": "12", age: "7", warning: '199 - "fixture"', "cache-control": "public, max-age=60" },
    }));
    const first = await onRequest(makeContext(url, { waitUntilPromises }));
    const etag = first.headers.get("etag")!;
    await Promise.all(waitUntilPromises);
    const condition = kind === "strong" ? etag : kind === "weak" ? `W/${etag}` : kind === "list" ? `"other", W/${etag}` : kind === "wildcard" ? "*" : '"different"';
    for (const cached of [true, false]) {
      if (!cached) cache.responses.clear();
      const response = await onRequest(makeContext(url, { headers: { "if-none-match": condition }, waitUntilPromises }));
      expect(response.status).toBe(kind === "mismatch" ? 200 : 304);
      expect(response.headers.get("etag")).toBe(etag);
      expect(response.headers.get("x-data-age")).toBe("12");
      expect(response.headers.get("age")).toBe("7");
      expect(response.headers.get("warning")).toBe('199 - "fixture"');
      expect(response.headers.get("cache-control")).toBe("public, max-age=60");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      if (kind !== "mismatch") {
        expect(response.body).toBeNull();
        expect(await response.text()).toBe("");
      } else await expect(response.json()).resolves.toEqual(fixture.expected);
      await Promise.all(waitUntilPromises);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Cache always stores the complete 200 body, never the conditional 304.
    expect((await cache.match(new Request(url)))?.status).toBe(200);
  });

  it("derives validators from projected bytes rather than upstream ETags", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const bodies = [
      { chains: [], globalChange7dPct: 1, extra: "a" },
      { chains: [], globalChange7dPct: 1, extra: "b" },
      { chains: [], globalChange7dPct: 2, extra: "b" },
    ];
    const tags: Array<string | null> = [];
    for (const body of bodies) {
      fetchMock.mockResolvedValueOnce(Response.json(body, { headers: { etag: 'W/"unchanged-upstream"' } }));
      const response = await onRequest(makeContext("https://pharosville.pharos.watch/api/chains"));
      tags.push(response.headers.get("etag"));
    }
    expect(tags[0]).toMatch(/^"pv1-[a-f0-9]{64}"$/);
    expect(tags[1]).toBe(tags[0]);
    expect(tags[2]).not.toBe(tags[0]);
  });

  it("upgrades an old cached representation before comparing validators", async () => {
    const cache = new MemoryEdgeCache();
    installEdgeCache(cache);
    const fixture = projectionFixtures.find((entry) => entry.key === "chains")!;
    const url = "https://pharosville.pharos.watch/api/chains";
    await cache.put(new Request(url), Response.json(fixture.input, { headers: { etag: '"old-upstream"', "x-data-age": "9" } }));
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequest(makeContext(url, { headers: { "if-none-match": '"old-upstream"' } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toMatch(/^"pv1-[a-f0-9]{64}"$/);
    await expect(response.json()).resolves.toEqual(fixture.expected);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["fetch-error", "5xx"].flatMap((failure) => (
    ["strong", "weak", "list", "wildcard"].map((validator) => ({ failure, validator }))
  )))("sends the full stale body after $failure with a $validator validator without counting Age twice", async ({ failure, validator }) => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const cache = new MemoryEdgeCache();
    installEdgeCache(cache);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const url = "https://pharosville.pharos.watch/api/chains";
    const fixture = projectionFixtures.find((entry) => entry.key === "chains")!;
    const waitUntilPromises: Promise<unknown>[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(fixture.input, { headers: { "x-data-age": "12", age: "7" } }));
    const first = await onRequest(makeContext(url, { waitUntilPromises }));
    await Promise.all(waitUntilPromises);
    cache.responses.delete(url);
    const lastGoodUrl = "https://pharosville.pharos.watch/api/__last-good/api/chains";
    const stored = (await cache.match(new Request(lastGoodUrl)))!;
    const headers = new Headers(stored.headers);
    headers.set("age", "3600");
    headers.set("x-pharosville-last-good-stored-at", String(Math.floor(Date.now() / 1000) - 3600));
    await cache.put(new Request(lastGoodUrl), new Response(stored.body, { headers }));
    if (failure === "fetch-error") fetchMock.mockRejectedValueOnce(new Error("upstream down"));
    else fetchMock.mockResolvedValueOnce(Response.json({ error: "upstream unavailable" }, { status: 503 }));
    const etag = first.headers.get("etag")!;
    const condition = validator === "strong" ? etag : validator === "weak" ? `W/${etag}` : validator === "list" ? `"other", W/${etag}` : "*";
    const response = await onRequest(makeContext(url, { headers: { "if-none-match": condition } }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(fixture.expected);
    expect(response.headers.get("etag")).toBe(etag);
    expect(response.headers.get("warning")).toBe('110 - "Response is stale"');
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Number(response.headers.get("x-data-age")) + Number(response.headers.get("age"))).toBe(3619);
    expect(response.headers.get("x-pharosville-last-good-base-age")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("keeps the proxy allowlist in sync with the lightweight PharosVille API client contract", () => {
    expect(PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS).toEqual(
      PHAROSVILLE_API_CLIENT_ENDPOINTS.map((endpoint) => endpoint.path),
    );
    expect(PHAROSVILLE_API_ENDPOINT_PATHS).toEqual(PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS);
  });

  it.each(PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS)("proxies the allowed endpoint %s", async (endpointPath) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        statusText: "OK",
        headers: {
          "cache-control": "public, max-age=60",
          "content-type": "application/json",
          etag: "\"fixture\"",
          "retry-after": "15",
          warning: "199 proxy fixture",
          "x-data-age": "12",
        },
      }),
    );

    const response = await onRequest(makeContext(`https://pharosville.pharos.watch${endpointPath}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("etag")).toMatch(/^"pv1-[a-f0-9]{64}"$/);
    expect(response.headers.get("retry-after")).toBe("15");
    expect(response.headers.get("warning")).toBe("199 proxy fixture");
    expect(response.headers.get("x-data-age")).toBe("12");
    expect(response.headers.get("x-pharosville-proxy")).toBe("1");
    // The deploy verifier checks API responses against the same policy as the
    // static pages; a Function that drifts from `public/_headers` fails the deploy.
    const staticPolicy = readFileSync(resolve(__dirname, "../../public/_headers"), "utf8")
      .match(/^\s*Permissions-Policy:\s*(.+)$/m)?.[1]?.trim();
    expect(staticPolicy).toBeTruthy();
    expect(response.headers.get("permissions-policy")).toBe(staticPolicy);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.pharos.watch${endpointPath}`,
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          "X-API-Key": "test-proxy-key",
        },
        redirect: "manual",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("stores successful JSON responses in the edge cache using a path-only cache key", async () => {
    const cache = new MemoryEdgeCache();
    const waitUntilPromises: Promise<unknown>[] = [];
    installEdgeCache(cache);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-data-age": "5",
        },
      }),
    );

    const response = await onRequest(makeContext("https://preview.example.com/api/stablecoins", {
      waitUntilPromises,
    }));
    await Promise.all(waitUntilPromises);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=600");
    expect(cache.putUrls).toEqual([
      "https://pharosville.pharos.watch/api/stablecoins",
      "https://pharosville.pharos.watch/api/__last-good/api/stablecoins",
    ]);
    expect(cache.putUrls.join(" ")).not.toContain("test-proxy-key");
    await expect(cache.match(new Request("https://pharosville.pharos.watch/api/stablecoins")))
      .resolves.toBeInstanceOf(Response);
  });

  it("serves edge cache hits without calling upstream", async () => {
    const cache = new MemoryEdgeCache();
    installEdgeCache(cache);
    await cache.put(
      new Request("https://pharosville.pharos.watch/api/stablecoins"),
      new Response(JSON.stringify({ cached: true }), {
        status: 200,
        headers: {
          "cache-control": "public, max-age=600",
          "content-type": "application/json",
          "x-pharosville-proxy": "1",
        },
      }),
    );
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await onRequest(makeContext("https://pharosville.pharos.watch/api/stablecoins"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ cached: true });
    expect(response.headers.get("x-pharosville-proxy")).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not cache non-200 or non-JSON upstream responses", async () => {
    const cache = new MemoryEdgeCache();
    const waitUntilPromises: Promise<unknown>[] = [];
    installEdgeCache(cache);
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "upstream unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("plain text", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      );

    const non200 = await onRequest(makeContext("https://pharosville.pharos.watch/api/stablecoins", {
      waitUntilPromises,
    }));
    const nonJson = await onRequest(makeContext("https://pharosville.pharos.watch/api/chains", {
      waitUntilPromises,
    }));
    await Promise.all(waitUntilPromises);

    expect(non200.status).toBe(503);
    expect(nonJson.status).toBe(200);
    expect(cache.putUrls).toEqual([]);
  });

  it("keeps the server-side API key out of responses and edge cache keys", async () => {
    const cache = new MemoryEdgeCache();
    const waitUntilPromises: Promise<unknown>[] = [];
    installEdgeCache(cache);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "session=leak",
          "x-api-key": "test-proxy-key",
        },
      }),
    );

    const response = await onRequest(makeContext("https://pharosville.pharos.watch/api/stablecoins", {
      waitUntilPromises,
    }));
    const body = await response.text();
    await Promise.all(waitUntilPromises);

    expect(body).not.toContain("test-proxy-key");
    expect(response.headers.get("x-api-key")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(cache.putUrls).toEqual([
      "https://pharosville.pharos.watch/api/stablecoins",
      "https://pharosville.pharos.watch/api/__last-good/api/stablecoins",
    ]);
    expect(cache.putUrls.join(" ")).not.toContain("test-proxy-key");
    const lastGood = await cache.match(new Request("https://pharosville.pharos.watch/api/__last-good/api/stablecoins"));
    expect(await lastGood?.text()).not.toContain("test-proxy-key");
    expect([...lastGood!.headers.keys()]).not.toContain("x-api-key");
  });

  it("rejects unlisted API paths before upstream fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequest(makeContext(`https://pharosville.pharos.watch${UNLISTED_API_PATH}`));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();

  });

  it.each(NON_EXACT_ENDPOINT_QUERY_VARIANTS)("rejects non-exact endpoint query %s before upstream fetch", async (endpointPath) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequest(makeContext(`https://pharosville.pharos.watch${endpointPath}`));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(PROXY_BLOCKED_METHOD_VARIANTS.map((variant) => variant.init.method))("rejects %s requests with 405", async (method) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequest(makeContext("https://pharosville.pharos.watch/api/stablecoins", { method }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { name: "base", env: { PHAROS_API_BASE: undefined } },
    { name: "API key", env: { PHAROS_API_KEY: undefined } },
    { name: "blank base", env: { PHAROS_API_BASE: "" } },
    { name: "blank API key", env: { PHAROS_API_KEY: "  " } },
  ])("fails closed when the Pages $name env is missing", async ({ env }) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequest(makeContext("https://pharosville.pharos.watch/api/stablecoins", {
      env,
    }));

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "http://api.pharos.watch",
    "https://www.api.pharos.watch",
    "https://api.pharos.watch.evil.example",
    "https://api.pharos.watch.",
    "https://user@api.pharos.watch",
    "https://api-key:secret@api.pharos.watch",
    "https://api.pharos.watch:443",
    "https://api.pharos.watch/",
    "https://api.pharos.watch/v1",
    "https://api.pharos.watch?debug=1",
    "https://api.pharos.watch#fragment",
  ])("rejects invalid PHAROS_API_BASE %s before attaching the API key", async (base) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequest(makeContext("https://pharosville.pharos.watch/api/stablecoins", {
      env: { PHAROS_API_BASE: base },
    }));

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not forward incoming request credentials and filters upstream response headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "session=leak",
          "x-api-key": "upstream-secret",
          "x-internal-trace": "trace-id",
        },
      }),
    );

    const response = await onRequest(makeContext("https://pharosville.pharos.watch/api/stablecoins", {
      headers: {
        Authorization: "Bearer browser-token",
        Cookie: "client=secret",
        "X-API-Key": "client-key",
      },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-api-key")).toBeNull();
    expect(response.headers.get("x-internal-trace")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.pharos.watch/api/stablecoins",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          "X-API-Key": "test-proxy-key",
        },
      }),
    );
  });

  it("returns a controlled 502 when upstream fetch fails", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("sensitive upstream detail"));

    const response = await onRequest(makeContext("https://pharosville.pharos.watch/api/stablecoins"));
    const body = await response.text();
    const logEntry = JSON.parse(String(logSpy.mock.calls[0]?.[0]));

    expect(response.status).toBe(502);
    expect(body).toContain("PharosVille API upstream request failed");
    expect(body).not.toContain("sensitive upstream detail");
    expect(logEntry).toMatchObject({
      source: "pharosville-api-proxy",
      event: "upstream_fetch_failed",
      level: "error",
      status: 502,
      errorKind: "fetch-error",
      endpointPath: "/api/stablecoins",
      upstreamOrigin: "https://api.pharos.watch",
    });
    expect(logEntry.durationMs).toEqual(expect.any(Number));
    expect(JSON.stringify(logEntry)).not.toContain("sensitive upstream detail");
  });

  it("aborts slow upstream fetches and returns a controlled 502", async () => {
    vi.useFakeTimers();
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementationOnce((_url, init) => {
      const signal = (init as RequestInit).signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });

    const responsePromise = onRequest(makeContext("https://pharosville.pharos.watch/api/stablecoins"));
    await vi.advanceTimersByTimeAsync(8_000);
    const response = await responsePromise;
    const body = await response.text();
    const logEntry = JSON.parse(String(logSpy.mock.calls[0]?.[0]));

    expect(response.status).toBe(502);
    expect(body).toContain("PharosVille API upstream request failed");
    expect(logEntry).toMatchObject({
      source: "pharosville-api-proxy",
      event: "upstream_timeout",
      level: "error",
      status: 502,
      errorKind: "timeout",
      endpointPath: "/api/stablecoins",
      upstreamOrigin: "https://api.pharos.watch",
      timeoutMs: 8_000,
    });
    expect(logEntry.durationMs).toEqual(expect.any(Number));
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.pharos.watch/api/stablecoins",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("projects safety grades down to the contract the app actually reads", async () => {
    const activeId = [...RUNTIME_ACTIVE_IDS][0]!;
    const upstream = {
      model: "v9",
      methodologyVersion: "9.8",
      asOfSec: 1_700_000_000,
      updatedAt: 1_700_000_000,
      publicationStatus: "current",
      _meta: { updatedAt: 1_700_000_000, ageSeconds: 5, status: "fresh" },
      grades: [
        { id: activeId, score: 80, grade: "A-" },
        { id: "not-a-tracked-stablecoin", score: 12, grade: "F" },
        { score: 55, grade: "C" },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(upstream), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await onRequest(makeContext("https://preview.example.com/api/safety-grades"));
    const body = await response.json() as typeof upstream;

    // Grades outside the runtime active set can never be reached: `grades` has
    // one consumer and it only ever indexes by an id that passed
    // RUNTIME_ACTIVE_IDS. Malformed rows are dropped rather than forwarded.
    expect(body.grades).toHaveLength(1);
    expect(body.grades[0]?.id).toBe(activeId);
    expect(body.grades[0]).toEqual({ id: activeId, grade: "A-" });
    expect(body.updatedAt).toBeUndefined();
    expect(body.model).toBeUndefined();
    expect(body.methodologyVersion).toBeUndefined();
    expect(body._meta).toEqual({ updatedAt: 1_700_000_000, ageSeconds: 5, status: "fresh" });
    expect(PHAROSVILLE_API_PAYLOAD_SCHEMAS.safetyGrades.safeParse(body).success).toBe(true);
    expect(isRenderableWorldPayload("safetyGrades", body)).toBe(true);
  });

  it.each(["stalled", "interrupted", "truncated"])("serves last-good after a %s projected body", async (kind) => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cache = new MemoryEdgeCache();
    installEdgeCache(cache);
    const url = "https://pharosville.pharos.watch/api/safety-grades";
    await cache.put(new Request("https://pharosville.pharos.watch/api/__last-good/api/safety-grades"), Response.json({ grades: [] }, {
      headers: { "x-pharosville-last-good-stored-at": String(Math.floor(Date.now() / 1000)), "x-data-age": "5" },
    }));
    const stream = new ReadableStream({ start(controller) {
      if (kind === "interrupted") controller.error(new Error("body interrupted"));
    } });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(kind === "truncated" ? '{"grades":[' : stream, {
      headers: { "content-type": "application/json" },
    }));
    const pending = onRequest(makeContext(url));
    if (kind === "stalled") await vi.advanceTimersByTimeAsync(8_000);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.headers.get("warning")).toContain("110");
    await expect(response.json()).resolves.toEqual({ grades: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("continues upstream after a normal cache read rejection and reports write rejection", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const waiting: Promise<unknown>[] = [];
    installEdgeCache({ match: async () => { throw new Error("cache unavailable"); }, put: async () => { throw new Error("cache unavailable"); } } as unknown as MemoryEdgeCache);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ ok: true }));
    const response = await onRequest(makeContext("https://pharosville.pharos.watch/api/chains", { waitUntilPromises: waiting }));
    await Promise.all(waiting);
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(log.mock.calls.flat().join(" ")).toContain("normal-read");
    expect(log.mock.calls.flat().join(" ")).toContain("normal-write");
    expect(log.mock.calls.flat().join(" ")).not.toContain("test-proxy-key");
  });

  describe("last-good fallback", () => {
    const SHORT_TTL_URL = "https://pharosville.pharos.watch/api/stablecoins";
    const LAST_GOOD_URL = "https://pharosville.pharos.watch/api/__last-good/api/stablecoins";

    // The long-TTL copy shares `caches.default` with the CDN, so both halves
    // matter: the key has to be in-zone or the write is not documented to land
    // at all, and the prefix has to be refused or a miss on it would let the
    // response to that stray request take the key for the next 24 hours.
    it("keys the last-good copy in-zone, under a prefix the proxy refuses", async () => {
      const cache = new MemoryEdgeCache();
      const waitUntilPromises: Promise<unknown>[] = [];
      installEdgeCache(cache);
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      await onRequest(makeContext(SHORT_TTL_URL, { waitUntilPromises }));
      await Promise.all(waitUntilPromises);

      expect(cache.putUrls.every((putUrl) => new URL(putUrl).origin === "https://pharosville.pharos.watch"))
        .toBe(true);
      expect(cache.putUrls).toEqual([SHORT_TTL_URL, LAST_GOOD_URL]);
    });

    it("refuses the reserved prefix with no-store, so no caller can take the key", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const response = await onRequest(makeContext(LAST_GOOD_URL));

      expect(response.status).toBe(404);
      // Without this the refusal itself would be cacheable onto the key, which
      // is the exact failure the reserved prefix exists to prevent.
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reports a last-good write that cannot land instead of swallowing it", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const waitUntilPromises: Promise<unknown>[] = [];
      installEdgeCache({
        match: async () => undefined,
        put: async (request: Request) => {
          if (request.url === LAST_GOOD_URL) throw new TypeError("Cannot cache this URL");
        },
      } as unknown as MemoryEdgeCache);
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      await onRequest(makeContext(SHORT_TTL_URL, { waitUntilPromises }));
      await Promise.all(waitUntilPromises);

      const failure = errorSpy.mock.calls
        .map(([line]) => String(line))
        .find((line) => line.startsWith("PHAROSVILLE_EDGE_CACHE_FAILED "));
      expect(failure).toContain("last-good-write");
      expect(failure).toContain("Cannot cache this URL");
    });

    /** Runs one successful request so the long-TTL copy exists, then evicts the
     * short-TTL entry the way its `max-age` would have. */
    async function primeLastGood(cache: MemoryEdgeCache): Promise<void> {
      const waitUntilPromises: Promise<unknown>[] = [];
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ generation: "last-good" }), {
          status: 200,
          headers: { "content-type": "application/json", "x-data-age": "5" },
        }),
      );
      await onRequest(makeContext(SHORT_TTL_URL, { waitUntilPromises }));
      await Promise.all(waitUntilPromises);
      cache.responses.delete(SHORT_TTL_URL);
    }

    it("stores the last-good copy under a long TTL", async () => {
      const cache = new MemoryEdgeCache();
      installEdgeCache(cache);
      await primeLastGood(cache);

      const stored = await cache.match(new Request(LAST_GOOD_URL));
      expect(stored?.headers.get("cache-control")).toBe("public, max-age=86400");
      await expect(stored?.json()).resolves.toEqual({ generation: "last-good" });
    });

    it("serves the last-good copy with stale markers when the upstream fetch fails", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-26T00:00:00Z"));
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const cache = new MemoryEdgeCache();
      installEdgeCache(cache);
      await primeLastGood(cache);

      vi.setSystemTime(new Date("2026-07-26T01:00:00Z"));
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("upstream down"));
      const response = await onRequest(makeContext(SHORT_TTL_URL));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ generation: "last-good" });
      // `110` is the marker src/lib/api.ts reads to demote the payload out of `fresh`.
      expect(response.headers.get("warning")).toBe('110 - "Response is stale"');
      // The copy's own 5s of age plus the hour it spent in the edge cache.
      expect(response.headers.get("x-data-age")).toBe("3605");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-pharosville-proxy")).toBe("1");
    });

    it("serves the last-good copy when upstream answers 5xx", async () => {
      const cache = new MemoryEdgeCache();
      installEdgeCache(cache);
      await primeLastGood(cache);

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "upstream unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      );
      const response = await onRequest(makeContext(SHORT_TTL_URL));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ generation: "last-good" });
      expect(response.headers.get("warning")).toBe('110 - "Response is stale"');
    });

    it("still forwards a 4xx, which answers the request rather than reporting an outage", async () => {
      const cache = new MemoryEdgeCache();
      installEdgeCache(cache);
      await primeLastGood(cache);

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "bad request" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      );
      const response = await onRequest(makeContext(SHORT_TTL_URL));

      expect(response.status).toBe(400);
    });

    it("returns the honest 502 once the last-good copy is past the staleness cap", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-26T00:00:00Z"));
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const cache = new MemoryEdgeCache();
      installEdgeCache(cache);
      await primeLastGood(cache);

      vi.setSystemTime(new Date("2026-07-27T00:00:01Z"));
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("upstream down"));
      const response = await onRequest(makeContext(SHORT_TTL_URL));

      expect(response.status).toBe(502);
      await expect(response.text()).resolves.toContain("PharosVille API upstream request failed");
    });

    // Body parsing and projection share the upstream deadline. A truncated
    // response must never become the copy served during a later outage.
    it("refuses to pin a 200 whose body is not parseable JSON", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const cache = new MemoryEdgeCache();
      const waitUntilPromises: Promise<unknown>[] = [];
      installEdgeCache(cache);
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response('{"peggedAssets":[', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const served = await onRequest(makeContext(SHORT_TTL_URL, { waitUntilPromises }));
      await Promise.all(waitUntilPromises);

      // Invalid JSON is a controlled upstream failure, never a live body.
      expect(served.status).toBe(502);
      await expect(cache.match(new Request(LAST_GOOD_URL))).resolves.toBeUndefined();

      cache.responses.delete(SHORT_TTL_URL);
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("upstream down"));
      const duringOutage = await onRequest(makeContext(SHORT_TTL_URL));

      expect(duringOutage.status).toBe(502);
      expect(duringOutage.headers.get("warning")).toBeNull();
    });

    it("returns the 502 when no last-good copy exists", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      installEdgeCache(new MemoryEdgeCache());
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("upstream down"));

      const response = await onRequest(makeContext(SHORT_TTL_URL));

      expect(response.status).toBe(502);
      expect(response.headers.get("warning")).toBeNull();
    });
  });

  it("rejects malformed JSON instead of forwarding a broken projected payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not json at all", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await onRequest(makeContext("https://preview.example.com/api/safety-grades"));

    expect(response.status).toBe(502);
  });
});
