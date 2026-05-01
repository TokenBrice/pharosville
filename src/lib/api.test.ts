import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiFetch, ApiPathError, apiFetchWithMeta, SchemaValidationError } from "./api";

describe("apiFetch path guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches same-origin /api/ paths", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    const data = await apiFetch("/api/stablecoins?limit=1", z.object({ ok: z.boolean() }));

    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/stablecoins?limit=1", undefined);
  });

  it.each([
    "https://api.pharos.watch/stablecoins",
    "http://localhost/api/stablecoins",
    "//api.pharos.watch/stablecoins",
    "/stablecoins",
    "api/stablecoins",
    "/_site-data/stablecoins",
    "/api",
  ])("rejects non same-origin API path %s", async (path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch(path)).rejects.toBeInstanceOf(ApiPathError);
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

    const first = await apiFetch(path, schema, undefined, "warn");
    expect(first).toEqual(payload);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("schema drift");

    const second = await apiFetch(path, schema, undefined, "warn");
    expect(second).toEqual(payload);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it("extracts API metadata without loading the shared Zod metadata schema", async () => {
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

  it("loads known endpoint schemas for strict dev and test validation when no schema is passed", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ chains: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetchWithMeta("/api/chains")).rejects.toBeInstanceOf(SchemaValidationError);
    expect(fetchMock).toHaveBeenCalledWith("/api/chains", undefined);
  });
});
