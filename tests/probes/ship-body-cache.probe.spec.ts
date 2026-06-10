/**
 * Measurement probe (not a CI lane — see playwright.probe.config.ts):
 * ship-body precompose cache behaviour on the dense fixture. Reports
 * steady-state hit rate, entry/pixel occupancy vs caps, and eviction churn
 * across warmup → steady → zoomed phases. Grounds the V4.2 cap-tuning
 * decision in agents/2026-06-10-visual-upgrade-effort-reward.md.
 */

import { test, expect } from "@playwright/test";
import {
  mockDensePharosVilleData,
  readVisualDebug,
  waitForMotionActive,
  waitForSteadyTelemetry,
} from "../helpers/pharosville-debug";

type CacheStats = NonNullable<
  NonNullable<Awaited<ReturnType<typeof readVisualDebug>>["renderMetrics"]>["shipBodyCacheStats"]
>;

async function readCacheStats(page: import("@playwright/test").Page): Promise<CacheStats | null> {
  const debug = await readVisualDebug(page);
  return debug.renderMetrics?.shipBodyCacheStats ?? null;
}

function describeWindow(label: string, start: CacheStats, end: CacheStats) {
  const hits = end.hitCount - start.hitCount;
  const misses = end.missCount - start.missCount;
  const evictions = end.evictionCount - start.evictionCount;
  const budgetSkips = end.budgetSkipCount - start.budgetSkipCount;
  const lookups = hits + misses;
  const summary = {
    budgetSkips,
    entryCount: end.entryCount,
    evictions,
    hitRate: lookups > 0 ? Number((hits / lookups).toFixed(4)) : null,
    hits,
    maxEntries: end.maxEntries,
    misses,
    pixelCount: end.pixelCount,
    pixelFillRatio: Number((end.pixelCount / end.maxPixels).toFixed(4)),
  };
  console.info(`[v4.2-probe] ${label}: ${JSON.stringify(summary)}`);
  return summary;
}

test.describe("V4.2 probe: ship-body cache stats", () => {
  test("dense fixture cache hit-rate and occupancy across warmup/steady/zoom", async ({ page }) => {
    test.setTimeout(180_000);
    await mockDensePharosVilleData(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");
    await waitForMotionActive(page);

    // Warmup window: from first telemetry until steady (deferred assets in).
    const atMotionActive = await readCacheStats(page);
    expect(atMotionActive).not.toBeNull();
    await waitForSteadyTelemetry(page);
    const atSteadyStart = await readCacheStats(page);
    expect(atSteadyStart).not.toBeNull();
    describeWindow("warmup", atMotionActive!, atSteadyStart!);

    // Steady window: 10s of sustained animation at fit zoom.
    await page.waitForTimeout(10_000);
    const atSteadyEnd = await readCacheStats(page);
    expect(atSteadyEnd).not.toBeNull();
    const steady = describeWindow("steady-10s", atSteadyStart!, atSteadyEnd!);

    // Zoomed window: deep zoom (different drawScale, same cache keys
    // expected — keys are zoom-independent by design) + 10s sustained.
    const canvasBox = await page.getByTestId("pharosville-canvas").boundingBox();
    expect(canvasBox).not.toBeNull();
    const centerX = canvasBox!.x + canvasBox!.width * 0.5;
    const centerY = canvasBox!.y + canvasBox!.height * 0.5;
    for (let i = 0; i < 12; i += 1) {
      await page.evaluate(({ x, y }) => {
        const canvas = document.querySelector('[data-testid="pharosville-canvas"]');
        canvas?.dispatchEvent(new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          deltaMode: 0,
          deltaY: -320,
        }));
      }, { x: centerX, y: centerY });
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(1_500);
    const atZoomStart = await readCacheStats(page);
    await page.waitForTimeout(10_000);
    const atZoomEnd = await readCacheStats(page);
    expect(atZoomStart).not.toBeNull();
    expect(atZoomEnd).not.toBeNull();
    const zoomed = describeWindow("zoom-10s", atZoomStart!, atZoomEnd!);

    // Informational: a steady-state hit rate this low would mean key churn.
    expect(steady.hitRate ?? 1).toBeGreaterThan(0.5);
    expect(zoomed.hitRate ?? 1).toBeGreaterThan(0.5);
  });
});
