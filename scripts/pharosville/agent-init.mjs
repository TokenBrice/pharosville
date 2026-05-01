#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { sanitizeSegment } from "./new-worktree.mjs";

function usage() {
  console.error("Usage:");
  console.error("  npm run agent:init -- [worktree-name] [--ref <git-ref>] [--branch <branch-name>] [--install]");
  console.error("                       [--skip-setup-key] [--skip-smoke] [--skip-onboard]");
  console.error("  npm run agent:init -- --worktree <name> [--ref <git-ref>] [--branch <branch-name>] [--install]");
  console.error("");
  console.error("Behavior:");
  console.error("  - If a worktree name is provided, creates .worktrees/<sanitized-name> via new-worktree.mjs.");
  console.error("  - --install runs npm ci in the target checkout (new worktree or current repo).");
  console.error("  - By default runs setup-local-api-key, smoke-local-api, and onboard-agent in order.");
  console.error("");
  console.error("Examples:");
  console.error("  npm run agent:init --");
  console.error("  npm run agent:init -- --install");
  console.error("  npm run agent:init -- feat-api-smoke --branch chore/feat-api-smoke --install");
  console.error("  npm run agent:init -- --worktree perf-pass --ref origin/main --skip-smoke");
}

export function parseArgs(argv) {
  const args = [...argv];
  const parsed = {
    worktreeName: "",
    ref: "HEAD",
    branch: "",
    install: false,
    runSetupKey: true,
    runSmoke: true,
    runOnboard: true,
    help: false,
  };

  while (args.length > 0) {
    const token = args.shift();

    if (token === "--help" || token === "-h") {
      parsed.help = true;
      continue;
    }

    if (token === "--install") {
      parsed.install = true;
      continue;
    }

    if (token === "--skip-setup-key") {
      parsed.runSetupKey = false;
      continue;
    }

    if (token === "--skip-smoke") {
      parsed.runSmoke = false;
      continue;
    }

    if (token === "--skip-onboard") {
      parsed.runOnboard = false;
      continue;
    }

    if (token === "--worktree") {
      const worktreeName = args.shift();
      if (!worktreeName) return null;
      parsed.worktreeName = worktreeName;
      continue;
    }

    if (token === "--ref") {
      const ref = args.shift();
      if (!ref) return null;
      parsed.ref = ref;
      continue;
    }

    if (token === "--branch") {
      const branch = args.shift();
      if (!branch) return null;
      parsed.branch = branch;
      continue;
    }

    if (!token.startsWith("-") && !parsed.worktreeName) {
      parsed.worktreeName = token;
      continue;
    }

    return null;
  }

  if (!parsed.worktreeName && (parsed.ref !== "HEAD" || parsed.branch)) {
    return null;
  }

  if (!parsed.worktreeName && !parsed.install && !parsed.runSetupKey && !parsed.runSmoke && !parsed.runOnboard) {
    return null;
  }

  return parsed;
}

function runStep(label, command, args, cwd) {
  console.log(`\n==> ${label}`);
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const code = typeof result.status === "number" ? result.status : 1;
    process.exit(code);
  }
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    usage();
    process.exit(1);
  }
  if (parsed.help) {
    usage();
    return;
  }

  const repoRoot = process.cwd();
  const scriptRoot = resolve(repoRoot, "scripts/pharosville");
  let targetCwd = repoRoot;

  if (parsed.worktreeName) {
    const worktreeCommandArgs = [resolve(scriptRoot, "new-worktree.mjs"), parsed.worktreeName];
    if (parsed.ref !== "HEAD") {
      worktreeCommandArgs.push("--ref", parsed.ref);
    }
    if (parsed.branch) {
      worktreeCommandArgs.push("--branch", parsed.branch);
    }
    if (parsed.install) {
      worktreeCommandArgs.push("--install");
    }

    runStep("Create worktree", "node", worktreeCommandArgs, repoRoot);

    const sanitized = sanitizeSegment(parsed.worktreeName);
    if (!sanitized) {
      console.error("Worktree name resolves to empty after sanitization.");
      process.exit(1);
    }
    targetCwd = resolve(repoRoot, ".worktrees", sanitized);
  } else if (parsed.install) {
    runStep("Install dependencies", "npm", ["ci"], targetCwd);
  }

  if (parsed.runSetupKey) {
    runStep(
      "Setup shared local API key",
      "node",
      [resolve(scriptRoot, "setup-local-api-key.mjs")],
      targetCwd,
    );
  }

  if (parsed.runSmoke) {
    runStep(
      "Run local API smoke",
      "node",
      [resolve(scriptRoot, "smoke-local-api.mjs")],
      targetCwd,
    );
  }

  if (parsed.runOnboard) {
    runStep(
      "Run agent onboarding check",
      "node",
      [resolve(scriptRoot, "onboard-agent.mjs")],
      targetCwd,
    );
  }

  console.log("\nagent:init completed.");
  console.log(`- target checkout: ${targetCwd}`);
  console.log(`- worktree created: ${parsed.worktreeName ? "yes" : "no"}`);
  console.log(`- install ran: ${parsed.install ? "yes" : "no"}`);
  console.log(`- setup key ran: ${parsed.runSetupKey ? "yes" : "no"}`);
  console.log(`- smoke ran: ${parsed.runSmoke ? "yes" : "no"}`);
  console.log(`- onboard ran: ${parsed.runOnboard ? "yes" : "no"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
