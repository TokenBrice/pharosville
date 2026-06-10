import type { Page } from "@playwright/test";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureReportCards,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureChains,
  fixturePegSummary,
  fixtureReportCards,
  fixtureStability,
  fixtureStablecoins,
  fixtureStress,
} from "../../src/__fixtures__/pharosville-world";
import { PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY } from "@shared/lib/pharosville-api-endpoints";

export type DebugShipMotionSample = {
  currentDockId: string | null;
  currentRouteStopId: string | null;
  currentRouteStopKind: string | null;
  id: string;
  mapVisible: boolean;
  state: string;
  x: number;
  y: number;
  zone: string;
};

export type DebugTarget = {
  detailId: string;
  kind: string;
  priority: number;
  rect: { height: number; width: number; x: number; y: number };
};

export type DebugCamera = {
  offsetX: number;
  offsetY: number;
  zoom: number;
};

export type DebugFramePacing = {
  averageMs: number;
  droppedFrameCount: number;
  effectiveFps: number;
  longestDroppedBurst: number;
  maxMs: number;
  p50Ms: number;
  p90Ms: number;
  sampleCount: number;
};

export type DebugRenderMetrics = {
  drawableCount: number;
  drawableCounts: {
    body: number;
    overlay: number;
    selection: number;
    underlay: number;
  };
  drawDurationMs: number;
  framePacing?: DebugFramePacing;
  movingShipCount: number;
  visibleShipCount: number;
  visibleTileCount: number;
  shipMaxHeadingDeltaDeg?: number;
  shipMaxPositionDeltaTile?: number;
  routeCacheStats?: { hitRatio: number; evictionRate: number; size: number; capacity: number };
  longtask?: { count: number; maxDurationMs: number };
  // V1.1 per-pass draw-time attribution (coarse pass-group timers).
  skyDrawMs?: number;
  staticBlitDrawMs?: number;
  waterAccentDrawMs?: number;
  entityPassDrawMs?: number;
  nameplateDrawMs?: number;
  nameplateDrawCount?: number;
  ambientDrawMs?: number;
  selectionChromeDrawMs?: number;
};

export type PharosVilleVisualDebug = {
  activeCameraLoopCount?: number;
  activeMotionLoopCount?: number;
  animationFramePending?: boolean;
  assetLoadErrors?: unknown[];
  assetsLoaded?: boolean;
  camera?: DebugCamera | null;
  cameraFrameSource?: string;
  cameraWithinBounds?: boolean;
  canvasBudget?: unknown;
  canvasSize?: { x: number; y: number };
  criticalAssetsLoaded?: boolean;
  deferredAssetsLoaded?: boolean;
  motionClockSource?: "requestAnimationFrame" | "reduced-motion-static-frame";
  motionCueCounts?: {
    ambientBirds: number;
    animatedShips: number;
    effectShips: number;
    harborLights: number;
    moverShips: number;
    selectedRelationshipOverlays: number;
  };
  motionFrameCount?: number;
  reducedMotion?: boolean;
  renderMetrics?: DebugRenderMetrics;
  selectedDetailAnchor?: { side: "left" | "right"; x: number; y: number } | null;
  selectedDetailId?: string | null;
  shipMotionSamples?: DebugShipMotionSample[];
  targets?: DebugTarget[];
  timeSeconds?: number;
  wallClockHour?: number;
};

export type PharosVillePayloads = {
  chains: unknown;
  pegSummary: unknown;
  reportCards: unknown;
  stability: unknown;
  stablecoins: unknown;
  stress: unknown;
};

export const PHAROSVILLE_DESKTOP_DATA_ENDPOINTS = [
  PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.stablecoins,
  PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.chains,
  PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.stability,
  PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.pegSummary,
  PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.stress,
  PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.reportCards,
] as const;

const meta = { updatedAt: 1_700_000_000, ageSeconds: 60, status: "fresh" };

