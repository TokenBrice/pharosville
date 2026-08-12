#!/usr/bin/env node
/**
 * Preview PharosVille on the REAL GPU, and report what the frame actually cost.
 *
 * Why this exists: Playwright's bundled Chromium falls back to SwiftShader — a
 * pure CPU rasteriser — so every screenshot and every fps figure taken through
 * it is software-rendered. The world looks roughly right but the numbers are
 * fiction: the scheduler drops to `recovery`/`constrained` for reasons that do
 * not exist on the operator's machine, and the load lands on the CPU.
 *
 * Measured 2026-07-25 on a machine with an RTX 5070 Ti and a Raphael iGPU,
 * three runs each, perfectly stable:
 *
 *   playwright bundled chromium            SwiftShader (CPU)
 *   playwright channel: "chrome"           SwiftShader (CPU)
 *   /usr/bin/google-chrome-stable          NVIDIA RTX 5070 Ti
 *
 * The reason `channel` is no better than the bundle: it launches
 * `/opt/google/chrome/chrome` DIRECTLY, while `/usr/bin/google-chrome-stable`
 * is a wrapper script that applies the operator's own
 * `~/.config/chrome-flags.conf` — on this machine an explicit
 * `--render-node-override` onto the discrete card, because the default GL path
 * here resolves to the iGPU (`glxinfo` reports radeonsi/Raphael).
 *
 * So this script deliberately goes THROUGH the wrapper. "Real conditions" then
 * means the operator's actual conditions, and it keeps tracking them if they
 * retune that file. Do not "simplify" this to `channel: "chrome"`.
 *
 * It also ASSERTS the renderer is hardware and exits non-zero on SwiftShader,
 * so a software frame can never be mistaken for evidence again.
 *
 * With --assert it becomes a gate: the thresholds below have to hold or the
 * process exits 1. Because a GPU-only regression is caught pre-push or not at
 * all (CI has no GPU), that gate has exactly three outcomes and never two —
 * PASS, FAIL, and SKIP (exit 78) when this machine cannot render a real frame.
 * Never collapse SKIP into PASS.
 *
 * Usage:
 *   node scripts/pharosville/preview.mjs
 *   node scripts/pharosville/preview.mjs --hash "#t=22&n=1" --out night.png
 *   node scripts/pharosville/preview.mjs --headed --seconds 8
 *   node scripts/pharosville/preview.mjs --reduced          # static-frame path
 *   node scripts/pharosville/preview.mjs --legend           # keep the onboarding overlay
 *   node scripts/pharosville/preview.mjs --quick-find       # open the search chrome for review
 *   node scripts/pharosville/preview.mjs --hover-first      # hover a visible ship target
 *   node scripts/pharosville/preview.mjs --url http://localhost:4173 --width 2560 --height 1440
 *   node scripts/pharosville/preview.mjs --assert            # perf tripwire, exits non-zero
 *   node scripts/pharosville/preview.mjs --assert --reduced  # settled static resource gate
 *   node scripts/pharosville/preview.mjs --artifact-check    # short-interval full-frame flash probe
 *   node scripts/pharosville/preview.mjs --assert --max-p90=20 --max-draw-calls=700
 *   node scripts/pharosville/preview.mjs --texture-census    # attribute live texture owners
 *   node scripts/pharosville/preview.mjs --refresh common   # main-thread cost of a data refresh
 *   node scripts/pharosville/preview.mjs --refresh churn    # ... with every placement moved
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { analyzeArtifactFlashFrames } from "./artifact-flash-metric.mjs";

/**
 * The operator's own Chrome, per platform — never Playwright's bundle.
 *
 * On Linux this is deliberately the WRAPPER, not the binary. See the header:
 * `/usr/bin/google-chrome-stable` is what applies the operator's
 * `chrome-flags.conf` and so what puts rendering on the real GPU;
 * `/opt/google/chrome/chrome` skips it and lands on SwiftShader.
 *
 * On macOS there is no wrapper and no flags file to apply: the app bundle's
 * binary already resolves to the system GPU through ANGLE/Metal (measured
 * 2026-08-13 on an M5 Pro — `ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro)`
 * at a steady 120 fps, tier `full`). The SwiftShader assertion below is what
 * keeps that claim honest on either platform, so the resolution can differ
 * while the guarantee does not.
 */
const SYSTEM_CHROME_BY_PLATFORM = {
  darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  linux: "/usr/bin/google-chrome-stable",
  win32: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
};
const SYSTEM_CHROME = SYSTEM_CHROME_BY_PLATFORM[process.platform] ?? SYSTEM_CHROME_BY_PLATFORM.linux;

/** Exit code for "did not measure" — distinct from 1, which means "measured, and it regressed". */
const SKIP_EXIT_CODE = 78;

