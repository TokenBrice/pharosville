import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureReportCards,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureMintBurn,
  fixtureStability,
} from "../../src/__fixtures__/pharosville-world";
import { PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY } from "@shared/lib/pharosville-api-endpoints";
import {
  installWallClockOverride,
  mockDensePharosVilleData,
  mockScreenSize,
  readRuntimeSnapshot,
  waitForRuntimeDebug,
} from "../helpers/pharosville-debug";

const VIEWPORT = { height: 1000, width: 1440 };
const SCREEN = { height: 1080, width: 1920 };
const WORLD_MODULE_ROUTE = /\/src\/three\/world-renderer\.ts(?:\?.*)?$/;
const LIGHTHOUSE_MODEL_PATH = "/pharosville/models/garden-lighthouse-shell.glb";
const REFERENCE_GATE = process.env.PHAROSVILLE_REFERENCE_GATE === "1";
const PERFORMANCE_SECONDS = REFERENCE_GATE ? 60 : 6;
const LONG_SESSION_SECONDS = longSessionSeconds();
// D10 (Pharos Wonder 2026-07-24, agents/2026-07-24-pharos-wonder-plan.md):
// mount-phase drain for the steady-state pacing window — see the pacing test.
// A frame above this threshold is a mount frame (SwiftShader shader-JIT,
// first uploads), not steady state: measured mount first-frame
// drawDurationMs ≈ 658 ms while steady-state p90 = 183.4 ms.
const MOUNT_FRAME_THRESHOLD_MS = 400;
const MOUNT_DRAIN_TIMEOUT_MS = 90_000;
// 2026-07-25 Grand Scale Revamp (decision D7, operator-approved O9):
// calls 450->700, geometries 275->500, textures 40->72, triangles 70k->500k.
// Measured cause: the rendered fleet went from 20 ships to the full ~205
// (W1/W3), hero hulls from 2 shared models to 10 distinct ones (W5), the
// lighthouse from 2.4k to a Wonder-grade triangle count (W4), and the sea
// gained a region field texture (W2). The FRAME-TIME gate below is
// deliberately unchanged — smoothness is the product, bundle weight is not.
const GPU_RESOURCE_BUDGET = {
  calls: 700,
  geometries: 500,
  // The post pipeline holds ~10 render-target textures (composer read/write
  // plus the bloom mip chain); the remainder covers scene textures and the
  // V2 sea additions (normal map, lane data texture, wake target).
  textures: 72,
  // Raised from 42k for the V5 titan/heritage hero GLB hulls: ~4 visible heroes
  // at ~500 tris each on top of the procedural fleet. The iGPU has ample
  // headroom at this count; draw calls stay flat (heroes merge to <=5 each).
  // 2026-07-24 (Garden Sea, D-B1 measured cause): 60k -> 70k. Measured 63,354
  // tris after the monumental lighthouse GLB v3 (1,068 -> 2,744), regenerated
  // titan/heritage heroes (507/331 -> 2,190/1,538), richer sheer-line fleet
  // hulls, and the horizon + garden islets (~0.9k). Draw calls stay flat
  // (instancing/batching unchanged); the beauty spend is the point of the
  // revamp.
  triangles: 500_000,
} as const;

type PerformanceTelemetry = {
  framePacing: {
    effectiveFps: number;
    maxMs: number;
    p90Ms: number;
    sampleCount: number;
  } | null;
  gpu: {
    calls: number;
    geometries: number;
    textures: number;
    triangles: number;
  } | null;
  longtask: {
    count: number;
    maxDurationMs: number;
  } | null;
  rendererBackend: string | null;
  timeToFirstCoherentFrameMs: number | null;
};

type WebGlRendererInfo = {
  renderer: string;
  vendor: string;
};

