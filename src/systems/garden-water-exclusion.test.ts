import { describe, expect, it } from "vitest";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureReportCards,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureStability,
  makePharosVilleWorldInput,
} from "../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "./pharosville-world";
import { buildBaseMotionPlan } from "./motion-planning";
import { resolveShipMotionSample, type ShipMotionSample } from "./motion";
import { warmAllWaterPaths } from "./motion-water";
import { pathKey } from "./motion-utils";
import {
  GARDEN_SILHOUETTE_FOR_HULL,
  gardenShipVisualScale,
  resolveGardenDependencyShipDisplayTile,
  resolveGardenShipDisplayTile,
  selectGardenObservatorySlice,
} from "./garden-observatory-slice";
import {
  GARDEN_CEMETERY_OBSTACLE,
  GARDEN_DOCK_OBSTACLES,
  GARDEN_MOLE_OBSTACLES,
  GARDEN_EDGE_STONE_OBSTACLES,
  GARDEN_ISLAND_OBSTACLE,
  GARDEN_ISLET_OBSTACLES,
  GARDEN_PIGEONNIER_OBSTACLE,
  gardenShipWaterMarginTiles,
  isGardenObstacleTile,
  isGardenShipWater,
  isGardenShipWaterSlow,
  nearestGardenShipWater,
} from "./garden-water-exclusion";
import { landWorldTile, zoneWorldTile } from "./map-scale";
import { gardenWaterPlateContainsTile } from "./projection";
import { rimLandAt } from "./garden-rim";
import {
  CEMETERY_CENTER,
  DOCK_TILES,
  EVM_BAY_STATION_SLOTS,
  isWaterTileKind,
  OUTER_HARBOR_STATION_SLOTS,
  PIGEONNIER_HARBOR_DOCK_TILE,
  terrainKindAt,
} from "./world-layout";
import { GARDEN_SEA_EDGE_ISLAND_WATERLINE } from "./garden-sea-edge-sites";

/** `isGardenObstacleTile` for an already-transformed world tile. */
function isObstacleAt(tile: { x: number; y: number }): boolean {
  return isGardenObstacleTile(tile.x, tile.y);
}
function pointAlongBearing(
  tile: { x: number; y: number },
  bearing: number,
  distance: number,
  turn = 0,
): { x: number; y: number } {
  const angle = bearing + turn;
  return {
    x: tile.x + Math.cos(angle) * distance,
    y: tile.y + Math.sin(angle) * distance,
  };
}

function pointAtMoleLocalWorld(
  tile: { x: number; y: number },
  bearing: number,
  alongWorld: number,
  acrossWorld: number,
): { x: number; y: number } {
  const along = alongWorld / Math.SQRT2;
  const across = acrossWorld / Math.SQRT2;
  return {
    x: tile.x + Math.cos(bearing) * along - Math.sin(bearing) * across,
    y: tile.y + Math.sin(bearing) * along + Math.cos(bearing) * across,
  };
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

function shipMargin(ship: { visual: { hull: keyof typeof GARDEN_SILHOUETTE_FOR_HULL; scale?: number } }): number {
  return gardenShipWaterMarginTiles(
    gardenShipVisualScale(ship.visual.scale || 1),
    GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull],
  );
}

