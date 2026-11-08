import { expect, test, type Request, type Page } from "@playwright/test";

/**
 * The Harbour's DOM contract. DOM state only, never pixels: looks and frame time
 * are judged on the real GPU with `npm run preview` (docs/pharosville/TESTING.md).
 */
import { loadRequestClassifier, requestClassifier } from "../helpers/request-classifier";
import { shouldUseHardwareGpu } from "../helpers/playwright-config";
import { replayInitScript } from "../helpers/scenario";
import current from "../fixtures/scenarios/current.json";
import empty from "../fixtures/scenarios/empty.json";
import type { ReadinessState } from "../../src/harbour/engine/types";

const deniedWebGL = async (page: Page) => page.addInitScript({ content: `
const originalContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, ...args) {
  return /^webgl/.test(type) ? null : originalContext.call(this, type, ...args);
};` });

test.describe("first paint", () => {
  test.use({ javaScriptEnabled: false });

  test("carries identity, the poster, the guide and the links without JavaScript @visual-dom @visual-accessibility", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("PharosVille: a living stablecoin harbour");
    await expect(page.getByRole("heading", { level: 1, name: "PharosVille" })).toBeVisible();
    await expect(page.locator("#pv-poster img")).toHaveCount(1);
    await expect(page.locator("#root dt")).toHaveText(["Boats", "Lighthouse", "Sea and sky"]);
    await expect(page.getByRole("link", { name: "Open Pharos analytics" })).toHaveAttribute("href", "https://pharos.watch/");
  });
});

test.describe("small screen", () => {
  test.use({ viewport: { width: 390, height: 844 }, contextOptions: { screen: { width: 390, height: 844 } } });

  test("gets the welcome page and requests no world data or runtime @visual-dom @visual-accessibility", async ({ page }, testInfo) => {
    const isWorld = testInfo.config.configFile?.includes("dist") ? loadRequestClassifier() : requestClassifier();
    const worldRequests: string[] = [];
    page.on("request", (request: Request) => { if (isWorld(request.url())) worldRequests.push(request.url()); });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 2, name: "PharosVille" })).toBeVisible();
    // Firefox does not emulate `screen`, so it may take the window-too-small branch: both are the gate.
    await expect(page.getByText(/open a larger screen|Give this window more room/)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Pharos analytics" }).getByRole("link")).toHaveCount(5);
    await expect(page.locator("#pv-poster")).toHaveCount(0);
    await page.waitForTimeout(1000);
    expect(worldRequests).toEqual([]);
  });
});

// CI deliberately denies WebGL; this is a failure contract, never proof that graphics started.
test("intentional WebGL denial retains the poster, useful status and links @visual-dom", async ({ page }) => {
  await deniedWebGL(page);
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText(/could not start|graphics features/, { timeout: 45_000 });
  await expect(page.locator("#pv-poster")).toHaveCount(1);
  await expect(page.locator("html")).not.toHaveAttribute("data-pv-live");
  await expect(page.getByRole("link", { name: "Open Pharos analytics" })).toBeVisible();
});

for (const [width, height] of [[719, 600], [720, 599], [720, 600], [600, 720]]) test.describe(`${width}×${height} window boundary`, () => {
  test.use({ viewport: { width, height }, contextOptions: { screen: { width: 2560, height: 1440 } } });
  test("admits exactly the sorted size profile and cancels/readmits @visual-dom", async ({ page }, testInfo) => {
    const isWorld = testInfo.config.configFile?.includes("dist") ? loadRequestClassifier() : requestClassifier();
    const requests: string[] = [];
    page.on("request", (request) => { if (isWorld(request.url())) requests.push(request.url()); });
    await deniedWebGL(page);
    await page.goto("/");
    const denied = width < 720 && height < 720 || Math.min(width, height) < 600;
    if (denied) {
      await expect(page.getByText(/Give this window more room/)).toBeVisible();
      await page.waitForTimeout(1000); expect(requests).toEqual([]);
      await expect(page.locator("#pv-poster")).toHaveCount(0);
    } else {
      await expect(page.getByRole("status")).toContainText(/could not start|graphics features/, { timeout: 45_000 });
      expect(requests.length).toBeGreaterThan(0);
    }
    await page.setViewportSize({ width: 719, height: 600 });
    await expect(page.getByText(/Give this window more room/)).toBeVisible();
    await expect(page.locator(".pv-world canvas")).toHaveCount(0);
    requests.length = 0; await page.waitForTimeout(1000); expect(requests).toEqual([]);
    await page.setViewportSize({ width: 600, height: 720 });
    await expect(page.getByRole("status")).toContainText(/could not start|graphics features/, { timeout: 45_000 });
    await expect(page.locator("#pv-poster")).toHaveCount(1);
  });
});

// Hardware-required correctness is explicitly skipped on the intentional GPU-less CI lane.
for (const [name, width, height] of [["desktop", 1440, 960], ["tablet", 744, 1133], ["unfolded foldable", 832, 680], ["wide boundary", 720, 600], ["tall boundary", 600, 720]] as const) test.describe(name, () => {
  test.use({ viewport: { width, height }, contextOptions: { screen: { width, height } } });
  for (const [fixtureName, fixture] of [["current", current], ["empty", empty]] as const) test(`requires a coherent completed ${fixtureName} fleet on hardware @visual-dom @hardware-required`, async ({ page }) => {
    test.skip(!shouldUseHardwareGpu(), "Hardware correctness requires the real-GPU lane; denial is tested separately.");
    const expectedBoats = fixture.steps[0]!.responses["/api/stablecoins"].body.peggedAssets.length;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.addInitScript({ content: replayInitScript(fixture) });
    await page.goto("/?intro=0");
    await expect.poll(() => page.evaluate((count) => {
      const engine = window.__harbour, stats = window.__harbourStats;
      const readiness = engine?.ctx.services.get("readiness") as ReadinessState | undefined;
      return !!engine && readiness?.prepared && readiness.revision > 0 && readiness.boats === count
        && stats?.renderedRevision === readiness.revision && stats.renderedBoats === count;
    }, expectedBoats), { timeout: 45_000 }).toBe(true);
    const renderer = await page.evaluate(() => {
      const gl = window.__harbour!.ctx.renderer.getContext();
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "unknown";
    });
    expect(renderer).not.toMatch(/unknown|none|swiftshader|llvmpipe|software/i);
    await expect(page.locator("#pv-poster")).toHaveCount(0);
    await expect(page.locator(".pv-arrival")).toHaveCount(0);
    await expect(page.locator(".pv-world canvas")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});
