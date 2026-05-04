import { describe, expect, it } from "vitest";
import { sampleShipWaterPath, sampleShipWaterPathInto, clearShipWaterSegmentHint, waterPathFromPoints } from "./motion-water";

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
