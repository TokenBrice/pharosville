import { describe, expect, it } from "vitest";
import { REST_SEAT_YAW_RAD } from "../systems/rest-seat";
import { gardenMoonStateAt, gardenSkyDayFromParts, gardenSkyToday, gardenSkyViewAspect } from "../systems/sky-almanac";
import { dayCyclePhase } from "./garden-day-cycle";
import {
  GARDEN_KEY_MIN_ELEVATION,
  GARDEN_SUN_NOON_ELEVATION,
  gardenKeyLightPose,
  gardenMoonPose,
  gardenSunPose,
} from "./garden-sun";

/** The suite's pinned sky day (test-setup): 26 Sep, 35° N, solar noon 13:00. */
const today = gardenSkyToday();

function bearingOf(pose: { direction: { x: number; z: number } }): number {
  return Math.atan2(pose.direction.z, pose.direction.x);
}

/** Horizontal light direction in the rest seat's frame: +right, +forward (into the picture). */
function seatRelative(pose: { direction: { x: number; z: number } }): { right: number; forward: number } {
  const { x, z } = pose.direction;
  const length = Math.hypot(x, z);
  const yaw = REST_SEAT_YAW_RAD;
  return {
    right: (x * Math.cos(yaw) - z * Math.sin(yaw)) / length,
    forward: (-x * Math.sin(yaw) - z * Math.cos(yaw)) / length,
  };
}

describe("gardenSunPose", () => {
  it("puts the noon key at the rest seat's right hand, a pure side light", () => {
    const noon = seatRelative(gardenSunPose(today.solarNoonHour));
    expect(noon.right).toBeCloseTo(1, 6);
    expect(noon.forward).toBeCloseTo(0, 6);
    expect(gardenSunPose(today.solarNoonHour).elevation).toBeCloseTo(GARDEN_SUN_NOON_ELEVATION, 6);
  });

  it("keeps the noon apex in every season while sunrise and sunset follow the date", () => {
    for (const [month, dayOfMonth] of [[6, 21], [12, 21]] as const) {
      const day = gardenSkyDayFromParts({
        year: 2026,
        month,
        day: dayOfMonth,
        utcOffsetHours: 1,
        dstHours: 0,
        latitude: { latitudeRad: (35 * Math.PI) / 180, southern: false },
      });
      expect(gardenSunPose(day.solarNoonHour, undefined, day).elevation).toBeCloseTo(GARDEN_SUN_NOON_ELEVATION, 6);
      expect(gardenSunPose(day.sunsetHour, undefined, day).elevation).toBeCloseTo(0, 6);
    }
  });

  it("rises front-right of the seat and sets behind the viewer's right shoulder", () => {
    // Dawn is soft contre-jour from ahead-right; golden hour lights the faces
    // the seat sees from behind-right; the key never crosses to the left hand.
    const dawn = seatRelative(gardenSunPose(today.sunriseHour + 0.5));
    expect(dawn.forward).toBeGreaterThan(0.5);
    expect(dawn.right).toBeGreaterThan(0.3);
    const golden = seatRelative(gardenSunPose(today.sunsetHour - 1.5));
    expect(golden.forward).toBeLessThan(-0.5);
    expect(golden.right).toBeGreaterThan(0.5);
    for (let hour = today.sunriseHour; hour <= today.sunsetHour; hour += 0.25) {
      expect(seatRelative(gardenSunPose(hour)).right).toBeGreaterThan(0);
    }
  });

  it("is on the horizon at sunrise and sunset", () => {
    expect(gardenSunPose(today.sunriseHour).elevation).toBeCloseTo(0, 6);
    expect(gardenSunPose(today.sunsetHour).elevation).toBeCloseTo(0, 6);
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


  it("is the sun at midday and the displayed moon in the dead of night", () => {
    const noon = gardenKeyLightPose(12.25, dayCyclePhase(12.25));
    expect(noon.direction.distanceTo(gardenSunPose(12.25).direction)).toBeLessThan(1e-6);

    // The pinned day is the harvest full moon, up and clear at 01:00.
    const midnight = gardenKeyLightPose(1, dayCyclePhase(1));
    expect(midnight.direction.distanceTo(gardenMoonPose(1).direction)).toBeLessThan(1e-6);
    expect(midnight.moonLight).toBeGreaterThan(0.95);
  });

  it("falls back to high sky fill while the moon is down, with no moon light", () => {
    const day = gardenSkyDayFromParts({
      year: 2026,
      month: 10,
      day: 10,
      utcOffsetHours: 2,
      dstHours: 1,
      latitude: { latitudeRad: (35 * Math.PI) / 180, southern: false },
    });
    // Near new moon the moon keeps sun hours: down all night.
    expect(gardenMoonStateAt(day, 1, gardenSkyViewAspect()).up).toBe(false);
    const pose = gardenKeyLightPose(1, dayCyclePhase(1), undefined, day);
    expect(pose.moonLight).toBe(0);
    expect(pose.elevation).toBeGreaterThan(0.5);
  });

  it("returns a unit direction at every hour", () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      expect(gardenKeyLightPose(hour, dayCyclePhase(hour)).direction.length()).toBeCloseTo(1, 6);
    }
  });

  it("crosses over without a discontinuity — no hour where the key light jumps", () => {
    // The property that matters is CONTINUITY, not slowness. The sun-to-moon
    // handover after sunset is legitimately the fastest the key light ever
    // moves: on the pinned full-moon evening the set sun is behind the
    // viewer's right shoulder while the rising moon is ahead-left, nearly
    // opposite, so the key peaks around 19:40 at ~0.22 rad per 0.05 h — about
    // 12° per three real minutes, in blue light nobody reads shadows by. A
    // flat "must be slower than X" bound would either fail on honest motion
    // or be too loose to catch a real snap.
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

    expect(Math.max(...steps)).toBeLessThan(0.25);
    for (let index = 1; index < steps.length - 1; index += 1) {
      const neighbourMean = (steps[index - 1] + steps[index + 1]) / 2;
      // A smooth curve's middle step is close to the mean of its neighbours; an
      // antipodal-lerp snap was ~50x its own.
      expect(steps[index]).toBeLessThan(neighbourMean * 3 + 1e-4);
    }
  });
});
