import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildVisualCueRegistry } from "../systems/visual-cue-registry";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import {
  fixtureWithDepegOn,
  fixtureWithoutAsset,
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

  it("hides the Sky squad section when its flagship is missing; Maker squad still renders", () => {
    const world = buildPharosVilleWorld(fixtureWithoutAsset(makerSquadFixtureInputs(), "usds-sky"));
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).not.toContain("Sky squad");
    expect(markup).toContain("Maker squad");
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
