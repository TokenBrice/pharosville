// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Ledger } from "./Ledger";
import { SidePanel } from "./Panel";
import { StoreContext } from "./hooks";
import { panelFixture } from "./__fixtures__/store";
import { TRUTH_NOW } from "../__fixtures__/projection";
import { clearCoinFilters, matchesCoinFilters } from "./ledger-state";
import { installDeadRecords } from "../model/obituary";
import { installYardBook } from "./yard";
import type { DeadStablecoin } from "@shared/types/market";

vi.mock("./hooks", async (original) => ({ ...await original<typeof import("./hooks")>(), usePresence: (open: boolean) => [open, open] }));
let f: ReturnType<typeof panelFixture>;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(TRUTH_NOW); window.innerWidth = 1600; f = panelFixture(); f.store.set({ ledgerOpen: true }); });
afterEach(() => { cleanup(); f.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });
const mount = () => render(<StoreContext.Provider value={f.store}><Ledger onClose={() => f.store.set({ ledgerOpen: false })} /><SidePanel onClose={() => f.store.select(null)} /></StoreContext.Provider>);

describe("ledger research context", () => {
  it("keeps query, sort, scroll and row across Read, Locate, Return, tab switches and unmount", () => {
    const ui = mount(), fly = vi.spyOn(f.store, "flyTo");
    fireEvent.click(screen.getByRole("tab", { name: /Coins/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Filter coins" }), { target: { value: "USDC" } });
    fireEvent.click(screen.getByRole("button", { name: "Coin" }));
    fireEvent.scroll(screen.getByRole("tabpanel"), { target: { scrollTop: 120 } });
    const origin = screen.getByRole("button", { name: /USDC.*Read record/ }); origin.focus(); fireEvent.click(origin);
    expect(fly).not.toHaveBeenCalled(); expect(screen.getByRole("dialog", { name: /What you/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Return to ledger" })); expect(document.activeElement).toBe(origin);
    fireEvent.click(screen.getByRole("button", { name: "Locate USDC" })); expect(fly).toHaveBeenCalledOnce();
    expect(screen.queryByRole("tabpanel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Return to ledger" }));
    expect(document.activeElement?.textContent).toContain("USDC");
    expect(screen.getByRole("tabpanel").scrollTop).toBe(120);
    fireEvent.click(screen.getByRole("tab", { name: /Chains/ })); fireEvent.click(screen.getByRole("tab", { name: /Coins/ }));
    expect((screen.getByRole("textbox", { name: "Filter coins" }) as HTMLInputElement).value).toBe("USDC");
    ui.unmount(); mount(); expect(f.store.getSnapshot().ledger!.views.Coins.sort).toEqual({ key: "symbol", dir: 1 });
  });
  it("hides and inerts compact reading panes, restores on Return, and lifts row hover", () => {
    mount(); fireEvent.click(screen.getByRole("tab", { name: /Coins/ }));
    const row = screen.getByRole("button", { name: /USDC.*Read record/ }).closest("tr")!;
    fireEvent.mouseEnter(row); expect(f.store.getSnapshot().hover?.id).toBe(f.model.boats[0].id);
    fireEvent.mouseLeave(row); expect(f.store.getSnapshot().hover).toBeNull();
    act(() => f.resize(1000, 800)); fireEvent.click(within(row).getByRole("button", { name: /Read record/ }));
    expect(screen.queryByRole("dialog", { name: /What you/ })).toBeNull(); expect(document.querySelector(".hb-ledger")?.hasAttribute("inert")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Return to ledger" })); expect(screen.getByRole("tabpanel")).toBeTruthy();
  });
  it("offers readable and locatable chains, admission records and live-payload wrecks", () => {
    const dead = { id: "dead", name: "Dead Coin", symbol: "DEAD", deathDate: "2020-01", causeOfDeath: "abandoned", peakMcap: 1e8, pegCurrency: "USD", obituary: "A closed coin.", sourceUrl: "", sourceLabel: "" } satisfies DeadStablecoin;
    installDeadRecords([dead]); installYardBook([{ id: "yard", name: "Yard Coin", symbol: "YARD", phase: "announced" }]);
    f.model.readings.wrecks = [{ id: "dead", name: "Dead Coin", symbol: "DEAD", deathDate: "2020-01", cause: "abandoned", family: "wind-down", peakMcap: 1e8 }] as typeof f.model.readings.wrecks;
    f.model.boats.push({ ...f.model.boats[0], id: "dead", symbol: "DEAD", state: "wrecked" }); mount();
    for (const [tab, label, kind, id] of [["Chains", "Ethereum", "harbour", "Ethereum"], ["Admission", "YARD", "yard", "yard"], ["Wrecks", "Dead Coin", "boat", "dead"]] as const) {
      fireEvent.click(screen.getByRole("tab", { name: new RegExp(tab) }));
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`${label}.*Read record`) }));
      expect(f.store.getSnapshot().selected).toEqual({ kind, id });
      fireEvent.click(screen.getByRole("button", { name: "Return to ledger" }));
    }
  });
});

it("combines every coin predicate against reported supply, independently of berth and grade", () => {
  const base = f.model.boats[0], filters = { ...clearCoinFilters(), offPeg: true, warning: true, peg: base.pegType, chain: "Tron" };
  const coin = { ...base, activeDepeg: true, dews: "ALERT" as const, chainShares: [{ chain: "Tron", usd: 1, share: 0.01 }], grade: "NR" };
  expect(matchesCoinFilters(coin, filters)).toBe(true);
  expect(matchesCoinFilters({ ...coin, chainShares: [{ chain: "Tron", usd: 0, share: 0 }] }, filters)).toBe(false);
  expect(matchesCoinFilters({ ...coin, nullPeg: true }, { ...clearCoinFilters(), missingPeg: true })).toBe(true);
  expect(matchesCoinFilters({ ...coin, dews: "WATCH" }, filters)).toBe(false);
});

it("filters chain members, clears to every model ID, and exposes independent source states", () => {
  f.model.boats.push({ ...f.model.boats[0], id: "other", symbol: "OTHER", chainShares: [{ chain: "Tron", usd: 50, share: 1 }], nullPeg: true, grade: null });
  f.model.truth.stress.state = "stale"; mount(); act(() => f.store.coinsOnChain("Ethereum"));
  expect(screen.getByRole("heading", { name: "Coins with supply on Ethereum" })).toBeTruthy();
  expect([...document.querySelectorAll("[data-row]")].map((r) => (r as HTMLElement).dataset.row)).toEqual([f.model.boats[0].id]);
  expect(screen.getByText(/Stress readings: stale/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(new Set([...document.querySelectorAll("[data-row]")].map((r) => (r as HTMLElement).dataset.row))).toEqual(new Set(f.model.boats.map((b) => b.id)));
  fireEvent.click(screen.getByRole("checkbox", { name: "Missing peg reading" })); expect(document.querySelectorAll("[data-row]")).toHaveLength(1);
});

it("puts qualified facts and full caveats before scenery and source links", () => {
  mount(); act(() => f.store.select({ kind: "boat", id: f.model.boats[0].id }, { fly: false }));
  const record = screen.getByRole("complementary"), headings = within(record).getAllByRole("heading");
  expect(headings[1].textContent).toBe("Supply (USD)");
  const scenery = within(record).getByText("How this appears in the harbour"), sources = within(record).getByText("Sources");
  expect(headings[1].compareDocumentPosition(scenery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(scenery.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  act(() => { f.model.boats[0].activeDepeg = true; f.store.set({ model: { ...f.model } }); });
  expect(within(record).getAllByRole("heading")[1].textContent).toBe("Peg");
  fireEvent.click(within(record).getByRole("button", { name: "How to read this" })); expect(f.store.getSnapshot().guideStop).toBe(1);
});

it("returns focus to the ledger title when the originating row is no longer reported", () => {
  f.store.updateLedger({ tab: "Coins", returning: true }); f.store.updateLedgerView("Coins", { row: "missing" });
  mount(); expect(document.activeElement).toBe(screen.getByRole("heading", { name: "What you are looking at" }));
});
