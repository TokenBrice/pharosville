import { InstancedMesh, ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";
import {
  createGardenSummitBirds,
  GARDEN_BIRD_SORTIE_SHARE,
  GARDEN_HERON_BEAT_REQUEST,
  GARDEN_HERON_PERCH,
  GARDEN_HERON_WINGSPAN,
  GARDEN_SUMMIT_BIRD_COUNT,
  gardenBirdPixelSpan,
  gardenBirdSortie,
  gardenBirdSortieOffset,
} from "./garden-summit-birds";

function heron() {
  const birds = createGardenSummitBirds();
  return {
    birds,
    mesh: birds.root.children[0] as InstancedMesh,
    material: (birds.root.children[0] as InstancedMesh).material as ShaderMaterial,
  };
}

describe("garden bird choreography", () => {
  it("keeps the shared sorties rare, closed and deterministic", () => {
    expect(GARDEN_BIRD_SORTIE_SHARE).toBe(0.18);
    expect(gardenBirdSortie(0.41, 123)).toBe(gardenBirdSortie(0.41, 123));
    for (const progress of [0, 1]) {
      const [x, y, z] = gardenBirdSortieOffset(progress, 0.6, -0.8, 4.2, 5.5);
      expect([x, y, z]).toEqual(expect.arrayContaining([expect.closeTo(0, 8)]));
      expect(Math.hypot(x, y, z)).toBeLessThan(1e-8);
    }
  });
});

describe("garden heron", () => {
  it("replaces the summit micro-flock with one readable bird on the camera-side rock", () => {
    const { birds, mesh } = heron();
    expect(mesh.count).toBe(GARDEN_SUMMIT_BIRD_COUNT);
    expect(GARDEN_SUMMIT_BIRD_COUNT).toBe(1);
    expect(birds.root.position.toArray()).toEqual([
      GARDEN_HERON_PERCH.x,
      GARDEN_HERON_PERCH.y,
      GARDEN_HERON_PERCH.z,
    ]);
    const pixels = gardenBirdPixelSpan(GARDEN_HERON_WINGSPAN, 120);
    expect(pixels).toBeGreaterThanOrEqual(8);
    expect(pixels).toBeLessThanOrEqual(14);
  });

  it("flies only for an admitted environmental beat and is static for reduced motion", () => {
    expect(GARDEN_HERON_BEAT_REQUEST).toMatchObject({
      foreground: false,
      kind: "weather",
      subject: "heron-dusk-flight",
    });
    const { birds, material } = heron();
    birds.update({ reducedMotion: false, timeSeconds: 9, visible: true });
    expect(material.uniforms.uBeat!.value).toBe(0);
    birds.update({
      reducedMotion: false,
      timeSeconds: 9,
      visible: true,
      weatherBeatActive: true,
    });
    expect(material.uniforms.uBeat!.value).toBe(1);
    expect(material.uniforms.uTime!.value).toBe(9);
    birds.update({
      reducedMotion: true,
      timeSeconds: 9,
      visible: true,
      weatherBeatActive: true,
    });
    expect(material.uniforms.uBeat!.value).toBe(0);
    expect(material.uniforms.uTime!.value).toBe(0);
  });
});
