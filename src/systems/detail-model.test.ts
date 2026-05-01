import { describe, expect, it } from "vitest";
import { detailForArea, detailForDock, detailForLighthouse, detailForShip } from "./detail-model";
import type { AreaNode, DockNode, LighthouseNode, ShipNode } from "./world-types";
import { buildPharosVilleWorld } from "./pharosville-world";
import {
  fixtureWithDepegOn,
  fixtureWithoutAsset,
  makerSquadFixtureInputs,
} from "../__fixtures__/pharosville-world";

describe("detail-model analytical links", () => {
  it("points built-in detail links at canonical Pharos Watch routes", () => {
    expect(detailForLighthouse({
      id: "lighthouse",
      kind: "lighthouse",
      label: "Pharos lighthouse",
      tile: { x: 1, y: 1 },
      psiBand: "NORMAL",
      score: 42,
      color: "#ffffff",
      unavailable: false,
      detailId: "lighthouse",
    } satisfies LighthouseNode).links).toEqual([
      { label: "PSI", href: "https://pharos.watch/stability-index/" },
    ]);

    expect(detailForDock({
      id: "dock.ethereum",
      kind: "dock",
      label: "Ethereum",
      chainId: "ethereum",
      logoSrc: "/chains/ethereum.png",
      assetId: "dock.ethereum-civic-cove",
      tile: { x: 1, y: 1 },
      totalUsd: 100,
      size: 1,
      healthBand: "healthy",
      stablecoinCount: 1,
      concentration: null,
      harboredStablecoins: [{ id: "usdt-tether", symbol: "USDT", share: 1, supplyUsd: 100 }],
      detailId: "dock.ethereum",
    } satisfies DockNode).links[0]).toEqual({
      label: "Chain",
      href: "https://pharos.watch/chains/ethereum/",
    });
  });

  it("rewrites member and custom area analytical links", () => {
    expect(detailForArea({
      id: "area.dews.danger",
      kind: "area",
      label: "Danger Strait",
      tile: { x: 1, y: 1 },
      detailId: "area.dews.danger",
      links: [{ label: "Custom DEWS", href: "/depeg/" }],
    } satisfies AreaNode).links).toEqual([
      { label: "Custom DEWS", href: "https://pharos.watch/depeg/" },
    ]);
  });

  it("points ship detail links at canonical stablecoin pages", () => {
    const detail = detailForShip({
      id: "usdt-tether",
      kind: "ship",
      label: "Tether",
      symbol: "USDT",
      asset: {} as ShipNode["asset"],
      meta: {} as ShipNode["meta"],
      reportCard: null,
      logoSrc: null,
      tile: { x: 1, y: 1 },
      riskTile: { x: 2, y: 2 },
      chainPresence: [],
      dockVisits: [],
      dominantChainId: null,
      homeDockChainId: null,
      dockChainId: null,
      marketCapUsd: 100,
      riskPlacement: "safe-harbor",
      riskZone: "calm",
      riskWaterLabel: "Calm Anchorage",
      placementEvidence: { reason: "Fresh", sourceFields: ["pegSummary.coins[]"], stale: false },
      visual: {
        hull: "treasury-galleon",
        shipClass: "cefi",
        classLabel: "CeFi",
        rigging: "issuer-rig",
        pennant: "USDT",
        pegLabel: "USD peg",
        pegPattern: "ring",
        pegShape: "disc",
        livery: {
          accent: "#27b6a5",
          label: "Tether logo livery",
          logoMatte: "#f7fffb",
          logoShape: "circle",
          primary: "#009393",
          sailColor: "#d8efe7",
          sailPanel: "center",
          secondary: "#005f61",
          source: "stablecoin-logo",
          stripePattern: "double",
        },
        sailColor: "#d8efe7",
        sailStripeColor: "#009393",
        overlay: "none",
        sizeTier: "major",
        sizeLabel: "Major",
        scale: 1,
      },
      change24hUsd: null,
      change24hPct: null,
      detailId: "ship.usdt-tether",
    } satisfies ShipNode);

    expect(detail.links).toEqual([
      { label: "Stablecoin", href: "https://pharos.watch/stablecoin/usdt-tether/" },
    ]);
  });

  it("exposes ship route and Ledger Mooring placement facts", () => {
    const detail = detailForShip({
      id: "susde-ethena",
      kind: "ship",
      label: "Staked USDe",
      symbol: "sUSDe",
      asset: {} as ShipNode["asset"],
      meta: {} as ShipNode["meta"],
      reportCard: null,
      logoSrc: null,
      tile: { x: 1, y: 1 },
      riskTile: { x: 30, y: 52 },
      chainPresence: [{ chainId: "ethereum", currentUsd: 100, hasRenderedDock: true, share: 1 }],
      dockVisits: [{ chainId: "ethereum", dockId: "dock.ethereum", weight: 1, mooringTile: { x: 28, y: 44 } }],
      dominantChainId: "ethereum",
      homeDockChainId: "ethereum",
      dockChainId: "ethereum",
      marketCapUsd: 100,
      riskPlacement: "ledger-mooring",
      riskZone: "ledger",
      riskWaterLabel: "Ledger Mooring",
      placementEvidence: { reason: "NAV token Ledger Mooring idle preference", sourceFields: ["meta.flags.navToken", "pegSummary.coins[]"], stale: false },
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
    } satisfies ShipNode);

    expect(detail.facts).toEqual(expect.arrayContaining([
      { label: "Representative position", value: "Ledger Mooring idle" },
      { label: "Ship livery", value: "Ethena staked livery; pill logo shape, hoist sail panel, diagonal brand stripe" },
      { label: "Risk water area", value: "Ledger Mooring" },
      { label: "Risk water zone", value: "ledger" },
      { label: "Risk placement key", value: "ledger-mooring" },
      { label: "Home dock", value: "Ethereum" },
      { label: "Docking cadence", value: "Occasional; 1 positive chain deployment, 1 rendered dock stop" },
      { label: "Route source", value: "stablecoins.chainCirculating, pegSummary.coins[], stress.signals[]" },
      { label: "Evidence", value: "meta.flags.navToken, pegSummary.coins[]" },
    ]));
  });
});

