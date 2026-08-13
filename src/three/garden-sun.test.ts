import { describe, expect, it } from "vitest";
import { dayCyclePhase } from "./garden-day-cycle";
import {
  GARDEN_KEY_MIN_ELEVATION,
  GARDEN_SUN_NOON_BEARING,
  GARDEN_SUN_NOON_ELEVATION,
  gardenKeyLightPose,
  gardenMoonPose,
  gardenSunPose,
} from "./garden-sun";

function bearingOf(pose: { direction: { x: number; z: number } }): number {
  return Math.atan2(pose.direction.z, pose.direction.x);
}

describe("gardenSunPose", () => {
  it("passes through the calibrated noon key light, so the day grade cannot drift", () => {
    // The whole tone/AO ladder was tuned against (-35, 48, -30) from the island.
    // Midday is the one moment the arc is not allowed to move.
    const noon = gardenSunPose((5 + 19.5) / 2);
    expect(bearingOf(noon)).toBeCloseTo(GARDEN_SUN_NOON_BEARING, 6);
    expect(noon.elevation).toBeCloseTo(GARDEN_SUN_NOON_ELEVATION, 6);
  });

  it("is on the horizon at sunrise and sunset", () => {
    expect(gardenSunPose(5).elevation).toBeCloseTo(0, 6);
    expect(gardenSunPose(19.5).elevation).toBeCloseTo(0, 6);
  });

  it("is below the horizon after dark, which is what switches the sky's scattering off", () => {
    expect(gardenSunPose(23).elevation).toBeLessThan(0);
    expect(gardenSunPose(2).elevation).toBeLessThan(0);
    expect(gardenSunPose(0).direction.y).toBeLessThan(0);
  });

  it("sweeps the bearing across the day rather than sliding up one meridian", () => {
    const morning = bearingOf(gardenSunPose(8));
    const noon = bearingOf(gardenSunPose(12.25));
    const evening = bearingOf(gardenSunPose(17));
    expect(morning).toBeLessThan(noon);
    expect(noon).toBeLessThan(evening);
    // The whole point: shadow direction has to be legibly different, not merely
    // different. ~40° between morning and evening at minimum.
    expect(evening - morning).toBeGreaterThan(0.7);
  });

  it("rises then falls, so midday is the highest the sun gets", () => {
    const hours = [6, 8, 10, 12.25, 14, 16, 18];
    const elevations = hours.map((hour) => gardenSunPose(hour).elevation);
    const peak = Math.max(...elevations);
    expect(peak).toBeCloseTo(gardenSunPose(12.25).elevation, 6);
    expect(elevations[0]).toBeLessThan(elevations[2]);
    expect(elevations[6]).toBeLessThan(elevations[4]);
  });

  it("returns a unit direction at every hour", () => {
    for (let hour = 0; hour < 24; hour += 0.5) {
      expect(gardenSunPose(hour).direction.length()).toBeCloseTo(1, 6);
    }
  });

  it("writes into the caller's pose so the frame loop allocates nothing", () => {
    const target = gardenSunPose(9);
    const same = gardenSunPose(15, target);
    expect(same).toBe(target);
  });
});

describe("gardenKeyLightPose", () => {
  it("never rakes below the minimum elevation, so shadows stay describable", () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      const pose = gardenKeyLightPose(hour, dayCyclePhase(hour));
      expect(pose.elevation).toBeGreaterThanOrEqual(GARDEN_KEY_MIN_ELEVATION - 1e-9);
      expect(pose.direction.y).toBeGreaterThan(0);
    }
  });

  it("is the sun at midday and the moon in the dead of night", () => {
    const noon = gardenKeyLightPose(12.25, dayCyclePhase(12.25));
    expect(noon.direction.distanceTo(gardenSunPose(12.25).direction)).toBeLessThan(1e-6);

    const midnight = gardenKeyLightPose(1, dayCyclePhase(1));
    expect(midnight.direction.distanceTo(gardenMoonPose().direction)).toBeLessThan(1e-6);
  });

  it("returns a unit direction at every hour", () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      expect(gardenKeyLightPose(hour, dayCyclePhase(hour)).direction.length()).toBeCloseTo(1, 6);
    }
  });

  it("crosses over without a discontinuity — no hour where the key light jumps", () => {
    // The property that matters is CONTINUITY, not slowness. The sun-to-moon
    // handover is legitimately the fastest the key light ever moves (it peaks
    // around 20:00 at ~0.094 rad per 0.05 h — about 5° per three real minutes,
    // which no one can see), so a flat "must be slower than X" bound would
    // either fail on honest motion or be too loose to catch a real snap.
    //
    // A discontinuity is a SPIKE: one step far larger than the steps either
    // side of it. That is what this asserts, plus a generous absolute ceiling.
    const steps: number[] = [];
    let previous = gardenKeyLightPose(0, dayCyclePhase(0)).direction.clone();
    for (let hour = 0.05; hour < 24; hour += 0.05) {
      const next = gardenKeyLightPose(hour, dayCyclePhase(hour)).direction.clone();
      steps.push(next.angleTo(previous));
      previous = next;
    }

    expect(Math.max(...steps)).toBeLessThan(0.15);
    for (let index = 1; index < steps.length - 1; index += 1) {
      const neighbourMean = (steps[index - 1] + steps[index + 1]) / 2;
      // A smooth curve's middle step is close to the mean of its neighbours; an
      // antipodal-lerp snap was ~50x its own.
      expect(steps[index]).toBeLessThan(neighbourMean * 3 + 1e-4);
    }
  });
});
