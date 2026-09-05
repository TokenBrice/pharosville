import { beforeEach, describe, expect, it } from "vitest";
import { overCapacityWorldFixture } from "../../../__fixtures__/over-capacity-world";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureReportCards,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureStability,
} from "../../../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "../../pharosville-world";
import { buildBaseMotionPlan } from "../../motion";
import { seawallBarrierDistance } from "../../seawall";
import { distanceToStationFootprint } from "../../dock-layout";
import { GARDEN_MOLE_OBSTACLES, gardenShipWaterMarginTiles, isGardenShipWater } from "../../garden-water-exclusion";
import {
  GARDEN_SILHOUETTE_FOR_HULL,
  gardenShipVisualScale,
} from "../../garden-observatory-slice";
import { UNIQUE_SHIP_DEFINITIONS } from "../../unique-ships";
import { isNavigableWaterTile, PREFERRED_DOCK_TILES } from "../../world-layout";
import { gardenWaterPlateContainsTile } from "../../projection";
import {
  buildDockAssignmentStage,
  berthFootprint,
  berthsOverlap,
  resetHeldMoorings,
} from "./dock-assignment";
import { resetHeldShipPlacements } from "./ship-placement";
import type { PharosVilleInputs } from "../pipeline-types";
import type { DockNode, ShipNode } from "../../world-types";
import type { StablecoinData } from "@shared/types";

// A wider anchorage fan gives crowded stations room without detaching voyages from their harbor.
const DENSE_STATION_MOORING_MAX_TILES = 30;

function denseWorldInputs(peggedAssets?: readonly StablecoinData[]): PharosVilleInputs {
  return {
    stablecoins: peggedAssets
      ? { ...denseFixtureStablecoins, peggedAssets: [...peggedAssets] }
      : denseFixtureStablecoins,
    chains: denseFixtureChains,
    stability: fixtureStability,
    pegSummary: denseFixturePegSummary,
    stress: denseFixtureStress,
    reportCards: denseFixtureReportCards,
    cemeteryEntries: [],
    freshness: {},
  };
}

