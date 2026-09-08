import { InstancedMesh, Matrix4, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  createGardenKoi,
  GARDEN_KOI_COUNT,
  GARDEN_KOI_SWIM_RATE_RANGE,
  sampleGardenKoi,
} from "./garden-koi";
import { GARDEN_POND_CENTER } from "./garden-island";

function positions(mesh: InstancedMesh): Vector3[] {
  const matrix = new Matrix4();
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, matrix);
    return new Vector3().setFromMatrixPosition(matrix);
  });
}

describe("garden koi", () => {
  it("packs four depth-faded fish into one pond-local draw", () => {
    const koi = createGardenKoi();
    expect(koi.mesh).toBeInstanceOf(InstancedMesh);
    expect(koi.mesh.count).toBe(GARDEN_KOI_COUNT);
    expect(koi.mesh.material).toBeInstanceOf(ShaderMaterial);
    expect(koi.mesh.geometry.getAttribute("aFishDepthFade").count).toBe(GARDEN_KOI_COUNT);
    expect(positions(koi.mesh).every((position) => position.y < 0)).toBe(true);
    expect(koi.mesh.matrixWorldAutoUpdate).toBe(true);
  });

  it("sends two fish through the canonical reflection centre on a slow figure-eight", () => {
    for (const index of [0, 1]) {
      const sample = sampleGardenKoi(index, 0);
      expect(sample.x).toBeCloseTo(GARDEN_POND_CENTER.x, 8);
      expect(sample.z).toBeCloseTo(GARDEN_POND_CENTER.z, 8);
    }
    const lobe = sampleGardenKoi(0, Math.PI / (2 * GARDEN_KOI_SWIM_RATE_RANGE[0]));
    expect(lobe.x).toBeGreaterThan(GARDEN_POND_CENTER.x + 2);
    expect(lobe.z).toBeCloseTo(GARDEN_POND_CENTER.z, 8);
    expect(Math.max(...GARDEN_KOI_SWIM_RATE_RANGE)).toBeLessThanOrEqual(0.032);
  });

  it("is deterministic and holds every fish at its composed static pose for reduced motion", () => {
    expect(sampleGardenKoi(2, 91)).toEqual(sampleGardenKoi(2, 91));
    expect(sampleGardenKoi(2, 91)).not.toEqual(sampleGardenKoi(2, 0));
    expect(sampleGardenKoi(2, 91, true)).toEqual(sampleGardenKoi(2, 0, true));
    const koi = createGardenKoi();
    const held = positions(koi.mesh);
    koi.update({ daylight: 1, night: 0, reducedMotion: false, timeSeconds: 91 });
    expect(positions(koi.mesh)).not.toEqual(held);
    koi.update({ daylight: 1, night: 0, reducedMotion: true, timeSeconds: 91 });
    expect(positions(koi.mesh)).toEqual(held);
  });

  it("keeps exactly one vermilion-and-white daylight glint", () => {
    const koi = createGardenKoi();
    expect(Array.from(koi.mesh.geometry.getAttribute("aFishAccent").array)).toEqual([1, 0, 0, 0]);
    koi.update({ daylight: 1, night: 0, reducedMotion: false, timeSeconds: 30 });
    expect(koi.mesh.material.uniforms.uVisibility!.value).toBeGreaterThan(0.9);
    koi.update({ daylight: 0, night: 0, reducedMotion: false, timeSeconds: 30 });
    expect(koi.mesh.material.uniforms.uVisibility!.value).toBe(0);
  });
});
