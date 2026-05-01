import { describe, expect, it } from "vitest";
import { initialAdaptiveDprState, MAX_MAIN_CANVAS_PIXELS, pushDrawDurationSample, resolveAdaptiveDprState, resolveCanvasBudget, createDrawDurationWindow } from "./canvas-budget";

describe("canvas budget", () => {
  it("caps effective DPR by main canvas backing pixels", () => {
    const budget = resolveCanvasBudget({
      cssWidth: 2560,
      cssHeight: 1440,
      requestedDpr: 3,
    });

    expect(budget.effectiveDpr).toBeLessThan(2);
    expect(budget.backingPixels).toBeLessThanOrEqual(MAX_MAIN_CANVAS_PIXELS);
  });

  it("keeps normal desktop DPR at the requested value when under budget", () => {
    const budget = resolveCanvasBudget({
      cssWidth: 1440,
      cssHeight: 1000,
      requestedDpr: 1,
    });

    expect(budget.effectiveDpr).toBe(1);
  });

  it("tracks rolling draw-duration stats across a bounded window", () => {
    const window = createDrawDurationWindow(4);
    pushDrawDurationSample(window, 8);
    pushDrawDurationSample(window, 9);
    pushDrawDurationSample(window, 10);
    const stats = pushDrawDurationSample(window, 11);
    expect(stats.count).toBe(4);
    expect(stats.averageMs).toBeCloseTo(9.5);
    expect(stats.p90Ms).toBe(11);

    const overflowStats = pushDrawDurationSample(window, 30);
    expect(overflowStats.count).toBe(4);
    expect(overflowStats.averageMs).toBeCloseTo((9 + 10 + 11 + 30) / 4);
    expect(overflowStats.p90Ms).toBe(30);
  });

  it("downshifts requested DPR after sustained over-budget p90 with hysteresis", () => {
    let state = initialAdaptiveDprState(2);
    const stats = { averageMs: 20, count: 48, p90Ms: 20 };

    for (let index = 0; index < 3; index += 1) {
      state = resolveAdaptiveDprState({
        maximumRequestedDpr: 2,
        state,
        stats,
      });
      expect(state.requestedDpr).toBe(2);
    }

    state = resolveAdaptiveDprState({
      maximumRequestedDpr: 2,
      state,
      stats,
    });
    expect(state.requestedDpr).toBeLessThan(2);
    expect(state.cooldownFrames).toBeGreaterThan(0);
  });

  it("upshifts requested DPR only after long stable headroom and cooldown expiry", () => {
    let state = { ...initialAdaptiveDprState(1.25), cooldownFrames: 3 };
    const stats = { averageMs: 9, count: 48, p90Ms: 9 };

    for (let index = 0; index < 20; index += 1) {
      state = resolveAdaptiveDprState({
        maximumRequestedDpr: 2,
        state,
        stats,
      });
    }
    expect(state.requestedDpr).toBeGreaterThan(1.25);
  });
});
