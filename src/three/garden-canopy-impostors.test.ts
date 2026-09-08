import { InstancedMesh, MeshStandardMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  canopyImpostorPlacements,
  createGardenCanopyImpostors,
  GARDEN_CANOPY_IMPOSTOR_MAX_COUNT,
  GARDEN_CANOPY_IMPOSTOR_NAME,
} from "./garden-canopy-impostors";
import { TILE_SCALE } from "./garden-util";

const point = (x: number, z: number, y = 2) => new Vector3(x * TILE_SCALE, y, z * TILE_SCALE);

describe("canopyImpostorPlacements", () => {
  it("deterministically clusters up to four trees within six tiles at their centroid", () => {
    const trees = [
      point(0, 0),
      point(2, 0),
      point(4, 0),
      point(5, 1),
      point(20, 20),
      point(22, 20),
    ];
    const forward = canopyImpostorPlacements(trees);
    const reversed = canopyImpostorPlacements([...trees].reverse());

    expect(forward).toEqual(reversed);
    expect(forward).toHaveLength(2);
    expect(forward[0]!.position.toArray()).toEqual([
      2.75 * TILE_SCALE,
      2,
      0.25 * TILE_SCALE,
    ]);
    expect(forward[1]!.position.toArray()).toEqual([21 * TILE_SCALE, 2, 20 * TILE_SCALE]);
  });

  it("never exceeds the fixed 120-instance draw budget", () => {
    const isolatedTrees = Array.from({ length: 600 }, (_, index) => point(index * 7, 0));
    const placements = canopyImpostorPlacements(isolatedTrees);
    expect(placements).toHaveLength(GARDEN_CANOPY_IMPOSTOR_MAX_COUNT);
    expect(placements.length).toBeLessThanOrEqual(120);
  });
});

describe("createGardenCanopyImpostors", () => {
  it("builds one opaque flattened dome batch", () => {
    const mesh = createGardenCanopyImpostors([
      point(0, 0),
      point(2, 0),
      point(4, 0),
      point(5, 1),
      point(20, 20),
    ]);

    expect(mesh).toBeInstanceOf(InstancedMesh);
    expect(mesh.name).toBe(GARDEN_CANOPY_IMPOSTOR_NAME);
    expect(mesh.count).toBe(2);
    expect((mesh.material as MeshStandardMaterial).transparent).toBe(false);
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});
