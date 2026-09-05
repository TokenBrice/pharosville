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
import { seawallBarrierDistance } from "../../seawall";
import { gardenShipWaterMarginTiles, isGardenShipWater } from "../../garden-water-exclusion";
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

const DENSE_STATION_MOORING_MAX_TILES = 20;

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
