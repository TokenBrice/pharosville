import { describe, expect, it } from "vitest";
import { CEMETERY_ENTRIES } from "@shared/lib/cemetery-merged";
import { ACTIVE_IDS } from "@shared/lib/stablecoins";
import type { ReportCardsResponse } from "@shared/types";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureReportCards,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureChains,
  fixturePegSummary,
  fixtureReportCards,
  fixtureStability,
  fixtureStablecoins,
  fixtureStress,
  fixtureWithDepegOn,
  fixtureWithFlagshipPlacement,
  fixtureWithoutAsset,
  makePharosVilleWorldInput,
  makeAsset,
  makeChain,
  makePegCoin,
  makeReportCard,
  makerSquadFixtureInputs,
} from "../__fixtures__/pharosville-world";
import {
  MAKER_SQUAD_MEMBER_IDS,
  makerSquadFormationOffsetForPlacement,
  type MakerSquadMemberId,
} from "./maker-squad";
import { buildPharosVilleWorld, SHIP_WATER_ANCHORS } from "./pharosville-world";
import { isRiskPlacementWaterTile, riskPlacementWaterTiles } from "./risk-water-placement";
import { riskWaterAreaForPlacement } from "./risk-water-areas";
import {
  clampMapTile,
  isWaterTileKind,
  terrainKindAt,
  tileKindAt,
} from "./world-layout";

