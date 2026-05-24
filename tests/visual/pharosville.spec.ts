import { test, expect, type Page } from "@playwright/test";
import {
  fixtureChains,
  denseFixtureStablecoins,
  fixturePegSummary,
  fixtureReportCards,
  fixtureStability,
  fixtureStablecoins,
  fixtureStress,
  makePegCoin,
} from "../../src/__fixtures__/pharosville-world";
import { MAX_MAIN_CANVAS_PIXELS, MAX_TOTAL_BACKING_PIXELS } from "../../src/systems/canvas-budget";
import { tileToScreen } from "../../src/systems/projection";
import type { PegSummaryResponse, StressSignalsAllResponse } from "@shared/types";
import {
  collectRetiredSummaryRequests,
  denyPharosVilleViewportGatedRequests,
  installWallClockOverride,
  mockDensePharosVilleData,
  mockPharosVilleData,
  mockPharosVillePayloads,
  mockScreenSize,
  readDebugCamera,
  readRuntimeSnapshot,
  readVisualDebug,
  waitForRuntimeDebug,
  type DebugTarget,
  type PharosVilleVisualDebug,
} from "../helpers/pharosville-debug";

const RISK_WATER_AREA_DETAILS = [
  { detailId: "area.dews.calm", label: "Calm Anchorage", zone: "calm" },
  { detailId: "area.dews.watch", label: "Watch Breakwater", zone: "watch" },
  { detailId: "area.dews.alert", label: "Alert Channel", zone: "alert" },
  { detailId: "area.dews.warning", label: "Warning Shoals", zone: "warning" },
  { detailId: "area.dews.danger", label: "Danger Strait", zone: "danger" },
  { detailId: "area.risk-water.ledger-mooring", label: "Ledger Mooring", zone: "ledger" },
] as const;

const VISUAL_LANE_TAGS = {
  accessibility: "@visual-accessibility",
  interaction: "@visual-interaction",
  motion: "@visual-motion",
  static: "@visual-static",
} as const;

type VisualLane = keyof typeof VISUAL_LANE_TAGS;

const EXPECTED_VISUAL_LANE_TITLES: Record<VisualLane, readonly string[]> = {
  accessibility: [
    "pharosville accessibility smoke validates keyboard focus and landmarks",
    "pharosville accessibility pinch-zoom does not steal focus or selection",
  ],
  interaction: [
    "pharosville canvas interactions update details and camera",
    "pharosville reduced motion keeps ship samples static without RAF",
    "pharosville responds to live reduced-motion preference transitions",
  ],
  motion: [
    "starts bounded world animation and keeps moving ship targets selectable",
  ],
  static: [
    "pharosville renders desktop canvas shell",
    "pharosville dense visual fixture preserves districts, dense ships, and render budget",
    "pharosville renders a stressed ship in storm-shelf detail",
    "pharosville exposes all named risk water areas in browser details",
    "pharosville narrow fallback avoids world runtime requests",
    "pharosville short desktop fallback avoids clipped map",
    "pharosville desktop gate passes at threshold screen and falls back below it",
    "pharosville keeps world runtime mounted when the browser window is resized below the old viewport gate",
    "pharosville ultrawide canvas keeps DPR backing store capped",
  ],
};

const registeredVisualLaneTitles: Record<VisualLane, string[]> = {
  accessibility: [],
  interaction: [],
  motion: [],
  static: [],
};

function visualLane(lane: VisualLane, title: string): [string, { tag: string }] {
  registeredVisualLaneTitles[lane].push(title);
  return [title, { tag: VISUAL_LANE_TAGS[lane] }];
}

function assertVisualLaneCoverage(): void {
  const failures: string[] = [];
  for (const lane of Object.keys(EXPECTED_VISUAL_LANE_TITLES) as VisualLane[]) {
    const expected = EXPECTED_VISUAL_LANE_TITLES[lane];
    const registered = registeredVisualLaneTitles[lane];
    const missing = expected.filter((title) => !registered.includes(title));
    const unexpected = registered.filter((title) => !expected.includes(title));
    if (missing.length > 0) {
      failures.push(`${lane} missing: ${missing.join(", ")}`);
    }
    if (unexpected.length > 0) {
      failures.push(`${lane} unexpected: ${unexpected.join(", ")}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Visual lane coverage is stale. ${failures.join("; ")}`);
  }
}

async function clickMapTarget(page: Page, kind: string, detailId?: string) {
  return (await clickMapTargetWithPoint(page, kind, detailId)).detailId;
}

async function clickMapTargetWithPoint(page: Page, kind: string, detailId?: string) {
  let lastValue: {
    detailId: string;
    point: { x: number; y: number };
    rect: { height: number; width: number; x: number; y: number };
  } | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const target = await page.waitForFunction(({ targetKind, targetDetailId }) => {
      const debug = (window as typeof window & {
        __pharosVilleDebug?: {
          targets: DebugTarget[];
        };
      }).__pharosVilleDebug;
      const candidates = debug?.targets?.filter((entry) => entry.kind === targetKind && (!targetDetailId || entry.detailId === targetDetailId)) ?? [];
      for (const candidate of candidates) {
        const points = [
          [0.5, 0.5],
          [0.25, 0.25],
          [0.75, 0.25],
          [0.25, 0.75],
          [0.75, 0.75],
        ].map(([x, y]) => ({
          x: candidate.rect.x + candidate.rect.width * x,
          y: candidate.rect.y + candidate.rect.height * y,
        }));
        const point = points.find((candidatePoint) => {
          const elementAtPoint = document.elementFromPoint(candidatePoint.x, candidatePoint.y);
          if (!(elementAtPoint instanceof HTMLCanvasElement) || elementAtPoint.dataset.testid !== "pharosville-canvas") {
            return false;
          }
          const topTarget = debug?.targets
            ?.filter((entry) => (
              candidatePoint.x >= entry.rect.x
              && candidatePoint.x <= entry.rect.x + entry.rect.width
              && candidatePoint.y >= entry.rect.y
              && candidatePoint.y <= entry.rect.y + entry.rect.height
            ))
            .toSorted((a, b) => b.priority - a.priority)[0] ?? null;
          return topTarget?.detailId === candidate.detailId;
        });
        if (point) return { ...candidate, point };
      }
      return null;
    }, { targetDetailId: detailId, targetKind: kind });
    const value = await target.jsonValue() as {
      detailId: string;
      point: { x: number; y: number };
      rect: { height: number; width: number; x: number; y: number };
    };
    lastValue = value;
    await page.mouse.click(value.point.x, value.point.y);
    try {
      await page.waitForFunction((expectedDetailId) => {
        const debug = (window as typeof window & {
          __pharosVilleDebug?: { selectedDetailId?: string | null };
        }).__pharosVilleDebug;
        return debug?.selectedDetailId === expectedDetailId;
      }, value.detailId, { timeout: 2_000 });
      return { detailId: value.detailId, point: value.point };
    } catch {
      // Moving targets can drift between debug sampling and click dispatch.
    }
  }

  if (lastValue) return { detailId: lastValue.detailId, point: lastValue.point };
  throw new Error(`No ${kind} target found${detailId ? ` for ${detailId}` : ""}`);
}

