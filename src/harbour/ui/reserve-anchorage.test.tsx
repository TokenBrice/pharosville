// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Boat, HarbourModel } from "../model/types";
import { TRUTH_NOW } from "../__fixtures__/projection";
import { reportFixture } from "../__fixtures__/report";
import { boatFact, landmarkFact, RESERVE_RULE, whereabouts, whereLine, whyHere } from "./facts";
import { StoreContext } from "./hooks";
import { HoverTag } from "./HoverTag";
import { Ledger } from "./Ledger";
import { SidePanel } from "./Panel";
import { Search } from "./Search";
import { readingCoverage } from "./source-state";
import { preloadDetails } from "./details";
import { backingItinerary } from "./store";
import { panelFixture } from "./__fixtures__/store";
import { browserObservation } from "./harbour-report/digest";
import { harbourReport } from "./harbour-report/report";

vi.mock("./hooks", async (original) => ({
  ...await original<typeof import("./hooks")>(),
  usePresence: (open: boolean) => [open, open],
  useFrame: () => {},
  useFrameWrite: () => {},
}));

let f: ReturnType<typeof panelFixture>;

function makeFund(base: Boat, over: Partial<Boat> = {}): Boat {
  return {
    ...base,
    id: "buidl-blackrock",
    symbol: "BUIDL",
    name: "BlackRock USD Institutional Digital Liquidity Fund",
    supply: 2.1e9,
    supplyPrevDay: 2.0e9,
    state: "reserve",
    listingClass: "tokenized-fund",
    grade: null,
    ratingStatus: "not-rated",
    gradeReason: "tokenized-fund-not-graded",
    pegDeviationBps: null,
    activeDepeg: false,
    nullPeg: true,
    dews: null,
    dewsScore: null,
    stormSignal: null,
    maiden: false,
    fundMeta: {
      navToken: false,
      pegCurrency: "USD",
      archetype: "tbill",
      backedIds: [base.id],
      liveAdapterBackedIds: [base.id],
    },
    ...over,
  };
}

