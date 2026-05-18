#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

function parseByteExpression(expression) {
  const product = expression.match(/([\d_]+)\s*\*\s*1024/);
  if (product) return normalizeNumber(product[1]) * 1024;
  return normalizeNumber(expression);
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
  const smokeSource = readText(repoRoot, "shared/lib/pharosville-smoke-matrix.ts");
  return {
    allowlist: parseQuotedArray(
      smokeSource,
      /PHAROSVILLE_SMOKE_ALLOWLIST_ENDPOINTS\s*=\s*\[([\s\S]*?)]\s*as const/,
      "API smoke allowlist",
    ),
  };
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

function parseAssetBudgetFacts(repoRoot) {
  const source = readText(repoRoot, "scripts/pharosville/validate-assets.mjs");
  return {
    firstRender: parseBudgetObject(source, "firstRenderBudgets"),
    manifestMaxCount: normalizeNumber(matchRequired(source, /const maxManifestAssets\s*=\s*([\d_]+)/, "max manifest assets")[1]),
    shellCritical: parseBudgetObject(source, "shellCriticalBudgets"),
    totalAssets: parseBudgetObject(source, "totalAssetBudgets"),
  };
}

function parseBudgetObject(source, objectName) {
  const block = matchRequired(
    source,
    new RegExp(`const ${objectName}\\s*=\\s*{([\\s\\S]*?)};`),
    objectName,
  )[1];
  const maxCount = block.match(/maxCount:\s*([^,\n]+)/)?.[1];
  const maxBytes = block.match(/maxBytes:\s*([^,\n]+)/)?.[1];
  const maxDecodedPixels = block.match(/maxDecodedPixels:\s*([^,\n]+)/)?.[1];
  return {
    maxBytes: maxBytes ? parseByteExpression(maxBytes) : null,
    maxCount: maxCount ? normalizeNumber(maxCount) : null,
    maxDecodedPixels: maxDecodedPixels ? normalizeNumber(maxDecodedPixels) : null,
  };
}

function parseBundleFacts(repoRoot) {
  const source = readText(repoRoot, "scripts/check-bundle-size.mjs");
  return {
    chunks: ["entry", "desktop", "css"].map((key) => parseBundleChunkBudget(source, key)),
    totalJs: {
      maxGzipBytes: parseByteExpression(matchRequired(source, /maxJsGzipBytes:\s*([^,\n]+)/, "total JS gzip budget")[1]),
      maxRawBytes: parseByteExpression(matchRequired(source, /maxJsRawBytes:\s*([^,\n]+)/, "total JS raw budget")[1]),
    },
  };
}

function parseBundleChunkBudget(source, key) {
  const block = matchRequired(source, new RegExp(`${key}:\\s*{([\\s\\S]*?)\\n\\s*},`), `${key} bundle budget`)[1];
  return {
    key,
    label: matchRequired(block, /label:\s*"([^"]+)"/, `${key} bundle label`)[1],
    maxGzipBytes: parseByteExpression(matchRequired(block, /maxGzipBytes:\s*([^,\n]+)/, `${key} gzip budget`)[1]),
    maxRawBytes: parseByteExpression(matchRequired(block, /maxRawBytes:\s*([^,\n]+)/, `${key} raw budget`)[1]),
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
  const deployJobsBlock = matchRequired(deploySource, /\njobs:\n([\s\S]*)/, "deploy workflow jobs")[1];
  return {
    canaryCron: matchRequired(canarySource, /cron:\s*"([^"]+)"/, "canary cron")[1],
    deployJobs: [...deployJobsBlock.matchAll(/^\s{2}([A-Za-z0-9_-]+):/gm)].map((match) => match[1]),
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
  const assetBudgets = parseAssetBudgetFacts(repoRoot);
  const bundle = parseBundleFacts(repoRoot);
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
    "- Runtime asset namespace: `/pharosville/assets/`",
    `- Latest app version: \`${release.latestVersion}\` (\`${release.latestKey}\`)`,
    `- Latest changelog entry: \`${release.changelog.id}\` / \`${release.changelog.version}\` / ${release.changelog.date} / ${release.changelog.title}`,
    "",
    "## Viewport Gate",
    "",
    `- Long side minimum: \`${viewport.longSide}px\``,
    `- Short side minimum: \`${viewport.shortSide}px\``,
    "- World runtime mounts only after the screen-size gate passes and the current viewport is landscape.",
    "- `index.html` has a matching runtime-manifest preload media query checked by `npm run check:viewport-gate`.",
    "",
    "## API Allowlist",
    "",
    ...api.allowlist.map((path) => `- \`${path}\``),
    "",
    "## Asset Manifest",
    "",
    `- Schema version: \`${manifest.schemaVersion}\``,
    `- Cache version: \`${manifest.cacheVersion}\``,
    `- Style anchor: \`${manifest.styleAnchorVersion}\``,
    `- Manifest entries: \`${manifest.assetCount}\``,
    `- Required for first render: \`${manifest.firstRenderCount}\``,
    `- Categories: ${renderCounts(manifest.categoryCounts)}`,
    `- Load priorities: ${renderCounts(manifest.priorityCounts)}`,
    `- Phases: ${renderCounts(manifest.phaseCounts)}`,
    `- Optional WebP twins: \`${manifest.webpPathCount}\` static paths, \`${manifest.webpFrameSourceCount}\` animation frame sources`,
    "",
    "## Asset Budgets",
    "",
    `- Runtime manifest: count <= ${assetBudgets.manifestMaxCount}, ${renderBudget(assetBudgets.totalAssets)}`,
    `- First render: ${renderBudget(assetBudgets.firstRender)}`,
    `- Shell-critical: ${renderBudget(assetBudgets.shellCritical)}`,
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
      ["Stablecoin ID", "Asset ID", "Scale"],
      titans.map((titan) => [`\`${titan.id}\``, `\`${titan.assetId}\``, titan.scale == null ? "" : `\`${titan.scale}\``]),
    ),
    "",
    "## Heritage Hulls",
    "",
    table(
      ["Stablecoin ID", "Asset ID", "Scale"],
      heritage.map((ship) => [`\`${ship.id}\``, `\`${ship.spriteAssetId}\``, `\`${ship.scale}\``]),
    ),
    "",
    "## Dock Rules",
    "",
    `- Standard chain harbor cap: \`${docks.maxChainHarbors}\``,
    `- Preferred chain IDs: ${docks.preferredChainIds.map((id) => `\`${id}\``).join(", ")}`,
    `- Suppressed rendered harbor IDs: ${docks.suppressedChainIds.map((id) => `\`${id}\``).join(", ")}`,
    `- Detached dispatch wharf chain IDs: ${docks.pigeonnierChainIds.map((id) => `\`${id}\``).join(", ")}`,
    `- Dock asset IDs: ${docks.assetIds.map((id) => `\`${id}\``).join(", ")}`,
    "",
    "## Workflow Gates",
    "",
    `- Deploy workflow jobs: ${workflows.deployJobs.map((job) => `\`${job}\``).join(", ")}`,
    `- Canary smoke cron: \`${workflows.canaryCron}\``,
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
