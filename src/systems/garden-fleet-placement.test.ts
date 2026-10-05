import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { GARDEN_FLEET_LOBES, placeGardenFleet, resetGardenFleetPlacementCache, type GardenFleetPlacement } from "./garden-fleet-placement";
import { GARDEN_EMPTY_INLET, gardenInletDistance, isGardenInletCoreTile } from "./garden-inlet";
import { LIGHTHOUSE_TILE, PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH, isWaterTileKind, terrainKindAt } from "./world-layout";
import { TILE_SCALE, screenToGround, type ScreenPoint } from "./projection";
import { REST_SEAT_EYE_LANDSCAPE, REST_SEAT_EYE_TALL } from "./rest-seat";
import { isGardenShipWater, gardenShipWaterMarginTiles } from "./garden-water-exclusion";
import {
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_SILHOUETTE_FOR_HULL,
  gardenIslandDisplayTile,
  gardenShipVisualScale,
} from "./garden-observatory-slice";
import { GARDEN_FLEET_FAMILY_ENVELOPES, createGardenFleetFootprint, gardenFleetPolygonOverlap, gardenFleetRestViews, writeGardenFleetFootprint, writeGardenFleetFootprintCrop, type GardenFleetFootprint } from "./garden-fleet-footprint";
import { defaultCamera } from "./camera";
import { stableFnv1aHash } from "./stable-random";
import { buildPharosVilleWorld } from "./pharosville-world";
import {
  denseFixtureChains, denseFixturePegSummary, denseFixtureSafetyGrades,
  denseFixtureStablecoins, denseFixtureStress, fixtureStability, makeSourceStatuses,
} from "../__fixtures__/pharosville-world";
import { denseMixedCapacityInput } from "../__fixtures__/data-contract-scenarios";
import { resolveShipClass } from "./ship-visuals";
import type { ShipHull, ShipNode, ShipWaterZone } from "./world-types";

const LIGHTHOUSE = { x: 19, y: 28 };

beforeEach(resetGardenFleetPlacementCache);

function ship(id: string, riskZone: ShipWaterZone, scale = 1): ShipNode {
  return {
    detailId: `ship.${id}`,
    id,
    riskZone,
    tile: { x: 28, y: 28 },
    marketCapUsd: 1_000_000_000,
    visual: { hull: "treasury-galleon", scale },
  } as unknown as ShipNode;
}

function fleet(riskZone: ShipWaterZone, count: number): ShipNode[] {
  return Array.from({ length: count }, (_, index) => ship(`${riskZone}-${index}`, riskZone));
}

