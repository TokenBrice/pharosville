import { describe, expect, it, vi } from "vitest";
import { CIVIC_CORE_CENTER } from "../../systems/world-layout";
import { tileToScreen } from "../../systems/projection";
import { createCanvasContextStub, createDrawInput } from "../__test-utils__/draw-input";
import type { DrawPharosVilleInput } from "../render-types";
import {
  CENTER_CLUSTER_CHIMNEYS,
  drawCenterClusterChimneySmoke,
} from "./center-cluster";

function makeInput(overrides: Partial<DrawPharosVilleInput["motion"]> = {}): DrawPharosVilleInput {
  const ctx = createCanvasContextStub(
    ["arc", "beginPath", "fill", "restore", "save"],
    { fillStyle: "" },
  );
  return createDrawInput({
    ctx,
    motion: {
      ...createDrawInput().motion,
      wallClockHour: 12,
      ...overrides,
    },
  });
}

describe("center cluster chimney smoke", () => {
  it("declares three chimney offsets", () => {
    expect(CENTER_CLUSTER_CHIMNEYS).toHaveLength(3);
  });

  it("no-ops when nightFactor exceeds the night-suppress threshold", () => {
    // wallClockHour = 0 → nightFactor = 1, well above 0.7.
    const input = makeInput({ wallClockHour: 0 });
    drawCenterClusterChimneySmoke(input);
    expect(input.ctx.arc).not.toHaveBeenCalled();
    expect(input.ctx.fill).not.toHaveBeenCalled();
  });

  it("no-ops at full dusk where nightFactor = 1 (hour >= 20)", () => {
    const input = makeInput({ wallClockHour: 21 });
    drawCenterClusterChimneySmoke(input);
    expect(input.ctx.arc).not.toHaveBeenCalled();
  });

  it("renders smoke wisps during the day (nightFactor = 0)", () => {
    const input = makeInput({ wallClockHour: 12 });
    drawCenterClusterChimneySmoke(input);
    expect((input.ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it("reduced-motion frame is deterministic across redraws", () => {
    const a = makeInput({ wallClockHour: 12, reducedMotion: true, timeSeconds: 3.7 });
    const b = makeInput({ wallClockHour: 12, reducedMotion: true, timeSeconds: 7.4 });
    drawCenterClusterChimneySmoke(a);
    drawCenterClusterChimneySmoke(b);
    const callsA = (a.ctx.arc as ReturnType<typeof vi.fn>).mock.calls;
    const callsB = (b.ctx.arc as ReturnType<typeof vi.fn>).mock.calls;
    expect(callsA.length).toBeGreaterThan(0);
    expect(callsA).toEqual(callsB);
  });

  it("places reduced-motion wisps at the three chimney tile offsets", () => {
    const input = makeInput({ wallClockHour: 12, reducedMotion: true });
    drawCenterClusterChimneySmoke(input);
    const arcCalls = (input.ctx.arc as ReturnType<typeof vi.fn>).mock.calls;
    expect(arcCalls.length).toBeGreaterThan(0);

    const expectedBases = CENTER_CLUSTER_CHIMNEYS.map((chimney) =>
      tileToScreen(
        { x: CIVIC_CORE_CENTER.x + chimney.x, y: CIVIC_CORE_CENTER.y + chimney.y },
        input.camera,
      ),
    );
    // Each arc x argument is base.x + small dx; bucket the arc xs by nearest
    // expected base x and assert each base attracted at least one puff.
    const bucketsHit = new Set<number>();
    for (const call of arcCalls) {
      const argX = call[0] as number;
      let nearest = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      expectedBases.forEach((base, index) => {
        const distance = Math.abs(argX - base.x);
        if (distance < nearestDistance) {
          nearest = index;
          nearestDistance = distance;
        }
      });
      // dx never exceeds ~3 px at zoom 1 in the frozen path.
      expect(nearestDistance).toBeLessThan(4);
      bucketsHit.add(nearest);
    }
    expect(bucketsHit.size).toBe(3);
  });
});
