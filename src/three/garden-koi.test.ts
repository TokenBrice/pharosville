import { InstancedMesh, Matrix4, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  createGardenKoi,
  GARDEN_KOI_COUNT,
  GARDEN_KOI_SWIM_RATE_RANGE,
  sampleGardenKoi,
} from "./garden-koi";
import { GARDEN_POND_RADIUS } from "./garden-island";

// The basin skin is a circle of GARDEN_POND_RADIUS squashed to 0.68 across z.
const POND_HALF_X = GARDEN_POND_RADIUS;
const POND_HALF_Z = GARDEN_POND_RADIUS * 0.68;
// Nose-to-fork, the koi body spans 0.76 local units either side of its origin.
const KOI_HALF_LENGTH = 0.76;

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

  it("sends two fish through the basin-local reflection centre on a slow figure-eight", () => {
    for (const index of [0, 1]) {
      const sample = sampleGardenKoi(index, 0);
      expect(sample.x).toBeCloseTo(0, 8);
      expect(sample.z).toBeCloseTo(0, 8);
    }
    const lobe = sampleGardenKoi(0, Math.PI / (2 * GARDEN_KOI_SWIM_RATE_RANGE[0]));
    expect(lobe.x).toBeGreaterThan(2);
    expect(lobe.z).toBeCloseTo(0, 8);
    expect(Math.max(...GARDEN_KOI_SWIM_RATE_RANGE)).toBeLessThanOrEqual(0.032);
  });

  it("keeps every whole fish inside the pond skin through a full swim cycle", () => {
    const period = (2 * Math.PI) / GARDEN_KOI_SWIM_RATE_RANGE[0];
    for (let index = 0; index < GARDEN_KOI_COUNT; index += 1) {
      for (let step = 0; step <= 96; step += 1) {
        const sample = sampleGardenKoi(index, (period * step) / 96);
        const reach = KOI_HALF_LENGTH * sample.scale;
        const extent = ((Math.abs(sample.x) + reach) / POND_HALF_X) ** 2
          + ((Math.abs(sample.z) + reach) / POND_HALF_Z) ** 2;
        expect(extent, `koi ${index} step ${step}`).toBeLessThan(1);
      }
    }
    const koi = createGardenKoi();
    for (const position of positions(koi.mesh)) {
      expect((position.x / POND_HALF_X) ** 2 + (position.z / POND_HALF_Z) ** 2).toBeLessThan(1);
    }
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
