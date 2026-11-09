// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { imported, mounted, unmounted, report } = vi.hoisted(() => ({
  imported: vi.fn(), mounted: vi.fn(), unmounted: vi.fn(), report: vi.fn(),
}));
vi.mock("../../error-reporter", () => ({ installClientErrorReporter: vi.fn(), reportClientError: report }));

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
    document.documentElement.removeAttribute("data-pv-gate");
    document.documentElement.removeAttribute("data-pv-live");
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
      // the first-byte welcome stays; the arrival card leaves the root and the gate hands the page to it
      expect(document.documentElement.dataset.pvGate).toBe("welcome");
      expect(document.getElementById("root")?.childElementCount).toBe(0);
      const page = document.getElementById("pv-welcome")!;
      expect(page.dataset.screenCapable).toBe(String(sw !== 390));
      expect(page.querySelectorAll("nav a")).toHaveLength(5);
      expect(page.querySelectorAll(".pharosville-narrow__guide dd")).toHaveLength(3);
      expect(page.textContent).toContain(sw === 390 ? "open a larger screen" : "Give this window at least 720×600 CSS pixels");
      expect(document.getElementById("pv-poster")).toBeNull();
      // the welcome's own module (Copy harbour link, the gauge) wires up; nothing of the world loads
      expect(page.querySelector<HTMLButtonElement>("[data-pv-copy]")?.hidden).toBe(false);
      expect(page.querySelectorAll(".pharosville-gauge__side")).toHaveLength(2);
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

  it("installs \"Raising the harbour.\" only on JavaScript admission, and hands the page to the arrival", async () => {
    expect(document.querySelector("#root [role=status]")?.textContent).toBe("");
    dimensions(1440, 900, 1440, 900);
    dispose = (await import("../../main")).disposeAdmission;
    expect(document.querySelector("#root [role=status]")?.textContent).toBe("Raising the harbour.");
    expect(document.documentElement.dataset.pvGate).toBe("arrival");
    expect(document.getElementById("pv-welcome")).not.toBeNull();
    await flush();
    expect(mounted).toHaveBeenCalledTimes(1);
  });

  // S08-I6: the boundary races at the real admission owner.
  it("never mounts a world whose import settles after the window shrank below the gate", async () => {
    let settle!: () => void;
    vi.doMock("./react-entry", async () => {
      await new Promise<void>((resolve) => { settle = resolve; });
      imported();
      return { mountApp: () => { mounted(); return unmounted; } };
    });
    dimensions(2560, 1440, 1600, 1000);
    dispose = (await import("../../main")).disposeAdmission;
    await vi.waitFor(() => expect(settle).toBeTypeOf("function"));
    dimensions(2560, 1440, 719, 600);
    window.dispatchEvent(new Event("resize"));
    settle();
    await flush();
    await vi.waitFor(() => expect(imported).toHaveBeenCalled());
    await Promise.resolve();
    expect(mounted).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.pvGate).toBe("welcome");
    expect(document.getElementById("root")?.childElementCount).toBe(0);
    expect(document.getElementById("pv-poster")).toBeNull();
  });

  it("restores one poster and one world after a rapid deny-and-readmit", async () => {
    dimensions(2560, 1440, 719, 600);
    dispose = (await import("../../main")).disposeAdmission;
    dimensions(2560, 1440, 1600, 1000);
    window.dispatchEvent(new Event("resize"));
    await flush();
    expect(mounted).toHaveBeenCalledTimes(1);
    // shrink and readmit inside one task (a fold and unfold, a snapped window): one teardown, one new world.
    // (Two world imports in flight at once trip Vitest's doMock and load the real module, so the stale-ticket race
    // is covered by the pending-import case above.)
    for (const [w, h] of [[700, 560], [600, 720]] as const) {
      dimensions(2560, 1440, w, h);
      window.dispatchEvent(new Event("resize"));
    }
    await flush();
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(mounted).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll("#pv-poster")).toHaveLength(1);
    expect(document.getElementById("root")?.textContent).toBe("world runtime");
    expect(document.documentElement.dataset.pvGate).toBe("arrival");
  });

  it("denies a small physical screen even when its window reports desktop room", async () => {
    dimensions(390, 844, 1920, 1080);
    dispose = (await import("../../main")).disposeAdmission;
    window.dispatchEvent(new Event("resize"));
    await flush();
    expect(imported).not.toHaveBeenCalled();
    expect(document.querySelector("link[data-pv-preload]")?.getAttribute("rel")).toBeNull();
    expect(document.querySelector(".pv-arrival")).toBeNull();
    expect(document.getElementById("pv-welcome")?.dataset.screenCapable).toBe("false");
  });
});
