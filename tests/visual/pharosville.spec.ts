import { expect, test, type Page } from "@playwright/test";
import { denseFixtureStablecoins } from "../../src/__fixtures__/pharosville-world";
import {
  denyPharosVilleViewportGatedRequests,
  installWallClockOverride,
  mockDensePharosVilleData,
  mockPharosVilleData,
  mockScreenSize,
  readRuntimeSnapshot,
  readVisualDebug,
  waitForRuntimeDebug,
} from "../helpers/pharosville-debug";

type VisualLane = "accessibility" | "interaction" | "static";

const visualLaneTags: Record<VisualLane, string> = {
  accessibility: "@visual-accessibility",
  interaction: "@visual-interaction",
  static: "@visual-static",
};

function visualLane(lane: VisualLane, title: string): [string, { tag: string }] {
  return [title, { tag: visualLaneTags[lane] }];
}

test(...visualLane("static", "the world is nonblank, resize-safe, and honors reduced motion"), async ({ page }) => {
  await mockPharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockScreenSize(page, 1920, 1080);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto("/?debug=1");

  const closeLegend = page.getByRole("button", { name: "Close legend" });
  if (await closeLegend.isVisible()) await closeLegend.click();
  const canvas = page.getByTestId("pharosville-canvas");
  await expect(canvas).toHaveAttribute("data-renderer", "three");
  await expect(canvas).toHaveAttribute("data-renderer-status", "ready");
  await waitForRuntimeDebug(page, true);
  await expect(page.getByTestId("pharosville-renderer-fallback")).toHaveCount(0);

  const closeDetails = page.getByRole("button", { name: "Close details" });
  if (await closeDetails.isVisible()) await closeDetails.click();
  await page.getByRole("button", { name: "Reset view" }).click();

  const canvasCapture = await canvas.screenshot();
  expect(canvasCapture.byteLength).toBeGreaterThan(10_000);
  const renderProof = await page.evaluate(() => {
    const debug = (window as typeof window & {
      __pharosVilleDebug?: {
        renderMetrics?: {
          gpu?: { calls?: number; geometries?: number; triangles?: number };
          rendererBackend?: string;
        };
      };
    }).__pharosVilleDebug;
    return {
      gpu: debug?.renderMetrics?.gpu ?? null,
      rendererBackend: debug?.renderMetrics?.rendererBackend ?? null,
    };
  });
  expect(renderProof?.rendererBackend).toBe("three");
  expect(renderProof?.gpu?.calls ?? 0).toBeGreaterThan(0);
  expect(renderProof?.gpu?.geometries ?? 0).toBeGreaterThan(0);
  expect(renderProof?.gpu?.triangles ?? 0).toBeGreaterThan(0);

  const runtime = await readRuntimeSnapshot(page);
  expect(runtime.activeMotionLoopCount).toBe(0);
  expect(runtime.motionClockSource).toBe("reduced-motion-static-frame");
  expect(runtime.timeSeconds).toBe(0);

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(async () => canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    return {
      cssHeight: canvasElement.clientHeight,
      cssWidth: canvasElement.clientWidth,
      height: canvasElement.height,
      width: canvasElement.width,
    };
  })).toEqual({
    cssHeight: 768,
    cssWidth: 1024,
    height: 768,
    width: 1024,
  });

  await page.locator("main").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("pharosville-detail-panel")).toBeVisible();
});

test(...visualLane("static", "blocked viewports request neither world data nor the world renderer"), async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const deniedRequests = await denyPharosVilleViewportGatedRequests(page);
  await mockScreenSize(page, 719, 500);
  await page.setViewportSize({ width: 999, height: 900 });
  await installWallClockOverride(page, 12);
  await page.goto("/");

  await expect(page.getByText("PharosVille needs a wider harbor.")).toBeVisible();
  await expect(page.getByTestId("pharosville-canvas")).toHaveCount(0);
  expect(deniedRequests).toEqual([]);
});

test(...visualLane("accessibility", "search selects and refollows the same ship with usable Escape behavior"), async ({ page }) => {
  const outsiderDetailId = "ship.satusd-river";
  await mockDensePharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockScreenSize(page, 1920, 1080);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto("/?debug=1");
  await waitForRuntimeDebug(page, true);

  const closeDetails = page.getByRole("button", { name: "Close details" });
  if (await closeDetails.isVisible()) await closeDetails.click();
  const search = page.getByRole("combobox", { name: "Find a ship" });
  await search.fill("River Stablecoin");
  await expect(page.getByRole("option", { name: "River Stablecoin" })).toBeVisible();
  await search.press("Enter");

  await expect.poll(async () => (await readVisualDebug(page)).selectedDetailId)
    .toBe(outsiderDetailId);
  await expect(page.getByTestId("pharosville-detail-panel")).toContainText("River Stablecoin");
  await expect.poll(async () => selectedTargetDistanceFromViewportCenter(page, outsiderDetailId))
    .toBeLessThanOrEqual(220);

  await page.getByRole("button", { name: "Reset view" }).click();
  const overviewCamera = (await readVisualDebug(page)).camera;
  await search.fill("River Stablecoin");
  await search.press("Enter");
  await expect.poll(async () => selectedTargetDistanceFromViewportCenter(page, outsiderDetailId))
    .toBeLessThanOrEqual(220);
  expect((await readVisualDebug(page)).camera).not.toEqual(overviewCamera);

  await search.fill("River");
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(page.getByTestId("pharosville-detail-panel")).toBeVisible();
  await search.press("Escape");
  await expect(page.getByTestId("pharosville-detail-panel")).toHaveCount(0);
});

