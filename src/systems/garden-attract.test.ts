import { describe, expect, it } from "vitest";
import { GARDEN_ATTRACT_IDLE_MS, gardenAttractKeyframes } from "./garden-attract";

describe("garden attract postcards", () => {
  it("waits two minutes and returns four deterministic restrained framings", () => {
    expect(GARDEN_ATTRACT_IDLE_MS).toBe(120_000);
    const first = gardenAttractKeyframes({ x: 18, y: 28 }, { width: 112, height: 112 });
    expect(first).toEqual(gardenAttractKeyframes({ x: 18, y: 28 }, { width: 112, height: 112 }));
    expect(first).toHaveLength(4);
    expect(first.map((frame) => frame.beatIndex)).toEqual([0, 1, 2, 3]);
    expect(first.every((frame) => frame.zoom >= 0.8 && frame.zoom <= 1.2)).toBe(true);
  });
});
