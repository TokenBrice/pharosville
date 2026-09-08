import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { GARDEN_EMPTY_INLET, placeGardenFleet, resetGardenFleetPlacementCache } from "./garden-fleet-placement";
import { PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH, terrainKindAt } from "./world-layout";
import { defaultCamera } from "./camera";
import { TILE_SCALE, worldToScreen } from "./projection";
import { isGardenShipWater, gardenShipWaterMarginTiles } from "./garden-water-exclusion";
import {
  GARDEN_SILHOUETTE_FOR_HULL,
  gardenShipVisualScale,
} from "./garden-observatory-slice";
import { resolveShipClass } from "./ship-visuals";
import type { ShipNode, ShipWaterZone } from "./world-types";

const LIGHTHOUSE = { x: 19, y: 28 };

beforeEach(resetGardenFleetPlacementCache);

function ship(id: string, riskZone: ShipWaterZone, scale = 1): ShipNode {
  return {
    detailId: `ship.${id}`,
    id,
    riskZone,
    tile: { x: 28, y: 28 },
    visual: { hull: "treasury-galleon", scale },
  } as unknown as ShipNode;
}

function fleet(riskZone: ShipWaterZone, count: number): ShipNode[] {
  return Array.from({ length: count }, (_, index) => ship(`${riskZone}-${index}`, riskZone));
}