async function expectNoAssetLoadErrors(page: Page) {
  const statusHandle = await page.waitForFunction(() => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: PharosVilleVisualDebug;
    }).__pharosVilleDebug;
    if (!debug) return null;
    const assetLoadErrors = debug.assetLoadErrors ?? [];
    if (assetLoadErrors.length > 0 || (debug.criticalAssetsLoaded && debug.deferredAssetsLoaded)) {
      return {
        assetLoadErrors,
        criticalAssetsLoaded: debug.criticalAssetsLoaded ?? false,
        deferredAssetsLoaded: debug.deferredAssetsLoaded ?? false,
      };
    }
    return null;
  });
  const status = await statusHandle.jsonValue() as {
    assetLoadErrors: unknown[];
    criticalAssetsLoaded: boolean;
    deferredAssetsLoaded: boolean;
  };
  expect(status.assetLoadErrors).toEqual([]);
  expect(status.criticalAssetsLoaded).toBe(true);
  expect(status.deferredAssetsLoaded).toBe(true);
}

async function expectNoBuildingTargets(page: Page) {
  const buildingTargets = await page.evaluate(() => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: PharosVilleVisualDebug;
    }).__pharosVilleDebug;
    return (debug?.targets ?? [])
      .filter((target) => target.kind === "building" || target.detailId.startsWith("building."))
      .map((target) => target.detailId);
  });

  expect(buildingTargets).toEqual([]);
}

test(...visualLane("static", "pharosville renders desktop canvas shell"), async ({ page }) => {
  await mockPharosVilleData(page);
  const retiredSummaryRequests = collectRetiredSummaryRequests(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto("/");
  const canvas = page.getByTestId("pharosville-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId("pharosville-world-toolbar")).toBeVisible();
  await expect(page.getByTestId("pharosville-query-status-banner")).toHaveCount(0);
  await expect(page.getByTestId("pharosville-detail-panel")).toBeVisible();
  await expect(page.getByTestId("pharosville-detail-panel")).toContainText("Pharos lighthouse");
  await expect(page.getByTestId("pharosville-map-key")).toHaveCount(0);
  await expect(page.getByTestId("pharosville-keyboard-entity-browser")).toHaveCount(0);
  await expect(page.getByTestId("pharosville-minimap")).toHaveCount(0);
  await expect(page.locator('aside[aria-label="Main navigation"]')).toHaveCount(0);
  await expect(page.locator("footer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recenter map" })).toBeVisible();
  const ledgerText = await page.getByTestId("pharosville-accessibility-ledger").textContent();
  expect(ledgerText).toContain("56 by 56 tiles");
  const waterRatioText = ledgerText?.split(" tiles, ")[1]?.split("% water.")[0];
  expect(waterRatioText).toBeDefined();
  const waterPercent = Number(waterRatioText);
  expect(waterPercent).toBeGreaterThanOrEqual(85.7);
  expect(waterPercent).toBeLessThanOrEqual(86.2);
  await page.waitForFunction(() => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: PharosVilleVisualDebug;
    }).__pharosVilleDebug;
    return Boolean(debug?.criticalAssetsLoaded && debug.camera && (debug.targets?.length ?? 0) > 0);
  });
  await expectNoAssetLoadErrors(page);
  await expectNoBuildingTargets(page);

  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(1000);
  expect(box?.height).toBeGreaterThan(700);

  const nonBlankPixels = await page.waitForFunction(() => {
    const canvasNode = document.querySelector('[data-testid="pharosville-canvas"]') as HTMLCanvasElement | null;
    const context = canvasNode?.getContext("2d");
    if (!canvasNode || !context) return 0;
    const { data } = context.getImageData(0, 0, canvasNode.width, canvasNode.height);
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] !== 0 || data[index + 1] !== 0 || data[index + 2] !== 0) count += 1;
    }
    return count > 10_000 ? count : 0;
  });

  expect(await nonBlankPixels.jsonValue()).toBeGreaterThan(10_000);
  const pixelStats = await canvasPixelStats(page);
  expect(pixelStats.backingPixels).toBeLessThanOrEqual(1440 * 1000 * 4);
  expect(pixelStats.landPixels).toBeGreaterThan(6_000);
  expect(pixelStats.waterPixels).toBeGreaterThan(25_000);
  // Maker squad clusters 5 titan-scale ships in tight formation, occluding a
  // few hundred extra water pixels vs. the prior scattered placement; the
  // dominant water-over-land ratio is preserved.
  expect(pixelStats.waterPixels).toBeGreaterThan(pixelStats.landPixels * 1.39);
  expect(pixelStats.landPixels / pixelStats.backingPixels).toBeLessThan(0.5);
  expect(pixelStats.waterPixels / pixelStats.backingPixels).toBeLessThan(0.86);
  expect(retiredSummaryRequests).toEqual([]);
  await expect(page).toHaveScreenshot("pharosville-desktop-shell.png", {
    maxDiffPixels: 2500,
  });
});

test(...visualLane("accessibility", "pharosville accessibility smoke validates keyboard focus and landmarks"), async ({ page }) => {
  await mockPharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto("/");

  const shell = page.getByRole("main");
  await expect(shell).toBeVisible();
  await expect(shell).toHaveAttribute("tabindex", "0");
  await shell.focus();
  await expect(shell).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();

  await expect(page.locator(".pharosville-overlay")).toHaveAttribute("aria-label", "PharosVille controls and details");
  await expect(page.getByRole("button", { name: "Enter fullscreen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recenter map" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close details" })).toBeVisible();
});

// Pinch-to-zoom is touch-only by design (the gesture dispatcher in
// `use-canvas-resize-and-camera.ts` keys off two simultaneous PointerEvents).
// Browser tests cannot synthesize trackpad pinch, so we exercise the gesture
// via two synthetic `pointerType: "touch"` streams. The accessibility-grep
// lane (test:visual:accessibility / test:visual:cross-browser) then covers
// pinch on chromium + firefox, ensuring the gesture neither triggers a
// spurious selection nor pulls focus out of the canvas shell.
test(...visualLane("accessibility", "pharosville accessibility pinch-zoom does not steal focus or selection"), async ({ page }) => {
  await mockPharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto("/");
  await expect(page.getByTestId("pharosville-canvas")).toBeVisible();
  await waitForRuntimeDebug(page, true);

  // Clear the default lighthouse selection so we can later assert that the
  // pinch gesture itself did not open a detail panel.
  await page.getByRole("button", { name: "Close details" }).click();
  await waitForSelectedDetail(page, null);

  // Park focus on the canvas shell so we can verify the pinch does not move
  // activeElement to a different focusable region.
  const shell = page.getByTestId("pharosville-world");
  await shell.focus();
  const focusedTestIdBefore = await page.evaluate(() => (
    document.activeElement instanceof HTMLElement ? document.activeElement.dataset.testid ?? null : null
  ));

  const cameraBeforePinch = await readDebugCamera(page);
  expect(cameraBeforePinch).not.toBeNull();

  await performCanvasPinch(page, { endDistance: 260, startDistance: 160 });

  await page.waitForFunction((previous) => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: {
        camera: { offsetX: number; offsetY: number; zoom: number } | null;
        cameraWithinBounds?: boolean;
        selectedDetailId?: string | null;
      };
    }).__pharosVilleDebug;
    return Boolean(
      debug?.camera
      && previous
      && debug.camera.zoom > previous.zoom
      && debug.cameraWithinBounds
      && debug.selectedDetailId === null,
    );
  }, cameraBeforePinch);

  const cameraAfterPinch = await readDebugCamera(page);
  expect(cameraAfterPinch).not.toBeNull();
  expect(cameraAfterPinch!.zoom).toBeGreaterThan(cameraBeforePinch!.zoom);

  await waitForSelectedDetail(page, null);
  await expect(page.getByTestId("pharosville-detail-panel")).toHaveCount(0);

  const focusedTestIdAfter = await page.evaluate(() => (
    document.activeElement instanceof HTMLElement ? document.activeElement.dataset.testid ?? null : null
  ));
  expect(focusedTestIdAfter).toBe(focusedTestIdBefore);
});

