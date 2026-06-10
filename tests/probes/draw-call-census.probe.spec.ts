/**
 * Measurement probe (not a CI lane — see playwright.probe.config.ts):
 * counts canvas API calls per frame on the dense fixture by wrapping
 * CanvasRenderingContext2D methods before the world mounts. Grounds the
 * V4.1 entity-pass draw-call audit (save/restore pairs, gradient and
 * fillText re-creation) in agents/2026-06-10-visual-upgrade-effort-reward.md.
 */

import { test, expect } from "@playwright/test";
import {
  mockDensePharosVilleData,
  waitForMotionActive,
  waitForSteadyTelemetry,
} from "../helpers/pharosville-debug";

const COUNTED_METHODS = [
  "save",
  "restore",
  "createLinearGradient",
  "createRadialGradient",
  "measureText",
  "fillText",
  "drawImage",
  "fill",
  "stroke",
  "setTransform",
] as const;

declare global {
  interface Window {
    __drawCallCensus?: Record<string, number>;
  }
}

test.describe("V4.1 probe: draw-call census", () => {
  test("dense fixture canvas API call counts over a 5s window", async ({ page }) => {
    test.setTimeout(120_000);
    await mockDensePharosVilleData(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.addInitScript((methods: readonly string[]) => {
      const counts: Record<string, number> = {};
      for (const method of methods) counts[method] = 0;
      (window as Window & { __drawCallCensus?: Record<string, number> }).__drawCallCensus = counts;
      const proto = CanvasRenderingContext2D.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
      for (const method of methods) {
        const original = proto[method];
        if (typeof original !== "function") continue;
        proto[method] = function wrapped(this: unknown, ...args: unknown[]) {
          counts[method] = (counts[method] ?? 0) + 1;
          return original.apply(this, args);
        };
      }
    }, COUNTED_METHODS);
    await page.goto("/");
    await waitForMotionActive(page);
    await waitForSteadyTelemetry(page);

    const frames = await censusWindow(page, "fit-zoom");
    expect(frames).toBeGreaterThan(30);

    await dispatchWheelZoom(page, -320, 12);
    await censusWindow(page, "zoom-2.4");

    await dispatchWheelZoom(page, 320, 24);
    await censusWindow(page, "zoom-0.48");
  });
});

async function censusWindow(page: import("@playwright/test").Page, label: string): Promise<number> {
  const read = () => page.evaluate(() => ({
    counts: { ...(window.__drawCallCensus ?? {}) },
    frames: (window as unknown as { __pharosVilleDebug?: { motionFrameCount?: number } }).__pharosVilleDebug?.motionFrameCount ?? 0,
    zoom: (window as unknown as { __pharosVilleDebug?: { camera?: { zoom?: number } } }).__pharosVilleDebug?.camera?.zoom ?? 0,
  }));
  const start = await read();
  await page.waitForTimeout(5_000);
  const end = await read();
  const frames = Math.max(1, end.frames - start.frames);
  const perFrame = Object.fromEntries(
    Object.entries(end.counts)
      .map(([method, total]) => [method, Number(((total - (start.counts[method] ?? 0)) / frames).toFixed(1))])
      .sort((a, b) => (b[1] as number) - (a[1] as number)),
  );
  console.info(`[v4.1-census] ${label} zoom=${end.zoom.toFixed(2)} frames=${frames} perFrame=${JSON.stringify(perFrame)}`);
  return frames;
}

async function dispatchWheelZoom(page: import("@playwright/test").Page, deltaY: number, steps: number): Promise<void> {
  const canvasBox = await page.getByTestId("pharosville-canvas").boundingBox();
  expect(canvasBox).not.toBeNull();
  const centerX = canvasBox!.x + canvasBox!.width * 0.5;
  const centerY = canvasBox!.y + canvasBox!.height * 0.5;
  for (let i = 0; i < steps; i += 1) {
    await page.evaluate(({ x, y, delta }) => {
      const canvas = document.querySelector('[data-testid="pharosville-canvas"]');
      canvas?.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        deltaMode: 0,
        deltaY: delta,
      }));
    }, { x: centerX, y: centerY, delta: deltaY });
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(2_000);
}
