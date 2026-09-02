import { describe, expect, it } from "vitest";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureReportCards,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureStability,
} from "../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "./pharosville-world";
import { buildBaseMotionPlan } from "./motion-planning";
import { warmAllWaterPaths } from "./motion-water";
import { pathKey } from "./motion-utils";
import {
  gardenShipVisualScale,
  resolveGardenShipDisplayTile,
  selectGardenObservatorySlice,
} from "./garden-observatory-slice";
import {
  GARDEN_CEMETERY_OBSTACLE,
  GARDEN_ISLAND_OBSTACLE,
  GARDEN_ISLET_OBSTACLES,
  GARDEN_PIGEONNIER_OBSTACLE,
  gardenShipWaterMarginTiles,
  isGardenObstacleTile,
  isGardenShipWater,
  nearestGardenShipWater,
} from "./garden-water-exclusion";
import { landWorldTile, zoneWorldTile } from "./map-scale";
import { CEMETERY_CENTER } from "./world-layout";

/** `isGardenObstacleTile` for an already-transformed world tile. */
function isObstacleAt(tile: { x: number; y: number }): boolean {
  return isGardenObstacleTile(tile.x, tile.y);
}

function denseWorld() {
  return buildPharosVilleWorld({
    cemeteryEntries: [],
    chains: denseFixtureChains,
    freshness: {},
    pegSummary: denseFixturePegSummary,
    reportCards: denseFixtureReportCards,
    stability: fixtureStability,
    stablecoins: denseFixtureStablecoins,
    stress: denseFixtureStress,
  });
}

function shipMargin(ship: { visual: { scale?: number } }): number {
  return gardenShipWaterMarginTiles(gardenShipVisualScale(ship.visual.scale || 1));
}

