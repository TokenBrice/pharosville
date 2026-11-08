import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { overlayBundle } from "../helpers/overlay-bundle";
import { replayInitScript } from "../helpers/scenario";
import current from "../fixtures/scenarios/current.json";
import outage from "../fixtures/scenarios/unknown-stale-outage.json";

type HarnessWindow = Window & { __overlay: { recovery(active: boolean): void; fail(): void; refresh(): Promise<void>; store: { select(hit: { kind: "landmark"; id: string }): void } }; __scenario: { advanceTo(ms: number): void } };
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
  const search = page.getByRole("button", { name: "Search (/)" });
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
  await page.keyboard.press("Escape");
  for (const id of ["pharos", "storm-mast", "keeperslog"]) {
    await page.evaluate((id) => (window as unknown as HarnessWindow).__overlay.store.select({ kind: "landmark", id }), id);
    await expect(page.locator("#hb-panel-title")).toBeFocused(); await scan(page); await page.keyboard.press("Escape");
  }
  const options = page.getByRole("button", { name: "Sound options" }); await options.focus(); await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemradio", { name: "Sound off", exact: true })).toBeFocused(); await scan(page);
  await page.keyboard.press("ArrowDown"); await expect(page.getByRole("menuitemradio", { name: "Ambient sound", exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(options).toBeFocused();
  expect(errors).toEqual([]);
});

test("real stale/outage details and recovery content remain accessible @visual-dom @visual-accessibility", async ({ page }) => {
  await page.goto("/__qa__/overlay.html?intro=0");
  await expect(page.getByRole("button", { name: "Search (/)" })).toBeVisible();
  for (const atMs of [300000, 600000, 900000]) {
    await page.evaluate(async (atMs) => { const w = window as unknown as HarnessWindow; w.__scenario.advanceTo(atMs); await w.__overlay.refresh(); w.__overlay.store.select({ kind: "landmark", id: "keeperslog" }); }, atMs);
    await expect(page.locator("#hb-panel-title")).toBeVisible(); await scan(page);
  }
  await page.evaluate(() => (window as unknown as HarnessWindow).__overlay.recovery(true));
  await expect(page.getByRole("status")).toContainText("could not load");
  await expect(page.getByRole("link", { name: "Open Pharos analytics" })).toBeVisible(); await scan(page);
  await page.evaluate(() => (window as unknown as HarnessWindow).__overlay.recovery(false));
  await expect(page.getByRole("button", { name: "Search (/)" })).toBeVisible();
  await page.evaluate(() => (window as unknown as HarnessWindow).__overlay.fail());
  await expect(page.getByRole("button", { name: "Reload harbor" })).toBeVisible(); await scan(page);
});