export async function mockScreenSize(page: Page, width: number, height: number): Promise<void> {
  // Playwright's `setViewportSize` only changes the viewport; screen-gate
  // tests need to override `screen.{width,height}` before navigation.
  await page.addInitScript(({ w, h }) => {
    Object.defineProperty(window.screen, "width", { configurable: true, get: () => w });
    Object.defineProperty(window.screen, "height", { configurable: true, get: () => h });
    Object.defineProperty(window.screen, "availWidth", { configurable: true, get: () => w });
    Object.defineProperty(window.screen, "availHeight", { configurable: true, get: () => h });
  }, { w: width, h: height });
}

export async function installWallClockOverride(page: Page, hour: number): Promise<void> {
  const flooredHour = Math.floor(hour);
  const minutes = Math.round((hour - flooredHour) * 60);
  const fractional = ((hour % 24) + 24) % 24;
  await page.addInitScript(({ h, m, frac }) => {
    // Every visual/perf lane funnels through this helper before page.goto, so
    // it doubles as the place to seed first-visit flags: baselines capture
    // the steady-state world, not the one-time legend onboarding overlay.
    // Legend-specific tests clear the key to exercise the auto-open path.
    try {
      window.localStorage.setItem("pharosville.legend.dismissed", "1");
    } catch {
      // Storage unavailable: the app treats that as dismissed anyway.
    }
    (globalThis as { __pharosVilleTestWallClockHour?: number }).__pharosVilleTestWallClockHour = frac;
    const origGetHours = Date.prototype.getHours;
    const origGetMinutes = Date.prototype.getMinutes;
    Date.prototype.getHours = function () { return h; };
    Date.prototype.getMinutes = function () { return m; };
    (Date.prototype as { __origGetHours?: typeof origGetHours }).__origGetHours = origGetHours;
    (Date.prototype as { __origGetMinutes?: typeof origGetMinutes }).__origGetMinutes = origGetMinutes;
  }, { h: flooredHour, m: minutes, frac: fractional });
}

export async function mockPharosVilleData(page: Page): Promise<void> {
  await mockPharosVillePayloads(page, {
    stablecoins: fixtureStablecoins,
    chains: fixtureChains,
    stability: fixtureStability,
    pegSummary: fixturePegSummary,
    stress: fixtureStress,
    reportCards: fixtureReportCards,
  });
}

export async function mockDensePharosVilleData(page: Page): Promise<void> {
  await mockPharosVillePayloads(page, {
    stablecoins: denseFixtureStablecoins,
    chains: denseFixtureChains,
    stability: {
      ...fixtureStability,
      current: {
        ...fixtureStability.current,
        band: "ELEVATED",
        components: { breadth: 26, severity: 54, trend: 12 },
        score: 72,
      },
    },
    pegSummary: denseFixturePegSummary,
    stress: denseFixtureStress,
    reportCards: denseFixtureReportCards,
  });
}

export async function mockPharosVillePayloads(page: Page, payload: PharosVillePayloads): Promise<void> {
  const payloads: Array<{ path: string; body: unknown }> = [
    { path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.stablecoins, body: payload.stablecoins },
    { path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.chains, body: payload.chains },
    { path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.stability, body: payload.stability },
    { path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.pegSummary, body: payload.pegSummary },
    { path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.stress, body: payload.stress },
    { path: PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.reportCards, body: payload.reportCards },
  ];

  for (const { path, body } of payloads) {
    const endpoint = new URL(path, "http://localhost");
    await page.route((url) => (
      url.pathname === endpoint.pathname && url.search === endpoint.search
    ), async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...(body as Record<string, unknown>), _meta: meta }),
      });
    });
  }
}

export async function denyPharosVilleViewportGatedRequests(page: Page): Promise<string[]> {
  const deniedRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (isPharosVilleViewportGatedRequest(url)) {
      deniedRequests.push(`${url.pathname}${url.search}`);
    }
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (isPharosVilleViewportGatedRequest(url)) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  return deniedRequests;
}

export function collectRetiredSummaryRequests(page: Page): string[] {
  const retiredPath = ["blacklist", "summary"].join("-");
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith(`/${retiredPath}`)) requests.push(`${url.pathname}${url.search}`);
  });
  return requests;
}

