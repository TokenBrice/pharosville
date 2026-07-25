import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  installWallClockOverride,
  mockDensePharosVilleData,
  mockScreenSize,
  readRuntimeSnapshot,
  readVisualDebug,
  waitForRuntimeDebug,
} from "../helpers/pharosville-debug";

const VIEWPORT = { height: 1000, width: 1440 };
const SCREEN = { height: 1080, width: 1920 };
const EVIDENCE_DIRECTORY = "outputs/visual-gates";

type GateTelemetry = {
  framePacing: {
    effectiveFps: number;
    p90Ms: number;
    sampleCount: number;
  } | null;
  gpu: {
    calls: number;
    geometries: number;
    textures: number;
    triangles: number;
  } | null;
  longtask: {
    count: number;
    maxDurationMs: number;
  } | null;
  rendererBackend: string | null;
  timeToFirstCoherentFrameMs: number | null;
};

type VisualLane = "accessibility" | "motion" | "static";

const visualLaneTags: Record<VisualLane, string> = {
  accessibility: "@visual-accessibility",
  motion: "@visual-motion",
  static: "@visual-static",
};

function visualLane(lane: VisualLane, title: string): [string, { tag: string }] {
  return [title, { tag: visualLaneTags[lane] }];
}

async function prepareWorldPage(
  page: Page,
  options: { hour?: number; reducedMotion?: boolean } = {},
): Promise<void> {
  const hour = options.hour ?? 12;
  await mockDensePharosVilleData(page);
  await page.emulateMedia({
    reducedMotion: options.reducedMotion === false ? "no-preference" : "reduce",
  });
  await mockScreenSize(page, SCREEN.width, SCREEN.height);
  await page.setViewportSize(VIEWPORT);
  await installWallClockOverride(page, hour);
}

async function openWorld(
  page: Page,
  options: { hour?: number; reducedMotion?: boolean } = {},
): Promise<Locator> {
  const hour = options.hour ?? 12;
  const reducedMotion = options.reducedMotion !== false;
  await prepareWorldPage(page, { hour, reducedMotion });
  await page.goto(`/?debug=1&t=${hour}`);

  const canvas = page.getByTestId("pharosville-canvas");
  await expect(canvas).toHaveAttribute("data-renderer", "three");
  await expect(canvas).toHaveAttribute("data-renderer-status", "ready");
  if (reducedMotion) {
    await waitForRuntimeDebug(page, true);
  } else {
    await waitForRuntimeDebug(page, false);
  }
  await expect(page.getByTestId("pharosville-renderer-fallback")).toHaveCount(0);
  return canvas;
}

async function readGateTelemetry(page: Page): Promise<GateTelemetry> {
  return page.evaluate(() => {
    const metrics = (window as typeof window & {
      __pharosVilleDebug?: {
        renderMetrics?: {
          framePacing?: GateTelemetry["framePacing"];
          gpu?: GateTelemetry["gpu"];
          longtask?: GateTelemetry["longtask"];
          rendererBackend?: string;
          timeToFirstCoherentFrameMs?: number;
        };
      };
    }).__pharosVilleDebug?.renderMetrics;
    return {
      framePacing: metrics?.framePacing ?? null,
      gpu: metrics?.gpu ?? null,
      longtask: metrics?.longtask ?? null,
      rendererBackend: metrics?.rendererBackend ?? null,
      timeToFirstCoherentFrameMs: metrics?.timeToFirstCoherentFrameMs ?? null,
    };
  });
}

