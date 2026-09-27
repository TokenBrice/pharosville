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
 * The headline number is the TAIL, not the average. Calm is a P95 property: one
 * 100ms frame a minute is felt where 2ms on the mean is not, so the animated
 * assert arm sweeps the pacing window repeatedly (--tail-seconds) and gates the
 * WORST window's p95. p99, the worst single frame and the long-task counts are
 * reported beside it as observability — a lone spike on a busy machine is real
 * information but a bad reason to block a push, whereas a whole bad second
 * shows up in p95 and does block one.
 *
 * Usage:
 *   node scripts/pharosville/preview.mjs
 *   node scripts/pharosville/preview.mjs --hash "#t=22&n=1" --out night.png
 *   node scripts/pharosville/preview.mjs --headed --seconds 8
 *   node scripts/pharosville/preview.mjs --reduced          # static-frame path
 *   node scripts/pharosville/preview.mjs --first-visit      # hear the three first-visit teachings
 *   node scripts/pharosville/preview.mjs --quick-find       # open the search chrome for review
 *   node scripts/pharosville/preview.mjs --hover-first      # hover a visible ship target
 *   node scripts/pharosville/preview.mjs --hover-sea-sign   # hover a visible sea stele target
 *   node scripts/pharosville/preview.mjs --url http://localhost:4173 --width 2560 --height 1440
 *   node scripts/pharosville/preview.mjs --assert            # perf tripwire, exits non-zero
 *   node scripts/pharosville/preview.mjs --assert --reduced  # settled static resource gate
 *   node scripts/pharosville/preview.mjs --artifact-check    # short-interval full-frame flash probe
 *   node scripts/pharosville/preview.mjs --assert --max-p90=20 --max-draw-calls=700
 *   node scripts/pharosville/preview.mjs --assert --max-p95=20 --max-gpu-ms=12 --tail-seconds 30   # --max-gpu-ms refused on ANGLE Metal
 *   node scripts/pharosville/preview.mjs --texture-census    # attribute live texture owners
 *   node scripts/pharosville/preview.mjs --draw-census      # attribute live draw owners
 *   node scripts/pharosville/preview.mjs --light-cycle --json # native time control phase/resource audit
 *   node scripts/pharosville/preview.mjs --blur-audit       # temporary 16px canvas attention audit
 *   node scripts/pharosville/preview.mjs --fixture dense --overlap --json
 *   node scripts/pharosville/preview.mjs --fixture stress --force-tier recovery --pan-zoom
 *   node scripts/pharosville/preview.mjs --refresh common   # main-thread cost of a data refresh
 *   node scripts/pharosville/preview.mjs --refresh churn    # ... with every placement moved
 *
 * Instruments (plan W0.1–W0.3, W0.5; see docs/pharosville/TESTING.md "Instruments"):
 *   node scripts/pharosville/preview.mjs --uncapped                     # vsync + frame-rate limit off: p50 is throughput cost
 *   node scripts/pharosville/preview.mjs --uncapped --knockout bloom,smaa # sets window.__pharosVilleKnockout (debug only)
 *   node scripts/pharosville/preview.mjs --uncapped --knockout-compare ao,bloom,smaa,rays,reflection,grade,water-lanes
 *                                                       # 3 alternating serial rounds, Δ p50/p90 per pass
 *   node scripts/pharosville/preview.mjs --dpr 2 --uncapped --hash "#t=22"   # serial DPR-2 baseline arm
 *   node scripts/pharosville/preview.mjs --headed --seconds 20 --pan-zoom    # headed 120 Hz arm (ProMotion): reports display Hz
 *   node scripts/pharosville/preview.mjs --still-camera --burst 9 --interval 600 --clip 900,700,500,250 --burst-sheet
 *   node scripts/pharosville/preview.mjs --still-camera --stats --watch-seconds 600   # events/h, quiet gap, underway %
 *   node scripts/pharosville/preview.mjs --fixture calm --clock 2026-09-26 --hash "#t=12.25" --metrics --value-plan --json
 *   node scripts/pharosville/preview.mjs --hash "#t=22" --clock 2026-09-26 --metrics --temporal --night-water
 *
 * Instrument flags:
 *   --uncapped                 launch with --disable-gpu-vsync --disable-frame-rate-limit
 *   --knockout <list>          comma list of ao|bloom|smaa|rays|reflection|grade|keyline|water-lanes
 *   --knockout-compare <list>  baseline vs each pass, alternating, 3 serial rounds (one Chrome per arm)
 *   --still-camera             appends still=1: no camera breath, no attract/postcard moves
 *   --clean                    the main shot is the canvas alone: HUD, world chrome and overlay hidden (hour stills)
 *   --clock <ISO>              pins Date (flowing from that instant; RAF/timers untouched) and adds d=YYYY-MM-DD
 *   --ritual <kind> [--ritual-wait ms]  W5.1: __pharosVilleDebug.forceRitual(kind) just before the shot (and any burst);
 *                              kinds heron-arrives|heron-departs|kindling|moonrise|meteor|seasonal-visitor|crossing
 *   --burst N [--interval ms] [--clip x,y,w,h] [--burst-sheet]   ordered <out>-burst-NN.png (+ contact sheet)
 *   --stats [--watch-seconds S]  __pharosVilleDebug.motionStats + directorLog (sampled over S seconds)
 *   --metrics                  HUD-free picture metrics + <out>-notan.png
 *   --temporal                 mean frame-to-frame |ΔL*| of the bottom third over a 1.5 s burst
 *   --value-plan [noon|dusk|night]  ninths vs the bible table: MAE and Pearson r (column from t= hour)
 *   --night-water              mean L* over the projected inlet water polygon
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { installPreviewFixture, analyzeTargetOverlap } from "./preview-fixture.mjs";
import { analyzeArtifactFlashFrames } from "./artifact-flash-metric.mjs";
import {
  bottomThirdHighFrequency,
  brightShare,
  decodeFrame,
  frameMeanLstar,
  meanAbsoluteError,
  ninths,
  pearson,
  polygonLstarStats,
  readValuePlan,
  regionMeanLstar,
  saturatedOrangeShare,
  temporalBottomThirdDelta,
  topBandHueDelta,
  VALUE_PLAN_COLUMNS,
  valuePlanColumnForHour,
  writeContactSheet,
  writeNotan,
} from "./preview-metrics.mjs";

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
const fixture = args.fixture ?? null;
if (fixture && !["dense", "calm", "stress"].includes(fixture)) throw new Error("--fixture needs dense, calm, or stress");
if (fixture && args.refresh) throw new Error("--fixture and --refresh measure different data paths; run them separately");
const forcedTier = args["force-tier"] ?? null;
if (forcedTier && !["constrained", "recovery"].includes(forcedTier)) throw new Error("--force-tier needs constrained or recovery (dev server only)");

/** Post passes and water layers the app's debug knockout seam recognises (`window.__pharosVilleKnockout`). */
const KNOCKOUT_PASSES = ["ao", "bloom", "smaa", "rays", "reflection", "grade", "keyline", "water-lanes"];
/** Launch switches for throughput readings: without them p50 is the vsync interval, not a cost. */
const UNCAPPED_CHROME_ARGS = ["--disable-gpu-vsync", "--disable-frame-rate-limit"];
/** Alternating serial rounds for --knockout-compare (headroom-4: three, so one hot run cannot decide). */
const KNOCKOUT_COMPARE_ROUNDS = 3;
/** Where the bible's value-plan table lives; parsed on every run so a table correction is what is compared. */
const VALUE_PLAN_DOC = fileURLToPath(new URL("../../docs/pharosville/VISUAL_INVARIANTS.md", import.meta.url));
/** --temporal: 11 frames 150 ms apart is 10 pairs over 1.5 s. */
const TEMPORAL_FRAME_COUNT = 11;
const TEMPORAL_INTERVAL_MS = 150;
/** motionStats refreshes at most twice a second, so a faster poll only re-reads it. */
const STATS_POLL_INTERVAL_MS = 500;
const HUD_HIDDEN_STYLE_ID = "preview-hud-hidden";

const knockout = knockoutListFlag("knockout");
const knockoutCompare = knockoutListFlag("knockout-compare");
if (knockout && knockoutCompare) throw new Error("--knockout-compare runs its own knockout arms; drop --knockout");
if (knockoutCompare && args.assert) throw new Error("--knockout-compare is a measurement, not a gate; drop --assert");
if (knockoutCompare && args.reduced) throw new Error("--knockout-compare compares frame times; --reduced renders one static frame");
const uncapped = Boolean(args.uncapped);
const stillCamera = Boolean(args["still-camera"]);
const clock = parseClockFlag();
if (clock && args.refresh) throw new Error("--refresh owns page.clock for its clock jump; run --clock separately");
const burst = parseBurstFlags();
const statsWatchSeconds = numberFlag("watch-seconds", 0);
if (statsWatchSeconds < 0) throw new Error("--watch-seconds needs a non-negative number of seconds");
const statsMode = Boolean(args.stats) || statsWatchSeconds > 0;
const valuePlanColumn = typeof args["value-plan"] === "string" ? args["value-plan"] : null;
if (valuePlanColumn && !VALUE_PLAN_COLUMNS.includes(valuePlanColumn)) {
  throw new Error(`--value-plan takes no value or one of ${VALUE_PLAN_COLUMNS.join(", ")}, got "${valuePlanColumn}"`);
}
const picture = {
  metrics: Boolean(args.metrics),
  nightWater: Boolean(args["night-water"]),
  temporal: Boolean(args.temporal),
  valuePlan: Boolean(args["value-plan"]),
};
const pictureRequested = Object.values(picture).some(Boolean);
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
  // The calm gate. Same intent and same number as the p90 ceiling above, one
  // decile further out: 20ms tolerates a missed vsync, and refuses to call a
  // second in which one frame in twenty cost more than that "smooth".
  maxP95Ms: numberFlag("max-p95", 20),
  // Optional GPU-only ceiling. Unlike the whole-frame gates above, absence
  // means no GPU assertion was requested.
  maxGpuMs: numberFlag("max-gpu-ms", null),
  requiredTier: typeof args["require-tier"] === "string" ? args["require-tier"] : forcedTier ?? "full",
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

