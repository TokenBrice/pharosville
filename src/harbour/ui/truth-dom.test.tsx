// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { endpointProjector, type ProjectionJson } from "../../../functions/api/_project";
import type { MintBurnCoinCoverage, MintBurnValuation } from "@shared/types/mint-burn";
import { buildHarbourModel } from "../model/build";
import type { DewsBand, HarbourModel, HarbourPayloads } from "../model/types";
import { mastForBand } from "../readings/bind";
import { ChainSplit, FlowBars, TideBars } from "./bits";
import { allocationLine, BOAT_SIGNALS_RULE, BY_EAR, FAR_PORTS_LINE, landmarkFact, SOUND_FLOW, SOUND_PHAROS, SOUND_SURF, STATION_RULE } from "./facts";
import { coinNet, CUSTOMS_BARS, NET_UNAVAILABLE, VALUATION_UNKNOWN, type CoinFlow, type FlowHour } from "./flow-copy";
import { Ledger } from "./Ledger";
import { SidePanel } from "./Panel";
import type { PickHit } from "./services";
import type { UIState } from "./store";

const { state, services, store } = vi.hoisted(() => {
  const state = { model: null as HarbourModel | null, selected: null as PickHit | null, ledgerOpen: true, reducedMotion: true };
  const services = new Map<string, unknown>();
  return { state, services, store: {
    ctx: { services }, getSnapshot: () => state, select: vi.fn(),
    whereaboutsOf: () => ({ kind: "moored", place: "Ethereum" }),
  } };
});
vi.mock("./hooks", () => ({
  useStore: () => store, useUI: () => state,
  useUISlice: (select: (s: UIState) => unknown) => select(state as UIState),
  usePresence: (open: boolean) => [open, open], useSticky: (value: unknown) => value,
}));