test(...visualLane("static", "pharosville dense visual fixture preserves districts, dense ships, and render budget"), async ({ page }) => {
  await mockDensePharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto("/");
  await waitForRuntimeDebug(page, false);
  await expectNoAssetLoadErrors(page);

  const debug = await readVisualDebug(page);
  const targets = debug.targets ?? [];
  const denseFixtureShipCount = new Set(denseFixtureStablecoins.peggedAssets.map((asset) => asset.id)).size;
  const motionSamples = debug.shipMotionSamples ?? [];
  const visibleMotionSamples = motionSamples.filter((sample) => sample.mapVisible);
  const hiddenMooredSamples = motionSamples.filter((sample) => !sample.mapVisible && sample.state === "moored");
  const ledgerRouteStopSamples = motionSamples.filter((sample) => sample.currentRouteStopKind === "ledger");
  expect(targets.filter((target) => target.kind === "dock")).toHaveLength(8);
  expect(targets.filter((target) => target.kind === "ship")).toHaveLength(visibleMotionSamples.length);
  expect(visibleMotionSamples.length).toBeLessThan(denseFixtureShipCount);
  expect(hiddenMooredSamples.length).toBeGreaterThan(0);
  expect(hiddenMooredSamples.every((sample) => sample.currentDockId)).toBe(true);
  // Dense fixture ships with NAV metadata currently have fresh DEWS placement,
  // so ledger route-stop samples are not expected in this scenario.
  expect(ledgerRouteStopSamples).toHaveLength(0);
  expect(motionSamples.every((sample) => (
    sample.state === "idle"
    || sample.state === "risk-drift"
    || sample.state === "sailing"
    || sample.state === "arriving"
    || sample.state === "departing"
    // Squad consorts shadow their flagship's state (including "moored") but
    // intentionally carry null route-stop fields — see motion-sampling.ts
    // consort branch. Accept the moored state itself rather than requiring a
    // route-stop, so consorts moored alongside their flagship pass the
    // motion-policy guard without weakening it for other ships (whose moored
    // samples still carry currentDockId/currentRouteStopKind).
    || sample.state === "moored"
    || sample.currentRouteStopKind === "dock"
    || sample.currentRouteStopKind === "ledger"
  ))).toBe(true);
  expect(targets.filter((target) => target.kind === "ship-cluster")).toHaveLength(0);
  expect(motionSamples).toHaveLength(denseFixtureShipCount);
  expect(debug.renderMetrics?.visibleShipCount).toBe(visibleMotionSamples.length);
  expect(targets.filter((target) => target.kind === "grave").length).toBeGreaterThan(10);

  // 150ms (vs the 90ms target) absorbs CI variance under
  // parallel Playwright workers on shared runners.
  await expectDrawDurationP95Within(page, 150, 24);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await waitForRuntimeDebug(page, true);
  await clickBlankMap(page);
  await page.mouse.move(8, 8);
  await waitForSelectedDetail(page, null);
  await page.waitForTimeout(250);
  const stillDebug = await readVisualDebug(page);
  const stillTargets = stillDebug.targets ?? [];
  expect(stillDebug.shipMotionSamples ?? []).toHaveLength(denseFixtureShipCount);
  expect((stillDebug.shipMotionSamples ?? []).every((sample) => sample.mapVisible)).toBe(true);
  expect(stillTargets.filter((target) => target.kind === "ship").length).toBeGreaterThan(120);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const viewportSize = viewport!;
  const watchBreakwater = stillTargets.find((target) => target.detailId === "area.dews.watch");
  expect(watchBreakwater).toBeDefined();
  const watchBreakwaterCenter = {
    x: watchBreakwater!.rect.x + watchBreakwater!.rect.width / 2,
    y: watchBreakwater!.rect.y + watchBreakwater!.rect.height / 2,
  };
  await expect(page).toHaveScreenshot("pharosville-dense-lighthouse.png", {
    clip: clipForTargets(stillTargets, (target) => target.detailId === "lighthouse", viewportSize, 92, { height: 280, width: 260 }),
    maxDiffPixels: 1000,
  });
  // GitHub-hosted runners rasterize the scenery-detail highlights slightly
  // differently from the Playwright Docker image on local hosts.
  const denseSceneryMaxDiffPixels = 2200;

  await expect(page).toHaveScreenshot("pharosville-dense-evm-bay.png", {
    clip: clipForTargets(stillTargets, (target) => (
      target.kind === "dock" && ["dock.ethereum", "dock.base", "dock.arbitrum", "dock.polygon"].includes(target.detailId)
    ), viewportSize, 88, { height: 300, width: 380 }),
    maxDiffPixels: denseSceneryMaxDiffPixels,
  });
  await expect(page).toHaveScreenshot("pharosville-dense-ship-flotillas.png", {
    clip: clipForTargets(stillTargets, (target) => {
      if (target.detailId === "area.dews.watch") return true;
      if (target.kind !== "ship") return false;
      const targetCenter = {
        x: target.rect.x + target.rect.width / 2,
        y: target.rect.y + target.rect.height / 2,
      };
      return Math.hypot(targetCenter.x - watchBreakwaterCenter.x, targetCenter.y - watchBreakwaterCenter.y) <= 260;
    }, viewportSize, 96, { height: 280, width: 420 }),
    maxDiffPixels: denseSceneryMaxDiffPixels,
  });
  await expect(page).toHaveScreenshot("pharosville-dense-cemetery.png", {
    clip: clipForTargets(stillTargets, (target) => target.kind === "grave", viewportSize, 80, { height: 260, width: 360 }),
    maxDiffPixels: denseSceneryMaxDiffPixels,
  });
  expect(stillDebug.camera).not.toBeNull();
  await expect(page).toHaveScreenshot("pharosville-dense-civic-core.png", {
    clip: clipAroundPoint(tileToScreen({ x: 34, y: 30 }, stillDebug.camera!), viewportSize, { height: 300, width: 420 }),
    maxDiffPixels: denseSceneryMaxDiffPixels,
  });
  await expect(page).toHaveScreenshot("pharosville-dense-risk-water.png", {
    clip: clipForTargets(stillTargets, (target) => (
      target.detailId === "area.dews.warning"
      || target.detailId === "area.dews.danger"
      || target.detailId === "area.dews.alert"
    ), viewportSize, 104, { height: 320, width: 460 }),
    maxDiffPixels: denseSceneryMaxDiffPixels,
  });
  await expect(page).toHaveScreenshot("pharosville-dense-ledger-north.png", {
    clip: clipForTargets(stillTargets, (target) => (
      target.detailId === "area.risk-water.ledger-mooring"
      || target.detailId === "area.dews.watch"
    ), viewportSize, 92, { height: 300, width: 460 }),
    maxDiffPixels: denseSceneryMaxDiffPixels,
  });
});

