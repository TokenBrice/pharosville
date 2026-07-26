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
  rendererReachedWorld,
  waitForRuntimeDebug,
} from "../helpers/pharosville-debug";

type VisualLane = "accessibility" | "dom" | "interaction" | "static";

const visualLaneTags: Record<VisualLane, string> = {
  accessibility: "@visual-accessibility",
  // GPU-free: everything this test asserts is DOM. The CI runners have no GPU
  // — Firefox in the playwright container gets no WebGL context at all — so
  // this is the lane CI can actually prove. See TESTING.md.
  dom: "@visual-dom",
  interaction: "@visual-interaction",
  static: "@visual-static",
};

function visualLane(lane: VisualLane, title: string): [string, { tag: string }] {
  return [title, { tag: visualLaneTags[lane] }];
}

test(...visualLane("static", "the world is nonblank, resize-safe, and honors reduced motion"), async ({ page }) => {
  const retiredMediaRequests: string[] = [];
  const retiredRasterPrefix = `/${["pharosville", "assets"].join("/")}/`;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      path.startsWith(retiredRasterPrefix)
      || path.startsWith("/chains/")
      || path.startsWith("/logos/cemetery/")
      || path.startsWith("/sail-emblems/")
    ) retiredMediaRequests.push(path);
  });
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
  await page.getByRole("button", { name: "Legend" }).click();
  await expect(page.getByRole("dialog", { name: "Legend" })).toBeVisible();
  await page.getByRole("button", { name: "Close legend" }).click();
  expect(retiredMediaRequests).toEqual([]);

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

test(...visualLane("dom", "blocked viewports request neither world data nor the world renderer"), async ({ page }) => {
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

test(...visualLane("dom", "browser chrome keeps minimum targets and stable scene scrims"), async ({ page }) => {
  await mockPharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockScreenSize(page, 1920, 1080);
  await page.setViewportSize({ width: 720, height: 900 });
  await installWallClockOverride(page, 12);
  await page.goto("/");

  await expect(page.getByTestId("pharosville-world")).toBeVisible();
  const contract = await page.evaluate(() => {
    const world = document.querySelector<HTMLElement>('[data-testid="pharosville-world"]');
    if (!world) throw new Error("World chrome did not mount.");

    const probe = (className: string, tagName = "button") => {
      const element = document.createElement(tagName);
      element.className = className;
      element.textContent = "Probe";
      world.append(element);
      const style = getComputedStyle(element);
      const result = {
        backgroundColor: style.backgroundColor,
        fontSize: Number.parseFloat(style.fontSize),
        height: Number.parseFloat(style.height),
        minHeight: Number.parseFloat(style.minHeight),
        opacity: Number.parseFloat(style.opacity),
        width: Number.parseFloat(style.width),
      };
      element.remove();
      return result;
    };
    const alpha = (color: string): number => {
      const match = color.match(/rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+))?\)/);
      return match?.[1] ? Number.parseFloat(match[1]) : 1;
    };
    const footer = getComputedStyle(document.querySelector<HTMLElement>(".pharosville-footer")!);
    const quickField = probe("pharosville-quick-find__field", "div");
    const notice = probe("pv-notice");
    return {
      detailClose: probe("pharosville-detail-panel__close"),
      detailCopy: probe("pharosville-detail-panel__copy"),
      footer: {
        backgroundAlpha: alpha(footer.backgroundColor),
        fontSize: Number.parseFloat(footer.fontSize),
      },
      glyph: probe("pv-glyph-button"),
      noticeDismiss: probe("pv-notice__dismiss"),
      noticeScrimAlpha: alpha(notice.backgroundColor),
      quickFieldScrimAlpha: alpha(quickField.backgroundColor),
      quickResult: probe("pharosville-quick-find__result", "li"),
    };
  });

  expect(contract.detailClose.minHeight).toBeGreaterThanOrEqual(24);
  expect(contract.detailCopy.minHeight).toBeGreaterThanOrEqual(24);
  expect(contract.noticeDismiss.width).toBeGreaterThanOrEqual(24);
  expect(contract.noticeDismiss.height).toBeGreaterThanOrEqual(24);
  expect(contract.quickResult.minHeight).toBeGreaterThanOrEqual(36);
  expect(contract.footer.fontSize).toBeGreaterThanOrEqual(13);
  expect(contract.footer.backgroundAlpha).toBeGreaterThanOrEqual(0.75);
  expect(contract.noticeScrimAlpha).toBeGreaterThanOrEqual(0.85);
  expect(contract.quickFieldScrimAlpha).toBeGreaterThanOrEqual(0.9);
  expect(contract.glyph.opacity).toBeGreaterThanOrEqual(0.7);
});

