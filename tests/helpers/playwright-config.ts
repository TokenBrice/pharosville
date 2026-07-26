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

/**
 * Hardware rendering for the local visual lane.
 *
 * Playwright's bundled Chromium falls back to SwiftShader with DEFAULT flags —
 * that part of the documented warning is exact. What it does not say is that
 * the fallback is a flag choice, not a limitation: the same bundled browser
 * reports `ANGLE (NVIDIA, Vulkan 1.4.341, RTX 5070 Ti)` when asked for the GPU.
 *
 * That matters because SwiftShader draws this scene at about 2fps, and the
 * lane is not merely slow at that rate — it is WRONG. Multi-second long tasks
 * time out clicks and trip the world's error boundary, so the operator's own
 * merge gates fail locally for reasons that have nothing to do with the code
 * under test.
 *
 * This does NOT reopen the rule it sits next to: look and frame time are still
 * judged with `npm run preview`, which goes through the operator's own
 * `chrome-flags.conf` and therefore their real conditions. This only stops the
 * correctness lane from being crippled.
 *
 * Off under CI, whose runners have no GPU to ask for, and overridable either
 * way with `PHAROSVILLE_VISUAL_GPU`.
 */
const HARDWARE_GPU_ARGS = [
  "--ignore-gpu-blocklist",
  "--enable-gpu",
  "--use-angle=vulkan",
  "--use-cmd-decoder=passthrough",
];

export function shouldUseHardwareGpu() {
  if (process.env.PHAROSVILLE_VISUAL_GPU === "1") return true;
  if (process.env.PHAROSVILLE_VISUAL_GPU === "0") return false;
  return !process.env.CI;
}

export function hardwareGpuLaunchArgs(browser: string): string[] {
  return browser === "chromium" && shouldUseHardwareGpu() ? [...HARDWARE_GPU_ARGS] : [];
}

/**
 * Firefox in the CI container will not hand out a WebGL context by default, so
 * the world reports a renderer failure and the cross-browser lane tests the DOM
 * fallback instead of the thing it says it tests. Locally — with a GPU, and
 * even forced to software GL — Firefox is fine, which is what makes this a
 * container default rather than a capability limit.
 *
 * `force-enabled` is the pref that gets past the blocklist a headless container
 * matches; the rest let it fall back to a software context rather than refuse.
 */
const FIREFOX_WEBGL_PREFS: Record<string, boolean> = {
  "gfx.webrender.all": true,
  "webgl.disabled": false,
  "webgl.force-enabled": true,
  "webgl.forbid-software": false,
};

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
  return parseBrowserSelection().map((browser) => {
    const args = hardwareGpuLaunchArgs(browser);
    const launchOptions = {
      ...(args.length > 0 ? { args } : {}),
      ...(browser === "firefox" ? { firefoxUserPrefs: FIREFOX_WEBGL_PREFS } : {}),
    };
    return {
      name: `desktop-${browser}`,
      use: {
        ...browserDeviceProfiles[browser],
        baseURL: base.baseURL,
        contextOptions: base.contextOptions,
        viewport: base.viewport,
        trace: base.trace,
        ...(Object.keys(launchOptions).length > 0 ? { launchOptions } : {}),
      },
    };
  });
}

export function buildChromiumProject(name: string, base: PharosvilleProjectUse) {
  const args = hardwareGpuLaunchArgs("chromium");
  return {
    name,
    use: {
      ...devices["Desktop Chrome"],
      baseURL: base.baseURL,
      contextOptions: base.contextOptions,
      viewport: base.viewport,
      trace: base.trace,
      ...(args.length > 0 ? { launchOptions: { args } } : {}),
    },
  };
}