describe("garden water exclusion (zones-v2 placement fix)", () => {
  it("matches the exact water predicate across a sampled grid", () => {
    const margins = [0, 1, 3, 5.5];
    for (const margin of margins) {
      for (let y = 0.25; y <= 139; y += 2.75) {
        for (let x = 0.25; x <= 139; x += 2.75) {
          const point = { x, y };
          for (const includeDocks of [false, true]) {
            expect(
              isGardenShipWater(point, margin, includeDocks),
              `(${x},${y}) margin ${margin} docks ${includeDocks}`,
            ).toBe(isGardenShipWaterSlow(point, margin, includeDocks));
          }
        }
      }
    }
  });

  it("keeps the complete hull inside the finite playable sea at rim openings", () => {
    const margin = 3;
    // The north opening has no rim land to provide this clearance, so the map
    // edge itself must reject a berth whose centre is legal but hull is not.
    expect(isGardenShipWater({ x: 70, y: margin - 0.001 }, margin)).toBe(false);
    expect(isGardenShipWater({ x: 70, y: margin }, margin)).toBe(true);
  });

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
    // N2: the wreckyard is open water, not a landmass — the courtesy
    // clearance hugs the RENDERED quiet graveyard: 18 wrecks in four loose
    // groups whose hull extents span x −11.1..+11.5 / y −3.4..+9.7 around
    // the centre, so the ellipse offsets south over that crescent. A live
    // hull never parks among the groups or clips one passing them.
    expect(isObstacleAt(CEMETERY_CENTER)).toBe(true);
    expect(GARDEN_CEMETERY_OBSTACLE.rx).toBe(12.3);
    expect(GARDEN_CEMETERY_OBSTACLE.ry).toBe(8.2);
    expect(GARDEN_CEMETERY_OBSTACLE.y).toBe(CEMETERY_CENTER.y + 2);
    // The east rim group's water stays cleared...
    expect(isObstacleAt({
      x: CEMETERY_CENTER.x + 11,
      y: CEMETERY_CENTER.y,
    })).toBe(true);
    // ...while the water beyond the rendered field's hull extent is open
    // again — the de-sterilised ring the old full-scatter ellipse blocked.
    expect(isObstacleAt({
      x: CEMETERY_CENTER.x + 12.6,
      y: CEMETERY_CENTER.y,
    })).toBe(false);
    // The de-sterilised water: the shoal's empty north half (bare quiet
    // water in the render — no wreck renders there) and the open sea beyond
    // the east rim group are sailable again, where the old full-scatter
    // ellipse blocked them.
    expect(isObstacleAt({ x: CEMETERY_CENTER.x, y: CEMETERY_CENTER.y - 7.5 })).toBe(false);
    expect(isObstacleAt({ x: CEMETERY_CENTER.x + 13.4, y: CEMETERY_CENTER.y })).toBe(false);
    expect(isObstacleAt(landWorldTile({ x: 8, y: 50 }))).toBe(false); // the old islet's water
    // RIM FIELD: the extreme south-west edge is now the land bank enclosing Wreck Shoal.
    expect(isObstacleAt(zoneWorldTile({ x: 0, y: 55 }))).toBe(true);
    // Open sea stays open.
    expect(isObstacleAt(zoneWorldTile({ x: 10, y: 30 }))).toBe(false);
    expect(isObstacleAt(zoneWorldTile({ x: 40, y: 10 }))).toBe(false);
    // RIM FIELD REVISION 1: the asymmetric south bank is sampled at its deeper western shoulder.
    expect(isObstacleAt(zoneWorldTile({ x: 38, y: 55 }))).toBe(true);
    // Wave 2b: renderer-only geography is still physical to navigation.
    expect(GARDEN_EDGE_STONE_OBSTACLES.length).toBeGreaterThan(0);
    for (const edge of GARDEN_EDGE_STONE_OBSTACLES) {
      expect(isObstacleAt(edge), edge.id).toBe(true);
      expect(isGardenShipWater(edge, 1), edge.id).toBe(false);
    }
    expect(GARDEN_ISLAND_OBSTACLE).toEqual(GARDEN_SEA_EDGE_ISLAND_WATERLINE);
  });

  it("keeps dock exclusions mirrored to authored mouths", () => {
    const authoredDockTiles = [...DOCK_TILES, PIGEONNIER_HARBOR_DOCK_TILE];
    const obstacleMouths = [
      GARDEN_MOLE_OBSTACLES[0]!.origin,
      ...GARDEN_DOCK_OBSTACLES.map(({ x, y }) => ({ x, y })),
    ];
    expect(obstacleMouths).toEqual(authoredDockTiles);
    // Ordinary authored mouths remain excluded. The Mole's cove origin is
    // inside its basin, so its obstacle coverage is anchored there without
    // turning the mouth itself into masonry.
    for (const tile of authoredDockTiles.slice(1)) {
      expect(isGardenShipWater(tile, 0, true), `${tile.x}.${tile.y}`).toBe(false);
    }
    expect(isGardenShipWater(authoredDockTiles[0]!, 0, true)).toBe(true);
  });

  it("keeps ordinary station circles scaled to their authored envelopes", () => {
    const largeSlot = OUTER_HARBOR_STATION_SLOTS.find((slot) => slot.type === "fishing-pier")!;
    const smallSlot = OUTER_HARBOR_STATION_SLOTS.find((slot) => slot.type === "reed-boathouse")!;
    const probeDistance = 7.5;
    const largeProbe = pointAlongBearing(
      largeSlot.cove.tile,
      largeSlot.cove.seawardBearing,
      probeDistance,
    );
    // The west/north side avoids the nearby TON pigeonnier while staying the
    // same distance from the reed-boathouse mouth.
    const smallProbe = pointAlongBearing(
      smallSlot.cove.tile,
      smallSlot.cove.seawardBearing,
      probeDistance,
      -Math.PI / 4,
    );

    // The supply-scaled navigation envelopes remain distinct: the fishing
    // pier reaches eight tiles while the reed boathouse reaches seven.
    expect(isGardenShipWater(largeProbe, 0)).toBe(true);
    expect(isGardenShipWater(largeProbe, 0, true)).toBe(false);
    expect(isGardenShipWater(smallProbe, 0)).toBe(true);
    expect(isGardenShipWater(smallProbe, 0, true)).toBe(true);
  });

  it("excludes the Mole masonry while leaving its basin reachable through the entrance", () => {
    const moleSlot = EVM_BAY_STATION_SLOTS[0]!;
    const localPoint = (alongWorld: number, acrossWorld: number) => pointAtMoleLocalWorld(
      moleSlot.cove.tile,
      moleSlot.cove.seawardBearing,
      alongWorld,
      acrossWorld,
    );

    const longArm = localPoint(6, -9.5);
    const shortArm = localPoint(2.5, 9.25);
    const hall = localPoint(-8, 0);
    const apron = localPoint(-18, 0);
    for (const [label, point] of [
      ["long arm", longArm],
      ["short arm", shortArm],
      ["hall", hall],
      ["apron", apron],
    ] as const) {
      expect(isGardenShipWater(point, 0, true), label).toBe(false);
    }

    // Sample a continuous ship-centre route from the 18 × 14 basin to open
    // sea on the authored 12° entrance heading. Membership alone would not
    // catch two arm obstacles accidentally closing the basin.
    const route = Array.from({ length: 73 }, (_, index) => {
      const alongWorld = 6 + index * 0.25;
      const acrossWorld = Math.tan(12 * Math.PI / 180) * (alongWorld - 6);
      return localPoint(alongWorld, acrossWorld);
    });
    for (const [index, point] of route.entries()) {
      expect(isGardenShipWater(point, 1, true), `entrance route sample ${index}`).toBe(true);
    }
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

  it("keeps every rendered fixture hull on water for ten minutes of world clock", { timeout: 20_000 }, () => {
    const worlds = [
      ["canonical-api", buildPharosVilleWorld(makePharosVilleWorldInput())],
      ["dense", denseWorld()],
    ] as const;
    const failures: string[] = [];
    for (const [fixture, world] of worlds) {
      const plan = buildBaseMotionPlan(world);
      const slice = selectGardenObservatorySlice(world, null);
      for (let second = 0; second <= 600; second += 1) {
        const samples = new Map<string, ShipMotionSample>();
        for (const ship of world.ships) {
          samples.set(ship.id, resolveShipMotionSample({
            flagshipSamples: samples,
            plan,
            reducedMotion: false,
            ship,
            timeSeconds: second,
          }));
        }
        const baseTiles = new Map(slice.ships.map((placement) => [
          placement.ship.id,
          resolveGardenShipDisplayTile({ ...placement, sample: samples.get(placement.ship.id) }),
        ]));
        for (const placement of slice.ships) {
          const ship = placement.ship;
          const dependency = ship.dependencyFormation;
          const parentTile = dependency ? baseTiles.get(dependency.parentId) : undefined;
          const tile = dependency && parentTile
            ? resolveGardenDependencyShipDisplayTile({ parentTile, ship })
            : baseTiles.get(ship.id)!;
          const label = `${fixture} t=${second} ${ship.id} at ${tile.x.toFixed(2)},${tile.y.toFixed(2)}`;
          if (!gardenWaterPlateContainsTile(tile, world.map)) failures.push(`${label}: outside plate`);
          else if (rimLandAt(tile.x, tile.y)) failures.push(`${label}: rim land`);
          // Terrain is an authored tile grid; round exactly as the renderer's
          // region/terrain consumers do, which also exercises the memoised
          // grid instead of recomputing the sea partition ~80k times.
          else if (!isWaterTileKind(terrainKindAt(Math.round(tile.x), Math.round(tile.y)))) {
            failures.push(`${label}: terrain land`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
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
    // The cemetery ellipse hugs the quiet graveyard's four loose groups:
    // A* paths route around the wrecks, not through them.
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
      )) || GARDEN_EDGE_STONE_OBSTACLES.some((edge) => (
        Math.hypot(point.x - edge.x, point.y - edge.y) < edge.r - 0.4
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
