import { defineConfig } from "@playwright/test";
import {
  PHAROSVILLE_BASE_VIEWPORT,
  buildChromiumProject,
  shouldReuseExistingServer,
} from "./tests/helpers/playwright-config";

/**
 * Playwright config for ad-hoc measurement probes (tests/probes/).
 *
 * Probes are agent-run instrumentation captures (per-pass draw breakdowns,
 * cache hit-rate sampling) used to ground perf decisions — see the V4.x items
 * in `agents/2026-06-10-visual-upgrade-effort-reward.md`. They are NOT CI
 * lanes: no budgets are asserted, and `tests/probes/` is excluded from the
 * perf lane's testDir so `npm run test:perf` never picks them up.
 *
 * Port 4179 (not 4173) so probe runs never collide with a concurrently
 * running perf lane in another worktree.
 *
 * Run: npx playwright test --config playwright.probe.config.ts
 */

const BASE_URL = "http://127.0.0.1:4179";

export default defineConfig({
  testDir: "./tests/probes",
  // 30s load + 5s polling + overhead
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: BASE_URL,
    viewport: PHAROSVILLE_BASE_VIEWPORT,
    // Perf tests require real animation; override the visual-spec default.
    contextOptions: {
      reducedMotion: "no-preference",
    },
    trace: "on-first-retry",
  },
  projects: [
    buildChromiumProject("desktop-chromium", {
      baseURL: BASE_URL,
      viewport: PHAROSVILLE_BASE_VIEWPORT,
      contextOptions: { reducedMotion: "no-preference" },
      trace: "on-first-retry",
    }),
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4179",
    url: BASE_URL,
    reuseExistingServer: shouldReuseExistingServer(),
    timeout: 120_000,
  },
});