describe("dock-assignment unique tier mooring placement", () => {
  beforeEach(() => {
    resetHeldShipPlacements();
    resetHeldMoorings();
  });

  it("prefers separated local envelopes when the cove has room", () => {
    const world = buildPharosVilleWorld(denseWorldInputs());
    const dock = world.docks.find((dock) => dock.chainId === "ethereum")!;
    const source = world.ships.find((ship) => ship.visual.scale < 0.8)!;
    const fleet = ["first", "second"].map((id) => ({
      ...source, id,
      chainPresence: [{ chainId: dock.chainId, currentUsd: 1_000, share: 1, hasRenderedDock: true }],
    }));
    const assign = () => {
      resetHeldMoorings();
      return buildDockAssignmentStage(fleet, [dock]).ships;
    };
    const ships = assign();
    const footprints = ships.map((ship) => berthFootprint(ship.dockVisits[0]!.mooringTile, ship, dock));
    expect(berthsOverlap(footprints[0]!, footprints[1]!)).toBe(false);
    expect(assign().map((ship) => ship.dockVisits)).toEqual(ships.map((ship) => ship.dockVisits));
  });

  it("keeps a 0.8-floor skiff berth distinct from its anchorage so its voyage has length", () => {
    const world = buildPharosVilleWorld(denseWorldInputs());
    const dock = world.docks.find((entry) => entry.chainId === "arbitrum")!;
    const source = world.ships.find((ship) => ship.visual.scale < 0.8)!;
    // A lone skiff: no squad, so the optional squad fields are omitted rather
    // than nulled (exactOptionalPropertyTypes).
    const { squadId, squadRole, ...loneSource } = source;
    void squadId;
    void squadRole;
    const skiff = {
      ...loneSource,
      id: "floor-skiff",
      marketCapUsd: 1,
      homeDockChainId: dock.chainId,
      visual: { ...source.visual, scale: 0.55, sizeTier: "skiff" as const },
      chainPresence: [{
        chainId: dock.chainId,
        currentUsd: 1,
        share: 1,
        hasRenderedDock: true,
      }],
      dockVisits: [],
    };
    const initial = buildDockAssignmentStage([skiff], [dock]).ships[0]!;
    const anchorage = initial.dockVisits[0]!.mooringTile;

    resetHeldMoorings();
    const assigned = buildDockAssignmentStage([{
      ...skiff,
      riskTile: anchorage,
      tile: anchorage,
    }], [dock]).ships;
    const berth = assigned[0]!.dockVisits[0]!.mooringTile;

    expect(gardenShipVisualScale(skiff.visual.scale)).toBe(0.8);
    expect(berth).not.toEqual(anchorage);
    const route = buildBaseMotionPlan({ ...world, ships: assigned }).shipRoutes.get(skiff.id)!;
    expect([...route.waterPaths.values()].every((path) => path.totalLength > 0)).toBe(true);
  });

  it("spreads busy-cove overflow instead of packing every remaining berth at the quay", () => {
    const world = buildPharosVilleWorld(denseWorldInputs());
    const dock = world.docks.find((entry) => entry.chainId === "base")!;
    const footprints = world.ships.flatMap((ship) => ship.dockVisits
      .filter((visit) => visit.dockId === dock.id)
      .map((visit) => berthFootprint(visit.mooringTile, ship, dock)));
    let overlapPairs = 0;
    for (let i = 0; i < footprints.length; i += 1) {
      for (let j = i + 1; j < footprints.length; j += 1) {
        if (berthsOverlap(footprints[i]!, footprints[j]!)) overlapPairs += 1;
      }
    }
    expect(footprints.length).toBeGreaterThan(30);
    // All possible visits, not simultaneous occupation. The nearest-point
    // fallback overlapped 522 of 703 pairs; least-penetration placement is 208.
    expect(overlapPairs / (footprints.length * (footprints.length - 1) / 2)).toBeLessThan(0.4);
  });

  it("spreads 136 Ethereum visits across the local anchorage instead of a narrow queue", () => {
    const world = overCapacityWorldFixture();
    const dock = world.docks.find((entry) => entry.chainId === "ethereum")!;
    const fleet = world.ships.slice(0, 136).map((ship, index) => ({
      ...ship,
      id: `fan-${index}`,
      squadRole: "flagship" as const,
      chainPresence: [{ chainId: "ethereum", currentUsd: ship.marketCapUsd, share: 1, hasRenderedDock: true }],
    }));
    resetHeldMoorings();
    const assigned = buildDockAssignmentStage(fleet, [dock]).ships;
    const footprints = assigned.map((ship) => berthFootprint(ship.dockVisits[0]!.mooringTile, ship, dock));
    expect(footprints).toHaveLength(136);
    expect(new Set(footprints.map(({ x, y }) => `${x}.${y}`)).size).toBe(136);
    for (const footprint of footprints) {
      expect(isGardenShipWater(footprint, footprint.halfLength)).toBe(true);
      for (const solid of GARDEN_MOLE_OBSTACLES) {
        expect(distanceToStationFootprint(footprint, solid)).toBeGreaterThanOrEqual(footprint.halfBeam - 1e-6);
      }
      // 2026-09-05: the 0.8 visual-scale floor lengthens every scale-1 hull
      // ~29%, so the same 136-berth fan reaches 38.1 tiles (was < 38).
      expect(Math.hypot(footprint.x - dock.tile.x, footprint.y - dock.tile.y)).toBeLessThan(40);
    }
    let pairs = 0;
    for (let i = 0; i < footprints.length; i += 1) for (let j = i + 1; j < footprints.length; j += 1) {
      if (berthsOverlap(footprints[i]!, footprints[j]!)) pairs += 1;
    }
    // Potential visits, not simultaneous dock occupancy: the narrow 17-tile fan
    // had 2,174 intersections of 9,180 pairs; the widened anchorage had 833 at
    // the 0.55 visual floor and measures 1,229 (0.134) at the 0.8 floor, whose
    // longer hulls overlap more for the same centres. Still 43% below the fan.
    expect(pairs / (136 * 135 / 2)).toBeLessThan(0.14);
  });

  it.each([320, 321])("assigns the entire %i-ship fleet without reserving every possible visit forever", (count) => {
    const world = overCapacityWorldFixture();
    resetHeldMoorings();
    const assigned = buildDockAssignmentStage(world.ships.slice(0, count), world.docks).ships;
    const keys = new Set<string>();
    for (const ship of assigned) {
      const margin = gardenShipWaterMarginTiles(gardenShipVisualScale(ship.visual.scale), GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull]);
      for (const visit of ship.dockVisits) {
        const key = `${visit.mooringTile.x}.${visit.mooringTile.y}`;
        expect(keys.has(key), key).toBe(false);
        keys.add(key);
        expect(isGardenShipWater(visit.mooringTile, margin)).toBe(true);
      }
    }
    expect(assigned).toHaveLength(count);
    expect(keys.size).toBeGreaterThan(count);
    const held = buildDockAssignmentStage(assigned, world.docks).ships;
    expect(held.map((ship) => ship.dockVisits)).toEqual(assigned.map((ship) => ship.dockVisits));
  });

  it("moors unique-tier ships with flagship-tier barrier clearance (>= 3.3)", () => {
    const world = buildPharosVilleWorld(denseWorldInputs());

    const uniqueIds = new Set(Object.keys(UNIQUE_SHIP_DEFINITIONS));
    const uniqueShips = world.ships.filter((ship) => uniqueIds.has(ship.id));

    // The dense fixture seeds from ACTIVE_STABLECOINS, so at least one unique
    // candidate must surface. If this assertion ever fails, the dense
    // fixture composition has changed and the test needs new bait.
    expect(uniqueShips.length).toBeGreaterThan(0);

    for (const ship of uniqueShips) {
      expect(ship.visual.sizeTier, ship.id).toBe("unique");
      for (const visit of ship.dockVisits) {
        const distance = seawallBarrierDistance(visit.mooringTile);
        expect(distance, `${ship.id} -> ${visit.dockId}`).toBeGreaterThanOrEqual(3.3);
      }
    }
  });

  it("keeps every dense-fixture berth on navigable water and local to its shore station", () => {
    const world = buildPharosVilleWorld(denseWorldInputs());
    const docks = new Map(world.docks.map((dock) => [dock.id, dock]));
    const visits = world.ships.flatMap((ship) => ship.dockVisits.map((visit) => ({ ship, visit })));
    expect(visits.length).toBeGreaterThan(0);

    for (const { ship, visit } of visits) {
      const dock = docks.get(visit.dockId)!;
      const hullMargin = gardenShipWaterMarginTiles(
        gardenShipVisualScale(ship.visual.scale || 1),
        GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull],
      );
      expect(isNavigableWaterTile(visit.mooringTile), `${ship.id} -> ${visit.dockId} water`).toBe(true);
      expect(
        isGardenShipWater(visit.mooringTile, hullMargin),
        `${ship.id} -> ${visit.dockId} full hull clears rim land`,
      ).toBe(true);
      expect(
        gardenWaterPlateContainsTile(visit.mooringTile, world.map),
        `${ship.id} -> ${visit.dockId} inside finite plate`,
      ).toBe(true);
      expect(
        Math.hypot(visit.mooringTile.x - dock.tile.x, visit.mooringTile.y - dock.tile.y),
        `${ship.id} -> ${visit.dockId} distance`,
      ).toBeLessThanOrEqual(DENSE_STATION_MOORING_MAX_TILES);
      const seawardX = Math.cos(dock.station.shoreBearing);
      const seawardY = Math.sin(dock.station.shoreBearing);
      const stationToBerthX = visit.mooringTile.x - dock.tile.x;
      const stationToBerthY = visit.mooringTile.y - dock.tile.y;
      expect(
        stationToBerthX * seawardX + stationToBerthY * seawardY,
        `${ship.id} -> ${visit.dockId} seaward`,
      ).toBeGreaterThan(0);
    }
  });

  it("keeps held berths clear of each other as ships join and leave", () => {
    // A held berth is claimed before any berth is searched for, so a ship
    // arriving at a busy dock cannot be handed a tile a survivor is holding.
    const all = denseFixtureStablecoins.peggedAssets ?? [];
    buildPharosVilleWorld(denseWorldInputs());

    for (let refresh = 1; refresh <= 6; refresh += 1) {
      const world = buildPharosVilleWorld(denseWorldInputs(
        all.filter((_, index) => (index + refresh) % 7 !== 0),
      ));

      const moorings = world.ships.flatMap((ship) => ship.dockVisits.map((visit) => ({
        key: `${visit.mooringTile.x}.${visit.mooringTile.y}`,
        label: `${ship.id} -> ${visit.dockId}`,
        tile: visit.mooringTile,
        ship,
      })));
      const seen = new Map<string, string>();
      for (const mooring of moorings) {
        expect(seen.get(mooring.key), `${mooring.label} collides with ${seen.get(mooring.key)}`).toBeUndefined();
        seen.set(mooring.key, mooring.label);
      }
    }
  });

  it("gives up a held berth the ship has outgrown", () => {
    // Barrier clearance is a function of the ship's size tier, so a berth held
    // from a smaller tier has to be surrendered rather than kept as a mooring
    // the hull no longer fits. Titans need 4.0.
    const all = denseFixtureStablecoins.peggedAssets ?? [];
    const grown = all.map((asset, index) => (index >= 20 && index < 30
      ? { ...asset, circulating: { peggedUSD: 60_000_000_000 } }
      : asset));

    buildPharosVilleWorld(denseWorldInputs());
    const after = buildPharosVilleWorld(denseWorldInputs(grown));

    const titans = after.ships.filter((ship) => ship.visual.sizeTier === "titan" && ship.dockVisits.length > 0);
    expect(titans.length).toBeGreaterThan(0);
    for (const ship of titans) {
      for (const visit of ship.dockVisits) {
        expect(seawallBarrierDistance(visit.mooringTile), `${ship.id} -> ${visit.dockId}`)
          .toBeGreaterThanOrEqual(4.0);
      }
    }
  });
});

