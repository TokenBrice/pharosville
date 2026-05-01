import { defineConfig, devices } from "@playwright/test";

function shouldReuseExistingServer() {
  if (process.env.PHAROSVILLE_VISUAL_REUSE === "1") return true;
  if (process.env.PHAROSVILLE_VISUAL_REUSE === "0") return false;
  return !process.env.CI;
}

export default defineConfig({
  testDir: "./tests/visual",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 960 },
    contextOptions: {
      reducedMotion: "reduce",
    },
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: shouldReuseExistingServer(),
    timeout: 120_000,
  },
});
