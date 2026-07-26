/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadReporter() {
  vi.resetModules();
  return import("./error-reporter");
}

describe("reportClientError", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function postedBodies(): Record<string, unknown>[] {
    return fetchMock.mock.calls.map((call) => {
      const init = call[1] as RequestInit;
      return JSON.parse(init.body as string) as Record<string, unknown>;
    });
  }

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the category and payload to the log endpoint", async () => {
    const { reportClientError } = await loadReporter();

    reportClientError("render", { kind: "renderer-failure", cause: "webgl-context" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(fetchMock.mock.calls[0]![0]).toBe("/_log");
    expect(postedBodies()[0]).toMatchObject({
      category: "render",
      kind: "renderer-failure",
      cause: "webgl-context",
    });
  });

  it("sends a repeated dedupe key only once, across categories", async () => {
    const { reportClientError } = await loadReporter();

    reportClientError("data-load", { message: "boom" }, "boom");
    reportClientError("data-load", { message: "boom" }, "boom");
    reportClientError("render", { message: "boom" }, "boom");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not spend the session budget on a suppressed duplicate", async () => {
    const { reportClientError } = await loadReporter();

    // MAX_REPORTS_PER_SESSION is 5. Six sends, one of them a duplicate, must
    // still leave room for the fifth distinct failure.
    for (const key of ["a", "a", "b", "c", "d", "e"]) {
      reportClientError("network", { message: key }, key);
    }
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));

    expect(postedBodies().map((body) => body.message)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("stops at MAX_REPORTS_PER_SESSION", async () => {
    const { reportClientError } = await loadReporter();

    for (let i = 0; i < 8; i += 1) reportClientError("network", { i }, `k${i}`);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));

    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("suppresses an uncaught error whose message a call site already reported", async () => {
    const { reportClientError, installClientErrorReporter } = await loadReporter();
    installClientErrorReporter();

    reportClientError("render", { kind: "renderer-failure" }, "WebGL context lost");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new ErrorEvent("error", { message: "WebGL context lost" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Browsers report every cross-origin script failure as this one opaque
  // message, with no filename or position to tell two apart, so keying on it
  // let the first one silence every later fault of the session.
  // Installing leaves a window listener behind, so this test stays last and
  // counts reports per dispatch rather than for the run.
  it("does not let one opaque cross-origin fault suppress the next", async () => {
    const { installClientErrorReporter } = await loadReporter();
    installClientErrorReporter();
    const opaque = () => new ErrorEvent("error", { message: "Script error." });
    const located = () => new ErrorEvent("error", {
      message: "boom",
      filename: "https://pharosville.pharos.watch/assets/world.js",
      lineno: 12,
      colno: 4,
    });

    window.dispatchEvent(opaque());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(postedBodies().at(-1)).toMatchObject({ message: "Script error." });

    fetchMock.mockClear();
    window.dispatchEvent(opaque());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // A located error still costs one report however often it is raised.
    window.dispatchEvent(located());
    await vi.waitFor(() => expect(postedBodies().some((body) => body.message === "boom")).toBe(true));
    fetchMock.mockClear();
    window.dispatchEvent(located());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
