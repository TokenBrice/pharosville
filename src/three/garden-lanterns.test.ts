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

  it("packs route lanes with seeded pulse params and an endpoint-aware field bound", () => {
    const registry = createGardenLaneRegistry();
    registry.set(lane({
      id: "route-pulse.dock.ethereum",
      intensity: 0.8,
      kind: "route",
      worldX: 100,
      worldZ: 0,
      route: { x: 10, z: 0 },
    }));

    expect(registry.sync("full")).toBe(1);
    const data = registry.texture.image.data as Float32Array;
    // Header row: kind code 3 marks the segment in the shader.
    expect(data[3]).toBe(3);
    // Route row: endpoint plus deterministic, non-degenerate pulse params.
    const routeRow = MAX_GARDEN_LIGHT_LANES * 2 * 4;
    expect(data[routeRow]).toBe(10);
    expect(data[routeRow + 1]).toBe(0);
    expect(data[routeRow + 2]).toBeGreaterThanOrEqual(0.05);
    expect(data[routeRow + 2]).toBeLessThanOrEqual(0.14);
    expect(data[routeRow + 3]).toBeGreaterThanOrEqual(0);
    expect(data[routeRow + 3]).toBeLessThanOrEqual(1);
    // Re-packs are byte-identical — the seed never rolls twice.
    registry.set(lane({
      id: "route-pulse.dock.ethereum",
      intensity: 0.9,
      kind: "route",
      worldX: 100,
      worldZ: 0,
      route: { x: 10, z: 0 },
    }));
    registry.sync("full");
    expect(data[routeRow + 2]).toBeGreaterThanOrEqual(0.05);
    // The field bound reaches the far endpoint, not just the anchor:
    // centroid at the anchor, reach out to (10, 0), plus the 30-unit cull.
    const bounds = registry.fieldBounds();
    expect(bounds.radius).toBeCloseTo(90 + 30, 5);
    registry.dispose();
  });

  it("gives distinct route ids distinct pulse schedules", () => {
    const registry = createGardenLaneRegistry();
    registry.set(lane({ id: "route-pulse.a", kind: "route", worldX: 0, worldZ: 0, route: { x: 1, z: 0 } }));
    registry.set(lane({ id: "route-pulse.b", kind: "route", worldX: 5, worldZ: 0, route: { x: 6, z: 0 } }));
    registry.sync("full");
    const data = registry.texture.image.data as Float32Array;
    const routeRow = MAX_GARDEN_LIGHT_LANES * 2 * 4;
    const speedA = data[routeRow + 2]!;
    const phaseA = data[routeRow + 3]!;
    const speedB = data[routeRow + 4 + 2]!;
    const phaseB = data[routeRow + 4 + 3]!;
    expect(Math.abs(speedA - speedB) + Math.abs(phaseA - phaseB)).toBeGreaterThan(0);
    registry.dispose();
  });

  it("reserves analytical route capacity at every quality tier", () => {
    const registry = createGardenLaneRegistry();
    registry.set(lane({ id: "beacon", intensity: 0.01, kind: "beacon" }));
    for (let index = 0; index < 30; index += 1) {
      registry.set(lane({ id: `lantern.${index}`, intensity: 10 - index / 100 }));
    }
    for (let index = 0; index < 6; index += 1) {
      registry.set(lane({
        id: `route-pulse.${index}`,
        intensity: 0.001 + index / 10_000,
        kind: "route",
        route: { x: index + 1, z: 0 },
      }));
    }

    const routeCountForTier = (
      tier: Parameters<typeof registry.sync>[0],
    ): number => {
      const active = registry.sync(tier);
      const data = registry.texture.image.data as Float32Array;
      return Array.from({ length: active }, (_, index) => data[index * 4 + 3])
        .filter((kind) => kind === 3)
        .length;
    };

    expect(routeCountForTier("constrained")).toBe(1);
    expect(routeCountForTier("recovery")).toBe(2);
    expect(routeCountForTier("balanced")).toBe(3);
    expect(routeCountForTier("interaction")).toBe(3);
    expect(routeCountForTier("full")).toBe(6);
    expect((registry.texture.image.data as Float32Array)[3]).toBe(2);
    registry.dispose();
  });
});
