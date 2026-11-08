// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountOverlayHarness } from "../../../tests/harness/overlay";
import { createReplay } from "../../../tests/helpers/scenario";
import fixture from "../../../tests/fixtures/scenarios/current.json";
import type { HarbourModel } from "../model/types";
import { publishPresentation } from "./presentation";
import type { UIState } from "./store";

let harness: Awaited<ReturnType<typeof mountOverlayHarness>>;
const slip = () => document.querySelector<HTMLElement>(".hb-slip")!;
const set = (patch: Partial<UIState>) => act(async () => harness.store.set(patch));
beforeEach(async () => {
  const replay = createReplay(fixture);
  vi.stubGlobal("fetch", replay.fetch); vi.spyOn(Date, "now").mockImplementation(replay.now);
  document.body.innerHTML = '<div id="overlay"></div>';
  await act(async () => { harness = await mountOverlayHarness(document.getElementById("overlay")!); });
});
afterEach(async () => { await act(async () => harness.dispose()); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("the slip (O8-I7): the visitor's own modes, one at a time", () => {
  it("stays while chart Names are on, and its action turns them off", async () => {
    expect(slip().dataset.shown).toBe("false");
    await set({ chartMode: true });
    expect(slip().dataset.shown).toBe("true");
    expect(slip().textContent).toContain("Names");
    fireEvent.click(screen.getByRole("button", { name: "Hide chart names (C)" }));
    expect(harness.store.getSnapshot().chartMode).toBe(false);
    expect(slip().dataset.shown).toBe("false");
  });

  it("shows one at a time, the most consequential mode, and the next one when it ends", async () => {
    await set({ still: true });
    await set({ chartMode: true });
    expect(slip().dataset.mode).toBe("still"); // Names turned on later does not hide Still world
    expect(slip().textContent).toContain("Motion is still. Readings continue to update.");
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(harness.store.motion.still).toBe(false);
    await set({ still: false });
    expect(slip().dataset.mode).toBe("names");
    await set({ watch: { symbol: "USDT", line: "new to the register this week" } });
    expect(slip().dataset.shown).toBe("false"); // the watch speaks through its own controls (D14)
    expect(document.querySelectorAll(".hb-slip, .hb-watch")).toHaveLength(2);
  });

  it("gives the watch its own paced controls in the slip's place, with its subject and its stop", async () => {
    const stop = vi.spyOn(harness.store, "stopWatch");
    await set({ watch: { symbol: "USDC", line: "biggest supply change in 24 h (+$1.2B)" } });
    expect(slip().dataset.shown).toBe("false");
    const watch = document.querySelector<HTMLElement>(".hb-watch")!;
    expect(watch.textContent).toContain("USDC biggest supply change in 24 h (+$1.2B)");
    for (const name of ["Previous", "Next", "Inspect"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop watch" }));
    expect(stop).toHaveBeenCalledOnce();
  });

  it("never answers a market event, and adds no second live voice", async () => {
    const m = harness.store.getSnapshot().model!;
    const stale: HarbourModel = { ...m, truth: { ...m.truth, stablecoins: { ...m.truth.stablecoins, state: "stale", ageSec: 7200 } } };
    await set({ model: stale, tick: 9, announce: "USDC, 1 of 20 in view." });
    expect(slip().dataset.shown).toBe("false");
    expect(slip().textContent).toBe("");
    await set({ chartMode: true });
    expect(slip().getAttribute("role")).toBeNull();
    expect(slip().getAttribute("aria-live")).toBeNull();
  });
});

describe("visible state at the corner (O8-I7)", () => {
  it("keeps the word out whenever the reading is not plainly live, and marks stale by shape", async () => {
    const m = harness.store.getSnapshot().model!;
    publishPresentation(harness.store.ctx, { status: "complete", revision: 1, displayed: m.boats.length, expected: m.boats.length });
    await set({ tick: 1 });
    const mark = document.querySelector<HTMLElement>(".hb-mark")!;
    expect(mark.dataset.live).toBe("true");
    await set({ model: { ...m, truth: { ...m.truth, stablecoins: { ...m.truth.stablecoins, state: "stale", ageSec: 7200 } } } });
    expect(mark.dataset.live).toBe("false");
    expect(mark.querySelector(".hb-mark-state")!.getAttribute("data-state")).toBe("stale");
    expect(mark.querySelector(".hb-mark-state")!.textContent).toMatch(/^stale · 2 h old/);
    expect(mark.querySelector(".hb-dot")!.getAttribute("data-state")).toBe("stale");
  });
});