/**
 * The reduced-motion settle result, or null on the animated path. Assert mode
 * reads it, so it lives beside the run rather than inside the wait.
 */
let staticSettle = null;

/** The tail sweep's summary, or null when no sweep ran (reduced motion, or --tail-seconds=0). */
let tailSweep = null;

// A refresh probe must not be measuring the day cycle as well: a 31-minute
// clock jump would step the sky and rebake the PMREM probe inside the window.
// Pinning the hour makes the payload the only thing that moved.
// --clock adds `d=` beside it so the world's calendar (season, almanac, moon)
// is pinned the same way the hour is.
const hash = withCalendarDate(args.hash ?? (refreshMode || fixture ? "#t=12" : ""), clock);
const width = Number(args.width ?? 1600);
const height = Number(args.height ?? 1000);
// Long enough for the frame-pacing window to fill with steady-state frames
// rather than the load spike.
const seconds = Number(args.seconds ?? 6);
/**
 * How long the TAIL sweep watches, in seconds. `seconds` above is a dwell — it
 * decides when reading starts. This decides how much time the reading COVERS,
 * which is the only thing that makes a tail percentile mean anything: the
 * in-page pacing ring holds 120 frames, so a single read describes ~1s at
 * 120Hz and ~2s at 60Hz, and a spike that happens once a minute is invisible to
 * it about 59 times out of 60. Twelve seconds of overlapping windows is not a
 * minute either, but it is a dozen chances instead of one, at ~12s of runtime.
 *
 * Zero disables the sweep. Assert mode on the animated path always sweeps,
 * because that is the arm the calm gate lives on.
 */
const tailSeconds = Number(args["tail-seconds"] ?? (assertMode && !args.reduced ? 12 : 0));
/**
 * Poll cadence for the sweep, deliberately SHORTER than the pacing window's own
 * span (120 frames ≈ 1.0s at 120Hz, ≈2.0s at 60Hz) so consecutive windows
 * overlap and no frame can fall between two reads. The report says outright
 * whether that held, rather than assuming it.
 */
const TAIL_POLL_INTERVAL_MS = 800;
const outputDirectory = resolve(process.cwd(), "outputs");
const outputPath = resolve(outputDirectory, args.out ?? "preview.png");

const chromePath = typeof args.chrome === "string" ? args.chrome : SYSTEM_CHROME;