describe("placeGardenFleet", () => {
  it("is deterministic regardless of input order", () => {
    const ships = fleet("watch", 40);
    const first = placeGardenFleet(ships, LIGHTHOUSE).tileByShipId;
    resetGardenFleetPlacementCache();
    const second = placeGardenFleet([...ships].reverse(), LIGHTHOUSE).tileByShipId;
    expect(second.size).toBe(first.size);
    for (const [id, tile] of first) {
      expect(second.get(id)).toEqual(tile);
    }
  });

  it("places each ship inside the painted region its risk band owns", () => {
    // The whole point of W3/F6: display and simulation read the SAME terrain
    // field, so a ship is always drawn in the region it is labelled with.
    const expected: Record<string, string> = {
      calm: "calm-water",
      watch: "watch-water",
      alert: "alert-water",
      warning: "warning-water",
      danger: "storm-water",
      ledger: "ledger-water",
    };
    for (const [zone, terrain] of Object.entries(expected)) {
      const ships = fleet(zone as ShipWaterZone, 12);
      const placement = placeGardenFleet(ships, LIGHTHOUSE);
      for (const entry of ships) {
        const tile = placement.tileByShipId.get(entry.id)!;
        expect(terrainKindAt(Math.round(tile.x), Math.round(tile.y))).toBe(terrain);
      }
    }
  });

  it("keeps hulls off land and off each other at fleet scale", () => {
    const ships = fleet("calm", 90);
    const placement = placeGardenFleet(ships, LIGHTHOUSE);
    const tiles = ships.map((entry) => placement.tileByShipId.get(entry.id)!);

    for (const [index, entry] of ships.entries()) {
      const margin = gardenShipWaterMarginTiles(
        gardenShipVisualScale(entry.visual.scale || 1),
        GARDEN_SILHOUETTE_FOR_HULL[entry.visual.hull],
      );
      expect(isGardenShipWater(tiles[index]!, margin)).toBe(true);
    }

    // Blue-noise, not a pile: no two hulls share a spot.
    const keys = new Set(tiles.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`));
    expect(keys.size).toBe(ships.length);
  });

  it("holds a clear sightline to the lighthouse", () => {
    // W3.2: the composition invariant survives the scale-up as a density
    // field — the monument must never be crowded out.
    const ships = fleet("calm", 120);
    const placement = placeGardenFleet(ships, LIGHTHOUSE);
    for (const entry of ships) {
      const tile = placement.tileByShipId.get(entry.id)!;
      expect(Math.hypot(tile.x - LIGHTHOUSE.x, tile.y - LIGHTHOUSE.y))
        .toBeGreaterThanOrEqual(9);
    }
  });

  it("authors unequal global shoreline masses rather than per-band arithmetic", () => {
    expect(GARDEN_FLEET_LOBES.map((lobe) => lobe.id)).toEqual(["near-left", "rear-left", "right"]);
    expect(GARDEN_FLEET_LOBES[0].weight).toBeGreaterThan(GARDEN_FLEET_LOBES[1].weight * 2);
    expect(new Set(GARDEN_FLEET_LOBES.map((lobe) => lobe.width)).size).toBe(3);
    const ships = [...fleet("calm", 60), ...fleet("ledger", 20), ...fleet("watch", 20), ...fleet("alert", 15)];
    const original = structuredClone(ships);
    const placement = placeGardenFleet(ships, LIGHTHOUSE);
    const bandsByMass = new Map<string, Set<ShipWaterZone>>();
    for (const entry of ships) {
      const mooring = placement.mooringByShipId.get(entry.id)!;
      expect(mooring.riskBand).toBe(entry.riskZone);
      const bands = bandsByMass.get(mooring.mooringId) ?? new Set<ShipWaterZone>();
      bands.add(entry.riskZone);
      bandsByMass.set(mooring.mooringId, bands);
      expect(Number.isFinite(placement.restingHeadingByShipId.get(entry.id))).toBe(true);
    }
    expect([...bandsByMass.values()].some((bands) => bands.size > 1)).toBe(true);
    expect(ships).toEqual(original);
  });

  it("leaves open water big enough to be a composition rather than a gap", () => {
    // Measure emptiness only within the authored inlet, not an unrelated rim gap.
    const ships = fleet("calm", 90);
    const placement = placeGardenFleet(ships, LIGHTHOUSE);
    const tiles = ships.map((entry) => placement.tileByShipId.get(entry.id)!);

    let largestEmptyRadius = 0;
    for (let y = 0; y < 140; y += 1) {
      for (let x = 0; x < 140; x += 1) {
        if (gardenInletDistance(x, y) > GARDEN_EMPTY_INLET.halfWidth) continue;
        if (!terrainKindAt(x, y).endsWith("water")) continue;
        let nearest = Number.POSITIVE_INFINITY;
        for (const tile of tiles) {
          nearest = Math.min(nearest, Math.hypot(x - tile.x, y - tile.y));
        }
        largestEmptyRadius = Math.max(largestEmptyRadius, nearest);
      }
    }
    expect(largestEmptyRadius).toBeGreaterThanOrEqual(9);
  });

  it("keeps every eligible ID when a single narrow band exceeds preferred lobe capacity", () => {
    const ships = fleet("warning", 320);
    const placement = placeGardenFleet(ships, LIGHTHOUSE);
    expect([...placement.tileByShipId.keys()].sort()).toEqual(ships.map((entry) => entry.id).sort());
    expect([...placement.placementPathByShipId.values()]).toContain("capacity-overflow");
    for (const tile of placement.tileByShipId.values()) {
      expect(terrainKindAt(Math.round(tile.x), Math.round(tile.y))).toBe("warning-water");
      expect(gardenInletDistance(tile.x, tile.y)).toBeGreaterThan(GARDEN_EMPTY_INLET.halfWidth);
    }
  });

  it("seats Calm far past its hull-gap capacity without throwing, none of it in the inlet", () => {
    // Calm borders the inlet and holds on the order of 160 hulls at the gap;
    // 260 galleons force the fallback tiers (relaxed gap, region scan).
    const ships = fleet("calm", 260);
    const placement = placeGardenFleet(ships, LIGHTHOUSE);
    expect(placement.tileByShipId.size).toBe(ships.length);
    for (const tile of placement.tileByShipId.values()) {
      expect(terrainKindAt(Math.round(tile.x), Math.round(tile.y))).toBe("calm-water");
      expect(gardenInletDistance(tile.x, tile.y)).toBeGreaterThan(GARDEN_EMPTY_INLET.halfWidth);
    }
  });

  it("keeps all 320 hulls out of the empty inlet, whose core holds the rest seat's sight line to the tower", () => {
    const zones: ShipWaterZone[] = ["calm", "watch", "alert", "warning", "danger", "ledger"];
    const ships = Array.from({ length: 320 }, (_, index) => ship(`inlet-${index}`, zones[index % zones.length]!));
    const placement = placeGardenFleet(ships, LIGHTHOUSE);
    expect(placement.tileByShipId.size).toBe(320);
    for (const tile of placement.tileByShipId.values()) {
      expect(gardenInletDistance(tile.x, tile.y)).toBeGreaterThan(GARDEN_EMPTY_INLET.halfWidth);
    }
    // The ma is the approach water the seated viewer looks across: from both
    // rest eyes, every plate-water tile on the ground line to the tower foot
    // lies in the corridor's impassable core.
    const island = gardenIslandDisplayTile(LIGHTHOUSE_TILE);
    const foot = {
      x: island.x + GARDEN_LIGHTHOUSE_ROOT_OFFSET.x / TILE_SCALE,
      y: island.y + GARDEN_LIGHTHOUSE_ROOT_OFFSET.z / TILE_SCALE,
    };
    for (const eye of [REST_SEAT_EYE_LANDSCAPE, REST_SEAT_EYE_TALL]) {
      let sightWater = 0;
      for (let step = 0; step <= 400; step += 1) {
        const x = eye.tile.x + (foot.x - eye.tile.x) * step / 400;
        const y = eye.tile.y + (foot.y - eye.tile.y) * step / 400;
        if (x < 0 || y < 0 || x > 139 || y > 139) continue;
        if (!isWaterTileKind(terrainKindAt(Math.round(x), Math.round(y)))) continue;
        sightWater += 1;
        expect(isGardenInletCoreTile(x, y), `${eye.tile.x},${eye.tile.y} → (${x.toFixed(1)}, ${y.toFixed(1)})`).toBe(true);
      }
      expect(sightWater).toBeGreaterThan(100);
    }
  });
});

/**
 * 2026-09-07. Routing `chartered-brigantine` onto the previously DEAD `kobaya`
 * silhouette moved 39 of 217 ships to a hull whose x-reach is 6.70 world units
 * against bezaisen's 3.70. The implementing agent flagged, correctly, that
 * every other placement test here runs a synthetic fleet and nothing seated the
 * REAL coin set against the real harbour — so the crowding question had no gate.
 *
 * This asserts NEAREST-NEIGHBOUR SPACING, not berth-circle overlap. Measured
 * when written, the swap took overlapping berth circles 1229 -> 1594 pairs
 * (+30%) while mean nearest-neighbour spacing moved 4.11 -> 4.05 tiles (-1.4%).
 * The ships did not move closer together; only their declared clearance radius
 * grew. `gardenShipWaterMarginTiles` is a LAND-clearance figure — placement
 * never used it for ship-to-ship separation, and rafted hulls are what a
 * harbour looks like — so counting circle overlaps would pin a number that
 * corresponds to nothing a viewer can see.
 */
describe("real-fleet berth spacing", () => {
  const REAL_ZONES: ShipWaterZone[] = ["calm", "watch", "alert", "warning", "danger"];

  const raw = JSON.parse(
    readFileSync("shared/data/stablecoins/coins.generated.json", "utf8"),
  ) as unknown;
  const coins = (
    Array.isArray(raw) ? raw : ((raw as { coins?: unknown[] }).coins ?? [])
  ) as unknown[];
  const ships = coins.map((coin, index) => ({
    detailId: `ship.real.${index}`,
    id: `real-${index}`,
    riskZone: REAL_ZONES[index % REAL_ZONES.length]!,
    tile: { x: 28, y: 28 },
    visual: { hull: resolveShipClass(coin as never).hull, scale: 1 },
  })) as unknown as ShipNode[];

  it("seats every ship in the real coin set and keeps the fleet's spacing", () => {
    // Guards the fixture: an empty or reshaped coin file would otherwise make
    // the spacing assertion below pass vacuously.
    expect(ships.length).toBeGreaterThan(180);

    const placed = placeGardenFleet(ships, LIGHTHOUSE);
    const tiles = ships
      .map((entry) => placed.tileByShipId.get(entry.id))
      .filter((tile): tile is { x: number; y: number } => Boolean(tile));
    expect(tiles.length).toBe(ships.length);

    let nearestSum = 0;
    for (let i = 0; i < tiles.length; i += 1) {
      let nearest = Number.POSITIVE_INFINITY;
      for (let j = 0; j < tiles.length; j += 1) {
        if (i === j) continue;
        nearest = Math.min(
          nearest,
          Math.hypot(tiles[i]!.x - tiles[j]!.x, tiles[i]!.y - tiles[j]!.y),
        );
      }
      nearestSum += nearest;
    }

    // The empty inlet reserves the approach water, and berths
    // now also keep off dock aprons (where a resting hull used to be shoved
    // at draw time, into its neighbours). Every band here overflows its water,
    // so a 3.5-tile mean nearest-neighbour floor preserves readable hull
    // separation without pinning the unconstrained solve.
    expect(nearestSum / tiles.length).toBeGreaterThan(3.5);
  });

  it("keeps every retained real-coin berth within half a tile through four-percent removals and additions", () => {
    const placed = placeGardenFleet(ships, LIGHTHOUSE);

    // Refreshes must not re-berth retained hulls when a few neighbours leave
    // or arrive. Remove across the roster, not just its last sorted entries.
    const churnCount = Math.floor(ships.length * 0.04);
    const removed = new Set(Array.from({ length: churnCount }, (_, index) =>
      ships[Math.floor(index * ships.length / churnCount)]!.id,
    ));
    const retained = ships.filter((entry) => !removed.has(entry.id));
    const afterRemoval = placeGardenFleet(retained, LIGHTHOUSE);
    const arrivals = ships.slice(0, churnCount).map((entry, index) => ({
      ...entry,
      id: `arrival-${index}`,
      detailId: `ship.arrival.${index}`,
    }));
    resetGardenFleetPlacementCache();
    placeGardenFleet(ships, LIGHTHOUSE);
    const afterAddition = placeGardenFleet([...ships, ...arrivals], LIGHTHOUSE);
    for (const [roster, placement] of [
      [retained, afterRemoval],
      [ships, afterAddition],
    ] as const) {
      for (const entry of roster) {
        const before = placed.tileByShipId.get(entry.id)!;
        const after = placement.tileByShipId.get(entry.id)!;
        expect(Math.hypot(after.x - before.x, after.y - before.y), entry.id).toBeLessThan(0.5);
      }
    }
  });
});

function denseWorld() {
  return buildPharosVilleWorld({
    cemeteryEntries: [], chains: denseFixtureChains, freshness: makeSourceStatuses(),
    pegSummary: denseFixturePegSummary, safetyGrades: denseFixtureSafetyGrades,
    stability: fixtureStability, stablecoins: denseFixtureStablecoins, stress: denseFixtureStress,
  });
}

type ProjectedFleet = { id: string; footprint: GardenFleetFootprint }[][];

function projectedFleet(ships: readonly ShipNode[], placement: Pick<GardenFleetPlacement, "tileByShipId"> & Partial<Pick<GardenFleetPlacement, "restingHeadingByShipId">>): ProjectedFleet {
  return gardenFleetRestViews().map((view) => ships.map((entry) => ({
    id: entry.id,
    footprint: writeGardenFleetFootprint(createGardenFleetFootprint(), entry, placement.tileByShipId.get(entry.id)!,
      -(placement.restingHeadingByShipId?.get(entry.id) ?? 0), view.camera, view.viewport),
  })));
}

/** Pairwise conservative envelope area, including off-frame envelopes so the
 * objective cannot improve by pushing IDs beyond the crop. No hit rectangles. */
function worstEyeOverlap(projected: ProjectedFleet): number {
  const scratch = createGardenFleetFootprint();
  return Math.max(...projected.map((eye) => {
    let total = 0;
    let overlap = 0;
    for (let i = 0; i < eye.length; i++) {
      const a = eye[i]!.footprint;
      total += a.hull.area + a.sails.area;
      for (let j = 0; j < i; j++) {
        const b = eye[j]!.footprint;
        overlap += gardenFleetPolygonOverlap(a.hull, b.hull, scratch)
          + gardenFleetPolygonOverlap(a.sails, b.sails, scratch)
          + gardenFleetPolygonOverlap(a.hull, b.sails, scratch)
          + gardenFleetPolygonOverlap(a.sails, b.hull, scratch);
      }
    }
    return overlap / Math.max(1, total);
  }));
}

describe("shared projected anchorage acceptance", () => {
  for (const [name, makeWorld] of [
    ["dense", denseWorld],
    ["mixed-capacity", () => buildPharosVilleWorld(denseMixedCapacityInput())],
  ] as const) {
    it(`${name}: keeps the reserved protected interval empty and three percent wide, and reports the second`, () => {
      const world = makeWorld();
      const placement = placeGardenFleet(world.ships, world.lighthouse.tile);
      expect([...placement.tileByShipId.keys()].sort()).toEqual(world.ships.map((entry) => entry.id).sort());
      const projected = projectedFleet(world.ships, placement);
      const shipsById = new Map(world.ships.map((entry) => [entry.id, entry]));
      for (const [eye, view] of gardenFleetRestViews().entries()) {
        expect(view.camera.rest!.view.eye).toEqual(view.viewport.x >= view.viewport.y ? REST_SEAT_EYE_LANDSCAPE.world : REST_SEAT_EYE_TALL.world);
        // One interval is reserved before the solve and protected by every
        // admission tier; the second is measured from the water the accepted
        // picture left open and reported with its true width, not reserved.
        expect(view.intervals.length).toBeGreaterThanOrEqual(1);
        const [primary, secondary] = view.intervals;
        expect(primary![1] - primary![0], `${name} primary ${view.viewport.x}×${view.viewport.y}`)
          .toBeGreaterThanOrEqual(0.03);
        if (secondary) expect(secondary[1]).toBeGreaterThan(secondary[0]);
        for (const entry of projected[eye]!) for (const polygon of [entry.footprint.hull, entry.footprint.sails]) {
          if (!polygon.clippedArea) continue;
          const intrusion = Math.min(polygon.maxX, primary![1] * view.viewport.x) - Math.max(polygon.minX, primary![0] * view.viewport.x);
          const node = shipsById.get(entry.id)!;
          const tile = placement.tileByShipId.get(entry.id)!;
          let nearest = Infinity;
          for (const [id, other] of placement.tileByShipId) {
            if (id !== entry.id) nearest = Math.min(nearest, Math.hypot(tile.x - other.x, tile.y - other.y));
          }
          const diagnostic = `${name} ${entry.id} ${view.viewport.x}×${view.viewport.y}`
            + ` tile=(${tile.x},${tile.y}) band=${node.riskZone} hull=${node.visual.hull}`
            + ` scale=${node.visual.scale} path=${placement.placementPathByShipId.get(entry.id)} nearest=${nearest.toFixed(3)} tiles`;
          // Gap-relaxed capacity recovery must still try the protected pool;
          // the dense/mixed UTY regression does not receive an interval exception.
          expect(intrusion, diagnostic).toBeLessThanOrEqual(1e-7);
        }
      }
    });

    it(`${name}: loses less than ten percent of each leading identity sail to other vessel envelopes`, () => {
      const world = makeWorld();
      const placement = placeGardenFleet(world.ships, world.lighthouse.tile);
      const leaders = world.ships.toSorted((a, b) => b.marketCapUsd - a.marketCapUsd || a.id.localeCompare(b.id)).slice(0, 3);
      const scratch = createGardenFleetFootprint();
      for (const eye of projectedFleet(world.ships, placement)) for (const leader of leaders) {
        const sail = eye.find((entry) => entry.id === leader.id)!.footprint;
        expect(sail.identitySail.area).toBeGreaterThan(0);
        let loss = 0;
        for (const other of eye) {
          if (other.id === leader.id || other.footprint.viewDepth >= sail.viewDepth) continue;
          loss += gardenFleetPolygonOverlap(sail.identitySail, other.footprint.hull, scratch)
            + gardenFleetPolygonOverlap(sail.identitySail, other.footprint.sails, scratch);
        }
        expect(loss / sail.identitySail.area, leader.id).toBeLessThan(0.1);
      }
    });

    it(`${name}: reduces worst-eye envelope overlap at least twenty-five percent against the frozen pre-cutover allocator`, () => {
      const world = makeWorld();
      const baseline = frozenBaseline(world.ships, world.lighthouse.tile);
      const baselineOverlap = worstEyeOverlap(projectedFleet(world.ships, { tileByShipId: baseline }));
      expect(baselineOverlap).toBeGreaterThan(0);
      const placement = placeGardenFleet(world.ships, world.lighthouse.tile);
      const overlap = worstEyeOverlap(projectedFleet(world.ships, placement));
      expect(overlap).toBeLessThanOrEqual(baselineOverlap * 0.75);
    });
  }
});

describe("renderer-independent family projection", () => {
  it("reuses polygon buffers and accounts for scale, hull form, heading and brace", () => {
    const view = gardenFleetRestViews()[0]!;
    const entry = ship("footprint", "calm", 0.42);
    entry.visual.hullForm = { length: 1, beam: 1, height: 1, waterline: 0 };
    const tile = { x: 45, y: 85 };
    const footprint = createGardenFleetFootprint();
    const points = footprint.identitySail.points;
    writeGardenFleetFootprint(footprint, entry, tile, 0, view.camera, view.viewport, 0.5);
    const smallHeight = footprint.sailHeightCssPx;
    const smallHull = footprint.hull.area;
    entry.visual.scale = 1.15;
    entry.visual.hullForm = { length: 1.12, beam: 1.08, height: 1.1, waterline: 0.08 };
    writeGardenFleetFootprint(footprint, entry, tile, 0.3, view.camera, view.viewport, 0.75);
    expect(footprint.identitySail.points).toBe(points);
    expect(footprint.sailHeightCssPx).toBeGreaterThan(smallHeight * 2);
    expect(footprint.hull.area).toBeGreaterThan(smallHull * 2);
    const braced = [...points];
    writeGardenFleetFootprint(footprint, entry, tile, 0.3, view.camera, view.viewport, -0.75);
    expect([...points]).not.toEqual(braced);
    expect(footprint.identitySail.clippedArea).toBeGreaterThan(0);
    expect(footprint.identitySail.clippedArea).toBeLessThanOrEqual(footprint.identitySail.area + 1e-6);
  });

  it("returns CSS-pixel height, viewport-clipped area and no area behind the near plane", () => {
    const view = gardenFleetRestViews()[0]!;
    const entry = ship("css-footprint", "calm");
    const tile = { x: 45, y: 85 };
    const a = writeGardenFleetFootprint(createGardenFleetFootprint(), entry, tile, 0, view.camera, view.viewport);
    const b = writeGardenFleetFootprint(createGardenFleetFootprint(), entry, tile, 0, view.camera, { x: 3200, y: 2000 });
    expect(b.sailHeightCssPx).toBeCloseTo(a.sailHeightCssPx * 2);
    expect(b.identitySail.area).toBeCloseTo(a.identitySail.area * 4);
    const cropped = writeGardenFleetFootprint(createGardenFleetFootprint(), entry, tile, 0, view.camera, { x: 1, y: 1000 });
    expect(cropped.identitySail.clippedArea).toBeLessThan(cropped.identitySail.area);
    const behind = writeGardenFleetFootprint(createGardenFleetFootprint(), entry, { x: 220, y: 280 }, 0, view.camera, view.viewport);
    expect(behind.viewDepth).toBeLessThan(1);
    expect(behind.hull.clippedArea).toBe(0);
    expect(behind.identitySail.clippedArea).toBe(0);
    expect(behind.sailHeightCssPx).toBe(0);
  });

  it("reuses the landscape projection across gate crops without changing physical envelope metrics", () => {
    const views = gardenFleetRestViews();
    for (const hull of ["treasury-galleon", "chartered-brigantine", "algo-junk"] as const) {
      const entry = ship(`crop-${hull}`, "calm");
      entry.visual.hull = hull;
      const tile = { x: 45, y: 85 };
      const source = writeGardenFleetFootprint(createGardenFleetFootprint(), entry, tile, 0.3, views[0]!.camera, views[0]!.viewport);
      for (const view of views.slice(1, 3)) {
        const direct = writeGardenFleetFootprint(createGardenFleetFootprint(), entry, tile, 0.3, view.camera, view.viewport);
        const cropped = createGardenFleetFootprint();
        writeGardenFleetFootprintCrop(cropped, source, views[0]!.viewport, view.viewport);
        for (const key of ["hull", "identitySail", "sails"] as const) {
          expect(cropped[key].area).toBeCloseTo(direct[key].area, 5);
          expect(cropped[key].clippedArea).toBeCloseTo(direct[key].clippedArea, 5);
          expect(cropped[key].minX).toBeCloseTo(direct[key].minX, 6);
          expect(cropped[key].maxY).toBeCloseTo(direct[key].maxY, 6);
        }
        expect(cropped.sailHeightCssPx).toBeCloseTo(direct.sailHeightCssPx, 6);
        expect(cropped.viewDepth).toBeCloseTo(direct.viewDepth, 6);
      }
    }
  });

  it("covers every hull class and all six families without merging identity into the hull", () => {
    const view = gardenFleetRestViews()[0]!;
    const families = Object.keys(GARDEN_SILHOUETTE_FOR_HULL) as ShipHull[];
    expect(Object.keys(GARDEN_FLEET_FAMILY_ENVELOPES).sort())
      .toEqual([...new Set(Object.values(GARDEN_SILHOUETTE_FOR_HULL))].sort());
    for (const hull of families) {
      const entry = ship(`family-${hull}`, "calm");
      entry.visual.hull = hull;
      expect(placeGardenFleet([entry], LIGHTHOUSE).tileByShipId.size, hull).toBe(1);
      const footprint = writeGardenFleetFootprint(createGardenFleetFootprint(), entry, { x: 45, y: 85 }, 0.2, view.camera, view.viewport);
      expect(footprint.hull).not.toBe(footprint.identitySail);
      expect(footprint.hull.area).toBeGreaterThan(0);
      expect(footprint.identitySail.area).toBeGreaterThan(0);
      expect(footprint.sails.area).toBeGreaterThanOrEqual(footprint.identitySail.area - 1e-7);
      expect(footprint.sailHeightCssPx).toBeGreaterThan(0);
      for (const polygon of [footprint.hull, footprint.identitySail, footprint.sails]) {
        expect(polygon.count).toBeLessThanOrEqual(polygon.points.length / 2);
        expect(polygon.clippedArea).toBeLessThanOrEqual(polygon.area + 1e-7);
      }
    }
  });

  it("clips a hull crossing the near plane before perspective division", () => {
    const view = gardenFleetRestViews()[0]!;
    const tile = { x: 45, y: 85 };
    const x = tile.x * TILE_SCALE;
    const z = tile.y * TILE_SCALE;
    const camera = { ...view.camera, rest: { presence: 1, view: {
      eye: { x: x + 2, y: -0.5, z }, target: { x: x - 10, y: -0.5, z }, vFovDeg: 32,
    } } };
    const footprint = writeGardenFleetFootprint(createGardenFleetFootprint(), ship("near-clip", "calm"), tile, 0, camera, view.viewport);
    expect(Number.isFinite(footprint.hull.area)).toBe(true);
    expect(footprint.hull.clippedArea).toBeGreaterThan(0);
    expect(footprint.hull.clippedArea).toBeLessThanOrEqual(view.viewport.x * view.viewport.y + 1e-6);
  });

  it("uses convex physical polygons rather than picking rectangles for overlap", () => {
    const view = gardenFleetRestViews()[0]!;
    const entry = ship("overlap", "calm");
    const a = writeGardenFleetFootprint(createGardenFleetFootprint(), entry, { x: 45, y: 85 }, 0, view.camera, view.viewport);
    const b = writeGardenFleetFootprint(createGardenFleetFootprint(), entry, { x: 46, y: 85 }, 0, view.camera, view.viewport);
    const scratch = createGardenFleetFootprint();
    expect(gardenFleetPolygonOverlap(a.identitySail, a.identitySail, scratch)).toBeCloseTo(a.identitySail.area);
    expect(gardenFleetPolygonOverlap(a.identitySail, b.identitySail, scratch)).toBeCloseTo(gardenFleetPolygonOverlap(b.identitySail, a.identitySail, scratch));
    const remote = writeGardenFleetFootprint(createGardenFleetFootprint(), entry, { x: 100, y: 25 }, 0, view.camera, view.viewport);
    expect(gardenFleetPolygonOverlap(a.identitySail, remote.identitySail, scratch)).toBe(0);
  });
});

/** Frozen cold allocator from a881eb17 (S6 verified current state). This pure
 * test reference retains 1/3/5/7 seeds, disc fills and legal overflow unchanged;
 * it is deliberately not a production fallback or a runtime placement mode. */
function frozenBaseline(ships: readonly ShipNode[], lighthouse: ScreenPoint): Map<string, ScreenPoint> {
  const MIN_HULL_GAP = 1.35;
  const unit = (value: string): number => stableFnv1aHash(value) / 0xffffffff;
  const terrain = { calm: "calm-water", watch: "watch-water", alert: "alert-water", warning: "warning-water", danger: "storm-water", ledger: "ledger-water" } as const;
  const viewport = { x: 1600, y: 1000 };
  const camera = defaultCamera({ height: viewport.y, width: viewport.x, map: { height: PHAROSVILLE_MAP_HEIGHT, width: PHAROSVILLE_MAP_WIDTH } });
  const chrome = [{ x: 1420, y: 880 }, { x: 1600, y: 880 }, { x: 1600, y: 1000 }, { x: 1420, y: 1000 }]
    .map((point) => screenToGround(point, camera, viewport, -1.07));
  const chromeDistance = (x: number, y: number): number => {
    let inside = false;
    let nearest = Infinity;
    for (let i = 0, j = chrome.length - 1; i < chrome.length; j = i++) {
      const a = chrome[i]!; const b = chrome[j]!;
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
      const dx = b.x - a.x; const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
      nearest = Math.min(nearest, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
    }
    return inside ? 0 : nearest;
  };
  const density = (tile: ScreenPoint): number => {
    if (gardenInletDistance(tile.x, tile.y) <= GARDEN_EMPTY_INLET.halfWidth || chromeDistance(tile.x, tile.y) <= 0
      || Math.hypot(tile.x - lighthouse.x, tile.y - lighthouse.y) < 9) return 0;
    const edge = Math.min(tile.x, tile.y, PHAROSVILLE_MAP_WIDTH - 1 - tile.x, PHAROSVILLE_MAP_HEIGHT - 1 - tile.y);
    return edge <= 0 ? 0 : Math.min(1, edge / 6);
  };
  const legal = (tile: ScreenPoint, margin: number): boolean => gardenInletDistance(tile.x, tile.y) > GARDEN_EMPTY_INLET.halfWidth + margin
    && chromeDistance(tile.x, tile.y) > margin && isGardenShipWater(tile, margin, true);
  const marginFor = (entry: ShipNode): number => gardenShipWaterMarginTiles(gardenShipVisualScale(entry.visual.scale || 1), GARDEN_SILHOUETTE_FOR_HULL[entry.visual.hull]);
  const tiles = new Map<string, ScreenPoint[]>();
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y++) for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x++) {
    const kind = terrainKindAt(x, y);
    const pool = tiles.get(kind) ?? [];
    pool.push({ x, y }); tiles.set(kind, pool);
  }
  const byZone = new Map<ShipWaterZone, ShipNode[]>();
  for (const entry of ships) { const group = byZone.get(entry.riskZone) ?? []; group.push(entry); byZone.set(entry.riskZone, group); }
  const placed: { tile: ScreenPoint; margin: number }[] = [];
  const result = new Map<string, ScreenPoint>();
  for (const [zone, group] of [...byZone].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = group.toSorted((a, b) => marginFor(b) - marginFor(a) || a.id.localeCompare(b.id));
    const pool = tiles.get(terrain[zone]) ?? [];
    const count = group.length <= 4 ? 1 : group.length <= 12 ? 3 : group.length <= 32 ? 5 : 7;
    const weights = Array.from({ length: count }, (_, i) => (count - i) ** 1.6);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const gap = ordered.reduce((sum, entry) => sum + marginFor(entry), 0) / ordered.length * MIN_HULL_GAP;
    const radiusFor = (berths: number): number => Math.max(gap * 1.1, Math.sqrt(berths * gap * gap * 1.575 / Math.PI));
    const anchorages: { x: number; y: number; index: number; radius: number; berths: number }[] = [];
    let assigned = 0;
    let orphaned = 0;
    for (let index = 0; index < count; index++) {
      const berths = Math.max(0, index === count - 1 ? group.length - assigned : Math.max(1, Math.round(group.length * weights[index]! / total)));
      assigned += berths;
      if (!berths) continue;
      const radius = radiusFor(berths);
      let seeded: ScreenPoint | null = null;
      for (const relaxation of [1, 0.72, 0.5]) {
        let score = -1;
        for (let attempt = 0; attempt < 96; attempt++) {
          const pick = pool[Math.floor(unit(`${zone}.anchor.${index}.${attempt}`) * pool.length)];
          if (!pick || density(pick) <= 0 || !isGardenShipWater(pick, 2)) continue;
          let nearest = Infinity;
          let clears = true;
          for (const other of anchorages) {
            const distance = Math.hypot(pick.x - other.x, pick.y - other.y);
            nearest = Math.min(nearest, distance);
            if (distance < (radius + other.radius) * 1.25 * relaxation) clears = false;
          }
          if (!clears) continue;
          const candidateScore = (nearest === Infinity ? 64 : nearest) * density(pick);
          if (candidateScore > score) { score = candidateScore; seeded = pick; }
        }
        if (seeded) break;
      }
      if (seeded) anchorages.push({ ...seeded, index, radius, berths });
      else orphaned += berths;
    }
    if (anchorages.length && orphaned) { anchorages[0]!.berths += orphaned; anchorages[0]!.radius = radiusFor(anchorages[0]!.berths); }
    for (const entry of ordered) {
      const margin = marginFor(entry);
      const totalBerths = anchorages.reduce((sum, anchorage) => sum + anchorage.berths, 0);
      let remaining = unit(`${zone}.${entry.id}.mooring`) * totalBerths;
      let anchorage = anchorages.at(-1);
      for (const candidate of anchorages) { if (remaining < candidate.berths) { anchorage = candidate; break; } remaining -= candidate.berths; }
      let berth: ScreenPoint | null = null;
      let relaxed: ScreenPoint | null = null;
      let relaxedScore = -Infinity;
      const clearance = (tile: ScreenPoint): readonly [number, number] => {
        let nearest = Infinity; let separation = Infinity;
        for (const other of placed) {
          const distance = Math.hypot(tile.x - other.tile.x, tile.y - other.tile.y);
          nearest = Math.min(nearest, distance); separation = Math.min(separation, distance / Math.max(margin, other.margin));
        }
        return [nearest, separation];
      };
      for (const pass of anchorage ? ["anchorage", "region"] : ["region"]) {
        let rank = Infinity;
        for (let attempt = 0; attempt < 256; attempt++) {
          const pick = pool[Math.floor(unit(`${entry.id}.place.${attempt}`) * pool.length)];
          const angle = unit(`${entry.id}.theta.${attempt}`) * Math.PI * 2;
          const radius = anchorage ? anchorage.radius * unit(`${entry.id}.rad.${attempt}`) ** 0.68 : 0;
          const tile = pass === "anchorage" && anchorage
            ? { x: anchorage.x + Math.cos(angle) * radius + unit(`${entry.id}.jx.${attempt}`) - 0.5,
              y: anchorage.y + Math.sin(angle) * radius + unit(`${entry.id}.jy.${attempt}`) - 0.5 }
            : pick ? { x: pick.x + unit(`${entry.id}.jx.${attempt}`) - 0.5, y: pick.y + unit(`${entry.id}.jy.${attempt}`) - 0.5 } : null;
          if (!tile || density(tile) <= 0 || terrainKindAt(Math.round(tile.x), Math.round(tile.y)) !== terrain[zone] || !legal(tile, margin)) continue;
          const [nearest, separation] = clearance(tile);
          if (nearest * density(tile) > relaxedScore) { relaxedScore = nearest * density(tile); relaxed = tile; }
          if (separation < MIN_HULL_GAP) continue;
          const candidateRank = pass === "anchorage" && anchorage ? Math.hypot(tile.x - anchorage.x, tile.y - anchorage.y) : -nearest;
          if (candidateRank < rank) { rank = candidateRank; berth = tile; }
        }
        if (berth) break;
      }
      if (!berth) {
        let scanNearest = -1;
        for (const tile of pool) {
          if (density(tile) <= 0 || !legal(tile, margin)) continue;
          const [nearest, separation] = clearance(tile);
          if (separation >= MIN_HULL_GAP && nearest > scanNearest) { berth = tile; scanNearest = nearest; }
          if (nearest > relaxedScore) { relaxed = tile; relaxedScore = nearest; }
        }
      }
      if (!berth && !relaxed) {
        let navigable: ScreenPoint | null = null; let score = -Infinity;
        let previous: ScreenPoint | null = null; let previousNearest = -Infinity;
        for (const tile of pool) {
          if (!isGardenShipWater(tile, 0)) continue;
          const [nearest] = clearance(tile);
          const inlet = gardenInletDistance(tile.x, tile.y);
          if (density(tile) > 0 && inlet > GARDEN_EMPTY_INLET.halfWidth + margin && isGardenShipWater(tile, margin) && nearest > previousNearest) { previous = tile; previousNearest = nearest; }
          const candidateScore = inlet > GARDEN_EMPTY_INLET.halfWidth ? PHAROSVILLE_MAP_WIDTH + PHAROSVILLE_MAP_HEIGHT + Math.min(nearest, PHAROSVILLE_MAP_WIDTH) : inlet;
          if (candidateScore > score) { score = candidateScore; navigable = tile; }
        }
        berth = previous ?? navigable ?? entry.tile;
      }
      const resolved = berth ?? relaxed!;
      result.set(entry.id, resolved);
      placed.push({ tile: resolved, margin });
    }
  }
  return result;
}