test.describe("touch chrome", () => {
  test.use({ hasTouch: true });

  test(...visualLane("dom", "hoverless pointers receive 44px standalone targets"), async ({ page }) => {
    await mockPharosVilleData(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockScreenSize(page, 1920, 1080);
    await page.setViewportSize({ width: 720, height: 900 });
    await installWallClockOverride(page, 12);
    await page.goto("/");

    await expect(page.getByTestId("pharosville-world")).toBeVisible();
    const sizes = await page.evaluate(() => {
      const world = document.querySelector<HTMLElement>('[data-testid="pharosville-world"]');
      if (!world) throw new Error("World chrome did not mount.");
      const size = (className: string) => {
        const button = document.createElement("button");
        button.className = className;
        world.append(button);
        const rect = button.getBoundingClientRect();
        button.remove();
        return { height: rect.height, width: rect.width };
      };
      return {
        detailClose: size("pharosville-detail-panel__close"),
        glyph: size("pv-glyph-button"),
        hoverless: matchMedia("(hover: none)").matches,
        noticeDismiss: size("pv-notice__dismiss"),
      };
    });

    expect(sizes.hoverless).toBe(true);
    expect(sizes.detailClose.height).toBeGreaterThanOrEqual(44);
    expect(sizes.glyph.height).toBeGreaterThanOrEqual(44);
    expect(sizes.glyph.width).toBeGreaterThanOrEqual(44);
    expect(sizes.noticeDismiss.height).toBeGreaterThanOrEqual(44);
    expect(sizes.noticeDismiss.width).toBeGreaterThanOrEqual(44);
  });
});

test(...visualLane("accessibility", "a shared ship link selects and frames that ship with usable Escape behavior"), async ({ page }) => {
  // The fleet search is retired (interface revamp DU2). A shared `#sel=` link
  // is now how a non-representative ship is reached, framed and dismissed.
  const outsiderDetailId = "ship.satusd-river";
  await mockDensePharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockScreenSize(page, 1920, 1080);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto(`/?debug=1#sel=${outsiderDetailId}`);
  await waitForRuntimeDebug(page, true);

  await expect.poll(async () => (await readVisualDebug(page)).selectedDetailId)
    .toBe(outsiderDetailId);
  await expect(page.getByTestId("pharosville-detail-panel")).toContainText("River Stablecoin");
  // Camera framing of a deep-linked outsider is asserted by the interaction
  // lane below; this case owns the DOM contract — selection, panel, Escape.

  // Recentring leaves the selection intact, and Escape closes the panel.
  await page.getByRole("button", { name: "Reset view" }).click();
  await expect(page.getByTestId("pharosville-detail-panel")).toBeVisible();

  await page.getByRole("button", { name: "Close details" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pharosville-detail-panel")).toHaveCount(0);
  await expect(page.getByTestId("pharosville-world")).toBeFocused();
});

test(...visualLane("interaction", "deep links reach an off-screen ship and preserve complete dock geography"), async ({ page }) => {
  await mockDensePharosVilleData(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockScreenSize(page, 1920, 1080);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWallClockOverride(page, 12);
  await page.goto("/?debug=1");
  await waitForRuntimeDebug(page, true);

  const closeDetails = page.getByRole("button", { name: "Close details" });
  if (await closeDetails.isVisible()) await closeDetails.click();
  // This test used to reach for a TRANSIENT ship — one past the render cap,
  // drawn only because it was selected. That scenario no longer exists: the
  // Grand Scale Revamp raised the cap to 320, and neither the dense fixture
  // (~132 ships) nor the live fleet (187) comes near it, so
  // `selectGardenTransientShip` never fires. Recorded in TESTING.md.
  //
  // What a deep link still has to do is reach a ship the default framing does
  // not show, and the enlarged map gives us plenty: hit targets are
  // VIEWPORT-CULLED, so a rendered ship in a far corner has no target until the
  // camera goes there. That is the case worth covering, and it is what the old
  // selection actually found — which is why the "rendered in addition to the
  // representative set" counts it asserted could never hold.
  let previousShipCount = -1;
  await expect.poll(async () => {
    const count = (await shipTargetIds(page)).length;
    const settled = count > 10 && count === previousShipCount;
    previousShipCount = count;
    return settled;
  }).toBe(true);
  const onScreenDetailIds = new Set(await shipTargetIds(page));
  const outsider = denseFixtureStablecoins.peggedAssets.find(
    (asset, index) => (
      index % 5 === 0
      && !onScreenDetailIds.has(`ship.${asset.id}`)
    ),
  );
  expect(outsider).toBeDefined();
  if (!outsider) throw new Error("Dense fixture must include an off-screen ship.");
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
    };
  }).toEqual({
    hasOutsider: true,
    selectedDetailId: outsiderDetailId,
  });

  const detailPanel = page.getByTestId("pharosville-detail-panel");
  await expect(detailPanel).toContainText(outsider.name);
  // Opening a detail moves focus INTO the panel — assert that before the
  // disclosure click, not after. Clicking a `<summary>` focuses the summary,
  // which is the browser doing the right thing, so asserting Close still holds
  // focus afterwards was asserting that the click did not land.
  await expect(closeDetails).toBeFocused();
  // Density now waits inside the record disclosure (interface revamp DU5);
  // open it explicitly rather than relying on collapsed text matching.
  await page.getByTestId("pharosville-detail-record").getByText("Read the record").click();
  await expect(detailPanel).toContainText("Currently");
  await expect(detailPanel).toContainText("Home dock");
  await expect(detailPanel).toContainText("Chains");

  const ledger = page.getByTestId("pharosville-accessibility-ledger");
  await expect(ledger).toContainText(outsider.name);
  await expect(ledger).toContainText("route summary:");
  await expect(ledger).toContainText("risk water");
  await expect(ledger).toContainText("risk zone");

  // Follow-selected lost its button (interface revamp DU1): a `#sel=` deep
  // link frames the ship on arrival, which is the path that remains.
  //
  // FRAMED, not centred. The camera clamps to the map, so a ship near an edge —
  // and the storm shelf is a corner — cannot be brought to the middle however
  // hard the deep link tries. Measured 348px from centre in a 1440x1000
  // viewport, which is correct behaviour, not drift. What the contract actually
  // owes is a ship you can see and click, so assert that: fully on screen.
  await expect.poll(async () => selectedTargetWithinViewport(page, outsiderDetailId)).toBe(true);
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
    return { selectedDetailId: debug.selectedDetailId };
  }).toEqual({ selectedDetailId: outsiderDetailId });

  await closeDetails.focus();
  await page.keyboard.press("Escape");
  await expect(detailPanel).toHaveCount(0);
  await expect(page.getByTestId("pharosville-world")).toBeFocused();

  // Reset view restores the exact framing the first phase measured, so the
  // off-screen ship goes back off screen. Targets are viewport-culled, so this
  // is the one comparison between the two cameras that is meaningful.
  await page.getByRole("button", { name: "Reset view" }).click();
  await expect.poll(async () => shipTargetIds(page)).toEqual([...onScreenDetailIds]);

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
});

