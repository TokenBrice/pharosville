#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SEMVER_TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;
const CHANGELOG_HEADING_PATTERN = /^## (v\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2}) - (.+)$/gm;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    stderr: result.stderr?.trim() ?? "",
    stdout: result.stdout?.trim() ?? "",
  };
}

export function parseChangelogReleases(source) {
  const matches = [...source.matchAll(CHANGELOG_HEADING_PATTERN)];
  return matches.map((match, index) => {
    const sectionStart = (match.index ?? 0) + match[0].length;
    const sectionEnd = matches[index + 1]?.index ?? source.length;
    return {
      date: match[2],
      notes: source.slice(sectionStart, sectionEnd).trim(),
      title: match[3].trim(),
      version: match[1],
    };
  });
}

export function parseVersionRegistry(source) {
  const versionsBlock = source.match(/PHAROSVILLE_RELEASE_VERSIONS\s*=\s*{([\s\S]*?)}\s*as const/);
  if (!versionsBlock) throw new Error("Could not parse PHAROSVILLE_RELEASE_VERSIONS.");

  const versions = Object.fromEntries(
    [...versionsBlock[1].matchAll(/([A-Za-z0-9_]+):\s*"(v\d+\.\d+\.\d+)"/g)]
      .map((match) => [match[1], match[2]]),
  );
  const latestMatch = source.match(
    /PHAROSVILLE_LATEST_VERSION\s*=\s*PHAROSVILLE_RELEASE_VERSIONS\.([A-Za-z0-9_]+)/,
  );
  if (!latestMatch) throw new Error("Could not parse PHAROSVILLE_LATEST_VERSION.");
  if (!versions[latestMatch[1]]) {
    throw new Error(`PHAROSVILLE_LATEST_VERSION references unknown key ${latestMatch[1]}.`);
  }

  return {
    latestKey: latestMatch[1],
    latestVersion: versions[latestMatch[1]],
    versions,
  };
}

function compareSemverDescending(left, right) {
  const leftParts = left.match(SEMVER_TAG_PATTERN)?.slice(1).map(Number);
  const rightParts = right.match(SEMVER_TAG_PATTERN)?.slice(1).map(Number);
  if (!leftParts || !rightParts) return 0;
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return rightParts[index] - leftParts[index];
  }
  return 0;
}

export function validateReleaseContract({ changelogSource, versionSource }) {
  const errors = [];
  const releases = parseChangelogReleases(changelogSource);
  const registry = parseVersionRegistry(versionSource);
  const changelogVersions = releases.map((release) => release.version);
  const registryVersions = Object.values(registry.versions);

  if (releases.length === 0) errors.push("CHANGELOG.md has no semantic release entries.");
  if (new Set(changelogVersions).size !== changelogVersions.length) {
    errors.push("CHANGELOG.md contains duplicate release versions.");
  }
  if (new Set(registryVersions).size !== registryVersions.length) {
    errors.push("PHAROSVILLE_RELEASE_VERSIONS contains duplicate versions.");
  }

  const sortedVersions = [...changelogVersions].sort(compareSemverDescending);
  if (sortedVersions.some((version, index) => version !== changelogVersions[index])) {
    errors.push("CHANGELOG.md release entries must be ordered newest semantic version first.");
  }
  for (let index = 1; index < releases.length; index += 1) {
    if (releases[index].date > releases[index - 1].date) {
      errors.push("CHANGELOG.md release dates must be ordered newest first.");
      break;
    }
  }

  const missingFromRegistry = changelogVersions.filter((version) => !registryVersions.includes(version));
  const missingFromChangelog = registryVersions.filter((version) => !changelogVersions.includes(version));
  if (missingFromRegistry.length > 0) {
    errors.push(`CHANGELOG.md versions missing from the version registry: ${missingFromRegistry.join(", ")}.`);
  }
  if (missingFromChangelog.length > 0) {
    errors.push(`Version registry entries missing from CHANGELOG.md: ${missingFromChangelog.join(", ")}.`);
  }
  if (releases[0] && registry.latestVersion !== releases[0].version) {
    errors.push(
      `PHAROSVILLE_LATEST_VERSION is ${registry.latestVersion}, but the newest changelog entry is ${releases[0].version}.`,
    );
  }

  return { errors, registry, releases };
}

