import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the performance telemetry lane (tests/perf/).
 *
 * Kept separate from playwright.config.ts (visual snapshots) because:
 *   - Perf tests run against the dev server under normal motion; visual tests
 *     use reduced motion by default.
 *   - Perf tests have a longer timeout (the sustained-motion test polls for
 *     ~5s of telemetry on top of page-load + warm-up time).
 *   - CI cadence differs: visual snapshots gate every deploy; perf telemetry
 *     runs on a slower schedule once baselines are proven stable.
 *
 * Run: npm run test:perf
 */

const BASE_URL = "http://127.0.0.1:4173";
const BASE_VIEWPORT = { width: 1440, height: 960 };

function shouldReuseExistingServer() {
  if (process.env.PHAROSVILLE_VISUAL_REUSE === "1") return true;
  if (process.env.PHAROSVILLE_VISUAL_REUSE === "0") return false;
  return !process.env.CI;
}

export default defineConfig({
  testDir: "./tests/perf",
  // 30s load + 5s polling + overhead
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: BASE_URL,
    viewport: BASE_VIEWPORT,
    // Perf tests require real animation; override the visual-spec default.
    contextOptions: {
      reducedMotion: "no-preference",
    },
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: BASE_URL,
        viewport: BASE_VIEWPORT,
        contextOptions: { reducedMotion: "no-preference" },
        trace: "on-first-retry" as const,
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: BASE_URL,
    reuseExistingServer: shouldReuseExistingServer(),
    timeout: 120_000,
  },
});
