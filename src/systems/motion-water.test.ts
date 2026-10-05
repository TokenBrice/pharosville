import { describe, expect, it } from "vitest";
import { buildCachedShipWaterRoute, nearestMapWaterTile, routeHullMargin, sampleShipWaterPath, sampleShipWaterPathInto, clearShipWaterSegmentHint, waterPathFromPoints } from "./motion-water";
import { GARDEN_ISLAND_OBSTACLE, isGardenShipWater, nearestGardenShipWater } from "./garden-water-exclusion";
import { buildPharosVilleMap } from "./world-layout";
import type { ShipWaterRouteCache } from "./motion-types";

// Build a path with non-uniform segment lengths so the segment index actually
// matters (uniform spacing would mask hint/binary-search disagreements).
function buildTestPath() {
  return waterPathFromPoints(
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 6 },
      { x: 9, y: 10 },
      { x: 20, y: 10 },
      { x: 25, y: 12 },
      { x: 40, y: 18 },
      { x: 60, y: 18 },
      { x: 100, y: 0 },
    ],
  );
}

describe("sampleShipWaterPathInto segment-index hint (F10)", () => {
  it("matches naive sampling for monotonically increasing progress", () => {
    const path = buildTestPath();
    const shipId = "hint-monotonic";
    clearShipWaterSegmentHint(shipId);

    for (let step = 0; step <= 100; step += 1) {
      const progress = step / 100;
      const naive = sampleShipWaterPath(path, progress);
      const hinted = { x: 0, y: 0 };
      const hintedHeading = { x: 0, y: 0 };
      sampleShipWaterPathInto(path, progress, hinted, hintedHeading, shipId);

      expect(hinted.x).toBeCloseTo(naive.point.x, 10);
      expect(hinted.y).toBeCloseTo(naive.point.y, 10);
      expect(hintedHeading.x).toBeCloseTo(naive.heading.x, 10);
      expect(hintedHeading.y).toBeCloseTo(naive.heading.y, 10);
    }
  });

  it("matches naive sampling for non-monotonic progress (forced hint misses)", () => {
    const path = buildTestPath();
    const shipId = "hint-nonmonotonic";
    clearShipWaterSegmentHint(shipId);

    // Deliberately bounce: forward, far back, forward small, jump forward, etc.
    const progressions = [0.05, 0.12, 0.95, 0.02, 0.5, 0.51, 0.49, 0.99, 0.0, 0.33, 0.78, 0.34];
    for (const progress of progressions) {
      const naive = sampleShipWaterPath(path, progress);
      const hinted = { x: 0, y: 0 };
      const hintedHeading = { x: 0, y: 0 };
      sampleShipWaterPathInto(path, progress, hinted, hintedHeading, shipId);

      expect(hinted.x).toBeCloseTo(naive.point.x, 10);
      expect(hinted.y).toBeCloseTo(naive.point.y, 10);
      expect(hintedHeading.x).toBeCloseTo(naive.heading.x, 10);
      expect(hintedHeading.y).toBeCloseTo(naive.heading.y, 10);
    }
  });

  it("matches naive sampling at exact segment boundaries", () => {
    const path = buildTestPath();
    const shipId = "hint-boundary";
    clearShipWaterSegmentHint(shipId);

    for (let i = 0; i < path.cumulativeLengths.length; i += 1) {
      const progress = path.cumulativeLengths[i]! / path.totalLength;
      const naive = sampleShipWaterPath(path, progress);
      const hinted = { x: 0, y: 0 };
      const hintedHeading = { x: 0, y: 0 };
      sampleShipWaterPathInto(path, progress, hinted, hintedHeading, shipId);

      expect(hinted.x).toBeCloseTo(naive.point.x, 10);
      expect(hinted.y).toBeCloseTo(naive.point.y, 10);
    }
  });

  it("clearShipWaterSegmentHint resets cache without affecting correctness", () => {
    const path = buildTestPath();
    const shipId = "hint-clear";

    // Prime the cache at progress 0.9.
    sampleShipWaterPathInto(path, 0.9, { x: 0, y: 0 }, { x: 0, y: 0 }, shipId);
    clearShipWaterSegmentHint(shipId);

    // After clearing, sampling at progress 0.1 should still produce the correct
    // result (binary-search fallback, no stale forward-walk from the old hint).
    const naive = sampleShipWaterPath(path, 0.1);
    const hinted = { x: 0, y: 0 };
    const hintedHeading = { x: 0, y: 0 };
    sampleShipWaterPathInto(path, 0.1, hinted, hintedHeading, shipId);

    expect(hinted.x).toBeCloseTo(naive.point.x, 10);
    expect(hinted.y).toBeCloseTo(naive.point.y, 10);
  });
});