export function compareGithubReleaseState({ releases, githubReleases, gitTags }) {
  const expectedByTag = new Map(releases.map((release) => [release.version, release]));
  const published = githubReleases.filter((release) => !release.isDraft);
  const publishedTags = new Set(published.map((release) => release.tagName));
  const gitTagSet = new Set(gitTags.filter((tag) => SEMVER_TAG_PATTERN.test(tag)));
  const errors = [];

  for (const release of releases) {
    if (!gitTagSet.has(release.version)) errors.push(`Missing Git tag: ${release.version}.`);
    if (!publishedTags.has(release.version)) errors.push(`Missing published GitHub Release: ${release.version}.`);

    const githubRelease = published.find((candidate) => candidate.tagName === release.version);
    if (githubRelease && githubRelease.name !== `${release.version} - ${release.title}`) {
      errors.push(
        `GitHub Release ${release.version} is named "${githubRelease.name}", expected "${release.version} - ${release.title}".`,
      );
    }
  }

  for (const tag of gitTagSet) {
    if (!expectedByTag.has(tag)) errors.push(`Semantic Git tag missing from CHANGELOG.md: ${tag}.`);
  }
  for (const release of published) {
    if (SEMVER_TAG_PATTERN.test(release.tagName) && !expectedByTag.has(release.tagName)) {
      errors.push(`Published semantic GitHub Release missing from CHANGELOG.md: ${release.tagName}.`);
    }
  }
  for (const release of githubReleases.filter((candidate) => candidate.isDraft)) {
    if (SEMVER_TAG_PATTERN.test(release.tagName)) {
      errors.push(`Semantic GitHub Release is still a draft: ${release.tagName}.`);
    }
  }

  return errors;
}

function readContractSources(repoRoot) {
  return {
    changelogSource: readFileSync(resolve(repoRoot, "CHANGELOG.md"), "utf8"),
    versionSource: readFileSync(resolve(repoRoot, "src/content/pharosville-version.ts"), "utf8"),
  };
}

function assertValidContract(sources) {
  const contract = validateReleaseContract(sources);
  if (contract.errors.length > 0) {
    throw new Error(`Release contract validation failed:\n- ${contract.errors.join("\n- ")}`);
  }
  return contract;
}

function readFileAtCommit(targetSha, path, cwd) {
  return run("git", ["show", `${targetSha}:${path}`], { cwd });
}

function resolveTarget(target, cwd) {
  return run("git", ["rev-parse", "--verify", `${target}^{commit}`], { cwd });
}

function assertTargetOnMain(targetSha, cwd) {
  const result = tryRun("git", ["merge-base", "--is-ancestor", targetSha, "origin/main"], { cwd });
  if (!result.ok) throw new Error(`Release target ${targetSha} is not an ancestor of origin/main.`);
}

