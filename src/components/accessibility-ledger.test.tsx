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

  it("renders a single Maker squad row listing all five members and the shared placement", () => {
    const world = buildPharosVilleWorld(makerSquadFixtureInputs());
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("Maker squad");
    expect(markup).toContain("USDS (flagship)");
    expect(markup).toContain("stUSDS (vanguard)");
    expect(markup).toContain("sUSDS");
    expect(markup).toContain("sDAI");
    expect(markup).toContain("Sailing in formation");
  });

  it("includes a sub-row for any squadOverride consort", () => {
    const world = buildPharosVilleWorld(fixtureWithDepegOn(makerSquadFixtureInputs(), "dai-makerdao"));
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).toContain("DAI in distress");
    expect(markup).toContain("squad sheltering at flagship");
  });

  it("does not render the Maker squad section when the flagship is missing", () => {
    const world = buildPharosVilleWorld(fixtureWithoutAsset(makerSquadFixtureInputs(), "usds-sky"));
    const markup = renderToStaticMarkup(<AccessibilityLedger world={world} />);

    expect(markup).not.toContain("Maker squad");
    expect(markup).not.toContain("Sailing in formation");
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
    docks: [],
    areas: [],
    ships: [],
    graves: [],
    effects: [],
    detailIndex: {},
    legends: [],
    visualCues: buildVisualCueRegistry(),
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
          reason: "NAV token ledger placement",
          sourceFields: ["meta.flags.navToken", "pegSummary.coins[]"],
          stale: false,
        },
        visual: {
          hull: "treasury-galleon",
          shipClass: "cefi",
          classLabel: "CeFi",
          rigging: "issuer-rig",
          pennant: "sUSDe",
          pegLabel: "USD peg",
          pegPattern: "ring",
          pegShape: "disc",
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
