import { describe, expect, it } from "vitest";
import { Color, MeshStandardMaterial, Vector3 } from "three";
import {
  chainGardenMaterialPatch,
  GARDEN_AIR,
  GARDEN_AIR_FAR_TRANSMITTANCE,
  GARDEN_DAWN_BAND_DENSITY,
  gardenAerialTransmittance,
  gardenDawnBandWeight,
  updateGardenAerial,
} from "./garden-aerial";
import { dayCycleBeats, dayCyclePhase, DAY_CYCLE_HEIGHT_FOG_PRESETS } from "./garden-day-cycle";
import { gardenHeightFogFactor } from "./garden-height-fog";
import { gardenSkyToday } from "../systems/sky-almanac";

const DEG = Math.PI / 180;
const SEA = -1.45;

// Solar noon of the pinned sky day: the X9 day drift is zero there.
const NOON = gardenSkyToday().solarNoonHour;

function fit(eye: { x: number; y: number; z: number }, near: number, far: number, clarity = 0, hour = NOON) {
  updateGardenAerial({
    phase: dayCyclePhase(hour),
    beats: dayCycleBeats(hour),
    solarHorizon: new Color(0.8, 0.8, 0.8),
    antiHorizon: new Color(0.7, 0.7, 0.8),
    sunDir: new Vector3(0.3, 0.8, -0.5).normalize(),
    solarElevation: 50 * DEG,
    hour,
    eye,
    near,
    far,
    seaLevel: SEA,
    clarity,
    skyVisibleHeight: 0.23,
  });
  return { ...GARDEN_AIR };
}

describe("one air (W2.3)", () => {
  it("reaches the same far transmittance at the seat and at the whole-map height, so the plate dissolves at both", () => {
    for (const eyeHeight of [15.23, 180]) {
      const eye = { x: 0, y: eyeHeight, z: 0 };
      const state = fit(eye, 190, 280);
      // The ladder's far end, on the sea, from this eye.
      const farDistance = Math.sqrt(280 ** 2 - (eyeHeight - SEA) ** 2);
      const atFar = gardenAerialTransmittance(state, eye, { x: farDistance, y: SEA, z: 0 });
      expect(atFar).toBeCloseTo(GARDEN_AIR_FAR_TRANSMITTANCE, 2);
      // The sea annulus rim (480 u) is almost all air.
      const rim = Math.sqrt(Math.max(0, 480 ** 2 - (eyeHeight - SEA) ** 2));
      expect(gardenAerialTransmittance(state, eye, { x: rim, y: SEA, z: 0 })).toBeLessThan(0.1);
    }
  });

  it("keeps the near field clear and lets a crown stand clearer than its foot", () => {
    const eye = { x: 0, y: 15.23, z: 0 };
    const state = fit(eye, 190, 280);
    expect(gardenAerialTransmittance(state, eye, { x: 140, y: SEA, z: 0 })).toBe(1);
    const foot = gardenAerialTransmittance(state, eye, { x: 230, y: 8, z: 0 });
    const crown = gardenAerialTransmittance(state, eye, { x: 230, y: 40, z: 0 });
    expect(crown).toBeGreaterThan(foot);
  });

  it("earns clear air: positive clarity thins it, negative clarity thickens it", () => {
    const eye = { x: 0, y: 15.23, z: 0 };
    const point = { x: 260, y: SEA, z: 0 };
    const clear = gardenAerialTransmittance(fit(eye, 190, 280, 1), eye, point);
    const neutral = gardenAerialTransmittance(fit(eye, 190, 280, 0), eye, point);
    const veiled = gardenAerialTransmittance(fit(eye, 190, 280, -1), eye, point);
    expect(clear).toBeGreaterThan(neutral);
    expect(neutral).toBeGreaterThan(veiled);
  });
});

describe("time inside the day beat (X9)", () => {
  it("makes the morning air clearer and cooler than the afternoon's, and noon the authored air", () => {
    const eye = { x: 0, y: 15.23, z: 0 };
    const point = { x: 260, y: SEA, z: 0 };
    const read = (hour: number) => {
      const state = fit(eye, 190, 280, 0, hour);
      return { T: gardenAerialTransmittance(state, eye, point), blueShare: state.airlight.b / state.airlight.r };
    };
    const noon = read(NOON);
    const morning = read(9.5);
    const afternoon = read(15.5);
    expect(morning.T).toBeGreaterThan(noon.T);
    expect(afternoon.T).toBeLessThan(noon.T);
    expect(morning.blueShare).toBeGreaterThan(noon.blueShare);
    expect(afternoon.blueShare).toBeLessThan(noon.blueShare);
  });
});

describe("K6 dawn band", () => {
  it("is a morning band keyed to the sun only: never by day, never in the evening", () => {
    expect(gardenDawnBandWeight(2 * DEG, 6.5)).toBe(1);
    expect(gardenDawnBandWeight(30 * DEG, 9)).toBe(0);
    expect(gardenDawnBandWeight(2 * DEG, 18.5)).toBe(0);
    expect(gardenDawnBandWeight(-12 * DEG, 5)).toBe(0);
  });

  // Print-gate entry (K6): with a stale Peg summary at dawn, the stale bank over
  // the risk waters must stay separable from the uniform dawn band. The bank is
  // checked at its THINNEST (day density, the noise floor 0.72) against the band
  // at its peak, over the distances the risk waters span from the seat.
  it("leaves a stale fog bank at least 1.5× stronger than the dawn band over the risk waters", () => {
    const eye = { x: 0, y: 15.23, z: 0 };
    const base = { density: 0, start: 150, falloff: 0.035, seaLevel: SEA, dawnHeight: 2.5, veil: 1 };
    for (const distance of [120, 160, 200, 250, 300]) {
      const point = { x: distance, y: SEA, z: 0 };
      const clear = gardenAerialTransmittance({ ...base, dawnBand: 0 }, eye, point);
      const band = gardenAerialTransmittance({ ...base, dawnBand: GARDEN_DAWN_BAND_DENSITY }, eye, point);
      const dawnOpacity = 1 - band / clear;
      const staleOpacity = 0.72 * Math.min(0.34, gardenHeightFogFactor({
        density: DAY_CYCLE_HEIGHT_FOG_PRESETS.day.density * 4,
        distance: Math.hypot(distance, eye.y - SEA),
        heightFalloff: DAY_CYCLE_HEIGHT_FOG_PRESETS.day.heightFalloff,
        seaLevel: SEA,
        worldY: SEA,
      }));
      expect(staleOpacity).toBeGreaterThanOrEqual(dawnOpacity * 1.5);
    }
  });
});

describe("shared material-patch chain (K5)", () => {
  it("composes patches in order, once per key, and never marks a clone as already patched", () => {
    const material = new MeshStandardMaterial();
    const order: string[] = [];
    chainGardenMaterialPatch(material, { key: "a", compile: () => order.push("a") });
    chainGardenMaterialPatch(material, { key: "b", compile: () => order.push("b") });
    chainGardenMaterialPatch(material, { key: "a", compile: () => order.push("a-again") });
    material.onBeforeCompile({} as never, null as never);
    expect(order).toEqual(["a", "b"]);
    expect(material.customProgramCacheKey()).toMatch(/\|a\|b$/);

    const clone = material.clone();
    chainGardenMaterialPatch(clone, { key: "a", compile: () => order.push("clone-a") });
    clone.onBeforeCompile({} as never, null as never);
    expect(order).toContain("clone-a");
  });
});
