import { describe, expect, it } from "vitest";
import { GARDEN_ATTRACT_IDLE_MS, gardenAttractKeyframes } from "./garden-attract";
import { gardenWaterPlateContainsTile, isoToTile } from "./projection";
import {
  LIGHTHOUSE_TILE,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
} from "./world-layout";

describe("garden attract postcards", () => {
  it("waits two minutes and returns four deterministic sailed-in postcards", () => {
    expect(GARDEN_ATTRACT_IDLE_MS).toBe(120_000);
    const first = gardenAttractKeyframes(LIGHTHOUSE_TILE);
    expect(first).toEqual(gardenAttractKeyframes(LIGHTHOUSE_TILE));
    expect(first).toHaveLength(4);
    expect(first.map((frame) => frame.beatIndex)).toEqual([0, 1, 2, 3]);
    // Warm-village A1 (2026-09-05): rest is the sailed-in 1.0, so the idle
    // postcards are close-ups of named precincts in the 1.0-1.4 band (was
    // 0.68-0.84, wider than the old rest), and every centre tile is carried
    // by the plate.
    expect(first.every((frame) => frame.zoom >= 1 && frame.zoom <= 1.4)).toBe(true);
    for (const frame of first) {
      const tile = isoToTile({ x: frame.isoX, y: frame.isoY });
      expect(gardenWaterPlateContainsTile(tile, {
        width: PHAROSVILLE_MAP_WIDTH,
        height: PHAROSVILLE_MAP_HEIGHT,
      })).toBe(true);
    }
  });
});
