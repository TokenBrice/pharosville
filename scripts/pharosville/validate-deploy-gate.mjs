#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
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
  ["npm", ["run", "build"]],
  ["npm", ["run", "check:bundle-size"]],
  ["npm", ["run", "test:visual:dist"]],
  ["npm", ["run", "test:visual:dist:accessibility:firefox"]],
];

// A renderer regression that only shows on a GPU cannot be caught by CI at all,
// so a real-GPU tripwire belongs here. The Garden Observatory's preview.mjs
// tripwires were retired with that world at the Harbour cutover, and the
// Harbour's own frame-time gate is not wired yet: until it is, every run says
// so (PASS_PERF_SKIPPED) rather than reading as measured. Measure by hand with
// `npm run preview` (scripts/harbour/shot.mjs, the operator's real Chrome).
const PERF_TRIPWIRES = [];

/** preview.mjs's "did not measure" code. It is not a pass, and must never be reported as one. */
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
    ? `${DEPLOY_GATE_VERDICT_PREFIX} PASS_PERF_SKIPPED (every other check passed; the renderer's frame time was NOT measured)`
    : `${DEPLOY_GATE_VERDICT_PREFIX} PASS (perf tripwires measured real-GPU frames: animated and settled static)`;
}

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

/**
 * Every arm runs, and the three outcomes never collapse into two: a FAIL on any
 * arm fails the gate, and a SKIP on any arm makes the whole verdict a skip —
 * "some of it was measured" is not a claim this gate is allowed to make.
 */
function runPerfTripwires(cwd) {
  if (PERF_TRIPWIRES.length === 0) {
    console.log("\nPerf tripwire SKIPPED: the Harbour has no automated real-GPU frame-time gate yet.");
    console.log("Measure with `npm run preview` (scripts/harbour/shot.mjs) on the operator's GPU.");
    return "skipped";
  }
  let outcome = "measured";
  for (const [command, args] of PERF_TRIPWIRES) {
    console.log(`\n> ${formatCommand(command, args)}`);
    const result = spawnSync(command, args, { cwd, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status === PREVIEW_SKIP_EXIT_CODE) {
      console.log("\nPerf tripwire SKIPPED: no real-GPU frame was measured (reason above).");
      console.log("The rest of the gate stands; the renderer's frame time was NOT checked.");
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
    console.log("::warning title=Perf tripwire skipped::No real-GPU frame was measured by this deploy gate run.");
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
  runDeployGate();
}