const args = parseArgs(process.argv.slice(2));
if (args["artifact-check"] && args.reduced) {
  throw new Error("--artifact-check needs normal motion; --reduced is intentionally static.");
}
const assertMode = Boolean(args.assert);
const limits = {
  // The perf suite's ceiling (docs/pharosville/TESTING.md); a steady 668 today.
  maxDrawCalls: numberFlag("max-draw-calls", 700),
  maxGeometries: numberFlag("max-geometries", 500),
  maxTextures: numberFlag("max-textures", 72),
  maxTriangles: numberFlag("max-triangles", 500_000),
  // A vsync-capped 60Hz frame is 16.7ms. 20ms leaves room for the odd missed
  // vsync without pretending 33ms (a whole dropped frame) is acceptable.
  maxP90Ms: numberFlag("max-p90", 20),
  requiredTier: typeof args["require-tier"] === "string" ? args["require-tier"] : "full",
};
const url = args.url ?? "http://localhost:5173";
/**
 * Three arms, so the stages can be read off the DIFFERENCES rather than off a
 * CPU profile whose self time lands mostly in `(program)`:
 *
 *   same    the identical payload. React Query's structural sharing discards
 *           it, so nothing downstream rebuilds — this arm is the fetch, the
 *           JSON parse and the schema validation, and nothing else.
 *   common  supply moved by a sub-percent wiggle, which sticky placement
 *           (commit 61905cc) holds still. The refresh a cron tick produces:
 *           world model rebuild, React commit, scene rebuild, no ship moves.
 *   churn   every coin rotated across the peg-deviation bands AND the hull
 *           tiers, so every ship changes placement, every path key changes,
 *           and the A* re-solve and fleet rebuild both fire. The worst case a
 *           payload can produce, not a realistic one.
 */
const REFRESH_MODES = ["same", "common", "churn"];
const refreshMode = typeof args.refresh === "string" ? args.refresh : (args.refresh ? "common" : null);
if (refreshMode && !REFRESH_MODES.includes(refreshMode)) {
  throw new Error(`--refresh takes one of ${REFRESH_MODES.join(", ")}, got "${refreshMode}"`);
}
/** Where the probe fetches world data from, when the page itself cannot serve it. */
const apiOrigin = typeof args["api-origin"] === "string" ? args["api-origin"] : null;
/** Deviation bands from `deviationPlacement` in src/systems/risk-placement.ts. */
const CHURN_DEVIATION_BPS = [5, 80, 300, 700];
/** Timed rounds, plus one warm-up whose numbers are discarded and one profiled. */
const REFRESH_TIMED_ROUNDS = 3;
/** Long enough to contain the freeze the stale comment claimed, with headroom. */
const REFRESH_WINDOW_MS = 4000;
const PROFILE_STAGES = [
  ["world model rebuild", (url) => url.includes("/src/systems/")],
  ["scene rebuild", (url) => url.includes("/src/three/")],
  ["app render", (url) => url.includes("/src/")],
  ["React render + commit", (url, name) => /^(performWorkOnRoot|commitRoot|flushSync|performSyncWorkOnRoot|renderRootSync|processRootScheduleInMicrotask)/.test(name)],
  ["fetch, parse, validate", (url, name) => /^(parse|_parse|safeParse|json|replaceEqualDeep)$/.test(name)],
];

/** Declared here, not with the probe below, because the route handler runs first. */
const refreshState = { gate: null, openGate: null, parked: 0, round: 0 };

// A refresh probe must not be measuring the day cycle as well: a 31-minute
// clock jump would step the sky and rebake the PMREM probe inside the window.
// Pinning the hour makes the payload the only thing that moved.
const hash = args.hash ?? (refreshMode ? "#t=12" : "");
const width = Number(args.width ?? 1600);
const height = Number(args.height ?? 1000);
// Long enough for the frame-pacing window to fill with steady-state frames
// rather than the load spike.
const seconds = Number(args.seconds ?? 6);
const outputDirectory = resolve(process.cwd(), "outputs");
const outputPath = resolve(outputDirectory, args.out ?? "preview.png");

const chromePath = typeof args.chrome === "string" ? args.chrome : SYSTEM_CHROME;

// Only --assert degrades to a skip. A bare `npm run preview` was asked for
// deliberately, so it keeps failing loudly with the real reason.
if (assertMode) {
  const blocker = await findUnmeasurableReason();
  if (blocker) {
    console.log(`SKIP: real-GPU preview assertions did not run — ${blocker}`);
    console.log("Nothing was measured, so nothing is being claimed about frame time.");
    process.exit(SKIP_EXIT_CODE);
  }
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: !args.headed,
});

