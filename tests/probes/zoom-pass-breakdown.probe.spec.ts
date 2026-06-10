/**
 * Measurement probe (not a CI lane — see playwright.probe.config.ts):
 * per-pass draw-time breakdown on the dense fixture at fit zoom vs zoomed-in
 * views (~1.4 / ~2.4, matching the evidence captures in
 * outputs/f5-caustics-*.png). Grounds the V4.3 substrate memo and V4.1
 * lever-by-lever deltas in agents/2026-06-10-visual-upgrade-effort-reward.md.
 *
 * Zoom is driven by DOM-dispatched WheelEvents on the canvas: a footer HUD
 * element overlays the canvas center at this viewport, so Playwright
 * `mouse.wheel` never reaches the canvas wheel listener.
 */

import { test, expect } from "@playwright/test";
import {
  mockDensePharosVilleData,
  readVisualDebug,
  waitForMotionActive,
  waitForSteadyTelemetry,
} from "../helpers/pharosville-debug";

const SAMPLES = 50;
const POLL_MS = 50;

const PASS_KEYS = [
  "skyDrawMs",
  "staticBlitDrawMs",
  "waterAccentDrawMs",
  "entityPassDrawMs",
  "nameplateDrawMs",
  "ambientDrawMs",
  "selectionChromeDrawMs",
] as const;

type PassKey = (typeof PASS_KEYS)[number];

function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

async function samplePassBreakdown(page: import("@playwright/test").Page, label: string) {
  const passSamples = new Map<PassKey, number[]>(PASS_KEYS.map((key) => [key, []]));
  const draws: number[] = [];
  let visibleShipCount = 0;
  let nameplateDrawCount = 0;
  let zoom = 0;
  let tier: string | undefined;
  for (let i = 0; i < SAMPLES; i += 1) {
    await page.waitForTimeout(POLL_MS);
    const debug = await readVisualDebug(page);
    const metrics = debug.renderMetrics;
    if (!metrics || typeof metrics.entityPassDrawMs !== "number") continue;
    for (const key of PASS_KEYS) {
      const value = metrics[key];
      if (typeof value === "number" && Number.isFinite(value)) passSamples.get(key)?.push(value);
    }
    if (Number.isFinite(metrics.drawDurationMs)) draws.push(metrics.drawDurationMs);
    visibleShipCount = metrics.visibleShipCount;
    nameplateDrawCount = metrics.nameplateDrawCount ?? 0;
    zoom = debug.camera?.zoom ?? zoom;
    tier = (metrics as { schedulerTier?: string }).schedulerTier ?? tier;
  }
  const breakdown = Object.fromEntries(
    PASS_KEYS.map((key) => [key, Number(median(passSamples.get(key) ?? []).toFixed(3))]),
  );
  const summary = {
    drawMedianMs: Number(median(draws).toFixed(3)),
    nameplateDrawCount,
    sampleCount: draws.length,
    tier,
    visibleShipCount,
    zoom: Number(zoom.toFixed(3)),
    ...breakdown,
  };
  console.info(`[v4.3-probe] ${label}: ${JSON.stringify(summary)}`);
  return summary;
}

async function zoomTo(page: import("@playwright/test").Page, targetZoom: number) {
  const canvasBox = await page.getByTestId("pharosville-canvas").boundingBox();
  expect(canvasBox).not.toBeNull();
  const box = canvasBox!;
  const centerX = box.x + box.width * 0.5;
  const centerY = box.y + box.height * 0.5;
  await page.mouse.move(centerX, centerY);
  const under = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? `${el.tagName}#${el.id}.${(el as HTMLElement).dataset?.testid ?? ""}` : "none";
  }, { x: centerX, y: centerY });
  console.info(`[v4.3-probe] elementFromPoint(center)=${under}`);
  let lastZoom = 0;
  for (let i = 0; i < 40; i += 1) {
    const debug = await readVisualDebug(page);
    const zoom = debug.camera?.zoom ?? 0;
    if (i % 5 === 0) console.info(`[v4.3-probe] zoomTo(${targetZoom}) iter=${i} zoom=${zoom.toFixed(3)}`);
    if (zoom >= targetZoom) break;
    lastZoom = zoom;
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
    await page.waitForTimeout(150);
  }
  const settled = await readVisualDebug(page);
  console.info(`[v4.3-probe] zoomTo(${targetZoom}) done: zoom=${(settled.camera?.zoom ?? lastZoom).toFixed(3)}`);
  // Let interaction tier decay back to a load tier before sampling.
  await page.waitForTimeout(2_000);
}

test.describe("V4.3 probe: zoom pass breakdown", () => {
  test("dense fixture pass breakdown at fit / 1.4 / 2.4 zoom", async ({ page }) => {
    test.setTimeout(180_000);
    await mockDensePharosVilleData(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");
    await waitForMotionActive(page);
    await waitForSteadyTelemetry(page);

    const fit = await samplePassBreakdown(page, "fit-zoom");
    expect(fit.sampleCount).toBeGreaterThan(10);

    await zoomTo(page, 1.41);
    const mid = await samplePassBreakdown(page, "zoom-1.4");
    expect(mid.sampleCount).toBeGreaterThan(10);

    await zoomTo(page, 2.4);
    const deep = await samplePassBreakdown(page, "zoom-2.4");
    expect(deep.sampleCount).toBeGreaterThan(10);
  });
});
