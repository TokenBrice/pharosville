import { describe, expect, it, vi } from "vitest";
import { onRequest } from "./[[path]]";

function makeContext(url: string, init?: {
  env?: Record<string, string | undefined>;
  method?: string;
}) {
  return {
    request: new Request(url, { method: init?.method ?? "GET" }),
    env: {
      PHAROS_API_BASE: "https://api.pharos.watch",
      PHAROS_API_KEY: "ph_live_0123456789abcdef_abcdefghijklmnopqrstuvwxyzABCDEF",
      ...init?.env,
    },
    params: {},
  };
}

describe("PharosVille API proxy", () => {
  it("injects the Pages secret as X-API-Key for allowed endpoints", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=60",
          "x-data-age": "12",
        },
      }),
    );

    const response = await onRequest(makeContext("https://pharosville.pharos.watch/api/stability-index?detail=true"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-data-age")).toBe("12");
    expect(response.headers.get("x-pharosville-proxy")).toBe("1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.pharos.watch/api/stability-index?detail=true",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          "X-API-Key": "ph_live_0123456789abcdef_abcdefghijklmnopqrstuvwxyzABCDEF",
        },
        redirect: "manual",
      }),
    );

    fetchMock.mockRestore();
  });

  it("rejects unlisted API paths before upstream fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequest(makeContext("https://pharosville.pharos.watch/api/health"));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });

  it("fails closed when the Pages API key secret is missing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequest(makeContext("https://pharosville.pharos.watch/api/stablecoins", {
      env: { PHAROS_API_KEY: "" },
    }));

    expect(response.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockRestore();
  });
});