const NOW = 1_790_000_000_000;
const snap = <T,>(data: T) => ({ data, meta: { updatedAt: NOW / 1000 - 60, ageSeconds: 60, status: "fresh" as const }, fetchedAtMs: NOW });
const project = (key: Parameters<typeof endpointProjector>[0], data: object) => endpointProjector(key)(data as ProjectionJson);
function model(): HarbourModel {
  // Same Calm giant / one small Alert fixture as readings/bind.test.ts, through the projector.
  return buildHarbourModel({
    stablecoins: snap(project("stablecoins", { peggedAssets: [
      { id: "a", name: "A", symbol: "A", pegType: "peggedUSD", circulating: { peggedUSD: 90e9 }, chainCirculating: { Ethereum: { current: 90e9 } }, chains: ["Ethereum"] },
      { id: "b", name: "B", symbol: "B", pegType: "peggedUSD", circulating: { peggedUSD: 5e9 }, chainCirculating: { Tron: { current: 5e9 } }, chains: ["Tron"] },
    ] })),
    stress: snap(project("stress", { signals: { a: { score: 10, band: "CALM" }, b: { score: 70, band: "ALERT" } } })),
  } as HarbourPayloads, NOW);
}
function panel(id: string, kind: PickHit["kind"] = "landmark") {
  state.selected = { kind, id };
  return render(<SidePanel onClose={() => {}} />);
}
function section(title: string) { return within(screen.getByRole("heading", { name: title }).closest("section")!); }
const valuation: MintBurnValuation = { completeness: "complete", mintCompleteness: "complete", burnCompleteness: "complete", unpricedMintEventCount: 0, unpricedBurnEventCount: 0 };
const coverage: MintBurnCoinCoverage = { status: "full", has24hWindow: true, has30dWindow: false, has90dWindow: false, historyStartAt: NOW / 1000 - 8 * 86400, isPartial: false, startBlock: 0, lastSyncedBlock: 100, lagBlocks: 0 };
const coinFlow = (): CoinFlow & { stablecoinId: string } => ({ stablecoinId: "a", netFlow24hUsd: 0, mintVolume24hUsd: 100, burnVolume24hUsd: 100, netFlow7dUsd: 0, coverage: { ...coverage }, valuation: { window24h: { ...valuation }, baseline: "complete", netFlow7d: "complete", netFlow30d: "complete", netFlow90d: "complete" } });
function feed(coin: object) { services.set("feed", { payloads: { mintBurn: snap({ coins: [coin] }) } }); }
const hours = (): FlowHour[] => Array.from({ length: 24 }, (_, i) => ({ hourTs: 3600 * i, mintUsd: 100, burnUsd: 90, netUsd: 10, valuation: "complete" }));

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); services.clear(); state.model = model(); state.selected = null; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("station mast, separate coin counts and sound legend", () => {
  it.each([
    ["CALM", "no shapes", 0], ["WATCH", "one cone", 1], ["ALERT", "two cones", 2],
    ["WARNING", "two cones and one drum", 3], ["DANGER", "two cones and two drums with a red pennant", 4],
  ] as const)("%s has the same band-derived reading in hover, panel and ledger", (band, shapes, count) => {
    const m = state.model!;
    expect(m.readings.stormCones?.count).toBe(1);
    if (band === "CALM") expect(m.readings.weather.band).toBe("CALM");
    m.readings.weather = { ...m.readings.weather, band: band as DewsBand };
    expect(mastForBand(band).cones).toBe(count);
    const expected = `Station: ${band.charAt(0) + band.slice(1).toLowerCase()}; ${shapes}.`;
    expect(landmarkFact("storm-mast", m, null).fact).toBe(expected);
    const ui = panel("storm-mast");
    expect(screen.getByText(expected)).toBeTruthy();
    expect(screen.getByText("1 covered coins are at Alert or worse.")).toBeTruthy();
    expect(screen.getByText(STATION_RULE)).toBeTruthy();
    expect(screen.getByText(BOAT_SIGNALS_RULE)).toBeTruthy();
    ui.unmount();
    render(<Ledger onClose={() => {}} />);
    expect(screen.getByText(expected)).toBeTruthy();
    expect(screen.getByText(BY_EAR)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "By ear" })).toBeTruthy();
  });

  it("unknown and stale station readings never describe a Calm mast", () => {
    state.model!.readings.weather.band = null;
    panel("storm-mast");
    expect(screen.getByText("Station: unavailable.")).toBeTruthy();
    expect(landmarkFact("storm-mast", state.model, null).fact).toBe("Station: unavailable.");
    state.model!.readings.weather = { ...model().readings.weather, stale: true };
    expect(landmarkFact("storm-mast", state.model, null).fact).toBe("Station: unavailable.");
  });

  it.each([["shoals", SOUND_SURF], ["pharos", SOUND_PHAROS], ["mint", SOUND_FLOW], ["burn", SOUND_FLOW]])("%s repeats its By ear sentence", (id, copy) => {
    panel(id);
    expect(screen.getByText(copy)).toBeTruthy();
    expect(BY_EAR).toContain(copy);
  });
});

