import { describe, expect, it } from "vitest";
import { skyState } from "./sky";
import type { PharosVilleCanvasMotion } from "../render-types";

function motionAt(wallClockHour: number, reducedMotion = false): PharosVilleCanvasMotion {
  return {
    // skyState only reads wallClockHour; the rest are required by the type but unused here.
    plan: { lighthouseFireFlickerPerSecond: 1 } as PharosVilleCanvasMotion["plan"],
    reducedMotion,
    timeSeconds: 0,
    wallClockHour,
  };
}

describe("skyState", () => {
  describe("nightFactor", () => {
    it("is 0 at noon", () => {
      expect(skyState(motionAt(12)).nightFactor).toBe(0);
    });

    it("is 1 at midnight (wraps around)", () => {
      expect(skyState(motionAt(0)).nightFactor).toBe(1);
      expect(skyState(motionAt(24)).nightFactor).toBe(1);
    });

    it("is 1 across the night band (20:00–05:00)", () => {
      expect(skyState(motionAt(20)).nightFactor).toBe(1);
      expect(skyState(motionAt(22)).nightFactor).toBe(1);
      expect(skyState(motionAt(2)).nightFactor).toBe(1);
      expect(skyState(motionAt(5)).nightFactor).toBe(1);
    });

    it("ramps linearly across dusk (18:00–20:00)", () => {
      expect(skyState(motionAt(18)).nightFactor).toBe(0);
      expect(skyState(motionAt(19)).nightFactor).toBeCloseTo(0.5, 5);
      expect(skyState(motionAt(20)).nightFactor).toBe(1);
    });

    it("ramps linearly across dawn (05:00–07:00)", () => {
      // 05:00 is the night→dawn boundary; nightFactor should be 1 at the start
      // of the dawn ramp and 0 at the end.
      expect(skyState(motionAt(5)).nightFactor).toBe(1);
      expect(skyState(motionAt(6)).nightFactor).toBeCloseTo(0.5, 5);
      expect(skyState(motionAt(7)).nightFactor).toBe(0);
    });

    it("clamps wallClockHour values outside [0, 24)", () => {
      expect(skyState(motionAt(-1)).nightFactor).toBe(skyState(motionAt(23)).nightFactor);
      expect(skyState(motionAt(25)).nightFactor).toBe(skyState(motionAt(1)).nightFactor);
    });
  });

  describe("mood selection", () => {
    it("returns dawn at 06:00", () => {
      expect(skyState(motionAt(6)).mood.top).toBe("#223b57");
    });

    it("returns day at 12:00", () => {
      expect(skyState(motionAt(12)).mood.top).toBe("#496f8b");
    });

    it("returns dusk at 19:00", () => {
      expect(skyState(motionAt(19)).mood.top).toBe("#151a32");
    });

    it("returns night at 22:00", () => {
      expect(skyState(motionAt(22)).mood.top).toBe("#100b12");
    });

    it("returns night at midnight", () => {
      expect(skyState(motionAt(0)).mood.top).toBe("#100b12");
    });
  });

  describe("progress (celestial arc placement)", () => {
    it("places sun at horizon-left at 06:00 (progress = 0)", () => {
      expect(skyState(motionAt(6)).progress).toBeCloseTo(0, 5);
    });

    it("places sun at top of arc at 12:00 (progress = 0.25)", () => {
      expect(skyState(motionAt(12)).progress).toBeCloseTo(0.25, 5);
    });

    it("places sun at horizon-right at 18:00 (progress = 0.5)", () => {
      expect(skyState(motionAt(18)).progress).toBeCloseTo(0.5, 5);
    });
  });

  describe("reduced motion", () => {
    it("uses wallClockHour even when reducedMotion is true", () => {
      // skyState is a pure function of wallClockHour. The reduced-motion
      // pin happens at the producer (pharosville-world.tsx), not here.
      expect(skyState(motionAt(12, true)).nightFactor).toBe(0);
      expect(skyState(motionAt(22, true)).nightFactor).toBe(1);
    });
  });
});
