import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { overlayBundle } from "../helpers/overlay-bundle";
import { replayInitScript } from "../helpers/scenario";
import current from "../fixtures/scenarios/current.json";
import outage from "../fixtures/scenarios/unknown-stale-outage.json";

type HarnessWindow = Window & { __overlay: { postcardFailure(active: boolean): void; recovery(active: boolean): void; fail(): void; refresh(): Promise<void>; store: { select(hit: { kind: "landmark"; id: string }): void } }; __scenario: { advanceTo(ms: number): void } };
let bundle: Awaited<ReturnType<typeof overlayBundle>>;
test.beforeAll(async () => { bundle = await overlayBundle(); });
const scan = async (page: Page) => {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations).toEqual([]);
};
test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript({ content: replayInitScript(testInfo.title.includes("stale/outage") ? outage : current) });
  await page.route("**/__qa__/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ contentType: path.endsWith(".js") ? "application/javascript" : path.endsWith(".css") ? "text/css" : "text/html", body: path.endsWith(".js") ? bundle.script : path.endsWith(".css") ? bundle.css : bundle.html });
  });
});

test("real search, ledger tabs, coin/landmark details and sound support keyboard and axe @visual-dom @visual-accessibility", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/__qa__/overlay.html?intro=0");
  const search = page.getByRole("button", { name: "Search", exact: true });
  await search.focus(); await page.keyboard.press("/");
  const input = page.getByRole("combobox"); await expect(input).toBeFocused(); await input.fill("USDC");
  await expect(page.getByRole("option").first()).toContainText("USDC"); await scan(page);
  await page.keyboard.press("Escape"); await expect(search).toBeFocused();
  await page.keyboard.press("/"); await input.fill("USDC"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(page.locator("#hb-panel-title")).toBeFocused(); await scan(page);
  await page.keyboard.press("Escape"); await expect(search).toBeFocused();
  await page.keyboard.press("l");
  const tabs = page.getByRole("tab");
  for (let i = 0; i < await tabs.count(); i++) {
    await tabs.nth(i).focus(); await page.keyboard.press("Enter");
    await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true"); await scan(page);
    if (i + 1 < await tabs.count()) { await page.keyboard.press("ArrowRight"); await expect(tabs.nth(i + 1)).toBeFocused(); }
  }
  await page.keyboard.press("Escape"); await expect(search).toBeFocused();
  for (const id of ["pharos", "storm-mast", "keeperslog"]) {
    await page.evaluate((id) => (window as unknown as HarnessWindow).__overlay.store.select({ kind: "landmark", id }), id);
    await expect(page.locator("#hb-panel-title")).toBeFocused(); await scan(page);
    await page.keyboard.press("Escape"); await expect(search).toBeFocused();
  }
  const options = page.getByRole("button", { name: "Sound options" }); await options.focus(); await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemradio", { name: "Sound off", exact: true })).toBeFocused(); await scan(page);
  await page.keyboard.press("ArrowDown"); await expect(page.getByRole("menuitemradio", { name: "Ambient sound", exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(options).toBeFocused();
  expect(errors).toEqual([]);
});

test("real stale/outage details and recovery content remain accessible @visual-dom @visual-accessibility", async ({ page }) => {
  await page.goto("/__qa__/overlay.html?intro=0");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
  for (const atMs of [300000, 600000, 900000]) {
    await page.evaluate(async (atMs) => { const w = window as unknown as HarnessWindow; w.__scenario.advanceTo(atMs); await w.__overlay.refresh(); w.__overlay.store.select({ kind: "landmark", id: "keeperslog" }); }, atMs);
    await expect(page.locator("#hb-panel-title")).toBeVisible(); await scan(page);
  }
  await page.evaluate(() => (window as unknown as HarnessWindow).__overlay.recovery(true));
  await expect(page.getByRole("status")).toContainText("could not load");
  await expect(page.getByRole("link", { name: "Open Pharos analytics" })).toBeVisible(); await scan(page);
  await page.evaluate(() => (window as unknown as HarnessWindow).__overlay.recovery(false));
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as HarnessWindow).__overlay.fail());
  await expect(page.getByRole("button", { name: "Reload harbor" })).toBeVisible(); await scan(page);
});


test("help preferences and native postcard success/failure retain focus and keyboard ownership @visual-dom @visual-accessibility", async ({ page }) => {
  await page.goto("/__qa__/overlay.html?intro=0");
  const opener = page.getByRole("button", { name: /Help and controls/ });
  await opener.focus(); await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Help and controls" });
  await expect(sheet.getByRole("heading")).toBeFocused();
  await scan(page);
  await sheet.getByText("Explore further", { exact: true }).click();
  await sheet.getByText("View controls", { exact: true }).click(); await scan(page);
  const still = sheet.getByRole("checkbox", { name: "Still world" });
  await still.focus(); await page.keyboard.press("Space"); await expect(still).not.toBeChecked(); await expect(still).toBeFocused();
  await sheet.getByRole("checkbox", { name: "Character shortcuts" }).uncheck();
  await page.keyboard.press("Escape"); await expect(opener).toBeFocused();
  await page.keyboard.press("?"); await expect(sheet).toHaveCount(0);
  await page.locator(".hb-mark").hover(); await opener.click();
  await sheet.getByText("Explore further", { exact: true }).click();
  await page.evaluate(() => (window as unknown as HarnessWindow).__overlay.postcardFailure(true));
  const take = sheet.getByRole("button", { name: "Postcard", exact: true });
  await take.click();
  const postcard = page.getByRole("dialog", { name: "Postcard", exact: true });
  await expect(postcard.getByRole("alert")).toHaveText("The postcard could not be created."); await scan(page);
  await page.evaluate(() => (window as unknown as HarnessWindow).__overlay.postcardFailure(false));
  await postcard.getByRole("button", { name: "Try again" }).click();
  await expect(postcard.getByRole("link", { name: "Save" })).toBeFocused(); await scan(page);
  // Native modality keeps the inert page out of the Tab order; past the last control, focus leaves for the browser's
  // own UI (Chromium) or stays put (headless Firefox), and comes back into the dialog.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await postcard.evaluate((dialog) => dialog.contains(document.activeElement) || !document.hasFocus())).toBe(true);
  }
  await expect(postcard.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape"); await expect(postcard).toHaveCount(0); await expect(take).toBeFocused();
  await page.keyboard.press("Escape"); await expect(opener).toBeFocused();
});

for (const [width, height] of [[600, 720], [720, 600], [1100, 640]] as const) {
  test(`search and controls fit ${width}×${height} in normal/reduced motion @visual-dom @visual-accessibility`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      await page.emulateMedia({ reducedMotion, forcedColors: "active" });
      await page.goto("/__qa__/overlay.html?intro=0");
      await page.locator(".hb-mark-btn").focus();
      await page.getByRole("button", { name: "Search", exact: true }).click();
      const input = page.getByRole("combobox"); await expect(input).toBeFocused(); await input.fill("USDC");
      const search = await page.locator(".hb-search").boundingBox();
      expect(search).not.toBeNull(); expect(search!.x).toBeGreaterThanOrEqual(12);
      expect(search!.x + search!.width).toBeLessThanOrEqual(width - 12);
      expect(search!.y + search!.height).toBeLessThanOrEqual(height - 12);
      expect(await input.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
      await page.getByRole("button", { name: "Close search", exact: true }).click();
      await page.locator(".hb-mark").hover(); await page.getByRole("button", { name: /Help and controls/ }).click();
      const sheet = await page.locator(".hb-help").boundingBox();
      expect(sheet).not.toBeNull(); expect(sheet!.x).toBeGreaterThanOrEqual(12);
      expect(sheet!.x + sheet!.width).toBeLessThanOrEqual(width - 12);
      expect(sheet!.y + sheet!.height).toBeLessThanOrEqual(height - 12);
      await scan(page);
    }
  });
}