describe("honest flow details", () => {
  it("preserves withheld nets, labels side-specific gross lower bounds and keeps real zero", () => {
    const coin = coinFlow();
    coin.netFlow24hUsd = null; coin.netFlow7dUsd = null;
    coin.valuation!.window24h = { ...valuation, completeness: "partial", mintCompleteness: "partial" };
    coin.valuation!.netFlow7d = "partial";
    feed(coin);
    const ui = panel("a", "boat");
    const flows = section("Mint & burn");
    expect(flows.getByText(NET_UNAVAILABLE)).toBeTruthy();
    expect(flows.getByText("At least $100 minted.")).toBeTruthy();
    expect(flows.getByText("$100 burned.")).toBeTruthy();
    expect(flows.getAllByText("—")).toHaveLength(2);
    expect(flows.queryByText("$0")).toBeNull();
    ui.unmount(); feed(coinFlow()); panel("a", "boat");
    expect(section("Mint & burn").getAllByText("$0")).toHaveLength(2);
  });

  it.each(["full", "partial-history", "lagging", "bootstrapping", "disabled", "unknown"] as const)("handles %s coverage without inventing a complete window", (status) => {
    const coin = coinFlow(); coin.coverage!.status = status;
    feed(coin); panel("a", "boat");
    const flows = section("Mint & burn");
    if (status === "full") expect(flows.getAllByText("$0")).toHaveLength(2);
    else {
      expect(flows.queryByText("$0")).toBeNull();
      expect(flows.getByText(status === "lagging" ? "Flow coverage is lagging." : status === "disabled" || status === "unknown" ? "Flow reading unavailable." : "Partial history")).toBeTruthy();
    }
  });

  it("requires window proof and seven days of history; old projection evidence stays unknown", () => {
    const coin = coinFlow(); coin.coverage!.has24hWindow = false;
    expect(coinNet(coin, 1, NOW / 1000)).toBeNull();
    coin.coverage!.has24hWindow = true; coin.coverage!.historyStartAt = NOW / 1000 - 6 * 86400;
    expect(coinNet(coin, 7, NOW / 1000)).toBeNull();
    const legacy = project("mintBurn", { hourly: [], coins: [{ stablecoinId: "a", coverage: { status: "full" }, netFlow24hUsd: null, netFlow7dUsd: null, mintVolume24hUsd: 0, burnVolume24hUsd: 0 }] }) as { coins: object[] };
    feed(legacy.coins[0]);
    const ui = panel("a", "boat");
    expect(section("Mint & burn").getByText("Flow reading unavailable.")).toBeTruthy();
    ui.unmount(); feed({ ...coinFlow(), valuation: undefined }); panel("a", "boat");
    expect(section("Mint & burn").getByText(VALUATION_UNKNOWN)).toBeTruthy();
    expect(section("Mint & burn").queryByText("$0")).toBeNull();
  });

  it("absent and disabled coverage are unavailable", () => {
    const coin = coinFlow(); delete coin.coverage;
    feed(coin); panel("a", "boat");
    expect(section("Mint & burn").getByText("Flow reading unavailable.")).toBeTruthy();
    expect(section("Mint & burn").queryByText("$0")).toBeNull();
  });

  it("Customs describes net bars and partial histories; unknown scope never defaults to three chains", () => {
    const hourly = hours().slice(1).map((h) => ({ ...h, netUsd: null, valuation: "partial" as const }));
    state.model!.readings.flows = { hourly, net24hUsd: null, available: true, stale: false, scope: [] };
    const ui = panel("customs-house");
    expect(screen.getByText(CUSTOMS_BARS, { exact: false })).toBeTruthy();
    expect(screen.getByText("At least $2.30K minted.")).toBeTruthy();
    expect(screen.getAllByText(NET_UNAVAILABLE)[0]).toBeTruthy();
    expect(screen.getByText("Flow scope is unavailable.")).toBeTruthy();
    expect(landmarkFact("mint", state.model, null).fact).toContain("Partial history");
    ui.unmount(); panel("mint");
    expect(screen.getByText("Flow scope is unavailable.")).toBeTruthy();
    expect(screen.queryByText(/Mint outworks/)).toBeNull();
    expect(screen.getByText(/fires are banked/)).toBeTruthy();
  });

  it("empty series is unavailable, while gross charts disclose lower bounds", () => {
    state.model!.readings.flows = { hourly: [], net24hUsd: 0, available: true, stale: false, scope: [] };
    const ui = panel("customs-house");
    expect(screen.getByText(/no flow reading/)).toBeTruthy();
    expect(landmarkFact("mint", state.model, null).fact).toContain("no flow reading");
    ui.unmount();
    render(<><TideBars hourly={hours()} /><FlowBars hourly={hours().map((h) => ({ ...h, valuation: "unknown" }))} side="mint" /></>);
    expect(screen.getByText("net minted above, net burned below")).toBeTruthy();
    expect(screen.getByText("minted each hour · lower bounds")).toBeTruthy();
    fireEvent.mouseEnter(document.querySelector(".hb-flowbars g")!);
    expect(screen.getAllByText(/At least \$100 minted/)[0]).toBeTruthy();
  });

  it("unknown hourly valuation leaves a labelled gap rather than a net bar", () => {
    render(<TideBars hourly={hours().map((h) => ({ ...h, valuation: "unknown" }))} />);
    expect(document.querySelectorAll(".hb-bars g line")).toHaveLength(24);
    fireEvent.mouseEnter(document.querySelector(".hb-bars g")!);
    expect(screen.getAllByText(VALUATION_UNKNOWN, { exact: false })[0]).toBeTruthy();
  });
});

