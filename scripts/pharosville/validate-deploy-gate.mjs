#!/usr/bin/env node
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

// Deliberately BROADER than CI. The runners have no GPU, so CI gates on the
// DOM/accessibility contract (`test:visual:dist:dom`); the full visual lane can
// only run on real hardware, which is here. See docs/pharosville/TESTING.md.
const DEPLOY_GATE_COMMANDS = [
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "lint"]],
  ["npm", ["test"]],
  ["npm", ["run", "test:guard-scripts"]],
  ["npm", ["run", "check:committed-secrets"]],
  ["npm", ["run", "check:doc-paths-and-scripts"]],
  ["npm", ["run", "check:runtime-facts"]],
  ["npm", ["run", "check:release-contract"]],
  ["npm", ["run", "check:viewport-gate"]],
  ["npm", ["run", "check:security-headers:static"]],
  ["npm", ["run", "check:runtime-media"]],
  ["npm", ["run", "check:harbour-contracts"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "check:bundle-size"]],
  ["npm", ["run", "test:visual:dist"]],
  ["npm", ["run", "test:visual:dist:accessibility:firefox"]],
];

// GPU checks remain manual, on operator hardware before release, never in CI.
// The child mode also lets operators exercise just this socket against a /tmp build.
const PERF_TRIPWIRES = [
  [process.execPath, ["scripts/pharosville/validate-deploy-gate.mjs", "--perf-only"]],
];

/** A missing real GPU is not a pass, and must never be reported as one. */
const PREVIEW_SKIP_EXIT_CODE = 78;

/**
 * The one line that says what this run actually proved.
 *
 * A skipped tripwire still exits 0 — a machine with no GPU cannot be asked to
 * measure one, and failing there would only teach operators to pass a flag that
 * turns the gate off. But "green" and "green, frame time unchecked" are
 * different outcomes, and prose above the exit is not something a human
 * skimming a scrollback or a CI step keys on. So the verdict is a single
 * greppable token on the last line, and, under GitHub Actions, a step-summary
 * row and a `::warning::` annotation.
 */
export const DEPLOY_GATE_VERDICT_PREFIX = "PHAROSVILLE_DEPLOY_GATE:";

export function formatGateVerdict(perfOutcome) {
  return perfOutcome === "skipped"
    ? `${DEPLOY_GATE_VERDICT_PREFIX} PASS_PERF_SKIPPED (every other check passed; Harbour real-GPU load performance was NOT measured)`
    : `${DEPLOY_GATE_VERDICT_PREFIX} PASS (Harbour cold fast4g load and static byte tripwires passed)`;
}

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

/** The persisted branch measurement is a contended reference, not a quiet-machine claim. */
export function evaluateHarbourLoad(current, baseline) {
  const select = (summary) => summary.groups?.find((group) =>
    group.label === "A" && group.config === "fast4g" && group.arm === "cold");
  const group = select(current), previous = select(baseline);
  const metric = group?.metrics?.firstFleetFrameMs, reference = previous?.metrics?.firstFleetFrameMs;
  if (current.status !== "PASS" || group?.n !== 3 || metric?.n !== 3
    || !Number.isFinite(metric?.median) || metric.median <= 0) {
    throw new Error("Harbour tripwire requires three valid cold fast4g fleet-bearing load samples.");
  }
  if (baseline.status !== "PASS" || !(previous?.n >= 3) || !(reference?.n >= 3)
    || !Number.isFinite(reference?.median) || reference.median <= 0) {
    throw new Error("Branch baseline is missing a valid cold fast4g first-fleet median.");
  }
  const limitMs = reference.median * 1.15;
  return { pass: metric.median <= limitMs, medianMs: metric.median, baselineMs: reference.median,
    limitMs, deltaPercent: 100 * (metric.median / reference.median - 1) };
}