async function prepareWorldPage(
  page: Page,
  reducedMotion = false,
): Promise<void> {
  await mockDensePharosVilleData(page);
  await page.emulateMedia({
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  await mockScreenSize(page, SCREEN.width, SCREEN.height);
  await page.setViewportSize(VIEWPORT);
  await installWallClockOverride(page, 12);
}

async function openWorld(
  page: Page,
  reducedMotion = false,
): Promise<Locator> {
  await prepareWorldPage(page, reducedMotion);
  await page.goto("/?debug=1&t=12");

  const canvas = page.getByTestId("pharosville-canvas");
  await expect(canvas).toHaveAttribute("data-renderer", "three");
  await expect(canvas).toHaveAttribute("data-renderer-status", "ready");
  await waitForRuntimeDebug(page, reducedMotion);
  await expect(page.getByTestId("pharosville-renderer-fallback")).toHaveCount(0);
  return canvas;
}

async function readPerformanceTelemetry(
  page: Page,
): Promise<PerformanceTelemetry> {
  return page.evaluate(() => {
    const metrics = (window as typeof window & {
      __pharosVilleDebug?: {
        renderMetrics?: {
          framePacing?: PerformanceTelemetry["framePacing"];
          gpu?: PerformanceTelemetry["gpu"];
          longtask?: PerformanceTelemetry["longtask"];
          rendererBackend?: string;
          timeToFirstCoherentFrameMs?: number;
        };
      };
    }).__pharosVilleDebug?.renderMetrics;
    return {
      framePacing: metrics?.framePacing ?? null,
      gpu: metrics?.gpu ?? null,
      longtask: metrics?.longtask ?? null,
      rendererBackend: metrics?.rendererBackend ?? null,
      timeToFirstCoherentFrameMs: metrics?.timeToFirstCoherentFrameMs ?? null,
    };
  });
}

async function installLongTaskProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Probe = {
      disconnect: () => void;
      durations: number[];
      supported: boolean;
    };
    const scope = window as typeof window & { __pharosLongTaskProbe?: Probe };
    scope.__pharosLongTaskProbe?.disconnect();

    const durations: number[] = [];
    const supported = PerformanceObserver.supportedEntryTypes?.includes("longtask") ?? false;
    let observer: PerformanceObserver | null = null;
    if (supported) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) durations.push(entry.duration);
      });
      observer.observe({ entryTypes: ["longtask"] });
    }
    scope.__pharosLongTaskProbe = {
      disconnect: () => observer?.disconnect(),
      durations,
      supported,
    };
  });
}

async function readLongTaskProbe(page: Page): Promise<{
  durations: number[];
  supported: boolean;
}> {
  return page.evaluate(() => {
    const probe = (window as typeof window & {
      __pharosLongTaskProbe?: {
        durations: number[];
        supported: boolean;
      };
    }).__pharosLongTaskProbe;
    return {
      durations: [...(probe?.durations ?? [])],
      supported: probe?.supported ?? false,
    };
  });
}

async function exerciseCamera(page: Page, canvas: Locator): Promise<void> {
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const centerX = box.x + box.width * 0.5;
  const centerY = box.y + box.height * 0.5;
  await page.mouse.move(centerX, centerY);
  await page.mouse.wheel(0, -80);
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.mouse.move(centerX + 100, centerY + 45, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  await page.mouse.wheel(0, 70);
  await page.waitForTimeout(750);
}

async function readWebGlRendererInfo(canvas: Locator): Promise<WebGlRendererInfo> {
  return canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const context = target.getContext("webgl2") ?? target.getContext("webgl");
    if (!context) return { renderer: "unavailable", vendor: "unavailable" };
    const extension = context.getExtension("WEBGL_debug_renderer_info") as {
      UNMASKED_RENDERER_WEBGL: number;
      UNMASKED_VENDOR_WEBGL: number;
    } | null;
    return {
      renderer: String(context.getParameter(
        extension?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER,
      )),
      vendor: String(context.getParameter(
        extension?.UNMASKED_VENDOR_WEBGL ?? context.VENDOR,
      )),
    };
  });
}