describe("garden water exclusion (zones-v2 placement fix)", () => {
  it("marks the rendered landmasses as obstacles and open sea as water", () => {
    // Island heart and garden islets are obstacles. N1: every landmass is
    // authored in the 56-tile design space and OFFSET onto the 112-tile grid,
    // so its absolute footprint is unchanged; the pigeonnier rides the Watch
    // shelf and therefore SCALES with the zone bands.
    expect(isObstacleAt(landWorldTile({ x: 30, y: 37 }))).toBe(true);
    expect(isObstacleAt(landWorldTile({ x: 33, y: 44 }))).toBe(true); // data water under the rendered rock
    expect(isObstacleAt(landWorldTile({ x: 28, y: 8 }))).toBe(true); // crane islet
    expect(isObstacleAt(landWorldTile({ x: 4, y: 20 }))).toBe(true); // turtle islet
    expect(isObstacleAt(landWorldTile({ x: 26, y: 44 }))).toBe(true); // lone islet
    expect(isObstacleAt(zoneWorldTile({ x: 50, y: 50 }))).toBe(true); // pigeonnier
    // N2: the cemetery islet is gone. What is left at the heart of the wreck
    // shoals is a small courtesy clearance so a live hull never parks inside a
    // wreck — the shoals themselves are open, sailable water.
    expect(isObstacleAt(CEMETERY_CENTER)).toBe(true);
    expect(isObstacleAt(landWorldTile({ x: 8, y: 50 }))).toBe(false); // the old islet's water
    // RIM FIELD: the extreme south-west edge is now the land bank enclosing Wreck Shoal.
    expect(isObstacleAt(zoneWorldTile({ x: 0, y: 55 }))).toBe(true);
    // Open sea stays open.
    expect(isObstacleAt(zoneWorldTile({ x: 10, y: 30 }))).toBe(false);
    expect(isObstacleAt(zoneWorldTile({ x: 45, y: 10 }))).toBe(false);
    // RIM FIELD REVISION 1: the asymmetric south bank is sampled at its deeper western shoulder.
    expect(isObstacleAt(zoneWorldTile({ x: 38, y: 55 }))).toBe(true);
  });

  it("resolves invalid targets to the nearest valid water deterministically", () => {
    const target = landWorldTile({ x: 31, y: 42 }); // inside the rendered island
    const first = nearestGardenShipWater(target, 3, "test.seed", true);
    const second = nearestGardenShipWater(target, 3, "test.seed", true);
    expect(first).toEqual(second);
    expect(isGardenShipWater(first, 3, true)).toBe(true);
    // Nearest-search: the fix-up stays close to the authored target.
    expect(Math.hypot(first.x - target.x, first.y - target.y)).toBeLessThan(12);
    // Valid points pass through untouched.
    const valid = zoneWorldTile({ x: 46.9, y: 23.4 });
    expect(nearestGardenShipWater(valid, 3, "test.seed", true)).toEqual(valid);
  });

  it("keeps every representative display position on valid water with hull clearance", () => {
    const world = denseWorld();
    const slice = selectGardenObservatorySlice(world, null);
    expect(slice.ships.length).toBeGreaterThan(0);
    for (const placement of slice.ships) {
      const margin = shipMargin(placement.ship);
      const display = resolveGardenShipDisplayTile({ ...placement, sample: null });
      expect(
        isGardenShipWater(display, margin, true),
        `${placement.ship.id} (${placement.ship.riskZone}) at (${display.x.toFixed(1)},${display.y.toFixed(1)})`,
      ).toBe(true);
      // Motion extremes (risk drift / clamped transit contribution) stay valid.
      for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2]] as const) {
        const moved = resolveGardenShipDisplayTile({
          ...placement,
          sample: {
            tile: { x: placement.ship.tile.x + dx, y: placement.ship.tile.y + dy },
            state: "risk-drift",
          },
        });
        expect(
          isGardenShipWater(moved, margin),
          `${placement.ship.id} drifted to (${moved.x.toFixed(1)},${moved.y.toFixed(1)})`,
        ).toBe(true);
      }
    }
  });

  it("keeps every ship display on valid water when driven by its motion sample", () => {
    // D1 (W3) removed the representative/transient split at this fleet size —
    // every ship is rendered. The contract that matters is unchanged: a
    // display tile resolved straight from a motion sample must never land on
    // rock, a pier or an islet.
    const world = denseWorld();
    for (const ship of world.ships) {
      const margin = shipMargin(ship);
      const display = resolveGardenShipDisplayTile({
        displayOffset: { x: 0, y: 0 },
        representative: false,
        sample: { tile: ship.tile, state: "risk-drift" },
        ship,
      });
      expect(
        isGardenShipWater(display, margin),
        `${ship.id} (${ship.riskZone}) at (${display.x.toFixed(1)},${display.y.toFixed(1)})`,
      ).toBe(true);
    }
  });

  it("places every ship risk tile and dock mooring off the rendered landmasses", () => {
    const world = denseWorld();
    for (const ship of world.ships) {
      expect(isGardenObstacleTile(ship.tile.x, ship.tile.y), `${ship.id} tile`).toBe(false);
      expect(isGardenObstacleTile(ship.riskTile.x, ship.riskTile.y), `${ship.id} riskTile`).toBe(false);
      for (const visit of ship.dockVisits) {
        expect(
          isGardenObstacleTile(visit.mooringTile.x, visit.mooringTile.y),
          `${ship.id} mooring ${visit.dockId} (${visit.mooringTile.x},${visit.mooringTile.y})`,
        ).toBe(false);
      }
    }
  });

  // Solves and warms every water path in a deliberately dense world, so it sits
  // near the 5s default on a quiet machine and over it on a busy one. The
  // budget is for the assertions, not for A* throughput — perf is measured on
  // the real GPU, never here.
  it("routes every motion waypoint and path around the rendered landmasses", { timeout: 20_000 }, () => {
    const world = denseWorld();
    const plan = buildBaseMotionPlan(world);
    warmAllWaterPaths(plan);
    // Chaikin smoothing cuts corners slightly; assert against the obstacle
    // shapes inset by 0.4 tiles so legitimate smoothing slack cannot flake.
    const insetObstacle = (x: number, y: number): boolean => {
      const point = { x, y };
      const island = GARDEN_ISLAND_OBSTACLE;
      if ((((x - island.x) / (island.rx - 0.4)) ** 2 + ((y - island.y) / (island.ry - 0.4)) ** 2) < 1) return true;
      const cemetery = GARDEN_CEMETERY_OBSTACLE;
      if ((((x - cemetery.x) / (cemetery.rx - 0.4)) ** 2 + ((y - cemetery.y) / (cemetery.ry - 0.4)) ** 2) < 1) return true;
      const pigeon = GARDEN_PIGEONNIER_OBSTACLE;
      if (Math.hypot(point.x - pigeon.x, point.y - pigeon.y) < pigeon.r - 0.4) return true;
      return GARDEN_ISLET_OBSTACLES.some((islet) => (
        Math.hypot(point.x - islet.x, point.y - islet.y) < islet.r - 0.4
      ));
    };
    let pointCount = 0;
    for (const route of plan.shipRoutes.values()) {
      expect(insetObstacle(route.riskTile.x, route.riskTile.y), `${route.shipId} riskTile`).toBe(false);
      for (const stop of route.dockStops) {
        expect(insetObstacle(stop.mooringTile.x, stop.mooringTile.y), `${route.shipId} mooring`).toBe(false);
      }
      const paths = [
        ...route.dockStops.flatMap((stop) => [
          route.waterPaths.get(pathKey(route.riskTile, stop.mooringTile)),
          route.waterPaths.get(pathKey(stop.mooringTile, route.riskTile)),
        ]),
        ...(route.openWaterPatrol
          ? route.openWaterPatrol.itinerary.flatMap((leg) => [leg.outbound, leg.inbound])
          : []),
      ];
      for (const path of paths) {
        if (!path) continue;
        for (const point of path.points) {
          pointCount += 1;
          expect(
            insetObstacle(point.x, point.y),
            `${route.shipId} path point (${point.x.toFixed(2)},${point.y.toFixed(2)})`,
          ).toBe(false);
        }
      }
    }
    expect(pointCount).toBeGreaterThan(1000);
  });
});
