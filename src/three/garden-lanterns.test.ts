import { describe, expect, it } from "vitest";
import {
  createGardenLaneRegistry,
  MAX_GARDEN_LIGHT_LANES,
  type GardenLightLane,
} from "./garden-lanterns";

function lane(overrides: Partial<GardenLightLane> & { id: string }): GardenLightLane {
  return {
    color: "#f7d68a",
    intensity: 1,
    kind: "lantern",
    worldX: 0,
    worldZ: 0,
    ...overrides,
  };
}

describe("createGardenLaneRegistry", () => {
  it("packs registered lanes into the texture and reports the active count", () => {
    const registry = createGardenLaneRegistry();
    registry.set(lane({ id: "a", worldX: 3, worldZ: -2, intensity: 0.8 }));
    registry.set(lane({ id: "b", worldX: -5, worldZ: 4, intensity: 0.5 }));

    expect(registry.sync("full")).toBe(2);
    expect(registry.activeLaneCount).toBe(2);
    const data = registry.texture.image.data as Float32Array;
    expect(data[0]).toBe(3);
    expect(data[1]).toBe(-2);
    expect(data[2]).toBeCloseTo(0.8);
    registry.dispose();
  });

  it("caps lanes per tier while always keeping the beacon first", () => {
    const registry = createGardenLaneRegistry();
    for (let index = 0; index < 20; index += 1) {
      registry.set(lane({ id: `lantern.${index}`, intensity: index / 20 }));
    }
    registry.set(lane({ id: "beacon", intensity: 0.01, kind: "beacon", worldX: 9 }));

    expect(registry.sync("constrained")).toBe(4);
    const data = registry.texture.image.data as Float32Array;
    expect(data[0]).toBe(9);
    expect(data[3]).toBe(2);

    expect(registry.sync("balanced")).toBe(12);
    expect(registry.sync("full")).toBe(21);
    registry.dispose();
  });

  it("removes and clears lanes", () => {
    const registry = createGardenLaneRegistry();
    registry.set(lane({ id: "a" }));
    registry.set(lane({ id: "b" }));
    registry.remove("a");
    expect(registry.sync("full")).toBe(1);
    registry.clear();
    expect(registry.sync("full")).toBe(0);
    const data = registry.texture.image.data as Float32Array;
    expect(data[MAX_GARDEN_LIGHT_LANES * 4 + 3]).toBe(0);
    registry.dispose();
  });
});
