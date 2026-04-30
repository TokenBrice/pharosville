import { describe, expect, it } from "vitest";
import { detailForArea, detailForDock, detailForLighthouse, detailForShip } from "./detail-model";
import type { AreaNode, DockNode, LighthouseNode, ShipNode } from "./world-types";

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
      assetId: "dock.harbor-ring-quay",
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
      placementEvidence: { reason: "NAV token ledger placement", sourceFields: ["meta.flags.navToken", "pegSummary.coins[]"], stale: false },
      visual: {
        hull: "treasury-galleon",
        shipClass: "cefi",
        classLabel: "CeFi",
        rigging: "issuer-rig",
        pennant: "sUSDe",
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