// A comparison is a series of whole serial previews, one Chrome per arm, so
// each arm starts from a cold GPU state and no arm inherits another's caches.
if (knockoutCompare) {
  await runKnockoutCompare(knockoutCompare);
  process.exit();
}

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
  args: uncapped ? UNCAPPED_CHROME_ARGS : [],
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

  // A fresh profile is a first visit: the now-line would speak the three
  // first-visit teachings for ~21 s after arrival and cover the ordinary
  // caption in every preview. Seed them as read; pass --first-visit to see
  // them deliberately.
  if (!args["first-visit"]) {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("pharosville.orientation.seen", "1");
      } catch {
        // Storage unavailable: the app then never speaks the teachings.
      }
    });
  }

  if (fixture) await installPreviewFixture(page, fixture);
  if (forcedTier) await page.addInitScript((tier) => { window.__pharosVilleTestSchedulerTier = tier; }, forcedTier);
  if (refreshMode) await installRefreshProbe(page);
  if (knockout) await page.addInitScript((passes) => { window.__pharosVilleKnockout = passes; }, knockout);
  // Under a fixture the fixture's fixed Date keeps the data's freshness coherent;
  // the world's calendar then comes from `d=` alone.
  if (clock && !fixture) await page.addInitScript(installFlowingDate, clock.epochMs);

  // Shader tripwire: a material the driver rejects is skipped SILENTLY at draw
  // time — the perf numbers below still pass while a whole subsystem (the sea,
  // once) is missing from the frame. Collect the console so assert mode can
  // fail on what the counters cannot see. (2026-07-30: `uStorm` undeclared in
  // the water fragment made the sea invisible while every metric was green.)
  const shaderErrors = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/Shader Error|VALIDATE_STATUS|program not valid|Fragment shader is not compiled|Vertex shader is not compiled|render failed|An error occurred in|The above error occurred|Uncaught/.test(text)) {
      shaderErrors.push(text.split("\n")[0].slice(0, 300));
    }
  });
  page.on("pageerror", (err) => {
    shaderErrors.push(`pageerror: ${String(err.message ?? err).split("\n")[0].slice(0, 300)}`);
  });

  const { renderer, timerQuerySupported } = await readWebglRenderer(page);
  console.log(`chrome     ${chromePath}`);
  console.log(`flags      ${await describeOperatorFlags()}`
    + `${uncapped ? ` · launch ${UNCAPPED_CHROME_ARGS.join(" ")} (uncapped: frame p50 is throughput, not vsync)` : ""}`);
  console.log(`GPU        ${renderer}`);
  console.log(`GPU timer  EXT_disjoint_timer_query_webgl2 ${timerQuerySupported ? "supported" : "unsupported"} (capability only; no timings measured)`);
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

  // ANGLE's Metal backend reports per-pass timer spans that overlap inside one
  // command buffer: they are not additive and their frame total is not a GPU
  // cost. A budget asserted on them would be a gate on a fiction.
  if (limits.maxGpuMs !== null && /metal/i.test(renderer)) {
    console.error("\nRefusing --max-gpu-ms: this renderer is ANGLE Metal, whose timer readings are overlapping"
      + "\ncommand-buffer spans — not additive and not a frame's GPU cost. Measure cost with"
      + "\n`--uncapped --knockout-compare <passes>` (Δ throughput) instead.");
    await browser.close();
    process.exit(2);
  }

  // `debug=1` publishes window.__pharosVilleDebug, which is where the scheduler
  // tier and the GPU counters live.
  const separator = url.includes("?") ? "&" : "?";
  const target = `${url}${separator}debug=1${stillCamera ? "&still=1" : ""}${hash}`;
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

  let metrics;
  if (args.reduced) {
    staticSettle = await waitForSettledStaticMetrics(page);
    metrics = staticSettle.metrics;
  } else {
    metrics = await readMetrics(page);
  }
  if (!args.reduced) {
    const settleDeadline = Date.now() + 20_000;
    while (Date.now() < settleDeadline && (metrics.samples ?? 0) < FULL_ENOUGH_SAMPLES) {
      await page.waitForTimeout(700);
      const read = await readMetrics(page);
      if ((read.samples ?? 0) > (metrics.samples ?? 0)) metrics = read;
    }
  }
  const settledAtFrame = metrics.drawOwnerCensus?.sampledAtFrame ?? -1;
  if ((metrics.shipsVisible ?? 0) === 0) {
    console.error("warning: no fleet on screen — the world had not populated, so the frame below is not the world.");
  }

  // The tail sweep. It reads a ring that is entirely steady-state by now, and
  // it reads it repeatedly: the reported metrics are the MEDIAN-p90 window (so
  // one background spike on a busy machine cannot block a push, while a genuine
  // regression — which shows in every window — still does), and the tail
  // summary is the WORST window of the sweep (so a bad second cannot hide
  // behind eleven good ones).
  //
  // Windows overlap, unlike the three widely-spaced reads this replaced. That
  // is the point: a gap between reads is a stretch of frames nothing measured.
  // A spike survives in the ring for ~120 frames, i.e. about two polls, so it
  // still cannot swing a median taken over a dozen of them.
  if (!args.reduced && tailSeconds > 0) {
    tailSweep = await sweepFrameTail(page, tailSeconds * 1000);
    if (tailSweep.reads.length > 0) metrics = medianByP90(tailSweep.reads);
  }
  if (args["draw-census"] && !args.reduced) {
    const fresh = await waitForDrawOwnerCensusAfterFrame(page, settledAtFrame);
    metrics = { ...metrics, drawOwnerCensus: fresh.drawOwnerCensus };
  }

  if (forcedTier && metrics.tier !== forcedTier) throw new Error(`Forced tier ${forcedTier} not active; use the dev server, not a production build (got ${metrics.tier})`);
  await applyRequestedUiState(page);
  await mkdir(outputDirectory, { recursive: true });
  if (typeof args.ritual === "string") await forceRitualBeforeCapture(page, args.ritual, numberFlag("ritual-wait", 0));
  if (args.clean) {
    // K17 hour stills: the world alone, no HUD, chrome, chips or nameplates.
    await page.addStyleTag({ content: ".pharosville-overlay { visibility: hidden !important; }" });
    await withHudHidden(page, () => canvas.screenshot({ animations: "allow", path: outputPath }));
  } else {
    await page.screenshot({ path: outputPath });
  }
  if (args["blur-audit"]) {
    const originalStyle = await canvas.evaluate((element) => {
      const style = element.getAttribute("style");
      element.style.filter = "blur(16px)";
      return style;
    });
    try {
      const blurredPath = outputPath.replace(/\.png$/i, "") + "-blur.png";
      await page.screenshot({ path: blurredPath });
      console.log(`blur audit ${blurredPath} (temporary canvas CSS filter; clean capture unchanged)`);
    } finally {
      await canvas.evaluate((element, style) => {
        if (style === null) element.removeAttribute("style");
        else element.setAttribute("style", style);
      }, originalStyle);
    }
  }
  if (args.overlap) {
    const projection = await page.evaluate(() => {
      const debug = window.__pharosVilleDebug;
      return { targets: debug?.targets ?? [], selected: debug?.selectedDetailId ?? null, size: debug?.canvasSize };
    });
    metrics.targetOverlap = analyzeTargetOverlap(projection.targets, projection.selected, projection.size?.x ?? width, projection.size?.y ?? height);
    console.log(`overlap    ${metrics.targetOverlap.overlappingPairs} overlapping projected hit-rectangle pairs among ${metrics.targetOverlap.visibleShipTargets} targets (not sail occlusion)`);
    await page.evaluate((diagnostic) => {
      const canvas = document.querySelector('[data-testid="pharosville-canvas"]').getBoundingClientRect();
      const overlay = document.createElement("div");
      overlay.id = "preview-target-overlay";
      overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:99999";
      const targets = [...diagnostic.largestTargets, ...(diagnostic.selected ? [diagnostic.selected] : [])];
      for (const { detailId, rect } of targets) {
        const box = document.createElement("div");
        const selected = detailId === diagnostic.selected?.detailId;
        box.style.cssText = `position:absolute;left:${canvas.left + rect.x}px;top:${canvas.top + rect.y}px;width:${rect.width}px;height:${rect.height}px;border:1px dashed ${selected ? "#ffef00" : "#ff65d8"};color:white;font:10px monospace;background:rgba(0,0,0,.12)`;
        box.textContent = detailId;
        overlay.append(box);
      }
      document.body.append(overlay);
    }, metrics.targetOverlap);
    await page.screenshot({ path: outputPath.replace(/\.png$/i, "") + "-targets.png" });
    await page.evaluate(() => document.getElementById("preview-target-overlay")?.remove());
  }

  console.log(`URL        ${target}`);
  console.log(`data       ${fixture ?? "live"}${fixture ? " checked-in fixture; Date fixed at fixture epoch + 60 seconds" : ""} · forced tier ${forcedTier ?? "none"}`);
  if (clock) {
    console.log(`clock      d=${clock.date} in the hash · ${fixture
      ? "Date stays on the fixture epoch so data freshness is coherent; the calendar comes from d="
      : `Date flows from ${new Date(clock.epochMs).toString()} (Date only; RAF, performance.now and timers untouched)`}`);
  }
  if (knockout || stillCamera) {
    console.log(`instrument${knockout ? ` knockout ${knockout.join(", ")} (window.__pharosVilleKnockout; honoured only with visual debug)` : ""}`
      + `${knockout && stillCamera ? " ·" : ""}${stillCamera ? " still camera (still=1: no breath, no attract/postcard moves)" : ""}`);
  }
  if ((knockout || stillCamera || clock) && !await page.evaluate(() => Boolean(window.__pharosVilleDebug))) {
    console.error("error      window.__pharosVilleDebug is absent, so visual debug is off and the knockout, still=1 and d="
      + " seams are ignored — use the dev server or a localhost build");
    process.exitCode = 1;
  }
  console.log(`viewport   ${width}x${height} @${args.dpr ?? 1}x, ${args.headed ? "headed" : "headless"}`
    + `, motion ${args.reduced ? "reduced" : "normal"}`);
  console.log(`frame      ${round(metrics.fps)} fps · p50 ${round(metrics.p50)}ms · p90 ${round(metrics.p90)}ms`
    + ` · dropped ${metrics.dropped} of ${metrics.samples}`);
  if (args.headed) {
    const displayHz = await measureDisplayRate(page);
    metrics.displayRateHz = displayHz;
    console.log(`display    ${round(displayHz)} Hz raw requestAnimationFrame (headed: the rate this panel delivers)`
      + ` · app ${round(metrics.fps)} fps${uncapped ? " · uncapped" : ""}`);
  }
  if (!args.reduced) printFrameTail(metrics, renderer);
  console.log(`tier       ${metrics.tier} (session worst: ${metrics.tierReached})`
    + ` · composer ${metrics.composer ? "on" : "off"}`);
  console.log(`motion     sample ${round(metrics.sampleDurationMs)}ms · hit targets ${round(metrics.hitTargetDurationMs)}ms`
    + ` · draw submit ${round(metrics.drawDurationMs)}ms`);
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
  if (args.reduced) {
    console.log(`settle     ${staticSettle?.settled
      ? "settled static frame — uploads drained and every counter held still"
      : "NOT SETTLED — counters were still moving when the wait timed out;"
        + " the numbers above are an in-flight frame, not the budgeted one"}`);
  }
  if (
    args["texture-census"]
    || (metrics.textures ?? 0) > limits.maxTextures
  ) {
    printTextureOwnerCensus(metrics.textureOwnerCensus);
  }
  if (args["draw-census"]) printDrawOwnerCensus(metrics.drawOwnerCensus);
  console.log(`fleet      ${metrics.shipsVisible} ships visible`);
  console.log(`shot       ${outputPath}`);

  if (assertMode) evaluateAssertions(metrics, shaderErrors);
  if (args["artifact-check"]) await runArtifactFlashCheck(page, canvas);

  const instruments = {};
  if (burst) instruments.burst = await runBurst(page, canvas, burst);
  if (pictureRequested) instruments.picture = await runPictureMetrics(page, canvas, metrics);
  if (statsMode) instruments.stats = await runStats(page, statsWatchSeconds);

  // Last, deliberately: the probe mutates the payload, so everything above —
  // including the screenshot — describes the world as the API actually serves it.
  if (refreshMode) await reportRefreshCost(page);
  if (args["pan-zoom"]) {
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Canvas unavailable for --pan-zoom");
    await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.6);
    await page.mouse.down();
    metrics.panZoom = [];
    for (let step = 1; step <= 12; step += 1) {
      await page.mouse.move(bounds.x + bounds.width * (0.5 + step / 120), bounds.y + bounds.height * 0.6);
      await page.waitForTimeout(120);
      if (step % 4 === 0) {
        metrics.panZoom.push({ stage: `pan-${step / 4}`, ...await readMetrics(page) });
        await page.screenshot({ path: outputPath.replace(/\.png$/i, "") + `-pan-${step / 4}.png` });
      }
    }
    await page.mouse.up();
    for (let step = 1; step <= 3; step += 1) {
      await page.mouse.wheel(0, -80);
      await page.waitForTimeout(500);
      metrics.panZoom.push({ stage: `zoom-${step}`, ...await readMetrics(page) });
      await page.screenshot({ path: outputPath.replace(/\.png$/i, "") + `-pan-zoom-${step}.png` });
    }
    console.log("pan-zoom   six pan/zoom transition screenshots recorded; interaction windows are not steady-state frame gates");
  }

  if (args["light-cycle"]) {
    metrics.lightCycle = [];
    for (const time of ["06:00", "12:00", "18:00", "22:00"]) {
      const errorsBeforePhase = shaderErrors.length;
      const disclosure = page.locator(".pharosville-light-control");
      if (!await disclosure.evaluate((element) => element.open)) await disclosure.locator("summary").click();
      await page.getByLabel("Time of day", { exact: true }).fill(time);
      await disclosure.locator("summary").click();
      let phaseMetrics;
      let settled = true;
      if (args.reduced) {
        const result = await waitForSettledStaticMetrics(page);
        phaseMetrics = result.metrics;
        settled = result.settled;
      } else {
        await page.waitForTimeout(2_000);
        await page.waitForFunction(() => (window.__pharosVilleDebug?.renderMetrics?.textureUploads?.pending ?? 0) === 0,
          undefined, { timeout: 10_000 }).catch(() => { settled = false; });
        phaseMetrics = await readMetrics(page);
      }
      const path = outputPath.replace(/\.png$/i, "") + `-light-${time.replace(":", "")}.png`;
      await page.screenshot({ path });
      const errors = shaderErrors.slice(errorsBeforePhase);
      if (!settled) errors.push("phase resources did not settle");
      if (Math.abs((phaseMetrics.wallClockHour ?? -1) - Number(time.slice(0, 2))) > 0.01) errors.push("native time control did not reach requested hour");
      for (const [field, limit] of [["calls", limits.maxDrawCalls], ["geometries", limits.maxGeometries], ["textures", limits.maxTextures], ["triangles", limits.maxTriangles]]) {
        if ((phaseMetrics[field] ?? Infinity) > limit) errors.push(`${field} ${phaseMetrics[field]} exceeds ${limit}`);
      }
      metrics.lightCycle.push({ time, path, settled, errors, metrics: phaseMetrics });
      console.log(`light      ${time} ${errors.length ? "FAILED" : "resource/shader checks passed"} · ${phaseMetrics.calls} calls · ${phaseMetrics.textures} textures · ${path}`);
      if (errors.length) {
        console.error(errors.join("\n"));
        process.exitCode = 1;
      }
    }
    console.log("light      transition snapshots check resources/shaders; steady-state timing gate above is unchanged");
  }

  if (args.json) {
    await writeFile(
      resolve(outputDirectory, typeof args.json === "string" ? args.json : "preview.json"),
      `${JSON.stringify({
        metrics,
        tailSweep,
        renderer,
        timerQuerySupported,
        target,
        fixture,
        forcedTier,
        instrumentConfig: { clock, knockout, stillCamera, uncapped },
        instruments,
      }, null, 2)}\n`,
    );
  }
} finally {
  await browser.close();
}

function round(value) {
  return typeof value === "number" ? Math.round(value * 10) / 10 : value;
}

/**
 * Watch the in-page pacing window across a span of time rather than at a point
 * in it, and keep every read.
 *
 * Why the sweep exists at all: calm is a P95 property, and P95 of ONE 120-frame
 * ring is P95 of one second. The ring cannot simply be made longer — its p90 is
 * what the render scheduler and the adaptive-DPR governor key off, so a longer
 * ring would slow every quality decision the renderer makes in order to buy a
 * statistic (see the note in src/hooks/world-render-loop-metrics.ts). Sampling
 * the short window often is the same coverage without that cost.
 */
async function sweepFrameTail(page, spanMs) {
  const startedAt = Date.now();
  // Read immediately, so even a very short span yields one window.
  const reads = [await readMetrics(page)];
  while (Date.now() - startedAt < spanMs) {
    await page.waitForTimeout(TAIL_POLL_INTERVAL_MS);
    reads.push(await readMetrics(page));
  }
  return { ...summarizeFrameTail(reads, Date.now() - startedAt), reads };
}

/**
 * The worst window of the sweep, per metric — never an average of windows,
 * which would let a bad second be diluted by good ones, and never a percentile
 * OF percentiles, which is not a quantity.
 *
 * `measured` is the honest-degradation flag: a page whose telemetry predates
 * W4.4 reports no p95 at all, and a gate that scored that as a pass would be
 * collapsing SKIP into PASS on its own headline metric.
 */
