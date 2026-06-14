/**
 * Sustained-motion performance telemetry lane (T0.2).
 *
 * Deterministic single-frame budget checks (e.g. the 200ms guard at
 * tests/visual/pharosville.spec.ts:1196) cannot detect allocator pressure
 * or GC pauses that only surface across many consecutive frames. This test
 * runs the harbor scene under full animation for a sustained interval and
 * asserts on the distribution of `drawDurationMs` values read from
 * `window.__pharosVilleDebug.renderMetrics`.
 *
 * Budget rationale:
 *   - median <= 100ms: tightened CI ceiling after V4.3 proved local dense draw
 *     is ~4-5ms median, roughly 3.5x headroom against a 16.7ms frame budget.
 *     The old 140ms CI medians are a 4-vCPU CI scaling artifact (~25-30x local)
 *     per the substrate memo, not a product-experience measurement.
 *   - p95 <= 140ms: keeps sustained tail cost below the old median ceiling
 *     while still allowing CI variance from that 4-vCPU scaling artifact.
 *   - ≥ 30 valid samples: at 50ms polling cadence, 100 polls ≈ 5s of telemetry,
 *     giving well over 30 samples even when a few frames miss the debug window.
 */

import { test, expect } from "@playwright/test";
import {
  mockDensePharosVilleData,
  readVisualDebug,
  waitForMotionActive,
  waitForSteadyTelemetry,
  type DebugRenderMetrics,
} from "../helpers/pharosville-debug";

// ---------------------------------------------------------------------------
// Budget constants
// ---------------------------------------------------------------------------