test(...visualLane("motion", "day, dusk, night, and reduced-motion states render nonblank and measurable"), async ({
  page,
}, testInfo) => {
  test.slow();
  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  const captures = new Map<string, Buffer>();
  const states = [
    { hour: 12, name: "day", reducedMotion: false },
    { hour: 18.5, name: "dusk", reducedMotion: false },
    { hour: 22, name: "night", reducedMotion: false },
    { hour: 12, name: "reduced", reducedMotion: true },
  ] as const;

  let canvas = await openWorld(page, states[0]);
  const closeDetails = page.getByRole("button", { name: "Close details" });
  if (await closeDetails.isVisible()) await closeDetails.click();

  for (const state of states) {
    // There is no "Set session hour" slider and there has not been one for a
    // while — this test waited 180s for a control that does not exist, so the
    // whole dist visual lane has been red. The supported way to set the hour is
    // the `t` param, which `openWorld` already uses and which `npm run preview`
    // drives too, so each state simply reopens the world.
    canvas = await openWorld(page, state);
    if (await closeDetails.isVisible()) await closeDetails.click();
    await expect.poll(async () => (await readRuntimeSnapshot(page)).wallClockHour)
      .toBeCloseTo(state.hour, 1);

    if (state.reducedMotion) {
      const runtime = await readRuntimeSnapshot(page);
      expect(runtime.activeMotionLoopCount).toBe(0);
      expect(runtime.motionClockSource).toBe("reduced-motion-static-frame");
      expect(runtime.timeSeconds).toBe(0);
      await expect(page.getByRole("button", { name: "Observe harbor" })).toHaveCount(0);
    } else {
      await expect.poll(async () => (
        (await readGateTelemetry(page)).framePacing?.sampleCount ?? 0
      )).toBeGreaterThanOrEqual(5);
      const before = await readRuntimeSnapshot(page);
      await page.waitForTimeout(150);
      const after = await readRuntimeSnapshot(page);
      expect(before.activeMotionLoopCount).toBe(1);
      expect(before.motionClockSource).toBe("requestAnimationFrame");
      expect(after.timeSeconds).toBeGreaterThan(before.timeSeconds);
    }

    const runtime = await readRuntimeSnapshot(page);
    expect(runtime.wallClockHour).toBeCloseTo(state.hour, 1);

    const telemetry = await readGateTelemetry(page);
    expect(telemetry.rendererBackend).toBe("three");
    expect(telemetry.gpu?.calls ?? 0).toBeGreaterThan(0);
    expect(telemetry.gpu?.geometries ?? 0).toBeGreaterThan(0);
    expect(telemetry.gpu?.triangles ?? 0).toBeGreaterThan(0);
    expect(telemetry.timeToFirstCoherentFrameMs ?? -1).toBeGreaterThanOrEqual(0);

    const capture = await canvas.screenshot();
    expect(capture.byteLength).toBeGreaterThan(10_000);
    captures.set(state.name, capture);
    await page.screenshot({
      fullPage: true,
      path: `${EVIDENCE_DIRECTORY}/garden-observatory-${state.name}-1440x1000.png`,
    });
    await writeFile(
      `${EVIDENCE_DIRECTORY}/garden-observatory-${state.name}-telemetry.json`,
      `${JSON.stringify(telemetry, null, 2)}\n`,
    );
    await testInfo.attach(`world-${state.name}`, {
      body: capture,
      contentType: "image/png",
    });
    await testInfo.attach(`world-${state.name}-telemetry`, {
      body: Buffer.from(JSON.stringify(telemetry, null, 2)),
      contentType: "application/json",
    });
  }

  expect(captures.get("day")?.equals(captures.get("dusk") ?? Buffer.alloc(0))).toBe(false);
  expect(captures.get("dusk")?.equals(captures.get("night") ?? Buffer.alloc(0))).toBe(false);
});

