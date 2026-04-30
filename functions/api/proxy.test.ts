import { afterEach, describe, expect, it, vi } from "vitest";
import { PHAROSVILLE_API_ENDPOINT_PATHS } from "../../shared/lib/pharosville-api-endpoints";
import { PHAROSVILLE_API_ENDPOINTS } from "../../shared/lib/pharosville-api-contract";
import { onRequest } from "./[[path]]";

function makeContext(url: string, init?: {
  env?: Record<string, string | undefined>;
  headers?: HeadersInit;
  method?: string;
}) {
  return {
    request: new Request(url, {
      headers: init?.headers,
      method: init?.method ?? "GET",
    }),
    env: {
      PHAROS_API_BASE: "https://api.pharos.watch",
      PHAROS_API_KEY: "test-proxy-key",
      ...init?.env,
    },
    params: {},
  };
}

describe("PharosVille API proxy", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps the proxy allowlist in sync with the PharosVille API contract", () => {
    expect(PHAROSVILLE_API_ENDPOINT_PATHS).toEqual(
      PHAROSVILLE_API_ENDPOINTS.map((endpoint) => endpoint.path),
    );
  });

  it.each(PHAROSVILLE_API_ENDPOINT_PATHS)("proxies the allowed endpoint %s", async (endpointPath) => {
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

  it("rejects unlisted API paths before upstream fetch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequest(makeContext("https://pharosville.pharos.watch/api/health"));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();

  });

  it.each([
    "/api/stablecoins?extra=1",
    "/api/chains?extra=1",
    "/api/stability-index",
    "/api/stability-index?detail=false",
    "/api/stability-index?detail=true&extra=1",
    "/api/peg-summary?extra=1",
    "/api/stress-signals?days=7",
    "/api/report-cards?extra=1",
  ])("rejects non-exact endpoint query %s before upstream fetch", async (endpointPath) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await onRequest(makeContext(`https://pharosville.pharos.watch${endpointPath}`));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("rejects %s requests with 405", async (method) => {
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
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("sensitive upstream detail"));

    const response = await onRequest(makeContext("https://pharosville.pharos.watch/api/stablecoins"));
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toContain("PharosVille API upstream request failed");
    expect(body).not.toContain("sensitive upstream detail");
  });

  it("aborts slow upstream fetches and returns a controlled 502", async () => {
    vi.useFakeTimers();
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

    expect(response.status).toBe(502);
    expect(body).toContain("PharosVille API upstream request failed");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.pharos.watch/api/stablecoins",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
