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
    expect(loggedLine(logSpy)).not.toContain("secret");
    expect(loggedLine(logSpy)).not.toContain("/path");
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
      code: "unknown",
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

it("reprojects before logging/KV and returns a ten-second Retry-After", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  stubEdgeCache();
  const kv = recordingKv();
  const context = makeContext(JSON.stringify({ category: "render", code: "shader-link", release: "v1.5.0", message: "秘密", stack: "Error: secret\n at https://example.com/assets/main.js?secret#hash:1:2", filename: "invalid?secret", ua: "raw agent" }), { env: { CLIENT_ERROR_KV: kv.CLIENT_ERROR_KV }, headers: { "user-agent": "raw agent" } });
  expect((await onRequest(context)).status).toBe(204);
  expect(loggedLine(spy)).toContain("shader-link");
  expect(kv.calls[0]!.value).not.toMatch(/秘密|secret|raw agent|filename/);
  const throttled = await onRequest(makeContext(JSON.stringify({ category: "render" })));
  expect(throttled.status).toBe(429);
  expect(throttled.headers.get("retry-after")).toBe("10");
});

it("enforces byte limits on multibyte streaming input and rejects invalid schemas", async () => {
  expect((await onRequest(makeContext(JSON.stringify({ category: "render", message: "界".repeat(1500) })))).status).toBe(413);
  expect((await onRequest(makeContext(JSON.stringify({ category: "invalid" })))).status).toBe(400);
});

it("reports storage configuration and failures only to synthetic callers", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const body = JSON.stringify({ category: "canary" });
  const headers = { "x-pharosville-canary": "1", "x-pharosville-canary-run": "offline-run-1" };
  const absent = await onRequest(makeContext(body, { headers }));
  expect(absent.status).toBe(204);
  expect(absent.headers.get("x-pharosville-storage")).toBe("not-configured");
  for (const put of [() => Promise.reject(new Error("private binding detail")), () => { throw new Error("private binding detail"); }]) {
    const env = { CLIENT_ERROR_KV: { put } };
    const failed = await onRequest(makeContext(body, { headers, env }));
    expect(failed.status).toBe(204);
    expect(failed.headers.get("x-pharosville-storage")).toBe("failed");
    expect([...failed.headers].join(" ")).not.toContain("private binding detail");
    const real = await onRequest(makeContext(body, { env }));
    expect(real.status).toBe(204);
    expect(real.headers.has("x-pharosville-storage")).toBe(false);
  }
});

it("puts the unique run token in a canary-only KV key, never the diagnostic record", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const kv = recordingKv();
  for (const token of ["offline-run-1", "offline-run-2"]) {
    const response = await onRequest(makeContext(JSON.stringify({ category: "canary" }), {
      env: { CLIENT_ERROR_KV: kv.CLIENT_ERROR_KV },
      headers: { "x-pharosville-canary": "1", "x-pharosville-canary-run": token },
    }));
    expect(response.status).toBe(204);
    expect(response.headers.get("x-pharosville-storage")).toBe("accepted");
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect(kv.calls.map(({ key }) => key)).toEqual(["PHAROSVILLE_CANARY_PROBE:run:offline-run-1", "PHAROSVILLE_CANARY_PROBE:run:offline-run-2"]);
  expect(kv.calls[0]?.value).not.toContain("offline-run");
  expect(kv.calls[0]?.options?.expirationTtl).toBe(30 * 24 * 60 * 60);
  const real = await onRequest(makeContext(JSON.stringify({ category: "render" }), { env: { CLIENT_ERROR_KV: kv.CLIENT_ERROR_KV }, headers: { "x-pharosville-canary-run": "offline-run-1" } }));
  expect(real.headers.has("x-pharosville-storage")).toBe(false);
  expect(kv.calls[2]?.key).toMatch(/^PHAROSVILLE_CLIENT_ERROR:/);
  expect(kv.calls[2]?.key).not.toContain("offline-run");
});

it.each(["", "a".repeat(81), "bad:token", "bad/token", "bad token"])("rejects invalid synthetic run token %j", async (token) => {
  const response = await onRequest(makeContext(JSON.stringify({ category: "canary" }), { headers: { "x-pharosville-canary": "1", "x-pharosville-canary-run": token } }));
  expect(response.status).toBe(400);
});

it("bounds a synthetic storage wait while real reports stay best-effort", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const pending: Promise<unknown>[] = [];
    const context = makeContext(JSON.stringify({ category: "canary" }), { env: { CLIENT_ERROR_KV: { put: () => new Promise<void>(() => {}) } }, headers: { "x-pharosville-canary": "1" } });
    const request = onRequest({ ...context, waitUntil: (promise) => pending.push(promise) });
    await vi.advanceTimersByTimeAsync(2_000);
    const response = await request;
    expect(response.status).toBe(204);
    expect(response.headers.get("x-pharosville-storage")).toBe("failed");
    expect(pending).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    const real = await onRequest(makeContext(JSON.stringify({ category: "render" }), { env: context.env ?? {} }));
    expect(real.status).toBe(204);
    expect(real.headers.has("x-pharosville-storage")).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