try {
  const page = await browser.newPage({
    viewport: { height, width },
    deviceScaleFactor: Number(args.dpr ?? 1),
    // Explicit: the repo's playwright config emulates `reduce` for determinism,
    // and under reduced motion the world renders ONE static frame with zero RAF.
    // That is correct for the visual lane and useless for a frame-time reading —
    // `sampleCount` stays 0 and fps reads as 0. Pass --reduced to measure the
    // static path deliberately.
    reducedMotion: args.reduced ? "reduce" : "no-preference",
  });

  // Same first-visit seeding the visual lane does: the legend auto-opens once
  // per browser profile, and a fresh profile means it covers a third of every
  // preview. Pass --legend to see it deliberately.
  if (!args.legend) {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("pharosville.legend.dismissed", "1");
      } catch {
        // Storage unavailable: the app treats that as dismissed anyway.
      }
    });
  }

  if (refreshMode) await installRefreshProbe(page);

  // Shader tripwire: a material the driver rejects is skipped SILENTLY at draw
  // time — the perf numbers below still pass while a whole subsystem (the sea,
  // once) is missing from the frame. Collect the console so assert mode can
  // fail on what the counters cannot see. (2026-07-30: `uStorm` undeclared in
  // the water fragment made the sea invisible while every metric was green.)
  const shaderErrors = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/Shader Error|VALIDATE_STATUS|program not valid|Fragment shader is not compiled|Vertex shader is not compiled/.test(text)) {
      shaderErrors.push(text.split("\n")[0].slice(0, 300));
    }
  });
  page.on("pageerror", (err) => {
    shaderErrors.push(`pageerror: ${String(err.message ?? err).split("\n")[0].slice(0, 300)}`);
  });

  const renderer = await readWebglRenderer(page);
  console.log(`chrome     ${chromePath}`);
  console.log(`flags      ${await describeOperatorFlags()}`);
  console.log(`GPU        ${renderer}`);
  if (/swiftshader|softwarerasterizer|llvmpipe/i.test(renderer)) {
    if (assertMode) {
      // A software rasteriser is the SKIP arm, not the FAIL arm: nothing about
      // the renderer has been measured, so nothing may be claimed either way.
      console.log(`SKIP: real-GPU preview assertions did not run — ${renderer} is a software rasteriser.`);
      console.log("Nothing was measured, so nothing is being claimed about frame time.");
      process.exitCode = SKIP_EXIT_CODE;
    } else {
      console.error(
        `\nRefusing to report: this is a SOFTWARE rasteriser, so any frame time or\n`
        + `scheduler tier below would be fiction. Check that ${chromePath} exists`
        + (process.platform === "linux"
          ? `\nand is the wrapper script (not /opt/google/chrome/chrome, which skips the\n`
            + `operator's chrome-flags.conf and lands on SwiftShader).`
          : ` and is the operator's\nreal Chrome, not Playwright's bundled Chromium.`),
      );
      process.exitCode = 1;
    }
    await browser.close();
    process.exit();
  }

  // `debug=1` publishes window.__pharosVilleDebug, which is where the scheduler
  // tier and the GPU counters live.
  const separator = url.includes("?") ? "&" : "?";
  const target = `${url}${separator}debug=1${hash}`;
  await page.goto(target, { waitUntil: "domcontentloaded" });

  const canvas = page.getByTestId("pharosville-canvas");
  await canvas.waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="pharosville-canvas"]')
      ?.getAttribute("data-renderer-status") === "ready",
    undefined,
    { timeout: 45_000 },
  );

  // The frame-pacing window RESETS (on tier change and on snapshot rebuild), so a
  // single read at a fixed delay lands on an empty window about a third of the
  // time and reports 0 fps. Poll until the window is full enough to mean
  // something, then report that read.
  // Getting a frame time that means anything takes three waits, not one.
  //
  // 1. Wait for the fleet. The snapshot rebuild that puts it on screen resets
  //    the pacing window, so a full window before that is a pre-fleet frame —
  //    0 ships, 121 draw calls, and a flattering 16.7ms.
  // 2. Then settle. The 120-sample ring still holds the load spike, which reads
  //    as p90 33ms and tier `recovery` on hardware that is actually vsync-bound.
  // 3. Only then poll for a full window.
  const FULL_ENOUGH_SAMPLES = 100;
  const populateDeadline = Date.now() + 30_000;
  while (Date.now() < populateDeadline) {
    if (((await readMetrics(page)).shipsVisible ?? 0) > 0) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(seconds * 1000);

  let metrics = args.reduced
    ? await waitForSettledStaticMetrics(page)
    : await readMetrics(page);
  if (!args.reduced) {
    const settleDeadline = Date.now() + 20_000;
    while (Date.now() < settleDeadline && (metrics.samples ?? 0) < FULL_ENOUGH_SAMPLES) {
      await page.waitForTimeout(700);
      const read = await readMetrics(page);
      if ((read.samples ?? 0) > (metrics.samples ?? 0)) metrics = read;
    }
  }
  if ((metrics.shipsVisible ?? 0) === 0) {
    console.error("warning: no fleet on screen — the world had not populated, so the frame below is not the world.");
  }

  // Assert mode reads a ring that is entirely steady-state. Each dwell below is
  // longer than the 120-sample window, so every read post-dates the previous one
  // and none of them still carry load-spike frames. Three reads and the median
  // p90, because one background spike on a busy machine must not block a push
  // while a genuine regression — which shows in all three — still does.
  if (assertMode && !args.reduced) {
    const reads = [];
    for (let index = 0; index < 3; index += 1) {
      await page.waitForTimeout(2500);
      reads.push(await readMetrics(page));
    }
    reads.sort((a, b) => (a.p90 ?? Infinity) - (b.p90 ?? Infinity));
    metrics = reads[1];
  }

  await applyRequestedUiState(page);
  await mkdir(outputDirectory, { recursive: true });
  await page.screenshot({ path: outputPath });

  console.log(`URL        ${target}`);
  console.log(`viewport   ${width}x${height} @${args.dpr ?? 1}x, ${args.headed ? "headed" : "headless"}`
    + `, motion ${args.reduced ? "reduced" : "normal"}`);
  console.log(`frame      ${round(metrics.fps)} fps · p50 ${round(metrics.p50)}ms · p90 ${round(metrics.p90)}ms`
    + ` · dropped ${metrics.dropped} of ${metrics.samples}`);
  console.log(`tier       ${metrics.tier} (session worst: ${metrics.tierReached})`
    + ` · composer ${metrics.composer ? "on" : "off"}`);
  console.log(`draw       ${metrics.calls} recurring calls (${metrics.sceneCalls} scene +`
    + ` ${metrics.offscreenCalls} offscreen) · ${metrics.triangles} tris · ${metrics.geometries} geoms`
    + ` · ${metrics.textures} textures · fleet ${metrics.fleetDraws}`);
  console.log(`uploads    ${metrics.textureUploads?.pending ?? 0} pending ·`
    + ` ${metrics.textureUploads?.uploaded ?? 0} uploaded ·`
    + ` ${metrics.textureUploads?.failed ?? 0} failed`);
  if ((metrics.textureUploads?.pendingOwners?.length ?? 0) > 0) {
    console.log(`           owners: ${metrics.textureUploads.pendingOwners.join(", ")}`);
  }
  console.log(`pmrem      ${metrics.environmentBakeCount ?? 0} bakes`
    + ` · last +${metrics.environmentBakeCountChange ?? 0}`
    + ` / ${metrics.environmentBakeCalls ?? 0} calls`);
  console.log(`logos      ${metrics.logoAssetsLoaded ?? 0}/${metrics.logoAssetsExpected ?? 0}`
    + " decoded assets");
  if (
    args["texture-census"]
    || (metrics.textures ?? 0) > limits.maxTextures
  ) {
    printTextureOwnerCensus(metrics.textureOwnerCensus);
  }
  console.log(`fleet      ${metrics.shipsVisible} ships visible`);
  console.log(`shot       ${outputPath}`);

  if (assertMode) evaluateAssertions(metrics, shaderErrors);
  if (args["artifact-check"]) await runArtifactFlashCheck(page, canvas);

  // Last, deliberately: the probe mutates the payload, so everything above —
  // including the screenshot — describes the world as the API actually serves it.
  if (refreshMode) await reportRefreshCost(page);

  if (args.json) {
    await writeFile(
      resolve(outputDirectory, typeof args.json === "string" ? args.json : "preview.json"),
      `${JSON.stringify({ metrics, renderer, target }, null, 2)}\n`,
    );
  }
} finally {
  await browser.close();
}