test(...visualLane("static", "pharosville renders a stressed ship in storm-shelf detail"), async ({ page }) => {
  const stressedPegSummary: PegSummaryResponse = {
    ...fixturePegSummary,
    coins: [
      makePegCoin({
        id: "usdt-tether",
        symbol: "USDT",
        activeDepeg: true,
        currentDeviationBps: 650,
        pegScore: 24,
        severityScore: 80,
      }),
      ...fixturePegSummary.coins.filter((coin) => coin.id !== "usdt-tether"),
    ],
  };
  const stressedSignals: StressSignalsAllResponse = {
    ...fixtureStress,
    signals: {
      "usdt-tether": {
        score: 92,
        band: "DANGER",
        signals: {
          peg: { available: true, value: 92 },
        },
        computedAt: 1_700_000_000,
        methodologyVersion: "fixture",
      },
    },
  };
  await mockPharosVillePayloads(page, {
    stablecoins: fixtureStablecoins,
    chains: fixtureChains,
    stability: {
      ...fixtureStability,
      current: {
        ...fixtureStability.current,
        band: "ELEVATED",
        components: { breadth: 16, severity: 42, trend: 8 },
        score: 66,
      },
    },
    pegSummary: stressedPegSummary,
    stress: stressedSignals,
    reportCards: fixtureReportCards,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto("/");
  await expectNoAssetLoadErrors(page);

  await page.getByRole("button", { name: "Close details" }).click();
  await waitForSelectedDetail(page, null);

  const clickedDetailId = await clickMapTarget(page, "ship", "ship.usdt-tether");
  expect(clickedDetailId).toBe("ship.usdt-tether");
  await waitForSelectedDetail(page, "ship.usdt-tether");
  const detailPanel = page.getByTestId("pharosville-detail-panel");
  await expect(detailPanel).toContainText("Tether");
  await expect(detailPanel).toContainText("Active depeg event");
  await expect(detailPanel).toContainText("Danger Strait");
});

test(...visualLane("static", "pharosville exposes all named risk water areas in browser details"), async ({ page }) => {
  await mockPharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto("/");
  await expectNoAssetLoadErrors(page);

  const ledger = page.getByTestId("pharosville-accessibility-ledger");
  await page.getByRole("button", { name: "Close details" }).click();
  await waitForSelectedDetail(page, null);
  for (const area of RISK_WATER_AREA_DETAILS) {
    await test.step(area.detailId, async () => {
      await expect(ledger).toContainText(area.label);
      const clickedDetailId = await clickMapTarget(page, "area", area.detailId);
      expect(clickedDetailId).toBe(area.detailId);
      await waitForSelectedDetail(page, area.detailId);
      const detailPanel = page.getByTestId("pharosville-detail-panel");
      await expect(detailPanel).toContainText(area.label);
      await page.getByRole("button", { name: "Close details" }).click();
      await waitForSelectedDetail(page, null);
    });
  }
});

test(...visualLane("static", "pharosville narrow fallback avoids world runtime requests"), async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const deniedRequests = await denyPharosVilleViewportGatedRequests(page);

  // Mocked screen long-side (719) sits below the 720px gate; viewport keeps
  // the previous landscape-ish 999x900 so the snapshot baseline still matches.
  await mockScreenSize(page, 719, 500);
  await page.setViewportSize({ width: 999, height: 900 });
  await installWallClockOverride(page, 12);
  await page.goto("/");

  await expect(page.getByText("PharosVille needs a wider harbor.")).toBeVisible();
  await expect(page.getByTestId("pharosville-canvas")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "PSI" })).toBeVisible();
  // The HTML manifest preload is gated by `device-width`/`device-height`
  // media queries (which JS-mocked `screen.{width,height}` can't override),
  // so it may fire on the test viewport. The cached fetch is harmless — only
  // the world runtime (API + canvas) must stay dormant on the fallback.
  const runtimeRequests = deniedRequests.filter((path) => (
    path !== "/pharosville/assets/manifest.runtime.json"
  ));
  expect(runtimeRequests).toEqual([]);
  await expect(page).toHaveScreenshot("pharosville-narrow-fallback.png");
});

test(...visualLane("static", "pharosville short desktop fallback avoids clipped map"), async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const deniedRequests = await denyPharosVilleViewportGatedRequests(page);

  await mockScreenSize(page, 720, 359);
  await page.setViewportSize({ width: 1000, height: 639 });
  await installWallClockOverride(page, 12);
  await page.goto("/");

  await expect(page.getByText("PharosVille needs a wider harbor.")).toBeVisible();
  await expect(page.getByTestId("pharosville-canvas")).toHaveCount(0);
  const runtimeRequests = deniedRequests.filter((path) => (
    path !== "/pharosville/assets/manifest.runtime.json"
  ));
  expect(runtimeRequests).toEqual([]);
});

test(...visualLane("static", "pharosville desktop gate passes at threshold screen and falls back below it"), async ({ page }) => {
  await mockPharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });

  // Threshold pass: 720x360 screen (the floor) with a roomy landscape viewport
  // so the canvas has space to draw.
  await mockScreenSize(page, 720, 360);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto("/");
  await expect(page.getByTestId("pharosville-canvas")).toBeVisible();
  await waitForRuntimeDebug(page, true);

  // Edge-below screen sizes go to the fallback. Use a fresh page for each
  // assertion since `screen.{width,height}` is fixed at navigation time.
  for (const [w, h] of [[719, 360], [720, 359]] as const) {
    const edgePage = await page.context().newPage();
    await edgePage.emulateMedia({ reducedMotion: "reduce" });
    await mockScreenSize(edgePage, w, h);
    await edgePage.setViewportSize({ width: 1440, height: 1000 });
    await installWallClockOverride(edgePage, 12);
    await edgePage.goto("/");
    await expect(edgePage.getByText("PharosVille needs a wider harbor.")).toBeVisible();
    await expect(edgePage.getByTestId("pharosville-canvas")).toHaveCount(0);
    await edgePage.close();
  }
});

test("pharosville prompts to rotate when a wide-enough screen is held in portrait", async ({ page }) => {
  // Foldable / tablet held in portrait: the screen could fit the map, but the
  // current viewport is taller than wide. Show the rotate prompt instead of
  // the desktop-only fallback or the cramped map. The manifest is allowed to
  // preload (it's a cached fetch ready for when the user rotates) — only the
  // world runtime (API + canvas) must stay dormant.
  const deniedRequests = await denyPharosVilleViewportGatedRequests(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockScreenSize(page, 1080, 1920);
  await page.setViewportSize({ width: 800, height: 1200 });
  await installWallClockOverride(page, 12);
  await page.goto("/");

  await expect(page.getByText("Turn the harbor sideways.")).toBeVisible();
  await expect(page.getByText("PharosVille needs a wider harbor.")).toHaveCount(0);
  await expect(page.getByTestId("pharosville-canvas")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "PSI" })).toBeVisible();
  const runtimeRequests = deniedRequests.filter((path) => (
    path !== "/pharosville/assets/manifest.runtime.json"
  ));
  expect(runtimeRequests).toEqual([]);
});

test("pharosville rotates from prompt to map when viewport becomes landscape", async ({ page }) => {
  await mockPharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockScreenSize(page, 1920, 1080);
  await page.setViewportSize({ width: 800, height: 1200 });
  await installWallClockOverride(page, 12);
  await page.goto("/");

  await expect(page.getByText("Turn the harbor sideways.")).toBeVisible();

  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(page.getByTestId("pharosville-canvas")).toBeVisible();
  await expect(page.getByText("Turn the harbor sideways.")).toHaveCount(0);
});