function enrichModel(model: HarbourModel) {
  const core = model.boats[0];
  const buidl = makeFund(core);
  const jaaa = makeFund(core, {
    id: "jaaa-janus-henderson-anemoy",
    symbol: "JAAA",
    name: "Janus Henderson Anemoy AAA CLO Fund",
    supply: 850e6,
    supplyPrevDay: null,
    fundMeta: { navToken: true, pegCurrency: "USD", archetype: "rwa-credit-fund", backedIds: [core.id] },
  });
  model.boats.push(buidl, jaaa);
  model.coreCount = 1;
  model.reserveCount = 2;
  model.reserveSupplyTotal = buidl.supply + jaaa.supply;
  model.variantsByParent = {
    [core.id]: [
      { id: "susdc-spark", symbol: "sUSDC", name: "Savings USDC", kind: "savings-passthrough", supply: 420e6 },
      { id: "syrupusdc-maple", symbol: "syrupUSDC", name: "Maple Syrup USDC", kind: "strategy-vault", supply: 180e6 },
    ],
  };
  model.reviewHold = [{ id: "rcusd-r25", symbol: "rcUSD", name: "R25 USD", supply: 18.3e6 }];
  return { core, buidl, jaaa };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TRUTH_NOW);
  window.innerWidth = 1600;
  f = panelFixture();
});
afterEach(() => {
  cleanup();
  f.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Policy 2.0 tokenized funds, Reserve Anchorage & core variants", () => {
  it("reports reserve facts, whereabouts and whyHere honestly", () => {
    const { buidl } = enrichModel(f.model);
    const w = whereabouts(5, "reserve", null);
    expect(w).toEqual({ kind: "reserve", place: "Reserve Anchorage" });
    expect(whereLine(buidl, w)).toBe("in Reserve Anchorage");
    expect(boatFact(buidl, w)).toBe("BUIDL · tokenized fund · $2.10B · in Reserve Anchorage");
    expect(whyHere(buidl, w)).toContain("Reserve Anchorage off the Bonded Warehouse");
    expect(landmarkFact("warehouse", f.model, null)).toEqual({ fact: "2 tokenized funds · $2.95B reserve AUM · outside core totals" });
    expect(landmarkFact("reserve-anchorage", f.model, null).decorative).toBeUndefined();
    expect(landmarkFact("registry", f.model, null)).toEqual({ fact: "1 stablecoin · 2 tokenized funds ungraded" });

    // Unsynced fallback fund with unknown NAV basis and no listed backedIds uses honest copy
    const unsynced = makeFund(f.model.boats[0], {
      id: "new-unsynced-fund", symbol: "NEWF", name: "New Fund",
      fundMeta: { navToken: null, pegCurrency: "USD", archetype: null, backedIds: [] },
    });
    expect(whyHere(unsynced, w)).toBe("Anchored in Reserve Anchorage off the Bonded Warehouse. Retained as a tokenized fund outside core stablecoin totals and Safety Scores.");
  });

  it("renders the dedicated tokenized fund panel, omits Depeg history, links backed stablecoins and tags HoverTag", () => {
    const { core, buidl, jaaa } = enrichModel(f.model);
    f.store.set({ model: { ...f.model } });
    f.store.select({ kind: "boat", id: buidl.id }, { fly: false });
    const ui = render(
      <StoreContext.Provider value={f.store}>
        <SidePanel onClose={() => {}} />
        <HoverTag />
      </StoreContext.Provider>,
    );
    expect(screen.getAllByText("Tokenized fund · not a stablecoin").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Not a stablecoin · outside core totals & Safety Scores")).toBeTruthy();
    expect(screen.getByText("Fixed-$1 NAV fund share")).toBeTruthy();
    expect(screen.getByText("Tokenized T-bill fund")).toBeTruthy();
    expect(screen.getByText(/Why peg does not apply/)).toBeTruthy();
    expect(screen.getByText("Not graded")).toBeTruthy();
    expect(screen.getByText(/not assigned Pharos Safety Score letter grades/i)).toBeTruthy();
    expect(screen.getByText(/live reserve adapter/)).toBeTruthy();
    const details = Array.from(ui.container.querySelectorAll<HTMLDetailsElement>(".hb-panel-body > details"));
    expect(details.map((el) => el.querySelector("summary")?.textContent)).toEqual(["Backing", "Liquidity", "How this appears in the harbour"]);
    const outbound = screen.getByRole("link", { name: /Fund profile on Pharos/ });
    expect(outbound.getAttribute("href")).toBe("https://pharos.watch/stablecoin/buidl-blackrock/");

    // Clicking a backed stablecoin jumps to that core boat
    fireEvent.click(within(screen.getByRole("heading", { name: /Backed stablecoins/ }).closest("section")!).getByRole("button", { name: new RegExp(core.symbol) }));
    expect(f.store.getSnapshot().selected).toEqual({ kind: "boat", id: core.id });

    // Switching to NAV-accreting credit fund updates instrument & NAV basis
    act(() => f.store.select({ kind: "boat", id: jaaa.id }, { fly: false }));
    expect(screen.getByText("NAV-accreting fund share")).toBeTruthy();
    expect(screen.getByText("Tokenized credit fund")).toBeTruthy();

    // Unsynced fund with navToken: null and unknown tokenized-fund-* reason uses honest fallback copy
    const unsynced = makeFund(core, {
      id: "future-fund-x", symbol: "FFX", name: "Future Fund X",
      gradeReason: "tokenized-fund-nav-only",
      fundMeta: { navToken: null, pegCurrency: "USD", archetype: null, backedIds: [] },
    });
    f.model.boats.push(unsynced);
    act(() => { f.store.set({ model: { ...f.model } }); f.store.select({ kind: "boat", id: unsynced.id }, { fly: false }); });
    expect(screen.getByText("NAV basis not stated")).toBeTruthy();
    expect(screen.getByText(/not assigned Pharos Safety Score letter grades/i)).toBeTruthy();
  });

  it("shows reserve fund backing links and tracked variants on core stablecoin panels", () => {
    const { core, buidl } = enrichModel(f.model);
    f.store.set({ model: { ...f.model } });
    f.store.select({ kind: "boat", id: core.id }, { fly: false });
    render(<StoreContext.Provider value={f.store}><SidePanel onClose={() => {}} /></StoreContext.Provider>);

    const backingSec = screen.getByRole("heading", { name: "Reserve fund backing" }).closest("section")!;
    expect(within(backingSec).getByText("BUIDL")).toBeTruthy();
    expect(within(backingSec).getByText("JAAA")).toBeTruthy();

    const variantSec = screen.getByRole("heading", { name: "Tracked variants · 2" }).closest("section")!;
    expect(within(variantSec).getByText("sUSDC")).toBeTruthy();
    expect(within(variantSec).getByText("savings wrapper")).toBeTruthy();
    expect(within(variantSec).getByText("syrupUSDC")).toBeTruthy();
    expect(within(variantSec).getByText("strategy vault")).toBeTruthy();
    expect(within(variantSec).getByText(/excluded from fleet supply totals/i)).toBeTruthy();

    fireEvent.click(within(backingSec).getByRole("button", { name: /BUIDL/ }));
    expect(f.store.getSnapshot().selected).toEqual({ kind: "boat", id: buidl.id });
  });

  it("opens Bonded Warehouse and Reserve Anchorage panels with sorted funds, reviewHold footnote and outbound link", () => {
    const { buidl } = enrichModel(f.model);
    f.store.set({ model: { ...f.model } });
    f.store.select({ kind: "landmark", id: "warehouse" }, { fly: false });
    render(<StoreContext.Provider value={f.store}><SidePanel onClose={() => {}} /></StoreContext.Provider>);

    expect(screen.getByRole("heading", { name: "Bonded Warehouse" })).toBeTruthy();
    expect(screen.getByText(/2 tokenized funds · \$2\.95B reserve AUM/)).toBeTruthy();
    expect(screen.getByText(/investment-fund shares or NAV-priced claims/i)).toBeTruthy();
    expect(screen.getByText("rcUSD")).toBeTruthy();
    expect(screen.getByText(/Under listing review — outside core totals/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Stablecoins & funds on Pharos/ }).getAttribute("href")).toBe("https://pharos.watch/stablecoins/");

    const buttons = within(screen.getByRole("heading", { name: "Tokenized funds · 2" }).closest("section")!).getAllByRole("button");
    expect(buttons[0].textContent).toContain("BUIDL");
    expect(buttons[1].textContent).toContain("JAAA");
    fireEvent.click(buttons[0]);
    expect(f.store.getSnapshot().selected).toEqual({ kind: "boat", id: buidl.id });

    act(() => f.store.select({ kind: "landmark", id: "reserve-anchorage" }, { fly: false }));
    expect(screen.getByRole("heading", { name: "Reserve Anchorage" })).toBeTruthy();
  });

  it("keeps Registry grade counts strictly over core stablecoins with a Reserve Anchorage link", () => {
    enrichModel(f.model);
    f.store.set({ model: { ...f.model } });
    f.store.select({ kind: "landmark", id: "registry" }, { fly: false });
    render(<StoreContext.Provider value={f.store}><SidePanel onClose={() => {}} /></StoreContext.Provider>);
    expect(screen.getByText("1 stablecoin on the register")).toBeTruthy();
    expect(screen.getByText(/Reserve Anchorage: 2 tokenized funds \(\$2\.95B AUM\) — not graded under Listing Policy 2\.0\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View Reserve Anchorage" }));
    expect(f.store.getSnapshot().selected).toEqual({ kind: "landmark", id: "reserve-anchorage" });
  });

  it("separates Coins and Funds in the Ledger and documents Reserve Anchorage in Legend", () => {
    const { core, buidl } = enrichModel(f.model);
    f.store.set({ model: { ...f.model }, ledgerOpen: true });
    render(<StoreContext.Provider value={f.store}><Ledger onClose={() => {}} /></StoreContext.Provider>);

    expect(screen.getByText(RESERVE_RULE)).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Coins · 1/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Funds · 2/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Coins/ }));
    expect([...document.querySelectorAll("[data-row]")].map((r) => (r as HTMLElement).dataset.row)).toEqual([core.id]);

    fireEvent.click(screen.getByRole("tab", { name: /Funds/ }));
    expect(screen.getByText(/outside core stablecoin supply totals and Safety Scores/i)).toBeTruthy();
    expect([...document.querySelectorAll("[data-row]")].map((r) => (r as HTMLElement).dataset.row)).toEqual([buidl.id, "jaaa-janus-henderson-anemoy"]);
    expect(screen.getByText(/Under listing review \(outside core totals\): rcUSD/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter funds" }), { target: { value: "JAAA" } });
    expect([...document.querySelectorAll("[data-row]")].map((r) => (r as HTMLElement).dataset.row)).toEqual(["jaaa-janus-henderson-anemoy"]);
  });

  it("indexes Bonded Warehouse, Reserve Anchorage, Fund pills and tracked variants in Search", () => {
    const { core } = enrichModel(f.model);
    f.model.readings.wrecks = [];
    f.store.set({ model: { ...f.model }, searchOpen: true });
    const select = vi.spyOn(f.store, "select").mockImplementation(() => {});
    render(<StoreContext.Provider value={f.store}><Search onClose={() => {}} /></StoreContext.Provider>);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "buidl" } });
    expect(screen.getByRole("option").textContent).toContain("Fund");

    fireEvent.change(input, { target: { value: "syrupusdc" } });
    const variantOpt = screen.getByRole("option");
    expect(variantOpt.textContent).toContain("Variant");
    expect(variantOpt.textContent).toContain(`tracked variant of ${core.symbol}`);
    fireEvent.click(variantOpt);
    expect(select).toHaveBeenCalledWith({ kind: "boat", id: core.id });

    fireEvent.change(input, { target: { value: "Reserve Anchorage" } });
    expect(screen.getByRole("option").textContent).toContain("Reserve Anchorage");

    fireEvent.change(input, { target: { value: "Bonded Warehouse" } });
    expect(screen.getByRole("option").textContent).toContain("Bonded Warehouse");
  });

  it("builds curved backing arcs from a fund to its backed live stablecoins", () => {
    const { core, buidl } = enrichModel(f.model);
    const it = backingItinerary(buidl, {
      ids: [buidl.id, core.id],
      position: [150, 0, -140, 20, 0, -100],
    });
    expect(it).not.toBeNull();
    expect(it!.backing).toBe(true);
    expect(it!.legs).toHaveLength(1);
    expect(it!.legs[0].current).toBe(true);
    expect(it!.legs[0].pts.length).toBe(32);
    expect(it!.ports).toEqual([[20, -100]]);
    expect(backingItinerary(buidl, { ids: [buidl.id, core.id], position: [150, 0, -140, 20, 0, -100] }, () => false)).toBeNull();
    expect(backingItinerary(buidl, { ids: [buidl.id], position: [150, 0, -140] })).toBeNull();
  });

  it("excludes tokenized funds from readingCoverage, harbourReport and browserObservation", () => {
    enrichModel(f.model);
    // Core boat has both peg & stress readings; adding unrated/null-peg funds must keep coverage at 100%
    expect(readingCoverage(f.model, "pegSummary")).toBe(1);
    expect(readingCoverage(f.model, "stress")).toBe(1);

    const rf = reportFixture((u) => {
      (u.stablecoins.peggedAssets as Array<Record<string, unknown>>).push({
        id: "buidl-blackrock", symbol: "BUIDL", name: "BlackRock USD Fund", pegType: "peggedUSD",
        chains: ["Ethereum"], chainCirculating: {},
        circulating: { peggedUSD: 500e6 }, circulatingPrevDay: { peggedUSD: 100e6 }, circulatingPrevWeek: { peggedUSD: 100e6 },
      });
    });
    const fundBoat = rf.model.boats.find((b) => b.id === "buidl-blackrock")!;
    fundBoat.listingClass = "tokenized-fund";
    fundBoat.state = "reserve";
    rf.model.reserveCount = 1;

    const lines = harbourReport(rf.model, rf.payloads, 1, rf.nowMs).map((r) => r.text);
    expect(lines).toContain("Reported USD supply value changed by $0 across 2 comparable coins.");
    expect(lines.some((l) => l.includes("BUIDL"))).toBe(false);

    const obs = browserObservation(rf.model, rf.payloads, rf.nowMs)!;
    expect(obs.supply.map((s) => s.id)).not.toContain("buidl-blackrock");
  });

  it("redirects tracked-variant deep links (?sel=ship.<variantId>) to the parent core stablecoin", async () => {
    const parentId = f.model.boats[0].id;
    history.replaceState(null, "", "/?sel=ship.susdc-spark");
    const rf = panelFixture(1600, 1000, { restore: true, current: false });
    try {
      rf.model.variantsByParent = {
        [parentId]: [{ id: "susdc-spark", symbol: "sUSDC", name: "Savings USDC", kind: "savings-passthrough", supply: 420e6 }],
      };
      rf.model.truth.stablecoins.state = "current";
      rf.frame();
      await preloadDetails();
      rf.frame();
      expect(rf.store.getSnapshot().selected).toEqual({ kind: "boat", id: parentId });
      expect(location.search).toBe(`?sel=ship.${parentId}`);
    } finally {
      rf.dispose();
    }
  });
});
