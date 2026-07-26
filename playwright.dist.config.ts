import { defineConfig } from "@playwright/test";
import {
  PHAROSVILLE_BASE_VIEWPORT,
  buildBrowserProjects,
} from "./tests/helpers/playwright-config";

const BASE_URL = "http://127.0.0.1:4174";

export default defineConfig({
  testDir: "./tests/visual",
  // Three failure-path tests spend 20-26s of this budget waiting out the retry
  // ladder on CI-grade hardware, so 60s left them one slow assertion from the
  // per-test cap.
  timeout: 90_000,
  fullyParallel: true,
  workers: 1,
  expect: {
    // The failure-path DOM tests assert an EVENTUAL state that sits behind a
    // deterministic ladder: two retries at 1s and 2s of backoff per feed
    // (use-api-query DEFAULT_RETRY_DELAY), then the 1.5s enrichment grace,
    // across all seven feeds. In the CI container those tests already run
    // 10-12s on fast hardware, and CI runs them on a shared 2-vCPU runner
    // with no GPU — 15s left no margin and the error-route test timed out
    // there while passing everywhere else. This budget is for waiting out
    // that ladder, not for tolerating slowness: a passing assertion still
    // resolves as soon as the state arrives. Measured in the CI image pinned
    // to 2 CPUs: 19.9s, 25.5s and 26.3s for the three failure-path tests.
    timeout: 45_000,
  },
  use: {
    baseURL: BASE_URL,
    viewport: PHAROSVILLE_BASE_VIEWPORT,
    trace: "on-first-retry",
  },
  projects: buildBrowserProjects({
    baseURL: BASE_URL,
    viewport: PHAROSVILLE_BASE_VIEWPORT,
    contextOptions: { reducedMotion: "reduce" },
    trace: "on-first-retry",
  }),
  webServer: {
    command: "npm run serve:dist -- --host 127.0.0.1 --port 4174",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