function round(value) {
  return typeof value === "number" ? Math.round(value * 10) / 10 : value;
}

async function applyRequestedUiState(page) {
  if (args["quick-find"]) {
    await page.keyboard.press("/");
    await page.getByTestId("pharosville-quick-find").waitFor({
      state: "visible",
      timeout: 5_000,
    });
  }
  if (args["hover-first"]) {
    const point = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="pharosville-canvas"]');
      const bounds = canvas?.getBoundingClientRect();
      const targets = window.__pharosVilleDebug?.targets ?? [];
      if (!bounds) return null;
      const target = targets.find(({ kind, rect }) => {
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        return kind === "ship" && x >= 0 && y >= 0 && x <= bounds.width && y <= bounds.height;
      });
      if (!target) return null;
      return {
        x: bounds.left + target.rect.x + target.rect.width / 2,
        y: bounds.top + target.rect.y + target.rect.height / 2,
      };
    });
    if (!point) throw new Error("--hover-first could not find a visible ship target.");
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(250);
  }
}

/* ---------------------------------------------------------------------------
 * REFRESH COST PROBE
 *
 * What a refresh costs is a MAIN-THREAD question — the world model rebuild, the
 * schema parse, the React commit, the A* re-solve and the scene rebuild all run
 * to completion in one task while nothing else can, so frame time in isolation
 * cannot see it. What can is `longtask`, which the browser reports natively and
 * which the Playwright clock shim below therefore cannot distort.
 *
 * Three things make the reading honest:
 *
 * 1. The refresh is provoked the way a session actually gets one — the polling
 *    refetch, reached with a clock jump (`staleTime` is the cron interval, so
 *    no focus or reconnect trigger will do it), against the LIVE payload with
 *    one field rewritten rather than a fixture.
 * 2. The response is PARKED at the proxy until the clock jump's own timer burst
 *    has drained, so the window contains the refresh and nothing else, and the
 *    network round trip sits outside it.
 * 3. Timing rounds run with the CPU profiler OFF. One extra profiled round
 *    afterwards attributes the cost by file; its own overhead never lands in a
 *    reported number.
 * ------------------------------------------------------------------------- */

async function installRefreshProbe(page) {
  // Installed before any navigation so the shim owns the page's timers from the
  // start; resumed immediately so the app still loads in real time and only the
  // deliberate jump below moves the clock.
  await page.clock.install();
  await page.clock.resume();

  await page.addInitScript(() => {
    window.__previewLongtasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__previewLongtasks.push(entry.duration);
        }
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      // No longtask support means no measurement; reported as zero tasks below.
    }
  });

  await page.route("**/api/**", async (route) => {
    let response;
    try {
      // `vite preview` serves the built bundle but has no API proxy — that
      // plugin is `configureServer` only. Borrowing the dev server's proxy for
      // the DATA lets the refresh be measured against the PRODUCTION build,
      // which is the only one whose React commit and pipeline cost mean
      // anything: dev React and unminified modules are their own tax.
      const target = apiOrigin
        ? new URL(new URL(route.request().url()).pathname + new URL(route.request().url()).search, apiOrigin).href
        : undefined;
      response = await route.fetch(target ? { url: target } : undefined);
    } catch {
      await route.fallback();
      return;
    }
    let body;
    try {
      body = await response.json();
    } catch {
      await route.fulfill({ response });
      return;
    }
    const mutated = refreshState.round > 0
      ? mutateWorldPayload(new URL(route.request().url()).pathname, body)
      : body;
    if (refreshState.gate) {
      refreshState.parked += 1;
      await refreshState.gate;
    }
    await route.fulfill({ json: mutated, response });
  });
}

/**
 * The payload edit. `common` moves supply by 0.04% a round — enough to defeat
 * React Query's structural sharing and rebuild the world, far too little to
 * cross a hull tier. `churn` rotates each coin through the supply tiers and the
 * peg-deviation bands, so its placement changes every round.
 */
