import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import {
  installWallClockOverride,
  mockDensePharosVilleData,
  readVisualDebug,
  waitForRuntimeDebug,
} from "../helpers/pharosville-debug";

/**
 * C4 debug-evidence capture for Garden Sea packets, not a regression lane.
 * Gated like the triptych capture so the normal visual lanes never run it:
 *
 *   PHAROSVILLE_DEBUG_EVIDENCE=1 npx playwright test tests/visual/pharosville-debug-evidence.spec.ts --project=desktop-chromium
 *
 * Writes outputs/triptych/<name>/debug.json with the C4 contract fields
 * (session tier reached, cloud shadows, ripple rings, zone radii) so exit
 * gates can prove the tier a session actually reached.
 */
const enabled = process.env.PHAROSVILLE_DEBUG_EVIDENCE === "1";
const captureName = process.env.PHAROSVILLE_TRIPTYCH_NAME ?? "triptych";

test.describe("pharosville debug evidence capture (C4)", () => {
  test.skip(!enabled, "Set PHAROSVILLE_DEBUG_EVIDENCE=1 to capture debug evidence.");
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("dumps __pharosVilleDebug with the C4 contract fields", async ({ page }) => {
    await mockDensePharosVilleData(page);
    await installWallClockOverride(page, 11);
    await page.goto("/");
    await waitForRuntimeDebug(page, false);
    await page.keyboard.press("Escape");
    // Give the G3 hysteresis ladder time to promote a healthy session to full.
    await page.waitForTimeout(5_000);
    const debug = await readVisualDebug(page);
    const metrics = debug.renderMetrics;
    const evidence = {
      capturedAt: new Date().toISOString(),
      wallClockHour: debug.wallClockHour ?? null,
      schedulerTier: metrics?.schedulerTier ?? null,
      sessionTierReached: metrics?.sessionTierReached ?? null,
      cloudShadowsOn: metrics?.cloudShadowsOn ?? null,
      rippleRingCount: metrics?.rippleRingCount ?? null,
      zoneRadii: metrics?.zoneRadii ?? [],
      composerEnabled: metrics?.composerEnabled ?? null,
      postPassList: metrics?.postPassList ?? [],
      shadowMapSize: metrics?.shadowMapSize ?? null,
      framePacingP90Ms: metrics?.framePacing?.p90Ms ?? null,
    };
    const directory = path.join("outputs", "triptych", captureName);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "debug.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  });
});