async function probeRealGpu() {
  // Match shared-browser.mjs's operator Chrome, never fall back to bundled Chromium.
  const chrome = process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "/opt/google/chrome/chrome";
  if (!existsSync(chrome)) return { available: false, reason: "Operator real-GPU Chrome is unavailable." };
  const { captureLock, connectShared } = await import("../harbour/shared-browser.mjs");
  const release = await captureLock();
  let page;
  try {
    let browser;
    try { browser = await connectShared(); }
    catch { return { available: false, reason: "Operator real-GPU browser could not start/connect." }; }
    const context = browser.contexts()[0] ?? await browser.newContext();
    page = await context.newPage();
    const gpu = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      return renderer;
    });
    return { available: !!gpu && !/swiftshader|llvmpipe|software|unknown|^none$/i.test(gpu),
      reason: gpu ? `WebGL2 renderer: ${gpu}` : "No identifiable real-GPU WebGL2 context." };
  } finally {
    try { await page?.close(); } finally { await release(); }
  }
}

function runPerfCommand(cwd, script, args) {
  console.log(`\n> ${formatCommand(process.execPath, [script, ...args])}`);
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => signal
      ? reject(new Error(`${script} terminated by ${signal}`)) : resolveRun(code));
  });
}

async function runHarbourPerfTripwire({ cwd, dist, port, out }) {
  await mkdir(out, { recursive: true });
  const bytesCode = await runPerfCommand(cwd, "scripts/perf/first-frame-bytes.mjs",
    ["--dist", dist, "--json", resolve(out, "bytes.json")]);
  if (bytesCode !== 0) throw new Error(`Static byte tripwire exited ${bytesCode}`);
  if ((process.env.CI && process.env.CI !== "false") || process.env.GITHUB_ACTIONS === "true") {
    console.log("SKIP_PERF_CI: GPU checks are manual before release; CI measures static bytes only.");
    return PREVIEW_SKIP_EXIT_CODE;
  }
  const gpu = await probeRealGpu();
  if (!gpu.available) {
    console.log(`SKIP_PERF_NO_GPU: ${gpu.reason}`);
    return PREVIEW_SKIP_EXIT_CODE;
  }
  console.log(gpu.reason);
  const origin = spawn(process.execPath, ["scripts/perf/origin.mjs", "--dist", dist, "--port", String(port)],
    { cwd, stdio: ["ignore", "pipe", "inherit"] });
  const stopOrigin = () => origin.kill("SIGTERM");
  process.once("SIGINT", stopOrigin);
  process.once("SIGTERM", stopOrigin);
  try {
    await new Promise((ready, reject) => {
      const timer = setTimeout(() => reject(new Error("Performance origin startup timed out.")), 30_000);
      let log = "";
      const onData = (chunk) => {
        process.stdout.write(chunk);
        log += chunk.toString();
        if (log.includes(`Performance origin ready http://127.0.0.1:${port}/`)) {
          clearTimeout(timer); ready();
        }
      };
      origin.stdout.on("data", onData);
      origin.once("error", (error) => { clearTimeout(timer); reject(error); });
      origin.once("exit", (code, signal) => {
        clearTimeout(timer); reject(new Error(`Performance origin exited ${code ?? signal}`));
      });
    });
    const summaryPath = resolve(out, "load.json");
    const baselinePath = resolve(cwd, "scripts/perf/baselines/branch-load.json");
    const loadCode = await runPerfCommand(cwd, "scripts/perf/load.mjs", [
      "--url", `http://127.0.0.1:${port}/?t=12&view=heart&intro=0`,
      "--config", "fast4g", "--arm", "cold", "--runs", "3", "--ready-timeout", "90",
      "--baseline", baselinePath, "--out", summaryPath,
    ]);
    if (loadCode === PREVIEW_SKIP_EXIT_CODE) {
      console.log("SKIP_PERF_NO_GPU: load capture refused to measure a non-real-GPU frame.");
      return PREVIEW_SKIP_EXIT_CODE;
    }
    if (loadCode !== 0) throw new Error(`Harbour load tripwire exited ${loadCode}`);
    const [current, baseline] = await Promise.all([summaryPath, baselinePath]
      .map(async (path) => JSON.parse(await readFile(path, "utf8"))));
    const result = evaluateHarbourLoad(current, baseline);
    await writeFile(resolve(out, "tripwire.json"), JSON.stringify({
      status: result.pass ? "PASS" : "FAIL", baseline: baselinePath, ...result,
      contended: current.meta.machine.contended,
      caveat: "Baseline is contended reference evidence. This short regression tripwire does not establish quiet-machine release confidence.",
    }, null, 2) + "\n");
    console.log(`${result.pass ? "PASS_PERF" : "FAIL_PERF"}: first-fleet median ${result.medianMs.toFixed(1)} ms; `
      + `baseline ${result.baselineMs.toFixed(1)} ms +15% = ${result.limitMs.toFixed(1)} ms `
      + `(${result.deltaPercent.toFixed(1)}%); static bytes passed${current.meta.machine.contended ? " [CONTENDED]" : ""}.`);
    return result.pass ? 0 : 1;
  } finally {
    process.removeListener("SIGINT", stopOrigin);
    process.removeListener("SIGTERM", stopOrigin);
    if (origin.exitCode === null && origin.signalCode === null) {
      const exited = new Promise((done) => origin.once("exit", done));
      origin.kill("SIGTERM");
      const timer = setTimeout(() => origin.kill("SIGKILL"), 3000);
      await exited;
      clearTimeout(timer);
    }
  }
}

