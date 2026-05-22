import { defineConfig } from "@playwright/test";
import {
  PHAROSVILLE_BASE_VIEWPORT,
  buildBrowserProjects,
  shouldReuseExistingServer,
} from "./tests/helpers/playwright-config";

const BASE_URL = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./tests/visual",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: BASE_URL,
    viewport: PHAROSVILLE_BASE_VIEWPORT,
    contextOptions: {
      reducedMotion: "reduce",
    },
    trace: "on-first-retry",
  },
  projects: buildBrowserProjects({
    baseURL: BASE_URL,
    viewport: PHAROSVILLE_BASE_VIEWPORT,
    contextOptions: { reducedMotion: "reduce" },
    trace: "on-first-retry",
  }),
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: BASE_URL,
    reuseExistingServer: shouldReuseExistingServer(),
    timeout: 120_000,
  },
});
