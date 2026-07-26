import { defineConfig } from "@playwright/test";
import {
  PHAROSVILLE_BASE_VIEWPORT,
  buildBrowserProjects,
  shouldReuseExistingServer,
} from "./tests/helpers/playwright-config";

const BASE_URL = "http://127.0.0.1:4173";
const referenceGate = process.env.PHAROSVILLE_REFERENCE_GATE === "1";
const referenceRenderNode = process.env.PHAROSVILLE_REFERENCE_RENDER_NODE?.trim();
const browserProjects = buildBrowserProjects({
  baseURL: BASE_URL,
  viewport: PHAROSVILLE_BASE_VIEWPORT,
  contextOptions: { reducedMotion: "reduce" },
  trace: "on-first-retry",
});

if (referenceGate && browserProjects.some((project) => project.name !== "desktop-chromium")) {
  throw new Error("The reference-hardware gate must run in Chromium.");
}

export default defineConfig({
  testDir: "./tests/visual",
  retries: 1,
  timeout: 60_000,
  workers: 1,
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
  projects: referenceGate
    ? browserProjects.map((project) => ({
        ...project,
        use: {
          ...project.use,
          channel: "chrome" as const,
          ...(referenceRenderNode
            ? {
                launchOptions: {
                  args: [
                    "--disable-background-timer-throttling",
                    "--disable-backgrounding-occluded-windows",
                    "--disable-renderer-backgrounding",
                    "--force-color-profile=srgb",
                    "--ignore-gpu-blocklist",
                    "--ozone-platform=x11",
                    "--use-angle=vulkan",
                    "--use-cmd-decoder=passthrough",
                    `--render-node-override=${referenceRenderNode}`,
                  ],
                },
              }
            : {}),
        },
      }))
    : browserProjects,
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: BASE_URL,
    reuseExistingServer: shouldReuseExistingServer(),
    timeout: 120_000,
  },
});