function mutateWorldPayload(pathname, body) {
  const round_ = refreshState.round;
  if (refreshMode === "same") return body;
  if (pathname.endsWith("/api/stablecoins") && Array.isArray(body?.peggedAssets)) {
    return {
      ...body,
      peggedAssets: body.peggedAssets.map((asset, index) => {
        const factor = refreshMode === "churn"
          ? 1 + ((index + round_) % 5) * 0.4
          : 1 + round_ * 0.0004;
        if (!asset?.circulating || typeof asset.circulating.peggedUSD !== "number") return asset;
        return {
          ...asset,
          circulating: { ...asset.circulating, peggedUSD: asset.circulating.peggedUSD * factor },
        };
      }),
    };
  }
  if (refreshMode === "churn" && pathname.endsWith("/api/peg-summary") && Array.isArray(body?.coins)) {
    return {
      ...body,
      coins: body.coins.map((coin, index) => ({
        ...coin,
        activeDepeg: false,
        currentDeviationBps: CHURN_DEVIATION_BPS[(index + round_) % CHURN_DEVIATION_BPS.length],
      })),
    };
  }
  return body;
}

/** One provoked refresh, measured. Returns the long tasks it blocked for. */
async function measureOneRefresh(page, recorder) {
  refreshState.parked = 0;
  refreshState.round += 1;
  refreshState.gate = new Promise((resolve) => { refreshState.openGate = resolve; });

  // One tick past twice the longest cron interval, so every world poll is due.
  await page.clock.fastForward("31:00");
  const parkDeadline = Date.now() + 20_000;
  while (Date.now() < parkDeadline && refreshState.parked === 0) await page.waitForTimeout(100);
  if (refreshState.parked === 0) throw new Error("no refetch reached the proxy after the clock jump");
  // Let the jump's own timer and rAF backlog finish before the window opens.
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__previewLongtasks.length = 0; });

  if (recorder) await recorder.start();
  refreshState.openGate();
  refreshState.gate = null;
  await page.waitForTimeout(REFRESH_WINDOW_MS);

  const durations = await page.evaluate(() => window.__previewLongtasks.slice());
  return { captured: recorder ? await recorder.stop() : null, durations };
}

/** V8 sampling profiler: which JS stage asked for the time. */
function profileRecorder(cdp) {
  return {
    async start() {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
      await cdp.send("Profiler.start");
    },
    async stop() {
      const { profile } = await cdp.send("Profiler.stop");
      await cdp.send("Profiler.disable");
      return profile;
    },
  };
}

/**
 * Blink's timeline: what the ENGINE did. The V8 profiler cannot see style,
 * layout or paint at all — it reports them as top-of-stack `(program)` — so
 * without this the largest share of the freeze has no name.
 */
function traceRecorder(cdp) {
  const events = [];
  const collect = ({ value }) => events.push(...value);
  return {
    async start() {
      events.length = 0;
      cdp.on("Tracing.dataCollected", collect);
      await cdp.send("Tracing.start", {
        categories: "devtools.timeline,disabled-by-default-devtools.timeline",
        transferMode: "ReportEvents",
      });
    },
    async stop() {
      const complete = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
      await cdp.send("Tracing.end");
      await complete;
      cdp.off("Tracing.dataCollected", collect);
      return events.slice();
    },
  };
}

/**
 * Self time by trace event name inside the SINGLE LONGEST task of the window —
 * which, the gate having just opened, is the refresh freeze itself. Self rather
 * than total, so a `FunctionCall` that spends its time in `Layout` is charged
 * to layout.
 */
function summarizeTrace(events) {
  const complete = events.filter((event) => event.ph === "X" && typeof event.dur === "number");
  let freeze = null;
  for (const event of complete) {
    if (event.name === "RunTask" && (!freeze || event.dur > freeze.dur)) freeze = event;
  }
  if (!freeze) return { freezeMs: 0, rows: [] };

  const inside = complete
    .filter((event) => event.pid === freeze.pid && event.tid === freeze.tid
      && event.ts >= freeze.ts && event.ts + event.dur <= freeze.ts + freeze.dur)
    .sort((a, b) => a.ts - b.ts || b.dur - a.dur);

  const selfUs = new Map();
  const stack = [];
  const settle = (frame) => selfUs.set(frame.name, (selfUs.get(frame.name) ?? 0) + frame.dur - frame.childUs);
  for (const event of inside) {
    while (stack.length > 0 && stack[stack.length - 1].end <= event.ts) settle(stack.pop());
    if (stack.length > 0) stack[stack.length - 1].childUs += event.dur;
    stack.push({ childUs: 0, dur: event.dur, end: event.ts + event.dur, name: event.name });
  }
  while (stack.length > 0) settle(stack.pop());

  // Which JS call the task IS. `FunctionCall` carries the entry point's name
  // and source location, and the outermost one names the owner of the freeze —
  // the answer the V8 profiler cannot give when its time sits in `(program)`.
  const calls = inside
    .filter((event) => event.name === "FunctionCall" && event.args?.data)
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 4)
    .map((event) => {
      const data = event.args.data;
      const file = /\/([^/?]+(?:\?[^:]*)?)$/.exec(data.url ?? "")?.[1] ?? data.url ?? "?";
      return `${round(event.dur / 1000)}ms  ${data.functionName || "(anonymous)"} — ${file}:${data.lineNumber}`;
    });

  // Blink defers style and layout to the next rendering step, so a commit that
  // rewrote a large DOM subtree pays for it in the TASK AFTER the freeze. That
  // cost is part of the refresh and would be invisible if only the freeze were
  // read, so it is totalled across the whole window.
  const RENDERING_STEPS = new Set([
    "Commit", "Layout", "Layerize", "Paint", "PrePaint", "RecalcStyles", "UpdateLayoutTree", "UpdateLayerTree",
  ]);
  let renderingMs = 0;
  for (const event of complete) {
    if (RENDERING_STEPS.has(event.name)) renderingMs += event.dur / 1000;
  }

  return {
    calls,
    freezeMs: freeze.dur / 1000,
    renderingMs,
    rows: [...selfUs.entries()].map(([name, us]) => [name, us / 1000]).sort((a, b) => b[1] - a[1]),
  };
}

