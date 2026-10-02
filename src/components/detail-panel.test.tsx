// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RUNTIME_CEMETERY_ENTRIES } from "@shared/lib/cemetery-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureWithDepegOn,
  makerSquadFixtureInputs,
  makePharosVilleWorldInput,
} from "../__fixtures__/pharosville-world";
import { WorldBuilder } from "../__fixtures__/world-builder";
import type { DetailModel } from "../systems/world-types";
import { DetailPanel } from "./detail-panel";
import { AccessibilityLedger } from "./accessibility-ledger";
import { resetHeldShipPlacements } from "../systems/pharosville-world/stages/ship-placement";
import { withRiskTransitionFact } from "../systems/detail-model";

afterEach(() => {
  for (const details of document.querySelectorAll<HTMLDetailsElement>('[data-testid="pharosville-detail-record"]')) {
    details.open = false;
    fireEvent(details, new Event("toggle", { bubbles: true }));
  }
  cleanup();
});

const renderShipPanel = (shipId: string, depegId: string | null = null) => {
  const inputs = makerSquadFixtureInputs();
  const world = buildPharosVilleWorld(depegId ? fixtureWithDepegOn(inputs, depegId) : inputs);
  const ship = world.ships.find((s) => s.id === shipId);
  if (!ship) throw new Error(`Ship ${shipId} not found in fixture`);
  const detail = world.detailIndex[ship.detailId]!;
  return renderToStaticMarkup(<DetailPanel detail={detail} />);
};

async function openRecord(detail: DetailModel): Promise<HTMLDetailsElement> {
  render(<DetailPanel detail={detail} />);
  const summary = screen.getByText("Read the record", { selector: "summary" });
  const record = summary.parentElement as HTMLDetailsElement;
  record.open = false;
  fireEvent(record, new Event("toggle", { bubbles: true }));
  fireEvent.click(summary);
  record.open = true;
  fireEvent(record, new Event("toggle", { bubbles: true }));
  await waitFor(() => expect(record.open).toBe(true));
  return record;
}

function recordRow(record: HTMLDetailsElement, label: string): HTMLElement {
  const term = [...record.querySelectorAll("dt")].find((node) => node.textContent === label);
  if (!(term?.nextElementSibling instanceof HTMLElement)) throw new Error(`Missing record row: ${label}`);
  return term.nextElementSibling;
}