describe("detail-model squad surfacing", () => {
  it("Sky squad detail panel surfaces flagship + vanguard + savings cutter", () => {
    const world = buildPharosVilleWorld(makerSquadFixtureInputs());
    const susds = world.ships.find((ship) => ship.id === "susds-sky")!;
    const detail = world.detailIndex[susds.detailId]!;

    const formationFact = detail.facts.find((fact) => fact.label === "Sailing in formation");
    expect(formationFact).toBeDefined();
    expect(formationFact!.value).toContain("USDS (flagship)");
    expect(formationFact!.value).toContain("stUSDS (vanguard)");
    expect(formationFact!.value).toContain("sUSDS");
    // DAI/sDAI are in the Maker squad and must NOT appear in the Sky detail.
    expect(formationFact!.value).not.toContain("DAI");
    expect(detail.summary).toContain("inherits flagship placement");
  });

  it("Maker squad detail panel surfaces flagship + sDAI", () => {
    const world = buildPharosVilleWorld(makerSquadFixtureInputs());
    const sdai = world.ships.find((ship) => ship.id === "sdai-sky")!;
    const detail = world.detailIndex[sdai.detailId]!;

    const formationFact = detail.facts.find((fact) => fact.label === "Sailing in formation");
    expect(formationFact).toBeDefined();
    expect(formationFact!.value).toContain("DAI (flagship)");
    expect(formationFact!.value).toContain("sDAI");
    // Sky members must NOT appear in the Maker detail.
    expect(formationFact!.value).not.toContain("USDS");
    expect(formationFact!.value).not.toContain("stUSDS");
  });

  it("squad detail panel surfaces the override banner when a Sky consort outpaces its flagship", () => {
    const world = buildPharosVilleWorld(fixtureWithDepegOn(makerSquadFixtureInputs(), "susds-sky"));
    const susds = world.ships.find((ship) => ship.id === "susds-sky")!;
    expect(susds.placementEvidence.squadOverride).toBeDefined();
    expect(susds.placementEvidence.squadOverride?.ownPlacement).toBeDefined();
    expect(susds.placementEvidence.squadOverride?.ownReason).toBeTruthy();

    const detail = world.detailIndex[susds.detailId]!;
    const overrideFact = detail.facts.find((fact) => fact.label === "Squad override");
    expect(overrideFact).toBeDefined();
    expect(overrideFact!.value).toContain("sUSDS in distress");
    expect(overrideFact!.value).toContain("squad sheltering at flagship's position");
  });

  it("Sky squad goes silent on its members when its flagship is missing; Maker squad continues", () => {
    const inputs = fixtureWithoutAsset(makerSquadFixtureInputs(), "usds-sky");
    const world = buildPharosVilleWorld(inputs);
    // Sky-side: stUSDS no longer in a squad, no formation/override facts.
    const stusds = world.ships.find((ship) => ship.id === "stusds-sky")!;
    const stusdsDetail = world.detailIndex[stusds.detailId]!;
    expect(stusdsDetail.facts.find((fact) => fact.label === "Sailing in formation")).toBeUndefined();
    expect(stusdsDetail.facts.find((fact) => fact.label === "Squad override")).toBeUndefined();
    expect(stusdsDetail.summary).not.toContain("inherits flagship placement");

    // Maker-side: still active.
    const sdai = world.ships.find((ship) => ship.id === "sdai-sky")!;
    const sdaiDetail = world.detailIndex[sdai.detailId]!;
    const formationFact = sdaiDetail.facts.find((fact) => fact.label === "Sailing in formation");
    expect(formationFact).toBeDefined();
    expect(formationFact!.value).toContain("DAI (flagship)");
  });
});