test(...visualLane("accessibility", "Observe and analytical DOM labels preserve accessible, interruptible detail access"), async ({
  page,
}) => {
  const canvas = await openWorld(page, { hour: 12, reducedMotion: false });
  const closeDetails = page.getByRole("button", { name: "Close details" });
  if (await closeDetails.isVisible()) {
    await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
    await page.screenshot({
      fullPage: true,
      path: `${EVIDENCE_DIRECTORY}/garden-observatory-label-detail-collision-1440x1000.png`,
    });
    await closeDetails.focus();
    await page.keyboard.press("Enter");
  }

  const labels = page.locator(".pharosville-observatory-label");
  await expect(labels.first()).toBeVisible();
  expect(await labels.count()).toBeLessThanOrEqual(2);
  await expect(labels.first()).toContainText(/ships?/i);

  const observe = page.locator("[data-observe-control]");
  await expect(observe).toBeVisible();
  await expect(observe).toHaveAttribute("aria-label", "Observe harbor");
  await observe.click();
  await expect(observe).toHaveAttribute("aria-pressed", "true");
  await expect(observe).toHaveAttribute("aria-label", "Stop observing");
  await expect(page.getByTestId("pharosville-observe-caption")).toBeVisible();

  await observe.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("pharosville-observe-caption")).toHaveCount(0);
  await expect(observe).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(50);
  const interruptedCamera = (await readVisualDebug(page)).camera;
  await page.waitForTimeout(600);
  expect((await readVisualDebug(page)).camera).toEqual(interruptedCamera);

  await observe.click();
  await expect(observe).toHaveAttribute("aria-pressed", "true");
  await observe.focus();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pharosville-observe-caption")).toHaveCount(0);
  await expect(observe).toHaveAttribute("aria-pressed", "false");

  await observe.click();
  await expect(observe).toHaveAttribute("aria-pressed", "true");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click((box?.x ?? 0) + 20, (box?.y ?? 0) + 20);
  await expect(page.getByTestId("pharosville-observe-caption")).toHaveCount(0);
  await expect(observe).toHaveAttribute("aria-pressed", "false");
  await expect(observe).toHaveAttribute("aria-label", "Observe harbor");

  await observe.click();
  await observe.focus();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(observe).toHaveCount(0);
  await expect(page.getByTestId("pharosville-observe-caption")).toHaveCount(0);
  await expect(page.getByTestId("pharosville-world")).toBeFocused();

  await labels.first().click();
  await expect(page.getByTestId("pharosville-detail-panel")).toBeVisible();
  await expect(labels).toHaveCount(0);
});

test(...visualLane("static", "a lost WebGL context presents the static signal overview"), async ({ page }) => {
  const canvas = await openWorld(page, { hour: 12, reducedMotion: true });
  const contextWasLost = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const context = target.getContext("webgl2") ?? target.getContext("webgl");
    const extension = context?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  expect(contextWasLost).toBe(true);

  const fallback = page.getByTestId("pharosville-renderer-fallback");
  await expect(fallback).toBeVisible();
  await expect(canvas).toHaveAttribute("data-renderer-status", "failed");
  await expect(canvas).toBeHidden();
  await expect(fallback.getByRole("heading", { name: "Harbor signal overview" })).toBeVisible();
  await expect(fallback.getByRole("button", { name: "Open Lighthouse details" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use standard view" })).toHaveCount(0);
  await fallback.getByRole("button", { name: "Open Lighthouse details" }).click();
  await expect(page.getByTestId("pharosville-detail-panel")).toContainText(/Pharos lighthouse/i);
});

test(...visualLane("static", "WebGL unavailability fails cleanly into the static signal overview"), async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value(contextId: string, ...args: unknown[]) {
        if (["webgl", "webgl2"].includes(contextId)) return null;
        return Reflect.apply(originalGetContext, this, [contextId, ...args]);
      },
    });
  });
  await prepareWorldPage(page, { hour: 12, reducedMotion: true });
  await page.goto("/?debug=1&t=12");

  const canvas = page.getByTestId("pharosville-canvas");
  await expect(canvas).toHaveAttribute("data-renderer", "three");
  await expect(canvas).toHaveAttribute("data-renderer-status", "failed");
  const fallback = page.getByTestId("pharosville-renderer-fallback");
  await expect(fallback).toBeVisible();
  await expect(canvas).toBeHidden();
  await expect(fallback.getByRole("heading", { name: "Harbor signal overview" })).toBeVisible();
  await expect(fallback.getByRole("button", { name: "Open Risk watch details" })).toBeVisible();
  await expect(fallback.getByRole("button", { name: "Open Weekly supply details" })).toBeVisible();
  await expect(fallback.getByRole("button", { name: "Open Dock concentration details" })).toBeVisible();
});
