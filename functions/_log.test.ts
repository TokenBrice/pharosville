import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "./_log";

interface KvCall {
  key: string;
  value: string;
  options?: { expirationTtl?: number };
}

function makeContext(body: BodyInit | null, init?: {
  env?: { CLIENT_ERROR_KV?: { put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> } };
  headers?: HeadersInit;
  method?: string;
}) {
  return {
    ...(init?.env ? { env: init.env } : {}),
    request: new Request("https://pharosville.pharos.watch/_log", {
      body,
      headers: {
        "content-type": "application/json",
        origin: "https://pharosville.pharos.watch",
        ...init?.headers,
      },
      method: init?.method ?? "POST",
    }),
  };
}

function recordingKv(): { calls: KvCall[]; CLIENT_ERROR_KV: { put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> } } {
  const calls: KvCall[] = [];
  return {
    calls,
    CLIENT_ERROR_KV: {
      put: async (key, value, options) => {
        calls.push({ key, value, ...(options ? { options } : {}) });
      },
    },
  };
}

/** Stands in for the edge cache the rate limiter uses; absent under Node. */
function stubEdgeCache(): Map<string, Response> {
  const store = new Map<string, Response>();
  vi.stubGlobal("caches", {
    default: {
      match: async (request: Request) => store.get(request.url),
      put: async (request: Request, response: Response) => {
        store.set(request.url, response);
      },
    },
  });
  return store;
}