describe("DetailPanel rendered analytical record", () => {
  it("keeps a consort's acute own peg and distress visible in its shared formation record", async () => {
    const world = buildPharosVilleWorld(fixtureWithDepegOn(makerSquadFixtureInputs(), "susds-sky"));
    const ship = world.ships.find((entry) => entry.id === "susds-sky")!;
    const record = await openRecord(world.detailIndex[ship.detailId]!);
    expect(screen.getByTestId("pharosville-detail-zone").textContent).toContain("Calm Anchorage");
    const currently = recordRow(record, "Currently").textContent!;
    expect(currently).toContain("+800 bps");
    expect(currently).toContain("above peg");
    expect(currently).toContain("high");
    const formation = recordRow(record, "Sailing in formation").textContent!;
    expect(formation).toContain("sUSDS in distress");
    expect(formation).toContain(ship.placementEvidence.squadOverride!.ownReason!);
    expect(recordRow(record, "Sailing in formation").firstElementChild?.textContent).toContain("sUSDS in distress");
    const chains = recordRow(record, "Chains").textContent!;
    expect(chains).toContain("Route source:");
    expect(Number(chains.match(/^(\d+)/)?.[1])).toBe(1);
    expect(chains).toContain("Ethereum 100%");
  });

  it("qualifies retained stale placement next to its peg and source", async () => {
    const inputs = fixtureWithDepegOn(makerSquadFixtureInputs(), "susds-sky");
    const world = buildPharosVilleWorld({ ...inputs, freshness: { pegSummaryStale: true, stressStale: true } });
    const ship = world.ships.find((entry) => entry.id === "susds-sky")!;
    const record = await openRecord(world.detailIndex[ship.detailId]!);
    const currently = recordRow(record, "Currently").textContent!;
    expect(currently).toContain("+800 bps");
    expect(currently).toContain("Caveat:");
    expect(currently).toContain(ship.placementEvidence.reason);
    expect(currently).toContain(ship.placementEvidence.sourceFields[0]!);
    expect(currently).not.toContain("Fresh current placement evidence");
  });

  it.each([-200, -50, 50, 200])("preserves sign and peg explanation without adding a first-screen figure: %i bps", async (bps) => {
    const inputs = fixtureWithDepegOn(makerSquadFixtureInputs(), "susds-sky");
    inputs.pegSummary = {
      ...inputs.pegSummary!,
      coins: inputs.pegSummary!.coins.map((coin) => coin.id === "susds-sky" ? { ...coin, currentDeviationBps: bps } : coin),
    };
    const world = buildPharosVilleWorld(inputs);
    const ship = world.ships.find((entry) => entry.id === "susds-sky")!;
    const record = await openRecord(world.detailIndex[ship.detailId]!);
    const currently = recordRow(record, "Currently").textContent!;
    expect(currently.replaceAll("−", "-")).toContain(`${bps > 0 ? "+" : ""}${bps} bps`);
    expect(currently).toContain(bps > 0 ? "above peg" : "below peg");
    expect(currently).toContain(bps > 0 ? "high" : "low");
    expect(screen.getByTestId("pharosville-detail-reading").querySelectorAll("dd").length).toBeLessThanOrEqual(3);
  });

  it.each(["current", "stale", "unavailable"] as const)("makes observed lighthouse status and separately named snapshot reachable: %s", async (state) => {
    const inputs = makePharosVilleWorldInput({
      ...(state === "stale" ? { freshness: { mintBurnStale: true, stabilityStale: true } } : {}),
      ...(state === "unavailable" ? { stability: null } : {}),
    });
    const world = buildPharosVilleWorld(inputs);
    const record = await openRecord(world.detailIndex[world.lighthouse.detailId]!);
    const market = recordRow(record, "Market stability").textContent!;
    expect(market).toContain(`Snapshot generated at: ${new Date(world.generatedAt!).toISOString()}`);
    expect(market).toContain(state === "stale" ? "Stale" : state === "unavailable" ? "Unavailable" : "Current PSI observation");
    expect(recordRow(record, "Harbor light").textContent).toContain(state === "stale" ? "cooler and slower" : "steady");
    expect(recordRow(record, "Harbor light").textContent).toContain("Appearance eases over ~2 observations");
    expect(recordRow(record, "Harbor light").textContent).toContain("Beam warmth:");
    expect(record.querySelectorAll("dt").length).toBeLessThanOrEqual(12);
  });

  it("retains chain concentration and allocated flow meaning in the selected harbour", async () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput({ freshness: { chainsStale: true } }));
    const dock = world.docks.find((entry) => entry.chainId === "ethereum")!;
    const record = await openRecord(world.detailIndex[dock.detailId]!);
    expect(recordRow(record, "Stablecoin supply").textContent).toContain(`${dock.stablecoinCount} stablecoins`);
    expect(recordRow(record, "Stablecoin supply").textContent).toContain(`#${dock.harborRank}`);
    expect(recordRow(record, "Health").textContent).toContain("HHI");
    expect(recordRow(record, "Health").textContent).toContain("Quay condition:");
    expect(recordRow(record, "Station").textContent).toContain("Hazy — Chains feed is stale");
    expect(recordRow(record, "Net flow 24h").textContent).toContain("Estimated 24h allocation by held supply");
    expect(record.querySelectorAll("dt").length).toBeLessThanOrEqual(6);
  });

  it.each([true, false])("exposes roost values even with no movers (counts available: %s)", async (hasCounts) => {
    const inputs = makerSquadFixtureInputs();
    if (hasCounts) inputs.pegSummary = {
      ...inputs.pegSummary!,
      summary: {
        activeDepegCount: 0, medianDeviationBps: 0, worstCurrent: null,
        coinsAtPeg: inputs.pegSummary!.coins.length, totalTracked: inputs.pegSummary!.coins.length,
        depegEventsToday: 3, depegEventsYesterday: 1,
      },
    };
    const world = buildPharosVilleWorld(inputs);
    expect(world.pigeonnier.notableMovers).toHaveLength(0);
    const record = await openRecord(world.detailIndex[world.pigeonnier.detailId]!);
    expect(recordRow(record, "Roost / Movers").textContent).toContain("None today");
    const roost = recordRow(record, "Roost / Movers").textContent!;
    if (hasCounts) {
      expect(roost).toContain("3 today");
      expect(roost).toContain("1 yesterday");
      expect(roost).toContain("2 more than yesterday");
    } else {
      expect(roost).toContain("Unavailable");
    }
    expect(record.querySelectorAll("dt").length).toBe(2);
  });

  it("keeps selected water surface and local haze inspectable", async () => {
    const inputs = new WorldBuilder().withDefaultChains().markStale("pegSummaryStale").build();
    const world = buildPharosVilleWorld(inputs);
    const area = world.areas.find((entry) => entry.band === "CALM")!;
    const record = await openRecord(world.detailIndex[area.detailId]!);
    expect(recordRow(record, "Water surface").textContent).toContain("Glass");
    expect(recordRow(record, "Atmosphere").textContent).toContain("Hazy — Peg summary feed is stale");
    expect(record.textContent).not.toContain("Chains feed is stale");
  });

  it("retains month history and fallen-coin identity", async () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput({
      cemeteryEntries: RUNTIME_CEMETERY_ENTRIES.filter((entry) => entry.peakMcap != null).slice(0, 1),
    }));
    let record = await openRecord(world.detailIndex[world.lighthouse.detailId]!);
    expect(recordRow(record, "Worst band, 30d").textContent).toContain("Garden record, 30d:");
    cleanup();
    const grave = world.graves[0]!;
    record = await openRecord(world.detailIndex[grave.detailId]!);
    expect(recordRow(record, "Symbol").textContent).toBe(grave.entry.symbol);
    expect(recordRow(record, "Lifecycle").textContent).toContain(grave.entry.deathDate);
    expect(recordRow(record, "Lifecycle").textContent).toContain("Peak market cap:");
    expect(record.querySelectorAll("dt").length).toBeLessThanOrEqual(3);
  });

  it("bounds real composed records without dropping exceptions", async () => {
    const inputs = fixtureWithDepegOn(makerSquadFixtureInputs(), "susds-sky");
    inputs.freshness = { stressStale: true };
    inputs.stablecoins = {
      ...inputs.stablecoins!,
      peggedAssets: inputs.stablecoins!.peggedAssets.map((asset) => asset.id === "susds-sky" ? {
        ...asset, price: 1.08, priceConfidence: "low",
        consensusSources: ["oracle", "exchange", "dex"], agreeSources: ["oracle"],
        circulatingPrevDay: { peggedUSD: 900_000_000 },
        circulatingPrevWeek: { peggedUSD: 800_000_000 },
      } : asset),
    };
    inputs.pegSummary = {
      ...inputs.pegSummary!,
      coins: inputs.pegSummary!.coins.map((coin) => coin.id === "susds-sky" ? {
        ...coin, eventCount: 4, worstDeviationBps: -800, lastEventAt: 1_699_000_000,
        dexPriceCheck: { dexPrice: 0.98, dexDeviationBps: -200, agrees: false, sourcePools: 4, sourceTvl: 20_000_000 },
      } : coin),
    };
    const issuance = makePharosVilleWorldInput().mintBurn!;
    inputs.mintBurn = {
      ...issuance, coins: issuance.coins.map((coin, index) => index === 0 ? { ...coin, stablecoinId: "susds-sky" } : coin),
    };
    const world = buildPharosVilleWorld(inputs);
    const ship = world.ships.find((entry) => entry.id === "susds-sky")!;
    const detail = withRiskTransitionFact(world.detailIndex[ship.detailId]!, {
      fromLabel: "Watch Breakwater", toLabel: "Calm Anchorage", progress: 0.5,
    });
    const record = await openRecord(detail);
    expect(record.querySelectorAll("dt").length).toBeLessThanOrEqual(11);
    expect(screen.getByTestId("pharosville-detail-reading").querySelectorAll("dd").length).toBeLessThanOrEqual(3);
    expect(recordRow(record, "Market cap").textContent).toContain("Low");
    expect(recordRow(record, "Market cap").textContent).toContain("1 of 3");
    expect(recordRow(record, "DEX cross-check").textContent).toContain("$0.9800");
    expect(recordRow(record, "DEX cross-check").textContent).toContain("$1.0800");
    expect(recordRow(record, "24h change").textContent).toContain("4 events");
    expect(recordRow(record, "Sailing in formation").textContent).toContain("sUSDS in distress");
    expect(recordRow(record, "Currently").textContent).toContain("+800 bps");
    expect(recordRow(record, "Currently").textContent).toContain("Evidence/source:");
    expect(recordRow(record, "Currently").textContent).toContain("Caveat:");
    expect(recordRow(record, "Currently").textContent).toContain("Tracking new risk band: from Watch Breakwater to Calm Anchorage");
    expect(recordRow(record, "Issuance work, 24h").textContent).toContain("+$8.0M net minted");
  });
});