describe("moving-hull water navigation", () => {
  const map = buildPharosVilleMap();
  const from = { x: GARDEN_ISLAND_OBSTACLE.x - GARDEN_ISLAND_OBSTACLE.rx - 12, y: GARDEN_ISLAND_OBSTACLE.y + 6 };
  const to = { x: GARDEN_ISLAND_OBSTACLE.x + GARDEN_ISLAND_OBSTACLE.rx + 12, y: GARDEN_ISLAND_OBSTACLE.y + 6 };
  const input = { from, to, map, zone: "watch" as const, shipId: "hull-clear-voyage", bucket: 0, preferDirect: true, inletCrossing: true };

  for (const margin of [2.25, 4.5]) {
    it(`routes a ${margin}-tile hull where its own clearance is the sailing rule`, () => {
      const route = buildCachedShipWaterRoute({ ...input, hullMarginTiles: margin }, new Map());
      expect(route.points.length).toBeGreaterThan(1);
      expect(route.totalLength).toBeGreaterThan(0);
      // The display layer certifies with the same field: a planned leg must
      // never need a correction larger than its own continuation budget.
      for (let step = 0; step <= 100; step++) {
        const { point } = sampleShipWaterPath(route, step / 100);
        const display = isGardenShipWater(point, margin) ? point : nearestGardenShipWater(point, margin, "hull-clear-voyage");
        expect(Math.hypot(display.x - point.x, display.y - point.y)).toBeLessThanOrEqual(margin + 2.5);
      }
    });
  }

  it("keeps a hull out of channels closed at its own clearance", () => {
    const margin = 2.25;
    const route = buildCachedShipWaterRoute({ ...input, hullMarginTiles: margin }, new Map());
    for (const point of route.points) expect(isGardenShipWater(point, margin), `${point.x},${point.y}`).toBe(true);
  });

  it("still carries a required leg through water narrower than the hull's full clearance", () => {
    const route = buildCachedShipWaterRoute({ ...input, hullMarginTiles: 7.5 }, new Map());
    expect(route.totalLength).toBeGreaterThan(0);
    for (const point of route.points) expect(isGardenShipWater(point, 0), `${point.x},${point.y}`).toBe(true);
  });

  it("shares upward margin classes while separating cached geometry from other hulls and point consumers", () => {
    const cache: ShipWaterRouteCache = new Map();
    const pointRoute = buildCachedShipWaterRoute(input, cache);
    const narrow = buildCachedShipWaterRoute({ ...input, hullMarginTiles: 2.51 }, cache);
    expect(routeHullMargin(2.51)).toBe(2.75);
    expect(buildCachedShipWaterRoute({ ...input, hullMarginTiles: 2.74, bucket: 6 }, cache)).toBe(narrow);
    const wide = buildCachedShipWaterRoute({ ...input, hullMarginTiles: 7.5 }, cache);
    expect(wide).not.toBe(narrow);
    expect(narrow).not.toBe(pointRoute);
    expect(buildCachedShipWaterRoute(input, cache)).toBe(pointRoute);
    expect(buildCachedShipWaterRoute({ ...input, hullMarginTiles: 0 }, cache)).toBe(pointRoute);
    const snapped = nearestMapWaterTile({ x: GARDEN_ISLAND_OBSTACLE.x, y: GARDEN_ISLAND_OBSTACLE.y }, map, 7.5);
    expect(isGardenShipWater(snapped, 7.5)).toBe(true);
  });
});
