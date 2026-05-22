import { describe, expect, it } from "vitest";
import { buildRecordingCanvasContext, createGradientStub } from "../__test-utils__/canvas-context-builder";
import { createDrawInput } from "../__test-utils__/draw-input";
import { drawSky, skyState } from "./sky";
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
    it("returns night before the predawn boundary", () => {
      expect(skyState(motionAt(4.99)).mood.top).toBe("#050308");
    });

    it("returns predawn from 05:00 until 06:00", () => {
      expect(skyState(motionAt(5)).mood.top).toBe("#151a31");
      expect(skyState(motionAt(5.99)).mood.top).toBe("#151a31");
    });

    it("returns dawn at 06:00", () => {
      expect(skyState(motionAt(6)).mood.top).toBe("#223b57");
    });

    it("returns day from 07:00 until golden hour", () => {
      expect(skyState(motionAt(7)).mood.top).toBe("#496f8b");
      expect(skyState(motionAt(16.99)).mood.top).toBe("#496f8b");
    });

    it("returns day at 12:00", () => {
      expect(skyState(motionAt(12)).mood.top).toBe("#496f8b");
    });

    it("returns golden from 17:00 until dusk", () => {
      expect(skyState(motionAt(17)).mood.top).toBe("#385f78");
      expect(skyState(motionAt(17.99)).mood.top).toBe("#385f78");
    });

    it("returns dusk from 18:00 until night", () => {
      expect(skyState(motionAt(18)).mood.top).toBe("#151a32");
      expect(skyState(motionAt(19.99)).mood.top).toBe("#151a32");
    });

    it("returns dusk at 19:00", () => {
      expect(skyState(motionAt(19)).mood.top).toBe("#151a32");
    });

    it("returns night at 22:00", () => {
      expect(skyState(motionAt(22)).mood.top).toBe("#050308");
    });

    it("returns night at midnight", () => {
      expect(skyState(motionAt(0)).mood.top).toBe("#050308");
    });

    it("uses an inky mineral night palette with a quieter moon", () => {
      const { mood } = skyState(motionAt(22));
      expect(mood).toMatchObject({
        horizon: "#102f30",
        lower: "#03070d",
        mist: "rgba(96, 145, 132, 0.08)",
        moonAlpha: 0.42,
        starAlpha: 0.68,
        waterVeil: "rgba(2, 7, 10, 0.3)",
      });
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

describe("drawSky", () => {
  it("renders a dense deterministic reduced-motion night star field", () => {
    const first = recordReducedMotionNightStars();
    const second = recordReducedMotionNightStars();

    expect(first.length).toBeGreaterThanOrEqual(38);
    expect(second).toEqual(first);
  });
});

function recordReducedMotionNightStars(): readonly (readonly unknown[])[] {
  const recording = buildRecordingCanvasContext({
    returningMethods: {
      createLinearGradient: createGradientStub,
      createRadialGradient: createGradientStub,
    },
  });
  const width = 1000;
  const height = 600;
  drawSky(
    createDrawInput({
      camera: { offsetX: 0, offsetY: 0, zoom: 1 },
      ctx: recording.ctx,
      height,
      motion: motionAt(22, true),
      width,
      world: { areas: [], ships: [] } as unknown as ReturnType<typeof createDrawInput>["world"],
    }),
    {
      center: { x: 500, y: 360 },
      firePoint: { x: 530, y: 300 },
      lighthouseAsset: null,
      spriteAnchor: { x: 500, y: 360 },
      spriteScale: 1,
    } as NonNullable<Parameters<typeof drawSky>[1]>,
  );

  return recording.callsTo("fillRect").filter(([x, y, w, h]) => {
    return typeof x === "number"
      && typeof y === "number"
      && typeof w === "number"
      && typeof h === "number"
      && y <= height * 0.4
      && w <= 3
      && h <= 3;
  });
}
