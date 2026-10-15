import { expect, test, type Request } from "@playwright/test";

/**
 * The Harbour's DOM contract. DOM state only, never pixels: looks and frame time
 * are judged on the real GPU with `npm run preview` (docs/pharosville/TESTING.md).
 */
const WORLD_REQUEST = /\/api\/|\.glb(?:\?|$)|\/assets\/harbour-app-|\/src\/harbour\/(?!app\/poster)/;

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

  test("gets the welcome page and requests no world data or runtime @visual-dom @visual-accessibility", async ({ page }) => {
    const worldRequests: string[] = [];
    page.on("request", (request: Request) => { if (WORLD_REQUEST.test(request.url())) worldRequests.push(request.url()); });
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

// [name, viewport width, viewport height, screen height]: the foldable's browser chrome trims its 750 px screen to 680
const ADMITTED = [["desktop", 1440, 960, 960], ["tablet", 744, 1133, 1133], ["unfolded foldable", 832, 680, 750]] as const;
for (const [name, width, height, screenHeight] of ADMITTED) test.describe(name, () => {
  if (name !== "desktop") test.use({ viewport: { width, height }, contextOptions: { screen: { width, height: screenHeight } } });

  test("mounts the world, or keeps the poster with an honest failure and the links @visual-dom", async ({ page }) => {
    await page.goto("/");
    const canvas = page.locator(".pv-world canvas");
    const failure = page.getByRole("status").filter({ hasText: /could not (?:start|load)/ });
    await expect(canvas.or(failure)).toBeVisible({ timeout: 45_000 });
    if (await failure.isVisible()) {
      await expect(page.locator("#pv-poster")).toHaveCount(1);
      await expect(page.getByRole("link", { name: "Open Pharos analytics" })).toBeVisible();
    } else {
      await expect(canvas).toHaveCount(1);
    }
  });
});
