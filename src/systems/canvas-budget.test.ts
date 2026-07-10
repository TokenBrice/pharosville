import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_DPR_PACING_MIN_SAMPLES,
  ADAPTIVE_DPR_STEP,
  canRetainOffscreenCanvas,
  canvasPixelArea,
  createDrawDurationWindow,
  initialAdaptiveDprState,
  MAX_MAIN_CANVAS_PIXELS,
  MAX_TOTAL_BACKING_PIXELS,
  pushDrawDurationSample,
  resolveAdaptiveDprState,
  resolveCanvasBackingPixelMetrics,
  resolveCanvasBudget,
} from "./canvas-budget";

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

  it("tracks main plus static and dynamic backing pixels", () => {
    const metrics = resolveCanvasBackingPixelMetrics({
      dynamicCacheEntryCount: 1,
      dynamicCachePixels: 2_000,
      mainCanvasPixels: 10_000,
      staticCacheEntryCount: 2,
      staticCachePixels: 3_000,
    });

    expect(metrics.mainCanvasPixels).toBe(10_000);
    expect(metrics.staticCachePixels).toBe(3_000);
    expect(metrics.dynamicCachePixels).toBe(2_000);
    expect(metrics.spriteCachePixels).toBe(0);
    expect(metrics.offscreenCachePixels).toBe(5_000);
    expect(metrics.totalBackingPixels).toBe(15_000);
    expect(metrics.totalCacheEntryCount).toBe(3);
    expect(metrics.maxTotalBackingPixels).toBe(MAX_TOTAL_BACKING_PIXELS);
  });

  it("reports remaining offscreen budget and over-budget pixels", () => {
    const metrics = resolveCanvasBackingPixelMetrics({
      dynamicCachePixels: 6,
      mainCanvasPixels: MAX_TOTAL_BACKING_PIXELS - 10,
      spriteCachePixels: 3,
      staticCachePixels: 8,
    });

    expect(metrics.remainingOffscreenPixels).toBe(0);
    expect(metrics.overBudgetPixels).toBe(7);
  });

  it("includes sprite cache pixels in total backing metrics", () => {
    const metrics = resolveCanvasBackingPixelMetrics({
      dynamicCacheEntryCount: 1,
      dynamicCachePixels: 20,
      mainCanvasPixels: 100,
      spriteCacheEntryCount: 3,
      spriteCachePixels: 40,
      staticCacheEntryCount: 2,
      staticCachePixels: 30,
    });

    expect(metrics.offscreenCachePixels).toBe(90);
    expect(metrics.spriteCacheEntryCount).toBe(3);
    expect(metrics.spriteCachePixels).toBe(40);
    expect(metrics.totalBackingPixels).toBe(190);
    expect(metrics.totalCacheEntryCount).toBe(6);
  });

  it("checks whether an offscreen canvas can be retained under total budget", () => {
    const mainCanvasPixels = MAX_TOTAL_BACKING_PIXELS - 1_000;

    expect(canRetainOffscreenCanvas({
      candidatePixels: 999,
      mainCanvasPixels,
    })).toBe(true);
    expect(canRetainOffscreenCanvas({
      candidatePixels: 1_001,
      currentSpriteCachePixels: 0,
      mainCanvasPixels,
    })).toBe(false);
  });

  it("normalizes canvas pixel area inputs", () => {
    expect(canvasPixelArea(10.9, 4.2)).toBe(40);
    expect(canvasPixelArea(-10, 4)).toBe(0);
    expect(canvasPixelArea(Number.NaN, 4)).toBe(0);
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

  it("downshifts on raster-bound frames where pacing collapses but draw duration stays quiet", () => {
    let state = initialAdaptiveDprState(2);
    const stats = { averageMs: 5, count: 48, p90Ms: 5 };
    const framePacing = { p90Ms: 30, sampleCount: 120 };

    for (let index = 0; index < 3; index += 1) {
      state = resolveAdaptiveDprState({
        framePacing,
        maximumRequestedDpr: 2,
        state,
        stats,
      });
      expect(state.requestedDpr).toBe(2);
    }

    state = resolveAdaptiveDprState({
      framePacing,
      maximumRequestedDpr: 2,
      state,
      stats,
    });
    expect(state.requestedDpr).toBe(2 - ADAPTIVE_DPR_STEP);
    expect(state.cooldownFrames).toBeGreaterThan(0);
  });

  it("suppresses upshift while frame pacing is degraded", () => {
    let state = initialAdaptiveDprState(1.25);
    // Draw p90 sits in upshift territory (< 13.6ms) but above the raster
    // quiet threshold, so neither downshift path fires — DPR must hold.
    const stats = { averageMs: 9, count: 48, p90Ms: 9 };
    const framePacing = { p90Ms: 30, sampleCount: 120 };

    for (let index = 0; index < 40; index += 1) {
      state = resolveAdaptiveDprState({
        framePacing,
        maximumRequestedDpr: 2,
        state,
        stats,
      });
    }
    expect(state.requestedDpr).toBe(1.25);
  });

  it("ignores degraded pacing until the pacing window has enough samples", () => {
    let state = initialAdaptiveDprState(1.25);
    const stats = { averageMs: 9, count: 48, p90Ms: 9 };
    const framePacing = { p90Ms: 30, sampleCount: ADAPTIVE_DPR_PACING_MIN_SAMPLES - 1 };

    for (let index = 0; index < 20; index += 1) {
      state = resolveAdaptiveDprState({
        framePacing,
        maximumRequestedDpr: 2,
        state,
        stats,
      });
    }
    expect(state.requestedDpr).toBeGreaterThan(1.25);
  });

  it("keeps the JS-bound governor paths unchanged when pacing is healthy", () => {
    // Downshift: draw p90 over budget with healthy pacing still steps down.
    let downState = initialAdaptiveDprState(2);
    const slowDrawStats = { averageMs: 20, count: 48, p90Ms: 20 };
    const healthyPacing = { p90Ms: 16, sampleCount: 120 };
    for (let index = 0; index < 4; index += 1) {
      downState = resolveAdaptiveDprState({
        framePacing: healthyPacing,
        maximumRequestedDpr: 2,
        state: downState,
        stats: slowDrawStats,
      });
    }
    expect(downState.requestedDpr).toBe(2 - ADAPTIVE_DPR_STEP);

    // Upshift: stable headroom with healthy pacing still steps up.
    let upState = initialAdaptiveDprState(1.25);
    const fastDrawStats = { averageMs: 9, count: 48, p90Ms: 9 };
    for (let index = 0; index < 20; index += 1) {
      upState = resolveAdaptiveDprState({
        framePacing: healthyPacing,
        maximumRequestedDpr: 2,
        state: upState,
        stats: fastDrawStats,
      });
    }
    expect(upState.requestedDpr).toBeGreaterThan(1.25);
  });
});