function longestLowFpsRun(samples: readonly PerformanceTelemetry[]): number {
  let longest = 0;
  let current = 0;
  for (const sample of samples) {
    if ((sample.framePacing?.effectiveFps ?? 0) < 45) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function longSessionSeconds(): number {
  if (!REFERENCE_GATE) return 12;
  const configured = Number(process.env.PHAROSVILLE_STABILITY_SECONDS ?? 300);
  return Number.isFinite(configured) && configured >= 10 ? Math.floor(configured) : 300;
}

test("steady-state pacing, startup, long tasks, and GPU memory stay bounded", async ({
  browserName,
  page,
}, testInfo) => {
  // D10: the mount drain adds up to MOUNT_DRAIN_TIMEOUT_MS of polling before
  // the sampling window opens; the timeout grows to match (budget VALUES are
  // unchanged — only WHEN sampling starts).
  test.setTimeout((PERFORMANCE_SECONDS + 45) * 1000 + MOUNT_DRAIN_TIMEOUT_MS);
  const canvas = await openWorld(page);

  await expect.poll(async () => (
    (await readPerformanceTelemetry(page)).framePacing?.sampleCount ?? 0
  )).toBeGreaterThanOrEqual(60);

  const startup = await readPerformanceTelemetry(page);

  // D10 (2026-07-24): drain mount-phase frames from the 120-sample pacing
  // ring before the steady-state window opens. The first frames after world
  // mount are SwiftShader shader-JIT and first-upload stalls (measured
  // first-frame drawDurationMs ≈ 658 ms; ~15 mount frames of 300–2000 ms
  // pollute the ring, holding sample-0 p90 at ≈ 283 ms while the true
  // steady-state p90 is 183.4 ms). This test's name and intent are
  // STEADY-STATE pacing; startup cost stays measured by the startup
  // assertions below (timeToFirstCoherentFrameMs), which read the `startup`
  // snapshot taken before this drain. Budget values are untouched — the ring
  // drains until no frame above the mount threshold remains, so every
  // sampled p90/fps value below reflects steady state (minFps ≥ 4 was the
  // same mount artifact: 3.8–3.9 pre-drain).
  await expect.poll(async () => (
    (await readPerformanceTelemetry(page)).framePacing?.maxMs
      ?? Number.POSITIVE_INFINITY
  ), { timeout: MOUNT_DRAIN_TIMEOUT_MS }).toBeLessThanOrEqual(MOUNT_FRAME_THRESHOLD_MS);

  await installLongTaskProbe(page);
  await exerciseCamera(page, canvas);
  const interactionLongTasks = await readLongTaskProbe(page);
  const recurringInteractionLongTasks = interactionLongTasks.durations.filter(
    (duration) => duration > 50,
  );

  const samples: PerformanceTelemetry[] = [];
  for (let second = 0; second < PERFORMANCE_SECONDS; second += 1) {
    await page.waitForTimeout(1_000);
    samples.push(await readPerformanceTelemetry(page));
  }

  const pacing = samples.map((sample) => sample.framePacing);
  const p90Values = pacing.map((sample) => sample?.p90Ms ?? Number.POSITIVE_INFINITY);
  const fpsValues = pacing.map((sample) => sample?.effectiveFps ?? 0);
  const gpuSamples = samples.map((sample) => sample.gpu);
  const geometryCounts = gpuSamples.map((sample) => sample?.geometries ?? 0);
  const textureCounts = gpuSamples.map((sample) => sample?.textures ?? 0);
  const rendererInfo = await readWebGlRendererInfo(canvas);
  const maxP90Ms = Math.max(...p90Values);
  const minFps = Math.min(...fpsValues);
  const maxInteractionLongTaskMs = Math.max(0, ...interactionLongTasks.durations);
  const sustainedLowFpsSamples = longestLowFpsRun(samples);
  const geometryRange = Math.max(...geometryCounts) - Math.min(...geometryCounts);
  const textureRange = Math.max(...textureCounts) - Math.min(...textureCounts);

  const evidence = {
    browserName,
    interactionLongTasks,
    mode: REFERENCE_GATE ? "reference-hardware-gate" : "headless-diagnostic",
    observed: {
      geometryRange,
      maxInteractionLongTaskMs,
      maxP90Ms,
      minFps,
      recurringInteractionLongTasks: recurringInteractionLongTasks.length,
      sustainedLowFpsSamples,
      textureRange,
    },
    rendererInfo,
    samples,
    stabilitySeconds: PERFORMANCE_SECONDS,
    startup,
    thresholds: REFERENCE_GATE
      ? {
          maxP90Ms: 20,
          maxRecurringInteractionLongTasks: 1,
          maxSustainedLowFpsSamples: 2,
          minFps: 45,
          startupMs: 2_500,
        }
      : {
          maxP90Ms: 250,
          minFps: 4,
          startupMs: 15_000,
        },
  };
  const evidenceJson = `${JSON.stringify(evidence, null, 2)}\n`;
  const evidenceDirectory = "outputs/performance";
  const safeProjectName = testInfo.project.name.replaceAll(/[^a-z0-9-]+/gi, "-");
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    `${evidenceDirectory}/performance-${REFERENCE_GATE ? "reference" : "diagnostic"}-${safeProjectName}.json`,
    evidenceJson,
  );
  await testInfo.attach("performance-telemetry", {
    body: Buffer.from(evidenceJson),
    contentType: "application/json",
  });

  expect(startup.rendererBackend).toBe("three");
  expect(startup.timeToFirstCoherentFrameMs).not.toBeNull();
  expect(startup.timeToFirstCoherentFrameMs ?? Number.POSITIVE_INFINITY)
    .toBeLessThanOrEqual(REFERENCE_GATE ? 2_500 : 15_000);
  if (REFERENCE_GATE) {
    expect(interactionLongTasks.supported).toBe(true);
    expect(recurringInteractionLongTasks.length).toBeLessThanOrEqual(1);
  } else if (interactionLongTasks.supported) {
    expect(maxInteractionLongTaskMs).toBeLessThanOrEqual(1_000);
  }

  expect(pacing.every((sample) => sample !== null && sample.sampleCount >= 60)).toBe(true);
  if (REFERENCE_GATE) {
    expect(maxP90Ms).toBeLessThanOrEqual(20);
    expect(sustainedLowFpsSamples).toBeLessThan(3);
  } else {
    // Headless SwiftShader is diagnostic only. These ceilings catch a stalled
    // loop without pretending to prove the operator-reference-hardware gate.
    expect(maxP90Ms).toBeLessThanOrEqual(250);
    expect(minFps).toBeGreaterThanOrEqual(4);
  }

  expect(gpuSamples.every((sample) => (
    sample !== null
    && sample.calls > 0
    && sample.geometries > 0
    && sample.triangles > 0
  ))).toBe(true);
  expectGpuResourcesWithinBudget(startup.gpu);
  for (const sample of gpuSamples) expectGpuResourcesWithinBudget(sample);
  expect(geometryRange).toBeLessThanOrEqual(1);
  expect(textureRange).toBeLessThanOrEqual(1);
  if (REFERENCE_GATE) {
    expect(browserName).toBe("chromium");
    expect(rendererInfo.renderer).not.toMatch(
      /swiftshader|llvmpipe|lavapipe|software|unavailable/i,
    );
  }
});

test("long-session GPU resources remain bounded", async ({ page }, testInfo) => {
  test.setTimeout((LONG_SESSION_SECONDS + 45) * 1000);
  const canvas = await openWorld(page);
  await expect.poll(async () => (
    (await readPerformanceTelemetry(page)).framePacing?.sampleCount ?? 0
  )).toBeGreaterThanOrEqual(60);

  const samples: Array<{
    calls: number;
    geometries: number;
    rendererBackend: string | null;
    second: number;
    textures: number;
    triangles: number;
  }> = [];
  for (let second = 1; second <= LONG_SESSION_SECONDS; second += 1) {
    await page.waitForTimeout(1_000);
    const telemetry = await readPerformanceTelemetry(page);
    samples.push({
      calls: telemetry.gpu?.calls ?? 0,
      geometries: telemetry.gpu?.geometries ?? 0,
      rendererBackend: telemetry.rendererBackend,
      second,
      textures: telemetry.gpu?.textures ?? 0,
      triangles: telemetry.gpu?.triangles ?? 0,
    });
  }

  const geometryCounts = samples.map((sample) => sample.geometries);
  const textureCounts = samples.map((sample) => sample.textures);
  const evidence = {
    durationSeconds: LONG_SESSION_SECONDS,
    geometryRange: Math.max(...geometryCounts) - Math.min(...geometryCounts),
    samples,
    textureRange: Math.max(...textureCounts) - Math.min(...textureCounts),
  };
  const evidenceJson = `${JSON.stringify(evidence, null, 2)}\n`;
  const evidenceDirectory = "outputs/performance";
  const safeProjectName = testInfo.project.name.replaceAll(/[^a-z0-9-]+/gi, "-");
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(
    `${evidenceDirectory}/stability-${REFERENCE_GATE ? "reference" : "diagnostic"}-${safeProjectName}.json`,
    evidenceJson,
  );
  await testInfo.attach("long-session-stability", {
    body: Buffer.from(evidenceJson),
    contentType: "application/json",
  });

  await expect(canvas).toHaveAttribute("data-renderer-status", "ready");
  expect(samples.every((sample) => (
    sample.calls > 0
    && sample.geometries > 0
    && sample.rendererBackend === "three"
  ))).toBe(true);
  for (const sample of samples) expectGpuResourcesWithinBudget(sample);
  expect(evidence.geometryRange).toBeLessThanOrEqual(1);
  expect(evidence.textureRange).toBeLessThanOrEqual(1);
});

function expectGpuResourcesWithinBudget(
  gpu: PerformanceTelemetry["gpu"],
): void {
  expect(gpu).not.toBeNull();
  if (!gpu) return;
  expect(gpu.calls).toBeLessThanOrEqual(GPU_RESOURCE_BUDGET.calls);
  expect(gpu.geometries).toBeLessThanOrEqual(GPU_RESOURCE_BUDGET.geometries);
  expect(gpu.textures).toBeLessThanOrEqual(GPU_RESOURCE_BUDGET.textures);
  expect(gpu.triangles).toBeLessThanOrEqual(GPU_RESOURCE_BUDGET.triangles);
}

test("repeated transient ship selection releases GPU resources", async ({ page }) => {
  // Seven full world rebuilds, one per round. They cost about 2 s each on a
  // working machine, but a rebuild that runs long must read as slow rather than
  // as a broken deep link, so the ceiling is well clear of the 60 s default.
  test.setTimeout(180_000);
  const lighthouseModelResponse = page.waitForResponse((response) => (
    new URL(response.url()).pathname === LIGHTHOUSE_MODEL_PATH
    && response.ok()
  ));
  await openWorld(page, true);
  await lighthouseModelResponse;
  // The checked GLB swaps in after the procedural first frame. Establish the
  // resource baseline only after that one-time model load has rendered.
  await page.waitForTimeout(250);
  const closeDetails = page.getByRole("button", { name: "Close details" });
  if (await closeDetails.isVisible()) await closeDetails.click();
  // The fleet search is retired (interface revamp DU2), so the ship is selected
  // through the same `#sel=` deep link visitors share.
  //
  // The ship is DERIVED from the fleet the runtime actually built, never named
  // literally. This test spent its whole life deep-linking `ship.satusd-river`,
  // which no fixture has ever contained: the panel never opened, so the
  // disposal loop below never ran and the lane was red for a reason that had
  // nothing to do with GPU resources. Reading the live fleet also avoids the
  // next trap — not every fixture asset becomes a ship, so picking off the
  // fixture alone can still name a coin the world never sails.
  let fleetIds = new Set<string>();
  await expect.poll(async () => {
    fleetIds = new Set((await readRuntimeSnapshot(page)).shipMotionSamples.map(({ id }) => id));
    return fleetIds.size;
  }).toBeGreaterThan(0);
  const subject = denseFixtureStablecoins.peggedAssets.find(({ id }) => fleetIds.has(id));
  expect(subject).toBeDefined();
  if (!subject) throw new Error("The dense fixture must put at least one ship in the world.");
  const selectAndCloseTransient = async () => {
    // `about:blank` first, deliberately. The app syncs camera and selection
    // into the hash, so after round one the address already reads
    // `#sel=ship.<id>&t=…&cam=…`; navigating "again" to `/?debug=1#sel=ship.<id>`
    // differs only in the fragment, which is a SAME-document navigation. No
    // reload, no hashchange worth acting on, and — because the previous round
    // closed the panel — no selection either, so the panel simply never came
    // back. That is what made this loop look like a broken deep link.
    await page.goto("about:blank");
    await page.goto(`/?debug=1#sel=ship.${subject.id}`);
    // Condition on the runtime being genuinely up rather than on a fixed 15 s
    // expect window: each round rebuilds the whole world, and a rebuild that
    // ran long used to surface as "renderer never became ready" instead of
    // simply taking its time. This wait is bounded by the test timeout.
    await waitForRuntimeDebug(page, true);
    await expect(page.getByTestId("pharosville-detail-panel")).toContainText(subject.name);
    await closeDetails.click();
    await expect(page.getByTestId("pharosville-detail-panel")).toHaveCount(0);
  };

  // The first follow moves the camera into Explore LOD and uploads four shared
  // fine-detail geometries. Warm that bounded tier before checking for growth.
  await selectAndCloseTransient();
  const baseline = await readPerformanceTelemetry(page);
  expect(baseline.gpu).not.toBeNull();

  for (let iteration = 0; iteration < 6; iteration += 1) {
    await selectAndCloseTransient();
    await expect.poll(async () => {
      const telemetry = await readPerformanceTelemetry(page);
      return {
        geometries: telemetry.gpu?.geometries ?? 0,
        textures: telemetry.gpu?.textures ?? 0,
      };
    }).toEqual({
      geometries: baseline.gpu?.geometries,
      textures: baseline.gpu?.textures,
    });
  }
});

// Number of world REPLACEMENTS the soak drives. The product's core use is being
// left open for hours, during which the poll replaces the world on every cron
// tick — so a per-replacement disposal leak is the one leak a visitor actually
// meets, and until now nothing gated it: every other resource bound in this file
// measures ONE world.
const REFRESH_SOAK_CYCLES = 12;
// The stablecoins poll runs at 2x its 900 s cron interval, so one tick past
// thirty minutes lands exactly one refetch per cycle.
const REFRESH_SOAK_STEP = "31:00";

test("repeated world replacement returns GPU resources to a flat baseline", async ({ page }) => {
  test.setTimeout(240_000);

  // The world is replaced through the REAL path a long session uses: the
  // polling refetch. Reaching it needs a clock, not a reconnect — `staleTime`
  // is the 15 min cron interval, so a fresh query ignores every other trigger
  // (measured: an offline/online toggle never refetched once). Under reduced
  // motion there is no rAF loop to disturb, so faking timers is safe here.
  await page.clock.install();

  let stablecoinFetches = 0;
  let supplyScale = 1;
  let shipCountLimit = Number.POSITIVE_INFINITY;
  const meta = { updatedAt: 1_700_000_000, ageSeconds: 60, status: "fresh" };
  const currentStablecoins = () => ({
    peggedAssets: denseFixtureStablecoins.peggedAssets
      .slice(0, shipCountLimit)
      .map((asset) => ({
        ...asset,
        circulating: asset.circulating
          ? { ...asset.circulating, peggedUSD: (asset.circulating.peggedUSD ?? 0) * supplyScale }
          : asset.circulating,
      })),
  });
  const payloads: Array<[string, () => unknown]> = [
    [PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.stablecoins, () => {
      stablecoinFetches += 1;
      return currentStablecoins();
    }],
    [PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.chains, () => denseFixtureChains],
    [PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.stability, () => fixtureStability],
    [PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.pegSummary, () => denseFixturePegSummary],
    [PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.stress, () => denseFixtureStress],
    [PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.reportCards, () => denseFixtureReportCards],
    // The seventh feed. Left unrouted it escapes to the local dev proxy and the
    // live API, which under `page.clock` fake timers is neither deterministic
    // nor offline-safe.
    [PHAROSVILLE_API_ENDPOINT_PATHS_BY_KEY.mintBurn, () => fixtureMintBurn],
  ];
  for (const [path, body] of payloads) {
    const endpoint = new URL(path, "http://localhost");
    await page.route(
      (url) => url.pathname === endpoint.pathname && url.search === endpoint.search,
      async (route) => {
        await route.fulfill({
          body: JSON.stringify({ ...(body() as Record<string, unknown>), _meta: meta }),
          contentType: "application/json",
        });
      },
    );
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockScreenSize(page, SCREEN.width, SCREEN.height);
  await page.setViewportSize(VIEWPORT);
  await installWallClockOverride(page, 12);
  await page.goto("/?debug=1&t=12");
  await waitForRuntimeDebug(page, true);

  const readSoakSample = async () => {
    const snapshot = await readRuntimeSnapshot(page);
    const gpu = (snapshot.renderMetrics as { gpu?: Record<string, number> } | null)?.gpu;
    return {
      geometries: gpu?.geometries ?? 0,
      programs: gpu?.programs ?? 0,
      ships: snapshot.shipMotionSamples.length,
      textures: gpu?.textures ?? 0,
    };
  };
  const advanceOneReplacement = async () => {
    const before = stablecoinFetches;
    await page.clock.fastForward(REFRESH_SOAK_STEP);
    await expect.poll(() => stablecoinFetches).toBeGreaterThan(before);
    await page.waitForTimeout(1_500);
  };

  // Prove the pipe before trusting anything it reports. A refetch that never
  // reaches the renderer would hold every count perfectly flat and this test
  // would pass while measuring nothing, so drop one ship from the payload and
  // require the rendered fleet to follow.
  const fullFleet = (await readSoakSample()).ships;
  expect(fullFleet).toBeGreaterThan(10);
  shipCountLimit = denseFixtureStablecoins.peggedAssets.length - 1;
  await advanceOneReplacement();
  await expect.poll(async () => (await readSoakSample()).ships).toBe(fullFleet - 1);
  shipCountLimit = Number.POSITIVE_INFINITY;
  await advanceOneReplacement();
  await expect.poll(async () => (await readSoakSample()).ships).toBe(fullFleet);

  // Baseline AFTER the first replacements, not at mount. three.js caches shader
  // programs internally and that cache never shrinks, and the first replacement
  // also warms the swap path itself — so the honest assertion is FLATNESS from
  // here on, not a return to the mount-time counts.
  const baseline = await readSoakSample();
  const samples: Array<typeof baseline & { cycle: number }> = [];
  for (let cycle = 1; cycle <= REFRESH_SOAK_CYCLES; cycle += 1) {
    // A payload that deep-equals the last one is discarded by React Query's
    // structural sharing, which would leave the world model untouched and the
    // soak vacuous. Move the supply enough to defeat that, but far too little
    // to cross a hull-size tier and change the geometry mix for honest reasons.
    supplyScale = 1 + cycle * 0.0005;
    await advanceOneReplacement();
    samples.push({ ...(await readSoakSample()), cycle });
  }

  const evidence = {
    baseline,
    cycles: REFRESH_SOAK_CYCLES,
    samples,
    stablecoinFetches,
  };
  await mkdir("outputs/performance", { recursive: true });
  await writeFile(
    "outputs/performance/refresh-soak-diagnostic.json",
    `${JSON.stringify(evidence, null, 2)}\n`,
  );

  // Every ship is back, so any drift in the counts below is retained garbage
  // rather than a smaller world.
  for (const sample of samples) expect(sample.ships).toBe(fullFleet);
  for (const sample of samples) {
    expect(sample.geometries).toBe(baseline.geometries);
    expect(sample.textures).toBe(baseline.textures);
    expect(sample.programs).toBe(baseline.programs);
  }
  // The one-world budgets still have to hold after a dozen replacements.
  expectGpuResourcesWithinBudget({
    calls: 0,
    geometries: samples.at(-1)?.geometries ?? 0,
    textures: samples.at(-1)?.textures ?? 0,
    triangles: 0,
  });
});

test("hidden and reduced-motion states stop the continuous world clock", async ({ page }) => {
  await page.addInitScript(() => {
    type VisibilityControl = (value: "hidden" | "visible") => void;
    let visibilityState: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => visibilityState === "hidden",
    });
    (window as typeof window & { __setPharosTestVisibility?: VisibilityControl })
      .__setPharosTestVisibility = (value) => {
        visibilityState = value;
        document.dispatchEvent(new Event("visibilitychange"));
      };
  });

  await openWorld(page);
  await page.evaluate(() => {
    (window as typeof window & {
      __setPharosTestVisibility?: (value: "hidden" | "visible") => void;
    }).__setPharosTestVisibility?.("hidden");
  });
  await page.waitForTimeout(100);
  const hiddenStart = await readRuntimeSnapshot(page);
  await page.waitForTimeout(350);
  const hiddenEnd = await readRuntimeSnapshot(page);
  expect(hiddenEnd.motionFrameCount).toBe(hiddenStart.motionFrameCount);
  expect(hiddenEnd.timeSeconds).toBe(hiddenStart.timeSeconds);

  await page.evaluate(() => {
    (window as typeof window & {
      __setPharosTestVisibility?: (value: "hidden" | "visible") => void;
    }).__setPharosTestVisibility?.("visible");
  });
  await expect.poll(async () => (await readRuntimeSnapshot(page)).timeSeconds)
    .toBeGreaterThan(hiddenEnd.timeSeconds);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByTestId("pharosville-canvas")).toHaveAttribute(
    "data-renderer-status",
    "ready",
  );
  await waitForRuntimeDebug(page, true);
  const reducedStart = await readRuntimeSnapshot(page);
  await page.waitForTimeout(350);
  const reducedEnd = await readRuntimeSnapshot(page);
  expect(reducedStart.activeMotionLoopCount).toBe(0);
  expect(reducedEnd.motionFrameCount).toBe(reducedStart.motionFrameCount);
  expect(reducedEnd.timeSeconds).toBe(0);
  // The control survives reduced motion as a stepper, so what proves the clock
  // is stopped is that it never latches — not that it disappeared.
  await expect(page.getByRole("button", { name: "Observe harbor" }))
    .toHaveAttribute("aria-pressed", "false");
});

