import { describe, expect, it } from "vitest";
import { placeGardenFleet } from "./garden-fleet-placement";
import { terrainKindAt } from "./world-layout";
import { isGardenShipWater, gardenShipWaterMarginTiles } from "./garden-water-exclusion";
import { gardenShipVisualScale } from "./garden-observatory-slice";
import type { ShipNode, ShipWaterZone } from "./world-types";

const LIGHTHOUSE = { x: 19, y: 28 };

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

describe("placeGardenFleet", () => {
  it("is deterministic regardless of input order", () => {
    const ships = fleet("watch", 40);
    const first = placeGardenFleet(ships, LIGHTHOUSE).tileByShipId;
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
      const margin = gardenShipWaterMarginTiles(gardenShipVisualScale(entry.visual.scale || 1));
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

  it("moors in clusters instead of carpeting the band", () => {
    // The property blue noise is DESIGNED to destroy, asserted directly.
    //
    // Single-linkage grouping at 6 tiles is the clearest discriminator, because
    // it measures the thing the eye actually reads: are there HARBOURS, or is
    // every hull its own island? Measured on the anchorage field, 90 ships form
    // 38 groups sized 22, 11, 8, 6, 4, 3, 3, 3 — a hierarchy. The blue-noise
    // field it replaced formed 85 groups whose largest held 3, which is another
    // way of saying it formed none.
    //
    // Note that nearest-neighbour STATISTICS are a poor test here and a
    // Clark-Evans index is nearly useless: the hull gap (4.03 tiles) is almost
    // exactly the spacing a uniform random scatter of this fleet would produce
    // anyway, so no legal arrangement can score as "clustered" by that measure.
    // Structure is the thing to assert, not average spacing.
    const ships = fleet("calm", 90);
    const placement = placeGardenFleet(ships, LIGHTHOUSE);
    const tiles = ships.map((entry) => placement.tileByShipId.get(entry.id)!);

    const parent = tiles.map((_, index) => index);
    const find = (index: number): number =>
      (parent[index] === index ? index : (parent[index] = find(parent[index]!)));
    for (let left = 0; left < tiles.length; left += 1) {
      for (let right = left + 1; right < tiles.length; right += 1) {
        const gap = Math.hypot(tiles[left]!.x - tiles[right]!.x, tiles[left]!.y - tiles[right]!.y);
        if (gap < 6) parent[find(left)] = find(right);
      }
    }
    const sizes = new Map<number, number>();
    for (let index = 0; index < tiles.length; index += 1) {
      const root = find(index);
      sizes.set(root, (sizes.get(root) ?? 0) + 1);
    }
    const largest = Math.max(...sizes.values());

    expect(largest).toBeGreaterThanOrEqual(10);
    expect(sizes.size).toBeLessThan(tiles.length * 0.75);
  });

  it("leaves open water big enough to be a composition rather than a gap", () => {
    // *Ma*: the emptiness has to be large enough to read as deliberate. This
    // measures the biggest circle you could draw inside the band's own water
    // without touching a hull — the thing a uniform scatter cannot produce,
    // because leaving no gaps is precisely its purpose.
    const ships = fleet("calm", 90);
    const placement = placeGardenFleet(ships, LIGHTHOUSE);
    const tiles = ships.map((entry) => placement.tileByShipId.get(entry.id)!);

    let largestEmptyRadius = 0;
    for (let y = 0; y < 140; y += 1) {
      for (let x = 0; x < 140; x += 1) {
        if (terrainKindAt(x, y) !== "calm-water") continue;
        let nearest = Number.POSITIVE_INFINITY;
        for (const tile of tiles) {
          nearest = Math.min(nearest, Math.hypot(x - tile.x, y - tile.y));
        }
        largestEmptyRadius = Math.max(largestEmptyRadius, nearest);
      }
    }
    // RIM FIELD FIX 1: the rim-only mask measures 9.38 tiles with the unchanged nine-tile lighthouse clearance.
    expect(largestEmptyRadius).toBeGreaterThan(9);
  });

  it("spreads a crowded band instead of clustering it", () => {
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
});
