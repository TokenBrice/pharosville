// @vitest-environment jsdom
import type { Services } from "../engine/services";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectedFixtures, TRUTH_COIN_ID, TRUTH_NOW, upstreamFixtures, type UpstreamFixtures } from "../__fixtures__/projection";
import { PHAROSVILLE_ENDPOINT_REGISTRY } from "@shared/lib/pharosville-endpoint-registry";
import { HarbourFeed } from "../data/fetch";
import { buildHarbourModel } from "../model/build";
import type { EndpointKey, HarbourModel } from "../model/types";
import { Freshness } from "./bits";
import { CornerMark } from "./CornerMark";
import { transportCopy } from "./feed-health";
import { HoverTag } from "./HoverTag";
import { Ledger } from "./Ledger";
import { SidePanel } from "./Panel";
import { readingCoverage, readingSentence } from "./source-state";
import type { PickHit } from "./services";
import type { UIState } from "./store";

const { state, services, store } = vi.hoisted(() => {
  const state = { model: null as HarbourModel | null, selected: null as PickHit | null, hover: null as PickHit | null, ledgerOpen: true, chartMode: false, reducedMotion: true, tick: 0 };
  const services = new Map<string, unknown>() as Services;
  return { state, services, store: {
    ctx: { services }, getSnapshot: () => state, select: vi.fn(), set: vi.fn(), goHome: vi.fn(),
    holdHover: vi.fn(), boat: (id: string) => state.model?.boats.find((b) => b.id === id), underWay: () => 0, boatsInZone: () => [],
    whereaboutsOf: () => ({ kind: "moored", place: "Ethereum" }),
  } };
});
vi.mock("./hooks", () => ({
  useStore: () => store, useUI: () => state,
  useUISlice: (select: (s: UIState) => unknown) => select(state as UIState),
  usePresence: (open: boolean) => [open, open], useSticky: (value: unknown) => value,
  useFrame: () => {}, useFrameWrite: () => {}, touchFirst: () => false,
}));
vi.mock("./measurements", () => ({ useMeasurements: () => ({ invalidate: () => {} }), setStyle: () => {} }));
vi.mock("../audio/SoundToggle", () => ({ SoundToggle: () => null }));