function summarizeRefresh(durations) {
  const blocking = durations.reduce((total, duration) => total + Math.max(0, duration - 50), 0);
  return {
    blockingMs: blocking,
    busyMs: durations.reduce((total, duration) => total + duration, 0),
    count: durations.length,
    longestMs: durations.reduce((longest, duration) => Math.max(longest, duration), 0),
  };
}

/**
 * Self time per source FILE, which is what maps onto the stages the refresh
 * argument is about: the world pipeline under src/systems, the React commit in
 * react-dom, the scene rebuild under src/three.
 */
/**
 * Attribution by STAGE, walking each sample's ancestors until one matches.
 *
 * Self time alone is useless here: over half of it lands in `(program)`, which
 * is V8's bucket for native work it cannot unwind — the JSON parse, the GL
 * uploads, the shader link. Charging a sample to its nearest recognised
 * ANCESTOR (the `PROFILE_STAGES` table above) puts that native time under the
 * stage that asked for it, and because only the nearest ancestor counts,
 * nothing is charged twice.
 */
function summarizeProfile(profile, cutoffMs) {
  const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
  const parentById = new Map();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) parentById.set(child, node.id);
  }
  const stageByNode = new Map();
  const stageFor = (nodeId) => {
    if (stageByNode.has(nodeId)) return stageByNode.get(nodeId);
    const node = nodesById.get(nodeId);
    const frame = node?.callFrame;
    const parent = parentById.get(nodeId);
    let stage = null;
    if (frame) {
      const match = PROFILE_STAGES.find(([, test]) => test(frame.url ?? "", frame.functionName ?? ""));
      stage = match?.[0] ?? null;
      // V8's own nodes — (idle), (program), (garbage collector) — are their own
      // answer only at the TOP of the stack. Nested under a stage they are that
      // stage's native work (a GL upload, a parse) and belong to it.
      if (!stage && !frame.url && parent !== undefined && parentById.get(parent) === undefined) {
        stage = frame.functionName || "(unattributed)";
      }
    }
    if (!stage) {
      stage = parent === undefined ? (frame?.functionName || "(unattributed)") : stageFor(parent);
    }
    stageByNode.set(nodeId, stage);
    return stage;
  };

  const stageMs = new Map();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  let elapsedMs = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const deltaMs = Math.max(0, deltas[index] ?? 0) / 1000;
    elapsedMs += deltaMs;
    if (elapsedMs > cutoffMs) break;
    const stage = stageFor(samples[index]);
    stageMs.set(stage, (stageMs.get(stage) ?? 0) + deltaMs);
  }
  return [...stageMs.entries()].sort((a, b) => b[1] - a[1]);
}

async function reportRefreshCost(page) {
  console.log(`\nrefresh    provoking a polling refetch (${refreshMode}) — ${REFRESH_TIMED_ROUNDS} timed rounds`);
  const before = await readMetrics(page);

  // Round one warms the swap path itself (first-time program links, first
  // disposal), so it is provoked and discarded rather than reported.
  const warmup = summarizeRefresh((await measureOneRefresh(page, null)).durations);
  console.log(`  warm-up  ${round(warmup.busyMs)}ms busy · longest ${round(warmup.longestMs)}ms (discarded)`);

  const rounds = [];
  for (let index = 0; index < REFRESH_TIMED_ROUNDS; index += 1) {
    const summary = summarizeRefresh((await measureOneRefresh(page, null)).durations);
    rounds.push(summary);
    console.log(`  round ${index + 1}  ${round(summary.busyMs)}ms busy in ${summary.count} long tasks`
      + ` · longest ${round(summary.longestMs)}ms · blocking ${round(summary.blockingMs)}ms`);
  }
  const median = (pick) => [...rounds.map(pick)].sort((a, b) => a - b)[Math.floor(rounds.length / 2)];
  console.log(`  median   ${round(median((r) => r.busyMs))}ms busy · longest ${round(median((r) => r.longestMs))}ms`
    + ` · blocking ${round(median((r) => r.blockingMs))}ms`);

  const cdp = await page.context().newCDPSession(page);
  const profiled = await measureOneRefresh(page, profileRecorder(cdp));
  const profiledSummary = summarizeRefresh(profiled.durations);
  // The gate opens immediately after `Profiler.start`, so the freeze is the
  // front of the profile. Cutting there keeps the steady-state frames that
  // follow it — which are not a refresh cost — out of the attribution.
  const cutoffMs = profiledSummary.busyMs + 100;
  console.log(`  profiled round (overhead included, not counted above):`
    + ` ${round(profiledSummary.busyMs)}ms busy`);
  console.log(`  which JS stage asked — the profile's first ${round(cutoffMs)}ms, charged to the nearest stage:`);
  for (const [bucket, ms] of summarizeProfile(profiled.captured, cutoffMs).slice(0, 10)) {
    console.log(`    ${round(ms).toString().padStart(7)}ms  ${bucket}`);
  }

  const traced = await measureOneRefresh(page, traceRecorder(cdp));
  const trace = summarizeTrace(traced.captured);
  console.log(`  what the engine did — self time inside the longest task (${round(trace.freezeMs)}ms):`);
  for (const [name, ms] of trace.rows.slice(0, 8)) {
    console.log(`    ${round(ms).toString().padStart(7)}ms  ${name}`);
  }
  console.log("  and whose call it is:");
  for (const call of trace.calls ?? []) console.log(`    ${call}`);
  console.log(`  style, layout and paint across the whole ${REFRESH_WINDOW_MS}ms window:`
    + ` ${round(trace.renderingMs)}ms`);

  const after = await readMetrics(page);
  console.log(`  fleet    ${before.shipsVisible} -> ${after.shipsVisible} ships`
    + ` · ${before.calls} -> ${after.calls} draw calls`
    + ` · content roots ${before.contentReplacements} -> ${after.contentReplacements}`);
  const changedContentParts = Object.keys(after.contentParts ?? {}).filter(
    (key) => before.contentParts?.[key] !== after.contentParts?.[key],
  );
  console.log(`  content  ${changedContentParts.length > 0 ? changedContentParts.join(", ") : "renderer-equivalent"}`);
}