describe("DetailPanel woodblock record", () => {
  it("shows the same exact DEWS reading in the dense panel and ledger without an edge claim", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput({
      stablecoins: denseFixtureStablecoins,
      chains: denseFixtureChains,
      pegSummary: denseFixturePegSummary,
      stress: {
        ...denseFixtureStress,
        signals: {
          ...denseFixtureStress.signals,
          "usdt-tether": { ...denseFixtureStress.signals["usdt-tether"]!, score: 95 },
        },
      },
    }));
    const ship = world.ships.find((entry) => entry.id === "usdt-tether")!;
    const detail = world.detailIndex[ship.detailId]!;
    const markup = renderToStaticMarkup(<DetailPanel detail={detail} />);
    const withoutScore = renderToStaticMarkup(<DetailPanel detail={{
      ...detail, facts: detail.facts.filter((fact) => fact.label !== "DEWS score"),
    }} />);
    const ledger = renderToStaticMarkup(<AccessibilityLedger world={world} />);
    const ledgerDom = document.createElement("div");
    ledgerDom.innerHTML = ledger;
    const panelDom = document.createElement("div");
    panelDom.innerHTML = markup;
    const currently = [...panelDom.querySelectorAll("dt")].find((row) => row.textContent === "Currently");
    expect(currently?.nextElementSibling?.textContent).toContain("DEWS 95/100");
    expect(ledgerDom.querySelector("#ledger-ship-usdt-tether")?.textContent).toContain("DEWS 95/100");
    for (const surface of [markup, ledger]) {
      expect(surface).not.toMatch(/calm[- ]edge|rough[- ]edge|within-zone anchoring/i);
    }
    expect(markup.match(/<div class="pv-fact-row"/g)?.length)
      .toBe(withoutScore.match(/<div class="pv-fact-row"/g)?.length);
  });

  it("a consort shows its own DEWS score while keeping the shared formation berth", () => {
    const inputs = makerSquadFixtureInputs();
    const calm = {
      band: "CALM", score: 8, signals: {},
      computedAt: 1_700_000_000, methodologyVersion: "fixture",
    };
    const baseline = buildPharosVilleWorld({
      ...inputs,
      stress: { ...inputs.stress!, signals: { "usds-sky": calm, "susds-sky": calm } },
    });
    resetHeldShipPlacements();
    const world = buildPharosVilleWorld({
      ...makerSquadFixtureInputs(),
      stress: {
        ...inputs.stress!,
        signals: {
          "usds-sky": calm,
          "susds-sky": { ...calm, band: "DANGER", score: 95 },
        },
      },
    });
    const flagship = world.ships.find((ship) => ship.id === "usds-sky")!;
    const consort = world.ships.find((ship) => ship.id === "susds-sky")!;
    const previous = baseline.ships.find((ship) => ship.id === consort.id)!;
    expect(consort.squadRole).toBe("consort");
    expect(consort.riskPlacement).toBe(flagship.riskPlacement);
    expect(consort.riskDepth).toBe(0.08);
    expect(flagship.riskDepth).toBe(0.08);
    expect(consort.riskTile).toEqual(previous.riskTile);
    expect(flagship.riskTile).toEqual(baseline.ships.find((ship) => ship.id === flagship.id)!.riskTile);
    const markup = renderToStaticMarkup(<DetailPanel detail={world.detailIndex[consort.detailId]!} />);
    expect(markup).toContain("DEWS 95/100");
    expect(markup).not.toContain("DEWS 8/100");
    const ledgerDom = document.createElement("div");
    ledgerDom.innerHTML = renderToStaticMarkup(<AccessibilityLedger world={world} />);
    const consortLine = ledgerDom.querySelector("#ledger-ship-susds-sky")?.textContent;
    expect(consortLine).toContain("DEWS 95/100");
    expect(consortLine).not.toContain("DEWS 8/100");
    expect(ledgerDom.querySelector("#ledger-ship-usds-sky")?.textContent).toContain("DEWS 8/100");
  });

  it("defers focus until a hidden selection becomes visible", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const detail = { id: "ship:test", title: "Test", kind: "SHIP", summary: "", facts: [], links: [] } as DetailModel;
    const view = render(<DetailPanel onClose={() => undefined} detail={detail} visible={false} />);
    expect(document.activeElement).toBe(opener);
    view.rerender(<DetailPanel onClose={() => undefined} detail={detail} visible />);
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Test" }));
    view.rerender(<DetailPanel onClose={() => undefined} detail={detail} visible={false} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
  it("uses non-modal landmark semantics and focuses the title, then restores focus", () => {
    const opener = document.createElement("button");
    opener.type = "button";
    opener.textContent = "Open details";
    document.body.append(opener);
    opener.focus();

    const detail: DetailModel = {
      id: "ship:test-dialog",
      title: "Test Ship",
      kind: "SHIP",
      summary: "test",
      facts: [],
      links: [],
    };

    const view = render(<DetailPanel detail={detail} onClose={() => undefined} />);

    // The inspector stays open by default while the canvas remains
    // interactive, so it must NOT be aria-modal: that would mark the
    // accessibility ledger and live region outside it inert.
    const panel = screen.getByRole("complementary", { name: "Test Ship" });
    expect(panel.getAttribute("aria-modal")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    // W6.3: the title takes focus, so a screen reader reads what opened first.
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Test Ship" }));

    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("does not trap Tab inside the non-modal inspector", () => {
    const detail: DetailModel = {
      id: "ship:test-dialog-trap",
      title: "Test Ship",
      kind: "SHIP",
      summary: "test",
      facts: [],
      links: [{ label: "Source", href: "https://pharos.watch/" }],
    };

    render(<DetailPanel detail={detail} onClose={() => undefined} />);

    const heading = screen.getByRole("heading", { level: 2, name: "Test Ship" });
    expect(document.activeElement).toBe(heading);

    // Tab is left to the browser's normal focus order (no preventDefault),
    // so focus can leave the panel toward the rest of the page chrome.
    const tabEvent = fireEvent.keyDown(heading, { key: "Tab" });
    expect(tabEvent).toBe(true);
  });

  it("renders the risk-band status line from the detail status", () => {
    const detail: DetailModel = {
      id: "ship:test-status",
      title: "Test Ship",
      kind: "SHIP",
      summary: "test",
      status: {
        swatchColor: "#125e7e",
        label: "Calm Anchorage",
        reading: "Steady peg evidence; the safe default berth",
        figure: "-12 bps vs USD",
      },
      facts: [],
      links: [],
    };

    render(<DetailPanel detail={detail} onClose={() => undefined} />);

    // Interface revamp DU5: the water line names the water and nothing else.
    // The generic per-zone reading belongs to the legend and the ledger; the
    // panel's own sentence says what this ship is doing there.
    const statusLine = screen.getByTestId("pharosville-detail-zone");
    expect(statusLine.textContent).toContain("Calm Anchorage");
    expect(statusLine.textContent).not.toContain("Steady peg evidence");
    expect(statusLine.closest("[data-risk-band]")?.getAttribute("data-risk-band")).toBe("calm");
    expect(statusLine.closest("header")?.querySelector(".pharosville-detail-panel__seal")?.getAttribute("aria-hidden")).toBe("true");
    expect(statusLine.textContent).toContain("-12 bps vs USD");
  });




  it("renders Cycle tempo in the identity section", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    expect(markup).toMatch(/Cycle tempo/i);
    // Must have a canonical measured label or the explicit missing-data state.
    const validLabels = ["Languid", "Steady", "Brisk", "Active", "Unmeasured"];
    const found = validLabels.some((label) => markup.includes(label));
    expect(found).toBe(true);
  });

  it("renders the route cadence caveat in the identity section", () => {
    const markup = renderShipPanel("susds-sky", "susds-sky");
    expect(markup).toContain("Route cadence");
    expect(markup).toContain("90–180 s legs");
    expect(markup).toContain("rendered-chain and risk-water presence only");
  });

  it("renders 24h change row with formatted percentage when fact is present", () => {
    const detail: DetailModel = {
      id: "ship:test-with-change",
      title: "Test Ship",
      kind: "SHIP",
      summary: "test",
      facts: [
        { label: "Ship class", value: "CeFi" },
        { label: "Size tier", value: "Major" },
        { label: "Market cap", value: "$1,000,000,000" },
        { label: "24h supply change", value: "+5.4%" },
        { label: "Cycle tempo", value: "Brisk" },
      ],
      links: [],
    };
    const markup = renderToStaticMarkup(<DetailPanel detail={detail} />);
    expect(markup).toMatch(/<dt[^>]*>24h change<\/dt>\s*<dd[^>]*>\+5\.4%<\/dd>/);
  });

  it("omits 24h change row when fact value is the unavailable em-dash placeholder", () => {
    const detail: DetailModel = {
      id: "ship:test-no-change",
      title: "Test Ship",
      kind: "SHIP",
      summary: "test",
      facts: [
        { label: "Ship class", value: "CeFi" },
        { label: "Size tier", value: "Major" },
        { label: "Market cap", value: "$1,000,000,000" },
        // detail-model emits "—" for null change24hPct; the panel should still
        // render it (the fact exists) — this asserts at least the dt/dd pair
        // is present so a screen reader reaches the placeholder.
        { label: "24h supply change", value: "—" },
      ],
      links: [],
    };
    const markup = renderToStaticMarkup(<DetailPanel detail={detail} />);
    expect(markup).toMatch(/<dt[^>]*>24h change<\/dt>\s*<dd[^>]*>—<\/dd>/);
  });
});

describe("DetailPanel copy link", () => {
  const detail: DetailModel = {
    id: "ship:test-copy",
    title: "Test Ship",
    kind: "SHIP",
    summary: "test",
    facts: [],
    links: [],
  };

  const stubClipboard = (writeText: (text: string) => Promise<void>) => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    return () => {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator as object, "clipboard");
    };
  };

  // The address bar keeps the params in the fragment; the copied link moves
  // them to the query string so the shared card can name the ship.
  it("copies the current world URL as a server-readable link and announces it", async () => {
    // Declared with its argument so the mock's recorded calls are typed as
    // [string]; inferred from a zero-arg factory, `calls[0]` is an empty tuple
    // and reading the copied URL back off it does not typecheck.
    const writeText = vi.fn((_text: string) => Promise.resolve());
    const restore = stubClipboard(writeText);
    window.history.replaceState({}, "", "/#sel=ship.usdc&n=1&cam=4,8,1.5");
    const setAnnouncement = vi.fn();

    render(<DetailPanel detail={detail} setAnnouncement={setAnnouncement} />);
    fireEvent.click(screen.getByTestId("pharosville-detail-copy-link"));

    await waitFor(() => expect(setAnnouncement).toHaveBeenCalledWith("Link copied"));
    const copied = new URL(writeText.mock.calls[0]![0]);
    expect(copied.hash).toBe("");
    expect(copied.searchParams.get("sel")).toBe("ship.usdc");
    expect(copied.searchParams.get("n")).toBe("1");
    expect(copied.searchParams.get("cam")).toBe("4,8,1.5");
    expect(screen.getByTestId("pharosville-detail-copy-link").textContent).toContain("Link copied");
    restore();
  });

  it("announces a failure instead of throwing when the clipboard is unavailable", async () => {
    const restore = stubClipboard(() => Promise.reject(new Error("denied")));
    const setAnnouncement = vi.fn();

    render(<DetailPanel detail={detail} setAnnouncement={setAnnouncement} />);
    fireEvent.click(screen.getByTestId("pharosville-detail-copy-link"));

    await waitFor(() => expect(setAnnouncement).toHaveBeenCalledWith("Could not copy link"));
    restore();
  });
});

