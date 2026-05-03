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
 *   - median ≤ 140ms: current 4-vCPU CI ceiling after removing single-sample
 *     variance (commit 67bc711 raised the snapshot guard to 200ms precisely to
 *     absorb one-off spikes; 140ms median leaves room for that without masking
 *     sustained regressions).
 *   - p95 ≤ 200ms: matches the existing snapshot-test ceiling so any sustained
 *     drift that would trip the snapshot test also trips this lane.
 *   - ≥ 30 valid samples: at 50ms polling cadence, 100 polls ≈ 5s of telemetry,
 *     giving well over 30 samples even when a few frames miss the debug window.
 *
 * After T1.4/T1.3/T2.x land and CI proves stable below these ceilings, the
 * operator should tighten: median → 100ms, p95 → 140ms (reverting the spirit
 * of commit 67bc711). This comment is the authoritative pointer for that work.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureReportCards,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureStability,
} from "../../src/__fixtures__/pharosville-world";
import { PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY } from "@shared/lib/pharosville-api-endpoints";

// ---------------------------------------------------------------------------
// Types (duplicated from the visual spec to avoid coupling test suites)
// ---------------------------------------------------------------------------

type DebugRenderMetrics = {
  drawableCount: number;
  drawableCounts: { body: number; overlay: number; selection: number; underlay: number };
  drawDurationMs: number;
  movingShipCount: number;
  visibleShipCount: number;
  visibleTileCount: number;
  shipMaxHeadingDeltaDeg?: number;
  shipMaxPositionDeltaTile?: number;
  routeCacheStats?: { hitRatio: number; evictionRate: number; size: number; capacity: number };
  longtask?: { count: number; maxDurationMs: number };
};

type PharosVilleVisualDebug = {
  activeMotionLoopCount?: number;
  animationFramePending?: boolean;
  camera?: unknown;
  criticalAssetsLoaded?: boolean;
  motionFrameCount?: number;
  reducedMotion?: boolean;
  renderMetrics?: DebugRenderMetrics;
  shipMotionSamples?: unknown[];
  targets?: { kind: string }[];
};

// ---------------------------------------------------------------------------
// Helpers (minimal — not shared with visual spec to avoid rippling refactors)
// ---------------------------------------------------------------------------

const meta = { updatedAt: 1_700_000_000, ageSeconds: 60, status: "fresh" };

async function mockDensePharosVilleData(page: Page): Promise<void> {
  const payloads = [
    { path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.stablecoins, body: denseFixtureStablecoins },
    { path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.chains, body: denseFixtureChains },
    {
      path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.stability,
      body: {
        ...fixtureStability,
        current: {
          ...fixtureStability.current,
          band: "ELEVATED",
          components: { breadth: 26, severity: 54, trend: 12 },
          score: 72,
        },
      },
    },
    { path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.pegSummary, body: denseFixturePegSummary },
    { path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.stress, body: denseFixtureStress },
    { path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.reportCards, body: denseFixtureReportCards },
  ];

  for (const { path, body } of payloads) {
    const endpoint = new URL(path, "http://localhost");
    await page.route(
      (url) => url.pathname === endpoint.pathname && url.search === endpoint.search,
      async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ ...(body as Record<string, unknown>), _meta: meta }),
        });
      },
    );
  }
}

async function readDebug(page: Page): Promise<PharosVilleVisualDebug> {
  return page.evaluate(() => {
    const debug = (window as typeof window & { __pharosVilleDebug?: PharosVilleVisualDebug })
      .__pharosVilleDebug;
    return debug ?? {};
  });
}

async function waitForMotionActive(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const debug = (window as typeof window & { __pharosVilleDebug?: PharosVilleVisualDebug })
      .__pharosVilleDebug;
    return Boolean(
      debug?.criticalAssetsLoaded
        && debug.camera
        && debug.reducedMotion === false
        && (debug.shipMotionSamples?.length ?? 0) > 0
        && (debug.targets?.some((t) => t.kind === "ship") ?? false)
        && (debug.motionFrameCount ?? 0) >= 2,
    );
  });
}

// ---------------------------------------------------------------------------
// Budget constants
// ---------------------------------------------------------------------------

const BUDGET_MEDIAN_MS = 140;
const BUDGET_P95_MS = 200;
const POLL_INTERVAL_MS = 50;
const POLL_SAMPLES = 100; // 100 × 50ms = 5s of telemetry
const MIN_VALID_SAMPLES = 30;

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe("sustained-motion perf telemetry", () => {
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

    // Confirm the motion loop is actually running before sampling.
    const initial = await readDebug(page);
    expect(initial.activeMotionLoopCount).toBe(1);
    expect(initial.reducedMotion).toBe(false);

    // Collect signals over ~5s of sustained animation.
    const durations: number[] = [];
    const headingDeltas: number[] = [];
    const positionDeltas: number[] = [];
    let lastRouteCacheStats: DebugRenderMetrics["routeCacheStats"] | undefined;
    let lastLongtask: DebugRenderMetrics["longtask"] | undefined;

    for (let i = 0; i < POLL_SAMPLES; i += 1) {
      await page.waitForTimeout(POLL_INTERVAL_MS);
      const debug = await readDebug(page);
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
      if (metrics?.routeCacheStats) lastRouteCacheStats = metrics.routeCacheStats;
      if (metrics?.longtask) lastLongtask = metrics.longtask;
    }

    // Enough valid samples to make the distribution meaningful.
    expect(durations.length).toBeGreaterThanOrEqual(MIN_VALID_SAMPLES);

    const sorted = [...durations].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? Number.POSITIVE_INFINITY;
    const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
    const p95 = sorted[p95Index] ?? Number.POSITIVE_INFINITY;

    // Budget rationale: see file-level comment.
    // To tighten after Phase 1/2/3 land: lower BUDGET_MEDIAN_MS → 100,
    // BUDGET_P95_MS → 140, and update the ci-budget note in 67bc711.
    expect(median).toBeLessThanOrEqual(BUDGET_MEDIAN_MS);
    expect(p95).toBeLessThanOrEqual(BUDGET_P95_MS);

    // A1: heading delta guard — `shipMaxHeadingDeltaDeg` is the max angular
    // velocity in degrees/second (computed from `getShipHeadingDelta`, which
    // returns rad/s). 720°/s caps at "two full rotations per second" — anything
    // above that is a snap regression. Sustained banking on tight A* corners
    // peaks around 200-300°/s so this leaves a 2-3× safety margin.
    if (headingDeltas.length > 0) {
      const maxHeadingDelta = headingDeltas.reduce((m, v) => (v > m ? v : m), 0);
      expect(maxHeadingDelta).toBeLessThanOrEqual(720);
    }

    // A2: position delta guard — no ship should jump more than 0.5 tiles/frame.
    if (positionDeltas.length > 0) {
      const maxPositionDelta = positionDeltas.reduce((m, v) => (v > m ? v : m), 0);
      expect(maxPositionDelta).toBeLessThanOrEqual(0.5);
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