export function isPharosVilleViewportGatedRequest(url: URL): boolean {
  const retiredPath = ["blacklist", "summary"].join("-");
  if (url.pathname.endsWith(`/${retiredPath}`)) return true;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_site-data/")) return true;
  if (
    url.pathname.startsWith("/pharosville/assets/")
    || url.pathname.startsWith("/logos/")
    || /^\/chains\/[^/]+\.(?:png|svg|jpe?g|webp)$/i.test(url.pathname)
  ) {
    return true;
  }
  if (
    /(?:^|\/)(?:pharosville-desktop-data|pharosville-world)(?:[.-]|$)/.test(url.pathname)
    || url.pathname.includes("/src/pharosville-desktop-data")
    || url.pathname.includes("/src/pharosville-world")
  ) {
    return true;
  }
  return PHAROSVILLE_DESKTOP_DATA_ENDPOINTS.some((path) => `${url.pathname}${url.search}` === path);
}

export async function readVisualDebug(page: Page): Promise<PharosVilleVisualDebug> {
  return page.evaluate(() => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: PharosVilleVisualDebug;
    }).__pharosVilleDebug;
    return debug ?? {};
  });
}

export async function readDebugCamera(page: Page): Promise<DebugCamera | null> {
  return page.evaluate(() => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: PharosVilleVisualDebug;
    }).__pharosVilleDebug;
    return debug?.camera ?? null;
  });
}

export async function readRuntimeSnapshot(page: Page) {
  return page.evaluate(() => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: PharosVilleVisualDebug;
    }).__pharosVilleDebug;
    return {
      activeMotionLoopCount: debug?.activeMotionLoopCount ?? -1,
      animationFramePending: debug?.animationFramePending ?? true,
      motionClockSource: debug?.motionClockSource ?? null,
      motionCueCounts: debug?.motionCueCounts ?? null,
      motionFrameCount: debug?.motionFrameCount ?? -1,
      reducedMotion: debug?.reducedMotion ?? null,
      renderMetrics: debug?.renderMetrics ?? null,
      shipMotionSamples: debug?.shipMotionSamples ?? [],
      timeSeconds: debug?.timeSeconds ?? -1,
      wallClockHour: debug?.wallClockHour ?? -1,
    };
  });
}

export async function waitForRuntimeDebug(page: Page, reducedMotion: boolean): Promise<void> {
  await page.waitForFunction((expectedReducedMotion) => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: PharosVilleVisualDebug;
    }).__pharosVilleDebug;
    return Boolean(
      debug?.criticalAssetsLoaded
      && debug.camera
      && debug.reducedMotion === expectedReducedMotion
      && (debug.shipMotionSamples?.length ?? 0) > 0
      && (debug.targets?.some((target) => target.kind === "ship") ?? false)
      && (expectedReducedMotion || (debug.motionFrameCount ?? 0) >= 2),
    );
  }, reducedMotion);
}

export async function waitForMotionActive(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const debug = (window as typeof window & { __pharosVilleDebug?: PharosVilleVisualDebug })
      .__pharosVilleDebug;
    return Boolean(
      debug?.criticalAssetsLoaded
      && debug.deferredAssetsLoaded
      && debug.camera
      && debug.reducedMotion === false
      && (debug.shipMotionSamples?.length ?? 0) > 0
      && (debug.motionFrameCount ?? 0) >= 2,
    );
  });
}

export async function waitForSteadyTelemetry(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const debug = (window as typeof window & { __pharosVilleDebug?: PharosVilleVisualDebug })
      .__pharosVilleDebug;
    const metrics = debug?.renderMetrics;
    if (!metrics) return false;
    const longtaskClear = metrics.longtask ? metrics.longtask.count === 0 : true;
    const headingClear = metrics.shipMaxHeadingDeltaDeg === undefined || metrics.shipMaxHeadingDeltaDeg <= 720;
    const positionClear = metrics.shipMaxPositionDeltaTile === undefined || metrics.shipMaxPositionDeltaTile <= 0.15;
    return longtaskClear && headingClear && positionClear && (metrics.framePacing?.sampleCount ?? 0) >= 5;
  }, null, { timeout: 15_000 });
}
