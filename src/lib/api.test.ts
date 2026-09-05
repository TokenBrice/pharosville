import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiPathError, apiFetchWithMeta, SchemaValidationError } from "./api";

describe("apiFetchWithMeta path guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fetches same-origin /api/ paths", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    const { data } = await apiFetchWithMeta("/api/stablecoins?limit=1", z.object({ ok: z.boolean() }));

    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/stablecoins?limit=1", { signal: expect.any(AbortSignal) });
  });

  it.each([
    "https://api.pharos.watch/stablecoins",
    "http://localhost/api/stablecoins",
    "https://pharosville.local/api/stablecoins",
    "//api.pharos.watch/stablecoins",
    "/stablecoins",
    "api/stablecoins",
    "/_site-data/stablecoins",
    "/api",
    "/api/../health",
    "/api/%2e%2e/health",
    "/api/%2E%2E/health",
    "/api/%2e./health",
    "/%2e%2e/api/stablecoins",
  ])("rejects non same-origin API path %s", async (path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetchWithMeta(path)).rejects.toBeInstanceOf(ApiPathError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs schema drift once in warn mode and returns unvalidated data", async () => {
    const path = "/api/__warn-mode-drift-test";
    const payload = { name: "drift", count: "not-a-number" };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const schema = z.object({ name: z.string(), count: z.number() });

    const first = await apiFetchWithMeta(path, schema, undefined, 900, "warn");
    expect(first.data).toEqual(payload);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("schema drift");

    const second = await apiFetchWithMeta(path, schema, undefined, 900, "warn");
    expect(second.data).toEqual(payload);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it("extracts API metadata without loading the shared Zod metadata schema", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_012_000);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      _meta: {
        updatedAt: 1_700_000_000,
        ageSeconds: 12,
        status: "fresh",
        warning: null,
        dependencies: {
          dews: {
            updatedAt: null,
            ageSeconds: null,
            status: "unavailable",
            reason: "fixture",
          },
        },
      },
    })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetchWithMeta<{ ok: boolean }>("/api/custom-fixture");

    expect(result.data).toEqual({ ok: true });
    expect(result.meta).toEqual({
      updatedAt: 1_700_000_000,
      ageSeconds: 12,
      status: "fresh",
      warning: null,
      dependencies: {
        dews: {
          updatedAt: null,
          ageSeconds: null,
          status: "unavailable",
          reason: "fixture",
        },
      },
    });
  });

  it("rejects wrong-shaped endpoint JSON before world construction", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ chains: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetchWithMeta("/api/chains")).rejects.toBeInstanceOf(SchemaValidationError);
    expect(fetchMock).toHaveBeenCalledWith("/api/chains", { signal: expect.any(AbortSignal) });
  });
});

describe("bounded response consumption", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each(["timeout", "caller abort"])("settles a stalled JSON body on %s", async (kind) => {
    vi.useFakeTimers();
    const caller = new AbortController();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_path, init) => {
      signal = init.signal;
      return new Response(new ReadableStream({ start() {} }));
    }));
    const pending = apiFetchWithMeta("/api/fixture", undefined, { signal: caller.signal });
    const checked = expect(pending).rejects.toMatchObject({ name: kind === "timeout" ? "TimeoutError" : "AbortError" });
    await Promise.resolve();
    if (kind === "timeout") await vi.advanceTimersByTimeAsync(15_000);
    else caller.abort();
    await checked;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reconciles body and cache ages once, preserving upstream degradation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      ok: true, _meta: { updatedAt: 1_799_999_980, ageSeconds: 20, status: "degraded" },
    }, { headers: { "x-data-age": "40", age: "10" } })));
    const { meta } = await apiFetchWithMeta("/api/fixture");
    expect(meta).toMatchObject({ ageSeconds: 50, updatedAt: 1_799_999_950, status: "degraded" });
  });
});
