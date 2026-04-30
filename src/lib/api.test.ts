import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiFetch, ApiPathError, apiFetchWithMeta } from "./api";

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
});