function existingTagTarget(tag, cwd) {
  const result = tryRun("git", ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`], { cwd });
  return result.ok ? result.stdout : null;
}

function writeGithubOutput(path, values) {
  if (!path) return;
  for (const [key, value] of Object.entries(values)) {
    appendFileSync(path, `${key}=${value}\n`);
  }
}

function prepareRelease({ cwd, githubOutput, historical, notesFile, tag, target }) {
  if (tag && !SEMVER_TAG_PATTERN.test(tag)) throw new Error(`Invalid semantic release tag: ${tag}`);
  if (!target) throw new Error("--target is required.");
  if (!notesFile) throw new Error("--notes-file is required.");

  const targetSha = resolveTarget(target, cwd);
  assertTargetOnMain(targetSha, cwd);

  let sources;
  if (historical) {
    sources = readContractSources(cwd);
  } else {
    sources = {
      changelogSource: readFileAtCommit(targetSha, "CHANGELOG.md", cwd),
      versionSource: readFileAtCommit(targetSha, "src/content/pharosville-version.ts", cwd),
    };
  }
  const contract = assertValidContract(sources);
  const releaseTag = tag || contract.registry.latestVersion;
  const release = contract.releases.find((candidate) => candidate.version === releaseTag);
  if (!release) throw new Error(`No CHANGELOG.md release entry exists for ${releaseTag}.`);
  if (!historical && releaseTag !== contract.registry.latestVersion) {
    throw new Error(
      `${releaseTag} is not the target commit's latest version (${contract.registry.latestVersion}); use historical-backfill only for old releases.`,
    );
  }

  const tagTarget = existingTagTarget(releaseTag, cwd);
  const tagMatchesTarget = !tagTarget || tagTarget === targetSha;
  if (historical && !tagMatchesTarget) {
    throw new Error(`Existing tag ${releaseTag} points to ${tagTarget}, expected ${targetSha}.`);
  }

  const provenance = historical
    ? [
        "> Historical backfill: this version predates the automated GitHub Release workflow.",
        `> The tag points to the documented release boundary commit \`${targetSha.slice(0, 12)}\`.`,
        "",
        "",
      ].join("\n")
    : "";
  writeFileSync(notesFile, `${provenance}${release.notes}\n`);

  const values = {
    historical: historical ? "true" : "false",
    tag: releaseTag,
    tag_exists: tagTarget ? "true" : "false",
    tag_matches_target: tagMatchesTarget ? "true" : "false",
    target_sha: targetSha,
    title: `${releaseTag} - ${release.title}`,
  };
  writeGithubOutput(githubOutput, values);
  return values;
}

function checkLocalContract(cwd) {
  const contract = assertValidContract(readContractSources(cwd));
  console.log(`Release contract is aligned across ${contract.releases.length} changelog entries.`);
  console.log(`Latest release declaration: ${contract.registry.latestVersion}.`);
}

function auditGithub({ cwd, repo }) {
  if (!repo) throw new Error("--repo owner/name is required for audit-github.");
  const contract = assertValidContract(readContractSources(cwd));
  const githubReleases = JSON.parse(
    run("gh", [
      "release",
      "list",
      "--repo",
      repo,
      "--limit",
      "100",
      "--json",
      "tagName,name,isDraft",
    ], { cwd }),
  );
  const gitTags = run("git", ["tag", "--list", "v*"], { cwd }).split(/\r?\n/).filter(Boolean);
  const errors = compareGithubReleaseState({
    releases: contract.releases,
    githubReleases,
    gitTags,
  });
  if (errors.length > 0) {
    throw new Error(`GitHub release audit failed:\n- ${errors.join("\n- ")}`);
  }
  console.log(`GitHub release audit passed for ${contract.releases.length} semantic releases in ${repo}.`);
}

function parseArgs(argv) {
  const [command = "check", ...rest] = argv;
  const options = {
    command,
    cwd: process.cwd(),
    githubOutput: "",
    historical: false,
    notesFile: "",
    repo: process.env.GITHUB_REPOSITORY ?? "",
    tag: "",
    target: "",
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--historical") {
      options.historical = true;
      continue;
    }
    if (["--cwd", "--github-output", "--notes-file", "--repo", "--tag", "--target"].includes(arg)) {
      const value = rest[index + 1];
      if (!value) throw new Error(`${arg} requires a value.`);
      options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.command === "check") return checkLocalContract(options.cwd);
  if (options.command === "prepare") return prepareRelease(options);
  if (options.command === "audit-github") return auditGithub(options);
  throw new Error(`Unknown command: ${options.command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
