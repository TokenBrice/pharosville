import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  canViewportShowMap,
  MIN_LONG_SIDE_PX,
  MIN_SHORT_SIDE_PX,
  MIN_WIDE_LONG_SIDE_PX,
  MIN_WIDE_SHORT_SIDE_PX,
} from "../../src/systems/viewport-gate";
import {
  denyPharosVilleViewportGatedRequests,
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

type VisualLane = "accessibility" | "dom" | "motion" | "static";
type ViewportSize = { height: number; width: number };

const visualLaneTags: Record<VisualLane, string> = {
  accessibility: "@visual-accessibility",
  // GPU-free: everything this test asserts is DOM. The CI runners have no GPU
  // — Firefox in the playwright container gets no WebGL context at all — so
  // this is the lane CI can actually prove. See TESTING.md.
  dom: "@visual-dom",
  motion: "@visual-motion",
  static: "@visual-static",
};

function visualLane(lane: VisualLane, title: string): [string, { tag: string }] {
  return [title, { tag: visualLaneTags[lane] }];
}

function rectsOverlap(
  left: { height: number; width: number; x: number; y: number },
  right: { height: number; width: number; x: number; y: number },
): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function expectRectInsideViewport(
  rect: { height: number; width: number; x: number; y: number },
  viewport: ViewportSize,
): void {
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
  expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
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

test(...visualLane("dom", "a capable screen with one blocked viewport dimension requests no world runtime"), async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const deniedRequests = await denyPharosVilleViewportGatedRequests(page);
  await mockScreenSize(page, 2560, 1440);
  await page.setViewportSize({
    width: MIN_SHORT_SIDE_PX,
    height: MIN_SHORT_SIDE_PX,
  });
  await installWallClockOverride(page, 12);
  await page.goto("/");

  expect(canViewportShowMap(MIN_SHORT_SIDE_PX, MIN_SHORT_SIDE_PX)).toBe(false);
  await expect(page.getByRole("heading", { name: "PharosVille", exact: true, level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "PharosVille", exact: true, level: 2 })).toBeVisible();
  await expect(page.getByText(/Your device can show the interactive garden/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pharos analytics" })).toBeVisible();
  await expect(page.getByTestId("pharosville-canvas")).toHaveCount(0);
  expect(deniedRequests).toEqual([]);
});

test(...visualLane("static", "active runtime chrome fits laptop, tall, standard, and ultrawide viewports"), async ({
  page,
}) => {
  const viewports = [
    {
      height: MIN_WIDE_SHORT_SIDE_PX,
      name: "1200px-wide laptop",
      width: MIN_WIDE_LONG_SIDE_PX,
    },
    {
      height: MIN_LONG_SIDE_PX,
      name: "standard first passing",
      width: MIN_SHORT_SIDE_PX,
    },
    { height: 1000, name: "tall desktop", width: 720 },
    { height: 1000, name: "standard desktop", width: 1440 },
    { height: 720, name: "compact landscape", width: 900 },
    { height: 720, name: "ultrawide desktop", width: 2560 },
  ] as const;
  for (const viewport of viewports) {
    expect(
      canViewportShowMap(viewport.width, viewport.height),
      `${viewport.name} must remain admitted by the shared size predicate`,
    ).toBe(true);
  }

  await mockDensePharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockScreenSize(page, MIN_WIDE_LONG_SIDE_PX, MIN_WIDE_SHORT_SIDE_PX);
  await page.setViewportSize(viewports[0]);
  await installWallClockOverride(page, 12);
  await page.goto("/?debug=1#sel=ship.satusd-river&t=12");

  for (const { name, ...viewport } of viewports) {
    await page.setViewportSize(viewport);
    const canvas = page.getByTestId("pharosville-canvas");
    await expect(canvas, `${name}: lazy world runtime mounted`).toHaveAttribute(
      "data-renderer-status",
      "ready",
    );
    await waitForRuntimeDebug(page, true);
    await expect(page.getByTestId("pharosville-detail-panel"), `${name}: selected panel`)
      .toBeVisible();

    await expect.poll(async () => {
      const box = await canvas.boundingBox();
      return box && {
        height: Math.round(box.height),
        width: Math.round(box.width),
        x: Math.round(box.x),
        y: Math.round(box.y),
      };
    }, { message: `${name}: canvas fills the admitted viewport` }).toEqual({
      height: viewport.height,
      width: viewport.width,
      x: 0,
      y: 0,
    });

    const explore = page.getByRole("button", { name: "Explore harbor controls" });
    if (await explore.getAttribute("aria-expanded") === "false") await explore.click();
    await expect(page.getByTestId("pharosville-world-controls")).toHaveAttribute("data-expanded", "true");
    const caption = await page.getByTestId("pharosville-now-caption").boundingBox();
    const controls = await page.getByTestId("pharosville-world-controls").boundingBox();
    const panel = await page.getByTestId("pharosville-detail-panel").boundingBox();
    expect(caption, `${name}: now caption box`).not.toBeNull();
    expect(controls, `${name}: controls box`).not.toBeNull();
    expect(panel, `${name}: detail panel box`).not.toBeNull();
    expectRectInsideViewport(caption!, viewport);
    expectRectInsideViewport(controls!, viewport);
    expectRectInsideViewport(panel!, viewport);
    expect(
      rectsOverlap(caption!, controls!),
      `${name}: caption ${JSON.stringify(caption)} and controls ${JSON.stringify(controls)} must remain separate`,
    ).toBe(false);
  }
});

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

  const closeDetails = page.getByRole("button", { name: "Close details" });

  for (const state of states) {
    // There is no "Set session hour" slider and there has not been one for a
    // while — this test waited 180s for a control that does not exist, so the
    // whole dist visual lane has been red. The supported way to set the hour is
    // the `t` param, which `openWorld` already uses and which `npm run preview`
    // drives too, so each state simply reopens the world.
    const canvas = await openWorld(page, state);
    if (await closeDetails.isVisible()) await closeDetails.click();
    await expect.poll(async () => (await readRuntimeSnapshot(page)).wallClockHour)
      .toBeCloseTo(state.hour, 1);

    if (state.reducedMotion) {
      const runtime = await readRuntimeSnapshot(page);
      expect(runtime.activeMotionLoopCount).toBe(0);
      expect(runtime.motionClockSource).toBe("reduced-motion-static-frame");
      expect(runtime.timeSeconds).toBe(0);
      // Stroll is reader-driven in every motion mode, including a direct
      // station cut under reduced motion. It must remain keyboard reachable.
      await page.getByRole("button", { name: "Explore harbor controls" }).click();
      await expect(page.getByRole("button", { name: "Stroll", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible();
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

test(...visualLane("accessibility", "Stroll preserves accessible, interruptible station and detail access"), async ({
  page,
}) => {
  await openWorld(page, { hour: 12, reducedMotion: false });
  const closeDetails = page.getByRole("button", { name: "Close details" });
  if (await closeDetails.isVisible()) await closeDetails.click();
  const homeCamera = (await readVisualDebug(page)).camera;
  const controls = page.getByTestId("pharosville-world-controls");
  await page.getByRole("button", { name: "Explore harbor controls" }).click();
  await expect(controls).toHaveAttribute("data-expanded", "true");

  const station = controls.getByRole("status");
  const next = controls.getByRole("button", { name: "Next", exact: true });
  const previous = controls.getByRole("button", { name: "Previous", exact: true });
  const stroll = controls.getByRole("button", { name: "Stroll", exact: true });
  await expect(stroll).toHaveAttribute("aria-keyshortcuts", "W");
  await stroll.focus();
  await page.keyboard.press("Enter");
  await expect(station).toHaveText(/\S/);
  await expect(next).toBeVisible();
  await expect(previous).toBeVisible();
  const firstStation = await station.textContent();

  // Escape interrupts travel where it is displayed, not by forcing Home.
  await next.focus();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(50);
  const interruptedCamera = (await readVisualDebug(page)).camera;
  await page.waitForTimeout(600);
  expect((await readVisualDebug(page)).camera).toEqual(interruptedCamera);
  await expect(station).toHaveText(firstStation!);

  // Reduced motion cuts directly, and the six manual stations never advance
  // on a timer. Previous reverses Next without losing its station readout.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(async () => (await readRuntimeSnapshot(page)).reducedMotion).toBe(true);
  const stations = new Set([firstStation]);
  for (let step = 0; step < 5; step += 1) {
    const before = await station.textContent();
    await next.click();
    await expect(station).not.toHaveText(before!);
    stations.add(await station.textContent());
  }
  expect(stations.size).toBe(6);
  await next.click();
  await expect(station).toHaveText(firstStation!);
  await next.click();
  const secondStation = await station.textContent();
  await previous.click();
  await expect(station).toHaveText(firstStation!);
  await next.click();
  await expect(station).toHaveText(secondStation!);
  const stationCamera = (await readVisualDebug(page)).camera;
  await page.waitForTimeout(600);
  await expect(station).toHaveText(secondStation!);
  expect((await readVisualDebug(page)).camera).toEqual(stationCamera);
  expect((await readRuntimeSnapshot(page)).activeMotionLoopCount).toBe(0);

  // Keyboard inspection opens focused facts, then Escape restores the saved
  // station-local viewpoint. Only Home returns to the garden seat.
  await page.getByTestId("pharosville-world").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  const detail = page.getByTestId("pharosville-detail-panel");
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("heading", { level: 2 })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect.poll(async () => (await readVisualDebug(page)).camera).toEqual(stationCamera);
  await expect(station).toHaveText(secondStation!);
  await controls.getByRole("button", { name: "Home", exact: true }).click();
  await expect(station).toHaveCount(0);
  await expect(stroll).toBeVisible();
  await expect.poll(async () => (await readVisualDebug(page)).camera).toEqual(homeCamera);
});

test(...visualLane("static", "a WebGL context that comes back keeps the world"), async ({ page }) => {
  const canvas = await openWorld(page, { hour: 12, reducedMotion: true });
  // Context loss is usually a transient driver/GPU-process blip, and the
  // browser hands the context straight back. The world must ride that out
  // rather than retiring itself to the DOM overview for the session.
  const restored = await canvas.evaluate(async (element) => {
    const target = element as HTMLCanvasElement;
    const context = target.getContext("webgl2") ?? target.getContext("webgl");
    const extension = context?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    extension.loseContext();
    await new Promise((resolve) => setTimeout(resolve, 200));
    extension.restoreContext();
    return true;
  });
  expect(restored).toBe(true);

  await expect(canvas).toHaveAttribute("data-renderer-status", "ready");
  await expect(page.getByTestId("pharosville-renderer-fallback")).toHaveCount(0);
  await expect(canvas).toBeVisible();
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

  // The fallback lands only after the restore grace period expires — a
  // permanent loss falls back, a transient one does not (test above).
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

test(...visualLane("dom", "a browser that cannot render the world still gets the whole signal"), async ({ page }) => {
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

  // This is the lane CI gates on, so it has to prove the whole contract a
  // visitor without WebGL is owed — not merely that something rendered.
  //
  // The ledger is the analytical surface of record: every named water, every
  // ship with its placement and evidence, every dock. If a renderer change ever
  // moves meaning into WebGL alone, this is what catches it.
  const ledger = page.getByTestId("pharosville-accessibility-ledger");
  await expect(ledger).toContainText("Named areas");
  await expect(ledger).toContainText("Calm Anchorage");
  await expect(ledger).toContainText("Danger Strait");
  await expect(ledger).toContainText("Tether");
  await expect(ledger).toContainText("risk water");
  await expect(ledger).toContainText("placement evidence");

  // Detail access, by pointer and by keyboard, with panel parity.
  await fallback.getByRole("button", { name: "Open Lighthouse details" }).click();
  const detailPanel = page.getByTestId("pharosville-detail-panel");
  await expect(detailPanel).toContainText(/Pharos lighthouse/i);
  await expect(detailPanel.getByRole("heading", { level: 2 })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(detailPanel).toHaveCount(0);

  // The live region carries announcements to a screen reader.
  await expect(page.locator("p.sr-only[aria-live='polite']")).toHaveCount(1);
});
