import { describe, expect, it } from "vitest";
import {
  GARDEN_BREATH_PHASE,
  GARDEN_BREATH_RISE_SHARE,
  GARDEN_BREATH_SECONDS,
  GARDEN_DEFAULT_WIND_X,
  GARDEN_DEFAULT_WIND_Z,
  GARDEN_GUST_ATTACK_SECONDS,
  GARDEN_GUST_CYCLE_SECONDS,
  GARDEN_GUST_RELEASE_SECONDS,
  GARDEN_GUST_WORLD_SPEED,
  GARDEN_WIND_DIRECTION_CONVENTION,
  gardenBreathAt,
  gardenGustAtWorldPosition,
  gardenGustDelaySeconds,
  gardenGustEnvelope,
  weatherForFrame,
  writeWeatherPlan,
  type WeatherPlan,
} from "./weather";

const CALM = { baseWind: 0.1, psiStress: 0.08 };
const TREMOR = { baseWind: 0.3, psiStress: 0.45 };
const CRISIS = { baseWind: 0.8, psiStress: 0.85 };
const MELTDOWN = { baseWind: 1, psiStress: 1 };

describe("weather plan", () => {
  it("is a pure function of the world clock and the analytic inputs", () => {
    const a = weatherForFrame({ timeSeconds: 123.4, ...TREMOR });
    const b = weatherForFrame({ timeSeconds: 123.4, ...TREMOR });
    expect(a).toEqual(b);

    const scratch: WeatherPlan = {
      windDirX: 0,
      windDirZ: 0,
      windAngle: 0,
      windSpeed: 0,
      gust: 0,
      breath: 0,
      stormLevel: 0,
      lightning: 0,
    };
    writeWeatherPlan({ timeSeconds: 123.4, ...TREMOR }, scratch);
    expect(scratch).toEqual(a);
    // The scratch form carries no state between calls.
    writeWeatherPlan({ timeSeconds: 55.5, ...CALM }, scratch);
    expect(scratch).toEqual(weatherForFrame({ timeSeconds: 55.5, ...CALM }));
  });

  it("keeps every channel inside its documented range across time and stress", () => {
    for (const stress of [0, 0.08, 0.3, 0.45, 0.68, 0.85, 1]) {
      for (let t = 0; t < 1200; t += 7.7) {
        const plan = weatherForFrame({ timeSeconds: t, baseWind: stress, psiStress: stress });
        expect(Math.hypot(plan.windDirX, plan.windDirZ)).toBeCloseTo(1, 6);
        expect(plan.windSpeed).toBeGreaterThanOrEqual(0.19);
        expect(plan.windSpeed).toBeLessThanOrEqual(1);
        expect(plan.gust).toBeGreaterThanOrEqual(0);
        expect(plan.gust).toBeLessThanOrEqual(1);
        expect(plan.breath).toBeGreaterThanOrEqual(0);
        expect(plan.breath).toBeLessThanOrEqual(1);
        expect(plan.stormLevel).toBeGreaterThanOrEqual(0);
        expect(plan.stormLevel).toBeLessThanOrEqual(1);
        expect(plan.lightning).toBeGreaterThanOrEqual(0);
        expect(plan.lightning).toBeLessThan(2);
        expect(Number.isFinite(plan.windAngle)).toBe(true);
      }
    }
  });

  it("survives degenerate inputs without NaN", () => {
    for (const timeSeconds of [-5, 0, 1e9, Number.NaN]) {
      const plan = weatherForFrame({ timeSeconds, baseWind: Number.NaN, psiStress: Number.NaN });
      expect(Number.isFinite(plan.windSpeed)).toBe(true);
      expect(Number.isFinite(plan.stormLevel)).toBe(true);
      expect(Math.hypot(plan.windDirX, plan.windDirZ)).toBeCloseTo(1, 6);
    }
  });

  it("wanders the wind direction slowly without leaving the unit circle", () => {
    const angles = [0, 60, 240, 600, 1200].map(
      (t) => weatherForFrame({ timeSeconds: t, ...CALM }).windAngle,
    );
    // The wander is real: the bearing moves over minutes.
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(0.4);
    // ...but stays a bounded meander, not a full rotation.
    expect(Math.max(...angles) - Math.min(...angles)).toBeLessThan(3.4);
  });

  it("uses one nine-second 40/60 breath with named ten-percent offsets", () => {
    expect(GARDEN_BREATH_SECONDS).toBe(9);
    expect(GARDEN_BREATH_RISE_SHARE).toBe(0.4);
    expect(gardenBreathAt(0)).toBeCloseTo(0.5, 6);
    expect(gardenBreathAt(9)).toBeCloseTo(gardenBreathAt(0), 8);
    expect(gardenBreathAt(1.8)).toBeCloseTo(1, 8);
    expect(gardenBreathAt(7.2)).toBeCloseTo(0, 8);
    expect(GARDEN_BREATH_PHASE.mist - GARDEN_BREATH_PHASE.sails).toBeCloseTo(0.1);
    expect(GARDEN_BREATH_PHASE.lanterns - GARDEN_BREATH_PHASE.mist).toBeCloseTo(0.1);
  });

  it("schedules 2.5 gusts/minute with a two-second attack and six-second release", () => {
    expect(GARDEN_GUST_CYCLE_SECONDS).toBe(24);
    expect(60 / GARDEN_GUST_CYCLE_SECONDS).toBe(2.5);
    expect(gardenGustEnvelope(0)).toBe(0);
    expect(gardenGustEnvelope(GARDEN_GUST_ATTACK_SECONDS)).toBeCloseTo(1, 8);
    expect(
      gardenGustEnvelope(GARDEN_GUST_ATTACK_SECONDS + GARDEN_GUST_RELEASE_SECONDS),
    ).toBe(0);
    expect(gardenGustEnvelope(GARDEN_GUST_CYCLE_SECONDS)).toBe(0);
  });

  it("delays the same gust front in world space along the downwind vector", () => {
    const distance = GARDEN_GUST_WORLD_SPEED * 1.25;
    expect(gardenGustDelaySeconds(distance, 0, 1, 0)).toBeCloseTo(1.25, 8);
    expect(gardenGustDelaySeconds(0, distance, 0, 1)).toBeCloseTo(1.25, 8);
    const weather = { windDirX: 1, windDirZ: 0, windSpeed: 1 };
    const originPeak = gardenGustAtWorldPosition(2, 0, 0, weather);
    const downwindPeak = gardenGustAtWorldPosition(3.25, distance, 0, weather);
    expect(originPeak).toBeCloseTo(1, 8);
    expect(downwindPeak).toBeCloseTo(originPeak, 8);
    expect(gardenGustAtWorldPosition(3.25, distance, 0, weather, true)).toBe(0);
  });

  it("defines wind as downwind motion and starts on the established sea bearing", () => {
    expect(GARDEN_WIND_DIRECTION_CONVENTION).toBe("toward");
    const plan = weatherForFrame({ timeSeconds: 0, ...CALM });
    expect(plan.windDirX).toBeCloseTo(GARDEN_DEFAULT_WIND_X, 4);
    expect(plan.windDirZ).toBeCloseTo(GARDEN_DEFAULT_WIND_Z, 4);
    expect(plan.windAngle).toBeCloseTo(
      Math.atan2(GARDEN_DEFAULT_WIND_Z, GARDEN_DEFAULT_WIND_X),
      6,
    );
  });

  it("maps PSI stress onto the storm state: calm stays calm, meltdown storms", () => {
    const calm = weatherForFrame({ timeSeconds: 40, ...CALM });
    const tremor = weatherForFrame({ timeSeconds: 40, ...TREMOR });
    const crisis = weatherForFrame({ timeSeconds: 40, ...CRISIS });
    const meltdown = weatherForFrame({ timeSeconds: 40, ...MELTDOWN });

    expect(calm.stormLevel).toBe(0);
    expect(meltdown.stormLevel).toBeGreaterThanOrEqual(0.95);
    expect(tremor.stormLevel).toBeGreaterThan(calm.stormLevel);
    expect(crisis.stormLevel).toBeGreaterThan(tremor.stormLevel);
    expect(meltdown.stormLevel).toBeGreaterThanOrEqual(crisis.stormLevel);
    // Wind rises with the storm.
    expect(meltdown.windSpeed).toBeGreaterThan(calm.windSpeed);
  });

  it("breathes the storm slowly instead of pinning it to the stress reading", () => {
    const samples = [100, 200, 300].map(
      (t) => weatherForFrame({ timeSeconds: t, ...CRISIS }).stormLevel,
    );
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.005);
  });

  it("holds lightning back until the storm peak", () => {
    for (let t = 0; t < 600; t += 1.3) {
      expect(weatherForFrame({ timeSeconds: t, ...TREMOR }).lightning).toBe(0);
      // FRACTURE (0.68) maps below the 0.8 lightning gate.
      expect(
        weatherForFrame({ timeSeconds: t, baseWind: 0.6, psiStress: 0.68 }).lightning,
      ).toBe(0);
    }
  });

  it("fires deterministic lightning strikes at storm peak", () => {
    let strikes = 0;
    let peak = 0;
    for (let t = 0; t < 600; t += 0.05) {
      const flash = weatherForFrame({ timeSeconds: t, ...MELTDOWN }).lightning;
      if (flash > 0.5) strikes += 1;
      peak = Math.max(peak, flash);
    }
    // Several strike moments in ten minutes, with a bright peak.
    expect(strikes).toBeGreaterThan(10);
    expect(peak).toBeGreaterThan(0.9);
    // Same schedule every time.
    expect(weatherForFrame({ timeSeconds: 37.77, ...MELTDOWN }).lightning)
      .toBe(weatherForFrame({ timeSeconds: 37.77, ...MELTDOWN }).lightning);
  });

  it("keeps the reduced-motion static frame dark", () => {
    // Reduced motion pins timeSeconds at 0; the schedule must guarantee no
    // strike is in flight there, whatever the storm.
    expect(weatherForFrame({ timeSeconds: 0, ...MELTDOWN }).lightning).toBe(0);
    expect(weatherForFrame({ timeSeconds: 0, ...CRISIS }).lightning).toBe(0);
  });
});
