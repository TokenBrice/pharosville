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
 * Usage:
 *   node scripts/pharosville/preview.mjs
 *   node scripts/pharosville/preview.mjs --hash "#t=22&n=1" --out night.png
 *   node scripts/pharosville/preview.mjs --headed --seconds 8
 *   node scripts/pharosville/preview.mjs --reduced          # static-frame path
 *   node scripts/pharosville/preview.mjs --legend           # keep the onboarding overlay
 *   node scripts/pharosville/preview.mjs --url http://localhost:4173 --width 2560 --height 1440
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "playwright";

/**
 * The wrapper, not the binary. See the header: this is what applies the
 * operator's chrome-flags.conf and so what puts rendering on the real GPU.
 */
const SYSTEM_CHROME = "/usr/bin/google-chrome-stable";

const args = parseArgs(process.argv.slice(2));
const url = args.url ?? "http://localhost:5173";
const hash = args.hash ?? "";
const width = Number(args.width ?? 1600);
const height = Number(args.height ?? 1000);
// Long enough for the frame-pacing window to fill with steady-state frames
// rather than the load spike.
const seconds = Number(args.seconds ?? 6);
const outputDirectory = resolve(process.cwd(), "outputs");
const outputPath = resolve(outputDirectory, args.out ?? "preview.png");

const chromePath = typeof args.chrome === "string" ? args.chrome : SYSTEM_CHROME;
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

  const renderer = await readWebglRenderer(page);
  console.log(`chrome     ${chromePath}`);
  console.log(`flags      ${await describeOperatorFlags()}`);
  console.log(`GPU        ${renderer}`);
  if (/swiftshader|softwarerasterizer|llvmpipe/i.test(renderer)) {
    console.error(
      `\nRefusing to report: this is a SOFTWARE rasteriser, so any frame time or\n`
      + `scheduler tier below would be fiction. Check that ${chromePath} exists and\n`
      + `is the wrapper script (not /opt/google/chrome/chrome, which skips the\n`
      + `operator's chrome-flags.conf and lands on SwiftShader).`,
    );
    process.exitCode = 1;
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

  let metrics = await readMetrics(page);
  const settleDeadline = Date.now() + 20_000;
  while (Date.now() < settleDeadline && (metrics.samples ?? 0) < FULL_ENOUGH_SAMPLES) {
    await page.waitForTimeout(700);
    const read = await readMetrics(page);
    if ((read.samples ?? 0) > (metrics.samples ?? 0)) metrics = read;
  }
  if ((metrics.shipsVisible ?? 0) === 0) {
    console.error("warning: no fleet on screen — the world had not populated, so the frame below is not the world.");
  }

  await mkdir(outputDirectory, { recursive: true });
  await page.screenshot({ path: outputPath });

  const round = (value) => (typeof value === "number" ? Math.round(value * 10) / 10 : value);
  console.log(`URL        ${target}`);
  console.log(`viewport   ${width}x${height} @${args.dpr ?? 1}x, ${args.headed ? "headed" : "headless"}`
    + `, motion ${args.reduced ? "reduced" : "normal"}`);
  console.log(`frame      ${round(metrics.fps)} fps · p50 ${round(metrics.p50)}ms · p90 ${round(metrics.p90)}ms`
    + ` · dropped ${metrics.dropped} of ${metrics.samples}`);
  console.log(`tier       ${metrics.tier} (session worst: ${metrics.tierReached})`
    + ` · composer ${metrics.composer ? "on" : "off"}`);
  console.log(`draw       ${metrics.calls} calls · ${metrics.triangles} tris · ${metrics.geometries} geoms`
    + ` · ${metrics.textures} textures · fleet ${metrics.fleetDraws}`);
  console.log(`fleet      ${metrics.shipsVisible} ships visible`);
  console.log(`shot       ${outputPath}`);

  if (args.json) {
    await writeFile(
      resolve(outputDirectory, typeof args.json === "string" ? args.json : "preview.json"),
      `${JSON.stringify({ metrics, renderer, target }, null, 2)}\n`,
    );
  }
} finally {
  await browser.close();
}

function readMetrics(page) {
  return page.evaluate(() => {
    const debug = window.__pharosVilleDebug;
    const m = debug?.renderMetrics;
    return {
      calls: m?.gpu?.calls ?? null,
      composer: m?.composerEnabled ?? null,
      dropped: m?.framePacing?.droppedFrameCount ?? null,
      fleetDraws: m?.fleetDrawCallCount ?? null,
      fps: m?.framePacing?.effectiveFps ?? null,
      geometries: m?.gpu?.geometries ?? null,
      p50: m?.framePacing?.p50Ms ?? null,
      p90: m?.framePacing?.p90Ms ?? null,
      samples: m?.framePacing?.sampleCount ?? null,
      shipsVisible: m?.visibleShipCount ?? null,
      tier: m?.schedulerTier ?? null,
      tierReached: m?.sessionTierReached ?? null,
      triangles: m?.gpu?.triangles ?? null,
      textures: m?.gpu?.textures ?? null,
    };
  });
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
