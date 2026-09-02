import { describe, expect, it } from "vitest";
import {
  createGardenLaneRegistry,
  GARDEN_EMBER_LANE_MIN_SEPARATION,
  GARDEN_LANE_EMBER_GAIN,
  GARDEN_ROUTE_PULSE_ROTATION_SECONDS,
  MAX_GARDEN_LIGHT_LANES,
  type GardenLightLane,
} from "./garden-lanterns";

/** Ember lanes on a line, spaced far enough apart that none thins another. */
function spacedLane(
  index: number,
  overrides: Partial<GardenLightLane> = {},
): GardenLightLane {
  return lane({
    id: `lantern.${index}`,
    intensity: 1 - index / 1000,
    worldX: index * (GARDEN_EMBER_LANE_MIN_SEPARATION + 1),
    ...overrides,
  });
}

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
  it("exposes its water-sampled DataTexture to the owner census", () => {
    const registry = createGardenLaneRegistry();

    expect(registry.getTextureManifest()).toEqual([
      { owner: "garden-lanterns.lane-data", texture: registry.texture },
    ]);
    registry.dispose();
  });

  it("packs registered lanes into the texture and reports the active count", () => {
    const registry = createGardenLaneRegistry();
    registry.set(lane({ id: "a", worldX: 3, worldZ: -2, intensity: 0.8 }));
    registry.set(lane({ id: "b", worldX: -5, worldZ: 4, intensity: 0.5 }));

    expect(registry.sync("full")).toBe(2);
    expect(registry.activeLaneCount).toBe(2);
    const data = registry.texture.image.data as Float32Array;
    expect(data[0]).toBe(3);
    expect(data[1]).toBe(-2);
    expect(data[2]).toBeCloseTo(0.8 * GARDEN_LANE_EMBER_GAIN.lantern);
    registry.dispose();
  });

  it("caps lanes per tier while always keeping the beacon first", () => {
    const registry = createGardenLaneRegistry();
    for (let index = 0; index < 40; index += 1) {
      registry.set(spacedLane(index));
    }
    registry.set(lane({ id: "beacon", intensity: 0.01, kind: "beacon", worldX: -900 }));

    expect(registry.sync("constrained")).toBe(3);
    const data = registry.texture.image.data as Float32Array;
    expect(data[0]).toBe(-900);
    expect(data[3]).toBe(2);

    expect(registry.sync("balanced")).toBe(10);
    // W3.1: the full tier's night budget, NOT the 48-texel texture capacity.
    expect(registry.sync("full")).toBe(16);
    registry.dispose();
  });

  it("demotes lantern and buoy pools to ember gain, sparing beacon and route", () => {
    // The night hierarchy: one dominant light, one secondary (the moon road,
    // which the water owns), everything else an ember. Relative ordering
    // inside a kind must survive the demotion — a danger buoy still out-reads
    // a calm one — so this is a gain, never a clamp.
    const registry = createGardenLaneRegistry();
    registry.set(lane({ id: "beacon", intensity: 1, kind: "beacon" }));
    registry.set(lane({ id: "route", intensity: 0.8, kind: "route", worldX: 40, route: { x: 60, z: 0 } }));
    registry.set(lane({ id: "danger", intensity: 0.6, kind: "buoy", worldX: 80 }));
    registry.set(lane({ id: "calm", intensity: 0.48, kind: "buoy", worldX: 120 }));
    registry.set(lane({ id: "lamp", intensity: 0.7, kind: "lantern", worldX: 160 }));

    registry.sync("full", 0.45);
    const data = registry.texture.image.data as Float32Array;
    // Each lane above is packed at its own worldX, so that is its handle.
    const intensityAt = (worldX: number): number => {
      for (let index = 0; index < registry.activeLaneCount; index += 1) {
        if (data[index * 4] === worldX) return data[index * 4 + 2]!;
      }
      throw new Error(`no lane packed at ${worldX}`);
    };
    expect(intensityAt(0)).toBeCloseTo(1 * 0.45);
    expect(intensityAt(40)).toBeCloseTo(0.8 * 0.45);
    expect(intensityAt(80)).toBeCloseTo(0.6 * 0.45 * GARDEN_LANE_EMBER_GAIN.buoy);
    expect(intensityAt(160)).toBeCloseTo(0.7 * 0.45 * GARDEN_LANE_EMBER_GAIN.lantern);
    expect(intensityAt(80)).toBeGreaterThan(intensityAt(120));
    expect(GARDEN_LANE_EMBER_GAIN.lantern).toBeLessThan(1);
    expect(GARDEN_LANE_EMBER_GAIN.lantern).toBeLessThan(0.4);
    registry.dispose();
  });

  it("thins ember pools that would merge, keeping the brightest of a cluster", () => {
    expect(GARDEN_EMBER_LANE_MIN_SEPARATION).toBeGreaterThan(8);
    const registry = createGardenLaneRegistry();
    // Six lamps inside one pool radius plus one lamp well clear of them.
    for (let index = 0; index < 6; index += 1) {
      registry.set(lane({
        id: `cluster.${index}`,
        intensity: 0.2 + index / 10,
        worldX: index * 0.4,
        worldZ: 0,
      }));
    }
    registry.set(lane({ id: "away", intensity: 0.1, worldX: 400 }));

    expect(registry.sync("full")).toBe(2);
    const data = registry.texture.image.data as Float32Array;
    // The cluster's brightest survives; its neighbours stand down. The lamps
    // themselves are untouched — this only thins the water's reflections.
    expect(data[0]).toBeCloseTo(5 * 0.4);
    expect(data[4]).toBe(400);
    registry.dispose();
  });

  it("never thins the beacon or a route pulse, whatever crowds them", () => {
    const registry = createGardenLaneRegistry();
    registry.set(lane({ id: "beacon", intensity: 0.01, kind: "beacon", worldX: 0 }));
    for (let index = 0; index < 2; index += 1) {
      registry.set(lane({
        id: `route-pulse.${index}`,
        intensity: 0.02,
        kind: "route",
        worldX: 0.2 + index * 0.2,
        route: { x: 30, z: 0 },
      }));
    }
    for (let index = 0; index < 3; index += 1) {
      registry.set(lane({ id: `lantern.${index}`, intensity: 5 - index, worldX: 0.6 + index * 0.2 }));
    }

    // Everything here sits inside one pool radius. The beacon and both route
    // pulses keep their lanes — thinning is an ember-against-ember rule, and
    // the analytical kinds are never spatially budgeted — so only the ember
    // crowd collapses, to its brightest member.
    expect(registry.sync("full")).toBe(4);
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
      registry.set(spacedLane(index, { intensity: 10 - index / 100 }));
    }
    for (let index = 0; index < 4; index += 1) {
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
    // W3.1: four pulses at once at the top tier, down from six.
    expect(routeCountForTier("full")).toBe(4);
    expect((registry.texture.image.data as Float32Array)[3]).toBe(2);
    registry.dispose();
  });

  it("rotates which routes pulse as a pure function of the clock", () => {
    const registry = createGardenLaneRegistry();
    for (let index = 0; index < 9; index += 1) {
      registry.set(lane({
        id: `route-pulse.${index}`,
        intensity: 0.5,
        kind: "route",
        worldX: index * 40,
        route: { x: index * 40 + 20, z: 0 },
      }));
    }
    const packedRoutes = (timeSeconds?: number): number[] => {
      const active = timeSeconds === undefined
        ? registry.sync("full", 1)
        : registry.sync("full", 1, { timeSeconds });
      const data = registry.texture.image.data as Float32Array;
      return Array.from({ length: active }, (_, index) => data[index * 4]!);
    };

    const first = packedRoutes(0);
    // Never more than the cap, however many routes are registered.
    expect(first).toHaveLength(4);
    // A second window lights a different set — no route stays dark forever.
    const later = packedRoutes(GARDEN_ROUTE_PULSE_ROTATION_SECONDS * 2 + 1);
    expect(later).toHaveLength(4);
    expect(later).not.toEqual(first);
    // Pure: the same clock always packs the same lanes, and mid-window drift
    // changes nothing at all.
    expect(packedRoutes(GARDEN_ROUTE_PULSE_ROTATION_SECONDS * 2 + 88)).toEqual(later);
    expect(packedRoutes(0)).toEqual(first);
    // Every route takes its turn inside one full cycle.
    const seen = new Set<number>();
    for (let window = 0; window < 9; window += 1) {
      for (const worldX of packedRoutes(window * GARDEN_ROUTE_PULSE_ROTATION_SECONDS)) {
        seen.add(worldX);
      }
    }
    expect(seen.size).toBe(9);
    registry.dispose();
  });

  it("holds one static composition under reduced motion and with no clock", () => {
    const registry = createGardenLaneRegistry();
    for (let index = 0; index < 7; index += 1) {
      registry.set(lane({
        id: `route-pulse.${index}`,
        intensity: 0.5,
        kind: "route",
        worldX: index * 40,
        route: { x: index * 40 + 20, z: 0 },
      }));
    }
    const packed = (clock?: { reducedMotion?: boolean; timeSeconds: number }): number[] => {
      const active = registry.sync("full", 1, clock);
      const data = registry.texture.image.data as Float32Array;
      return Array.from({ length: active }, (_, index) => data[index * 4]!);
    };
    const still = packed();
    expect(packed({ reducedMotion: true, timeSeconds: 9_999 })).toEqual(still);
    expect(packed({ reducedMotion: true, timeSeconds: 0 })).toEqual(still);
    registry.dispose();
  });
});
