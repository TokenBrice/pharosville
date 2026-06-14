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
import type { PharosVilleWorld } from "../systems/world-types";
import { AccessibilityLedger } from "./accessibility-ledger";

describe("AccessibilityLedger", () => {
  it("does not expose ship-cluster ledger or cue rows", () => {
    const markup = renderToStaticMarkup(<AccessibilityLedger world={sampleWorld()} />);

    expect(markup).not.toContain("Ship clusters");
    expect(markup).not.toContain("count-capped water-zone cluster marker");
    expect(markup).not.toContain("long-tail cluster detail panel");
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

  it("names the active fleet focus subset when a focus summary is provided", () => {
    const markup = renderToStaticMarkup(
      <AccessibilityLedger
        world={sampleWorldWithLedgerShip()}
        fleetFocusSummary={{
          activeSubsetLabel: "chain Ethereum",
          matchCount: 1,
          matchCountLabel: "1 of 1 ships",
          totalCount: 1,
        }}
      />,
    );

    expect(markup).toContain("Fleet focus: 1 of 1 ships at full alpha for chain Ethereum");
    expect(markup).toContain("non-matching ships dimmed to about 25% alpha");
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
    // Renderer-canonical hex values from src/renderer/layers/docks.ts.
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
        label: "Ethereum",
        chainId: "ethereum",
        logoSrc: null,
        assetId: "dock.ethereum-civic-cove",
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
    expect(markup).toContain("72.7% of stablecoin supply");
    expect(markup).toContain("concentration moderately concentrated (HHI 0.40)");
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

  it("appends a heritage-hull clause for ships carrying uniqueRationale", () => {
    const world = sampleWorldWithUniqueShip();
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("heritage hull:");
    expect(markup).toContain("llama mascot");
  });

  it("appends a cycle tempo clause for each ship", () => {
    const world = sampleWorldWithLedgerShip();
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    // Single-ship fleet → always Q0 → Languid.
    expect(markup).toContain("cycle tempo Languid");
    expect(markup).toContain("cycle pace tracks supply tier, not transfers");
  });

  it("mirrors lighthouse trend, composition, and contributors in the ledger", () => {
    const world: PharosVilleWorld = {
      ...sampleWorld(),
      lighthouse: {
        ...sampleWorld().lighthouse,
        components: { severity: 0.7, breadth: 0.3, trend: 0.05 },
        avg24h: 68,
        avg24hBand: "ALERT",
        contributors: [{ id: "usdt-tether", symbol: "USDT", bps: -12, mcapUsd: 90_000_000_000 }],
      },
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("Trend: Observed 24h drift deteriorating");
    expect(markup).toContain("Composition: severity 70%, breadth 30%");
    expect(markup).toContain("Top contributors: USDT -12 bps ($90.0B)");
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

  it("exposes the deterministic sea-state summary for DOM parity", () => {
    const world: PharosVilleWorld = {
      ...sampleWorld(),
      lighthouse: {
        ...sampleWorld().lighthouse,
        psiBand: "DANGER",
        score: 90,
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

  it("cycle tempo label is one of the four canonical values", () => {
    const world = sampleWorldWithLedgerShip();
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    const validLabels = ["Languid", "Steady", "Brisk", "Active"];
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
        logoSrc: null,
        tile: { x: 1, y: 1 },
        visual: { marker: "broken-keel", scale: 1 },
        detailId: "grave.ust-terra",
      }],
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("TerraUSD (UST): Algorithmic Failure, 2022-05-12, peak market cap $18.8B.");
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
        logoSrc: null,
        tile: { x: 1, y: 1 },
        visual: { marker: "skeletal", scale: 1 },
        detailId: "grave.nbt-nubits",
      }],
    };
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("NuBits (NBT): Abandoned, 2016-06-01.");
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
      psiBand: "NORMAL",
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
    effects: [],
    detailIndex: {},
    entityById: {},
    legends: [],
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
          hull: "dao-schooner",
          spriteAssetId: "ship.crvusd-unique",
          uniqueRationale: "Sails under Curve's llama mascot — the DEX that defined stablecoin AMM curves.",
          shipClass: "defi",
          classLabel: "DeFi",
          rigging: "dao-rig",
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
          sailStripeColor: "#41956b",
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
          hull: "treasury-galleon",
          shipClass: "cefi",
          classLabel: "CeFi",
          rigging: "issuer-rig",
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
          sailStripeColor: "#686963",
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
