import { DataTexture, Mesh, Points, RGBAFormat } from "three";
import { describe, expect, it } from "vitest";
import { lampStatusModulationForMix } from "../systems/lamp-status";
import { createGardenBeaconFire } from "./garden-beacon-fire";
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

describe("garden summit birds (W7)", () => {
  it("builds one instanced flock that freezes at time zero", () => {
    const birds = createGardenSummitBirds();
    const flock = birds.root.getObjectByName("lighthouse-birds");
    expect(flock).toBeDefined();
    birds.update({ reducedMotion: true, timeSeconds: 42, visible: true });
    expect(birds.root.visible).toBe(true);
    birds.update({ reducedMotion: false, timeSeconds: 42, visible: false });
    expect(birds.root.visible).toBe(false);
    birds.dispose();
  });
});
