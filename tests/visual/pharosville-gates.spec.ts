import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  canViewportShowMap,
  MIN_LONG_SIDE_PX,
  MIN_SHORT_SIDE_PX,
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
  await expect(page.getByText("Give the harbor more room.")).toBeVisible();
  await expect(page.getByTestId("pharosville-canvas")).toHaveCount(0);
  expect(deniedRequests).toEqual([]);
});

test(...visualLane("static", "active runtime chrome fits the first passing, tall, standard, and ultrawide viewports"), async ({
  page,
}) => {
  const viewports = [
    {
      height: MIN_LONG_SIDE_PX,
      name: "first passing",
      width: MIN_SHORT_SIDE_PX,
    },
    { height: 1000, name: "tall desktop", width: 720 },
    { height: 1000, name: "standard desktop", width: 1440 },
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
  await mockScreenSize(page, 2560, 1440);
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

    const footer = await page.locator(".pharosville-footer").boundingBox();
    const controls = await page.getByTestId("pharosville-world-controls").boundingBox();
    const panel = await page.getByTestId("pharosville-detail-panel").boundingBox();
    expect(footer, `${name}: footer box`).not.toBeNull();
    expect(controls, `${name}: controls box`).not.toBeNull();
    expect(panel, `${name}: detail panel box`).not.toBeNull();
    expectRectInsideViewport(footer!, viewport);
    expectRectInsideViewport(controls!, viewport);
    expectRectInsideViewport(panel!, viewport);
    expect(
      rectsOverlap(footer!, controls!),
      `${name}: footer and world controls must have separate hit regions`,
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

  await openWorld(page, states[0]);
  const closeDetails = page.getByRole("button", { name: "Close details" });
  if (await closeDetails.isVisible()) await closeDetails.click();

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
      // Reduced motion keeps the observe control and turns it into a stepper,
      // so it stays reachable but never latches; with timeSeconds pinned at 0
      // above, that is the proof nothing moves until the reader asks.
      await expect(page.getByRole("button", { name: "Observe harbor" }))
        .toHaveAttribute("aria-pressed", "false");
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

test(...visualLane("accessibility", "Observe control preserves accessible, interruptible detail access"), async ({
  page,
}) => {
  const canvas = await openWorld(page, { hour: 12, reducedMotion: false });
  const closeDetails = page.getByRole("button", { name: "Close details" });
  if (await closeDetails.isVisible()) {
    await closeDetails.focus();
    await page.keyboard.press("Enter");
  }

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

  // Reduced motion no longer retires the control: the timed tour becomes a
  // stepper, so a reader who cannot take the tour still reaches every beat
  // under their own hand. It stops being a toggle at the same moment, so it
  // never latches into a "stop" state the next press would not honour.
  const caption = page.getByTestId("pharosville-observe-caption");
  await observe.click();
  await observe.focus();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(observe).toBeVisible();
  await expect(observe).toHaveAttribute("aria-pressed", "false");
  await expect(observe).toHaveAttribute("aria-label", "Observe harbor");

  await page.keyboard.press("Escape");
  await expect(caption).toHaveCount(0);
  await observe.click();
  await expect(caption).toContainText("Observe 1/");
  await observe.click();
  await expect(caption).toContainText("Observe 2/");
  // No beat timer runs under reduced motion, so the beat holds until asked.
  await page.waitForTimeout(600);
  await expect(caption).toContainText("Observe 2/");

  // The sea's place-names are carved boards in the world (garden-sea-signs),
  // not DOM chips; detail access flows through the canvas hit targets, which
  // Tab cycles and Enter opens from the world shell itself. Focus has to be on
  // the shell for that: the shell's key handler defers to any interactive
  // element, so tabbing away from the observe button would reach the next
  // control instead.
  await page.getByTestId("pharosville-world").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("pharosville-detail-panel")).toBeVisible();
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
  const closeDetails = page.getByRole("button", { name: "Close details" });
  await expect(closeDetails).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(detailPanel).toHaveCount(0);

  // The live region carries announcements to a screen reader.
  await expect(page.locator("p.sr-only[aria-live='polite']")).toHaveCount(1);
});