test(...visualLane("interaction", "deep links follow transient ships and preserve complete dock geography"), async ({ page }) => {
  await mockDensePharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockScreenSize(page, 1920, 1080);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto("/?debug=1");
  await waitForRuntimeDebug(page, true);

  const closeDetails = page.getByRole("button", { name: "Close details" });
  if (await closeDetails.isVisible()) await closeDetails.click();
  await expect.poll(async () => shipTargetIds(page)).toHaveLength(20);
  const representativeDetailIds = new Set(await shipTargetIds(page));
  const outsider = denseFixtureStablecoins.peggedAssets.find(
    (asset, index) => (
      index % 5 === 0
      && !representativeDetailIds.has(`ship.${asset.id}`)
    ),
  );
  expect(outsider).toBeDefined();
  if (!outsider) throw new Error("Dense fixture must include a non-representative ship.");
  const outsiderDetailId = `ship.${outsider.id}`;

  await page.goto("about:blank");
  await page.goto(`/?debug=1#sel=${outsiderDetailId}`);
  await waitForRuntimeDebug(page, true);
  await expect.poll(async () => {
    const debug = await readVisualDebug(page);
    const shipIds = debug.targets?.filter(({ kind }) => kind === "ship").map(({ detailId }) => detailId) ?? [];
    return {
      hasOutsider: shipIds.includes(outsiderDetailId),
      selectedDetailId: debug.selectedDetailId,
      shipCount: shipIds.length,
    };
  }).toEqual({
    hasOutsider: true,
    selectedDetailId: outsiderDetailId,
    shipCount: 21,
  });

  const detailPanel = page.getByTestId("pharosville-detail-panel");
  await expect(detailPanel).toContainText(outsider.name);
  await expect(detailPanel).toContainText("Currently");
  await expect(detailPanel).toContainText("Home dock");
  await expect(detailPanel).toContainText("Chains");
  await expect(closeDetails).toBeFocused();

  const ledger = page.getByTestId("pharosville-accessibility-ledger");
  await expect(ledger).toContainText(outsider.name);
  await expect(ledger).toContainText("route summary:");
  await expect(ledger).toContainText("risk water");
  await expect(ledger).toContainText("risk zone");

  const followButton = page.getByRole("button", { name: "Follow selected" });
  await expect(followButton).toBeEnabled();
  await followButton.click();
  await expect.poll(async () => selectedTargetDistanceFromViewportCenter(page, outsiderDetailId))
    .toBeLessThanOrEqual(220);
  const followedDebug = await readVisualDebug(page);
  expect(followedDebug.cameraWithinBounds).toBe(true);
  expect(followedDebug.selectedDetailId).toBe(outsiderDetailId);

  const outsiderTarget = followedDebug.targets?.find(
    ({ detailId }) => detailId === outsiderDetailId,
  );
  const canvasBox = await page.getByTestId("pharosville-canvas").boundingBox();
  expect(outsiderTarget).toBeDefined();
  expect(canvasBox).not.toBeNull();
  await page.mouse.click(
    canvasBox!.x + outsiderTarget!.rect.x + outsiderTarget!.rect.width / 2,
    canvasBox!.y + outsiderTarget!.rect.y + outsiderTarget!.rect.height / 2,
  );
  await expect.poll(async () => {
    const debug = await readVisualDebug(page);
    return {
      selectedDetailId: debug.selectedDetailId,
      shipCount: debug.targets?.filter(({ kind }) => kind === "ship").length,
    };
  }).toEqual({ selectedDetailId: outsiderDetailId, shipCount: 21 });

  await closeDetails.focus();
  await page.keyboard.press("Escape");
  await expect(detailPanel).toHaveCount(0);
  await expect(page.getByTestId("pharosville-world")).toBeFocused();
  await expect.poll(async () => shipTargetIds(page)).toHaveLength(20);
  expect(await shipTargetIds(page)).not.toContain(outsiderDetailId);

  await page.getByRole("button", { name: "Reset view" }).click();

  const renderedDetailIds = new Set(
    (await readVisualDebug(page)).targets?.map(({ detailId }) => detailId),
  );
  const expectedDockDetailIds = [
    "dock.ethereum",
    "dock.base",
    "dock.polygon",
    "dock.solana",
    "dock.tron",
    "dock.aptos",
    "dock.avalanche",
    "dock.arbitrum",
  ];
  for (const detailId of expectedDockDetailIds) {
    expect(renderedDetailIds).toContain(detailId);
  }
  const selectedDockDetailId = expectedDockDetailIds[0]!;
  await page.goto("about:blank");
  await page.goto(`/?debug=1#sel=${selectedDockDetailId}`);
  await waitForRuntimeDebug(page, true);
  await expect.poll(async () => {
    const debug = await readVisualDebug(page);
    return debug.selectedDetailId;
  }).toBe(selectedDockDetailId);
  await expect(page.getByRole("button", { name: "Follow selected" })).toBeEnabled();
});

async function shipTargetIds(page: Page): Promise<string[]> {
  const debug = await readVisualDebug(page);
  return debug.targets?.filter(({ kind }) => kind === "ship").map(({ detailId }) => detailId) ?? [];
}

async function selectedTargetDistanceFromViewportCenter(
  page: Page,
  detailId: string,
): Promise<number> {
  const debug = await readVisualDebug(page);
  const target = debug.targets?.find((entry) => entry.detailId === detailId);
  if (!target) return Number.POSITIVE_INFINITY;
  return Math.hypot(
    target.rect.x + target.rect.width / 2 - 720,
    target.rect.y + target.rect.height / 2 - 500,
  );
}
