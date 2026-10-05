import { InstancedMesh, Matrix4, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  createGardenKoi,
  GARDEN_KOI_COUNT,
  GARDEN_KOI_TRAVEL_SECONDS_RANGE,
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

  it("composes distinct near-bank itineraries rather than synchronized mirror loops", () => {
    const poses = Array.from({ length: GARDEN_KOI_COUNT }, (_, index) => sampleGardenKoi(index, 0));
    expect(new Set(poses.map(({ x, z }) => `${x},${z}`)).size).toBe(GARDEN_KOI_COUNT);
    expect(GARDEN_KOI_TRAVEL_SECONDS_RANGE).toEqual([24, 42]);
    for (let index = 0; index < GARDEN_KOI_COUNT; index += 1) {
      for (let time = 0; time < 1800; time += 3) {
        const sample = sampleGardenKoi(index, time);
        expect(sample.x).toBeGreaterThanOrEqual(-1.5);
        expect(sample.x).toBeLessThanOrEqual(2);
        expect(sample.z).toBeGreaterThanOrEqual(-0.35);
        expect(sample.z).toBeLessThanOrEqual(0.95);
      }
    }
  });

  it("has genuine stationary pauses and bounded in-place turns on the canonical clock", () => {
    for (let index = 0; index < GARDEN_KOI_COUNT; index += 1) {
      const seen = new Set<string>();
      for (let time = 0; time < 600; time += 0.25) {
        const pose = sampleGardenKoi(index, time);
        const next = sampleGardenKoi(index, time + 0.1);
        seen.add(pose.state);
        expect(Math.hypot(next.x - pose.x, next.z - pose.z)).toBeLessThan(0.025);
        const yawChange = Math.atan2(Math.sin(next.heading - pose.heading), Math.cos(next.heading - pose.heading));
        expect(Math.abs(yawChange)).toBeLessThan(0.16);
        if (pose.state === "pause" && next.state === "pause") expect(next).toEqual(pose);
        if (pose.state === "turn" && next.state === "turn") {
          expect(next.x).toBe(pose.x);
          expect(next.z).toBe(pose.z);
          expect(Math.abs(yawChange)).toBeGreaterThan(0);
        }
      }
      expect([...seen].sort()).toEqual(["pause", "travel", "turn"]);
    }
  });

  it("writes into one reusable sample without frame-history dependence or catch-up", () => {
    const target = sampleGardenKoi(0, 0);
    expect(sampleGardenKoi(0, 1200, false, target)).toBe(target);
    expect(target).toEqual(sampleGardenKoi(0, 1200));
    sampleGardenKoi(0, 3, false, target);
    expect(sampleGardenKoi(0, 1200, false, target)).toEqual(sampleGardenKoi(0, 1200));
    expect(sampleGardenKoi(0, Number.NaN)).toEqual(sampleGardenKoi(0, 0));
  });

  it("keeps every whole fish inside the pond skin across long bounded itineraries", () => {
    for (let index = 0; index < GARDEN_KOI_COUNT; index += 1) {
      for (let step = 0; step <= 600; step += 1) {
        const sample = sampleGardenKoi(index, step * 3);
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
    const heldMatrices = Array.from(koi.mesh.instanceMatrix.array);
    koi.update({ daylight: 1, night: 0, reducedMotion: false, timeSeconds: 91 });
    expect(positions(koi.mesh)).not.toEqual(held);
    koi.update({ daylight: 1, night: 0, reducedMotion: true, timeSeconds: 91 });
    expect(positions(koi.mesh)).toEqual(held);
    expect(Array.from(koi.mesh.instanceMatrix.array)).toEqual(heldMatrices);
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
