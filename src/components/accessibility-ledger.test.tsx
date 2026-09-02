import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildVisualCueRegistry } from "../systems/visual-cue-registry";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import {
  fixtureWithDepegOn,
  fixtureWithoutAsset,
  makeReportCard,
  makerSquadFixtureInputs,
} from "../__fixtures__/pharosville-world";
import { UNAVAILABLE_SUPPLY_TIDE } from "../systems/supply-tide";
import type { PharosVilleWorld } from "../systems/world-types";
import { AccessibilityLedger } from "./accessibility-ledger";

describe("AccessibilityLedger", () => {
  it("names the localized stale-feed haze without calling it weather", () => {
    const world = sampleWorld();
    world.freshness = { chainsStale: true, pegSummaryStale: true };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("Instrument haze");
    expect(markup).toContain("Haze over the risk waters and quays");
    expect(markup).toContain("Peg summary and Chains feeds are stale");
  });

  it("names the pigeonnier roost comparison and today's watched ships", () => {
    const world = sampleWorld();
    world.pigeonnier = {
      ...world.pigeonnier,
      notableMovers: [{
        change24hPctLabel: "+2.1%",
        change24hUsdLabel: "+$4.2M",
        detailId: "ship.alpha",
        id: "alpha",
        riskWaterLabel: "Watch Breakwater",
        symbol: "ALPHA",
      }],
      roost: {
        capped: false,
        comparison: 2,
        eventsToday: 3,
        eventsYesterday: 1,
        visualCount: 3,
      },
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);
    expect(markup).toContain("3 today; 1 yesterday (2 more than yesterday)");
    expect(markup).toContain("Today&#x27;s notable movers: ALPHA");
  });

  it("renders the timestamped rare-event harbor log and its stillness contract", () => {
    const markup = renderToStaticMarkup(
      <AccessibilityLedger
        almanacEntries={[{
          id: "2026-08-13:heron-dusk",
          message: "A heron settled on the harbor piling at dusk.",
          timestampLabel: "18:07",
        }]}
        world={sampleWorld()}
      />,
    );
    expect(markup).toContain("Harbor log");
    expect(markup).toContain("18:07");
    expect(markup).toContain("A heron settled on the harbor piling at dusk.");
    expect(markup).toContain("absent in still or reduced-motion mode");
  });

  it("identifies calendar-season dressing as non-semantic", () => {
    const markup = renderToStaticMarkup(<AccessibilityLedger world={sampleWorld()} />);
    expect(markup).toContain("Seasonal dressing");
    expect(markup).toContain("Follows the real-world calendar; non-semantic.");
  });
  it("stays screen-reader-only by default and drops sr-only when shown visibly", () => {
    const screenReaderMarkup = renderToStaticMarkup(<AccessibilityLedger world={sampleWorld()} />);
    const visibleMarkup = renderToStaticMarkup(
      <AccessibilityLedger world={sampleWorld()} presentation="visible" title="Harbor ledger" />,
    );

    expect(screenReaderMarkup).toContain('class="sr-only"');
    expect(screenReaderMarkup).toContain("PharosVille accessibility ledger");
    expect(visibleMarkup).toContain('class="pharosville-ledger"');
    expect(visibleMarkup).not.toContain('class="sr-only"');
    expect(visibleMarkup).toContain("Harbor ledger");
  });

  it("carries identical body text in both presentations", () => {
    const world = buildPharosVilleWorld(makerSquadFixtureInputs());
    const normalize = (markup: string) => markup
      .replace('class="sr-only"', "")
      .replace('class="pharosville-ledger"', "")
      .replace("PharosVille accessibility ledger", "");

    expect(normalize(renderToStaticMarkup(<AccessibilityLedger world={world} />)))
      .toBe(normalize(renderToStaticMarkup(
        <AccessibilityLedger world={world} presentation="visible" title="" />,
      )));
  });

  it("does not expose ship-cluster ledger or cue rows", () => {
    const markup = renderToStaticMarkup(<AccessibilityLedger world={sampleWorld()} />);

    expect(markup).not.toContain("Ship clusters");
    expect(markup).not.toContain("count-capped water-zone cluster marker");
    expect(markup).not.toContain("long-tail cluster detail panel");
  });

  it("renders missing generatedAt as unknown instead of the Unix epoch", () => {
    const markup = renderToStaticMarkup(<AccessibilityLedger world={{ ...sampleWorld(), generatedAt: null }} />);

    expect(markup).toContain("Generated at unknown time");
    expect(markup).not.toContain("1970-01-01");
  });

  it("describes NAV ships as Ledger Mooring route placements", () => {
    const markup = renderToStaticMarkup(<AccessibilityLedger world={sampleWorldWithLedgerShip()} />);

    expect(markup).toContain("Ledger Mooring idle");
    expect(markup).toContain("risk anchor ledger-mooring");
    expect(markup).toContain("risk water Ledger Mooring");
    expect(markup).toContain("risk zone ledger");
    expect(markup).toContain("1 positive chain deployment");
    expect(markup).toContain("1 rendered dock stop");
    expect(markup).toContain("meta.flags.navToken");
  });

  it("renders a Sky squad row and a Maker squad row, each listing its own members", () => {
    const world = buildPharosVilleWorld(makerSquadFixtureInputs());
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("Sky squad");
    expect(markup).toContain("Maker squad");
    expect(markup).toContain("USDS (flagship)");
    expect(markup).toContain("stUSDS (vanguard)");
    expect(markup).toContain("sUSDS");
    expect(markup).toContain("DAI (flagship)");
    expect(markup).toContain("sDAI");
    expect(markup).toContain("Sailing in formation");
  });

  it("includes a sub-row for any squadOverride consort", () => {
    // sUSDS is a Sky-squad consort; depegging it produces an override.
    const world = buildPharosVilleWorld(fixtureWithDepegOn(makerSquadFixtureInputs(), "susds-sky"));
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("sUSDS in distress");
    expect(markup).toContain("squad sheltering at flagship");
  });

  it("renders an inline distress swatch alongside the textual mention", () => {
    const world = buildPharosVilleWorld(fixtureWithDepegOn(makerSquadFixtureInputs(), "susds-sky"));
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    // Swatch span carries the canonical chrome hex; textual cue stays
    // screen-reader visible.
    expect(markup).toContain("data-testid=\"squad-distress-swatch\"");
    expect(markup.toLowerCase()).toContain("background:#a02018");
    expect(markup).toContain("distress signal flag");
  });

  it("renders a dock health-band color legend with all five bands and hex values", () => {
    const markup = renderToStaticMarkup(<AccessibilityLedger world={sampleWorld()} />);

    expect(markup).toContain("Dock health-band color legend");
    expect(markup).toContain("data-testid=\"dock-health-band-legend\"");
    expect(markup).toContain("robust");
    expect(markup).toContain("healthy");
    expect(markup).toContain("mixed");
    expect(markup).toContain("fragile");
    expect(markup).toContain("concentrated");
    // Renderer-canonical dock signal colors.
    expect(markup.toLowerCase()).toContain("#78b689");
    expect(markup.toLowerCase()).toContain("#dfb95a");
    expect(markup.toLowerCase()).toContain("#d98b54");
    expect(markup.toLowerCase()).toContain("#c9675c");
  });

  it("mirrors dock rank, stablecoin-supply share, and concentration in dock rows", () => {
    const world: PharosVilleWorld = {
      ...sampleWorld(),
      docks: [{
        id: "dock.ethereum",
        kind: "dock",
        station: { coveId: "ethereum-precinct", type: "boathouse-precinct", shoreBearing: 0 },
        label: "Ethereum",
        chainId: "ethereum",
        tile: { x: 1, y: 1 },
        totalUsd: 8_000_000_000,
        size: 7,
        healthBand: "healthy",
        stablecoinCount: 2,
        concentration: 0.4,
        harborRank: 1,
        harborCount: 2,
        shareOfGlobal: 8 / 11,
        harboredStablecoins: [{ id: "usdc-circle", symbol: "USDC", share: 1, supplyUsd: 8_000_000_000 }],
        detailId: "dock.ethereum",
      }],
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("#1 of 2 rendered harbors");
    expect(markup).toContain("boathouse precinct station at ethereum-precinct cove");
    expect(markup).toContain("72.7% of stablecoin supply");
    expect(markup).toContain("concentration moderately concentrated (HHI 0.40)");
  });

  // The cargo-tide crates put direction on the canvas as position. These are the
  // rows a reader who never sees the canvas has instead, so they must state the
  // direction in words and must not let "unmeasured" pass for "calm".
  it("mirrors each harbour's net 24h issuance flow, direction named, in dock rows", () => {
    const world: PharosVilleWorld = {
      ...sampleWorld(),
      docks: [
        {
          id: "dock.ethereum",
          kind: "dock",
          station: { coveId: "ethereum-precinct", type: "boathouse-precinct", shoreBearing: 0 },
          chainId: "ethereum",
          label: "Ethereum",
          tile: { x: 1, y: 1 },
          totalUsd: 8_000_000_000,
          size: 7,
          healthBand: "healthy",
          stablecoinCount: 2,
          concentration: null,
          harboredStablecoins: [],
          detailId: "dock.ethereum",
          cargoTide: {
            burnVolumeUsd: 2_000_000,
            coinCount: 2,
            direction: "minting",
            mintVolumeUsd: 10_000_000,
            netFlowUsd: 8_000_000,
            pressureScore: 66,
            reason: "tracked",
            tracked: true,
          },
        },
        {
          id: "dock.solana",
          kind: "dock",
          station: { coveId: "watch-east-bay", type: "tea-house-quay", shoreBearing: Math.PI },
          chainId: "solana",
          label: "Solana",
          tile: { x: 2, y: 2 },
          totalUsd: 1_000_000_000,
          size: 3,
          healthBand: "healthy",
          stablecoinCount: 1,
          concentration: null,
          harboredStablecoins: [],
          detailId: "dock.solana",
          cargoTide: {
            burnVolumeUsd: 0,
            coinCount: 0,
            direction: "inactive",
            mintVolumeUsd: 0,
            netFlowUsd: 0,
            pressureScore: null,
            reason: "chain-not-in-scope",
            tracked: false,
          },
        },
      ],
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("net flow 24h +$8.0M minting");
    expect(markup).toContain("net flow 24h Not measured on this chain");
  });

  it("reports fleet-wide issuance including flight to quality above the dock list", () => {
    const world: PharosVilleWorld = {
      ...sampleWorld(),
      fleetIssuance: {
        activeCoins: 36,
        band: "NEUTRAL",
        burnVolumeUsd: 4_000_000,
        direction: "burning",
        flightIntensity: 42,
        flightToQuality: true,
        mintVolumeUsd: 1_000_000,
        netFlowUsd: -3_000_000,
        scopeChainIds: ["ethereum", "arbitrum"],
        scopeLabel: "Configured issuance chains",
        trackedCoins: 130,
        score: -7.4,
      },
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("Fleet issuance 24h: net burning");
    expect(markup).toContain("36 of 130 tracked coins moved supply");
    expect(markup).toContain("measured over Configured issuance chains (ethereum, arbitrum)");
    // The clause names what is now drawn for it, so the ledger and the canvas
    // make the same statement rather than the ledger disclaiming a cue.
    expect(markup).toContain("flight to quality active");
    expect(markup).toContain("tenders running in on the largest hulls");
    expect(markup).not.toContain("no canvas cue");
  });

  it("says outright that no tenders are on the water when the gauge reports no flight", () => {
    // An empty sea covers both "no rotation" and "no feed"; this line is what
    // keeps the two apart, and it must not go quiet just because the canvas has.
    const world: PharosVilleWorld = {
      ...sampleWorld(),
      fleetIssuance: {
        activeCoins: 12,
        band: "NEUTRAL",
        burnVolumeUsd: 1_000_000,
        direction: "minting",
        flightIntensity: 0,
        flightToQuality: false,
        mintVolumeUsd: 4_000_000,
        netFlowUsd: 3_000_000,
        scopeChainIds: ["ethereum"],
        scopeLabel: "Configured issuance chains",
        trackedCoins: 130,
        score: 5.1,
      },
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("no flight to quality reported — no tenders on the water");
  });

  it("omits the fleet issuance line entirely when the flow feed has not landed", () => {
    const markup = renderToStaticMarkup(<AccessibilityLedger world={sampleWorld()} />);

    expect(markup).not.toContain("Fleet issuance 24h");
  });

  it("renders a wreck cause-color swatch legend with each CAUSE_HEX entry", () => {
    const markup = renderToStaticMarkup(<AccessibilityLedger world={sampleWorld()} />);

    expect(markup).toContain("Wreck cause-color swatch legend");
    expect(markup).toContain("data-testid=\"wreck-cause-color-legend\"");
    expect(markup).toContain("algorithmic-failure");
    expect(markup).toContain("counterparty-failure");
    expect(markup).toContain("liquidity-drain");
    expect(markup).toContain("regulatory");
    expect(markup).toContain("abandoned");
    // Sample of CAUSE_HEX-canonical values.
    expect(markup.toLowerCase()).toContain("#ef4444");
    expect(markup.toLowerCase()).toContain("#71717a");
  });

  it("lists canonical Wreck Shoal as the seventh named area", () => {
    const world: PharosVilleWorld = {
      ...sampleWorld(),
      areas: [{
        id: "area.risk-water.wreck-shoal",
        kind: "area",
        label: "Wreck Shoal",
        tile: { x: 15, y: 123 },
        detailId: "area.risk-water.wreck-shoal",
        facts: [{ label: "Water style", value: "protected tidal inlet and wreck shoal" }],
        sourceFields: ["cemeteryEntries[]", "world-layout wreck-water field"],
        summary: "Wreck-water lifecycle area; no live-ship risk placement.",
      }],
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("Wreck Shoal: No live-ship risk placement");
    expect(markup).toContain("world-layout wreck-water field");
  });

  it("appends a heritage-hull clause for ships carrying uniqueRationale", () => {
    const world = sampleWorldWithUniqueShip();
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("heritage hull:");
    expect(markup).toContain("llama mascot");
  });

  it("appends a cycle tempo clause for each ship", () => {
    const world = sampleWorldWithLedgerShip();
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    // No mint/burn row → neutral pace with an explicit missing-data reading.
    expect(markup).toContain("cycle tempo Unmeasured");
    expect(markup).toContain("underway leg pace tracks 24h mint/redeem flow intensity by magnitude, not market-cap tier");
    expect(markup).toContain("route cadence 90–180 s legs; 240–480 s rests; arrivals and departures are paired");
    expect(markup).toContain("Routes show rendered-chain and risk-water presence only");
  });

  it("states per-ship issuance failure and garden-tempo parity", () => {
    const markup = renderToStaticMarkup(<AccessibilityLedger world={sampleWorldWithLedgerShip()} />);
    expect(markup).toContain("issuance work Unavailable — neutral draft; no per-coin mint/redeem row");
    expect(markup).toContain("rendered at garden tempo over 45 seconds, while this ledger states the latest truth immediately");
    expect(markup).toContain("redemption fitting Unavailable");
    expect(markup).toContain("collateral cargo Unavailable");
    expect(markup).toContain("customs fitting Unavailable");
  });

  it("mirrors lighthouse trend, composition, and contributors in the ledger", () => {
    const world: PharosVilleWorld = {
      ...sampleWorld(),
      lighthouse: {
        ...sampleWorld().lighthouse,
        components: { severity: 0.7, breadth: 0.3, trend: 0.05 },
        avg24h: 68,
        avg24hBand: "FRACTURE",
        contributors: [{ id: "usdt-tether", symbol: "USDT", bps: -12, mcapUsd: 90_000_000_000 }],
      },
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("Trend: Observed 24h drift improving");
    expect(markup).toContain("Composition: severity 70%, breadth 30%");
    expect(markup).toContain("Top contributors: USDT -12 bps ($90.0B)");
  });

  it("reads the observatory signal mast out in the lighthouse row", () => {
    const world: PharosVilleWorld = {
      ...sampleWorld(),
      lighthouse: {
        ...sampleWorld().lighthouse,
        signalMast: {
          activeDepegCount: 2,
          pennantCount: 2,
          capped: false,
          stormCone: true,
          worstBps: -640,
          worstSymbol: "XUSD",
          medianDeviationBps: 3,
          coinsAtPeg: 212,
          totalTracked: 214,
          eventsToday: 1,
          unavailable: false,
        },
      },
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("Signal mast: 2 pennants for 2 coins off peg; storm cone hoisted.");
    expect(markup).toContain("Fleet peg: Worst XUSD -6.4%; median +3 bps; 212 of 214 at peg; 1 event today.");
  });

  it("says the mast is bare rather than implying calm when no peg summary arrived", () => {
    const markup = renderToStaticMarkup(<AccessibilityLedger world={sampleWorld()} />);

    expect(markup).toContain("Signal mast: Bare — no peg summary tonight.");
    expect(markup).not.toContain("Fleet peg:");
  });

  it("names the beam's bearing and the high-water mark in the lighthouse row", () => {
    const world: PharosVilleWorld = {
      ...sampleWorld(),
      lighthouse: {
        ...sampleWorld().lighthouse,
        beamDwell: { shipId: "usdx", symbol: "USDX", bps: -412 },
        highWaterMark: {
          band: "FRACTURE",
          severity: 3,
          score: 31,
          at: Date.UTC(2026, 6, 20),
          sampleCount: 9,
          spanDays: 9,
          unavailable: false,
        },
      },
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("Beam bearing: Holding on USDX, largest PSI contributor (-412 bps).");
    expect(markup).toContain("Worst band, 30d: FRACTURE at PSI 31 on 2026-07-20; 9 days on record.");
    expect(markup).toContain("Garden record, 30d: Neutral garden — no index history to grow from. This is a slow trailing record; it changes with daily history, never as a live alarm.");
  });

  it("says the rocks are unstained for want of history, not for want of stress", () => {
    const markup = renderToStaticMarkup(<AccessibilityLedger world={sampleWorld()} />);

    expect(markup).toContain("Worst band, 30d: Unstained — no index history to read.");
    // No contributor, no bearing — the beam keeps its even sweep and the
    // ledger claims nothing about where it is pointing.
    expect(markup).not.toContain("Beam bearing:");
  });

  it("reads a ship's crossed price bearings out whether or not they crossed", () => {
    const world = sampleWorldWithLedgerShip();
    const [ship] = world.ships;
    const crossed = renderToStaticMarkup(<AccessibilityLedger world={{
      ...world,
      ships: [{
        ...ship!,
        dexCrossCheck: {
          dexPrice: 0.9912,
          dexDeviationBps: -88,
          oraclePrice: 0.9998,
          oracleDeviationBps: -2,
          agrees: false,
          sourcePools: 4,
          sourceTvlUsd: 12_300_000,
        },
      }],
    }} />);

    expect(crossed).toContain("DEX cross-check Bearings cross");
    expect(crossed).toContain("DEX $0.9912 (-88 bps) vs feed $0.9998 (-2 bps)");
    expect(crossed).toContain("4 pools, $12.3M TVL");

    // The ledger has no density budget to protect, so unlike the panel it also
    // records the agreeing case — a reader working from the ledger alone would
    // otherwise never learn a check ran at all.
    const agreed = renderToStaticMarkup(<AccessibilityLedger world={{
      ...world,
      ships: [{
        ...ship!,
        dexCrossCheck: {
          dexPrice: 1.0001,
          dexDeviationBps: 1,
          oraclePrice: 1,
          oracleDeviationBps: 0,
          agrees: true,
          sourcePools: 6,
          sourceTvlUsd: 40_000_000,
        },
      }],
    }} />);
    expect(agreed).toContain("DEX cross-check Both bearings agree");

    // And the ship clause is absent entirely when no check ran. Matched on the
    // clause opening rather than the bare label, which the cue registry's own
    // DOM-equivalent text further down the ledger also carries.
    const silent = renderToStaticMarkup(<AccessibilityLedger world={world} />);
    expect(silent).not.toContain("DEX cross-check Bearings cross");
    expect(silent).not.toContain("DEX cross-check Both bearings agree");
  });

  it("adds a non-time-dependent lighthouse warm-beam cue from active elevated DEWS counts", () => {
    const world: PharosVilleWorld = {
      ...sampleWorld(),
      areas: [
        {
          id: "area.dews.danger",
          kind: "area",
          label: "Danger Strait",
          tile: { x: 55, y: 4 },
          band: "DANGER",
          count: 1,
          detailId: "area.dews.danger",
        },
        {
          id: "area.dews.watch",
          kind: "area",
          label: "Watch Breakwater",
          tile: { x: 48, y: 28 },
          band: "WATCH",
          count: 4,
          detailId: "area.dews.watch",
        },
      ],
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("Beam warming amber under elevated DEWS");
    expect(markup).toContain("Danger Strait DANGER (1 stablecoin)");
    expect(markup).not.toContain("Watch Breakwater WATCH (4 stablecoins)");
  });

  it("does not announce global lightning as active from an area band alone", () => {
    const world: PharosVilleWorld = {
      ...sampleWorld(),
      areas: [{
        id: "area.dews.danger",
        kind: "area",
        label: "Danger Strait",
        tile: { x: 55, y: 4 },
        band: "DANGER",
        count: 1,
        detailId: "area.dews.danger",
        riskPlacement: "storm-shelf",
      }],
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("lightning possible at the fleet storm peak");
    expect(markup).not.toContain("lightning active");
  });

  it("exposes the deterministic sea-state summary for DOM parity", () => {
    const world: PharosVilleWorld = {
      ...sampleWorld(),
      lighthouse: {
        ...sampleWorld().lighthouse,
        psiBand: "CRISIS",
        score: 30,
      },
      areas: [
        {
          id: "area.dews.danger",
          kind: "area",
          label: "Danger Strait",
          tile: { x: 55, y: 4 },
          band: "DANGER",
          count: 1,
          detailId: "area.dews.danger",
        },
      ],
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("Sea state");
    expect(markup).toContain("DANGER");
    expect(markup).toContain("swell");
    expect(markup).toContain("wind");
    expect(markup).toContain("tempo");
  });

  it("mirrors recent mover supply trends in the ledger", () => {
    const world: PharosVilleWorld = {
      ...sampleWorldWithLedgerShip(),
      ships: [{
        ...sampleWorldWithLedgerShip().ships[0]!,
        symbol: "sUSDe",
        change7dPct: 18,
        riskZone: "danger",
      }],
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("Recent movers");
    expect(markup).toContain("sUSDe supply +18% (7d); 1 ships in elevated water");
  });

  it("cycle tempo label is canonical or explicit when flow data is unavailable", () => {
    const world = sampleWorldWithLedgerShip();
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    const validLabels = ["Languid", "Steady", "Brisk", "Active", "Unmeasured"];
    const found = validLabels.some((label) => markup.includes(`cycle tempo ${label}`));
    expect(found).toBe(true);
  });

  it("appends report-card safety grade and non-NR dimension rationales to ship rows", () => {
    const baseCard = makeReportCard({
      id: "susde-ethena",
      symbol: "sUSDe",
      overallGrade: "D",
      overallScore: 48,
    });
    const world: PharosVilleWorld = {
      ...sampleWorldWithLedgerShip(),
      ships: [{
        ...sampleWorldWithLedgerShip().ships[0]!,
        reportCard: {
          ...baseCard,
          dimensions: {
            ...baseCard.dimensions,
            pegStability: { grade: "D", score: 42, detail: "Peg drift active. Second sentence omitted." },
            liquidity: { grade: "NR", score: null, detail: "Not rated." },
            dependencyRisk: { grade: "F", score: 20, detail: "Bridge dependency dominates." },
          },
        },
      }],
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("safety grade D (score 48)");
    expect(markup).toContain("Peg stability D — Peg drift active.");
    expect(markup).toContain("Dependency risk F — Bridge dependency dominates.");
    expect(markup).not.toContain("Liquidity NR");
    expect(markup).not.toContain("Second sentence omitted");
  });

  it("suppresses ship safety rows for NR report cards", () => {
    const baseCard = makeReportCard({
      id: "susde-ethena",
      symbol: "sUSDe",
      overallGrade: "NR",
      overallScore: null,
    });
    const world: PharosVilleWorld = {
      ...sampleWorldWithLedgerShip(),
      ships: [{ ...sampleWorldWithLedgerShip().ships[0]!, reportCard: baseCard }],
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);
    const shipLine = markup.match(/<h3>Ships<\/h3><ol><li>(.*?)<\/li><\/ol>/s)?.[1] ?? "";

    expect(shipLine).not.toContain("safety grade");
    expect(shipLine).not.toContain("Peg stability");
  });

  it("mirrors ship stress drivers in ledger rows", () => {
    const world: PharosVilleWorld = {
      ...sampleWorldWithLedgerShip(),
      ships: [{
        ...sampleWorldWithLedgerShip().ships[0]!,
        stressBreakdown: { signals: ["peg deviation"], contagionActive: true },
      }],
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("stress driver Driven by: peg deviation; contagion amplifier active");
  });

  it("expands cemetery rows with cause label, compact peak market cap, and obituary", () => {
    const world: PharosVilleWorld = {
      ...sampleWorld(),
      graves: [{
        id: "grave.ust-terra",
        kind: "grave",
        label: "TerraUSD",
        entry: {
          id: "ust-terra",
          name: "TerraUSD",
          symbol: "UST",
          pegCurrency: "USD",
          causeOfDeath: "algorithmic-failure",
          deathDate: "2022-05-12",
          peakMcap: 18_770_471_902,
          epitaph: "Anchor yield could not hold the tide.",
          obituary: "The largest stablecoin collapse in history.",
          sourceUrl: "https://example.com/ust-postmortem",
          sourceLabel: "UST postmortem",
        },
        tile: { x: 1, y: 1 },
        visual: { marker: "broken-keel", scale: 1 },
        detailId: "grave.ust-terra",
      }],
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("TerraUSD (UST): Algorithmic Failure, 2022-05-12, peak market cap $18.8B; wreck silhouette Broken keel");
    expect(markup).toContain("The largest stablecoin collapse in history.");
  });

  it("suppresses missing cemetery peak market cap in ledger rows", () => {
    const world: PharosVilleWorld = {
      ...sampleWorld(),
      graves: [{
        id: "grave.nbt-nubits",
        kind: "grave",
        label: "NuBits",
        entry: {
          id: "nbt-nubits",
          name: "NuBits",
          symbol: "NBT",
          pegCurrency: "USD",
          causeOfDeath: "abandoned",
          deathDate: "2016-06-01",
          epitaph: "A first lesson in reflexive pegs.",
          obituary: "A pioneering cautionary tale.",
          sourceUrl: "https://example.com/nubits",
          sourceLabel: "NuBits writeup",
        },
        tile: { x: 1, y: 1 },
        visual: { marker: "skeletal", scale: 1 },
        detailId: "grave.nbt-nubits",
      }],
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("NuBits (NBT): Abandoned, 2016-06-01; wreck silhouette Bare remains");
    expect(markup).not.toContain("peak market cap");
  });

  it("hides the Sky squad section when its flagship is missing; Maker squad still renders", () => {
    const world = buildPharosVilleWorld(fixtureWithoutAsset(makerSquadFixtureInputs(), "usds-sky"));
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).not.toContain("Sky squad");
    expect(markup).toContain("Maker squad");
  });

  describe("E2 — 24h supply change in ledger ship rows", () => {
    it("shows formatted positive change when change24hPct is positive", () => {
      const world: PharosVilleWorld = {
        ...sampleWorldWithLedgerShip(),
        ships: [{ ...sampleWorldWithLedgerShip().ships[0]!, change24hPct: 5.4, change24hUsd: 1_000_000 }],
      };
      const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);
      expect(markup).toContain("24h supply change +5.4%");
    });

    it("shows formatted negative change when change24hPct is negative", () => {
      const world: PharosVilleWorld = {
        ...sampleWorldWithLedgerShip(),
        ships: [{ ...sampleWorldWithLedgerShip().ships[0]!, change24hPct: -3.2, change24hUsd: -800_000 }],
      };
      const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);
      expect(markup).toContain("24h supply change -3.2%");
    });

    it("does not render negative zero for tiny negative changes", () => {
      const world: PharosVilleWorld = {
        ...sampleWorldWithLedgerShip(),
        ships: [{ ...sampleWorldWithLedgerShip().ships[0]!, change24hPct: -0.04, change24hUsd: -1 }],
      };
      const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);
      expect(markup).toContain("24h supply change 0.0%");
      expect(markup).not.toContain("24h supply change -0.0%");
    });

    it("shows unavailable when change24hPct is null", () => {
      const world = sampleWorldWithLedgerShip(); // change24hPct: null
      const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);
      expect(markup).toContain("24h supply change unavailable");
    });
  });

  describe("W5.01 — Tracking new risk band sentence", () => {
    it("appends the transition sentence when the ship has an active riskTransition (progress < 1)", () => {
      const world = sampleWorldWithLedgerShip();
      const ship = world.ships[0]!;
      const riskTransitionByShipId = new Map([
        [ship.id, { fromLabel: "Calm Anchorage", toLabel: "Alert Channel", progress: 0.5 }],
      ]);
      const markup = renderToStaticMarkup(
        <AccessibilityLedger world={world} riskTransitionByShipId={riskTransitionByShipId} />,
      );
      expect(markup).toContain("Tracking new risk band: from Calm Anchorage to Alert Channel.");
    });

    it("omits the transition sentence when progress is 1.0", () => {
      const world = sampleWorldWithLedgerShip();
      const ship = world.ships[0]!;
      const riskTransitionByShipId = new Map([
        [ship.id, { fromLabel: "Calm Anchorage", toLabel: "Alert Channel", progress: 1.0 }],
      ]);
      const markup = renderToStaticMarkup(
        <AccessibilityLedger world={world} riskTransitionByShipId={riskTransitionByShipId} />,
      );
      expect(markup).not.toContain("Tracking new risk band");
    });

    it("omits the transition sentence when riskTransition entry is null", () => {
      const world = sampleWorldWithLedgerShip();
      const ship = world.ships[0]!;
      const riskTransitionByShipId = new Map([[ship.id, null]]);
      const markup = renderToStaticMarkup(
        <AccessibilityLedger world={world} riskTransitionByShipId={riskTransitionByShipId} />,
      );
      expect(markup).not.toContain("Tracking new risk band");
    });

    it("omits the transition sentence when riskTransitionByShipId is not provided", () => {
      const world = sampleWorldWithLedgerShip();
      const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);
      expect(markup).not.toContain("Tracking new risk band");
    });
  });
});

function sampleWorld(): PharosVilleWorld {
  return {
    generatedAt: 0,
    routeMode: "world",
    freshness: {},
    fleetIssuance: null,
    supplyTide: UNAVAILABLE_SUPPLY_TIDE,
    map: {
      width: 2,
      height: 2,
      tiles: [],
      waterRatio: 0.5,
    },
    lighthouse: {
      id: "lighthouse",
      kind: "lighthouse",
      label: "Pharos lighthouse",
      tile: { x: 0, y: 0 },
      psiBand: "STEADY",
      score: 80,
      color: "#ffffff",
      unavailable: false,
      detailId: "lighthouse",
    },
    pigeonnier: {
      id: "pigeonnier",
      kind: "pigeonnier",
      label: "Pigeonnier",
      tile: { x: 50, y: 50 },
      detailId: "pigeonnier",
    },
    docks: [],
    areas: [],
    ships: [],
    graves: [],
    detailIndex: {},
    entityById: {},
    visualCues: buildVisualCueRegistry(),
  };
}

function sampleWorldWithUniqueShip(): PharosVilleWorld {
  const world = sampleWorld();
  return {
    ...world,
    ships: [
      {
        id: "crvusd-curve",
        kind: "ship",
        label: "Curve",
        symbol: "crvUSD",
        asset: {} as PharosVilleWorld["ships"][number]["asset"],
        meta: {} as PharosVilleWorld["ships"][number]["meta"],
        reportCard: null,
        logoSrc: null,
        tile: { x: 1, y: 1 },
        riskTile: { x: 1, y: 1 },
        chainPresence: [{ chainId: "ethereum", currentUsd: 100, hasRenderedDock: false, share: 1 }],
        dockVisits: [],
        dominantChainId: "ethereum",
        homeDockChainId: null,
        dockChainId: null,
        marketCapUsd: 100,
        riskPlacement: "safe-harbor",
        riskZone: "calm",
        riskWaterLabel: "Calm Anchorage",
        placementEvidence: { reason: "Fresh", sourceFields: ["pegSummary.coins[]"], stale: false },
        visual: {
          hullForm: { beam: 1, height: 1, length: 1, waterline: 0 },
          hull: "dao-schooner",
          uniqueRationale: "Sails under Curve's llama mascot — the DEX that defined stablecoin AMM curves.",
          classLabel: "DeFi",
          livery: {
            accent: "#8bbf72",
            label: "Curve logo livery",
            logoMatte: "#f7fff5",
            logoShape: "ring",
            primary: "#41956b",
            sailColor: "#d9ecdf",
            sailPanel: "quartered",
            secondary: "#27543e",
            source: "stablecoin-logo",
            stripePattern: "wave",
          },
          sailColor: "#d9ecdf",
          overlay: "none",
          sizeTier: "unique",
          sizeLabel: "Heritage hull",
          scale: 1.5,
        },
        change24hUsd: null,
        change24hPct: null,
        detailId: "ship.crvusd-curve",
      },
    ],
  };
}

function sampleWorldWithLedgerShip(): PharosVilleWorld {
  const world = sampleWorld();
  return {
    ...world,
    ships: [
      {
        id: "susde-ethena",
        kind: "ship",
        label: "Staked USDe",
        symbol: "sUSDe",
        asset: {} as PharosVilleWorld["ships"][number]["asset"],
        meta: {} as PharosVilleWorld["ships"][number]["meta"],
        reportCard: null,
        logoSrc: null,
        tile: { x: 1, y: 1 },
        riskTile: { x: 1, y: 1 },
        chainPresence: [{ chainId: "ethereum", currentUsd: 100, hasRenderedDock: true, share: 1 }],
        dockVisits: [{ chainId: "ethereum", dockId: "dock.ethereum", weight: 1, mooringTile: { x: 1, y: 1 } }],
        dominantChainId: "ethereum",
        homeDockChainId: "ethereum",
        dockChainId: "ethereum",
        marketCapUsd: 100,
        riskPlacement: "ledger-mooring",
        riskZone: "ledger",
        riskWaterLabel: "Ledger Mooring",
        placementEvidence: {
          reason: "NAV token Ledger Mooring idle preference",
          sourceFields: ["meta.flags.navToken", "pegSummary.coins[]"],
          stale: false,
        },
        visual: {
          hullForm: { beam: 1, height: 1, length: 1, waterline: 0 },
          hull: "treasury-galleon",
          classLabel: "CeFi",
          livery: {
            accent: "#a9a68e",
            label: "Ethena staked livery",
            logoMatte: "#f7f4e8",
            logoShape: "pill",
            primary: "#686963",
            sailColor: "#e8e6dc",
            sailPanel: "hoist",
            secondary: "#34352f",
            source: "stablecoin-logo",
            stripePattern: "diagonal",
          },
          sailColor: "#e8e6dc",
          overlay: "none",
          sizeTier: "major",
          sizeLabel: "Major",
          scale: 1,
        },
        change24hUsd: null,
        change24hPct: null,
        detailId: "ship.susde-ethena",
      },
    ],
  };
}