// ---------------------------------------------------------------------------
// The failure and staleness half of the data path.
//
// Every other lane mocks all six feeds as fresh successes, so the code that
// only runs when a feed is broken or old had no browser coverage at all. These
// three cover the three outcomes a visitor can actually get.
// ---------------------------------------------------------------------------

const DATA_PATH_VIEWPORT = { height: 1000, width: 1440 };

async function expectRouteMode(page: Page, mode: string): Promise<void> {
  const routeMode = page.getByTestId("pharosville-accessibility-ledger").locator("dt:text-is('Route mode') + dd");
  // Longer than the default expect timeout: a cold Vite transform of the whole
  // world graph is slower than any of these tests' own waits.
  await expect(routeMode).toHaveText(mode, { timeout: 30_000 });
  // Named explicitly so a crash inside the world reads as a crash rather than
  // as a missing element.
  await expect(page.getByText("The harbor did not render.")).toHaveCount(0);
}

async function openHarbor(page: Page, url: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockScreenSize(page, 1920, 1080);
  await page.setViewportSize(DATA_PATH_VIEWPORT);
  await installWallClockOverride(page, 12);
  // "commit" rather than the default "load": a hung feed can leave the load
  // event outstanding, and every assertion below polls anyway.
  await page.goto(url, { waitUntil: "commit" });
}

