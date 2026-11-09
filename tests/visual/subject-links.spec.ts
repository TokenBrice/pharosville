import { expect, test } from "@playwright/test";
import { replayInitScript } from "../helpers/scenario";
import { shouldUseHardwareGpu } from "../helpers/playwright-config";
import current from "../fixtures/scenarios/current.json";

// DOM correctness only. These use the real store; the overlay-only harness substitutes its store.
test.describe("durable subjects @visual-dom @hardware-required", () => {
  test.beforeEach(() => {
    test.skip(!shouldUseHardwareGpu(), "Runtime correctness requires the hardware lane; no pixel or speed judgment.");
  });

  test("Back and Forward retrace deliberate selection and close", async ({ page }) => {
    await page.addInitScript({ content: replayInitScript(current) });
    await page.goto("/?sel=ship.usdc-circle&intro=0");
    await expect(page.locator("#hb-panel-title")).toContainText("USDC", { timeout: 45_000 });
    await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close panel (Esc)", exact: true }).click();
    await expect(page.locator("#hb-panel-title")).toHaveCount(0);
    await page.goBack();
    await expect(page.locator("#hb-panel-title")).toContainText("USDC");
    await page.locator(".hb-panel .hb-sources summary").click();
    await page.locator(".hb-panel .hb-sources button").first().click();
    await expect(page.locator("#hb-panel-title")).toContainText("Keeper");
    await expect(page).toHaveURL(/sel=place\.keeperslog/);
    await page.goBack(); await expect(page.locator("#hb-panel-title")).toContainText("USDC");
    await page.goForward(); await expect(page.locator("#hb-panel-title")).toContainText("Keeper");
    await page.getByRole("button", { name: "Close panel (Esc)", exact: true }).click();
    await page.goBack(); await expect(page.locator("#hb-panel-title")).toContainText("Keeper");
    await page.goForward(); await expect(page.locator("#hb-panel-title")).toHaveCount(0);
  });

  test("a subject waits for fleet and detail readiness, then survives a denied window", async ({ page }) => {
    let release!: () => void;
    const details = new Promise<void>((resolve) => { release = resolve; });
    await page.route(/\/(?:assets\/DetailPanels-[^/]+\.js|src\/harbour\/ui\/DetailPanels\.tsx)(?:\?.*)?$/, async (route) => { await details; await route.continue(); });
    const delayed = structuredClone(current);
    Object.assign(delayed.steps[0]!.responses["/api/stablecoins"], { delayMs: 2000 });
    await page.addInitScript({ content: replayInitScript(delayed) });
    await page.goto("/?sel=ship.usdc-circle&chart=1&intro=0");
    await expect(page.locator("#hb-panel-title")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__harbour?.ctx.services.get("model")?.hasFleet ?? false), { timeout: 45_000 }).toBe(true);
    await expect(page.locator("#hb-panel-title")).toHaveCount(0);
    release();
    await expect(page.locator("#hb-panel-title")).toContainText("USDC", { timeout: 45_000 });
    await page.setViewportSize({ width: 719, height: 600 });
    await expect(page.locator("#hb-panel-title")).toHaveCount(0);
    await expect(page).toHaveURL(/sel=ship\.usdc-circle/);
    await page.setViewportSize({ width: 1440, height: 960 });
    await expect(page.locator("#hb-panel-title")).toContainText("USDC", { timeout: 45_000 });
  });
});