/**
 * The FAIL arm, plus the one skip that can only be known after loading: a world
 * with no fleet and no samples is not the world, and a frame time taken from it
 * would flatter the renderer rather than test it.
 */
function evaluateAssertions(metrics, shaderErrors = []) {
  if ((metrics.shipsVisible ?? 0) === 0 || (!args.reduced && (metrics.samples ?? 0) === 0)) {
    console.log("\nSKIP: the world never populated, so no representative frame was measured.");
    process.exitCode = SKIP_EXIT_CODE;
    return;
  }

  const failures = [];
  if (shaderErrors.length > 0) {
    failures.push(`${shaderErrors.length} shader/program error(s) in the page console — a rejected material is skipped silently at draw time, so the frame is missing something the counters cannot see:\n    ${shaderErrors.slice(0, 5).join("\n    ")}`);
  }
  if (metrics.tier !== limits.requiredTier) {
    failures.push(`scheduler tier is ${metrics.tier}, expected ${limits.requiredTier}`);
  }
  if (!args.reduced && (metrics.p90 ?? Infinity) > limits.maxP90Ms) {
    failures.push(`p90 frame time ${round(metrics.p90)}ms exceeds ${limits.maxP90Ms}ms`);
  }
  if ((metrics.calls ?? Infinity) > limits.maxDrawCalls) {
    failures.push(`${metrics.calls} draw calls exceed ${limits.maxDrawCalls}`);
  }
  if ((metrics.geometries ?? Infinity) > limits.maxGeometries) {
    failures.push(`${metrics.geometries} geometries exceed ${limits.maxGeometries}`);
  }
  if ((metrics.textures ?? Infinity) > limits.maxTextures) {
    failures.push(`${metrics.textures} textures exceed ${limits.maxTextures}`);
  }
  if ((metrics.triangles ?? Infinity) > limits.maxTriangles) {
    failures.push(`${metrics.triangles} triangles exceed ${limits.maxTriangles}`);
  }

  if (failures.length === 0) {
    const timing = args.reduced
      ? "deterministic static frame"
      : `p90 ${round(metrics.p90)}ms (max ${limits.maxP90Ms})`;
    console.log(`\nPASS: tier ${metrics.tier}, ${timing},`
      + ` ${metrics.calls} calls, ${metrics.triangles} triangles,`
      + ` ${metrics.geometries} geometries, ${metrics.textures} textures.`);
    return;
  }
  console.error(`\nFAIL: real-GPU perf regressed on this framing.`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error("Raise a threshold only with a measurement that justifies it, not to get a push through.");
  process.exitCode = 1;
}

async function waitForSettledStaticMetrics(page) {
  // Reduced motion owns no continuous RAF. Every async model/logo arrival asks
  // for one deterministic repaint, so wait until both the network and the GPU
  // resource tuple have stopped changing before treating telemetry as settled.
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  let previous = null;
  let stableReads = 0;
  let latest = await readMetrics(page);
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && stableReads < 3) {
    await page.waitForTimeout(500);
    latest = await readMetrics(page);
    const signature = [
      latest.calls,
      latest.triangles,
      latest.geometries,
      latest.textures,
      latest.shipsVisible,
      latest.tier,
    ].join("|");
    stableReads = signature === previous ? stableReads + 1 : 0;
    previous = signature;
  }
  return latest;
}