describe("reported allocation and Registry reconciliation", () => {
  it.each([[60, "$40 has no reported chain allocation."], [120, "Reported totals do not reconcile."], [0, "$100 has no reported chain allocation."]])("discloses total 100 versus attributed %s", (attributed, line) => {
    const b = { ...state.model!.boats[0], supply: 100, chainShares: attributed ? [{ chain: "Ethereum", usd: attributed, share: 1 }] : [] };
    render(<ChainSplit boat={b} />);
    expect(screen.getByText(line)).toBeTruthy();
    if (attributed) expect(screen.getByText("Percentages are shares of reported chain-attributed holdings.")).toBeTruthy();
    expect(allocationLine([b])).toBe(line);
  });

  it("names the chain denominator and includes holders outside its quantized circuit", () => {
    const m = state.model!;
    m.boats[1].chainShares = [{ chain: "Ethereum", usd: 100, share: 1 }];
    expect(m.boats[1].circuit.some((s) => s.chain === "Ethereum")).toBe(false);
    panel("Ethereum", "harbour");
    expect(screen.getByText(/of reported chain-attributed supply/)).toBeTruthy();
    expect(section("Largest reported holdings").getByText("B")).toBeTruthy();
    expect(screen.getByText("1 boat calls here.", { exact: false })).toBeTruthy();
  });

  it("Far Ports and the chain ledger disclose unallocated supply", () => {
    const ui = panel("far-ports");
    expect(screen.getByText(FAR_PORTS_LINE)).toBeTruthy(); ui.unmount();
    render(<Ledger onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: /Chains/ }));
    expect(screen.getByText(FAR_PORTS_LINE)).toBeTruthy();
    expect(screen.getAllByText(/of reported chain-attributed supply/)).toHaveLength(2);
  });

  it("every live grade including NR/null appears once, with boat and ledger parity", () => {
    const m = state.model!;
    const grades = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F", "NR", null];
    m.boats = grades.map((grade, i) => ({ ...m.boats[0], id: String(i), symbol: `Coin${i}`, grade }));
    m.boats.push({ ...m.boats[0], id: "wreck", grade: "F", state: "wrecked" });
    m.truth.safetyGrades = { ...m.truth.safetyGrades, state: "current" };
    const ui = panel("registry");
    const counts = section("Safety grades");
    expect(counts.getByText("Not rated")).toBeTruthy();
    expect([...counts.getByText("Not rated").closest("dl")!.querySelectorAll("dd")].reduce((n, el) => n + Number(el.textContent), 0)).toBe(grades.length);
    ui.unmount(); panel("11", "boat");
    expect(section("Signals").getByText("Not rated.")).toBeTruthy(); cleanup();
    render(<Ledger onClose={() => {}} />); fireEvent.click(screen.getByRole("tab", { name: /Coins/ }));
    expect(screen.getAllByText("Not rated.")).toHaveLength(2);
    expect(screen.queryByText("NR")).toBeNull();
  });

  it("missing grade endpoint stays unavailable instead of classifying all boats as Not rated", () => {
    panel("registry");
    expect(screen.getAllByText("Safety grades: unavailable.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Safety grades" })).toBeNull();
  });
});

