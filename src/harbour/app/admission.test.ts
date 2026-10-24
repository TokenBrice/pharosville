// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { imported, mounted, unmounted, report } = vi.hoisted(() => ({
  imported: vi.fn(), mounted: vi.fn(), unmounted: vi.fn(), report: vi.fn(),
}));
vi.mock("../../error-reporter", () => ({ installClientErrorReporter: vi.fn(), reportClientError: report }));
vi.mock("../../google-analytics", () => ({ installGoogleAnalytics: vi.fn() }));

let dispose: (() => void) | undefined;
const dimensions = (sw: number, sh: number, w: number, h: number) => {
  Object.defineProperty(window, "screen", { configurable: true, value: { width: sw, height: sh } });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: h });
};
const flush = async () => { await vi.dynamicImportSettled(); };

describe("React-free admission", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    const html = new DOMParser().parseFromString(readFileSync(resolve("index.html"), "utf8"), "text/html");
    document.documentElement.innerHTML = html.documentElement.innerHTML;
    const hint = document.createElement("link");
    hint.dataset.pvPreload = "modulepreload";
    hint.href = "/assets/harbour-test.js";
    document.head.append(hint);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 0));
    vi.doMock("./react-entry", () => {
      imported();
      return { mountApp: (root: HTMLElement) => { mounted(); root.textContent = "world runtime"; return unmounted; } };
    });
  });
  afterEach(() => { dispose?.(); dispose = undefined; vi.unstubAllGlobals(); vi.doUnmock("./react-entry"); });

  it.each([[390, 844, 1600, 1000], [2560, 1440, 719, 600], [2560, 1440, 1200, 599]])(
    "leaves React and world hints inert for denied screen/window %s×%s / %s×%s",
    async (sw, sh, w, h) => {
      dimensions(sw, sh, w, h);
      dispose = (await import("../../main")).disposeAdmission;
      await flush();
      expect(imported).not.toHaveBeenCalled();
      expect(document.querySelector("link[data-pv-preload]")?.getAttribute("rel")).toBeNull();
      expect(document.querySelectorAll("#root nav a")).toHaveLength(5);
      expect(document.querySelectorAll("#root dd")).toHaveLength(3);
      expect(document.querySelector("#root")?.textContent).toContain(sw === 390 ? "open a larger screen" : "Give this window more room");
      expect(document.getElementById("pv-poster")).toBeNull();
    },
  );

  it("restores the poster through denied → admitted → denied → readmitted", async () => {
    dimensions(2560, 1440, 719, 600);
    dispose = (await import("../../main")).disposeAdmission;
    dimensions(2560, 1440, 720, 600);
    window.dispatchEvent(new Event("resize"));
    await flush();
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(document.getElementById("pv-poster")).not.toBeNull();
    const { dismissPoster } = await import("./poster");
    dismissPoster("now");
    dimensions(2560, 1440, 719, 600);
    window.dispatchEvent(new Event("resize"));
    expect(unmounted).toHaveBeenCalledTimes(1);
    dimensions(2560, 1440, 600, 720);
    window.dispatchEvent(new Event("resize"));
    await flush();
    expect(mounted).toHaveBeenCalledTimes(2);
    expect(document.getElementById("pv-poster")).not.toBeNull();
    expect(document.documentElement.hasAttribute("data-pv-live")).toBe(false);
    expect(document.querySelector("link[data-pv-preload]")?.getAttribute("rel")).toBe("modulepreload");
  });

  it("leaves the useful guide, status and links when React's import fails", async () => {
    vi.doMock("./react-entry", () => { throw new Error("module transfer failed"); });
    dimensions(1440, 900, 1440, 900);
    dispose = (await import("../../main")).disposeAdmission;
    await flush();
    expect(document.querySelector("#root [role=status]")?.textContent).toContain("could not load");
    expect(document.querySelectorAll("#root dd")).toHaveLength(3);
    expect(document.querySelectorAll("#root nav a")).toHaveLength(2);
    expect(report).toHaveBeenCalled();
  });
});
