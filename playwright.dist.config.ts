import { defineConfig } from "@playwright/test";
import {
  PHAROSVILLE_BASE_VIEWPORT,
  buildBrowserProjects,
} from "./tests/helpers/playwright-config";

const BASE_URL = "http://127.0.0.1:4174";

export default defineConfig({
  testDir: "./tests/visual",
  timeout: 60_000,
  fullyParallel: true,
  ...(process.env.CI ? { workers: 2 } : {}),
  expect: {
    timeout: 15_000,
  },
  snapshotPathTemplate:
    "{testDir}/{testFileName}-snapshots-built-dist/{arg}{-projectName}{-snapshotSuffix}{ext}",
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
    command: "npm run preview -- --host 127.0.0.1 --port 4174",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
