import { mkdirSync } from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import {
  installWallClockOverride,
  mockDensePharosVilleData,
  waitForRuntimeDebug,
} from "../helpers/pharosville-debug";

/**
 * Evidence capture for visual-revamp packets, not a regression lane. Gated so
 * the normal visual lanes never run it:
 *
 *   npm run capture:triptych
 *   PHAROSVILLE_TRIPTYCH_NAME=v1-foundation npm run capture:triptych
 *
 * Writes outputs/triptych/<name>/{day,dusk,night}.png at the standard framing
 * with motion enabled, per the revamp plan's V0.4 verify contract.
 */
const enabled = process.env.PHAROSVILLE_TRIPTYCH === "1";
const captureName = process.env.PHAROSVILLE_TRIPTYCH_NAME ?? "triptych";

const TRIPTYCH_STATES = [
  { hour: 11, state: "day" },
  { hour: 18.5, state: "dusk" },
  { hour: 23, state: "night" },
] as const;

test.describe("pharosville triptych capture", () => {
  test.skip(!enabled, "Set PHAROSVILLE_TRIPTYCH=1 to capture evidence triptychs.");
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  for (const { hour, state } of TRIPTYCH_STATES) {
    test(`captures the ${state} frame`, async ({ page }) => {
      await mockDensePharosVilleData(page);
      await installWallClockOverride(page, hour);
      await page.goto("/");
      await waitForRuntimeDebug(page, false);
      // Close any auto-opened detail panel so the frame shows the world.
      await page.keyboard.press("Escape");
      // Let the sea, beam sweep, and bloom settle into a representative frame.
      await page.waitForTimeout(2_500);
      const directory = path.join("outputs", "triptych", captureName);
      mkdirSync(directory, { recursive: true });
      await page.screenshot({
        fullPage: false,
        path: path.join(directory, `${state}.png`),
      });
    });
  }
});
