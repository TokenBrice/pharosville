#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const RELEASE_DEPLOY_KEY_TITLE = "pharosville-release-workflow";
export const RELEASE_ACTIONS_CREDENTIAL = ["RELEASE", "TAG", "SSH", "KEY"].join("_");

export function validateReleaseCredentialState({ deployKeys = [], secrets = [] }) {
  const failures = [];
  const secret = secrets.find((candidate) => candidate?.name === RELEASE_ACTIONS_CREDENTIAL);
  const deployKey = deployKeys.find((candidate) => candidate?.title === RELEASE_DEPLOY_KEY_TITLE);

  if (!secret) failures.push(`Actions secret ${RELEASE_ACTIONS_CREDENTIAL} is missing`);
  if (!deployKey) {
    failures.push(`deploy key ${RELEASE_DEPLOY_KEY_TITLE} is missing`);
  } else if (deployKey.read_only !== false) {
    failures.push(`deploy key ${RELEASE_DEPLOY_KEY_TITLE} must allow write access`);
  }

  return { deployKey, failures, secret };
}

function parseArgs(argv) {
  const args = { repo: "TokenBrice/pharosville" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--repo" && argv[index + 1]) {
      args.repo = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(args.repo)) throw new Error(`Invalid repository: ${args.repo}`);
  return args;
}

function ghApiJson(endpoint) {
  return JSON.parse(execFileSync("gh", ["api", endpoint], { encoding: "utf8" }));
}

function main() {
  const { repo } = parseArgs(process.argv.slice(2));
  const secretPayload = ghApiJson(`/repos/${repo}/actions/secrets?per_page=100`);
  const deployKeys = ghApiJson(`/repos/${repo}/keys?per_page=100`);
  const result = validateReleaseCredentialState({
    deployKeys,
    secrets: secretPayload.secrets,
  });

  console.log(`Release credential check for ${repo}`);
  console.log(`- Actions secret: ${result.secret?.name ?? "<missing>"}`);
  console.log(
    `- Deploy key: ${result.deployKey?.title ?? "<missing>"}`
      + (result.deployKey ? ` (${result.deployKey.read_only ? "read-only" : "write"})` : ""),
  );

  if (result.failures.length > 0) {
    console.error("\nFAIL: release tag credentials are incomplete.");
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log("\nPASS: release tag credential names and access are configured.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
