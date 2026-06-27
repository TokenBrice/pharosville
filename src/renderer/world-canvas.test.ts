import { describe, expect, it } from "vitest";
import { shouldDrawWaterAccentPass } from "./world-canvas";
import type { PharosVilleRenderSchedulerState } from "./render-types";

function scheduler(tier: PharosVilleRenderSchedulerState["tier"], skippedPasses: readonly string[] = []): PharosVilleRenderSchedulerState {
  return {
    degradedPasses: [],
    skippedPasses,
    targetFrameMs: 16.7,
    tier,
  };
}

describe("world canvas water accent scheduling", () => {
  it("keeps recovery-tier water accents eligible every frame", () => {
    const recovery = scheduler("recovery");

    expect(shouldDrawWaterAccentPass(recovery)).toBe(true);
    expect(shouldDrawWaterAccentPass(recovery)).toBe(true);
    expect(shouldDrawWaterAccentPass(recovery)).toBe(true);
  });

  it("still honors constrained-tier pass shedding", () => {
    expect(shouldDrawWaterAccentPass(scheduler("constrained", ["water-accents"]))).toBe(false);
  });
});
