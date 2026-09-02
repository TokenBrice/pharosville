import { InstancedMesh, Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  createGardenRimMesh,
  GARDEN_ENGAWA_LANTERN_WORLD,
} from "./garden-rim-mesh";
import { countDrawableObjects } from "./garden-util";

describe("garden rim mesh", () => {
  it("builds the authored ring in five batched opaque draws", () => {
    const rim = createGardenRimMesh();
    expect(rim.root.name).toBe("garden-rim");
    expect(rim.drawCallCount).toBe(5);
    expect(rim.drawCallCount).toBeLessThanOrEqual(12);
    expect(countDrawableObjects(rim.root)).toBe(5);
    expect(rim.root.getObjectByName("garden-rim-land")).toBeInstanceOf(Mesh);
    expect(rim.root.getObjectByName("garden-rim-tide-rock")).toBeInstanceOf(Mesh);
    expect(rim.root.getObjectByName("garden-rim-path")).toBeInstanceOf(Mesh);
    expect(rim.root.getObjectByName("garden-rim-pines")).toBeInstanceOf(InstancedMesh);
    expect(rim.root.getObjectByName("garden-rim-stones")).toBeInstanceOf(InstancedMesh);
    expect(rim.pineCount).toBeGreaterThan(20);
    expect(rim.engawaPineCount).toBe(1);
    expect(rim.steppingStoneCount).toBe(3);
    expect(rim.stoneCount).toBe(12);
    expect(GARDEN_ENGAWA_LANTERN_WORLD.x).toBeGreaterThan(0);
    expect(GARDEN_ENGAWA_LANTERN_WORLD.z).toBeGreaterThan(GARDEN_ENGAWA_LANTERN_WORLD.x);
    expect(rim.pathSegmentCount).toBeGreaterThan(80);
    expect(rim.triangleCount).toBeLessThan(80_000);
    rim.dispose();
  });

  it("marks every rim batch as a static shadow user and disposes once", () => {
    const rim = createGardenRimMesh();
    const disposals: Array<ReturnType<typeof vi.spyOn>> = [];
    for (const child of rim.root.children as Array<Mesh | InstancedMesh>) {
      expect(child.castShadow).toBe(true);
      expect(child.receiveShadow).toBe(true);
      disposals.push(
        vi.spyOn(child.geometry, "dispose"),
        vi.spyOn(child.material as MeshStandardMaterial, "dispose"),
      );
    }
    rim.dispose();
    rim.dispose();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });
});