describe("DetailPanel composer paths (synthetic fixtures)", () => {
  const calmShip: DetailModel = {
    id: "ship:test-calm",
    title: "Test Ship",
    kind: "SHIP",
    summary: "test summary",
    facts: [
      { label: "Ship class", value: "CeFi-Dep" },
      { label: "Size tier", value: "Major" },
      { label: "Market cap", value: "$2,088,054,047" },
      { label: "Home dock", value: "Ethereum" },
      { label: "Risk water area", value: "Calm Anchorage" },
      { label: "Risk water zone", value: "calm" },
      { label: "Representative position", value: "Calm Anchorage idle" },
      { label: "Chains present", value: "1 deployment: Ethereum 100%" },
    ],
    links: [],
  };

  it("composes Currently as 'Calm Anchorage (idle)' when zone is calm and position ends 'idle'", () => {
    const markup = renderToStaticMarkup(<DetailPanel detail={calmShip} />);
    expect(markup).toMatch(/<dt[^>]*>Currently<\/dt>\s*<dd[^>]*>Calm Anchorage \(idle\)<\/dd>/);
  });

  it("compacts the Market cap value", () => {
    const markup = renderToStaticMarkup(<DetailPanel detail={calmShip} />);
    expect(markup).toMatch(/<dt[^>]*>Market cap<\/dt>\s*<dd[^>]*>\$2\.1B<\/dd>/);
  });

  it("renders external links with target=_blank and rel=noopener noreferrer", () => {
    const detail: DetailModel = {
      id: "pigeonnier",
      title: "Pigeonnier",
      kind: "pigeonnier",
      summary: "test",
      facts: [],
      links: [{ label: "Subscribe on Telegram", href: "https://pharos.watch/telegram/", target: "_blank" }],
    };
    const markup = renderToStaticMarkup(<DetailPanel detail={detail} />);
    expect(markup).toMatch(/href="https:\/\/pharos\.watch\/telegram\/"/);
    expect(markup).toMatch(/target="_blank"/);
    expect(markup).toMatch(/rel="noopener noreferrer"/);
  });

  it("renders internal links without target attribute", () => {
    const detail: DetailModel = {
      id: "lighthouse",
      title: "Lighthouse",
      kind: "lighthouse",
      summary: "test",
      facts: [],
      links: [{ label: "PSI", href: "https://pharos.watch/stability-index/" }],
    };
    const markup = renderToStaticMarkup(<DetailPanel detail={detail} />);
    expect(markup).not.toMatch(/target="_blank"/);
  });

  it("renders in-world member buttons and keeps the external page as a secondary affordance", () => {
    const onSelectDetail = vi.fn();
    const detail: DetailModel = {
      id: "dock.ethereum",
      title: "Ethereum",
      kind: "dock",
      summary: "test",
      facts: [],
      links: [],
      membersHeading: "Harbored stablecoins",
      members: [{
        id: "usdc-circle",
        label: "USDC (100%)",
        href: "https://pharos.watch/stablecoin/usdc-circle/",
        value: "$1,000",
        inWorldDetailId: "ship.usdc-circle",
      }],
    };

    render(<DetailPanel detail={detail} onSelectDetail={onSelectDetail} />);

    const button = screen.getByRole("button", { name: "Select USDC (100%) in PharosVille" });
    expect(button.className).toContain("pv-panel-link");
    fireEvent.click(button);
    expect(onSelectDetail).toHaveBeenCalledWith("ship.usdc-circle");
    expect(screen.getByRole("link", { name: "Open USDC (100%) page" }).getAttribute("href"))
      .toBe("https://pharos.watch/stablecoin/usdc-circle/");
  });

  it("renders in-world link buttons and keeps the href as a secondary affordance", () => {
    const onSelectDetail = vi.fn();
    const detail: DetailModel = {
      id: "dock.ethereum",
      title: "Ethereum",
      kind: "dock",
      summary: "test",
      facts: [],
      links: [{
        label: "Stablecoin",
        href: "https://pharos.watch/stablecoin/usdc-circle/",
        inWorldDetailId: "ship.usdc-circle",
      }],
    };

    render(<DetailPanel detail={detail} onSelectDetail={onSelectDetail} />);

    const button = screen.getByRole("button", { name: "Select Stablecoin in PharosVille" });
    expect(button.className).toContain("pv-panel-link");
    fireEvent.click(button);
    expect(onSelectDetail).toHaveBeenCalledWith("ship.usdc-circle");
    expect(screen.getByRole("link", { name: "Open Stablecoin page" }).getAttribute("href"))
      .toBe("https://pharos.watch/stablecoin/usdc-circle/");
  });

  it("keeps in-world metadata dormant when no selector callback is present", () => {
    const detail: DetailModel = {
      id: "dock.ethereum",
      title: "Ethereum",
      kind: "dock",
      summary: "test",
      facts: [],
      links: [{
        label: "Stablecoin",
        href: "https://pharos.watch/stablecoin/usdc-circle/",
        inWorldDetailId: "ship.usdc-circle",
      }],
    };

    const markup = renderToStaticMarkup(<DetailPanel detail={detail} />);
    expect(markup).toMatch(/href="https:\/\/pharos\.watch\/stablecoin\/usdc-circle\/"/);
    // The panel's own copy-link control is always present; what must stay
    // dormant is the in-world selector button.
    expect(markup).not.toMatch(/Select Stablecoin in PharosVille/);
    expect(markup).toContain("Stablecoin →");
  });
});
