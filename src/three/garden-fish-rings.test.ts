import { describe, expect, it } from "vitest";
import { GARDEN_EMPTY_INLET, gardenInletDistance } from "../systems/garden-inlet";
import { TILE_SCALE } from "../systems/projection";
import { createGardenFishRings, GARDEN_FISH_RING_SECONDS, gardenFishRiseSite } from "./garden-fish-rings";

describe("X5 fish rings", () => {
  it("rises only on the empty inlet, inside its core", () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const site = gardenFishRiseSite(seed * 97);
      const distance = gardenInletDistance(site.x / TILE_SCALE, site.z / TILE_SCALE);
      expect(distance).toBeLessThanOrEqual(GARDEN_EMPTY_INLET.halfWidth - 4);
    }
  });

  it("pulses exactly one ring per ritual and clears it if cancelled", () => {
    const pulses: string[] = [];
    const removed: string[] = [];
    const rings = createGardenFishRings({
      emitter: { pulseRing: (ring) => pulses.push(ring.id), removeRing: (id) => removed.push(id) },
    });
    rings.ritual.start(1000);
    expect(pulses).toHaveLength(1);
    expect(rings.ritual.update(1003, 1)).toBe(false);
    expect(rings.ritual.update(1000 + GARDEN_FISH_RING_SECONDS, 1)).toBe(true);
    expect(pulses).toHaveLength(1);
    rings.ritual.start(2000);
    rings.ritual.cancel();
    expect(removed).toEqual([pulses[1]]);
  });
});