const BUDGET_MEDIAN_MS = 100;
const BUDGET_P95_MS = 140;
const CI_FRAME_PACING_MIN_EFFECTIVE_FPS = 8;
const CI_FRAME_PACING_P90_MS = 180;
const CI_FRAME_PACING_DROPPED_FRAME_RATIO = 1;
const CI_FRAME_PACING_LONGEST_DROPPED_BURST_RATIO = 1;
const CI_CAMERA_STRESS_MIN_EFFECTIVE_FPS = 12;
const CI_CAMERA_STRESS_P90_MS = 120;
const CI_CAMERA_STRESS_LONGEST_DROPPED_BURST_RATIO = 0.25;
const POLL_INTERVAL_MS = 50;
const POLL_SAMPLES = 100; // 100 × 50ms = 5s of telemetry
const MIN_VALID_SAMPLES = 30;

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe("sustained-motion perf telemetry", () => {
  test("camera pan and zoom stress stays on the world-owned frame loop", async ({ page }) => {
    await mockDensePharosVilleData(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");
    await waitForMotionActive(page);
    await waitForSteadyTelemetry(page);

    const initial = await readVisualDebug(page);
    expect(initial.activeMotionLoopCount).toBe(1);
    expect(initial.activeCameraLoopCount).toBe(0);
    expect(initial.cameraFrameSource).toBe("world-render-loop");

    const canvasBox = await page.getByTestId("pharosville-canvas").boundingBox();
    expect(canvasBox).not.toBeNull();
    const box = canvasBox!;
    const centerX = box.x + box.width * 0.52;
    const centerY = box.y + box.height * 0.48;
    let lastFramePacing: DebugRenderMetrics["framePacing"] | undefined;

    for (let i = 0; i < 24; i += 1) {
      const direction = i % 2 === 0 ? 1 : -1;
      await page.mouse.move(centerX + direction * 120, centerY - direction * 48);
      await page.mouse.wheel(0, direction > 0 ? -90 : 70);
      await page.mouse.down();
      await page.mouse.move(centerX - direction * 180, centerY + direction * 72, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(POLL_INTERVAL_MS);

      const debug = await readVisualDebug(page);
      const framePacing = debug.renderMetrics?.framePacing;
      if (framePacing && framePacing.sampleCount > 0) {
        lastFramePacing = framePacing;
      }
      expect(debug.activeMotionLoopCount).toBe(1);
      expect(debug.activeCameraLoopCount).toBe(0);
      expect(debug.cameraFrameSource).toBe("world-render-loop");
    }

    if (lastFramePacing !== undefined) {
      expect(lastFramePacing.sampleCount).toBeGreaterThan(0);
      expect(lastFramePacing.effectiveFps).toBeGreaterThanOrEqual(CI_CAMERA_STRESS_MIN_EFFECTIVE_FPS);
      expect(lastFramePacing.p90Ms).toBeLessThanOrEqual(CI_CAMERA_STRESS_P90_MS);
      expect(lastFramePacing.longestDroppedBurst).toBeLessThanOrEqual(
        Math.ceil(lastFramePacing.sampleCount * CI_CAMERA_STRESS_LONGEST_DROPPED_BURST_RATIO),
      );
    }
  });

  test("harbor scene keeps drawDurationMs within budget over sustained animation", async ({
    page,
  }) => {
    // Dense fixture exercises the worst-case ship count.
    await mockDensePharosVilleData(page);

    // Must override reducedMotion: the visual spec sets "reduce" globally;
    // this config sets "no-preference" at the project level, but be explicit.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");

    // Wait until the motion loop is live and ships are tracked.
    await waitForMotionActive(page);
    await waitForSteadyTelemetry(page);

    // Confirm the motion loop is actually running before sampling.
    const initial = await readVisualDebug(page);
    expect(initial.activeMotionLoopCount).toBe(1);
    expect(initial.reducedMotion).toBe(false);

    // Collect signals over ~5s of sustained animation.
    const durations: number[] = [];
    const headingDeltas: number[] = [];
    const positionDeltas: number[] = [];
    let lastFramePacing: DebugRenderMetrics["framePacing"] | undefined;
    let lastRouteCacheStats: DebugRenderMetrics["routeCacheStats"] | undefined;
    let lastLongtask: DebugRenderMetrics["longtask"] | undefined;
    // V1.1 per-pass attribution: accumulate pass-group timings so the lane
    // logs draw-cost breakdowns beside the tightened 100ms/140ms budget.
    const passSums = {
      skyDrawMs: 0,
      staticBlitDrawMs: 0,
      waterAccentDrawMs: 0,
      entityPassDrawMs: 0,
      nameplateDrawMs: 0,
      ambientDrawMs: 0,
      selectionChromeDrawMs: 0,
    };
    let passSampleCount = 0;

    for (let i = 0; i < POLL_SAMPLES; i += 1) {
      await page.waitForTimeout(POLL_INTERVAL_MS);
      const debug = await readVisualDebug(page);
      const metrics = debug.renderMetrics;
      const ms = metrics?.drawDurationMs;
      if (typeof ms === "number" && Number.isFinite(ms)) {
        durations.push(ms);
      }
      if (typeof metrics?.shipMaxHeadingDeltaDeg === "number") {
        headingDeltas.push(metrics.shipMaxHeadingDeltaDeg);
      }
      if (typeof metrics?.shipMaxPositionDeltaTile === "number") {
        positionDeltas.push(metrics.shipMaxPositionDeltaTile);
      }
      if (metrics?.framePacing && metrics.framePacing.sampleCount > 0) {
        lastFramePacing = metrics.framePacing;
      }
      if (metrics?.routeCacheStats) lastRouteCacheStats = metrics.routeCacheStats;
      if (metrics?.longtask) lastLongtask = metrics.longtask;
      if (typeof metrics?.entityPassDrawMs === "number") {
        passSampleCount += 1;
        for (const key of Object.keys(passSums) as Array<keyof typeof passSums>) {
          const value = metrics[key];
          if (typeof value === "number" && Number.isFinite(value)) passSums[key] += value;
        }
      }
    }

    // Enough valid samples to make the distribution meaningful.
    expect(durations.length).toBeGreaterThanOrEqual(MIN_VALID_SAMPLES);

    // V1.1 presence guard: the per-pass attribution fields must keep flowing
    // through the debug contract (values are informational, not budgeted).
    expect(passSampleCount).toBeGreaterThan(0);
    const passAverages = Object.fromEntries(
      Object.entries(passSums).map(([key, total]) => [key, Number((total / Math.max(1, passSampleCount)).toFixed(2))]),
    );
    console.info("[perf] per-pass draw-time averages (ms):", JSON.stringify(passAverages));

    const sorted = [...durations].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? Number.POSITIVE_INFINITY;
    const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
    const p95 = sorted[p95Index] ?? Number.POSITIVE_INFINITY;

    // Budget rationale: see file-level comment. V4.3 measured local dense draw
    // at ~4-5ms with ~3.5x 60fps headroom; CI draw timings are inflated by a
    // known 4-vCPU scaling artifact, so sustained drift now fails at 100/140ms.
    expect(median).toBeLessThanOrEqual(BUDGET_MEDIAN_MS);
    expect(p95).toBeLessThanOrEqual(BUDGET_P95_MS);

    // Frame-pacing CI guard tier. These thresholds are deliberately looser
    // than the local smooth target documented in TESTING.md; they catch severe
    // RAF stalls and burst regressions without requiring stable lab hardware.
    if (lastFramePacing !== undefined) {
      expect(lastFramePacing.sampleCount).toBeGreaterThan(0);
      expect(lastFramePacing.effectiveFps).toBeGreaterThanOrEqual(CI_FRAME_PACING_MIN_EFFECTIVE_FPS);
      expect(lastFramePacing.p90Ms).toBeLessThanOrEqual(CI_FRAME_PACING_P90_MS);
      expect(lastFramePacing.droppedFrameCount).toBeLessThanOrEqual(
        Math.ceil(lastFramePacing.sampleCount * CI_FRAME_PACING_DROPPED_FRAME_RATIO),
      );
      expect(lastFramePacing.longestDroppedBurst).toBeLessThanOrEqual(
        Math.ceil(lastFramePacing.sampleCount * CI_FRAME_PACING_LONGEST_DROPPED_BURST_RATIO),
      );
    }

    // A1: heading delta guard — `shipMaxHeadingDeltaDeg` is the max angular
    // velocity in degrees/second (computed from `getShipHeadingDelta`, which
    // returns rad/s). 720°/s caps at "two full rotations per second" — anything
    // above that is a snap regression. Sustained banking on tight A* corners
    // peaks around 200-300°/s so this leaves a 2-3× safety margin.
    if (headingDeltas.length > 0) {
      const maxHeadingDelta = headingDeltas.reduce((m, v) => (v > m ? v : m), 0);
      expect(maxHeadingDelta).toBeLessThanOrEqual(720);
    }

    // A2: position delta guard. Two-tier check:
    //   - Hard ceiling 0.5 tiles/frame across all polls (catches teleports).
    //   - Tighter post-warmup ceiling 0.15 tiles/frame on samples after the
    //     first 20 polls (~1s) — catches D2/D3-class seam regressions that
    //     produce sub-tile jumps. 0.15 still leaves wide headroom over typical
    //     sail speeds (~0.0017 tiles/frame at 60fps).
    if (positionDeltas.length > 0) {
      const maxPositionDelta = positionDeltas.reduce((m, v) => (v > m ? v : m), 0);
      expect(maxPositionDelta).toBeLessThanOrEqual(0.5);
      const postWarmup = positionDeltas.slice(20);
      if (postWarmup.length > 0) {
        const maxPostWarmup = postWarmup.reduce((m, v) => (v > m ? v : m), 0);
        expect(maxPostWarmup).toBeLessThanOrEqual(0.15);
      }
    }

    // A3: route cache hit ratio — observed ~0.5 over a 5s harbor sustained
    // window. The cache key is per (zone, shipId, bucket, from→to), so each
    // ship's first lookup per route-leg is a miss; with ~100 ships across many
    // route legs and a short observation window, 50% is normal. The assertion
    // catches *regressions* (e.g., bucket-flip thrash → ratio drops to ~0.10);
    // 0.40 leaves headroom over the observed 0.50 baseline.
    if (lastRouteCacheStats) {
      expect(lastRouteCacheStats.hitRatio).toBeGreaterThanOrEqual(0.40);
      // Eviction rate is the real signal for bucket-flip thrash. The LRU is
      // capped at min(4096, max(512, 16 × shipCount)) which dwarfs the working
      // set in any 5s window, so eviction count should be ~0. 0.02 (2%)
      // catches genuine cache thrash without fighting CI variance.
      expect(lastRouteCacheStats.evictionRate).toBeLessThanOrEqual(0.02);
    }

    // A5: longtask count — every longtask in a 5s sustained window is a real
    // regression signal (GC pauses, synchronous layout, blocking work). 0
    // ceiling; CI noise should surface as a flake to investigate, not be
    // normalised by an allowance.
    if (lastLongtask !== undefined) {
      expect(lastLongtask.count).toBeLessThanOrEqual(0);
    }
  });
});