test(...visualLane("static", "pharosville keeps world runtime mounted when the browser window is resized below the old viewport gate"), async ({ page }) => {
  // Under the screen-capability gate, only the device's screen size matters;
  // shrinking the browser window must NOT unmount the world runtime.
  await mockPharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mockScreenSize(page, 1920, 1080);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto("/");
  await waitForRuntimeDebug(page, false);
  await expectNoAssetLoadErrors(page);
  const beforeResize = await readRuntimeSnapshot(page);
  expect(beforeResize.activeMotionLoopCount).toBe(1);

  await page.setViewportSize({ width: 999, height: 639 });
  await expect(page.getByTestId("pharosville-canvas")).toBeVisible();
  await expect(page.getByText("PharosVille needs a wider harbor.")).toHaveCount(0);
  await page.waitForTimeout(150);

  const debugAfterResize = await page.evaluate(() => {
    const debug = (window as typeof window & { __pharosVilleDebug?: PharosVilleVisualDebug }).__pharosVilleDebug;
    return debug ?? null;
  });
  expect(debugAfterResize).not.toBeNull();
  expect(debugAfterResize?.activeMotionLoopCount).toBe(1);
});

test(...visualLane("static", "pharosville ultrawide canvas keeps DPR backing store capped"), async ({ baseURL, browser }) => {
  const context = await browser.newContext({
    deviceScaleFactor: 3,
    reducedMotion: "reduce",
    viewport: { width: 2560, height: 1440 },
  });
  const page = await context.newPage();
  await mockPharosVilleData(page);
  try {
    await installWallClockOverride(page, 12);
    await page.goto(new URL("/", baseURL ?? "http://127.0.0.1:3000").toString());
    await page.waitForFunction(() => {
      const debug = (window as typeof window & {
        __pharosVilleDebug?: PharosVilleVisualDebug;
      }).__pharosVilleDebug;
      return Boolean(debug?.criticalAssetsLoaded && debug.camera && debug.canvasBudget);
    });

    const metrics = await page.getByTestId("pharosville-canvas").evaluate((node) => {
      const canvas = node as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const debug = (window as typeof window & {
        __pharosVilleDebug?: {
          canvasBudget?: {
            backingPixels: number;
            effectiveDpr: number;
            maxMainCanvasPixels: number;
            maxTotalBackingPixels: number;
            requestedDpr: number;
          } | null;
        };
      }).__pharosVilleDebug;
      return {
        backingPixels: canvas.width * canvas.height,
        budget: debug?.canvasBudget ?? null,
        cssHeight: Math.floor(rect.height),
        cssWidth: Math.floor(rect.width),
        heightRatio: canvas.height / Math.max(1, rect.height),
        availableWidth: Math.floor(
          window.innerWidth - (document.querySelector("aside")?.getBoundingClientRect().width ?? 0),
        ),
        widthRatio: canvas.width / Math.max(1, rect.width),
      };
    });

    expect(metrics.cssWidth).toBeGreaterThanOrEqual(metrics.availableWidth - 1);
    expect(metrics.budget?.requestedDpr).toBeGreaterThanOrEqual(3);
    expect(metrics.budget?.effectiveDpr).toBeLessThan(2);
    expect(metrics.budget?.maxMainCanvasPixels).toBe(MAX_MAIN_CANVAS_PIXELS);
    expect(metrics.budget?.maxTotalBackingPixels).toBe(MAX_TOTAL_BACKING_PIXELS);
    expect(metrics.widthRatio).toBeLessThan(2);
    expect(metrics.heightRatio).toBeLessThan(2);
    expect(metrics.backingPixels).toBeLessThanOrEqual(MAX_MAIN_CANVAS_PIXELS);
    expect(metrics.backingPixels).toBeLessThanOrEqual(MAX_TOTAL_BACKING_PIXELS);
  } finally {
    await context.close();
  }
});

