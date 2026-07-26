#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
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
  ["npm", ["run", "check:pharosville-colors"]],
  ["npm", ["run", "build"]],
  ["npm", ["run", "check:bundle-size"]],
  ["npm", ["run", "test:visual:dist"]],
  ["npm", ["run", "test:visual:dist:accessibility:firefox"]],
];

// The same reasoning as the list above, taken one step further. A renderer
// regression that only shows on a GPU cannot be caught by CI at all, so the
// tripwire is here or nowhere. It measures the operator's real Chrome on the
// dev server; preview.mjs owns deciding whether that is even possible.
const PERF_TRIPWIRE = ["node", ["scripts/pharosville/preview.mjs", "--assert"]];

/** preview.mjs's "did not measure" code. It is not a pass, and must never be reported as one. */
const PREVIEW_SKIP_EXIT_CODE = 78;

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

function runPerfTripwire(cwd) {
  const [command, args] = PERF_TRIPWIRE;
  console.log(`\n> ${formatCommand(command, args)}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status === PREVIEW_SKIP_EXIT_CODE) {
    console.log("\nPerf tripwire SKIPPED: no real-GPU frame was measured (reason above).");
    console.log("The rest of the gate stands; the renderer's frame time was NOT checked.");
    return;
  }
  if (result.status !== 0) {
    throw new Error(`${formatCommand(command, args)} exited ${result.status}`);
  }
}

function runDeployGate(cwd = process.cwd()) {
  console.log("Running local deploy gate equivalent to .github/workflows/deploy-cloudflare.yml pre-deploy jobs.");
  for (const [command, args] of DEPLOY_GATE_COMMANDS) {
    console.log(`\n> ${formatCommand(command, args)}`);
    execFileSync(command, args, { cwd, stdio: "inherit" });
  }
  runPerfTripwire(cwd);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDeployGate();
}
