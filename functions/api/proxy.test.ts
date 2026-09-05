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

describe("PharosVille API proxy", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
    expect(response.headers.get("etag")).toBe("\"fixture\"");
    expect(response.headers.get("retry-after")).toBe("15");
    expect(response.headers.get("warning")).toBe("199 proxy fixture");
    expect(response.headers.get("x-data-age")).toBe("12");
    expect(response.headers.get("x-pharosville-proxy")).toBe("1");
    expect(response.headers.get("permissions-policy")).toContain("display-capture=()");
    expect(response.headers.get("permissions-policy")).toContain("screen-wake-lock=()");
    expect(response.headers.get("permissions-policy")).toContain("serial=()");
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

  it("projects report cards down to the contract the app actually reads", async () => {
    const activeId = [...RUNTIME_ACTIVE_IDS][0]!;
    const upstream = {
      updatedAt: 1_700_000_000,
      safetyScoreIdentity: { model: "v8" },
      _meta: { updatedAt: 1_700_000_000, ageSeconds: 5, status: "fresh" },
      cards: [
        {
          id: activeId,
          symbol: "ACTIVE",
          overallGrade: "A",
          dimensions: {
            pegStability: {
              grade: "A",
              score: 90,
              detail: "Peg score: 90/100",
              detailItems: [{ label: "Peg score", value: "90/100", detail: "Peg score: 90/100" }],
            },
          },
          rawInputs: { bluechipGrade: "B" },
        },
        { id: "not-a-tracked-stablecoin", symbol: "GONE", overallGrade: "F", dimensions: {} },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(upstream), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await onRequest(makeContext("https://preview.example.com/api/report-cards"));
    const body = await response.json() as typeof upstream;

    // Cards outside the runtime active set can never be reached: `cards` has one
    // consumer and it only ever indexes by an id that passed RUNTIME_ACTIVE_IDS.
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]?.id).toBe(activeId);
    // `detailItems` is not in ReportCardDimensionSchema, so Zod already strips
    // it client-side — sending it is pure transfer and parse cost.
    expect(body.cards[0]?.dimensions.pegStability).toEqual({
      grade: "A",
      score: 90,
      detail: "Peg score: 90/100",
    });
    // Everything the contract does model survives, `_meta` included.
    expect(body.cards[0]?.rawInputs).toEqual({ bluechipGrade: "B" });
    expect(body.updatedAt).toBe(1_700_000_000);
    expect(body.safetyScoreIdentity).toEqual({ model: "v8" });
    expect(body._meta).toEqual({ updatedAt: 1_700_000_000, ageSeconds: 5, status: "fresh" });
  });

  it.each(["stalled", "interrupted", "truncated"])("serves last-good after a %s projected body", async (kind) => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cache = new MemoryEdgeCache();
    installEdgeCache(cache);
    const url = "https://pharosville.pharos.watch/api/report-cards";
    await cache.put(new Request("https://pharosville.pharos.watch/api/__last-good/api/report-cards"), Response.json({ cards: [] }, {
      headers: { "x-pharosville-last-good-stored-at": String(Math.floor(Date.now() / 1000)), "x-data-age": "5" },
    }));
    const stream = new ReadableStream({ start(controller) {
      if (kind === "interrupted") controller.error(new Error("body interrupted"));
    } });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(kind === "truncated" ? '{"cards":[' : stream, {
      headers: { "content-type": "application/json" },
    }));
    const pending = onRequest(makeContext(url));
    if (kind === "stalled") await vi.advanceTimersByTimeAsync(8_000);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.headers.get("warning")).toContain("110");
    await expect(response.json()).resolves.toEqual({ cards: [] });
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

    // `/api/stablecoins` has no projector, so nothing else on this path ever
    // parses the body: without this check a truncated or mislabelled 200 becomes
    // the copy a later outage promotes to "the answer" under Warning: 110.
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

      // Still forwarded live — the edge does not judge a body it was asked to relay.
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

    const response = await onRequest(makeContext("https://preview.example.com/api/report-cards"));

    expect(response.status).toBe(502);
  });
});