describe("dock-assignment held berths follow their dock", () => {
  const HOME_TILE = PREFERRED_DOCK_TILES.ethereum!;
  // The relocation target must be a real current berth so the mooring search
  // finds water there. Solana's danger-gorge mouth is the far side of the rim
  // from the ethereum mole. (`avalanche` had a preferred berth before the rim
  // redistribution; it now falls through to the fill pool and holds no
  // PREFERRED_DOCK_TILES entry, so it can no longer supply this tile.)
  const MOVED_TILE = PREFERRED_DOCK_TILES.solana!;

  // `dock.id` is `dock.<chainId>`, so it survives a move: a chain with no
  // PREFERRED_DOCK_TILES entry draws from the shared pool in supply-rank order
  // and lands on a different tile when the ranking shifts.
  function dockAt(tile: { x: number; y: number }): DockNode[] {
    return [{
      id: "dock.driftchain",
      kind: "dock",
      station: { coveId: "fixture-cove", type: "tea-house-quay", shoreBearing: 0 },
      label: "Driftchain",
      chainId: "driftchain",
      tile,
      totalUsd: 1_000_000,
      size: 4,
      healthBand: null,
      stablecoinCount: 1,
      concentration: null,
      harboredStablecoins: [],
      detailId: "dock.driftchain",
    }];
  }

  const ships = [{
    id: "drift-coin",
    marketCapUsd: 1_000_000_000,
    homeDockChainId: "driftchain",
    riskTile: { x: 40, y: 40 },
    squadRole: null,
    visual: { sizeTier: "major", hull: "treasury-galleon", scale: 1 },
    chainPresence: [{ chainId: "driftchain", currentUsd: 1_000_000, share: 1, hasRenderedDock: true }],
  }] as unknown as ShipNode[];

  // A larger hull sorts ahead of drift-coin and takes berth index 0, which is
  // what would push drift-coin onto a different tile on a cold build.
  const withNewcomer = [...ships, {
    ...ships[0]!,
    id: "whale-coin",
    marketCapUsd: 90_000_000_000,
  }] as unknown as ShipNode[];

  const mooringOf = (tile: { x: number; y: number }, fleet: ShipNode[] = ships) =>
    buildDockAssignmentStage(fleet, dockAt(tile))
      .ships.find((ship) => ship.id === "drift-coin")!.dockVisits[0]!.mooringTile;

  it("re-berths a ship whose dock moved instead of mooring it in open water", () => {
    const cold = mooringOf(MOVED_TILE);
    resetHeldMoorings();

    const atHome = mooringOf(HOME_TILE);
    const afterMove = mooringOf(MOVED_TILE);

    // The berth held from the old position is legal water and would pass every
    // `isBerthTile` check, so only the dock's own tile can retire it.
    expect(afterMove).not.toEqual(atHome);
    expect(afterMove).toEqual(cold);
  });

  it("still holds the berth when the dock stays put and the fleet around it changes", () => {
    // The sticky-berth benefit itself: a ship whose own presence never changed
    // does not re-berth because a larger ship arrived at its dock.
    const held = mooringOf(HOME_TILE);
    expect(mooringOf(HOME_TILE, withNewcomer)).toEqual(held);

    resetHeldMoorings();
    expect(mooringOf(HOME_TILE, withNewcomer)).not.toEqual(held);
  });
});