test(...visualLane("interaction", "pharosville canvas interactions update details and camera"), async ({ page }) => {
  test.setTimeout(45_000);
  await mockPharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto("/");
  await expect(page.getByTestId("pharosville-world-toolbar")).toBeVisible();
  await expect(page.getByTestId("pharosville-query-status-banner")).toHaveCount(0);
  await expect(page.getByTestId("pharosville-detail-panel")).toBeVisible();
  await expect(page.getByTestId("pharosville-map-key")).toHaveCount(0);
  await expect(page.getByTestId("pharosville-keyboard-entity-browser")).toHaveCount(0);
  await expect(page.getByTestId("pharosville-minimap")).toHaveCount(0);
  await expectDetailPanelClearOfFullscreenButton(page);

  await waitForSelectedDetail(page, "lighthouse");
  await page.getByRole("button", { name: "Close details" }).click();
  await waitForSelectedDetail(page, null);
  await clickMapTarget(page, "lighthouse");
  await waitForSelectedDetail(page, "lighthouse");
  await page.getByRole("button", { name: "Close details" }).click();
  await waitForSelectedDetail(page, null);
  await expect(page.getByTestId("pharosville-detail-panel")).toHaveCount(0);

  const dockDetailId = await clickMapTarget(page, "dock");
  await waitForSelectedDetail(page, dockDetailId);
  await page.getByRole("button", { name: "Close details" }).click();
  await waitForSelectedDetail(page, null);

  const shipSelection = await clickMapTargetWithPoint(page, "ship");
  await waitForSelectedDetail(page, shipSelection.detailId);
  const shipAnchor = await selectedDetailAnchor(page);
  expect(shipAnchor?.x).toBeCloseTo(shipSelection.point.x, 0);
  expect(shipAnchor?.y).toBeCloseTo(shipSelection.point.y, 0);
  await clickBlankMap(page);
  await waitForSelectedDetail(page, null);
  await expect(page.getByTestId("pharosville-detail-panel")).toHaveCount(0);

  await expectNoBuildingTargets(page);

  await page.getByTestId("pharosville-world").focus();
  await page.keyboard.press("Escape");
  await waitForSelectedDetail(page, null);

  const canvasBoxForZoom = await page.getByTestId("pharosville-canvas").boundingBox();
  expect(canvasBoxForZoom).not.toBeNull();
  const cameraBeforeZoom = await page.evaluate(() => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: { camera: { offsetX: number; offsetY: number; zoom: number } | null };
    }).__pharosVilleDebug;
    return debug?.camera ?? null;
  });
  expect(cameraBeforeZoom).not.toBeNull();
  await page.mouse.move(canvasBoxForZoom!.x + canvasBoxForZoom!.width / 2, canvasBoxForZoom!.y + canvasBoxForZoom!.height / 2);
  await page.mouse.wheel(0, -320);
  await page.waitForFunction((previous) => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: { camera: { offsetX: number; offsetY: number; zoom: number } | null };
    }).__pharosVilleDebug;
    return Boolean(debug?.camera && previous && debug.camera.zoom !== previous.zoom);
  }, cameraBeforeZoom);
  const cameraAfterFirstWheel = await readDebugCamera(page);
  expect(cameraAfterFirstWheel).not.toBeNull();
  expect(cameraAfterFirstWheel!.zoom).toBeGreaterThan(cameraBeforeZoom!.zoom);

  const wheelZoomSamples = [cameraBeforeZoom!.zoom, cameraAfterFirstWheel!.zoom];
  for (let step = 0; step < 3; step += 1) {
    const previousZoom = wheelZoomSamples[wheelZoomSamples.length - 1]!;
    await page.mouse.wheel(0, -160);
    await page.waitForFunction((zoom) => {
      const debug = (window as typeof window & {
        __pharosVilleDebug?: {
          camera: { offsetX: number; offsetY: number; zoom: number } | null;
          cameraWithinBounds?: boolean;
        };
      }).__pharosVilleDebug;
      return Boolean(debug?.camera && debug.cameraWithinBounds && debug.camera.zoom > zoom);
    }, previousZoom);
    const nextCamera = await readDebugCamera(page);
    expect(nextCamera).not.toBeNull();
    wheelZoomSamples.push(nextCamera!.zoom);
  }
  expect(wheelZoomSamples).toEqual([...wheelZoomSamples].sort((a, b) => a - b));
  await waitForSelectedDetail(page, null);

  const cameraBeforePinch = await readDebugCamera(page);
  expect(cameraBeforePinch).not.toBeNull();
  await performCanvasPinch(page, { endDistance: 260, startDistance: 160 });
  await page.waitForFunction((previous) => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: {
        camera: { offsetX: number; offsetY: number; zoom: number } | null;
        cameraWithinBounds?: boolean;
        selectedDetailId?: string | null;
      };
    }).__pharosVilleDebug;
    return Boolean(
      debug?.camera
      && previous
      && debug.camera.zoom > previous.zoom
      && debug.cameraWithinBounds
      && debug.selectedDetailId === null,
    );
  }, cameraBeforePinch);

  const fullscreenButton = page.getByRole("button", { name: "Enter fullscreen" });
  await expect(fullscreenButton).toBeVisible();
  await fullscreenButton.click();
  await expect(page.getByTestId("pharosville-world")).toHaveClass(/pharosville-shell--fullscreen/);
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await expect(page.getByTestId("pharosville-world")).not.toHaveClass(/pharosville-shell--fullscreen/);
  await page.waitForFunction(() => !document.fullscreenElement);

  const cameraBeforeDrag = await page.evaluate(() => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: { camera: { offsetX: number; offsetY: number; zoom: number } | null };
    }).__pharosVilleDebug;
    return debug?.camera ?? null;
  });
  const canvasBox = await page.getByTestId("pharosville-canvas").boundingBox();
  expect(canvasBox).not.toBeNull();
  await page.mouse.move(canvasBox!.x + 520, canvasBox!.y + 520);
  await page.mouse.down();
  await page.mouse.move(canvasBox!.x + 620, canvasBox!.y + 580);
  await page.mouse.up();
  await page.waitForFunction((previous) => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: { camera: { offsetX: number; offsetY: number; zoom: number } | null };
    }).__pharosVilleDebug;
    return Boolean(debug?.camera && previous && (
      debug.camera.offsetX !== previous.offsetX || debug.camera.offsetY !== previous.offsetY
    ));
  }, cameraBeforeDrag);

  await expect(page.getByTestId("pharosville-canvas")).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 760 });
  await page.waitForFunction(() => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: {
        animationFramePending?: boolean;
        camera: { offsetX: number; offsetY: number; zoom: number } | null;
        cameraWithinBounds?: boolean;
        canvasSize: { x: number; y: number };
      };
    }).__pharosVilleDebug;
    return Boolean(
      debug?.camera
      && debug.canvasSize.x <= 1280
      && debug.canvasSize.y <= 760
      && Object.prototype.hasOwnProperty.call(debug, "animationFramePending"),
    );
  });
  const resizedDebug = await page.evaluate(() => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: {
        cameraWithinBounds?: boolean;
        animationFramePending?: boolean;
        motionFrameCount?: number;
        reducedMotion?: boolean;
      };
    }).__pharosVilleDebug;
    return debug ?? null;
  });
  expect(resizedDebug?.cameraWithinBounds).toBe(true);
  expect(resizedDebug?.reducedMotion).toBe(true);
  expect(resizedDebug?.animationFramePending).toBe(false);
  expect(resizedDebug?.motionFrameCount ?? 0).toBe(0);
});

test(...visualLane("interaction", "pharosville reduced motion keeps ship samples static without RAF"), async ({ page }) => {
  await mockPharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto("/");
  await waitForRuntimeDebug(page, true);

  const first = await readRuntimeSnapshot(page);
  // Wait for any one-shot paint queued by mount-time effects (camera-only
  // re-projection, asset-load-tick handler) to fire and clear the pending
  // flag. 250ms is normally enough but CI runners under load have been
  // observed to defer the RAF beyond that window; poll for the steady state
  // instead so we're not racing single-frame variance.
  await page.waitForFunction(
    () => (window as unknown as { __pharosVilleDebug?: { animationFramePending?: boolean } })
      .__pharosVilleDebug?.animationFramePending === false,
    null,
    { timeout: 2000 },
  );
  const second = await readRuntimeSnapshot(page);

  expect(first.reducedMotion).toBe(true);
  expect(second.reducedMotion).toBe(true);
  expect(first.motionFrameCount).toBe(0);
  expect(second.motionFrameCount).toBe(0);
  expect(first.animationFramePending).toBe(false);
  expect(second.animationFramePending).toBe(false);
  expect(first.activeMotionLoopCount).toBe(0);
  expect(second.activeMotionLoopCount).toBe(0);
  expect(first.motionClockSource).toBe("reduced-motion-static-frame");
  expect(first.timeSeconds).toBe(0);
  expect(second.timeSeconds).toBe(0);
  expect(first.shipMotionSamples.length).toBeGreaterThan(0);
  expect(second.shipMotionSamples).toEqual(first.shipMotionSamples);
  expect(first.shipMotionSamples.every((sample) => sample.state === "idle")).toBe(true);
  expect(first.shipMotionSamples.some((sample) => (
    sample.currentDockId !== null
    && sample.currentRouteStopId !== null
    && sample.currentRouteStopKind === "dock"
  ))).toBe(true);
  expect(first.renderMetrics?.drawableCount).toBeGreaterThan(0);
  expect(first.renderMetrics?.visibleTileCount).toBeGreaterThan(0);
  expect(first.renderMetrics?.movingShipCount).toBe(0);
  expect(second.renderMetrics?.drawableCount).toBe(first.renderMetrics?.drawableCount);
  expect(second.renderMetrics?.drawableCounts).toEqual(first.renderMetrics?.drawableCounts);
  expect(second.renderMetrics?.movingShipCount).toBe(0);
  expect(second.renderMetrics?.visibleTileCount).toBe(first.renderMetrics?.visibleTileCount);
});

