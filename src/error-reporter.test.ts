/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectDiagnostic } from "./error-diagnostic";

async function loadReporter() { vi.resetModules(); return import("./error-reporter"); }
describe("bounded diagnostic queue", () => {
  const fetchMock = vi.fn();
  const bodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string) as Record<string, unknown>);
  beforeEach(() => {
    vi.useFakeTimers(); localStorage.clear(); fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("serializes nearby failures across the server throttle", async () => {
    const { reportClientError } = await loadReporter();
    reportClientError("render", { code: "context-loss", message: "secret" }, "first");
    reportClientError("render", { code: "frame-failure" }, "second");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(bodies().map((body) => body.code)).toEqual(["context-loss", "frame-failure"]);
    expect(bodies()[0]).not.toHaveProperty("message");
  });

  it("spaces successful deliveries from completion even when the first request is slow", async () => {
    const { reportClientError } = await loadReporter();
    let finish: (response: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    reportClientError("render", {}); reportClientError("network", {});
    await vi.advanceTimersByTimeAsync(9_000);
    finish(new Response(null, { status: 204 })); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(9_999); expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds admission and deduplication before 10,000 unique faults", async () => {
    const { reportClientError, readClientErrorHistory } = await loadReporter();
    reportClientError("render", {}, "same");
    reportClientError("network", {}, "same");
    const added = vi.spyOn(Set.prototype, "add");
    for (let i = 0; i < 10_000; i++) reportClientError("network", {}, `qa-dedupe:${i}`);
    expect(added.mock.calls.filter(([key]) => typeof key === "string" && key.startsWith("qa-dedupe:")).length).toBe(4);
    added.mockRestore();
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(readClientErrorHistory()).toHaveLength(5);
  });

  it("honors Retry-After and stops permanent 4xx", async () => {
    const { reportClientError } = await loadReporter();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "20" } }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    reportClientError("render", {});
    await vi.advanceTimersByTimeAsync(19_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caps transient attempts at three", async () => {
    const { reportClientError } = await loadReporter();
    fetchMock.mockRejectedValue(new TypeError("offline"));
    reportClientError("network", {});
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("purges expired, future, corrupt and legacy local history", async () => {
    const { readClientErrorHistory } = await loadReporter();
    const fresh = { category: "render", code: "context-loss", ts: Date.now(), release: "v1.4.1" };
    localStorage.setItem("pharosville:error-history", JSON.stringify([
      { category: "render", message: "legacy secret", ts: Date.now() },
      { ...fresh, ts: Date.now() - 86_400_000 }, { ...fresh, ts: Date.now() + 1 },
      ...Array.from({ length: 12 }, () => fresh),
    ]));
    expect(readClientErrorHistory()).toHaveLength(10);
    expect(localStorage.getItem("pharosville:error-history")).not.toContain("secret");
  });

  it("cancels queued delivery on pagehide and ignores intentional cancellation", async () => {
    const { reportClientError, installClientErrorReporter } = await loadReporter();
    installClientErrorReporter();
    reportClientError("render", { code: "cancelled" });
    reportClientError("render", {});
    reportClientError("network", {});
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event("pagehide"));
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it("projects bounded UTF-8 diagnostics with only sanitized source locations", () => {
  const entry = projectDiagnostic({ category: "render", code: "shader-link", release: "v1.5.0", message: "秘密".repeat(10_000), reason: "secret", ua: "secret", url: "https://example.com/?secret", filename: "not a URL?secret", stack: "Error: secret\n at name (https://example.com/assets/main.js?token=secret#hash:12:4)" });
  expect(entry).toMatchObject({ code: "shader-link", stack: "https://example.com/assets/main.js" });
  expect(JSON.stringify(entry)).not.toMatch(/secret|秘密/);
  expect(new TextEncoder().encode(JSON.stringify(entry)).byteLength).toBeLessThan(4_096);
  expect(projectDiagnostic({ category: "invented" })).toBeNull();
  expect(projectDiagnostic({ category: "render", kind: "toString" })?.code).toBe("unknown");
});