/**
 * Every arm runs, and the three outcomes never collapse into two: a FAIL on any
 * arm fails the gate, and a SKIP on any arm makes the whole verdict a skip —
 * "some of it was measured" is not a claim this gate is allowed to make.
 */
function runPerfTripwires(cwd) {
  // The static arm still runs in CI; the GPU child returns 78, never a measured pass.
  let outcome = "measured";
  for (const [command, args] of PERF_TRIPWIRES) {
    console.log(`\n> ${formatCommand(command, args)}`);
    const result = spawnSync(command, args, { cwd, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status === PREVIEW_SKIP_EXIT_CODE) {
      console.log("\nPerf tripwire SKIPPED: no real-GPU load was measured (reason above).");
      console.log("The rest of the gate stands; Harbour load performance was NOT checked.");
      outcome = "skipped";
      continue;
    }
    if (result.status !== 0) {
      throw new Error(`${formatCommand(command, args)} exited ${result.status}`);
    }
  }
  return outcome;
}

function announceVerdict(perfOutcome) {
  const verdict = formatGateVerdict(perfOutcome);
  if (process.env.GITHUB_ACTIONS === "true" && perfOutcome === "skipped") {
    console.log("::warning title=Perf tripwire skipped::No real-GPU load was measured by this deploy gate run.");
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${verdict}\n`);
  }
  console.log(`\n${verdict}`);
}

function runDeployGate(cwd = process.cwd()) {
  console.log("Running local deploy gate equivalent to .github/workflows/deploy-cloudflare.yml pre-deploy jobs.");
  for (const [command, args] of DEPLOY_GATE_COMMANDS) {
    console.log(`\n> ${formatCommand(command, args)}`);
    execFileSync(command, args, { cwd, stdio: "inherit" });
  }
  const perfOutcome = runPerfTripwires(cwd);
  announceVerdict(perfOutcome);
  return perfOutcome;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: {
    "perf-only": { type: "boolean" }, dist: { type: "string", default: "dist" },
    port: { type: "string", default: "4180" }, out: { type: "string", default: "outputs/perf/deploy-gate" },
  } });
  if (values["perf-only"]) {
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("--port must be 1–65535");
    try {
      const code = await runHarbourPerfTripwire({ cwd: process.cwd(), dist: resolve(values.dist), port, out: resolve(values.out) });
      // Disconnect this client's CDP transport without shutting down the shared browser.
      process.exit(code);
    } catch (error) {
      console.error(`FAIL_PERF: ${error.message}`);
      process.exit(1);
    }
  } else {
    runDeployGate();
  }
}