function inletDistance(tile: { x: number; y: number }): number {
  return Math.min(...GARDEN_EMPTY_INLET.polyline.slice(1).map((end, index) => {
    const start = GARDEN_EMPTY_INLET.polyline[index]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const t = Math.max(0, Math.min(1,
      ((tile.x - start.x) * dx + (tile.y - start.y) * dy) / (dx * dx + dy * dy),
    ));
    return Math.hypot(tile.x - start.x - t * dx, tile.y - start.y - t * dy);
  }));
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

  it("moors a crowded band in unequal odd-count anchorages", () => {
    const ships = fleet("calm", 90);
    const placement = placeGardenFleet(ships, LIGHTHOUSE);
    const groups = new Map<string, { x: number; y: number }[]>();
    for (const entry of ships) {
      const mooring = placement.mooringByShipId.get(entry.id)!;
      const tiles = groups.get(mooring.mooringId) ?? [];
      tiles.push(placement.tileByShipId.get(entry.id)!);
      groups.set(mooring.mooringId, tiles);
    }
    expect(groups.size % 2).toBe(1);
    expect(groups.size).toBeGreaterThan(1);
    const sizes = [...groups.values()].map((tiles) => tiles.length);
    expect(Math.max(...sizes)).toBeGreaterThan(Math.min(...sizes) * 2);
    // The dominant harbour remains a spatial cluster, not merely a label.
    const dominant = [...groups.values()].sort((a, b) => b.length - a.length)[0]!;
    const neighbourReach = gardenShipWaterMarginTiles(
      gardenShipVisualScale(1), GARDEN_SILHOUETTE_FOR_HULL["treasury-galleon"],
    ) * 2;
    const clustered = dominant.filter((tile) => dominant.some((other) =>
      other !== tile && Math.hypot(tile.x - other.x, tile.y - other.y) < neighbourReach,
    ));
    // The inlet clips the dominant roadstead; its close-packed heart must
    // still hold at least a third of its berths, with the rest along its lee.
    expect(clustered.length).toBeGreaterThanOrEqual(Math.ceil(dominant.length / 3));
  });

  it("leaves open water big enough to be a composition rather than a gap", () => {
    // Measure emptiness only within the authored inlet, not an unrelated rim gap.
    const ships = fleet("calm", 90);
    const placement = placeGardenFleet(ships, LIGHTHOUSE);
    const tiles = ships.map((entry) => placement.tileByShipId.get(entry.id)!);

    let largestEmptyRadius = 0;
    for (let y = 0; y < 140; y += 1) {
      for (let x = 0; x < 140; x += 1) {
        if (inletDistance({ x, y }) > GARDEN_EMPTY_INLET.halfWidth) continue;
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

  it("spreads anchorages across a crowded band", () => {
    const ships = fleet("watch", 30);
    const placement = placeGardenFleet(ships, LIGHTHOUSE);
    const tiles = ships.map((entry) => placement.tileByShipId.get(entry.id)!);
    const spread = Math.max(...tiles.map((tile) => Math.hypot(
      tile.x - tiles[0]!.x,
      tile.y - tiles[0]!.y,
    )));
    // The old authored ring capped every band inside ~23 tiles of its centre;
    // the watch region spans most of the sea and the fleet should use it.
    expect(spread).toBeGreaterThan(20);
  });

  it("keeps all 320 hulls outside a broad projected empty inlet at both gates", () => {
    const zones: ShipWaterZone[] = ["calm", "watch", "alert", "warning", "danger", "ledger"];
    const ships = Array.from({ length: 320 }, (_, index) => ship(`inlet-${index}`, zones[index % zones.length]!));
    const placement = placeGardenFleet(ships, LIGHTHOUSE);
    expect(placement.tileByShipId.size).toBe(320);
    const tiles = [...placement.tileByShipId.values()];
    for (const tile of tiles) expect(inletDistance(tile)).toBeGreaterThan(GARDEN_EMPTY_INLET.halfWidth);
    const map = { width: PHAROSVILLE_MAP_WIDTH, height: PHAROSVILLE_MAP_HEIGHT };
    for (const viewport of [{ x: 900, y: 720 }, { x: 1200, y: 640 }]) {
      const camera = defaultCamera({ width: viewport.x, height: viewport.y, map });
      const project = (tile: { x: number; y: number }) =>
        worldToScreen({ x: tile.x * TILE_SCALE, y: 0, z: tile.y * TILE_SCALE }, camera, viewport);
      const boundary = GARDEN_EMPTY_INLET.polyline.flatMap((tile) =>
        Array.from({ length: 32 }, (_, index) => project({
          x: tile.x + Math.cos(index * Math.PI / 16) * GARDEN_EMPTY_INLET.halfWidth,
          y: tile.y + Math.sin(index * Math.PI / 16) * GARDEN_EMPTY_INLET.halfWidth,
        })),
      ).filter((point) => point.y >= 0 && point.y <= viewport.y);
      const left = Math.max(0, Math.min(...boundary.map((point) => point.x)));
      const right = Math.min(viewport.x, Math.max(...boundary.map((point) => point.x)));
      expect(right - left).toBeGreaterThanOrEqual(viewport.x * (viewport.x === 1200 ? 0.24 : 0.3));
      const strips = GARDEN_EMPTY_INLET.polyline.slice(1).map((end, index) => {
        const start = GARDEN_EMPTY_INLET.polyline[index]!;
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        const nx = -(end.y - start.y) / length * GARDEN_EMPTY_INLET.halfWidth;
        const ny = (end.x - start.x) / length * GARDEN_EMPTY_INLET.halfWidth;
        return [
          project({ x: start.x + nx, y: start.y + ny }),
          project({ x: end.x + nx, y: end.y + ny }),
          project({ x: end.x - nx, y: end.y - ny }),
          project({ x: start.x - nx, y: start.y - ny }),
        ];
      });
      for (const tile of tiles) {
        const point = project(tile);
        for (const polygon of strips) {
          let inside = false;
          for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const a = polygon[i]!;
            const b = polygon[j]!;
            if ((a.y > point.y) !== (b.y > point.y)
              && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
          }
          expect(inside).toBe(false);
        }
      }
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

    // The forty-two-tile inlet reserves formerly occupied water. A 3.75-tile
    // mean nearest-neighbour floor preserves readable hull separation in the
    // remaining unequal anchorages without pinning the unconstrained solve.
    expect(nearestSum / tiles.length).toBeGreaterThan(3.75);
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