test(...visualLane("interaction", "pharosville responds to live reduced-motion preference transitions"), async ({ page }) => {
  await mockPharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto("/");
  await waitForRuntimeDebug(page, false);

  const beforeReduce = await readRuntimeSnapshot(page);
  expect(beforeReduce.reducedMotion).toBe(false);
  expect(beforeReduce.activeMotionLoopCount).toBe(1);
  expect(beforeReduce.motionFrameCount).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await waitForRuntimeDebug(page, true);
  const reduced = await readRuntimeSnapshot(page);
  expect(reduced.reducedMotion).toBe(true);
  expect(reduced.animationFramePending).toBe(false);
  expect(reduced.activeMotionLoopCount).toBe(0);
  expect(reduced.timeSeconds).toBe(0);

  await page.waitForTimeout(250);
  const reducedLater = await readRuntimeSnapshot(page);
  expect(reducedLater.reducedMotion).toBe(true);
  expect(reducedLater.animationFramePending).toBe(false);
  expect(reducedLater.motionFrameCount).toBe(reduced.motionFrameCount);
  expect(reducedLater.shipMotionSamples).toEqual(reduced.shipMotionSamples);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await waitForRuntimeDebug(page, false);
  const afterRestore = await readRuntimeSnapshot(page);
  expect(afterRestore.reducedMotion).toBe(false);
  expect(afterRestore.animationFramePending).toBe(true);
  expect(afterRestore.activeMotionLoopCount).toBe(1);
  expect(afterRestore.motionFrameCount).toBeGreaterThan(reducedLater.motionFrameCount);
});

async function waitForSelectedDetail(page: Page, detailId: string | null) {
  await page.waitForFunction((expectedDetailId) => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: { selectedDetailId?: string | null };
    }).__pharosVilleDebug;
    return debug?.selectedDetailId === expectedDetailId;
  }, detailId);
}

async function clickBlankMap(page: Page) {
  const box = await page.getByTestId("pharosville-canvas").boundingBox();
  expect(box).not.toBeNull();
  await page.getByTestId("pharosville-canvas").click({
    position: {
      x: Math.min(44, box!.width - 4),
      y: Math.max(4, box!.height - 44),
    },
  });
}

async function selectedDetailAnchor(page: Page) {
  return page.evaluate(() => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: { selectedDetailAnchor?: { side: "left" | "right"; x: number; y: number } | null };
    }).__pharosVilleDebug;
    return debug?.selectedDetailAnchor ?? null;
  });
}

async function expectDetailPanelClearOfFullscreenButton(page: Page) {
  const detailBox = await page.locator(".pharosville-detail-dock").boundingBox();
  const fullscreenBox = await page.getByRole("button", { name: "Enter fullscreen" }).boundingBox();
  expect(detailBox).not.toBeNull();
  expect(fullscreenBox).not.toBeNull();
  expect(detailBox!.y).toBeGreaterThanOrEqual(fullscreenBox!.y + fullscreenBox!.height + 8);
}

async function expectDrawDurationP95Within(page: Page, budgetMs: number, samples: number) {
  const durations: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    await page.waitForTimeout(50);
    const runtime = await readRuntimeSnapshot(page);
    const duration = runtime.renderMetrics?.drawDurationMs;
    if (typeof duration === "number" && Number.isFinite(duration)) durations.push(duration);
  }

  expect(durations.length).toBeGreaterThanOrEqual(Math.min(8, samples));
  const sorted = durations.toSorted((first, second) => first - second);
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
  expect(p95).toBeLessThanOrEqual(budgetMs);
  return p95;
}

function clipForTargets(
  targets: readonly DebugTarget[],
  select: (target: DebugTarget) => boolean,
  viewport: { height: number; width: number },
  padding: number,
  minimum: { height: number; width: number },
) {
  const selected = targets.filter(select);
  expect(selected.length).toBeGreaterThan(0);

  const minX = Math.min(...selected.map((target) => target.rect.x));
  const minY = Math.min(...selected.map((target) => target.rect.y));
  const maxX = Math.max(...selected.map((target) => target.rect.x + target.rect.width));
  const maxY = Math.max(...selected.map((target) => target.rect.y + target.rect.height));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const width = Math.min(viewport.width, Math.max(minimum.width, maxX - minX + padding * 2));
  const height = Math.min(viewport.height, Math.max(minimum.height, maxY - minY + padding * 2));
  const x = Math.max(0, Math.min(viewport.width - width, centerX - width / 2));
  const y = Math.max(0, Math.min(viewport.height - height, centerY - height / 2));

  return {
    height: Math.round(height),
    width: Math.round(width),
    x: Math.round(x),
    y: Math.round(y),
  };
}

function clipAroundPoint(
  point: { x: number; y: number },
  viewport: { height: number; width: number },
  size: { height: number; width: number },
) {
  const width = Math.min(viewport.width, size.width);
  const height = Math.min(viewport.height, size.height);
  return {
    height: Math.round(height),
    width: Math.round(width),
    x: Math.round(Math.max(0, Math.min(viewport.width - width, point.x - width / 2))),
    y: Math.round(Math.max(0, Math.min(viewport.height - height, point.y - height / 2))),
  };
}

test.describe("pharosville normal motion", () => {
  test(...visualLane("motion", "starts bounded world animation and keeps moving ship targets selectable"), async ({ page }) => {
    await mockPharosVilleData(page);
    await installWallClockOverride(page, 12);
    await page.clock.install({ time: new Date("2026-04-28T00:00:00Z") });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await waitForRuntimeDebug(page, false);

    const movedSample = await waitForMovingShipSample(page);
    const runtime = await readRuntimeSnapshot(page);
    expect(runtime.activeMotionLoopCount).toBe(1);
    expect(runtime.motionClockSource).toBe("requestAnimationFrame");
    expect(runtime.motionCueCounts?.selectedRelationshipOverlays).toBeLessThanOrEqual(1);
    expect(runtime.motionCueCounts?.ambientBirds).toBeLessThanOrEqual(9);
    expect(runtime.motionCueCounts?.harborLights).toBeLessThanOrEqual(3);
    expect(runtime.motionCueCounts?.effectShips ?? 0).toBeLessThanOrEqual(runtime.motionCueCounts?.animatedShips ?? 0);
    expect(runtime.renderMetrics?.drawableCount).toBeGreaterThan(0);
    expect(runtime.renderMetrics?.drawableCounts.body).toBeGreaterThan(0);
    // Single-sample budget. History: 90 → 100 → 120 → 200ms (raised after CI
    // run 25283670916 observed 166ms on a single frame from cold sprite-bake
    // variance). Tightened to 180ms (perf-anim-routing follow-up, 2026-05-03)
    // after Phase A–E landed: terrain gradient cache (C1), night-tint vignette
    // cache (C2), sin LUT (C8), per-pass savings in lighthouse/docks/maker-
    // squad-chrome. The 180ms ceiling sits above the 166ms cold-start spike
    // with headroom for CI worker variance; sustained-motion regressions
    // (post-warmup) are caught by the dedicated `npm run test:perf` lane
    // (median ≤ 140ms, p95 ≤ 200ms over a 5s window).
    expect(runtime.renderMetrics?.drawDurationMs ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(180);
    expect(runtime.renderMetrics?.movingShipCount).toBeGreaterThan(0);
    expect(runtime.renderMetrics?.visibleTileCount).toBeGreaterThan(0);
    const movingDetailId = `ship.${movedSample.id}`;
    const selection = await clickMapTargetWithPoint(page, "ship", movingDetailId);
    expect(selection.detailId).toBe(movingDetailId);
    await waitForSelectedDetail(page, movingDetailId);
    await page.clock.fastForward(1_000);
    await page.waitForFunction((detailId) => {
      const debug = (window as typeof window & {
        __pharosVilleDebug?: PharosVilleVisualDebug;
      }).__pharosVilleDebug;
      return debug?.selectedDetailId === detailId && (debug.renderMetrics?.drawableCounts.selection ?? 0) > 0;
    }, movingDetailId);
    const selectedRuntime = await readRuntimeSnapshot(page);
    expect(selectedRuntime.renderMetrics?.drawableCounts.selection).toBeGreaterThan(0);
    await expect(page.getByTestId("pharosville-detail-panel")).toContainText("Currently");
    await expect(page.getByTestId("pharosville-detail-panel")).toContainText("Home dock");
    await expect(page.getByTestId("pharosville-detail-panel")).toContainText("Chains");
    await expect(page.getByTestId("pharosville-accessibility-ledger")).toContainText("route summary:");
    await expect(page.getByTestId("pharosville-accessibility-ledger")).toContainText("risk water Calm Anchorage");
    await expect(page.getByTestId("pharosville-accessibility-ledger")).toContainText("risk zone");

    const followDistances: number[] = [];
    const firstFollowSnapshot = await readSelectedTargetFollowSnapshot(page, movingDetailId);
    expect(firstFollowSnapshot.targetCenter).not.toBeNull();
    if (firstFollowSnapshot.targetCenter) {
      followDistances.push(distance(firstFollowSnapshot.targetCenter, firstFollowSnapshot.viewportCenter));
    }
    const followButton = page.getByRole("button", { name: "Follow selected" });
    await expect(followButton).toBeEnabled();
    await followButton.click();
    for (let step = 0; step < 5; step += 1) {
      await page.clock.fastForward(250);
      const snapshot = await readSelectedTargetFollowSnapshot(page, movingDetailId);
      expect(snapshot.selectedDetailId).toBe(movingDetailId);
      expect(snapshot.cameraWithinBounds).toBe(true);
      expect(snapshot.targetCenter).not.toBeNull();
      if (snapshot.targetCenter) {
        followDistances.push(distance(snapshot.targetCenter, snapshot.viewportCenter));
      }
    }
    expect(followDistances.length).toBeGreaterThanOrEqual(4);
    const initialFollowDistance = followDistances[0]!;
    const finalFollowDistance = followDistances[followDistances.length - 1]!;
    expect(finalFollowDistance).toBeLessThanOrEqual(Math.max(220, initialFollowDistance * 1.05));
  });
});

async function readSelectedTargetFollowSnapshot(page: Page, detailId: string) {
  return page.evaluate((targetDetailId) => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: PharosVilleVisualDebug;
    }).__pharosVilleDebug;
    const target = debug?.targets?.find((entry) => entry.detailId === targetDetailId) ?? null;
    return {
      cameraWithinBounds: debug?.cameraWithinBounds ?? null,
      selectedDetailId: debug?.selectedDetailId ?? null,
      targetCenter: target
        ? {
            x: target.rect.x + target.rect.width / 2,
            y: target.rect.y + target.rect.height / 2,
          }
        : null,
      viewportCenter: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    };
  }, detailId);
}