const feeds: HarbourFeed[] = [];
const keys = Object.keys(PHAROSVILLE_ENDPOINT_REGISTRY) as EndpointKey[];
async function setup(mutate: (upstream: UpstreamFixtures) => void = () => {}, opts: { unavailable?: EndpointKey[]; warning?: EndpointKey[] } = {}) {
  const input = upstreamFixtures(); mutate(input);
  const projected = projectedFixtures(input);
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    const key = keys.find((k) => PHAROSVILLE_ENDPOINT_REGISTRY[k].path === path)!;
    return opts.unavailable?.includes(key) ? new Response("unavailable", { status: 503 })
      : new Response(JSON.stringify(projected[key]), { headers: opts.warning?.includes(key) ? { Warning: '110 - "Response is stale"' } : {} });
  }));
  const feed = new HarbourFeed({ now: () => Date.now(), setTimer: () => 0, clearTimer: () => {}, isHidden: () => false });
  await feed.start(); feeds.push(feed); services.set("feed", feed);
  state.model = buildHarbourModel(feed.payloads, TRUTH_NOW);
  return feed;
}
function panel(hit: PickHit) { state.selected = hit; return render(<SidePanel onClose={() => {}} />); }
const landmark = (id: string): PickHit => ({ kind: "landmark", id });
function parity(hit: PickHit, sentence: string) {
  state.hover = hit;
  let ui = render(<HoverTag />);
  expect(within(ui.container).getAllByText(sentence).length).toBeGreaterThan(0);
  ui.unmount(); state.hover = null;
  ui = panel(hit);
  expect(within(ui.container).getAllByText(sentence).length).toBeGreaterThan(0);
  ui.unmount();
  ui = render(<Ledger onClose={() => {}} />);
  expect(within(ui.container).getAllByText(sentence).length).toBeGreaterThan(0);
  ui.unmount();
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(TRUTH_NOW); services.clear(); state.model = null; state.selected = null; state.hover = null;
  window.history.replaceState({}, "", "/?intro=0");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => { cleanup(); for (const feed of feeds.splice(0)) feed.stop(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("projected source sentences in hover, panel and ledger", () => {
  it.each([
    ["Supply", { kind: "boat", id: TRUTH_COIN_ID }], ["Chain comparisons", { kind: "harbour", id: "Ethereum" }],
    ["PSI", landmark("pharos")], ["Peg readings", landmark("shoals")], ["Stress readings", landmark("storm-mast")],
    ["Safety grades", landmark("registry")], ["Flow readings", landmark("mint")],
  ] as const)("%s uses its own projected source on all three surfaces", async (reading, hit) => {
    await setup();
    parity(hit, `${reading}: current. Updated 2026-11-08 11:59:00 UTC.`);
  });

  it.each([
    ["current", "Supply: current. Updated 2026-11-08 11:59:00 UTC."],
    ["stale", "Supply: stale. Last observed 2026-11-08 10:00:00 UTC."],
    ["unknown", "Supply: unavailable. Source freshness is unverified."],
  ] as const)("%s source evidence has DOM parity", async (stateKind, sentence) => {
    await setup((u) => {
      if (stateKind === "stale") u.stablecoins._meta = { updatedAt: TRUTH_NOW / 1000 - 7200, ageSeconds: 7200, status: "stale" };
      if (stateKind === "unknown") delete u.stablecoins._meta;
    });
    expect(state.model!.truth.stablecoins.state).toBe(stateKind);
    parity({ kind: "boat", id: TRUTH_COIN_ID }, sentence);
    if (stateKind === "unknown") {
      panel({ kind: "boat", id: TRUTH_COIN_ID });
      expect(screen.getAllByText("Last received values").length).toBeGreaterThan(0);
      expect(within(screen.getByRole("heading", { name: "Supply" }).closest("section")!).getByText("$1.00B")).toBeTruthy();
    }
  });

  it("unavailable peg and stress endpoints cannot claim clear water or Calm", async () => {
    await setup(() => {}, { unavailable: ["pegSummary", "stress"] });
    parity(landmark("shoals"), "Peg readings: unavailable.");
    parity(landmark("storm-mast"), "Stress readings: unavailable.");
    panel(landmark("shoals"));
    expect(screen.queryByText(/clear water|No observed depegs|No coin is off/)).toBeNull();
  });

  it("current empty coverage and a zero-boat register are unavailable analytical observations", async () => {
    await setup((u) => { u.pegSummary.coins = []; u.stress.signals = {}; });
    parity(landmark("shoals"), "Peg readings: unavailable.");
    parity(landmark("storm-mast"), "Stress readings: unavailable.");
    await setup((u) => { u.stablecoins.peggedAssets = []; });
    expect(readingCoverage(state.model, "pegSummary")).toBe(0);
    panel(landmark("shoals"));
    expect(screen.queryByText(/No off-peg coins were observed/)).toBeNull();
  });

  it("fully observed zero uses the same bounded empty observation in all three surfaces", async () => {
    await setup();
    parity(landmark("shoals"), "No off-peg coins were observed among covered coins.");
    parity(landmark("storm-mast"), "No Alert-or-worse signals were observed among covered coins.");
  });

  it("partial coverage discloses its share without renormalizing off-peg supply", async () => {
    await setup((u) => {
      const first = (u.stablecoins.peggedAssets as Array<Record<string, unknown>>)[0];
      first.circulating = { peggedUSD: 60e6 }; first.chainCirculating = { Ethereum: { current: 60e6 } };
      (u.stablecoins.peggedAssets as unknown[]).push({ ...first, id: "not-covered", symbol: "NONE", circulating: { peggedUSD: 40e6 }, chainCirculating: { Ethereum: { current: 40e6 } } });
      (u.pegSummary.coins as Array<Record<string, unknown>>)[0].activeDepeg = true;
    });
    expect(readingCoverage(state.model, "pegSummary")).toBe(0.6);
    expect(state.model!.readings.seaState.offPegShare).toBe(0.6);
    parity(landmark("shoals"), "Peg readings: partial. Observed across 60% of tracked supply. Peg readings: current. Updated 2026-11-08 11:59:00 UTC.");
    parity(landmark("storm-mast"), "Stress readings: partial. Observed across 60% of tracked supply. Stress readings: current. Updated 2026-11-08 11:59:00 UTC.");
    panel(landmark("shoals"));
    expect(screen.getByText("At least 60% of tracked supply is observed off peg.")).toBeTruthy();
  });

  it("stale partial coverage retains both qualifications and never rounds into full coverage", async () => {
    await setup((u) => {
      u.pegSummary._meta = { updatedAt: TRUTH_NOW / 1000 - 7200, ageSeconds: 7200, status: "stale" };
      const first = (u.stablecoins.peggedAssets as Array<Record<string, unknown>>)[0];
      (u.stablecoins.peggedAssets as unknown[]).push({ ...first, id: "tiny-unobserved", circulating: { peggedUSD: 1 }, chainCirculating: {} });
      (u.pegSummary.coins as Array<Record<string, unknown>>)[0].activeDepeg = true;
    });
    parity(landmark("shoals"), "Peg readings: partial. Observed across 99.99% of tracked supply. Peg readings: stale. Last observed 2026-11-08 10:00:00 UTC.");
    panel(landmark("shoals"));
    expect(screen.getByText("At least 99.99% of tracked supply is observed off peg.")).toBeTruthy();
    expect(screen.queryByText(/At least 100%/)).toBeNull();
  });

  it.each([[true, false, "stress signals"], [false, true, "depeg events"], [true, true, "stress signals and depeg events"]] as const)("PSI qualification %s/%s survives projection into all three surfaces", async (dewsUnavailable, depegEventsUnavailable, missing) => {
    await setup((u) => { (u.stability.current as Record<string, unknown>).inputDegradation = { dewsUnavailable, depegEventsUnavailable }; });
    parity(landmark("pharos"), `Computed without ${missing}. A horn shutter narrows the beam until those inputs return.`);
  });

  it.each([false, true])("Warning 110 stays stale with undated source %s in all three surfaces", async (undated) => {
    const feed = await setup((u) => { if (undated) delete u.stablecoins._meta; }, { warning: ["stablecoins"] });
    parity({ kind: "boat", id: TRUTH_COIN_ID }, undated ? "Supply: stale. Source freshness is unverified." : "Supply: stale. Last observed 2026-11-08 11:59:00 UTC.");
    render(<CornerMark />);
    expect(screen.getByRole("status").textContent).toContain("Refresh delayed — showing saved readings.");
    expect(feed.payloads.stablecoins!.staleFallback).toBe(true);
  });

  it("mixed boat sections carry independent sources and missing rows have explanatory words", async () => {
    await setup((u) => {
      u.stress._meta = { updatedAt: TRUTH_NOW / 1000 - 7200, ageSeconds: 7200, status: "stale" };
      delete u.safetyGrades._meta;
      u.pegSummary.coins = [];
    });
    panel({ kind: "boat", id: TRUTH_COIN_ID });
    for (const key of ["stablecoins", "pegSummary", "stress", "safetyGrades", "mintBurn"] as const) expect(screen.getAllByText(readingSentence(state.model, key)).length).toBeGreaterThan(0);
    expect(screen.getByText("No peg reading is available for this coin.")).toBeTruthy();
    expect(screen.getByText("Last received grade: A.")).toBeTruthy();
    expect(within(screen.getByRole("heading", { name: "Supply" }).closest("section")!).getByText("$1.00B")).toBeTruthy();
  });

  it("an unverified PSI remains a labelled retained value", async () => {
    await setup((u) => { delete u.stability._meta; });
    parity(landmark("pharos"), "PSI: unavailable. Source freshness is unverified.");
    panel(landmark("pharos"));
    expect(screen.getByText("Last received values")).toBeTruthy();
    expect(screen.getAllByText("91.0")[0]).toBeTruthy();
  });

  it("one visible-disclosure clock advances source ages without rebuilding the model and stops on close", async () => {
    await setup();
    const model = state.model!;
    const ui = render(<><Freshness model={model} source="stablecoins" /><Freshness model={model} source="chains" /></>);
    expect(vi.getTimerCount()).toBe(1);
    expect(screen.getAllByText("Observed just now.")).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(screen.getAllByText("Observed 3 min ago.")).toHaveLength(2);
    expect(state.model).toBe(model);
    ui.unmount(); expect(vi.getTimerCount()).toBe(0);
  });

  it("chain holdings and comparisons, Registry and movers expose their actual source", async () => {
    await setup((u) => { delete u.chains._meta; });
    const ui = panel({ kind: "harbour", id: "Ethereum" });
    expect(screen.getAllByText(readingSentence(state.model, "stablecoins")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Chain comparisons: unavailable. Source freshness is unverified.").length).toBeGreaterThan(0);
    ui.unmount(); const registry = panel(landmark("registry"));
    expect(screen.getByText(readingSentence(state.model, "safetyGrades"))).toBeTruthy();
    registry.unmount(); panel(landmark("harbourmaster"));
    expect(screen.getByText("Chain comparisons: unavailable. Source freshness is unverified.")).toBeTruthy();
  });
});

describe("transport health remains independent from observation freshness", () => {
  it("shows delays after two failures, clears on recovery, and lists all seven log sources", async () => {
    const feed = await setup();
    const truth = state.model!.truth;
    render(<CornerMark />);
    const ui = panel(landmark("keeperslog"));
    expect(ui.container.querySelectorAll("tbody tr")).toHaveLength(7);
    vi.mocked(fetch).mockResolvedValue(new Response("down", { status: 503 }));
    await act(async () => { await feed.refresh("stablecoins"); });
    expect(screen.queryByText("Refresh delayed — showing saved readings.")).toBeNull();
    await act(async () => { await feed.refresh("stablecoins"); });
    expect(screen.getAllByText(/Refresh delayed — showing saved readings\./).length).toBeGreaterThan(1);
    expect(state.model!.truth).toBe(truth);
    vi.mocked(fetch).mockImplementation(async (path) => {
      const key = keys.find((k) => PHAROSVILLE_ENDPOINT_REGISTRY[k].path === String(path))!;
      return new Response(JSON.stringify(projectedFixtures()[key]));
    });
    await act(async () => { await feed.refresh("stablecoins"); });
    expect(screen.queryByText(/Refresh delayed/)).toBeNull();
  });

  it("offline advisory changes neither source truth nor timestamps and clears on reconnect", async () => {
    await setup(); const truth = state.model!.truth;
    render(<CornerMark />);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(async () => { window.dispatchEvent(new Event("offline")); await Promise.resolve(); });
    expect(screen.getByRole("status").textContent).toContain("You’re offline. Showing saved readings.");
    expect(state.model!.truth).toBe(truth);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event("online")); await Promise.resolve(); });
    expect(screen.getByRole("status").textContent).not.toContain("offline");
    expect(screen.getByRole("status").textContent).not.toContain("Refreshing overdue readings.");
  });

  it("only an admitted overdue request says refreshing, and settlement clears it", async () => {
    const feed = await setup(); render(<CornerMark />);
    let resolve!: (response: Response) => void;
    const projected = projectedFixtures();
    vi.mocked(fetch).mockImplementation(async (path) => {
      if (path === "/api/stablecoins") return new Promise<Response>((r) => { resolve = r; });
      const key = keys.find((k) => PHAROSVILLE_ENDPOINT_REGISTRY[k].path === String(path))!;
      return new Response(JSON.stringify(projected[key]));
    });
    await act(async () => {
      vi.setSystemTime(TRUTH_NOW + 1_000_000);
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(feed.refreshingOverdue).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Refreshing overdue readings.");
    await act(async () => { resolve(new Response(JSON.stringify(projected.stablecoins))); await feed.refresh("stablecoins"); });
    expect(feed.refreshingOverdue).toBe(false);
    expect(screen.getByRole("status").textContent).not.toContain("Refreshing overdue readings.");
  });

  it("no saved fleet and malformed readings use C's exact variants", () => {
    expect(transportCopy({}, false)).toBe("You’re offline. Fleet readings unavailable.");
    expect(transportCopy({ stablecoins: { data: null, meta: null, fetchedAtMs: null, error: "down", failureStreak: 1 } }, true)).toBe("Fleet readings unavailable.");
    const saved = { data: { peggedAssets: [] }, meta: null, fetchedAtMs: TRUTH_NOW };
    expect(transportCopy({ stablecoins: { ...saved, failureStreak: 2, failureKind: "invalid-payload" } }, true)).toBe("A reading could not be used. Showing saved readings.");
    expect(transportCopy({ stablecoins: saved }, true)).toBe("");
  });
});