test(...visualLane("dom", "an enrichment feed that never answers still opens the harbor, under caveat"), async ({ page }) => {
  // Built from a live incident: `/api/stablecoins` 502'd for 8s and, because
  // the world waited for all six feeds, five good payloads sat in memory
  // behind an empty sea for ten seconds. The fix was a short grace window
  // after which the essentials publish alone — and it had no regression guard,
  // so a refactor could quietly restore the empty sea.
  //
  // These two feeds HANG rather than fail. A 502 exhausts its retries and
  // settles the query, which opens the world through a different door
  // (`initialQueryWaveSettled`); only a feed that never answers proves the
  // grace window itself is what let the visitor in.
  await mockDensePharosVilleData(page, { failures: { pegSummary: "hang", stress: "hang" } });
  await openHarbor(page, "/?debug=1&t=12");

  await expectRouteMode(page, "world");
  // The fleet reaching the canvas is the strongest form of "opened", but this
  // is a @visual-dom test and CI runs that lane on a browser with no WebGL, so
  // the renderer half is asserted only where a renderer exists. The ledger
  // assertions below carry the contract either way.
  if (await rendererReachedWorld(page)) {
    await waitForRuntimeDebug(page, true);
    expect((await shipTargetIds(page)).length).toBeGreaterThan(0);
  }

  // The enrichment really is missing, and the fleet says so rather than
  // presenting a placement it cannot support.
  const ledger = page.getByTestId("pharosville-accessibility-ledger");
  await expect(ledger).toContainText("placement evidence Missing or low-confidence price evidence");
  await expect(ledger).toContainText("evidence status caveat");
  await expect(ledger).not.toContainText("risk anchor storm-shelf");

  // Missing enrichment is a caveat, not a failure: no error route.
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test(...visualLane("dom", "every feed failing shows the error route with a retry"), async ({ page }) => {
  // EVERY feed, which is now seven: `mintBurn` joined the world data on
  // 2026-07-26 and this map was not extended with it. One surviving feed is
  // enough for `resolveRouteMode` to keep the world route — correctly, since
  // the error route is for having nothing at all — so the lane was asserting
  // the error route while handing the app a working feed.
  await mockDensePharosVilleData(page, {
    failures: {
      chains: 502,
      mintBurn: 502,
      pegSummary: 502,
      reportCards: 502,
      stability: 502,
      stablecoins: 502,
      stress: 502,
    },
  });
  await openHarbor(page, "/?debug=1&t=12");

  const notice = page.getByRole("alert");
  await expect(notice).toContainText("Signal buoy obscured by fog.");
  await expect(notice.getByRole("button", { name: "Retry" })).toBeVisible();
  await expectRouteMode(page, "error");
  expect(await shipTargetIds(page)).toEqual([]);
});

test(...visualLane("dom", "stale peg and stress evidence reads as a caveat, not as confirmed calm"), async ({ page }) => {
  // The documented invariant is that missing or stale peg evidence is a
  // CAVEAT, never confirmed stress — a ship whose depeg reading has gone old
  // must not keep sitting in storm water on the strength of it. The dense
  // fixture depegs its DANGER and WARNING coins, so absent the staleness they
  // would be placed in risk water; here they must fall back to the safe berth
  // and carry the caveat instead.
  //
  // Both feeds are marked stale together on purpose: peg staleness alone
  // leaves the DEWS stress branch live, which would place the same ships in
  // risk water for a different, still-fresh reason.
  await mockDensePharosVilleData(page, {
    meta: { pegSummary: { status: "stale" }, stress: { status: "stale" } },
  });
  await openHarbor(page, "/?debug=1&t=12");

  await expectRouteMode(page, "world");
  // Same reason as above: everything this test proves lives in the ledger, so
  // it must not hard-require a WebGL context the DOM lane deliberately lacks.
  if (await rendererReachedWorld(page)) await waitForRuntimeDebug(page, true);

  const ledger = page.getByTestId("pharosville-accessibility-ledger");
  await expect(ledger).toContainText("Stale source groups: Peg summary, Stress signals.");
  // Proof the coin really does carry an active depeg — this reason is only
  // reachable when `pegCoin.activeDepeg` is true and the evidence is stale.
  await expect(ledger).toContainText("placement evidence Active depeg evidence is stale");
  await expect(ledger).toContainText("evidence status caveat");

  // ...and no reclassification. Every risk water above calm is driven by peg
  // or stress evidence, so with both stale the fleet may only hold the safe
  // berth or the NAV ledger mooring.
  await expect(ledger).toContainText("risk anchor safe-harbor");
  for (const anchor of ["storm-shelf", "outer-rough-water", "harbor-mouth-watch", "breakwater-edge"]) {
    await expect(ledger).not.toContainText(`risk anchor ${anchor}`);
  }
});

async function shipTargetIds(page: Page): Promise<string[]> {
  const debug = await readVisualDebug(page);
  return debug.targets?.filter(({ kind }) => kind === "ship").map(({ detailId }) => detailId) ?? [];
}

async function selectedTargetWithinViewport(
  page: Page,
  detailId: string,
): Promise<boolean> {
  const debug = await readVisualDebug(page);
  const target = debug.targets?.find((entry) => entry.detailId === detailId);
  if (!target) return false;
  const { height, width, x, y } = target.rect;
  return x >= 0 && y >= 0 && x + width <= 1440 && y + height <= 1000;
}
