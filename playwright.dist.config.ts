import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:4174";
const BASE_VIEWPORT = { width: 1440, height: 960 };

const browserDeviceProfiles = {
  chromium: devices["Desktop Chrome"],
  firefox: devices["Desktop Firefox"],
  webkit: devices["Desktop Safari"],
} as const;

type AllowedBrowser = keyof typeof browserDeviceProfiles;

function parseBrowserSelection() {
  const configured = process.env.PHAROSVILLE_VISUAL_BROWSERS?.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const requested = (configured?.length ? configured : ["chromium"]) as string[];
  const normalized = [...new Set(requested)];
  const unsupported = normalized.filter((browser) => !Object.hasOwn(browserDeviceProfiles, browser));
  if (unsupported.length > 0) {
    throw new Error(`Unsupported browser project(s): ${unsupported.join(", ")}`);
  }
  return normalized as AllowedBrowser[];
}

interface PharosvilleVisualUse {
  baseURL: string;
  viewport: { height: number; width: number };
  trace: "off" | "on" | "retain-on-failure" | "on-first-retry" | "on-all-retries";
  contextOptions: { reducedMotion: "reduce" | "no-preference" };
}

function buildBrowserProjects(base: PharosvilleVisualUse) {
  return parseBrowserSelection().map((browser) => ({
    name: `desktop-${browser}`,
    use: {
      ...browserDeviceProfiles[browser],
      baseURL: base.baseURL,
      contextOptions: base.contextOptions,
      viewport: base.viewport,
      trace: base.trace,
    },
  }));
}

export default defineConfig({
  testDir: "./tests/visual",
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: BASE_URL,
    viewport: BASE_VIEWPORT,
    trace: "on-first-retry",
  },
  projects: buildBrowserProjects({
    baseURL: BASE_URL,
    viewport: BASE_VIEWPORT,
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