function summarizeFrameTail(reads, spanMs) {
  const usable = reads.filter((read) => (read.samples ?? 0) > 0);
  const worst = (pick) => usable.reduce((highest, read) => {
    const value = pick(read);
    return typeof value === "number" && value > highest ? value : highest;
  }, 0);
  // How much time one window covers, so the report can say whether the polls
  // left a gap — samples × the median interval is that span by definition.
  const windowSpansMs = usable.map((read) => (read.samples ?? 0) * (read.p50 ?? 0));
  return {
    continuous: windowSpansMs.length > 0
      && Math.min(...windowSpansMs) >= TAIL_POLL_INTERVAL_MS,
    droppedWorstWindow: worst((read) => read.dropped),
    longtaskCount: worst((read) => read.longtaskCount),
    longtaskMaxMs: worst((read) => read.longtaskMaxMs),
    maxFrameMs: worst((read) => read.maxFrameMs),
    measured: usable.length > 0 && usable.every((read) => typeof read.p95 === "number"),
    minWindowSpanMs: windowSpansMs.length > 0 ? Math.min(...windowSpansMs) : 0,
    p95: worst((read) => read.p95),
    p99: worst((read) => read.p99),
    spanMs,
    windows: usable.length,
  };
}

/**
 * The tail lines: where a spike shows up, and how much time was watched for one.
 *
 * Printed even without a sweep, because a single window's tail is still worth
 * seeing — it is just labelled as the one second it is, so nobody quotes it as
 * a session-wide P95.
 */
function printFrameTail(metrics, renderer) {
  if (typeof metrics.p95 !== "number") {
    console.log("tail       p95/p99 unavailable — this page's telemetry predates the P95 tail (W4.4)");
  } else {
    console.log(`tail       p95 ${round(metrics.p95)}ms · p99 ${round(metrics.p99)}ms`
      + ` · max ${round(metrics.maxFrameMs)}ms  (this ${metrics.samples}-frame window)`);
  }
  const gpu = metrics.gpuTimings;
  if (!gpu?.supported) {
    console.log("gpu        not measured (EXT_disjoint_timer_query_webgl2 unavailable or bundle predates W0.1)");
  } else if (gpu.disjoint) {
    console.log("gpu        disjoint — sample discarded");
  } else {
    const formatGpuMs = (value) => typeof value === "number" ? `${value.toFixed(1)}ms` : "n/a";
    const passNames = ["scene", "n8ao", "bloom", "grade", "smaa", "reflection"];
    const passes = passNames
      .map((name) => gpu.passes?.find((pass) => pass.name === name))
      .filter(Boolean)
      .map((pass) => `${pass.name} ${formatGpuMs(pass.p95Ms)}`);
    // These are timer-query READINGS, not costs: the per-pass spans overlap, so
    // they do not sum to the frame and a pass's reading is not what removing it
    // saves. On ANGLE Metal they are command-buffer spans. Cost comes from
    // --uncapped --knockout-compare.
    const backend = /metal/i.test(renderer ?? "") ? "ANGLE Metal command-buffer spans" : "timer-query spans";
    console.log(`gpu        non-additive per-pass timer readings (${backend}; do not sum, not a cost):`
      + ` frame p50 ${formatGpuMs(gpu.frameP50Ms)} · p95 ${formatGpuMs(gpu.frameP95Ms)}`);
    if (passes.length > 0) console.log(`           per-pass p95 readings: ${passes.join(" · ")}`);
  }
  console.log(`longtask   ${metrics.longtaskCount ?? 0} in the rolling window`
    + ` · longest ${round(metrics.longtaskMaxMs ?? 0)}ms`
    + " — a GC pause or a rebuild lands here before it reaches the frame");
  if (!tailSweep) return;
  if (!tailSweep.measured) {
    console.log(`sweep      ${tailSweep.windows} windows over ${round(tailSweep.spanMs / 1000)}s,`
      + " but at least one reported no p95 — the tail was NOT measured across the sweep");
    return;
  }
  console.log(`sweep      worst p95 ${round(tailSweep.p95)}ms · worst p99 ${round(tailSweep.p99)}ms`
    + ` · worst frame ${round(tailSweep.maxFrameMs)}ms`
    + ` · worst window dropped ${tailSweep.droppedWorstWindow}`);
  console.log(`           ${tailSweep.windows} windows over ${round(tailSweep.spanMs / 1000)}s,`
    + ` ${tailSweep.continuous
      ? `continuous (each spans ${round(tailSweep.minWindowSpanMs)}ms ≥ the ${TAIL_POLL_INTERVAL_MS}ms poll)`
      : `WITH GAPS (a window spans only ${round(tailSweep.minWindowSpanMs)}ms`
        + ` < the ${TAIL_POLL_INTERVAL_MS}ms poll — frames between reads went unmeasured)`}`
    + ` · longtasks ${tailSweep.longtaskCount} worst window, longest ${round(tailSweep.longtaskMaxMs)}ms`);
}

