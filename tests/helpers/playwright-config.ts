import { devices } from "@playwright/test";

export const PHAROSVILLE_BASE_VIEWPORT = { width: 1440, height: 960 } as const;

type ReducedMotion = "reduce" | "no-preference";
type TraceMode = "off" | "on" | "retain-on-failure" | "on-first-retry" | "on-all-retries";

interface PharosvilleProjectUse {
  baseURL: string;
  contextOptions: { reducedMotion: ReducedMotion };
  trace: TraceMode;
  viewport: typeof PHAROSVILLE_BASE_VIEWPORT;
}

const browserDeviceProfiles = {
  chromium: devices["Desktop Chrome"],
  firefox: devices["Desktop Firefox"],
  webkit: devices["Desktop Safari"],
} as const;

type AllowedBrowser = keyof typeof browserDeviceProfiles;

export function shouldReuseExistingServer() {
  if (process.env.PHAROSVILLE_VISUAL_REUSE === "1") return true;
  if (process.env.PHAROSVILLE_VISUAL_REUSE === "0") return false;
  return !process.env.CI;
}

export function parseBrowserSelection() {
  const configured = process.env.PHAROSVILLE_VISUAL_BROWSERS
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const requested = configured?.length ? configured : ["chromium"];
  const normalized = [...new Set(requested)];
  const unsupported = normalized.filter((browser) => !Object.hasOwn(browserDeviceProfiles, browser));
  if (unsupported.length > 0) {
    throw new Error(`Unsupported browser project(s): ${unsupported.join(", ")}`);
  }
  return normalized as AllowedBrowser[];
}

export function buildBrowserProjects(base: PharosvilleProjectUse) {
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

export function buildChromiumProject(name: string, base: PharosvilleProjectUse) {
  return {
    name,
    use: {
      ...devices["Desktop Chrome"],
      baseURL: base.baseURL,
      contextOptions: base.contextOptions,
      viewport: base.viewport,
      trace: base.trace,
    },
  };
}
