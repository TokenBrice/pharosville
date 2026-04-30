import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visual",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:4174",
    viewport: { width: 1440, height: 960 },
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run preview -- --host localhost --port 4174",
    url: "http://localhost:4174",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