function distance(first: { x: number; y: number }, second: { x: number; y: number }) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

async function performCanvasPinch(
  page: Page,
  input: { endDistance: number; startDistance: number },
): Promise<void> {
  await page.getByTestId("pharosville-canvas").evaluate((node, gesture) => {
    const canvas = node as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    const pointer = (type: string, pointerId: number, x: number, y: number) => {
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
        cancelable: true,
        clientX: x,
        clientY: y,
        composed: true,
        height: 8,
        isPrimary: pointerId === 41,
        pointerId,
        pointerType: "touch",
        width: 8,
      }));
    };
    const startHalf = gesture.startDistance / 2;
    const endHalf = gesture.endDistance / 2;
    pointer("pointerdown", 41, center.x - startHalf, center.y);
    pointer("pointerdown", 42, center.x + startHalf, center.y);
    pointer("pointermove", 41, center.x - endHalf, center.y);
    pointer("pointermove", 42, center.x + endHalf, center.y);
    pointer("pointerup", 41, center.x - endHalf, center.y);
    pointer("pointerup", 42, center.x + endHalf, center.y);
  }, input);
}

async function waitForMovingShipSample(page: Page) {
  const first = await readRuntimeSnapshot(page);
  expect(first.reducedMotion).toBe(false);
  expect(first.shipMotionSamples.length).toBeGreaterThan(0);
  await page.clock.fastForward(30_000);
  const second = await readRuntimeSnapshot(page);
  expect(second.motionFrameCount).toBeGreaterThan(first.motionFrameCount);

  const firstById = new Map(first.shipMotionSamples.map((sample) => [sample.id, sample]));
  const transitStates = new Set(["departing", "arriving", "sailing"]);
  const movedSample = second.shipMotionSamples.find((sample) => {
    const previous = firstById.get(sample.id);
    return Boolean(previous && transitStates.has(sample.state) && Math.hypot(sample.x - previous.x, sample.y - previous.y) > 0.25);
  });
  expect(movedSample).toBeDefined();
  return movedSample!;
}

async function canvasPixelStats(page: Page) {
  return page.getByTestId("pharosville-canvas").evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context) return { backingPixels: 0, landPixels: 0, waterPixels: 0 };
    const sampleWidth = canvas.width;
    const sampleHeight = canvas.height;
    const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);
    let landPixels = 0;
    let waterPixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const isDuskSkyBand = (
        red > 120
        && green > 70
        && blue > 45
        && red >= green + 28
        && green >= blue - 8
      );
      const isWaterBand = (
        blue > 40
        && green > 35
        && blue >= red + 6
        && green >= red - 12
      ) || (
        green > 55
        && blue > 45
        && red < 95
        && green >= red + 8
        && blue >= red + 12
        && Math.abs(blue - green) < 45
      );
      const isTerrainBand = !isWaterBand && !isDuskSkyBand && (
        (red > 110 && green > 85 && blue < 145 && red >= blue + 14)
        || (green > 58 && green >= red + 6 && green >= blue - 8 && blue < 145)
        || (red > 70 && green > 60 && blue > 45 && max - min < 55)
      );
      if (isTerrainBand) landPixels += 1;
      if (isWaterBand) waterPixels += 1;
    }
    return {
      backingPixels: canvas.width * canvas.height,
      landPixels,
      waterPixels,
    };
  });
}

test.describe("pharosville night atmosphere", () => {
  test("renders mid-dawn with partial night tint", async ({ page }) => {
    await mockPharosVilleData(page);
    await installWallClockOverride(page, 6);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");
    await waitForRuntimeDebug(page, true);
    await expectNoAssetLoadErrors(page);
    await expect(page).toHaveScreenshot("pharosville-dawn.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.005,
    });
  });

  test("renders mid-dusk with partial night tint and warming lighthouse", async ({ page }) => {
    await mockPharosVilleData(page);
    await installWallClockOverride(page, 19);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");
    await waitForRuntimeDebug(page, true);
    await expectNoAssetLoadErrors(page);
    // Slightly looser than the dawn/night siblings: the warming-lighthouse
    // interpolation hits the lighthouse-hill + cemetery-islet sprites at the
    // same time, and CI hardware/rasteriser differences accumulate ~1% of
    // pixels there. Local + Docker container both stay well under this.
    await expect(page).toHaveScreenshot("pharosville-dusk.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.012,
    });
  });

  test("renders deep-night with dominant lighthouse glow and warm water pool", async ({ page }) => {
    await mockPharosVilleData(page);
    await installWallClockOverride(page, 22);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/");
    await waitForRuntimeDebug(page, true);
    await expectNoAssetLoadErrors(page);
    await expect(page).toHaveScreenshot("pharosville-night.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.005,
    });
  });
});

assertVisualLaneCoverage();