test("a delayed world renderer module stays in loading state and then starts normally", async ({
  page,
}) => {
  let moduleRequested = false;
  let releaseModule = () => {};
  const moduleHold = new Promise<void>((resolve) => {
    releaseModule = resolve;
  });
  await page.route(WORLD_MODULE_ROUTE, async (route) => {
    moduleRequested = true;
    await moduleHold;
    await route.continue();
  });
  await prepareWorldPage(page, true);
  await page.goto("/?debug=1&t=12", { waitUntil: "domcontentloaded" });

  try {
    await expect.poll(() => moduleRequested).toBe(true);
    const canvas = page.getByTestId("pharosville-canvas");
    await expect(canvas).toHaveAttribute("data-renderer-status", "loading");
    await page.waitForTimeout(350);
    await expect(canvas).toHaveAttribute("data-renderer-status", "loading");
    await expect(page.getByTestId("pharosville-renderer-fallback")).toHaveCount(0);
    releaseModule();
    await expect(canvas).toHaveAttribute("data-renderer-status", "ready");
    await expect.poll(async () => (
      (await readPerformanceTelemetry(page)).gpu?.calls ?? 0
    )).toBeGreaterThan(0);
  } finally {
    releaseModule();
  }
});

test("a failed world renderer module presents the static signal overview", async ({ page }) => {
  await page.route(WORLD_MODULE_ROUTE, async (route) => {
    await route.abort("failed");
  });
  await prepareWorldPage(page, true);
  await page.goto("/?debug=1&t=12");

  const canvas = page.getByTestId("pharosville-canvas");
  await expect(canvas).toHaveAttribute("data-renderer", "three");
  await expect(canvas).toHaveAttribute("data-renderer-status", "failed");
  const fallback = page.getByTestId("pharosville-renderer-fallback");
  await expect(fallback).toBeVisible();
  await expect(canvas).toBeHidden();
  await expect(fallback.getByRole("heading", { name: "Harbor signal overview" })).toBeVisible();
  await expect(fallback.getByRole("button", { name: "Open Lighthouse details" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use standard view" })).toHaveCount(0);
});
