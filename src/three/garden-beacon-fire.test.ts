import { Color, DataTexture, InstancedMesh, Mesh, PlaneGeometry, Points, RGBAFormat, ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";
import { lampStatusModulationForMix } from "../systems/lamp-status";
import { HARBOR_PALETTE } from "../systems/palette";
import {
  GARDEN_BEACON_FLAME_CORE_LUMINANCE,
  GARDEN_BEACON_SMOKE_QUAD_SIZE,
  createGardenBeaconFire,
} from "./garden-beacon-fire";
import { GARDEN_BLOOM_PRACTICAL_THRESHOLD } from "./garden-post";
import { createGardenSummitBirds } from "./garden-summit-birds";

function mockNoiseTexture(): DataTexture {
  return new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, RGBAFormat);
}

describe("garden beacon fire (W4)", () => {
  it("mounts the flame, embers, smoke, and mirror with their contract names", () => {
    const fire = createGardenBeaconFire(mockNoiseTexture());
    expect(fire.root.getObjectByName("lighthouse-flame")).toBeInstanceOf(Mesh);
    expect(fire.root.getObjectByName("lighthouse-embers")).toBeInstanceOf(Points);
    expect(fire.root.getObjectByName("lighthouse-smoke")).toBeDefined();
    expect(fire.root.getObjectByName("lighthouse-mirror")).toBeInstanceOf(Mesh);
    fire.dispose();
  });

  it("makes the daymark 1.6x larger and one stop darker", () => {
    const fire = createGardenBeaconFire(mockNoiseTexture());
    const smoke = fire.root.getObjectByName("lighthouse-smoke") as InstancedMesh;
    const material = smoke.material as ShaderMaterial;
    const geometry = smoke.geometry as PlaneGeometry;
    expect(geometry.parameters.width).toBeCloseTo(GARDEN_BEACON_SMOKE_QUAD_SIZE, 6);
    expect(GARDEN_BEACON_SMOKE_QUAD_SIZE).toBeCloseTo(1.6 * 1.6, 6);
    const originalLight = new Color(HARBOR_PALETTE.fog_pale);
    const originalDark = new Color(HARBOR_PALETTE.fog_blue);
    expect(material.uniforms.uDayLight.value.r).toBeCloseTo(originalLight.r * 0.5, 6);
    expect(material.uniforms.uDayDark.value.b).toBeCloseTo(originalDark.b * 0.5, 6);
    expect(smoke.count).toBe(16);
    fire.dispose();
  });

  it("reserves selective bloom for the raised night flame core", () => {
    const fire = createGardenBeaconFire(mockNoiseTexture());
    const flame = fire.root.getObjectByName("lighthouse-flame") as Mesh;
    const material = flame.material as ShaderMaterial;
    expect(material.uniforms.uBloomFloor.value)
      .toBe(GARDEN_BEACON_FLAME_CORE_LUMINANCE);
    expect(GARDEN_BEACON_FLAME_CORE_LUMINANCE)
      .toBeGreaterThan(GARDEN_BLOOM_PRACTICAL_THRESHOLD);
    fire.dispose();
  });

  it("sheds embers and smoke per scheduler tier without reallocating", () => {
    const fire = createGardenBeaconFire(mockNoiseTexture());
    const embers = fire.root.getObjectByName("lighthouse-embers") as Points;
    const smoke = fire.root.getObjectByName("lighthouse-smoke") as {
      count: number;
      visible: boolean;
    };

    fire.setTier("full");
    expect(embers.visible).toBe(true);
    expect(embers.geometry.drawRange.count).toBe(32);
    expect(smoke.visible).toBe(true);
    expect(smoke.count).toBe(16);

    fire.setTier("balanced");
    expect(embers.geometry.drawRange.count).toBe(12);
    expect(smoke.count).toBe(8);

    for (const tier of ["interaction", "recovery", "constrained"] as const) {
      fire.setTier(tier);
      expect(embers.visible).toBe(false);
      expect(smoke.visible).toBe(false);
    }
    fire.dispose();
  });

  it("computes a deterministic flicker and freezes time under reduced motion", () => {
    const fire = createGardenBeaconFire(mockNoiseTexture());
    const first = fire.update({ psiStress: 0.4, reducedMotion: false, timeSeconds: 12.5 });
    const second = fire.update({ psiStress: 0.4, reducedMotion: false, timeSeconds: 12.5 });
    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(1);

    fire.update({ psiStress: 0.4, reducedMotion: true, timeSeconds: 99 });
    expect(fire.uniforms.uTime.value).toBe(0);
    // t=0 is a composed pose, not a zero: the flicker still has a value.
    expect(fire.uniforms.uFlicker.value).toBeGreaterThan(0);
    fire.dispose();
  });

  it("widens the flicker amplitude with PSI stress (D5)", () => {
    const fire = createGardenBeaconFire(mockNoiseTexture());
    const calm = fire.update({ psiStress: 0, reducedMotion: false, timeSeconds: 3.7 });
    const stressed = fire.update({ psiStress: 1, reducedMotion: false, timeSeconds: 3.7 });
    expect(stressed).not.toBe(calm);
    fire.dispose();
  });

  it("keeps PSI flame bands while applying cool and dim status modulation", () => {
    const fire = createGardenBeaconFire(mockNoiseTexture());
    fire.update({
      lampModulation: lampStatusModulationForMix(1),
      psiStress: 0.4,
      reducedMotion: false,
      timeSeconds: 12,
    });
    expect(fire.uniforms.uStatusCool.value).toBeGreaterThan(0);
    expect(fire.uniforms.uStatusIntensity.value).toBeLessThan(1);
    fire.update({
      lampModulation: lampStatusModulationForMix(2),
      psiStress: 0.4,
      reducedMotion: false,
      timeSeconds: 12,
    });
    expect(fire.uniforms.uStatusIntensity.value).toBeCloseTo(0.2, 6);
    fire.dispose();
  });
});

describe("island heron (W4.9)", () => {
  it("builds one perched heron that freezes at time zero", () => {
    const birds = createGardenSummitBirds();
    const flock = birds.root.getObjectByName("island-heron");
    expect(flock).toBeDefined();
    birds.update({ reducedMotion: true, timeSeconds: 42, visible: true });
    expect(birds.root.visible).toBe(true);
    birds.update({ reducedMotion: false, timeSeconds: 42, visible: false });
    expect(birds.root.visible).toBe(false);
    birds.dispose();
  });
});