function loggedLine(spy: ReturnType<typeof vi.spyOn>): string {
  return String(spy.mock.calls[0]?.[0]);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("client log function", () => {
  it("accepts bounded same-origin JSON reports", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await onRequest(makeContext(JSON.stringify({
      category: "network",
      message: "fixture",
      ts: 1_700_000_000,
      url: "https://pharosville.pharos.watch/path?secret=redacted",
    })));

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(loggedLine(logSpy)).toContain("https://pharosville.pharos.watch/path");
  });

  it("logs a flat record behind a fixed greppable event token", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await onRequest(makeContext(JSON.stringify({
      category: "render",
      message: "context lost",
      ts: 1_700_000_000,
    })));

    const line = loggedLine(logSpy);
    expect(line.startsWith("PHAROSVILLE_CLIENT_ERROR ")).toBe(true);

    const record = JSON.parse(line.slice("PHAROSVILLE_CLIENT_ERROR ".length)) as Record<string, unknown>;
    // Queryable without unwrapping: the projected fields are top level, and the
    // old nested `payload` envelope is gone.
    expect(record).toMatchObject({
      category: "render",
      event: "PHAROSVILLE_CLIENT_ERROR",
      message: "context lost",
      ts: 1_700_000_000,
    });
    expect(record.payload).toBeUndefined();
  });

  it("marks canary probes with a token that real-error searches cannot match", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await onRequest(makeContext(
      JSON.stringify({ category: "canary", message: "synthetic canary probe" }),
      { headers: { "x-pharosville-canary": "1" } },
    ));

    expect(response.status).toBe(204);
    const line = loggedLine(logSpy);
    expect(line.startsWith("PHAROSVILLE_CANARY_PROBE ")).toBe(true);
    expect(line).not.toContain("PHAROSVILLE_CLIENT_ERROR");
  });

  // The marker is caller-declared, so claiming it must never be worth anything.
  // Namespacing the bucket by the marker made it worth exactly double: toggle
  // the header between requests and the same address got two budgets.
  it("never widens a caller's budget when it claims to be the canary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubEdgeCache();

    const post = (headers: HeadersInit) => onRequest(makeContext(
      JSON.stringify({ category: "canary", message: "synthetic canary probe" }),
      { headers: { "cf-connecting-ip": "203.0.113.7", ...headers } },
    ));

    expect((await post({ "x-pharosville-canary": "1" })).status).toBe(204);
    expect((await post({})).status).toBe(429);
    expect((await post({ "x-pharosville-canary": "1" })).status).toBe(429);
  });

  // `caches.default` is the CDN's own store: a key on a hostname this
  // deployment does not serve is not documented to be storable, and the write
  // that failed would be swallowed, leaving the limiter open with no sign of it.
  it("keys the rate limit in-zone, on the route the function itself refuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store = stubEdgeCache();

    await onRequest(makeContext(
      JSON.stringify({ category: "render", message: "real failure" }),
      { headers: { "cf-connecting-ip": "203.0.113.7" } },
    ));

    const [key] = [...store.keys()];
    expect(key).toBeDefined();
    const url = new URL(key!);
    expect(url.origin).toBe("https://pharosville.pharos.watch");
    // `/_log` answers every GET 405 with no-store, so this key can be neither
    // taken by an outside response nor mistaken for a served one.
    expect(url.pathname).toBe("/_log");
    expect(url.searchParams.get("rate-limit")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("says so out loud when the rate-limit write cannot land", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("caches", {
      default: {
        match: async () => undefined,
        put: async () => {
          throw new TypeError("Cannot cache this URL");
        },
      },
    });

    const response = await onRequest(makeContext(
      JSON.stringify({ category: "render", message: "real failure" }),
    ));
    expect(response.status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const failure = logSpy.mock.calls
      .map(([line]) => String(line))
      .find((line) => line.startsWith("PHAROSVILLE_EDGE_CACHE_FAILED "));
    expect(failure).toBeDefined();
    expect(failure).toContain("log-rate-limit");
    expect(failure).toContain("Cannot cache this URL");
  });

  // The marker is caller-declared, so it must buy nothing that reaches anyone
  // else. If it selected a bucket shared across callers, a stranger sending it
  // in a loop would hold that bucket open and 429 the CI canary probe.
  it("cannot spend another caller's budget by claiming to be the canary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubEdgeCache();

    const canaryFrom = (ip: string) => onRequest(makeContext(
      JSON.stringify({ category: "canary", message: "synthetic canary probe" }),
      { headers: { "cf-connecting-ip": ip, "x-pharosville-canary": "1" } },
    ));

    expect((await canaryFrom("198.51.100.9")).status).toBe(204);
    expect((await canaryFrom("198.51.100.9")).status).toBe(429);
    // The real probe, from its own address, is untouched by that flood.
    expect((await canaryFrom("203.0.113.7")).status).toBe(204);
  });

  it("stores a durable copy when the optional KV binding is present", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const kv = recordingKv();

    const response = await onRequest(makeContext(
      JSON.stringify({ category: "data-load", message: "world feed failed" }),
      { env: { CLIENT_ERROR_KV: kv.CLIENT_ERROR_KV } },
    ));

    expect(response.status).toBe(204);
    expect(kv.calls).toHaveLength(1);
    const [call] = kv.calls;
    expect(call?.key.startsWith("PHAROSVILLE_CLIENT_ERROR:")).toBe(true);
    expect(call?.options?.expirationTtl).toBe(30 * 24 * 60 * 60);
    expect(call?.value).toBe(loggedLine(logSpy));
  });

  it("still accepts and logs the report when the KV write fails", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await onRequest(makeContext(
      JSON.stringify({ category: "render", message: "kv down" }),
      {
        env: {
          CLIENT_ERROR_KV: {
            put: () => Promise.reject(new Error("KV unavailable")),
          },
        },
      },
    ));

    expect(response.status).toBe(204);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized reports even when content-length is absent", async () => {
    const response = await onRequest(makeContext(JSON.stringify({
      message: "x".repeat(5_000),
    })));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Payload too large" });
  });

  it("refuses the canary contract paths the workflow asserts", async () => {
    await expect(onRequest(makeContext(null, { method: "GET" })))
      .resolves.toMatchObject({ status: 405 });
    await expect(onRequest(makeContext(
      JSON.stringify({ category: "canary" }),
      { headers: { origin: "https://example.invalid" } },
    ))).resolves.toMatchObject({ status: 403 });
  });
});
