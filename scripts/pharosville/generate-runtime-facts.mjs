#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { aggregateBudgets, bundleBudgets } from "../bundle-budgets.mjs";

const OUTPUT_PATH = "docs/pharosville/RUNTIME_FACTS.md";

function readText(repoRoot, path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function normalizeNumber(value) {
  return Number(String(value).replaceAll("_", ""));
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toLocaleString("en-US", { maximumFractionDigits: 0 })} KiB`;
}

function matchRequired(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) throw new Error(`Could not parse ${label}.`);
  return match;
}

function parseQuotedArray(source, pattern, label) {
  const block = matchRequired(source, pattern, label)[1];
  return [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function parseReleaseFacts(repoRoot) {
  const versionSource = readText(repoRoot, "src/content/pharosville-version.ts");
  const versionsBlock = matchRequired(
    versionSource,
    /PHAROSVILLE_RELEASE_VERSIONS\s*=\s*{([\s\S]*?)}\s*as const/,
    "release versions",
  )[1];
  const versions = Object.fromEntries(
    [...versionsBlock.matchAll(/([A-Za-z0-9_]+):\s*"([^"]+)"/g)].map((match) => [match[1], match[2]]),
  );
  const latestKey = matchRequired(
    versionSource,
    /PHAROSVILLE_LATEST_VERSION\s*=\s*PHAROSVILLE_RELEASE_VERSIONS\.([A-Za-z0-9_]+)/,
    "latest version key",
  )[1];

  const changelogSource = readText(repoRoot, "src/content/pharosville-changelog.ts");
  const latestEntry = matchRequired(
    changelogSource,
    /PHAROSVILLE_CHANGELOG:[\s\S]*?\[\s*{([\s\S]*?)\n\s*},/,
    "latest changelog entry",
  )[1];
  const changelogVersionKey = matchRequired(
    latestEntry,
    /version:\s*PHAROSVILLE_RELEASE_VERSIONS\.([A-Za-z0-9_]+)/,
    "latest changelog version key",
  )[1];

  return {
    changelog: {
      date: matchRequired(latestEntry, /date:\s*"([^"]+)"/, "latest changelog date")[1],
      id: matchRequired(latestEntry, /id:\s*"([^"]+)"/, "latest changelog id")[1],
      title: matchRequired(latestEntry, /title:\s*"([^"]+)"/, "latest changelog title")[1],
      version: versions[changelogVersionKey],
    },
    latestKey,
    latestVersion: versions[latestKey],
    versions,
  };
}

function parseViewportFacts(repoRoot) {
  const source = readText(repoRoot, "src/systems/viewport-gate.ts");
  return {
    longSide: normalizeNumber(matchRequired(source, /MIN_LONG_SIDE_PX\s*=\s*([\d_]+)/, "long-side gate")[1]),
    shortSide: normalizeNumber(matchRequired(source, /MIN_SHORT_SIDE_PX\s*=\s*([\d_]+)/, "short-side gate")[1]),
  };
}

function parseApiFacts(repoRoot) {
  const registrySource = readText(repoRoot, "shared/lib/pharosville-endpoint-registry.ts");
  const apiPathsSource = readText(repoRoot, "shared/lib/api-endpoints/paths.ts");
  const smokeMatrixSource = readText(repoRoot, "shared/lib/pharosville-smoke-matrix.ts");
  const pathExpressions = [...registrySource.matchAll(/path:\s*(API_PATHS\.[A-Za-z0-9_]+\([^)]*\))/g)]
    .map((match) => match[1]);
  if (pathExpressions.length === 0) throw new Error("Could not parse PharosVille endpoint registry paths.");
  const allowlist = pathExpressions.map((expression) => resolveApiPathExpression(apiPathsSource, expression));
  assertSameOrderedValues(
    "PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS",
    parseQuotedArray(
      smokeMatrixSource,
      /PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS\s*=\s*\[([\s\S]*?)]\s*as const/,
      "smoke allowlist endpoints",
    ),
    allowlist,
  );
  return {
    allowlist,
  };
}

function assertSameOrderedValues(label, actual, expected) {
  if (
    actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
  ) {
    return;
  }
  throw new Error(`${label} must match the PharosVille endpoint registry.`);
}

function resolveApiPathExpression(apiPathsSource, expression) {
  const match = expression.match(/^API_PATHS\.([A-Za-z0-9_]+)\((.*?)\)$/);
  if (!match) throw new Error(`Could not parse API path expression: ${expression}`);
  const [, method, args] = match;
  const basePath = resolveApiPathBase(apiPathsSource, method);
  if (method === "stabilityIndex" && args.trim() === "true") {
    return `${basePath}?detail=true`;
  }
  return basePath;
}

function resolveApiPathBase(apiPathsSource, method) {
  const pattern = new RegExp(`${method}:\\s*\\([^)]*\\)\\s*=>\\s*(?:"([^"]+)"|buildQueryPath\\("([^"]+)")`);
  const match = apiPathsSource.match(pattern);
  if (!match) throw new Error(`Could not resolve API_PATHS.${method} base path.`);
  return match[1] ?? match[2];
}

function parseBundleFacts() {
  return {
    chunks: Object.keys(bundleBudgets).map((key) => {
      const budget = bundleBudgets[key];
      return {
        key,
        label: budget.label,
        maxGzipBytes: budget.maxGzipBytes,
        maxRawBytes: budget.maxRawBytes,
      };
    }),
    totalJs: {
      maxGzipBytes: aggregateBudgets.maxJsGzipBytes,
      maxRawBytes: aggregateBudgets.maxJsRawBytes,
    },
  };
}

function parseHarbourFacts(repoRoot) {
  const systemsSource = readText(repoRoot, "src/harbour/systems.ts");
  const registry = matchRequired(systemsSource, /export const SYSTEMS[\s\S]*?=\s*\[([\s\S]*?)\];/, "harbour system registry")[1];
  const systems = [...registry.matchAll(/new\s+([A-Za-z0-9]+)\(/g)].map((match) => match[1]);
  if (systems.length === 0) throw new Error("Could not parse the Harbour system registry.");
  const glbs = [];
  for (const path of ["src/harbour/world/island-system.ts", "src/harbour/world/lighthouse-system.ts"]) {
    glbs.push(matchRequired(readText(repoRoot, path), /"(\/harbour\/[a-z0-9-]+\.glb)"/, `${path} GLB URL`)[1]);
  }
  return { glbs, systems };
}

function parseWorkflowFacts(repoRoot) {
  const canarySource = readText(repoRoot, ".github/workflows/canary-smoke.yml");
  const deploySource = readText(repoRoot, ".github/workflows/deploy-cloudflare.yml");
  const releaseSource = readText(repoRoot, ".github/workflows/release.yml");
  const deployJobsBlock = matchRequired(deploySource, /\njobs:\n([\s\S]*)/, "deploy workflow jobs")[1];
  return {
    canaryCron: matchRequired(canarySource, /cron:\s*"([^"]+)"/, "canary cron")[1],
    deployJobs: [...deployJobsBlock.matchAll(/^\s{2}([A-Za-z0-9_-]+):/gm)].map((match) => match[1]),
    releaseAuditCron: matchRequired(releaseSource, /cron:\s*"([^"]+)"/, "release audit cron")[1],
    releaseDeployDependency: matchRequired(
      releaseSource,
      /workflows:\s*\n\s*- ([^\n]+)/,
      "release deploy workflow dependency",
    )[1].trim(),
  };
}

export function buildRuntimeFactsMarkdown({ repoRoot = process.cwd() } = {}) {
  const release = parseReleaseFacts(repoRoot);
  const viewport = parseViewportFacts(repoRoot);
  const api = parseApiFacts(repoRoot);
  const bundle = parseBundleFacts();
  const harbour = parseHarbourFacts(repoRoot);
  const workflows = parseWorkflowFacts(repoRoot);

  return `${[
    "# PharosVille Runtime Facts",
    "",
    "Generated from repository source. Do not edit by hand.",
    "",
    "Regenerate with `npm run docs:runtime-facts`; verify with `npm run check:runtime-facts`.",
    "",
    "## App And Routes",
    "",
    "- Canonical app URL: `https://pharosville.pharos.watch/`",
    "- World: The Harbour, one three.js WebGL2 Engine (`src/harbour/engine/`) mounted by `src/harbour/app/harbour-app.tsx`",
    "- Renderer failure fallback: the first-paint poster stays up with the arrival guide and Pharos links; no alternate renderer",
    "- Runtime media namespace: `/harbour/`",
    `- Latest app version: \`${release.latestVersion}\` (\`${release.latestKey}\`)`,
    `- Latest changelog entry: \`${release.changelog.id}\` / \`${release.changelog.version}\` / ${release.changelog.date} / ${release.changelog.title}`,
    "",
    "## Viewport Gate",
    "",
    `- Size profile: \`${viewport.longSide}×${viewport.shortSide}px\` (long side × short side)`,
    "- Device capability and current-viewport readiness independently sort their own dimensions and must satisfy that profile. It admits desktop and laptop windows, unfolded foldables and tablets either way up; phones and folded foldables get the welcome page.",
    "- Orientation and aspect ratio are not gates: an 832×680 unfolded foldable, a 744×1133 portrait tablet, a 1200×640 laptop viewport, and a 2560×720 ultrawide viewport all pass.",
    "- `src/client.tsx` lazy-loads the Harbour chunk (`src/harbour/app/harbour-app.tsx`: Engine, systems, data feed) only after that gate; `npm run check:viewport-gate` guards the boundary.",
    "",
    "## API Allowlist",
    "",
    ...api.allowlist.map((path) => `- \`${path}\``),
    "",
    "## Runtime Media",
    "",
    "- Stablecoin emblems: one atlas, `/harbour/emblems.avif` (`/harbour/emblems.webp` when AVIF fails) + `/harbour/emblems.json`; panel and search medallions load same-origin `/logos/` and `/chains/` marks.",
    "- Chain crests: one atlas, `/harbour/crests.webp` (lossless) + `/harbour/crests.json`, decoded once for the office crests and the movers' flags.",
    ...harbour.glbs.map((url) => `- Static world GLB: \`${url}\``),
    "- Boat hull kit: `/harbour/kit/manifest.json` and its GLBs; sea mask: `/harbour/sea-sdf.webp` (lossless); shipped GLBs are fetched as pre-gzipped `.glb.gz`.",
    "- First paint: `/harbour/poster-{960,1600}.{avif,webp}` (an illustration, no live numbers), crossfaded into the first live frame.",
    "",
    "## World Systems",
    "",
    `- Registration (= update) order: ${harbour.systems.map((name) => `\`${name}\``).join(" → ")}`,
    "",
    "## Bundle Budgets",
    "",
    ...bundle.chunks.map((chunk) => `- ${chunk.label}: raw <= ${formatBytes(chunk.maxRawBytes)}, gzip <= ${formatBytes(chunk.maxGzipBytes)}`),
    `- Total JS: raw <= ${formatBytes(bundle.totalJs.maxRawBytes)}, gzip <= ${formatBytes(bundle.totalJs.maxGzipBytes)}`,
    "",
    "## Workflow Gates",
    "",
    `- Deploy workflow jobs: ${workflows.deployJobs.map((job) => `\`${job}\``).join(", ")}`,
    `- Canary smoke cron: \`${workflows.canaryCron}\``,
    `- GitHub Release publication follows successful \`${workflows.releaseDeployDependency}\` runs on \`main\``,
    `- GitHub Release audit cron: \`${workflows.releaseAuditCron}\``,
    "",
  ].join("\n")}\n`;
}

function main() {
  const check = process.argv.includes("--check");
  const repoRoot = process.cwd();
  const outputPath = resolve(repoRoot, OUTPUT_PATH);
  const next = buildRuntimeFactsMarkdown({ repoRoot });

  if (check) {
    const current = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "";
    if (current !== next) {
      console.error(`${OUTPUT_PATH} is out of date. Run npm run docs:runtime-facts.`);
      process.exit(1);
    }
    console.log(`${OUTPUT_PATH} is up to date.`);
    return;
  }

  writeFileSync(outputPath, next);
  console.log(`Wrote ${OUTPUT_PATH}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
