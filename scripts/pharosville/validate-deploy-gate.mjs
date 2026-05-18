#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEPLOY_GATE_COMMANDS = [
  ["npm", ["run", "typecheck"]],
  ["npm", ["test"]],
  ["npm", ["run", "test:guard-scripts"]],
  ["npm", ["run", "check:committed-secrets"]],
  ["npm", ["run", "check:doc-paths-and-scripts"]],
  ["npm", ["run", "check:runtime-facts"]],
  ["npm", ["run", "check:pharosville-assets"]],
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
