// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RenderedFleetState, ReadinessState } from "../engine/types";

interface TestEngine {
  ctx: { services: Map<string, unknown> };
  listeners: Set<(state: RenderedFleetState) => void>;
  render(state: RenderedFleetState): void;
}
const harness = vi.hoisted(() => ({ engines: [] as TestEngine[], analytics: vi.fn(), preload: vi.fn(async () => {}) }));
vi.mock("../engine/engine", () => ({
  Engine: class {
    ctx = { services: new Map<string, unknown>([
      ["feed", { payloads: {} }],
      ["model", { hasFleet: false, boats: [] }],
      ["readiness", { revision: 0, boats: 0, prepared: false }],
      ["simulation-status", { unavailable: false }],
    ]) };
    listeners = new Set<(state: RenderedFleetState) => void>();
    constructor() { harness.engines.push(this); }
    add() { return this; }
    async init() {}
    start = vi.fn();
    abort = vi.fn();
    dispose = vi.fn();
    onRendered(cb: (state: RenderedFleetState) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
    render(state: RenderedFleetState) { for (const cb of this.listeners) cb(state); }
  },
}));
vi.mock("../systems", () => ({ SYSTEMS: [] }));
vi.mock("../ui/mount", () => ({ mountHarbourUI: () => vi.fn() }));
vi.mock("../ui/details", () => ({ preloadDetails: harness.preload }));
vi.mock("../../google-analytics", () => ({ installGoogleAnalytics: harness.analytics }));
vi.mock("../../error-reporter", () => ({ reportClientError: vi.fn() }));
// The sweep's arrival drift-in (wake.ts) drives a real camera rig; this harness has none.
vi.mock("./wake", () => ({ wantsWake: () => false, startWake: () => () => undefined, WAKE_PULLBACK: 0.12 }));
import { HarbourApp } from "./harbour-app";

let root: Root | undefined;
let host: HTMLDivElement;
const engine = () => harness.engines[harness.engines.length - 1];
const feed = () => engine().ctx.services.get("feed") as { payloads: { stablecoins?: { data: unknown } } };
const readiness = () => engine().ctx.services.get("readiness") as ReadinessState;
const shown = () => document.documentElement.hasAttribute("data-pv-live");
const status = () => host.querySelector("[role=status]")?.textContent;
async function mount() {
  root = createRoot(host);
  await act(async () => { root!.render(createElement(HarbourApp)); });
}
function commit(revision: number, boats: number) {
  feed().payloads.stablecoins = { data: { peggedAssets: Array.from({ length: boats }, (_, id) => ({ id })) } };
  engine().ctx.services.set("model", { hasFleet: true, boats: Array.from({ length: boats }) });
  Object.assign(readiness(), { revision, boats, prepared: true });
}
async function frame(revision = 0, boats = 0) {
  await act(async () => { engine().render({ revision, boats }); });
}
async function advance(ms: number) { await act(async () => { vi.advanceTimersByTime(ms); }); }

describe("composer-completed arrival reveal", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.clearAllMocks();
    harness.engines.length = 0;
    document.documentElement.removeAttribute("data-pv-live");
    document.body.innerHTML = '<div id="pv-poster"></div><div id="test-root"></div>';
    host = document.getElementById("test-root") as HTMLDivElement;
  });
  afterEach(async () => {
    await act(async () => { root?.unmount(); });
    root = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete window.__harbourStats;
  });

  it("reveals fast data only on the exact prepared revision's complete fleet render", async () => {
    await mount();
    commit(3, 12);
    expect(shown()).toBe(false); // Installed data, without a composer frame, is insufficient.
    await frame(2, 12);
    expect(shown()).toBe(false);
    await frame(3, 11);
    expect(shown()).toBe(false);
    readiness().prepared = false;
    await frame(3, 12);
    expect(shown()).toBe(false);
    readiness().prepared = true;
    await frame(3, 12);
    expect(shown()).toBe(true);
    expect(status()).toBe("The harbour is live.");
    expect(harness.preload).toHaveBeenCalledOnce(); // Warm the first interaction immediately, not after crossfade.
    expect(harness.analytics).not.toHaveBeenCalled();
    await advance(1199);
    expect(harness.analytics).not.toHaveBeenCalled();
    await advance(1);
    expect(host.querySelector(".pv-arrival")).toBeNull();
    expect(harness.analytics).toHaveBeenCalledOnce();
    expect(harness.preload).toHaveBeenCalledOnce();
  });

  it("holds pending data for 2 seconds from first render, then reveals boatless until one complete fleet arrives", async () => {
    await mount();
    await advance(10_000); // Neither navigation nor init starts the hold.
    expect(shown()).toBe(false);
    await frame();
    await advance(1999);
    await frame();
    expect(shown()).toBe(false);
    await advance(1);
    await frame();
    expect(shown()).toBe(true);
    expect(status()).toBe("Waiting for the fleet’s readings.");
    expect(readiness().boats).toBe(0);
    expect(engine().ctx.services.get("model")).toEqual({ hasFleet: false, boats: [] });
    commit(1, 12);
    await frame(0, 0);
    expect(status()).toBe("Waiting for the fleet’s readings.");
    await frame(1, 11);
    expect(status()).toBe("Waiting for the fleet’s readings.");
    await frame(1, 12);
    expect(status()).toBe("The harbour is live.");
    await advance(1200);
    expect(harness.analytics).toHaveBeenCalledOnce(); // Arrival does not restart the crossfade/timer.
  });

  it("does not use the pending timeout to reveal a successful but unprepared fleet", async () => {
    await mount();
    feed().payloads.stablecoins = { data: { peggedAssets: [{ id: "coin" }] } };
    await frame();
    await advance(3000);
    await frame();
    expect(shown()).toBe(false);
    commit(1, 1);
    await frame(1, 1);
    expect(shown()).toBe(true);
  });

  it("reveals a persistently incomplete prepared fleet after more than 3 seconds with honest copy and one warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount(); commit(2, 12);
    await frame(2, 11);
    await advance(3000); await frame(2, 11);
    expect(shown()).toBe(false); expect(warn).not.toHaveBeenCalled();
    await advance(1); await frame(2, 11);
    expect(shown()).toBe(true);
    expect(status()).toBe("Harbour ready; some boats could not be displayed.");
    expect(warn).toHaveBeenCalledExactlyOnceWith("[harbour] revealing incomplete fleet", { revision: 2, rendered: 11, expected: 12 });
    expect(engine().listeners.size).toBe(0);
    await frame(2, 11);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("does not carry incomplete time across revisions, unprepared states or unmatched rendered revisions", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount(); commit(1, 12);
    await frame(1, 11); await advance(3000);
    commit(2, 12); await frame(2, 10);
    expect(shown()).toBe(false);
    await advance(3000); readiness().prepared = false; await frame(2, 10);
    await advance(3001); await frame(2, 10);
    expect(shown()).toBe(false);
    readiness().prepared = true; await frame(2, 10);
    await advance(3001); await frame(1, 10);
    await frame(2, 10);
    expect(shown()).toBe(false); expect(warn).not.toHaveBeenCalled();
    await advance(3001); await frame(2, 11); // Partial progress is still incomplete.
    expect(shown()).toBe(true); expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("still reveals a complete revision immediately before the watchdog deadline", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount(); commit(1, 12);
    await frame(1, 11); await advance(2999); await frame(1, 12);
    expect(shown()).toBe(true); expect(status()).toBe("The harbour is live.");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("reveals an unavailable empty model without a feed when layout initialization could not start", async () => {
    await mount();
    engine().ctx.services.delete("feed");
    Object.assign(engine().ctx.services.get("simulation-status") as object, { unavailable: true });
    await frame();
    expect(shown()).toBe(true);
    expect(status()).toBe("Harbour ready; live readings unavailable.");
  });

  it("reveals failed data honestly after a base frame, without a live claim or the pending hold", async () => {
    await mount();
    feed().payloads.stablecoins = { data: null };
    expect(shown()).toBe(false);
    await frame();
    expect(shown()).toBe(true);
    expect(status()).toBe("Harbour ready; live readings unavailable.");
  });

  it("reveals worker-startup failure honestly after a base frame despite successful data", async () => {
    await mount();
    feed().payloads.stablecoins = { data: { peggedAssets: [{ id: "coin" }] } };
    Object.assign(engine().ctx.services.get("simulation-status") as object, { unavailable: true });
    expect(shown()).toBe(false);
    await frame();
    expect(shown()).toBe(true);
    expect(status()).toBe("Harbour ready; live readings unavailable.");
    expect(readiness().prepared).toBe(false);
    expect(harness.preload).toHaveBeenCalledOnce();
    expect(engine().listeners.size).toBe(1); // A later register refresh can restart the worker.
    Object.assign(engine().ctx.services.get("simulation-status") as object, { unavailable: false });
    commit(1, 1);
    await frame(0, 0);
    expect(status()).toBe("Harbour ready; live readings unavailable.");
    await frame(1, 1);
    expect(status()).toBe("The harbour is live.");
    expect(engine().listeners.size).toBe(0);
    expect(harness.preload).toHaveBeenCalledOnce();
  });

  it("accepts the complete fleet after the boatless world is fully visible without a second poster fade", async () => {
    await mount();
    await frame();
    await advance(2000);
    await frame();
    await advance(1300);
    expect(document.getElementById("pv-poster")).toBeNull();
    expect(host.querySelector(".pv-arrival")).toBeNull();
    commit(4, 12);
    await frame(3, 0);
    expect(engine().listeners.size).toBe(1);
    await frame(4, 12);
    expect(engine().listeners.size).toBe(0);
    expect(document.getElementById("pv-poster")).toBeNull();
    expect(host.querySelector(".pv-arrival")).toBeNull();
    expect(harness.analytics).toHaveBeenCalledOnce();
  });

  it("keeps a late failure honest after the boatless pending reveal", async () => {
    await mount();
    await frame();
    await advance(2000);
    await frame();
    feed().payloads.stablecoins = { data: null };
    await frame();
    expect(status()).toBe("Harbour ready; live readings unavailable.");
  });

  it("accepts valid zero-boat data only after its prepared empty revision is rendered", async () => {
    await mount();
    commit(2, 0);
    await frame(0, 0);
    expect(shown()).toBe(false);
    await frame(2, 0);
    expect(shown()).toBe(true);
    expect(status()).toBe("The harbour is ready. No boats in the current readings.");
  });

  it("restores a fresh poster and deadline on readmission, ignoring the old world and its timers", async () => {
    await mount();
    await frame();
    await advance(2000);
    await frame();
    const previous = engine();
    await act(async () => { root!.unmount(); });
    root = undefined;
    expect(previous.listeners.size).toBe(0);
    await mount();
    expect(shown()).toBe(false);
    expect(document.getElementById("pv-poster")).not.toBeNull();
    await act(async () => { previous.render({ revision: 5, boats: 12 }); });
    await advance(2000);
    expect(shown()).toBe(false); // Stale frame/timer from the first admission cannot reveal the new one.
    expect(document.getElementById("pv-poster")).not.toBeNull();
    await frame();
    await advance(1999);
    await frame();
    expect(shown()).toBe(false);
    await advance(1);
    await frame();
    expect(shown()).toBe(true);
  });
});
