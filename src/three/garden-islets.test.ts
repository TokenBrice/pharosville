import { InstancedMesh, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import type { GardenRippleRingEmitter } from "./garden-water-contract";
import { countDrawableObjects, TILE_SCALE } from "./garden-util";
import { createGardenIslets, GARDEN_ISLETS } from "./garden-islets";

function instancePosition(mesh: InstancedMesh, index: number): Vector3 {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new Vector3().setFromMatrixPosition(matrix);
}

describe("garden islets (Z5)", () => {
  it("batches every stone into two instanced draw calls", () => {
    const islets = createGardenIslets();
    expect(islets.root.name).toBe("garden-islets");
    expect(islets.drawCallCount).toBe(2);
    expect(countDrawableObjects(islets.root)).toBe(2);
    const [crag, reef] = islets.root.children as InstancedMesh[];
    expect(crag).toBeInstanceOf(InstancedMesh);
    expect(reef).toBeInstanceOf(InstancedMesh);
    // Sakuteiki odd groupings: crane 3 + lone 1 crag, turtle 5 + lone 2 reef.
    expect(crag!.count).toBe(4);
    expect(reef!.count).toBe(7);
    expect(islets.stoneCount).toBe(11);
    // 80-tri displaced icosahedra × 11 instances — same per-stone budget as
    // the island shoreline boulders.
    expect(islets.triangleCount).toBe(880);
    islets.dispose();
  });

  it("places the crane group at tile (28,8) with the dominant stone tallest", () => {
    const islets = createGardenIslets();
    const crag = islets.root.children[0] as InstancedMesh;
    const dominant = instancePosition(crag, 0);
    expect(dominant.x).toBeCloseTo(28 * TILE_SCALE, 3);
    expect(dominant.z).toBeCloseTo(8 * TILE_SCALE, 3);
    expect(dominant.y).toBeLessThan(0); // base sunk below the waterline
    islets.dispose();
  });

  it("keeps every stone centered at or below the waterline", () => {
    const islets = createGardenIslets();
    for (const batch of islets.root.children as InstancedMesh[]) {
      for (let index = 0; index < batch.count; index += 1) {
        // Instance positions are stone centers; reef backs break the surface
        // while their centers stay at or under the water plane.
        expect(instancePosition(batch, index).y).toBeLessThanOrEqual(GARDEN_WATER_Y);
      }
    }
    islets.dispose();
  });

  it("paints a wet-dark → pale-crown height gradient from palette colors", () => {
    const islets = createGardenIslets();
    const crag = islets.root.children[0] as InstancedMesh;
    const colors = crag.geometry.getAttribute("color");
    const positions = crag.geometry.getAttribute("position");
    expect(colors).toBeDefined();
    // Find the lowest and highest vertices and compare luminance.
    let low = Infinity;
    let high = -Infinity;
    let lowLum = 0;
    let highLum = 0;
    for (let index = 0; index < positions.count; index += 1) {
      const y = positions.getY(index);
      const lum = colors.getX(index) * 0.299 + colors.getY(index) * 0.587 + colors.getZ(index) * 0.114;
      if (y < low) { low = y; lowLum = lum; }
      if (y > high) { high = y; highLum = lum; }
    }
    expect(highLum).toBeGreaterThan(lowLum);
    islets.dispose();
  });

  it("registers one ripple ring per islet via the C2(d) emitter", () => {
    const rings: Array<{ id: string; center: { x: number; z: number }; radius: number }> = [];
    const removed: string[] = [];
    const emitter: GardenRippleRingEmitter = {
      ringCount: () => rings.length,
      removeRing: (id) => { removed.push(id); },
      setRing: (ring) => { rings.push(ring); },
    };
    const islets = createGardenIslets();
    islets.registerRippleRings(emitter);
    expect(rings.map((ring) => ring.id)).toEqual(GARDEN_ISLETS.map((islet) => islet.id));
    for (const [index, ring] of rings.entries()) {
      expect(ring.center.x).toBeCloseTo(GARDEN_ISLETS[index]!.center.x, 3);
      expect(ring.center.z).toBeCloseTo(GARDEN_ISLETS[index]!.center.z, 3);
      expect(ring.radius).toBeGreaterThan(0);
    }
    islets.removeRippleRings(emitter);
    expect(removed).toEqual(GARDEN_ISLETS.map((islet) => islet.id));
    islets.dispose();
  });

  it("no-ops ripple registration until the emitter is wired", () => {
    const islets = createGardenIslets();
    expect(() => {
      islets.registerRippleRings(undefined);
      islets.registerRippleRings(null);
      islets.removeRippleRings(undefined);
    }).not.toThrow();
    islets.dispose();
  });

  it("joins the tier ladder at balanced+", () => {
    const islets = createGardenIslets();
    for (const tier of ["full", "balanced"] as const) {
      islets.update({ reducedMotion: false, tier });
      expect(islets.root.visible).toBe(true);
    }
    for (const tier of ["recovery", "constrained"] as const) {
      islets.update({ reducedMotion: false, tier });
      expect(islets.root.visible).toBe(false);
    }
    // Static under reduced motion: visibility is a tier decision only.
    islets.update({ reducedMotion: true, tier: "full" });
    expect(islets.root.visible).toBe(true);
    islets.dispose();
  });

  it("is deterministic across creations", () => {
    const first = createGardenIslets();
    const second = createGardenIslets();
    const firstCrag = first.root.children[0] as InstancedMesh;
    const secondCrag = second.root.children[0] as InstancedMesh;
    expect(Array.from(firstCrag.instanceMatrix.array)).toEqual(
      Array.from(secondCrag.instanceMatrix.array),
    );
    first.dispose();
    second.dispose();
  });
});
