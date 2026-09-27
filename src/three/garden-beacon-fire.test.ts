import { Mesh, Points, ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";
import { lampStatusModulationForMix } from "../systems/lamp-status";
import {
  GARDEN_BEACON_FLAME_CORE_LUMINANCE,
  createGardenBeaconFire,
} from "./garden-beacon-fire";
import { GARDEN_BLOOM_PRACTICAL_THRESHOLD } from "./garden-post";

describe("garden beacon fire (W4)", () => {
  it("mounts the flame, embers and mirror with no smoke at the crown", () => {
    const fire = createGardenBeaconFire();
    expect(fire.root.getObjectByName("lighthouse-flame")).toBeInstanceOf(Mesh);
    expect(fire.root.getObjectByName("lighthouse-embers")).toBeInstanceOf(Points);
    expect(fire.root.getObjectByName("lighthouse-mirror")).toBeInstanceOf(Mesh);
    expect(fire.root.getObjectByName("lighthouse-smoke")).toBeUndefined();
    fire.dispose();
  });

  it("reserves selective bloom for the raised night flame core", () => {
    const fire = createGardenBeaconFire();
    const flame = fire.root.getObjectByName("lighthouse-flame") as Mesh;
    const material = flame.material as ShaderMaterial;
    expect(material.uniforms.uBloomFloor.value)
      .toBe(GARDEN_BEACON_FLAME_CORE_LUMINANCE);
    expect(GARDEN_BEACON_FLAME_CORE_LUMINANCE)
      .toBeGreaterThan(GARDEN_BLOOM_PRACTICAL_THRESHOLD);
    fire.dispose();
  });

  it("sheds embers per scheduler tier without reallocating", () => {
    const fire = createGardenBeaconFire();
    const embers = fire.root.getObjectByName("lighthouse-embers") as Points;

    fire.setTier("full");
    expect(embers.visible).toBe(true);
    expect(embers.geometry.drawRange.count).toBe(32);

    fire.setTier("balanced");
    expect(embers.geometry.drawRange.count).toBe(12);

    for (const tier of ["interaction", "recovery", "constrained"] as const) {
      fire.setTier(tier);
      expect(embers.visible).toBe(false);
    }
    fire.dispose();
  });

  it("computes a deterministic flicker and freezes time under reduced motion", () => {
    const fire = createGardenBeaconFire();
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
    const fire = createGardenBeaconFire();
    const calm = fire.update({ psiStress: 0, reducedMotion: false, timeSeconds: 3.7 });
    const stressed = fire.update({ psiStress: 1, reducedMotion: false, timeSeconds: 3.7 });
    expect(stressed).not.toBe(calm);
    fire.dispose();
  });

  it("keeps PSI flame bands while applying cool and dim status modulation", () => {
    const fire = createGardenBeaconFire();
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