describe("buildPharosVilleWorld", () => {
  it("returns identical worlds for identical inputs with a supplied generatedAt", () => {
    const input = makePharosVilleWorldInput({
      generatedAt: 1_700_123_456_789,
      cemeteryEntries: CEMETERY_ENTRIES.slice(0, 3),
    });

    expect(buildPharosVilleWorld(input)).toEqual(buildPharosVilleWorld(input));
  });

  it("derives generatedAt deterministically from input data when omitted", () => {
    const input = makePharosVilleWorldInput({ generatedAt: undefined });
    const world = buildPharosVilleWorld(input);

    expect(world.generatedAt).toBe(1_700_000_000_000);
    expect(buildPharosVilleWorld(input)).toEqual(world);
  });

  it("builds deterministic core entities without React or canvas", () => {
    const world = buildPharosVilleWorld({
      stablecoins: fixtureStablecoins,
      chains: fixtureChains,
      stability: fixtureStability,
      pegSummary: fixturePegSummary,
      stress: fixtureStress,
      reportCards: fixtureReportCards,
      cemeteryEntries: CEMETERY_ENTRIES.slice(0, 3),
      freshness: {},
    });

    expect(world.routeMode).toBe("world");
    expect(world.map.waterRatio).toBeGreaterThanOrEqual(0.852);
    expect(world.map.waterRatio).toBeLessThanOrEqual(0.856);
    expect(world.lighthouse.unavailable).toBe(false);
    expect(world.docks).toHaveLength(2);
    expect(world.ships.map((ship) => ship.id)).toEqual(["usdt-tether", "usdc-circle"]);
    expect(world.ships.every((ship) => ["water", "deep-water"].includes(tileKindAt(ship.tile.x, ship.tile.y)))).toBe(true);
    expect(world.ships.every((ship) => ["water", "deep-water"].includes(tileKindAt(ship.riskTile.x, ship.riskTile.y)))).toBe(true);
    expect(new Set(world.ships.map((ship) => `${ship.tile.x}.${ship.tile.y}`)).size).toBe(world.ships.length);
    expect(world.ships.find((ship) => ship.id === "usdt-tether")?.logoSrc).toBe("/logos/1-usdt.svg");
    expect(world.detailIndex["ship.usdt-tether"]?.facts).toEqual(expect.arrayContaining([
      { label: "Ship class", value: "CeFi" },
      { label: "Size tier", value: "Titan" },
    ]));
    expect(world.graves).toHaveLength(3);
    expect(world.graves[0]?.logoSrc).toBe("/logos/cemetery/nubits.png");
    expect(world.detailIndex["lighthouse"]).toBeDefined();
    expect(terrainKindAt(0, 55)).toBe("calm-water");
    expect(Object.keys(world.detailIndex).some((detailId) => detailId.startsWith("building."))).toBe(false);
    expect(world.areas.every((area) => area.id.startsWith("area.dews.") || area.id.startsWith("area.risk-water."))).toBe(true);
    expect(world.visualCues.length).toBeGreaterThan(0);
  });

  it("omits removed data-building entities from the world model", () => {
    const reportCards = {
      ...fixtureReportCards,
      cards: [
        makeReportCard({ id: "usdc-circle", symbol: "USDC" }),
        makeReportCard({ id: "usdt-tether", symbol: "USDT" }),
        makeReportCard({ id: "pyusd-paypal", symbol: "PYUSD" }),
        makeReportCard({ id: "usdp-paxos", symbol: "USDP" }),
        makeReportCard({ id: "gusd-gemini", symbol: "GUSD" }),
        makeReportCard({ id: "tusd-trueusd", symbol: "TUSD" }),
      ],
      dependencyGraph: {
        edges: [
          { from: "usdc-circle", to: "usdt-tether", type: "collateral", weight: 0.4 },
          { from: "usdc-circle", to: "pyusd-paypal", type: "collateral", weight: 0.3 },
          { from: "usdc-circle", to: "usdp-paxos", type: "wrapper", weight: 0.2 },
          { from: "usdc-circle", to: "gusd-gemini", type: "mechanism", weight: 0.1 },
          { from: "usdc-circle", to: "tusd-trueusd", type: "mechanism", weight: 0.1 },
        ],
      },
    } as unknown as ReportCardsResponse;
    const world = buildPharosVilleWorld({
      stablecoins: fixtureStablecoins,
      chains: fixtureChains,
      stability: fixtureStability,
      pegSummary: fixturePegSummary,
      stress: fixtureStress,
      reportCards,
      cemeteryEntries: [],
      freshness: {},
    });

    expect(world.areas.every((area) => area.id.startsWith("area.dews.") || area.id.startsWith("area.risk-water."))).toBe(true);
    expect(world.legends.map((legend) => legend.id)).not.toContain("legend.buildings");
    expect(world.visualCues.map((cue) => cue.id).filter((id) => id.startsWith("cue.building."))).toEqual([]);
  });

  it("spreads ships across their resolved semantic water placements", () => {
    const ids = Array.from(ACTIVE_IDS).slice(0, 36);
    const world = buildPharosVilleWorld({
      stablecoins: {
        peggedAssets: ids.map((id, index) => makeAsset({
          id,
          symbol: `S${index}`,
          circulating: { peggedUSD: 1_000_000_000 - index },
        })),
      },
      chains: fixtureChains,
      stability: fixtureStability,
      pegSummary: {
        ...fixturePegSummary,
        coins: ids.map((id, index) => makePegCoin({ id, symbol: `S${index}` })),
      },
      stress: { ...fixtureStress, signals: {} },
      reportCards: fixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    });
    const calmShips = world.ships.filter((ship) => ship.riskPlacement === "safe-harbor");
    const navShips = world.ships.filter((ship) => ship.riskPlacement === "ledger-mooring");
    const xs = calmShips.map((ship) => ship.riskTile.x);
    const ys = calmShips.map((ship) => ship.riskTile.y);
    const calmBounds = tileBounds(riskPlacementWaterTiles("safe-harbor"));

    expect(world.ships.length).toBeGreaterThan(24);
    expect(calmShips.length).toBeGreaterThan(12);
    expect(navShips.length).toBeGreaterThan(0);
    expect(navShips.every((ship) => terrainKindAt(ship.riskTile.x, ship.riskTile.y) === "ledger-water")).toBe(true);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(Math.floor((calmBounds.maxX - calmBounds.minX) * 0.6));
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(Math.floor((calmBounds.maxY - calmBounds.minY) * 0.55));
    expect(world.ships.every((ship) => {
      const terrain = terrainKindAt(ship.riskTile.x, ship.riskTile.y);
      const validTerrains = riskWaterAreaForPlacement(ship.riskPlacement).validTerrains;
      return validTerrains === "any-water" ? isWaterTileKind(terrain) : validTerrains.includes(terrain);
    })).toBe(true);
  });

  it("keeps every authored ship anchor on water after island layout changes", () => {
    for (const [placement, anchors] of Object.entries(SHIP_WATER_ANCHORS)) {
      for (const anchor of anchors) {
        expect(
          isWaterTileKind(terrainKindAt(anchor.x, anchor.y)),
          `${placement} anchor ${anchor.x}.${anchor.y} should remain water`,
        ).toBe(true);
      }
    }
  });

  it("assigns rendered dock visits while preserving the representative risk tile", () => {
    const input = {
      stablecoins: fixtureStablecoins,
      chains: fixtureChains,
      stability: fixtureStability,
      pegSummary: fixturePegSummary,
      stress: fixtureStress,
      reportCards: fixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    };
    const world = buildPharosVilleWorld(input);
    const repeatedWorld = buildPharosVilleWorld(input);
    const ethereumDock = world.docks.find((dock) => dock.chainId === "ethereum");
    const usdt = world.ships.find((ship) => ship.id === "usdt-tether");
    const repeatedUsdt = repeatedWorld.ships.find((ship) => ship.id === "usdt-tether");
    const ethereumVisit = usdt?.dockVisits?.find((visit) => visit.chainId === "ethereum");

    expect(ethereumDock).toBeDefined();
    expect(usdt?.dockChainId).toBe("ethereum");
    expect(usdt?.homeDockChainId).toBe("ethereum");
    expect(usdt?.dominantChainId).toBe("ethereum");
    expect(ethereumVisit).toBeDefined();
    expect(ethereumVisit?.dockId).toBe(ethereumDock?.id);
    expect(usdt?.tile).toEqual(usdt?.riskTile);
    expect(ethereumVisit?.mooringTile).not.toEqual(usdt?.tile);
    expect(ethereumVisit?.mooringTile).not.toEqual(usdt?.riskTile);
    expect(ethereumVisit?.mooringTile).toBeDefined();
    expect(["water", "deep-water"]).toContain(tileKindAt(ethereumVisit?.mooringTile.x ?? -1, ethereumVisit?.mooringTile.y ?? -1));
    expect(["water", "deep-water"]).toContain(tileKindAt(usdt?.riskTile.x ?? -1, usdt?.riskTile.y ?? -1));
    expect(repeatedUsdt?.dockVisits).toEqual(usdt?.dockVisits);
    expect(repeatedUsdt?.tile).toEqual(usdt?.tile);
    expect(repeatedUsdt?.riskTile).toEqual(usdt?.riskTile);
    expect(usdt?.riskPlacement).toBe("safe-harbor");
    expect(usdt?.riskZone).toBe("calm");
    expect(usdt?.riskWaterLabel).toBe("Calm Anchorage");
  });

  it("names DEWS water areas from live band counts and anchors ships to matching risk water", () => {
    const stress = {
      ...fixtureStress,
      signals: {
        ...bandSignals("ALERT", 3),
        ...bandSignals("WATCH", 58),
        ...bandSignals("CALM", 107),
        "usdc-circle": {
          score: 55,
          band: "ALERT",
          signals: {},
          computedAt: 1_700_000_000,
          methodologyVersion: "fixture",
        },
      },
    };
    const world = buildPharosVilleWorld({
      stablecoins: {
        peggedAssets: [
          makeAsset({ id: "usdc-circle", symbol: "USDC" }),
        ],
      },
      chains: fixtureChains,
      stability: fixtureStability,
      pegSummary: {
        ...fixturePegSummary,
        coins: [makePegCoin({ id: "usdc-circle", symbol: "USDC" })],
      },
      stress,
      reportCards: fixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    });
    const counts = Object.fromEntries(
      world.areas
        .filter((area) => area.band)
        .map((area) => [area.band, area.count]),
    );
    const alertArea = world.areas.find((area) => area.band === "ALERT");
    const watchArea = world.areas.find((area) => area.band === "WATCH");
    const ledgerArea = world.areas.find((area) => area.riskPlacement === "ledger-mooring");
    const usdc = world.ships[0];

    expect(counts).toMatchObject({
      DANGER: 0,
      WARNING: 0,
      ALERT: 4,
      WATCH: 58,
      CALM: 107,
    });
    expect(world.areas.find((area) => area.band === "CALM")?.label).toBe("Calm Anchorage");
    expect(watchArea?.label).toBe("Watch Breakwater");
    expect(watchArea?.tile).toEqual({ x: 48, y: 44 });
    expect(watchArea?.tile ? terrainKindAt(watchArea.tile.x, watchArea.tile.y) : null).toBe("watch-water");
    expect(alertArea?.label).toBe("Alert Channel");
    expect(alertArea?.riskPlacement).toBe("harbor-mouth-watch");
    expect(alertArea?.tile ? terrainKindAt(alertArea.tile.x, alertArea.tile.y) : null).toBe("alert-water");
    expect(world.areas.map((area) => area.detailId)).not.toContain("area.risk-water.data-fog");
    expect(ledgerArea).toMatchObject({ label: "Ledger Mooring", riskZone: "ledger", detailId: "area.risk-water.ledger-mooring" });
    expect(ledgerArea?.tile).toEqual({ x: 10, y: 5 });
    expect(ledgerArea?.tile ? terrainKindAt(ledgerArea.tile.x, ledgerArea.tile.y) : null).toBe("ledger-water");
    expect(world.detailIndex["area.risk-water.data-fog"]).toBeUndefined();
    expect(world.detailIndex["area.risk-water.ledger-mooring"]?.facts).toEqual(expect.arrayContaining([
      { label: "Risk water zone", value: "ledger" },
      { label: "Risk placement", value: "ledger-mooring" },
    ]));
    expect(world.areas.find((area) => area.band === "WARNING")?.tile).toEqual({ x: 50, y: 8 });
    expect(world.areas.find((area) => area.band === "DANGER")?.tile).toEqual({ x: 54, y: 1 });
    expect(world.areas.every((area) => area.id.startsWith("area.dews.") || area.id.startsWith("area.risk-water."))).toBe(true);
    expect(terrainKindAt(45, 0)).toBe("warning-water");
    expect(terrainKindAt(55, 0)).toBe("storm-water");
    expect(usdc?.riskPlacement).toBe("harbor-mouth-watch");
    expect(usdc?.riskZone).toBe("alert");
    expect(usdc?.riskWaterLabel).toBe("Alert Channel");
  });

  it("maps warning and danger DEWS ships to escalating water terrain", () => {
    const world = buildPharosVilleWorld({
      stablecoins: fixtureStablecoins,
      chains: fixtureChains,
      stability: fixtureStability,
      pegSummary: fixturePegSummary,
      stress: {
        ...fixtureStress,
        signals: {
          "usdc-circle": {
            score: 76,
            band: "WARNING",
            signals: {},
            computedAt: 1_700_000_000,
            methodologyVersion: "fixture",
          },
          "usdt-tether": {
            score: 94,
            band: "DANGER",
            signals: {},
            computedAt: 1_700_000_000,
            methodologyVersion: "fixture",
          },
        },
      },
      reportCards: fixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    });
    const usdc = world.ships.find((ship) => ship.id === "usdc-circle");
    const usdt = world.ships.find((ship) => ship.id === "usdt-tether");

    expect(usdc?.riskPlacement).toBe("outer-rough-water");
    expect(usdc?.riskZone).toBe("warning");
    expect(usdc?.riskTile ? terrainKindAt(usdc.riskTile.x, usdc.riskTile.y) : null).toBe("warning-water");
    expect(usdt?.riskPlacement).toBe("storm-shelf");
    expect(usdt?.riskZone).toBe("danger");
    expect(usdt?.riskTile ? terrainKindAt(usdt.riskTile.x, usdt.riskTile.y) : null).toBe("storm-water");
  });

  it("canonicalizes positive chain presence and normalizes shares", () => {
    const world = buildPharosVilleWorld({
      stablecoins: {
        peggedAssets: [
          makeAsset({
            id: "usdc-circle",
            symbol: "USDC",
            chainCirculating: {
              "OP Mainnet": {
                current: 400,
                circulatingPrevDay: 400,
                circulatingPrevWeek: 400,
                circulatingPrevMonth: 400,
              },
              optimism: {
                current: 600,
                circulatingPrevDay: 600,
                circulatingPrevWeek: 600,
                circulatingPrevMonth: 600,
              },
              Ethereum: {
                current: 0,
                circulatingPrevDay: 0,
                circulatingPrevWeek: 0,
                circulatingPrevMonth: 0,
              },
              Tron: {
                current: -50,
                circulatingPrevDay: -50,
                circulatingPrevWeek: -50,
                circulatingPrevMonth: -50,
              },
            },
          }),
        ],
      },
      chains: {
        ...fixtureChains,
        chains: [makeChain({ id: "optimism", name: "Optimism", totalUsd: 1_000 })],
      },
      stability: fixtureStability,
      pegSummary: fixturePegSummary,
      stress: fixtureStress,
      reportCards: fixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    });
    const usdc = world.ships[0];

    expect(usdc?.chainPresence).toEqual([
      {
        chainId: "optimism",
        currentUsd: 1_000,
        share: 1,
        hasRenderedDock: true,
      },
    ]);
    expect(usdc?.dockVisits).toHaveLength(1);
    expect(usdc?.dockVisits?.[0]?.chainId).toBe("optimism");
  });

  it("excludes frozen response rows from active ships", () => {
    const world = buildPharosVilleWorld({
      stablecoins: {
        peggedAssets: [
          ...fixtureStablecoins.peggedAssets,
          makeAsset({ id: "usdc-circle", symbol: "USDC", frozen: true }),
        ],
      },
      chains: fixtureChains,
      stability: fixtureStability,
      pegSummary: fixturePegSummary,
      stress: fixtureStress,
      reportCards: fixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    });

    expect(world.ships.filter((ship) => ship.id === "usdc-circle")).toHaveLength(1);
  });

  it("renders unavailable PSI as an unlit lighthouse", () => {
    const world = buildPharosVilleWorld({
      stablecoins: fixtureStablecoins,
      chains: fixtureChains,
      stability: { ...fixtureStability, current: null },
      pegSummary: fixturePegSummary,
      stress: fixtureStress,
      reportCards: fixtureReportCards,
      cemeteryEntries: [],
      freshness: { stabilityStale: true },
    });

    expect(world.lighthouse.unavailable).toBe(true);
    expect(world.detailIndex.lighthouse.summary).toContain("unavailable");
  });

  it("uses the largest rendered positive chain as home dock when the dominant chain is unrendered", () => {
    const world = buildPharosVilleWorld({
      stablecoins: {
        peggedAssets: [
          makeAsset({
            id: "usdc-circle",
            symbol: "USDC",
            chainCirculating: {
              Solana: {
                current: 1_000_000_000,
                circulatingPrevDay: 1_000_000_000,
                circulatingPrevWeek: 1_000_000_000,
                circulatingPrevMonth: 1_000_000_000,
              },
              Ethereum: {
                current: 500_000_000,
                circulatingPrevDay: 500_000_000,
                circulatingPrevWeek: 500_000_000,
                circulatingPrevMonth: 500_000_000,
              },
              Tron: {
                current: 100_000_000,
                circulatingPrevDay: 100_000_000,
                circulatingPrevWeek: 100_000_000,
                circulatingPrevMonth: 100_000_000,
              },
            },
          }),
        ],
      },
      chains: { ...fixtureChains, chains: fixtureChains.chains.slice(0, 1) },
      stability: fixtureStability,
      pegSummary: fixturePegSummary,
      stress: fixtureStress,
      reportCards: fixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    });
    const usdc = world.ships[0];

    expect(usdc?.dominantChainId).toBe("solana");
    expect(usdc?.homeDockChainId).toBe("ethereum");
    expect(usdc?.dockChainId).toBe("ethereum");
    expect(usdc?.chainPresence?.map((presence) => presence.chainId)).toEqual(["solana", "ethereum", "tron"]);
    expect(usdc?.chainPresence?.reduce((sum, presence) => sum + presence.share, 0)).toBeCloseTo(1);
    expect(usdc?.dockVisits?.map((visit) => visit.chainId)).toEqual(["ethereum"]);
    expect(usdc?.dockVisits?.[0]?.weight).toBe(1);
  });

  it("suppresses only dock visits when there is no positive chain presence", () => {
    const world = buildPharosVilleWorld({
      stablecoins: {
        peggedAssets: [
          makeAsset({
            id: "usdc-circle",
            symbol: "USDC",
            chainCirculating: {
              Ethereum: {
                current: 0,
                circulatingPrevDay: 0,
                circulatingPrevWeek: 0,
                circulatingPrevMonth: 0,
              },
              Tron: {
                current: -100,
                circulatingPrevDay: -100,
                circulatingPrevWeek: -100,
                circulatingPrevMonth: -100,
              },
            },
          }),
        ],
      },
      chains: fixtureChains,
      stability: fixtureStability,
      pegSummary: {
        ...fixturePegSummary,
        coins: [makePegCoin({ id: "usdc-circle", symbol: "USDC", activeDepeg: true })],
      },
      stress: fixtureStress,
      reportCards: fixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    });
    const usdc = world.ships[0];

    expect(usdc?.chainPresence).toEqual([]);
    expect(usdc?.dockVisits).toEqual([]);
    expect(usdc?.dominantChainId).toBeNull();
    expect(usdc?.homeDockChainId).toBeNull();
    expect(usdc?.dockChainId).toBeNull();
    expect(usdc?.riskPlacement).toBe("storm-shelf");
    expect(usdc?.riskZone).toBe("danger");
    expect(usdc?.riskWaterLabel).toBe("Danger Strait");
    expect(usdc?.tile).toEqual(usdc?.riskTile);
    expect(["water", "deep-water"]).toContain(tileKindAt(usdc?.tile.x ?? -1, usdc?.tile.y ?? -1));
  });

  it("keeps active-depeg ships in the storm zone even with rendered dock visits", () => {
    const world = buildPharosVilleWorld({
      stablecoins: {
        peggedAssets: [
          makeAsset({
            id: "usdc-circle",
            symbol: "USDC",
            chainCirculating: {
              Ethereum: {
                current: 1_000_000_000,
                circulatingPrevDay: 1_000_000_000,
                circulatingPrevWeek: 1_000_000_000,
                circulatingPrevMonth: 1_000_000_000,
              },
            },
          }),
        ],
      },
      chains: fixtureChains,
      stability: fixtureStability,
      pegSummary: {
        ...fixturePegSummary,
        coins: [makePegCoin({ id: "usdc-circle", symbol: "USDC", activeDepeg: true })],
      },
      stress: fixtureStress,
      reportCards: fixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    });
    const usdc = world.ships[0];

    expect(usdc?.riskPlacement).toBe("storm-shelf");
    expect(usdc?.riskZone).toBe("danger");
    expect(usdc?.riskWaterLabel).toBe("Danger Strait");
    expect(usdc?.dockVisits?.map((visit) => visit.chainId)).toEqual(["ethereum"]);
    expect(usdc?.tile).toEqual(usdc?.riskTile);
    expect(usdc?.dockVisits?.[0]?.mooringTile).not.toEqual(usdc?.tile);
    expect(usdc?.dockVisits?.[0]?.mooringTile).not.toEqual(usdc?.riskTile);
    expect(["water", "deep-water"]).toContain(tileKindAt(usdc?.dockVisits?.[0]?.mooringTile.x ?? -1, usdc?.dockVisits?.[0]?.mooringTile.y ?? -1));
    expect(["water", "deep-water"]).toContain(tileKindAt(usdc?.riskTile.x ?? -1, usdc?.riskTile.y ?? -1));
  });

  it("renders every dense active stablecoin as an individual ship without clusters", () => {
    const world = buildPharosVilleWorld({
      stablecoins: denseFixtureStablecoins,
      chains: denseFixtureChains,
      stability: fixtureStability,
      pegSummary: denseFixturePegSummary,
      stress: denseFixtureStress,
      reportCards: denseFixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    });
    const activeAssetIds = new Set(denseFixtureStablecoins.peggedAssets.map((asset) => asset.id));

    expect(world.ships).toHaveLength(activeAssetIds.size);
    expect(new Set(world.ships.map((ship) => ship.id))).toEqual(activeAssetIds);
    expect(world.ships.every((ship) => ["water", "deep-water"].includes(tileKindAt(ship.tile.x, ship.tile.y)))).toBe(true);
    expect(world.ships.every((ship) => ["water", "deep-water"].includes(tileKindAt(ship.riskTile.x, ship.riskTile.y)))).toBe(true);
    expect(world.ships
      .filter((ship) => ship.riskPlacement === "ledger-mooring")
      .every((ship) => terrainKindAt(ship.riskTile.x, ship.riskTile.y) === "ledger-water")).toBe(true);
    expect(new Set(world.ships.map((ship) => ship.detailId)).size).toBe(world.ships.length);
    for (const ship of world.ships) {
      expect(world.detailIndex[ship.detailId]).toBeDefined();
    }
  });

  it("places all Maker squad members at the same risk placement", () => {
    const world = buildPharosVilleWorld(makerSquadFixtureInputs());
    const placements = MAKER_SQUAD_MEMBER_IDS.map((id) =>
      world.ships.find((s) => s.id === id)?.riskPlacement,
    );
    expect(placements.every((p) => p && p === placements[0])).toBe(true);
  });

  it("flagship-missing: consorts revert to per-asset placement, no squadId stamped", () => {
    const inputs = fixtureWithoutAsset(makerSquadFixtureInputs(), "usds-sky");
    const world = buildPharosVilleWorld(inputs);
    for (const id of ["susds-sky", "stusds-sky", "sdai-sky"]) {
      const ship = world.ships.find((s) => s.id === id)!;
      expect(ship.squadId).toBeUndefined();
      expect(ship.squadRole).toBeUndefined();
      expect(ship.riskPlacement).toBe("ledger-mooring");
    }
    const dai = world.ships.find((s) => s.id === "dai-makerdao")!;
    expect(dai.squadId).toBeUndefined();
  });

  it("placementEvidence keeps navToken sourceField for nav-token consorts", () => {
    const world = buildPharosVilleWorld(makerSquadFixtureInputs());
    const susds = world.ships.find((s) => s.id === "susds-sky")!;
    expect(susds.placementEvidence.sourceFields).toEqual(
      expect.arrayContaining(["meta.flags.navToken"]),
    );
  });

  it("consort with stronger stress still tracks flagship placement but flags squadOverride evidence", () => {
    const inputs = fixtureWithDepegOn(makerSquadFixtureInputs(), "dai-makerdao");
    const world = buildPharosVilleWorld(inputs);
    const dai = world.ships.find((s) => s.id === "dai-makerdao")!;
    const usds = world.ships.find((s) => s.id === "usds-sky")!;
    expect(dai.riskPlacement).toBe(usds.riskPlacement);
    expect(dai.placementEvidence.squadOverride).toBe(true);
  });

  it("places squad consorts at flagship + formation offset, never outside the placement's water", () => {
    const world = buildPharosVilleWorld(makerSquadFixtureInputs());
    const flagship = world.ships.find((s) => s.id === "usds-sky");
    expect(flagship).toBeDefined();
    for (const id of MAKER_SQUAD_MEMBER_IDS) {
      if (id === "usds-sky") continue;
      const consort = world.ships.find((s) => s.id === id)!;
      const offset = makerSquadFormationOffsetForPlacement(
        id as MakerSquadMemberId,
        flagship!.riskPlacement,
      );
      const expected = clampMapTile({
        x: flagship!.tile.x + offset.dx,
        y: flagship!.tile.y + offset.dy,
      });
      expect(Math.abs(consort.tile.x - expected.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(consort.tile.y - expected.y)).toBeLessThanOrEqual(1);
      expect(isRiskPlacementWaterTile(consort.tile, flagship!.riskPlacement)).toBe(true);
    }
  });

  it("contracts the formation when flagship is in storm-shelf", () => {
    const world = buildPharosVilleWorld(fixtureWithFlagshipPlacement("storm-shelf"));
    const flagship = world.ships.find((s) => s.id === "usds-sky")!;
    const stusds = world.ships.find((s) => s.id === "stusds-sky")!;
    expect(flagship.riskPlacement).toBe("storm-shelf");
    // Contracted: stUSDS dy = Math.trunc(-3 / 2) = -1, plus ±1 placement clamp drift.
    // Bounds catch a regression where contraction broke (e.g. dy stayed at -3, or
    // Math.round flipped to -2 and drift landed at -3).
    const dy = stusds.tile.y - flagship.tile.y;
    expect(dy).toBeGreaterThanOrEqual(-2);
    expect(dy).toBeLessThanOrEqual(0);
    expect(isRiskPlacementWaterTile(stusds.tile, "storm-shelf")).toBe(true);
  });
});

function bandSignals(band: "ALERT" | "WATCH" | "CALM", count: number) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [
    `${band.toLowerCase()}-${index}`,
    {
      score: band === "ALERT" ? 55 : band === "WATCH" ? 30 : 5,
      band,
      signals: {},
      computedAt: 1_700_000_000,
      methodologyVersion: "fixture",
    },
  ]));
}

function tileBounds(tiles: readonly { x: number; y: number }[]) {
  return tiles.reduce((bounds, tile) => ({
    minX: Math.min(bounds.minX, tile.x),
    maxX: Math.max(bounds.maxX, tile.x),
    minY: Math.min(bounds.minY, tile.y),
    maxY: Math.max(bounds.maxY, tile.y),
  }), {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });
}
