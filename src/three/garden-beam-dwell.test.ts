import { describe, expect, it } from "vitest";
import {
  angularDistance,
  BEAM_PARKED_BEARING,
  beamBearingTo,
  beamDwellRateScale,
  beamStaticBearing,
} from "./garden-beam-dwell";

const beacon = { x: 0, z: 0 };

/** Where the beam's cone actually points at a given rotation.y. */
function coneDirection(angle: number): { x: number; z: number } {
  return { x: Math.cos(angle), z: -Math.sin(angle) };
}

describe("beam dwell bearing (3d)", () => {
  it("aims the cone at the target rather than away from it", () => {
    // The negated Z in `beamBearingTo` is the whole point of the function: a
    // sign slip here would park the light on the opposite horizon and still
    // look like a plausible bearing in isolation.
    for (const target of [
      { x: 30, z: 0 },
      { x: 0, z: 30 },
      { x: -20, z: -14 },
      { x: 7, z: -25 },
    ]) {
      const direction = coneDirection(beamBearingTo(beacon, target));
      const length = Math.hypot(target.x, target.z);
      expect(direction.x, `${target.x},${target.z}`).toBeCloseTo(target.x / length, 6);
      expect(direction.z, `${target.x},${target.z}`).toBeCloseTo(target.z / length, 6);
    }
  });

  it("measures the short way round the circle", () => {
    expect(angularDistance(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2, 6);
    expect(angularDistance(-3.1, 3.1)).toBeCloseTo(-(Math.PI * 2 - 6.2), 6);
  });
});

describe("beam dwell rate well (3d)", () => {
  it("leaves the sweep exactly as it was when there is nobody to watch", () => {
    // An index with no contributors must restore the old even sweep bit for
    // bit, not "almost" — this cue is additive or it is a regression.
    for (const angle of [-3, -1, 0, 0.7, 2.5, 6]) {
      expect(beamDwellRateScale(angle, null)).toBe(1);
    }
  });

  it("slows hardest right on the bearing and not at all off it", () => {
    const bearing = 1.2;

    expect(beamDwellRateScale(bearing, bearing)).toBeCloseTo(0.38, 2);
    // Outside the well the beam turns at its ordinary rate, and it reaches
    // exactly 1 at the edge — no step the eye could catch entering or leaving.
    expect(beamDwellRateScale(bearing + 0.55, bearing)).toBeCloseTo(1, 6);
    expect(beamDwellRateScale(bearing + 2.4, bearing)).toBe(1);
  });

  it("slows monotonically as the beam closes on the bearing", () => {
    const bearing = -0.4;
    const scales = [0.5, 0.4, 0.3, 0.2, 0.1, 0]
      .map((offset) => beamDwellRateScale(bearing + offset, bearing));

    for (let index = 1; index < scales.length; index += 1) {
      expect(scales[index]!).toBeLessThan(scales[index - 1]!);
    }
  });

  it("never stops the light and never reverses it", () => {
    // A lighthouse that stalls reads as broken, and one that runs backwards
    // reads as a bug. The well is a slowdown, not a hold.
    const bearing = 2.0;
    for (let angle = -Math.PI; angle <= Math.PI; angle += 0.05) {
      const scale = beamDwellRateScale(angle, bearing);
      expect(scale).toBeGreaterThan(0);
      expect(scale).toBeLessThanOrEqual(1);
    }
  });

  it("wraps across the seam instead of missing the well there", () => {
    // The beam angle is kept in [0, 2π) and the bearing comes from atan2 in
    // [-π, π]. Without the wrap-aware distance the well would simply never
    // fire for half the sky.
    const bearing = -3.1;
    expect(beamDwellRateScale(3.15, bearing)).toBeLessThan(1);
  });
});

describe("beam static bearing under reduced motion (3d)", () => {
  it("holds on the contributor when there is one", () => {
    expect(beamStaticBearing(1.37)).toBe(1.37);
  });

  it("keeps the composed pose when there is not", () => {
    expect(beamStaticBearing(null)).toBe(BEAM_PARKED_BEARING);
  });
});
