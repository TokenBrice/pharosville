#!/usr/bin/env node
import { execFileSync } from "node:child_process";
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

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

function runDeployGate(cwd = process.cwd()) {
  console.log("Running local deploy gate equivalent to .github/workflows/deploy-cloudflare.yml pre-deploy jobs.");
  for (const [command, args] of DEPLOY_GATE_COMMANDS) {
    console.log(`\n> ${formatCommand(command, args)}`);
    execFileSync(command, args, { cwd, stdio: "inherit" });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDeployGate();
}