describe("admission, bounded visit observations and the finished visual key", () => {
  it("explains mainnet beta records as admission and exposes their full narrative", () => {
    services.set("civic", { yard: { coins: [{ id: "record", symbol: "REC", name: "Mainnet Pilot", launchPhase: "beta", launchPhaseDetail: "Already in pilot on mainnet. The complete recorded narrative.", expectedLaunchDate: "2026-Q4" }] } });
    panel("record", "yard");
    expect(screen.getByText("Awaiting admission to the tracked fleet.")).toBeTruthy();
    expect(screen.getByText("A Shipyard record may already be in pilot or on mainnet. Its hull follows the recorded phase; it joins the fleet when tracking inputs become available.")).toBeTruthy();
    const more = screen.getByText("More about this record");
    expect(more.closest("details")?.open).toBe(false);
    fireEvent.click(more);
    expect(screen.getByText("Already in pilot on mainnet. The complete recorded narrative.")).toBeTruthy();
  });

  it("honours an all-admitted civic yard without resurrecting bundled hulls", () => {
    services.set("civic", { yard: { coins: [] } });
    panel("slipway");
    expect(screen.getByText("No records are awaiting admission to the tracked fleet.")).toBeTruthy();
    expect(screen.getByText(/Bundled admission records; see sources for dates\./)).toBeTruthy();
  });

  it("shows the capped book, UTC dates, first observations and discarded counts; earlier entries stay within the cap", () => {
    const book = Array.from({ length: 200 }, (_, i) => ({ id: `${i}`, kind: "grade", atMs: NOW - i * 60000, firstSeenMs: NOW - i * 60000 - 10000, text: `Confirmed reading ${i}`, field: "grade", from: "B", to: "A", endpoint: "safetyGrades", coinId: null, staged: false }));
    services.set("events", { arrivedAtMs: NOW - 86400000, book, droppedCount: 1, subscribe: () => () => {} });
    panel("harbourmaster");
    expect(screen.getByText("Showing 40 of 200 retained entries; 1 earlier entries discarded.")).toBeTruthy();
    expect(screen.getByText(/Earliest retained confirmation: .* UTC\./)).toBeTruthy();
    expect(document.querySelectorAll(".hb-daybook > li")).toHaveLength(40);
    fireEvent.click(screen.getByRole("button", { name: "Show earlier entries" }));
    expect(document.querySelectorAll(".hb-daybook > li")).toHaveLength(80);
    expect(screen.getAllByText(/First observed .* UTC; confirmed .* UTC\./)).toHaveLength(80);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Show earlier entries" }));
    expect(document.querySelectorAll(".hb-daybook > li")).toHaveLength(200);
    expect(screen.queryByRole("button", { name: "Show earlier entries" })).toBeNull();
  });

  it("limits an empty book to confirmed changes recorded during this visit", () => {
    services.set("events", { arrivedAtMs: NOW, book: [], droppedCount: 0, subscribe: () => () => {} });
    panel("harbourmaster");
    expect(screen.getByText("No confirmed changes recorded this visit.")).toBeTruthy();
    expect(screen.getByText("State changes require two consecutive accepted readings. Completed, fully valued flow hours are evaluated once per new hour. Missing, stale and methodology-change readings do not establish market changes.")).toBeTruthy();
    expect(screen.queryByText(/Nothing has changed/)).toBeNull();
  });
});

describe("display integrity independent of endpoint truth", () => {
  it("retains stale PSI observations without labelling an old score now", () => {
    const m = state.model!;
    m.readings.psi = { ...m.readings.psi, score: 80, band: "STEADY", stale: true, lit: false };
    m.truth.stability = { state: "stale", sourceUpdatedAtMs: NOW - 86400000, ageSec: 86400, serverStatus: "stale" };
    services.set("feed", { payloads: { stability: { data: { history: [{ date: NOW / 1000 - 86400, score: 80, methodologyVersion: "v1" }] } } } });
    panel("pharos");
    expect(document.querySelectorAll(".hb-chart-observation")).toHaveLength(1);
    expect(document.querySelector(".hb-chart-now")).toBeNull();
    expect(screen.getByText("The beacon is unlit while its reading is stale.")).toBeTruthy();
  });
  it("keeps the Keeper’s Log incomplete warning through a pending revision, then clears a matching complete frame", async () => {
    const { publishPresentation } = await import("./presentation");
    publishPresentation(store.ctx, { status: "partial", revision: 1, displayed: 1, expected: 2 });
    const ui = panel("keeperslog");
    expect(screen.getByText("1 of 2 boats displayed. This view is incomplete.")).toBeTruthy();
    ui.unmount();
    publishPresentation(store.ctx, { status: "pending", revision: 1, displayed: 1, expected: 3 });
    const pending = panel("keeperslog");
    expect(screen.getByText("1 of 2 boats displayed. This view is incomplete.")).toBeTruthy();
    pending.unmount();
    publishPresentation(store.ctx, { status: "complete", revision: 2, displayed: 3, expected: 3 });
    panel("keeperslog");
    expect(screen.queryByText(/This view is incomplete/)).toBeNull();
  });
});