/** The representative window: median p90, so neither the best nor the worst read is the report. */
function medianByP90(reads) {
  const ordered = [...reads].sort((a, b) => (a.p90 ?? Infinity) - (b.p90 ?? Infinity));
  return ordered[Math.floor((ordered.length - 1) / 2)];
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
  if (args["hover-sea-sign"]) {
    const point = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="pharosville-canvas"]');
      const bounds = canvas?.getBoundingClientRect();
      const targets = window.__pharosVilleDebug?.targets ?? [];
      if (!bounds) return null;
      const target = targets.find(({ kind, rect }) => {
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        return kind === "sea-sign" && x >= 0 && y >= 0 && x <= bounds.width && y <= bounds.height;
      });
      if (!target) return null;
      return {
        x: bounds.left + target.rect.x + target.rect.width / 2,
        y: bounds.top + target.rect.y + target.rect.height / 2,
      };
    });
    if (!point) throw new Error("--hover-sea-sign could not find a visible stele target.");
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
  if (shaderErrors.length > 0) console.error(`page errors before gate: \n  ${shaderErrors.slice(0, 8).join("\n  ")}`);
  if ((metrics.shipsVisible ?? 0) === 0 || (!args.reduced && (metrics.samples ?? 0) === 0)) {
    console.log("\nSKIP: the world never populated, so no representative frame was measured.");
    process.exitCode = SKIP_EXIT_CODE;
    return;
  }

  // The static path's own "did not measure" case. An unsettled frame is missing
  // resources that are still arriving, so passing it would be the exact error
  // V-07 named: a green reading taken before the frame was whole.
  if (args.reduced && staticSettle && !staticSettle.settled) {
    console.log("\nSKIP: the static frame never settled — uploads or logo decodes were still landing,"
      + " so the resource counts above are in flight and nothing is being claimed about the budget.");
    process.exitCode = SKIP_EXIT_CODE;
    return;
  }

  // The calm metric's own "did not measure" case. A bundle older than W4.4
  // publishes no p95 at all, and a sweep whose windows disagree about that has
  // not measured the tail either. Scoring that green would be exactly the
  // collapse this gate refuses: PASS means "measured, and it held".
  const tailMeasured = tailSweep
    ? tailSweep.measured
    : typeof metrics.p95 === "number";
  if (!args.reduced && !tailMeasured) {
    console.log("\nSKIP: this page publishes no P95 frame time, so the calm metric was not measured."
      + " Nothing is being claimed about the tail.");
    process.exitCode = SKIP_EXIT_CODE;
    return;
  }
  if (limits.maxGpuMs !== null) {
    const gpu = metrics.gpuTimings;
    const gpuMeasured = gpu?.supported === true
      && !gpu.disjoint
      && typeof gpu.frameP95Ms === "number";
    if (!gpuMeasured) {
      console.log("\nSKIP: GPU was not measured, so nothing is being claimed about the GPU timing budget.");
      process.exitCode = SKIP_EXIT_CODE;
      return;
    }
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
  // The tail. A P95 breach is a FAIL, not a warning: one frame in twenty over
  // the ceiling is a second the eye reads as a stutter, and the plan's thesis
  // is that one such second a minute costs more calm than 2ms of average cost.
  // The worst window of the sweep is the figure, because the question is
  // whether ANY second was like that, not whether the typical one was.
  if (!args.reduced) {
    const p95 = tailSweep ? tailSweep.p95 : metrics.p95;
    const scope = tailSweep
      ? `worst of ${tailSweep.windows} windows over ${round(tailSweep.spanMs / 1000)}s`
      : "single window";
    if ((p95 ?? Infinity) > limits.maxP95Ms) {
      failures.push(`p95 frame time ${round(p95)}ms exceeds ${limits.maxP95Ms}ms (${scope})`);
    }
    if (tailSweep && !tailSweep.continuous) {
      // Not a failure — the numbers above are real — but the sweep did not see
      // every frame, so it must not be quoted as if it had.
      console.error(`note: the sweep's windows left gaps (window span ${round(tailSweep.minWindowSpanMs)}ms`
        + ` < ${TAIL_POLL_INTERVAL_MS}ms poll); frames between reads were not measured.`);
    }
  }
  if (limits.maxGpuMs !== null && metrics.gpuTimings.frameP95Ms > limits.maxGpuMs) {
    failures.push(`gpu p95 ${round(metrics.gpuTimings.frameP95Ms)} ms exceeds ${limits.maxGpuMs} ms`);
  }
  if ((metrics.calls ?? Infinity) > limits.maxDrawCalls) {
    failures.push(`${metrics.calls} draw calls exceed ${limits.maxDrawCalls}`);
  }
  if (metrics.drawOwnerCensus
    && metrics.drawOwnerCensus.attributedCalls !== metrics.drawOwnerCensus.rendererCalls) {
    failures.push(`draw owner census mismatch: ${metrics.drawOwnerCensus.attributedCalls} attributed calls vs ${metrics.drawOwnerCensus.rendererCalls} renderer.info calls`);
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
      ? "settled deterministic static frame"
      : `p90 ${round(metrics.p90)}ms (max ${limits.maxP90Ms}),`
        + ` p95 ${round(tailSweep ? tailSweep.p95 : metrics.p95)}ms (max ${limits.maxP95Ms}`
        + `${tailSweep ? `, worst of ${tailSweep.windows} windows` : ", single window"}),`
        + ` worst frame ${round(tailSweep ? tailSweep.maxFrameMs : metrics.maxFrameMs)}ms`;
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

/**
 * The static path's equivalent of a full frame-pacing window.
 *
 * Reduced motion owns no continuous RAF: the world paints one deterministic
 * frame, then paints again only when something asynchronous arrives. So an
 * early read of the counters is not wrong, it is EARLY — and the 2026-07-27
 * cleanliness audit (V-07) is on record that the SETTLED static frame is the
 * one the resource budget is about.
 *
 * Settled therefore means three things at once, not merely "stopped moving":
 *
 * 1. The network is idle, so nothing further is on its way.
 * 2. The texture upload queue has DRAINED. `pending` is the queue length, so it
 *    reaches zero whether a task succeeded or failed — one broken texture
 *    cannot wedge this wait open.
 * 3. The whole reported tuple has held still across several consecutive reads —
 *    the GPU counters AND the upload/logo PROGRESS counters. Including the
 *    progress counters is what makes the stillness mean something: ~184 logo
 *    decodes land in bursts, and the gap between two bursts is indistinguishable
 *    from a settled frame if only the GPU counters are watched.
 *
 * A logo whose fetch rejects never reaches the loaded count, so this
 * deliberately does not wait for `loaded === expected` — that moment would
 * never come. It waits for the count to stop CHANGING, which happens either way.
 *
 * It reports whether it actually settled, because an unsettled read is not a
 * measurement of the static frame and assert mode must not score it as one.
 */
async function waitForSettledStaticMetrics(page) {
  // 2s of stillness at the end of the dwell: long enough to span the gap
  // between two logo-decode bursts, short enough not to dominate the run.
  const REQUIRED_STABLE_READS = 4;
  const READ_INTERVAL_MS = 500;
  const SETTLE_TIMEOUT_MS = 45_000;

  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  let previous = null;
  let stableReads = 0;
  let latest = await readMetrics(page);
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  while (Date.now() < deadline && stableReads < REQUIRED_STABLE_READS) {
    await page.waitForTimeout(READ_INTERVAL_MS);
    latest = await readMetrics(page);
    const signature = [
      latest.calls,
      latest.triangles,
      latest.geometries,
      latest.textures,
      latest.shipsVisible,
      latest.tier,
      latest.textureUploads?.pending ?? 0,
      latest.textureUploads?.uploaded ?? 0,
      latest.logoAssetsLoaded ?? 0,
      latest.logoAssetsExpected ?? 0,
    ].join("|");
    // A page with no debug object at all reads as a tuple of nulls, which is
    // perfectly "stable" and means nothing. Telemetry has to exist first.
    const reporting = latest.triangles !== null && latest.tier !== null;
    const uploadsDrained = (latest.textureUploads?.pending ?? 0) === 0;
    stableReads = reporting && uploadsDrained && signature === previous ? stableReads + 1 : 0;
    previous = signature;
  }
  return { metrics: latest, settled: stableReads >= REQUIRED_STABLE_READS };
}

/* ---------------------------------------------------------------------------
 * INSTRUMENTS (plan W0.1–W0.3, W0.5)
 *
 * Motion, picture and cost evidence taken on this script's own real-GPU frame
 * path, after the renderer check and the populate/settle waits — never from a
 * second launcher with its own idea of "ready". Every reading that depends on
 * app-side debug fields says so plainly when the page does not publish them.
 * ------------------------------------------------------------------------- */

/**
 * The one frame-grab loop every motion instrument shares (artifact probe,
 * --burst, --temporal): real screenshots on the page's own frame path, paced
 * start-to-start so `intervalMs` is the spacing between frames rather than the
 * gap after a capture of unknown length. `clip` (viewport CSS px) captures that
 * page region instead of the canvas element.
 */
async function captureFrames(page, canvas, { count, intervalMs, clip = null }) {
  const frames = [];
  const startedAt = Date.now();
  for (let index = 0; index < count; index += 1) {
    const wait = startedAt + index * intervalMs - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    const atMs = Date.now() - startedAt;
    const png = clip
      ? await page.screenshot({ animations: "allow", clip, type: "png" })
      : await canvas.screenshot({ animations: "allow", type: "png" });
    frames.push({ atMs, png });
  }
  return frames;
}

async function runBurst(page, canvas, { clip, count, intervalMs, sheet }) {
  const frames = await captureFrames(page, canvas, { clip, count, intervalMs });
  const base = outputPath.replace(/\.png$/i, "");
  const digits = Math.max(2, String(count - 1).length);
  const paths = [];
  for (const [index, { png }] of frames.entries()) {
    const path = `${base}-burst-${String(index).padStart(digits, "0")}.png`;
    await writeFile(path, png);
    paths.push(path);
  }
  const sheetPath = sheet
    ? (await writeContactSheet(frames.map(({ png }) => png), `${base}-burst-sheet.png`)).path
    : null;
  const spanMs = frames.at(-1).atMs;
  const meanSpacingMs = frames.length > 1 ? spanMs / (frames.length - 1) : 0;
  console.log(`burst      ${count} frames @ ${intervalMs}ms (achieved ${round(meanSpacingMs)}ms mean spacing over ${round(spanMs / 1000)}s)`
    + ` · ${clip ? `clip ${clip.x},${clip.y},${clip.width},${clip.height}` : "canvas"}`
    + ` · ${paths[0]}${paths.length > 1 ? ` … ${paths.at(-1)}` : ""}`);
  if (sheetPath) console.log(`           sheet ${sheetPath}`);
  return { clip, count, framesAtMs: frames.map(({ atMs }) => atMs), intervalMs, meanSpacingMs, paths, sheet: sheetPath };
}

/** Run `capture` with the debug HUD and the world chrome hidden, so the picture is the world alone. */
async function withHudHidden(page, capture) {
  await page.evaluate((id) => {
    const style = document.createElement("style");
    style.id = id;
    style.textContent = ".pharosville-debug-chrome, .pharosville-world-chrome"
      + " { visibility: hidden !important; opacity: 0 !important; transition: none !important; }";
    document.head.append(style);
    return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  }, HUD_HIDDEN_STYLE_ID);
  try {
    return await capture();
  } finally {
    await page.evaluate((id) => document.getElementById(id)?.remove(), HUD_HIDDEN_STYLE_ID);
  }
}

/**
 * Project the tower and inlet anchors through the app's own camera. Returns
 * `{ error }` naming exactly which debug field is missing when the page cannot.
 */
async function readProjectedAnchors(page) {
  return page.evaluate(() => {
    const debug = window.__pharosVilleDebug;
    if (!debug) return { error: "window.__pharosVilleDebug is absent — load a dev or localhost build with ?debug=1" };
    if (typeof debug.project !== "function") return { error: "__pharosVilleDebug.project is absent — this build predates the W0.3 projection seam" };
    const anchors = debug.anchors;
    const required = ["towerFoot", "towerCrown", "towerFaceLeft", "towerFaceRight"];
    if (!anchors || required.some((name) => !anchors[name]) || !Array.isArray(anchors.inletPolygon)) {
      return { error: "__pharosVilleDebug.anchors (towerFoot, towerCrown, towerFaceLeft, towerFaceRight, inletPolygon) is absent — this build predates W0.3" };
    }
    const projected = debug.project([...required.map((name) => anchors[name]), ...anchors.inletPolygon]);
    return {
      inlet: projected.slice(required.length),
      tower: Object.fromEntries(required.map((name, index) => [name, projected[index]])),
    };
  });
}

/**
 * Tower sample rectangles in image pixels. The two face centres are half the
 * tower's screen width apart on a square shaft seen at 45°, so each face sample
 * is half that separation wide (inside the face); the air samples sit two and a
 * half half-widths either side of the axis, at the same height.
 */
function towerSampleRects(tower, scale) {
  const { towerCrown: crown, towerFaceLeft: left, towerFaceRight: right, towerFoot: foot } = tower;
  const towerHeight = Math.abs(foot.y - crown.y);
  const separation = Math.abs(right.x - left.x);
  const halfWidth = Math.max(separation, towerHeight * 0.08);
  const sampleWidth = Math.max(3, separation * 0.5);
  const sampleHeight = Math.max(3, towerHeight * 0.1);
  const rect = (x, y) => ({
    height: sampleHeight * scale,
    width: sampleWidth * scale,
    x: (x - sampleWidth / 2) * scale,
    y: (y - sampleHeight / 2) * scale,
  });
  const axisX = (left.x + right.x) / 2;
  const axisY = (left.y + right.y) / 2;
  return {
    airLeft: rect(axisX - 2.5 * halfWidth, axisY),
    airRight: rect(axisX + 2.5 * halfWidth, axisY),
    faceLeft: rect(left.x, left.y),
    faceRight: rect(right.x, right.y),
  };
}

function hourFromHash(value) {
  const match = /[#&]t=([0-9]+(?:\.[0-9]+)?)/.exec(value);
  return match ? Number(match[1]) : null;
}

/**
 * Picture metrics on a HUD-free canvas capture (W0.3): ninths, bright share,
 * saturated-orange share, sky hue split, bottom-third high-frequency energy,
 * tower face ratio and tower-vs-air, notan; plus --value-plan, --temporal and
 * --night-water. Blur radii are CSS pixels scaled to the capture's DPR.
 */
async function runPictureMetrics(page, canvas, metrics) {
  const result = { errors: [] };
  const fail = (message) => {
    result.errors.push(message);
    console.error(`error      ${message}`);
    process.exitCode = 1;
  };
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas unavailable for picture metrics");
  const png = await withHudHidden(page, () => canvas.screenshot({ animations: "allow", type: "png" }));
  const frame = await decodeFrame(png);
  const scale = frame.width / box.width;
  const base = outputPath.replace(/\.png$/i, "");
  result.capture = { cssHeight: box.height, cssWidth: box.width, height: frame.height, scale, width: frame.width };
  result.frameMeanLstar = frameMeanLstar(frame);
  result.ninths = ninths(frame);
  const cell = (value) => (typeof value === "number" ? value.toFixed(1) : "—").padStart(6);
  const percent = (value) => `${(value * 100).toFixed(1)} %`;
  console.log(`picture    HUD-free canvas ${frame.width}x${frame.height} (${round(scale)} image px per CSS px)`
    + ` · frame mean L* ${result.frameMeanLstar.toFixed(1)}`);
  ["top", "mid", "bot"].forEach((row, index) => {
    console.log(`${index === 0 ? "ninths     " : "           "}${row} ${result.ninths.slice(index * 3, index * 3 + 3).map(cell).join("")}   (mean L*)`);
  });

  const needsAnchors = picture.metrics || picture.nightWater;
  const anchors = needsAnchors ? await readProjectedAnchors(page) : null;

  if (picture.metrics) {
    result.brightShare = brightShare(frame, 85);
    result.saturatedOrangeShare = saturatedOrangeShare(frame);
    result.topBandHue = topBandHueDelta(frame);
    result.bottomThirdHighFrequency = bottomThirdHighFrequency(frame, 6 * scale);
    const hue = (reading) => (reading.hue === null ? "grey" : `${reading.hue.toFixed(0)}°`);
    console.log(`value      pixels L*>85 ${percent(result.brightShare)}`
      + ` · bottom-left ninth ${result.ninths[6].toFixed(1)}`);
    console.log(`colour     saturated orange (hue 15–50°, s·v>0.35) ${percent(result.saturatedOrangeShare)}`
      + ` · top-band hue left ${hue(result.topBandHue.left)} / right ${hue(result.topBandHue.right)}`
      + ` Δ ${result.topBandHue.delta === null ? "n/a" : `${result.topBandHue.delta.toFixed(0)}°`}`);
    console.log(`texture    bottom-third high-frequency energy |L* − gauss σ6| ${result.bottomThirdHighFrequency.toFixed(2)}`);
    if (anchors.error) {
      fail(`tower metrics unavailable: ${anchors.error}`);
    } else if (!anchors.tower.towerFaceLeft.visible || !anchors.tower.towerFaceRight.visible) {
      fail("tower metrics unavailable: a projected tower face is outside the view");
    } else {
      const rects = towerSampleRects(anchors.tower, scale);
      const sample = Object.fromEntries(Object.entries(rects).map(([name, rect]) => [name, regionMeanLstar(frame, rect)]));
      if (Object.values(sample).some((value) => value === null)) {
        fail("tower metrics unavailable: a tower or air sample fell outside the frame");
      } else {
        const left = sample.faceLeft.mean;
        const right = sample.faceRight.mean;
        const lit = Math.max(left, right);
        const shade = Math.min(left, right);
        const towerLstar = (left + right) / 2;
        const airLstar = (sample.airLeft.mean + sample.airRight.mean) / 2;
        result.tower = {
          airLstar,
          faceLeftLstar: left,
          faceRightLstar: right,
          litFace: left >= right ? "left" : "right",
          litShadeRatio: lit / Math.max(shade, 0.5),
          rects,
          towerLstar,
          towerMinusAir: towerLstar - airLstar,
        };
        console.log(`tower      lit/shade face ratio ${result.tower.litShadeRatio.toFixed(2)}`
          + ` (left ${left.toFixed(1)} · right ${right.toFixed(1)}, lit ${result.tower.litFace})`
          + ` · tower ${towerLstar.toFixed(1)} vs air ${airLstar.toFixed(1)} (Δ ${result.tower.towerMinusAir >= 0 ? "+" : ""}${result.tower.towerMinusAir.toFixed(1)} L*)`);
      }
    }
    result.notan = await writeNotan(frame, 16 * scale, `${base}-notan.png`);
    console.log(`notan      ${result.notan.path} · dark ${percent(result.notan.shares[0])}`
      + ` · mid ${percent(result.notan.shares[1])} · light ${percent(result.notan.shares[2])}`
      + ` (16px blur; thirds of its p5–p95 range, L* ${result.notan.thresholds.map((value) => value.toFixed(1)).join(" / ")})`);
  }

  if (picture.valuePlan) {
    const plan = await readValuePlan(VALUE_PLAN_DOC);
    let column = valuePlanColumn;
    let source = "--value-plan";
    if (!column) {
      const hashHour = hourFromHash(hash);
      const hour = hashHour ?? metrics.wallClockHour;
      if (typeof hour === "number") {
        column = valuePlanColumnForHour(hour);
        source = hashHour !== null ? `t=${hashHour}` : `wall clock ${round(hour)}h`;
      }
    }
    if (!column) {
      fail("value plan: no t= hour in the hash and the page published no wallClockHour; pass --value-plan noon|dusk|night");
    } else {
      const target = plan[column];
      const correlation = pearson(result.ninths, target);
      result.valuePlan = {
        column,
        mae: meanAbsoluteError(result.ninths, target),
        pearsonR: correlation,
        source,
        target,
      };
      console.log(`value plan ${column} column (${source}): MAE ${result.valuePlan.mae.toFixed(1)} L*`
        + ` · Pearson r ${correlation === null ? "n/a" : correlation.toFixed(2)}`);
      ["top", "mid", "bot"].forEach((row, index) => {
        console.log(`           ${row} ${target.slice(index * 3, index * 3 + 3).map(cell).join("")}   (bible, docs/pharosville/VISUAL_INVARIANTS.md)`);
      });
    }
  }

  if (picture.nightWater) {
    if (anchors.error) {
      fail(`night water unavailable: ${anchors.error}`);
    } else if (!anchors.inlet.some((point) => point.visible)) {
      fail("night water unavailable: no inlet polygon vertex projects into the view");
    } else {
      const polygon = anchors.inlet.map((point) => ({ x: point.x * scale, y: point.y * scale }));
      const water = polygonLstarStats(frame, polygon, { brightThreshold: 10 });
      if (!water) {
        fail("night water unavailable: the projected inlet polygon covers no pixel");
      } else {
        result.nightWater = water;
        console.log(`night water inlet mean L* ${water.mean.toFixed(1)} · p95 ${water.p95.toFixed(1)} · max ${water.max.toFixed(1)}`
          + ` · ${percent(water.brightShare)} above L* ${water.brightThreshold} · ${water.pixels} px`);
      }
    }
  }

  if (picture.temporal) {
    const shots = await withHudHidden(page, () => captureFrames(page, canvas, {
      count: TEMPORAL_FRAME_COUNT,
      intervalMs: TEMPORAL_INTERVAL_MS,
    }));
    const planes = [];
    for (const { png: shot } of shots) {
      const { height, lstar, width } = await decodeFrame(shot);
      planes.push({ height, lstar, width });
    }
    const temporal = temporalBottomThirdDelta(planes);
    result.temporal = { ...temporal, spanMs: shots.at(-1).atMs };
    console.log(`temporal   bottom-third mean |ΔL*| ${temporal.mean.toFixed(3)} per frame pair`
      + ` (max ${temporal.max.toFixed(3)}) · ${temporal.pairs.length} pairs over ${round(result.temporal.spanMs / 1000)}s`);
  }
  return result;
}

/** motionStats and the director log, or `{ error }` naming the missing debug field. */
async function readDebugStats(page) {
  return page.evaluate(() => {
    const debug = window.__pharosVilleDebug;
    if (!debug) return { error: "window.__pharosVilleDebug is absent — load a dev or localhost build with ?debug=1" };
    const stats = debug.motionStats;
    if (!stats || typeof stats.visibleShips !== "number") {
      return { error: "__pharosVilleDebug.motionStats is absent — this build predates the W0.2 motion instruments" };
    }
    if (!Array.isArray(debug.directorLog)) {
      return { error: "__pharosVilleDebug.directorLog is absent — this build predates the W0.2 director log" };
    }
    return {
      directorLog: debug.directorLog.map((beat) => ({
        admittedAtWallMs: beat.admittedAtWallMs ?? null,
        endSeconds: beat.endSeconds ?? null,
        id: String(beat.id),
        kind: String(beat.kind),
        priority: beat.priority ?? null,
        startSeconds: beat.startSeconds ?? null,
      })),
      motionStats: {
        meanAbsRestTurnDegPerSec: stats.meanAbsRestTurnDegPerSec ?? null,
        meanAbsTurnDegPerSec: stats.meanAbsTurnDegPerSec,
        sampledAtMs: stats.sampledAtMs,
        underwayShips: stats.underwayShips,
        visibleShips: stats.visibleShips,
      },
    };
  });
}

function formatBeat(beat) {
  const window_ = typeof beat.startSeconds === "number" && typeof beat.endSeconds === "number"
    ? ` · ${round(beat.startSeconds)}–${round(beat.endSeconds)}s`
    : "";
  return `${beat.kind} ${beat.id} · priority ${beat.priority ?? "?"}${window_}`;
}

async function runStats(page, watchSeconds) {
  const first = await readDebugStats(page);
  if (first.error) {
    console.error(`error      --stats unavailable: ${first.error}`);
    process.exitCode = 1;
    return { error: first.error };
  }
  const { directorLog, motionStats } = first;
  const underwayShare = motionStats.visibleShips > 0 ? motionStats.underwayShips / motionStats.visibleShips : null;
  console.log(`stats      ${motionStats.visibleShips} ships visible · ${motionStats.underwayShips} underway`
    + ` (${underwayShare === null ? "n/a" : `${(underwayShare * 100).toFixed(1)} %`})`
    + ` · mean |turn| ${round(motionStats.meanAbsTurnDegPerSec)}°/s under way`
    + `${typeof motionStats.meanAbsRestTurnDegPerSec === "number" ? `, ${round(motionStats.meanAbsRestTurnDegPerSec)}°/s at rest` : ""}`
    + ` · sampled at ${round(motionStats.sampledAtMs)}ms`);
  const latest = directorLog.slice(-8);
  console.log(`director   ${directorLog.length} beats in the log${latest.length ? `; latest ${latest.length}:` : ""}`);
  for (const beat of latest) console.log(`           ${formatBeat(beat)}`);
  const result = { directorLog, motionStats };
  if (watchSeconds > 0) result.watch = await watchDebugStats(page, watchSeconds, first);
  return result;
}

/**
 * Sample the director log and motionStats for `watchSeconds`. A beat counts as
 * new when its identity first appears in the log; its time is the poll that saw
 * it (±250 ms), which keeps the reading independent of the app's clock — under
 * a fixture, Date does not move at all.
 */
async function watchDebugStats(page, watchSeconds, first) {
  const beatKey = (beat) => `${beat.id}|${beat.kind}|${beat.admittedAtWallMs}|${beat.startSeconds}`;
  const seen = new Set(first.directorLog.map(beatKey));
  const events = [];
  const samples = [first.motionStats];
  let lastSampledAt = first.motionStats.sampledAtMs;
  const startedAt = Date.now();
  while (Date.now() - startedAt < watchSeconds * 1000) {
    await page.waitForTimeout(STATS_POLL_INTERVAL_MS);
    const read = await readDebugStats(page);
    if (read.error) {
      console.error(`error      --watch-seconds stopped: ${read.error}`);
      process.exitCode = 1;
      return { error: read.error };
    }
    const atMs = Date.now() - startedAt;
    for (const beat of read.directorLog) {
      const key = beatKey(beat);
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({ ...beat, seenAtMs: atMs });
    }
    if (read.motionStats.sampledAtMs !== lastSampledAt) {
      lastSampledAt = read.motionStats.sampledAtMs;
      samples.push(read.motionStats);
    }
  }
  const elapsedMs = Date.now() - startedAt;
  const marks = [0, ...events.map((event) => event.seenAtMs), elapsedMs];
  let longestQuietMs = 0;
  for (let index = 1; index < marks.length; index += 1) longestQuietMs = Math.max(longestQuietMs, marks[index] - marks[index - 1]);
  const visible = samples.reduce((sum, sample) => sum + sample.visibleShips, 0);
  const underway = samples.reduce((sum, sample) => sum + sample.underwayShips, 0);
  const meanOf = (key) => {
    const valid = samples.filter((sample) => typeof sample[key] === "number");
    return valid.length ? valid.reduce((sum, sample) => sum + sample[key], 0) / valid.length : null;
  };
  const meanTurnDegPerSec = meanOf("meanAbsTurnDegPerSec");
  const meanRestTurnDegPerSec = meanOf("meanAbsRestTurnDegPerSec");
  const watch = {
    elapsedMs,
    events,
    eventsPerHour: events.length / (elapsedMs / 3_600_000),
    longestQuietMs,
    meanRestTurnDegPerSec,
    meanTurnDegPerSec,
    samples: samples.length,
    underwayShare: visible > 0 ? underway / visible : null,
  };
  console.log(`watch      ${round(elapsedMs / 1000)}s: ${events.length} beats admitted (${round(watch.eventsPerHour)}/h)`
    + ` · longest quiet gap ${round(longestQuietMs / 1000)}s`
    + ` · underway ${watch.underwayShare === null ? "n/a" : `${(watch.underwayShare * 100).toFixed(1)} %`} of visible hulls`
    + ` · mean |turn| ${meanTurnDegPerSec === null ? "n/a" : `${meanTurnDegPerSec.toFixed(2)}°/s (${(meanTurnDegPerSec * 60).toFixed(0)}°/min)`} under way`
    + `, ${meanRestTurnDegPerSec === null ? "n/a" : `${meanRestTurnDegPerSec.toFixed(2)}°/s (${(meanRestTurnDegPerSec / 6).toFixed(3)} turns/min)`} at rest`
    + ` · ${samples.length} motion samples`);
  for (const event of events) console.log(`           +${round(event.seenAtMs / 1000)}s ${formatBeat(event)}`);
  return watch;
}

/** The raw requestAnimationFrame rate the page is given — on a headed ProMotion panel, 120 Hz. */
function measureDisplayRate(page, spanMs = 1000) {
  return page.evaluate((span) => new Promise((done) => {
    let first = null;
    let frames = 0;
    const tick = (time) => {
      if (first === null) first = time;
      else frames += 1;
      if (first !== null && time - first >= span) done((frames * 1000) / (time - first));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), spanMs);
}

/**
 * --knockout-compare: baseline and each knockout arm alternate for three serial
 * rounds, each arm a whole preview in its own Chrome, and Δ = knockout −
 * baseline is averaged over same-round pairs so thermal drift across the run
 * cancels instead of landing on whichever pass ran last.
 */
async function runKnockoutCompare(passes) {
  const script = fileURLToPath(import.meta.url);
  const passthrough = stripFlags(process.argv.slice(2), ["knockout-compare", "knockout", "out", "json"]);
  const stem = relative(outputDirectory, outputPath).replace(/\.png$/i, "");
  const arms = ["baseline", ...passes];
  console.log(`knockout   comparing ${passes.join(", ")} against baseline:`
    + ` ${KNOCKOUT_COMPARE_ROUNDS} alternating serial rounds, one Chrome per arm`);
  if (!uncapped) {
    console.log("           CAPPED: without --uncapped every arm reads the vsync interval, so Δ saturates near 0;"
      + " add --uncapped for costs");
  }
  const rounds = [];
  for (let roundIndex = 1; roundIndex <= KNOCKOUT_COMPARE_ROUNDS; roundIndex += 1) {
    const results = {};
    for (const arm of arms) {
      const name = `${stem}-kc-r${roundIndex}-${arm}`;
      const child = await runPreviewChild(script, [
        ...passthrough,
        "--out", `${name}.png`,
        "--json", `${name}.json`,
        ...(arm === "baseline" ? [] : ["--knockout", arm]),
      ]);
      if (child.code !== 0) {
        console.error(`knockout   arm ${arm} (round ${roundIndex}) exited ${child.code}; its last lines:\n`
          + child.output.trimEnd().split("\n").slice(-15).join("\n"));
        process.exitCode = child.code;
        return;
      }
      const { metrics: armMetrics } = JSON.parse(await readFile(resolve(outputDirectory, `${name}.json`), "utf8"));
      results[arm] = {
        dropped: armMetrics.dropped,
        fps: armMetrics.fps,
        p50: armMetrics.p50,
        p90: armMetrics.p90,
        samples: armMetrics.samples,
        tier: armMetrics.tier,
      };
      console.log(`           r${roundIndex} ${arm.padEnd(11)} ${round(armMetrics.fps)} fps · p50 ${round(armMetrics.p50)}ms`
        + ` · p90 ${round(armMetrics.p90)}ms · tier ${armMetrics.tier}`);
    }
    rounds.push(results);
  }
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];
  const signed = (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
  const deltas = passes.map((pass) => {
    const p50 = rounds.map((results) => results[pass].p50 - results.baseline.p50);
    const p90 = rounds.map((results) => results[pass].p90 - results.baseline.p90);
    return { deltaP50Ms: mean(p50), deltaP90Ms: mean(p90), pass, perRoundDeltaP50Ms: p50, perRoundDeltaP90Ms: p90 };
  });
  const baseline = {
    p50: median(rounds.map((results) => results.baseline.p50)),
    p90: median(rounds.map((results) => results.baseline.p90)),
  };
  const sumDeltaP50Ms = deltas.reduce((sum, delta) => sum + delta.deltaP50Ms, 0);
  console.log(`knockout   Δ = knockout − baseline, mean of ${KNOCKOUT_COMPARE_ROUNDS} same-round pairs (negative: the pass costs that much)`);
  for (const delta of deltas) {
    console.log(`           ${delta.pass.padEnd(11)} Δp50 ${signed(delta.deltaP50Ms)}ms · Δp90 ${signed(delta.deltaP90Ms)}ms`
      + `   (per round Δp50 ${delta.perRoundDeltaP50Ms.map(signed).join(" / ")})`);
  }
  console.log(`           Σ Δp50 ${signed(sumDeltaP50Ms)}ms · baseline p50 ${round(baseline.p50)}ms · p90 ${round(baseline.p90)}ms (median of rounds)`);
  const tiers = new Set(rounds.flatMap((results) => Object.values(results).map((result) => result.tier)));
  if (tiers.size > 1) {
    console.error(`note: arms ran at different scheduler tiers (${[...tiers].join(", ")}), so their frame times are not like for like.`);
  }
  if (args.json) {
    await writeFile(
      resolve(outputDirectory, typeof args.json === "string" ? args.json : "preview.json"),
      `${JSON.stringify({ baseline, deltas, passes, rounds, sumDeltaP50Ms, uncapped }, null, 2)}\n`,
    );
  }
}

function runPreviewChild(script, childArgs) {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [script, ...childArgs], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", rejectChild);
    child.on("close", (code) => resolveChild({ code: code ?? 1, output }));
  });
}

/** argv minus the named flags and their values, with parseArgs' own value rule. */
function stripFlags(argv, names) {
  const kept = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const key = token.startsWith("--") ? token.slice(2).split("=")[0] : null;
    if (key === null || !names.includes(key)) {
      kept.push(token);
      continue;
    }
    const next = argv[index + 1];
    if (!token.includes("=") && next !== undefined && !next.startsWith("--")) index += 1;
  }
  return kept;
}

function knockoutListFlag(name) {
  const raw = args[name];
  if (raw === undefined) return null;
  const usage = `--${name} needs a comma list of ${KNOCKOUT_PASSES.join(", ")}`;
  if (raw === true) throw new Error(usage);
  const passes = [...new Set(String(raw).split(",").map((pass) => pass.trim()).filter(Boolean))];
  const unknown = passes.filter((pass) => !KNOCKOUT_PASSES.includes(pass));
  if (passes.length === 0 || unknown.length > 0) throw new Error(`${usage}; unknown: ${unknown.join(", ") || "(empty)"}`);
  return passes;
}

function parseClockFlag() {
  const raw = args.clock;
  if (raw === undefined) return null;
  const usage = "--clock needs an ISO date or date-time, e.g. --clock 2026-09-26 or --clock 2026-09-26T21:30";
  if (raw === true) throw new Error(usage);
  const date = /^\d{4}-\d{2}-\d{2}/.exec(raw);
  // A bare date means that local calendar day's midnight; ISO alone would read
  // it as UTC midnight, which is the previous evening west of Greenwich.
  const epochMs = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00` : raw);
  if (!date || !Number.isFinite(epochMs)) throw new Error(`${usage}; got "${raw}"`);
  return { date: date[0], epochMs, iso: raw };
}

function withCalendarDate(baseHash, calendar) {
  if (!calendar) return baseHash;
  if (/[#&]d=/.test(baseHash)) throw new Error("--clock adds d= to the hash itself; drop the d= from --hash");
  return baseHash ? `${baseHash}&d=${calendar.date}` : `#d=${calendar.date}`;
}

/** W5.1: start a ritual through the debug seam, then wait `waitMs` before the capture. */
async function forceRitualBeforeCapture(page, kind, waitMs) {
  const started = await page.evaluate((ritual) => {
    const debug = window.__pharosVilleDebug;
    return typeof debug?.forceRitual === "function" ? debug.forceRitual(ritual) : null;
  }, kind);
  if (started === null) throw new Error("--ritual needs visual debug (__pharosVilleDebug.forceRitual is absent)");
  console.log(`ritual     ${kind} ${started ? "started" : "has no registered handler (logged only)"}${waitMs > 0 ? ` · capture after ${waitMs}ms` : ""}`);
  if (waitMs > 0) await page.waitForTimeout(waitMs);
}

function parseBurstFlags() {
  const dependent = ["interval", "clip", "burst-sheet"].filter((name) => args[name] !== undefined);
  if (args.burst === undefined) {
    if (dependent.length > 0) throw new Error(`--${dependent[0]} only applies to --burst`);
    return null;
  }
  const count = Number(args.burst);
  if (args.burst === true || !Number.isInteger(count) || count < 1) throw new Error("--burst needs a whole frame count ≥ 1, e.g. --burst 9");
  const intervalMs = numberFlag("interval", 600);
  if (intervalMs < 0) throw new Error("--interval needs a non-negative number of milliseconds");
  let clip = null;
  if (args.clip !== undefined) {
    const parts = String(args.clip).split(",").map(Number);
    if (args.clip === true || parts.length !== 4 || !parts.every(Number.isFinite) || parts[2] <= 0 || parts[3] <= 0) {
      throw new Error("--clip needs x,y,w,h in viewport CSS pixels, e.g. --clip 900,700,500,250");
    }
    clip = { height: parts[3], width: parts[2], x: parts[0], y: parts[1] };
  }
  return { clip, count, intervalMs, sheet: Boolean(args["burst-sheet"]) };
}

/**
 * Date-only clock with setSystemTime semantics: Date starts at `epochMs` and
 * flows in real time. RAF, performance.now and timers stay native (Playwright's
 * page.clock would replace all three and pace RAF from timers, so every frame
 * time read under it would be the shim's, not the GPU's). Serialised into the
 * page by addInitScript, so it must stay self-contained.
 */
function installFlowingDate(epochMs) {
  const NativeDate = globalThis.Date;
  const origin = NativeDate.now();
  const now = () => epochMs + (NativeDate.now() - origin);
  globalThis.Date = new Proxy(NativeDate, {
    apply: () => new NativeDate(now()).toString(),
    construct: (target, dateArgs, newTarget) => Reflect.construct(target, dateArgs.length ? dateArgs : [now()], newTarget),
    get: (target, key, receiver) => key === "now" ? now : Reflect.get(target, key, receiver),
  });
}

async function runArtifactFlashCheck(page, canvas) {
  const frameCount = 8;
  const intervalMs = 120;
  const frames = [];
  for (const { png } of await captureFrames(page, canvas, { count: frameCount, intervalMs })) {
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
      observedAtMs: performance.now(),
      visibilityState: document.visibilityState,
      documentHasFocus: document.hasFocus(),
      longtaskSupported: typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask"),
      gpuWarmupCount: m?.gpuWarmupCount ?? null,
      camera: debug?.camera ?? null,
      wallClockHour: debug?.wallClockHour ?? null,
      calls: m?.gpu?.calls ?? null,
      environmentBakeCalls: m?.environmentBakeCalls ?? null,
      environmentBakeCount: m?.environmentBakeCount ?? null,
      environmentBakeCountChange: m?.environmentBakeCountChange ?? null,
      composer: m?.composerEnabled ?? null,
      contentReplacements: m?.contentReplacementCount ?? null,
      contentParts: m?.contentSignaturePartHashes ?? null,
      dropped: m?.framePacing?.droppedFrameCount ?? null,
      fleetDraws: m?.fleetDrawCallCount ?? null,
      frameCount: debug?.motionFrameCount ?? null,
      fps: m?.framePacing?.effectiveFps ?? null,
      geometries: m?.gpu?.geometries ?? null,
      gpuTimings: m?.gpuTimings ?? null,
      logoAssetsExpected: m?.logoAssetsExpected ?? null,
      logoAssetsLoaded: m?.logoAssetsLoaded ?? null,
      longtaskCount: m?.longtask?.count ?? null,
      longtaskMaxMs: m?.longtask?.maxDurationMs ?? null,
      sampleDurationMs: m?.sampleDurationMs ?? null,
      hitTargetDurationMs: m?.hitTargetDurationMs ?? null,
      drawDurationMs: m?.drawDurationMs ?? null,
      maxFrameMs: m?.framePacing?.maxMs ?? null,
      p50: m?.framePacing?.p50Ms ?? null,
      p90: m?.framePacing?.p90Ms ?? null,
      // Undefined on any bundle older than W4.4 — read as null, and assert mode
      // treats a null tail as "not measured" rather than as a pass.
      p95: m?.framePacing?.p95Ms ?? null,
      p99: m?.framePacing?.p99Ms ?? null,
      samples: m?.framePacing?.sampleCount ?? null,
      shipsVisible: m?.visibleShipCount ?? null,
      offscreenCalls: m?.gpu?.offscreenCalls ?? null,
      sceneCalls: m?.gpu?.sceneCalls ?? null,
      drawOwnerCensus: m?.drawOwnerCensus ?? null,
      textureOwnerCensus: m?.textureOwnerCensus ?? null,
      textureUploads: m?.textureUploads ?? null,
      tier: m?.schedulerTier ?? null,
      tierReached: m?.sessionTierReached ?? null,
      triangles: m?.gpu?.triangles ?? null,
      textures: m?.gpu?.textures ?? null,
    };
  });
}

