import { describe, expect, it, vi } from "vitest";
import { onRequest } from "./_log";

function makeContext(body: BodyInit | null, init?: {
  headers?: HeadersInit;
  method?: string;
}) {
  return {
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
    expect(String(logSpy.mock.calls[0]?.[0])).toContain("https://pharosville.pharos.watch/path");

    logSpy.mockRestore();
  });

  it("rejects oversized reports even when content-length is absent", async () => {
    const response = await onRequest(makeContext(JSON.stringify({
      message: "x".repeat(5_000),
    })));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Payload too large" });
  });
});