async function runArtifactFlashCheck(page, canvas) {
  const frames = [];
  const frameCount = 8;
  const intervalMs = 120;
  for (let index = 0; index < frameCount; index += 1) {
    if (index > 0) await page.waitForTimeout(intervalMs);
    const png = await canvas.screenshot({ animations: "allow", type: "png" });
    frames.push(await decodeLuminanceGrid(page, png.toString("base64")));
  }
  const result = analyzeArtifactFlashFrames(frames);
  const evidence = {
    frameCount,
    frameCoverage: result.frameCoverage,
    intervalMs,
    sampleGrid: `${frames[0]?.width ?? 0}x${frames[0]?.height ?? 0}`,
    transitions: result.transitions,
  };
  await writeFile(
    resolve(outputDirectory, "artifact-flash-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  if (result.flash || result.excessiveBrightCoverage) {
    console.error("\nFAIL: artifact probe found fault-like frame coverage.");
    for (const transition of result.transitions.filter((entry) => entry.flash)) {
      console.error(`  - frames ${transition.from}->${transition.to}:`
        + ` mean ${round(transition.meanDelta)},`
        + ` bright ${round(transition.brightCoverage * 100)}%,`
        + ` dark ${round(transition.darkCoverage * 100)}%`);
    }
    for (const frame of result.frameCoverage.filter((entry) => entry.excessiveBrightCoverage)) {
      console.error(`  - frame ${frame.frame}: bright coverage`
        + ` ${round(frame.brightCoverage * 100)}% exceeds the beam/light budget`);
    }
    process.exitCode = 1;
    return;
  }
  const maxBrightCoverage = Math.max(
    ...result.frameCoverage.map((frame) => frame.brightCoverage),
  );
  console.log(`\nPASS: ${frameCount}-frame artifact probe found no full-area flash`
    + ` or excessive bright-beam coverage (max ${round(maxBrightCoverage * 100)}%).`);
}

async function decodeLuminanceGrid(page, base64) {
  return page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const width = 96;
    const height = 60;
    const surface = new OffscreenCanvas(width, height);
    const context = surface.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Artifact probe could not create a 2D sample canvas.");
    context.drawImage(image, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    const luminance = new Array(width * height);
    for (let pixel = 0; pixel < luminance.length; pixel += 1) {
      const offset = pixel * 4;
      const red = rgba[offset] / 255;
      const green = rgba[offset + 1] / 255;
      const blue = rgba[offset + 2] / 255;
      luminance[pixel] = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    }
    return { height, luminance, width };
  }, base64);
}

/**
 * The SKIP arm's pre-flight. Everything here means "this machine cannot produce
 * a real GPU frame", never "the frame was fine" — so the caller must not treat
 * any of it as a pass. The in-run SwiftShader check is the authority; these are
 * the cases worth naming before spending a browser launch on them.
 */
async function findUnmeasurableReason() {
  if (process.env.CI) return "running under CI, whose runners have no GPU";
  if (!existsSync(chromePath)) return `no operator Chrome at ${chromePath}`;
  if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return "no X11 or Wayland display, so Chrome cannot reach the operator's GPU";
  }
  try {
    await fetch(url, { signal: AbortSignal.timeout(3000) });
  } catch {
    return `nothing is serving ${url}`;
  }
  return null;
}

function numberFlag(name, fallback) {
  const raw = args[name];
  if (raw === undefined || raw === true) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} needs a number, got "${raw}"`);
  return value;
}

function readMetrics(page) {
  return page.evaluate(() => {
    const debug = window.__pharosVilleDebug;
    const m = debug?.renderMetrics;
    return {
      calls: m?.gpu?.calls ?? null,
      environmentBakeCalls: m?.environmentBakeCalls ?? null,
      environmentBakeCount: m?.environmentBakeCount ?? null,
      environmentBakeCountChange: m?.environmentBakeCountChange ?? null,
      composer: m?.composerEnabled ?? null,
      contentReplacements: m?.contentReplacementCount ?? null,
      contentParts: m?.contentSignaturePartHashes ?? null,
      dropped: m?.framePacing?.droppedFrameCount ?? null,
      fleetDraws: m?.fleetDrawCallCount ?? null,
      fps: m?.framePacing?.effectiveFps ?? null,
      geometries: m?.gpu?.geometries ?? null,
      logoAssetsExpected: m?.logoAssetsExpected ?? null,
      logoAssetsLoaded: m?.logoAssetsLoaded ?? null,
      p50: m?.framePacing?.p50Ms ?? null,
      p90: m?.framePacing?.p90Ms ?? null,
      samples: m?.framePacing?.sampleCount ?? null,
      shipsVisible: m?.visibleShipCount ?? null,
      offscreenCalls: m?.gpu?.offscreenCalls ?? null,
      sceneCalls: m?.gpu?.sceneCalls ?? null,
      textureOwnerCensus: m?.textureOwnerCensus ?? null,
      textureUploads: m?.textureUploads ?? null,
      tier: m?.schedulerTier ?? null,
      tierReached: m?.sessionTierReached ?? null,
      triangles: m?.gpu?.triangles ?? null,
      textures: m?.gpu?.textures ?? null,
    };
  });
}

function printTextureOwnerCensus(census) {
  if (!census) {
    console.log("textures   owner census unavailable");
    return;
  }
  console.log(`textures   ${census.referencedTextures} scene-referenced ·`
    + ` at least ${census.minimumUnattributedRendererTextures}`
    + " renderer-internal/unattributed");
  for (const entry of census.owners ?? []) {
    console.log(`           ${String(entry.textureCount).padStart(2, " ")}  ${entry.owner}`);
  }
}

async function readWebglRenderer(page) {
  await page.goto("about:blank");
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "NO WEBGL CONTEXT";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "(renderer info unavailable)";
  });
}

/** Echoes the operator's own Chrome flags, so the evidence says what produced it. */
async function describeOperatorFlags() {
  const configPath = resolve(process.env.XDG_CONFIG_HOME ?? resolve(homedir(), ".config"), "chrome-flags.conf");
  try {
    const flags = (await readFile(configPath, "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("--"));
    return flags.length > 0 ? `${flags.join(" ")}   (from ${configPath})` : `(none in ${configPath})`;
  } catch {
    return "(no chrome-flags.conf — Chrome picks its own GPU)";
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const equals = key.indexOf("=");
    if (equals !== -1) {
      parsed[key.slice(0, equals)] = key.slice(equals + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