async function waitForDrawOwnerCensusAfterFrame(page, frame) {
  const deadline = Date.now() + 10_000;
  let latest = await readMetrics(page);
  while (
    Date.now() < deadline
    && (
      (latest.drawOwnerCensus?.sampledAtFrame ?? -1) <= frame
      || Math.abs((latest.drawOwnerCensus?.rendererCalls ?? Infinity) - (latest.sceneCalls ?? -Infinity)) > 2
    )
  ) {
    await page.waitForTimeout(100);
    latest = await readMetrics(page);
  }
  const sampledAtFrame = latest.drawOwnerCensus?.sampledAtFrame ?? -1;
  const sceneDelta = Math.abs((latest.drawOwnerCensus?.rendererCalls ?? Infinity) - (latest.sceneCalls ?? -Infinity));
  if (sampledAtFrame <= frame || sceneDelta > 2) {
    throw new Error(`--draw-census did not receive a current sample after settled frame ${frame}`
      + ` (latest sample ${sampledAtFrame}, scene delta ${sceneDelta})`);
  }
  return latest;
}

function printTextureOwnerCensus(census) {
  if (!census) {
    console.log("textures   owner census unavailable");
    return;
  }
  const attributed = census.attributedTextures ?? census.referencedTextures;
  console.log(`textures   ${census.rendererTextures} renderer allocations ·`
    + ` ${census.referencedTextures} scene-referenced · ${attributed} named/reachable`);
  console.log(`           at least ${census.minimumUnattributedRendererTextures}`
    + " renderer-internal/unattributed");
  const mib = (bytes) => `${(bytes / 1048576).toFixed(2)} MiB`;
  if (census.byteEstimates) {
    const bytes = census.byteEstimates;
    console.log(`           estimated logical storage (NOT measured VRAM):`
      + ` textures ${mib(bytes.textureBytes)} reachable / ${mib(bytes.liveTextureBytes)} live handles;`
      + ` depth/MSAA renderbuffers ${mib(bytes.renderbufferBytes)} reachable / ${mib(bytes.liveRenderbufferBytes)} live targets`);
    console.log(`           unknown bytes: ${bytes.unknownTextureCount} reachable textures`
      + ` (${bytes.unknownLiveTextureCount} live), ${bytes.unknownRenderTargetCount} target layouts;`
      + ` ${census.attributedLiveTextures ?? "unknown"} distinct attributed live handles`);
    console.log("           excludes driver padding/pooling, default framebuffer, and unattributed allocations");
  }
  for (const entry of census.owners ?? []) {
    const live = entry.liveTextureCount === undefined
      ? ""
      : ` · ${String(entry.liveTextureCount).padStart(2, " ")} resident`;
    const bytes = entry.byteEstimates;
    const storage = bytes ? ` · est. ${mib(bytes.liveTextureBytes + bytes.liveRenderbufferBytes)} live storage` : "";
    console.log(`           ${String(entry.textureCount).padStart(2, " ")}  ${entry.owner}${live}${storage}`);
    if ((entry.liveTextureNames?.length ?? 0) > 0) {
      console.log(`                 live: ${entry.liveTextureNames.join(", ")}`);
    }
  }
}

function printDrawOwnerCensus(census) {
  if (!census) { console.log("draws      owner census unavailable"); return; }
  const reconciled = census.attributedCalls === census.rendererCalls ? "reconciled" : "MISMATCH";
  console.log(`draws      ${census.attributedCalls} attributed · ${census.rendererCalls} renderer.info · ${reconciled}`
    + ` · frame ${census.sampledAtFrame}`);
  for (const entry of census.owners) {
    console.log(`           ${String(entry.calls).padStart(4, " ")}  ${String(entry.triangles).padStart(8, " ")}`
      + `  ${entry.instanced ? "I" : " "}  ${entry.owner}`);
  }
}

async function readWebglRenderer(page) {
  await page.goto("about:blank");
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return { renderer: "NO WEBGL CONTEXT", timerQuerySupported: false };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "(renderer info unavailable)",
      timerQuerySupported: Boolean(gl.getExtension("EXT_disjoint_timer_query_webgl2")),
    };
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
