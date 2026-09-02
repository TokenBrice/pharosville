import { InstancedMesh, Matrix4, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  createGardenKoi,
  GARDEN_ENGAWA_KOI_TILE,
  GARDEN_ENGAWA_KOI_WORLD,
  GARDEN_KOI_COUNT,
  GARDEN_KOI_DISPLACEMENT,
  sampleGardenKoi,
} from "./garden-koi";
import { SEA_REGION_ID, seaRegionAtTile } from "../systems/garden-sea-regions";
import { rimShoreDistance } from "../systems/garden-rim";

function positions(mesh: InstancedMesh): Vector3[] {
  const matrix = new Matrix4();
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, matrix);
    return new Vector3().setFromMatrixPosition(matrix);
  });
}

describe("garden koi", () => {
  it("packs four depth-faded fish into one instanced draw", () => {
    const koi = createGardenKoi();
    expect(koi.mesh).toBeInstanceOf(InstancedMesh);
    expect(koi.mesh.count).toBe(GARDEN_KOI_COUNT);
    expect(koi.mesh.material).toBeInstanceOf(ShaderMaterial);
    expect(koi.mesh.geometry.getAttribute("aFishDepthFade").count).toBe(GARDEN_KOI_COUNT);
    expect(positions(koi.mesh).every((position) => position.y < 0)).toBe(true);
    expect(koi.mesh.matrixWorldAutoUpdate).toBe(false);
    expect(new Vector3().setFromMatrixPosition(koi.mesh.matrixWorld)).toEqual(
      new Vector3(GARDEN_ENGAWA_KOI_WORLD.x, GARDEN_ENGAWA_KOI_WORLD.y, GARDEN_ENGAWA_KOI_WORLD.z),
    );
    expect(seaRegionAtTile(GARDEN_ENGAWA_KOI_TILE.x, GARDEN_ENGAWA_KOI_TILE.y))
      .toBe(SEA_REGION_ID.calm);
    expect(rimShoreDistance(GARDEN_ENGAWA_KOI_TILE.x, GARDEN_ENGAWA_KOI_TILE.y))
      .toBeGreaterThan(1);
    expect(GARDEN_KOI_DISPLACEMENT).toContain("reflection-basin");
  });

  it("spends shu vermilion-and-white on exactly one fish", () => {
    const koi = createGardenKoi();
    const accent = koi.mesh.geometry.getAttribute("aFishAccent");
    expect(Array.from(accent.array)).toEqual([1, 0, 0, 0]);
    expect(koi.mesh.geometry.getAttribute("aWhiteMark")).toBeDefined();
  });

  it("wanders deterministically and holds the composed station under reduced motion", () => {
    expect(sampleGardenKoi(2, 91)).toEqual(sampleGardenKoi(2, 91));
    expect(sampleGardenKoi(2, 91)).not.toEqual(sampleGardenKoi(2, 0));
    expect(sampleGardenKoi(2, 91, true)).toEqual(sampleGardenKoi(2, 0, true));

    const koi = createGardenKoi();
    const held = positions(koi.mesh);
    koi.update({ night: 0, reducedMotion: false, timeSeconds: 91 });
    expect(positions(koi.mesh)).not.toEqual(held);
    koi.update({ night: 0, reducedMotion: true, timeSeconds: 91 });
    expect(positions(koi.mesh)).toEqual(held);
  });

  it("fades completely away at night", () => {
    const koi = createGardenKoi();
    koi.update({ night: 0, reducedMotion: false, timeSeconds: 30 });
    expect(koi.mesh.material.uniforms.uVisibility!.value).toBeGreaterThan(0.6);
    koi.update({ night: 1, reducedMotion: false, timeSeconds: 30 });
    expect(koi.mesh.material.uniforms.uVisibility!.value).toBe(0);
  });
});
