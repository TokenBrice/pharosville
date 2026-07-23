#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { aggregateBudgets, bundleBudgets } from "../bundle-budgets.mjs";
import {
  firstRenderBudgets,
  maxManifestAssets,
  shellCriticalBudgets,
  totalAssetBudgets,
} from "./asset-budgets.mjs";

const OUTPUT_PATH = "docs/pharosville/RUNTIME_FACTS.md";

function readText(repoRoot, path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function readJson(repoRoot, path) {
  return JSON.parse(readText(repoRoot, path));
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

function parseManifestFacts(repoRoot) {
  const manifest = readJson(repoRoot, "public/pharosville/assets/manifest.json");
  const categoryCounts = countBy(manifest.assets, (asset) => asset.category);
  const priorityCounts = countBy(manifest.assets, (asset) => asset.loadPriority);
  const phaseCounts = countBy(manifest.assets, (asset) => {
    if (asset.phase) return asset.phase;
    return asset.loadPriority === "critical" ? "visibleCritical" : "deferred";
  });
  return {
    assetCount: manifest.assets.length,
    categoryCounts,
    cacheVersion: manifest.style?.cacheVersion ?? "",
    firstRenderCount: manifest.requiredForFirstRender?.length ?? 0,
    phaseCounts,
    priorityCounts,
    schemaVersion: manifest.schemaVersion,
    styleAnchorVersion: manifest.style?.styleAnchorVersion ?? "",
    webpFrameSourceCount: manifest.assets.filter((asset) => asset.animation?.webpFrameSource).length,
    webpPathCount: manifest.assets.filter((asset) => asset.webpPath).length,
  };
}

function parseAssetBudgetFacts() {
  return {
    firstRender: firstRenderBudgets,
    manifestMaxCount: maxManifestAssets,
    shellCritical: shellCriticalBudgets,
    totalAssets: totalAssetBudgets,
  };
}

function parseBundleFacts() {
  return {
    chunks: ["entry", "desktop", "world", "renderer", "css"].map((key) => {
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

function parseGardenModelFacts(repoRoot) {
  const source = readText(repoRoot, "src/three/garden-models.ts");
  const manifestBlock = matchRequired(
    source,
    /GARDEN_MODEL_MANIFEST\s*=\s*{([\s\S]*?)}\s*as const satisfies/,
    "garden model manifest",
  )[1];
  return {
    bytes: normalizeNumber(matchRequired(
      manifestBlock,
      /artifact:\s*{[\s\S]*?bytes:\s*([\d_]+)/,
      "garden model bytes",
    )[1]),
    compression: matchRequired(
      manifestBlock,
      /compression:\s*"([^"]+)"/,
      "garden model compression",
    )[1],
    drawCalls: normalizeNumber(matchRequired(
      manifestBlock,
      /geometry:\s*{[\s\S]*?drawCalls:\s*([\d_]+)/,
      "garden model draw calls",
    )[1]),
    id: matchRequired(
      manifestBlock,
      /"([^"]+)":\s*{\s*id:\s*"[^"]+"/,
      "garden model id",
    )[1],
    sha256: matchRequired(
      source,
      /LIGHTHOUSE_SHA256\s*=\s*"([a-f0-9]{64})"/,
      "garden model SHA-256",
    )[1],
    textures: normalizeNumber(matchRequired(
      manifestBlock,
      /geometry:\s*{[\s\S]*?textures:\s*([\d_]+)/,
      "garden model textures",
    )[1]),
    triangles: normalizeNumber(matchRequired(
      manifestBlock,
      /geometry:\s*{[\s\S]*?triangles:\s*([\d_]+)/,
      "garden model triangles",
    )[1]),
    url: matchRequired(
      source,
      /const lighthouseUrl\s*=\s*`([^?`]+)\?v=/,
      "garden model URL",
    )[1],
    vertices: normalizeNumber(matchRequired(
      manifestBlock,
      /geometry:\s*{[\s\S]*?vertices:\s*([\d_]+)/,
      "garden model vertices",
    )[1]),
  };
}

function parseSquadFacts(repoRoot) {
  const source = readText(repoRoot, "src/systems/maker-squad.ts");
  return [...source.matchAll(/export const ([A-Z_]+_SQUAD): StablecoinSquad = {([\s\S]*?)\n};/g)].map((match) => {
    const block = match[2];
    return {
      exportName: match[1],
      flagshipId: matchRequired(block, /flagshipId:\s*"([^"]+)"/, `${match[1]} flagship`)[1],
      id: matchRequired(block, /id:\s*"([^"]+)"/, `${match[1]} id`)[1],
      label: matchRequired(block, /label:\s*"([^"]+)"/, `${match[1]} label`)[1],
      memberIds: parseQuotedArray(block, /memberIds:\s*\[([\s\S]*?)]/, `${match[1]} members`),
    };
  });
}

function parseTitanFacts(repoRoot) {
  const source = readText(repoRoot, "src/systems/ship-visuals.ts");
  const registryMatch = source.match(/TITAN_SHIPS:[\s\S]*?=\s*{([\s\S]*?)};/);
  if (registryMatch) {
    return [...registryMatch[1].matchAll(/"([^"]+)":\s*{\s*spriteAssetId:\s*"([^"]+)"\s*,\s*scale:\s*([\d.]+)/g)]
      .map((match) => ({ assetId: match[2], id: match[1], scale: Number(match[3]) }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  const assetBlock = matchRequired(source, /TITAN_SHIP_ASSET_IDS:[\s\S]*?=\s*{([\s\S]*?)};/, "titan asset IDs")[1];
  const scaleBlock = matchRequired(source, /TITAN_SHIP_SCALES:[\s\S]*?=\s*{([\s\S]*?)};/, "titan scales")[1];
  const scales = Object.fromEntries(
    [...scaleBlock.matchAll(/"([^"]+)":\s*([\d.]+)/g)].map((match) => [match[1], Number(match[2])]),
  );
  return [...assetBlock.matchAll(/"([^"]+)":\s*"([^"]+)"/g)]
    .map((match) => ({ assetId: match[2], id: match[1], scale: scales[match[1]] ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function parseHeritageFacts(repoRoot) {
  const source = readText(repoRoot, "src/systems/unique-ships.ts");
  const block = matchRequired(source, /UNIQUE_SHIP_DEFINITIONS\s*=\s*{([\s\S]*?)}\s*as const/, "heritage definitions")[1];
  return [...block.matchAll(/"([^"]+)":\s*{\s*spriteAssetId:\s*"([^"]+)"[\s\S]*?scale:\s*([\d.]+)\s*}/g)]
    .map((match) => ({ id: match[1], spriteAssetId: match[2], scale: Number(match[3]) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function parseDockFacts(repoRoot) {
  const dockSource = readText(repoRoot, "src/systems/chain-docks.ts");
  const layoutSource = readText(repoRoot, "src/systems/world-layout.ts");
  const preferredBlock = matchRequired(layoutSource, /PREFERRED_DOCK_TILES:[\s\S]*?=\s*{([\s\S]*?)};/, "preferred dock tiles")[1];
  return {
    assetIds: parseQuotedArray(dockSource, /_DOCK_ASSET_IDS\s*=\s*\[([\s\S]*?)]\s*as const/, "dock asset IDs"),
    maxChainHarbors: normalizeNumber(matchRequired(dockSource, /MAX_CHAIN_HARBORS\s*=\s*([\d_]+)/, "max chain harbors")[1]),
    pigeonnierChainIds: parseQuotedArray(layoutSource, /PIGEONNIER_HARBOR_CHAIN_IDS\s*=\s*\[([\s\S]*?)]\s*as const/, "pigeonnier chain IDs"),
    preferredChainIds: [...preferredBlock.matchAll(/^\s*([A-Za-z0-9_-]+):/gm)].map((match) => match[1]),
    suppressedChainIds: parseQuotedArray(dockSource, /SUPPRESSED_CHAIN_HARBOR_IDS\s*=\s*new Set<string>\(\[([\s\S]*?)]\)/, "suppressed chain IDs"),
  };
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

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item) ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function renderCounts(counts) {
  return Object.entries(counts)
    .map(([key, count]) => `${key}: ${count}`)
    .join(", ");
}

function renderBudget(budget) {
  const parts = [];
  if (budget.maxCount != null) parts.push(`count <= ${budget.maxCount}`);
  if (budget.maxBytes != null) parts.push(`bytes <= ${formatBytes(budget.maxBytes)}`);
  if (budget.maxDecodedPixels != null) parts.push(`decoded pixels <= ${budget.maxDecodedPixels.toLocaleString("en-US")}`);
  return parts.join(", ");
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

export function buildRuntimeFactsMarkdown({ repoRoot = process.cwd() } = {}) {
  const release = parseReleaseFacts(repoRoot);
  const viewport = parseViewportFacts(repoRoot);
  const api = parseApiFacts(repoRoot);
  const manifest = parseManifestFacts(repoRoot);
  const assetBudgets = parseAssetBudgetFacts();
  const bundle = parseBundleFacts();
  const gardenModel = parseGardenModelFacts(repoRoot);
  const squads = parseSquadFacts(repoRoot);
  const titans = parseTitanFacts(repoRoot);
  const heritage = parseHeritageFacts(repoRoot);
  const docks = parseDockFacts(repoRoot);
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
    "- Renderer: one production Three.js/WebGL renderer",
    "- GPU or renderer failure fallback: interactive DOM signal overview; no alternate 2D renderer",
    "- Runtime model namespace: `/pharosville/models/`",
    `- Latest app version: \`${release.latestVersion}\` (\`${release.latestKey}\`)`,
    `- Latest changelog entry: \`${release.changelog.id}\` / \`${release.changelog.version}\` / ${release.changelog.date} / ${release.changelog.title}`,
    "",
    "## Viewport Gate",
    "",
    `- Long side minimum: \`${viewport.longSide}px\``,
    `- Short side minimum: \`${viewport.shortSide}px\``,
    "- World runtime mounts only after the screen-size gate passes and the current viewport is landscape.",
    "- `src/client.tsx` lazy-loads the desktop data and Three.js runtime only after that gate; `npm run check:viewport-gate` guards the boundary.",
    "",
    "## API Allowlist",
    "",
    ...api.allowlist.map((path) => `- \`${path}\``),
    "",
    "## Runtime Media",
    "",
    "- `useAssetLoadingPipeline` loads same-origin stablecoin logo images only.",
    "- Ship, dock, island, cemetery, ambient-life, and water visuals are renderer-owned procedural geometry/materials.",
    `- Lighthouse model: \`${gardenModel.id}\` at \`${gardenModel.url}\``,
    `- Lighthouse GLB: ${formatBytes(gardenModel.bytes)}, SHA-256 \`${gardenModel.sha256}\`, compression \`${gardenModel.compression}\``,
    `- Lighthouse geometry: ${gardenModel.drawCalls} draw calls, ${gardenModel.triangles.toLocaleString("en-US")} triangles, ${gardenModel.vertices.toLocaleString("en-US")} vertices, ${gardenModel.textures} textures`,
    "- The procedural lighthouse shell remains the in-scene fallback if its GLB cannot load.",
    "",
    "## Archived Raster Inventory",
    "",
    "- `public/pharosville/assets/manifest.json` is retained for source history and validation; browser runtime does not load it.",
    `- Schema version: \`${manifest.schemaVersion}\`; cache version: \`${manifest.cacheVersion}\`; style anchor: \`${manifest.styleAnchorVersion}\``,
    `- Entries: \`${manifest.assetCount}\`; prior first-render set: \`${manifest.firstRenderCount}\``,
    `- Categories: ${renderCounts(manifest.categoryCounts)}`,
    `- Optional WebP twins: \`${manifest.webpPathCount}\` static paths, \`${manifest.webpFrameSourceCount}\` animation frame sources`,
    "",
    "## Asset Budgets",
    "",
    "- These budgets guard the archived raster authoring inventory; they are not runtime boot budgets.",
    `- Authoring inventory: count <= ${assetBudgets.manifestMaxCount}, ${renderBudget(assetBudgets.totalAssets)}`,
    `- Prior first-render classification: ${renderBudget(assetBudgets.firstRender)}`,
    `- Prior shell-critical classification: ${renderBudget(assetBudgets.shellCritical)}`,
    "",
    "## Bundle Budgets",
    "",
    ...bundle.chunks.map((chunk) => `- ${chunk.label}: raw <= ${formatBytes(chunk.maxRawBytes)}, gzip <= ${formatBytes(chunk.maxGzipBytes)}`),
    `- Total JS: raw <= ${formatBytes(bundle.totalJs.maxRawBytes)}, gzip <= ${formatBytes(bundle.totalJs.maxGzipBytes)}`,
    "",
    "## Squads",
    "",
    table(
      ["Squad", "Flagship", "Members"],
      squads.map((squad) => [squad.label, `\`${squad.flagshipId}\``, squad.memberIds.map((id) => `\`${id}\``).join(", ")]),
    ),
    "",
    "## Titan Ships",
    "",
    table(
      ["Stablecoin ID", "Scale"],
      titans.map((titan) => [`\`${titan.id}\``, titan.scale == null ? "" : `\`${titan.scale}\``]),
    ),
    "",
    "## Heritage Hulls",
    "",
    table(
      ["Stablecoin ID", "Scale"],
      heritage.map((ship) => [`\`${ship.id}\``, `\`${ship.scale}\``]),
    ),
    "",
    "## Dock Rules",
    "",
    `- Standard chain harbor cap: \`${docks.maxChainHarbors}\``,
    `- Preferred chain IDs: ${docks.preferredChainIds.map((id) => `\`${id}\``).join(", ")}`,
    `- Suppressed rendered harbor IDs: ${docks.suppressedChainIds.map((id) => `\`${id}\``).join(", ")}`,
    `- Detached dispatch wharf chain IDs: ${docks.pigeonnierChainIds.map((id) => `\`${id}\``).join(", ")}`,
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
