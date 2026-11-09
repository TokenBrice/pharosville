// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountOverlayHarness } from "../../../tests/harness/overlay";
import { createReplay } from "../../../tests/helpers/scenario";
import fixture from "../../../tests/fixtures/scenarios/current.json";
import type { HarbourModel } from "../model/types";
import { dayBookLine, type HarbourEvent } from "../model/events";
import type { StagedMoment } from "../model/event-hub";
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

describe("moments you notice (O7-I4)", () => {
  const event = (o: Partial<HarbourEvent> = {}): HarbourEvent => ({ id: "depeg:usdx:1", kind: "depeg", atMs: 1_794_000_000_000, firstSeenMs: 1_793_999_700_000, endpoint: "pegSummary",
    coinId: null, symbol: "USDX", field: "peg deviation", from: "18", to: "412 bps", text: "USDX ran onto the Shoals", ...o });
  /** A stand-in events service: what the rarity scheduler stages (model/event-hub.ts), polled by the slip. */
  const stage = async (e: HarbourEvent | null) => {
    let hub = harness.store.ctx.services.get("events") as { current: StagedMoment | null; fire: () => void } | undefined;
    if (!hub) {
      const listeners = new Set<() => void>();
      hub = { current: null, fire: () => listeners.forEach((fn) => fn()), subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); } } as never;
      harness.store.ctx.services.set("events", hub as never);
      await set({ tick: harness.store.getSnapshot().tick + 1 });
    }
    hub!.current = e ? { event: e, startMs: e.atMs, endMs: e.atMs + 15_000 } : null;
    await act(async () => hub!.fire());
  };
  let look: ReturnType<typeof vi.fn>;
  beforeEach(() => { look = vi.fn(); (harness.store as unknown as { look: typeof look }).look = look; });

  it("shows the Day book's own sentence for the moment's run, announced once on the polite line", async () => {
    const boat = harness.store.getSnapshot().model!.boats[0]!;
    const e = event({ coinId: boat.id, symbol: boat.symbol, text: `${boat.symbol} ran onto the Shoals` });
    await stage(e);
    expect(slip().dataset.mode).toBe("moment");
    expect(slip().dataset.shown).toBe("true");
    expect(slip().querySelector(".hb-sc")!.textContent).toBe("Day book");
    // the Day book prints the same words after its time (DayBook.tsx: dayBookLine(entry, time))
    expect(dayBookLine(e, "14:20:00 UTC")).toBe(`14:20:00 UTC ${slip().querySelectorAll("span")[1]!.textContent}`);
    expect(slip().textContent).toContain(`${boat.symbol} ran onto the Shoals · 18 → 412 bps`);
    expect(harness.store.getSnapshot().announce).toBe(`Day book: ${boat.symbol} ran onto the Shoals · 18 → 412 bps`);
    expect(slip().getAttribute("role")).toBeNull();
    expect(slip().getAttribute("aria-live")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `Look at ${boat.symbol}` }));
    expect(look).toHaveBeenCalledWith({ kind: "boat", id: boat.id });
    await stage(null);
    expect(slip().dataset.shown).toBe("false");
  });

  it("looks at the landmark that stages a market-wide moment, and offers no Look it cannot keep", async () => {
    await stage(event({ id: "psi", kind: "psi-band", endpoint: "stability", coinId: null, symbol: null, field: "PSI band", from: "Steady", to: "Tremor · 71.2", text: "The Pharos changed its rhythm" }));
    fireEvent.click(screen.getByRole("button", { name: "Look at The Pharos" }));
    expect(look).toHaveBeenLastCalledWith({ kind: "landmark", id: "pharos" });
    await stage(event({ id: "flow", kind: "flow-hour", endpoint: "mintBurn", field: "burned in an hour", from: "$40M mean", to: "$300M (7.5×)", text: "A big hour at the Burn" }));
    fireEvent.click(screen.getByRole("button", { name: "Look at The Burn" }));
    expect(look).toHaveBeenLastCalledWith({ kind: "landmark", id: "burn" });
    await stage(event({ id: "gone", coinId: "no-such-coin" }));
    expect(slip().dataset.mode).toBe("moment");
    expect(screen.queryByRole("button", { name: /^Look/ })).toBeNull();
  });

  it("takes the slip's place for its run only, gives way to the watch's controls, and returns to a mode left on", async () => {
    await set({ chartMode: true });
    await stage(event({ coinId: null }));
    expect(slip().dataset.mode).toBe("moment");
    await stage(null);
    expect(slip().dataset.mode).toBe("names");
    await set({ watch: { symbol: "USDC", line: "biggest supply change in 24 h (+$1.2B)" } });
    await set({ announce: "" });
    await stage(event({ id: "late" }));
    expect(slip().dataset.shown).toBe("false");
    expect(harness.store.getSnapshot().announce).toBe("");
  });
});
