#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, normalize, relative, resolve, sep } from "node:path";

const repoRoot = process.cwd();
const publicRoot = resolve(repoRoot, "public");
const assetRoot = resolve(repoRoot, "public/pharosville/assets");
const manifestPath = join(assetRoot, "manifest.json");
const chainMetaPath = resolve(repoRoot, "shared/lib/chains.ts");
const stablecoinLogosPath = resolve(repoRoot, "data/logos.json");
const deadStablecoinsPath = resolve(repoRoot, "shared/data/dead-stablecoins.json");
const pharosVilleSrcRoot = resolve(repoRoot, "src");
const forbiddenPattern = /(Bearer|PIXELLAB|NEXT_PUBLIC_PIXELLAB|pixellab\.ai|https?:\/\/)/i;
const placeholderPattern = /(placeholder|checker|debug|sample)/i;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const allowedCategories = new Set(["terrain", "landmark", "dock", "ship", "prop", "overlay"]);
const allowedPriorities = new Set(["critical", "deferred"]);
const hexColorPattern = /^#[0-9a-f]{6}$/i;
const assetIdPattern = /^(building|dock|landmark|overlay|prop|ship|terrain)\.[a-z0-9-]+$/;
const pharosVilleSourceExtensionPattern = /\.(?:ts|tsx)$/;
const pharosVilleTestFilePattern = /(?:^|\/)(?:__tests__|tests?)\/|\.test\.(?:ts|tsx)$/;
const publicImageExtensionPattern = /\.(?:png|svg|jpe?g|webp)$/i;
const maxManifestAssets = 35;
const firstRenderBudgets = {
  maxCount: 24,
  maxBytes: 575 * 1024,
  maxDecodedPixels: 875_000,
};
const totalAssetBudgets = {
  maxBytes: 625 * 1024,
  maxDecodedPixels: 950_000,
};
const imageBudgetsByCategory = {
  dock: { maxBytes: 128 * 1024, maxDecodedPixels: 150_000 },
  landmark: { maxBytes: 96 * 1024, maxDecodedPixels: 131_072 },
  overlay: { maxBytes: 96 * 1024, maxDecodedPixels: 150_000 },
  prop: { maxBytes: 24 * 1024, maxDecodedPixels: 30_000 },
  ship: { maxBytes: 32 * 1024, maxDecodedPixels: 50_000 },
  terrain: { maxBytes: 8 * 1024, maxDecodedPixels: 8_192 },
};
const displayScaleWarningThreshold = 0.8;
const displayScaleWarningMinPixels = 50_000;
const displayScaleFailureWasteRatio = 4;

const manifestText = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestText);
const errors = [];
const warnings = [];
const assetMetrics = new Map();

if (manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2) {
  errors.push("Manifest schemaVersion must be 1 or 2.");
}
validateStyle(manifest.style);
if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) errors.push("Manifest assets array is required.");
if (manifest.assets?.length > maxManifestAssets) errors.push(`Manifest has ${manifest.assets.length} assets; v0.1 core cap is ${maxManifestAssets}.`);
if (!Array.isArray(manifest.requiredForFirstRender)) errors.push("Manifest requiredForFirstRender array is required.");

const ids = new Set();
const referenced = new Set(["manifest.json"]);
const requiredForFirstRenderIds = new Set();
for (const requiredId of manifest.requiredForFirstRender ?? []) {
  if (typeof requiredId !== "string") errors.push("requiredForFirstRender entries must be strings.");
  if (requiredForFirstRenderIds.has(requiredId)) errors.push(`requiredForFirstRender duplicates asset ${requiredId}.`);
  requiredForFirstRenderIds.add(requiredId);
  if (!manifest.assets?.some((asset) => asset.id === requiredId)) {
    errors.push(`requiredForFirstRender references missing asset ${requiredId}.`);
  }
}

for (const asset of manifest.assets ?? []) {
  validateAsset(asset, ids, referenced);
}
validateManifestBudgets(ids, assetMetrics);
validateReferencedAssetIds(ids);
validateChainLogoReferences();
validateStablecoinLogoReferences();
validateCemeteryLogoReferences();

for (const pngPath of listPngs(assetRoot)) {
  const relativePath = relative(assetRoot, pngPath).split(sep).join("/");
  if (!referenced.has(relativePath)) errors.push(`Orphan PNG is not referenced by manifest: ${relativePath}`);
}
for (const filePath of listFiles(assetRoot)) {
  const relativePath = relative(assetRoot, filePath).split(sep).join("/");
  const bytes = readFileSync(filePath);
  const text = bytes.toString("utf8");
  if (forbiddenPattern.test(text)) {
    errors.push(`Public asset file contains a forbidden token marker or URL: ${relativePath}`);
  }
}

if (errors.length > 0) {
  console.error("PharosVille asset validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  printWarnings();
  process.exit(1);
}

printWarnings();
console.log(`PharosVille asset validation passed for ${manifest.assets.length} assets.`);

function validateAsset(asset, ids, referenced) {
  const id = typeof asset.id === "string" ? asset.id : "<missing id>";
  if (!asset.id) errors.push("Asset is missing id.");
  if (typeof asset.id !== "string") errors.push("Asset id must be a string.");
  if (typeof asset.id === "string" && !assetIdPattern.test(asset.id)) {
    errors.push(`${id} id must be a namespaced asset id.`);
  }
  if (!allowedCategories.has(asset.category)) errors.push(`${id} category is invalid: ${asset.category}`);
  if (!asset.layer || typeof asset.layer !== "string") errors.push(`${id} layer is required.`);
  if (!allowedPriorities.has(asset.loadPriority)) errors.push(`${id} loadPriority is invalid: ${asset.loadPriority}`);
  if (!Number.isFinite(asset.displayScale) || asset.displayScale <= 0 || asset.displayScale > 4) {
    errors.push(`${id} displayScale must be a positive number <= 4.`);
  }
  if (!Number.isInteger(asset.width) || asset.width <= 0) errors.push(`${id} width must be a positive integer.`);
  if (!Number.isInteger(asset.height) || asset.height <= 0) errors.push(`${id} height must be a positive integer.`);
  if (!Array.isArray(asset.footprint) || asset.footprint.length !== 2) errors.push(`${id} footprint must be [width,height].`);
  if (Array.isArray(asset.footprint) && (
    asset.footprint.some((value) => !Number.isFinite(value) || value <= 0)
  )) {
    errors.push(`${id} footprint values must be positive numbers.`);
  }
  if (ids.has(id)) errors.push(`Duplicate asset id: ${id}`);
  ids.add(id);
  if (!asset.path || typeof asset.path !== "string") {
    errors.push(`${id} is missing path.`);
    return;
  }
  if (asset.path.includes("..") || normalize(asset.path).startsWith("..")) {
    errors.push(`${id} path uses traversal: ${asset.path}`);
    return;
  }
  if (asset.path.startsWith("/") || asset.path.includes("://")) {
    errors.push(`${id} path must be relative to public/pharosville/assets.`);
    return;
  }
  if (!asset.path.endsWith(".png")) errors.push(`${id} path must point to a PNG.`);
  if (placeholderPattern.test(asset.path) || placeholderPattern.test(id)) {
    errors.push(`${id} must not reference placeholder/checker/debug assets in production.`);
  }
  referenced.add(asset.path);
  const fullPath = join(assetRoot, asset.path);
  let bytes;
  try {
    bytes = readFileSync(fullPath);
  } catch {
    errors.push(`${id} file is missing: ${asset.path}`);
    return;
  }
  const byteSize = statSync(fullPath).size;
  if (byteSize < 100) errors.push(`${id} PNG is too small to be a real asset.`);
  if (!bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    errors.push(`${id} is not a PNG file: ${asset.path}`);
    return;
  }
  if (bytes.toString("ascii", 12, 16) !== "IHDR") errors.push(`${id} PNG is missing an IHDR chunk.`);
  if (!bytes.includes(Buffer.from("IEND", "ascii"))) errors.push(`${id} PNG is missing an IEND chunk.`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== asset.width || height !== asset.height) {
    errors.push(`${id} dimensions are ${width}x${height}, manifest says ${asset.width}x${asset.height}.`);
  }
  const decodedPixels = width * height;
  assetMetrics.set(id, {
    byteSize,
    category: asset.category,
    decodedPixels,
    displayScale: asset.displayScale,
    height,
    loadPriority: asset.loadPriority,
    path: asset.path,
    width,
  });
  validateImageBudgets(asset, id, byteSize, decodedPixels);
  if (!Array.isArray(asset.anchor) || asset.anchor.length !== 2) errors.push(`${id} anchor must be [x,y].`);
  if (Array.isArray(asset.anchor) && (
    asset.anchor[0] < 0 || asset.anchor[1] < 0 || asset.anchor[0] > asset.width || asset.anchor[1] > asset.height
  )) {
    errors.push(`${id} anchor is outside bounds.`);
  }
  if (!Array.isArray(asset.hitbox) || asset.hitbox.length !== 4) errors.push(`${id} hitbox must be [x,y,width,height].`);
  if (Array.isArray(asset.hitbox) && asset.hitbox.length === 4) {
    const [x, y, hitWidth, hitHeight] = asset.hitbox;
    if (asset.hitbox.some((value) => !Number.isFinite(value))) errors.push(`${id} hitbox values must be numbers.`);
    if (hitWidth <= 0 || hitHeight <= 0) errors.push(`${id} hitbox size must be positive.`);
    if (x < 0 || y < 0 || x + hitWidth > asset.width || y + hitHeight > asset.height) {
      errors.push(`${id} hitbox is outside image bounds.`);
    }
  }
  if (asset.promptProvenance) {
    if (asset.promptProvenance.styleAnchorVersion !== manifestStyleAnchorVersion()) {
      errors.push(`${id} promptProvenance.styleAnchorVersion must match the manifest style anchor version.`);
    }
    if (asset.promptProvenance.jobId && typeof asset.promptProvenance.jobId !== "string") {
      errors.push(`${id} promptProvenance.jobId must be a string when present.`);
    }
  }
  validateOptionalMetadata(asset, id);
  validateAnimation(asset, id, referenced);
}

function validateManifestBudgets(manifestIds, metrics) {
  let totalBytes = 0;
  let totalDecodedPixels = 0;
  let firstRenderBytes = 0;
  let firstRenderDecodedPixels = 0;
  let firstRenderCount = 0;

  for (const asset of manifest.assets ?? []) {
    const metric = metrics.get(asset.id);
    if (!metric) continue;
    totalBytes += metric.byteSize;
    totalDecodedPixels += metric.decodedPixels;
    const isFirstRender = requiredForFirstRenderIds.has(asset.id);
    if (isFirstRender) {
      firstRenderCount += 1;
      firstRenderBytes += metric.byteSize;
      firstRenderDecodedPixels += metric.decodedPixels;
    }
    if (asset.loadPriority === "critical" && !isFirstRender) {
      errors.push(`${asset.id} is critical but missing from requiredForFirstRender.`);
    }
    if (isFirstRender && asset.loadPriority !== "critical") {
      errors.push(`${asset.id} is requiredForFirstRender but loadPriority is ${asset.loadPriority}.`);
    }
  }

  if (firstRenderCount > firstRenderBudgets.maxCount) {
    errors.push(`First-render asset count is ${firstRenderCount}; budget is ${firstRenderBudgets.maxCount}.`);
  }
  if (firstRenderBytes > firstRenderBudgets.maxBytes) {
    errors.push(`First-render asset bytes are ${formatBytes(firstRenderBytes)}; budget is ${formatBytes(firstRenderBudgets.maxBytes)}.`);
  }
  if (firstRenderDecodedPixels > firstRenderBudgets.maxDecodedPixels) {
    errors.push(`First-render decoded pixels are ${formatNumber(firstRenderDecodedPixels)}; budget is ${formatNumber(firstRenderBudgets.maxDecodedPixels)}.`);
  }
  if (totalBytes > totalAssetBudgets.maxBytes) {
    errors.push(`Runtime asset bytes are ${formatBytes(totalBytes)}; budget is ${formatBytes(totalAssetBudgets.maxBytes)}.`);
  }
  if (totalDecodedPixels > totalAssetBudgets.maxDecodedPixels) {
    errors.push(`Runtime decoded pixels are ${formatNumber(totalDecodedPixels)}; budget is ${formatNumber(totalAssetBudgets.maxDecodedPixels)}.`);
  }

  for (const requiredId of requiredForFirstRenderIds) {
    if (!manifestIds.has(requiredId)) continue;
    if (!metrics.has(requiredId)) {
      errors.push(`requiredForFirstRender asset ${requiredId} has no readable PNG metrics.`);
    }
  }
}

function validateImageBudgets(asset, id, byteSize, decodedPixels) {
  const budget = imageBudgetsByCategory[asset.category];
  if (!budget) return;
  if (byteSize > budget.maxBytes) {
    errors.push(`${id} is ${formatBytes(byteSize)}; ${asset.category} image byte budget is ${formatBytes(budget.maxBytes)}.`);
  }
  if (decodedPixels > budget.maxDecodedPixels) {
    errors.push(`${id} decodes ${formatNumber(decodedPixels)} pixels; ${asset.category} decoded-pixel budget is ${formatNumber(budget.maxDecodedPixels)}.`);
  }
  const displayedPixels = decodedPixels * asset.displayScale * asset.displayScale;
  const wasteRatio = displayedPixels > 0 ? decodedPixels / displayedPixels : Infinity;
  if (asset.displayScale < displayScaleWarningThreshold && decodedPixels >= displayScaleWarningMinPixels) {
    warnings.push(`${id} is ${asset.width}x${asset.height} at displayScale ${asset.displayScale}; consider trimmed/downscaled source art if visual diffs pass.`);
  }
  if (wasteRatio > displayScaleFailureWasteRatio && decodedPixels >= displayScaleWarningMinPixels) {
    errors.push(`${id} decodes ${wasteRatio.toFixed(1)}x its displayed pixel area; trim or justify the native source size.`);
  }
}

function printWarnings() {
  if (warnings.length === 0) return;
  console.warn("PharosVille asset validation warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function formatNumber(value) {
  return value.toLocaleString("en-US");
}

function listPngs(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listPngs(path));
    if (entry.isFile() && entry.name.endsWith(".png")) files.push(path);
  }
  return files;
}

function listFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

function validateStyle(style) {
  if (!style || typeof style !== "object") {
    errors.push("Manifest style object is required.");
    return;
  }
  if (manifest.schemaVersion === 2) {
    if (!style.cacheVersion || typeof style.cacheVersion !== "string") errors.push("Manifest style.cacheVersion is required for schema v2.");
    if (!style.styleAnchorVersion || typeof style.styleAnchorVersion !== "string") errors.push("Manifest style.styleAnchorVersion is required for schema v2.");
    if (style.assetVersion != null) errors.push("Manifest schema v2 must use style.cacheVersion and style.styleAnchorVersion, not style.assetVersion.");
  } else {
    if (!style.assetVersion || typeof style.assetVersion !== "string") errors.push("Manifest style.assetVersion is required for schema v1.");
  }
  if (!style.anchor || typeof style.anchor !== "string") errors.push("Manifest style.anchor is required.");
  if (!Array.isArray(style.palette) || style.palette.length < 4) errors.push("Manifest style.palette must include at least four colors.");
  for (const color of style.palette ?? []) {
    if (typeof color !== "string" || !hexColorPattern.test(color)) errors.push(`Manifest style.palette has invalid color: ${color}`);
  }
  const defaults = style.generationDefaults;
  if (!defaults || typeof defaults !== "object") {
    errors.push("Manifest style.generationDefaults object is required.");
    return;
  }
  for (const key of ["view", "outline", "shading", "detail"]) {
    if (!defaults[key] || typeof defaults[key] !== "string") {
      errors.push(`Manifest style.generationDefaults.${key} is required.`);
    }
  }
  if (typeof defaults.transparentBackground !== "boolean") {
    errors.push("Manifest style.generationDefaults.transparentBackground must be boolean.");
  }
}

function manifestStyleAnchorVersion() {
  return manifest.schemaVersion === 2 ? manifest.style?.styleAnchorVersion : manifest.style?.assetVersion;
}

function validateOptionalMetadata(asset, id) {
  for (const key of ["promptKey", "semanticRole", "criticalReason"]) {
    if (asset[key] != null && (typeof asset[key] !== "string" || asset[key].trim() === "")) {
      errors.push(`${id} ${key} must be a non-empty string when present.`);
    }
  }
  if (asset.criticalReason != null && asset.loadPriority !== "critical" && !(manifest.requiredForFirstRender ?? []).includes(asset.id)) {
    errors.push(`${id} criticalReason is only valid for critical or first-render assets.`);
  }
  if (asset.paletteKeys != null) {
    if (!Array.isArray(asset.paletteKeys) || asset.paletteKeys.length === 0) {
      errors.push(`${id} paletteKeys must be a non-empty string array when present.`);
      return;
    }
    for (const paletteKey of asset.paletteKeys) {
      if (typeof paletteKey !== "string" || paletteKey.trim() === "") {
        errors.push(`${id} paletteKeys entries must be non-empty strings.`);
      }
    }
  }
  if (asset.beacon != null) {
    if (!Array.isArray(asset.beacon) || asset.beacon.length !== 2) {
      errors.push(`${id} beacon must be [x,y] when present.`);
      return;
    }
    if (asset.beacon.some((value) => !Number.isFinite(value))) {
      errors.push(`${id} beacon values must be numbers.`);
    }
    if (asset.beacon[0] < 0 || asset.beacon[1] < 0 || asset.beacon[0] > asset.width || asset.beacon[1] > asset.height) {
      errors.push(`${id} beacon is outside image bounds.`);
    }
  }
}

function validateAnimation(asset, id, referenced) {
  const animation = asset.animation;
  if (animation == null) return;
  if (manifest.schemaVersion !== 2) {
    errors.push(`${id} animation metadata requires manifest schema v2.`);
    return;
  }
  if (typeof animation !== "object" || Array.isArray(animation)) {
    errors.push(`${id} animation must be an object when present.`);
    return;
  }
  if (!Number.isInteger(animation.frameCount) || animation.frameCount <= 0) {
    errors.push(`${id} animation.frameCount must be a positive integer.`);
  }
  if (typeof animation.loop !== "boolean") errors.push(`${id} animation.loop must be boolean.`);
  if (!Number.isInteger(animation.reducedMotionFrame) || animation.reducedMotionFrame < 0) {
    errors.push(`${id} animation.reducedMotionFrame must be a non-negative integer.`);
  }
  if (
    Number.isInteger(animation.frameCount)
    && Number.isInteger(animation.reducedMotionFrame)
    && animation.reducedMotionFrame >= animation.frameCount
  ) {
    errors.push(`${id} animation.reducedMotionFrame must be less than frameCount.`);
  }
  const hasFps = animation.fps != null;
  const hasDurationMs = animation.durationMs != null;
  if (hasFps === hasDurationMs) {
    errors.push(`${id} animation must define exactly one of fps or durationMs.`);
  }
  if (hasFps && (!Number.isFinite(animation.fps) || animation.fps <= 0 || animation.fps > 30)) {
    errors.push(`${id} animation.fps must be a positive number <= 30.`);
  }
  if (hasDurationMs && (!Number.isFinite(animation.durationMs) || animation.durationMs <= 0)) {
    errors.push(`${id} animation.durationMs must be a positive number.`);
  }

  const frameImage = validateAnimationFrameSource(asset, id, referenced);
  validateSpriteSheet(asset, id, frameImage);
}

function validateAnimationFrameSource(asset, id, referenced) {
  const frameSource = asset.animation?.frameSource;
  if (!frameSource || typeof frameSource !== "string") {
    errors.push(`${id} animation.frameSource is required.`);
    return null;
  }
  if (frameSource.includes("..") || normalize(frameSource).startsWith("..")) {
    errors.push(`${id} animation.frameSource uses traversal: ${frameSource}`);
    return null;
  }
  if (frameSource.startsWith("/") || frameSource.includes("://")) {
    errors.push(`${id} animation.frameSource must be relative to public/pharosville/assets.`);
    return null;
  }
  if (!frameSource.endsWith(".png")) errors.push(`${id} animation.frameSource must point to a PNG.`);
  referenced.add(frameSource);
  const fullPath = join(assetRoot, frameSource);
  let bytes;
  try {
    bytes = readFileSync(fullPath);
  } catch {
    errors.push(`${id} animation frameSource file is missing: ${frameSource}`);
    return null;
  }
  if (!bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    errors.push(`${id} animation.frameSource is not a PNG file: ${frameSource}`);
    return null;
  }
  return {
    height: bytes.readUInt32BE(20),
    width: bytes.readUInt32BE(16),
  };
}

function validateSpriteSheet(asset, id, frameImage) {
  const sheet = asset.animation?.spriteSheet;
  if (sheet == null) return;
  if (typeof sheet !== "object" || Array.isArray(sheet)) {
    errors.push(`${id} animation.spriteSheet must be an object when present.`);
    return;
  }
  for (const key of ["frameWidth", "frameHeight", "columns", "rows"]) {
    if (!Number.isInteger(sheet[key]) || sheet[key] <= 0) {
      errors.push(`${id} animation.spriteSheet.${key} must be a positive integer.`);
    }
  }
  if (!Number.isInteger(sheet.columns) || !Number.isInteger(sheet.rows)) return;
  if (Number.isInteger(asset.animation?.frameCount) && asset.animation.frameCount > sheet.columns * sheet.rows) {
    errors.push(`${id} animation.frameCount exceeds spriteSheet columns * rows.`);
  }
  if (!frameImage || !Number.isInteger(sheet.frameWidth) || !Number.isInteger(sheet.frameHeight)) return;
  if (frameImage.width < sheet.frameWidth * sheet.columns || frameImage.height < sheet.frameHeight * sheet.rows) {
    errors.push(`${id} animation.spriteSheet geometry exceeds frameSource dimensions.`);
  }
}

function validateReferencedAssetIds(manifestIds) {
  const referencedIds = new Map();
  const add = (id, source) => {
    const sources = referencedIds.get(id) ?? new Set();
    sources.add(source);
    referencedIds.set(id, sources);
  };

  add("landmark.lighthouse", "world renderer lighthouse");
  add("prop.memorial-terrace", "world renderer cemetery");
  add("prop.memorial-headstone", "world renderer graves");
  add("prop.ledger-slab", "world renderer graves");
  add("prop.reliquary-marker", "world renderer graves");
  add("prop.regulatory-obelisk", "world renderer graves");
  for (const relativePath of pharosVilleSourceFiles()) {
    for (const id of assetIdsInSource(relativePath)) add(id, relativePath);
    for (const hull of shipHullsInSource(relativePath)) add(`ship.${hull}`, relativePath);
  }

  for (const [id, sources] of referencedIds) {
    if (!manifestIds.has(id)) {
      errors.push(`Manifest is missing referenced asset ${id} from ${[...sources].join(", ")}.`);
    }
  }
}

function validateChainLogoReferences() {
  const source = readFileSync(chainMetaPath, "utf8");
  const references = [...source.matchAll(/logoPath:\s*["'`]([^"'`]+)["'`]/g)]
    .map((match) => match[1]);
  if (references.length === 0) {
    errors.push("shared/lib/chains.ts has no logoPath references.");
    return;
  }
  for (const path of references) {
    validatePublicImageReference(path, "shared/lib/chains.ts logoPath");
  }
}

function validateStablecoinLogoReferences() {
  const logos = JSON.parse(readFileSync(stablecoinLogosPath, "utf8"));
  if (!logos || typeof logos !== "object" || Array.isArray(logos)) {
    errors.push("data/logos.json must be an object.");
    return;
  }
  for (const [id, path] of Object.entries(logos)) {
    if (typeof path !== "string") {
      errors.push(`data/logos.json ${id} must reference a string path.`);
      continue;
    }
    validatePublicImageReference(path, `data/logos.json ${id}`);
  }
}

function validateCemeteryLogoReferences() {
  const entries = JSON.parse(readFileSync(deadStablecoinsPath, "utf8"));
  if (!Array.isArray(entries)) {
    errors.push("shared/data/dead-stablecoins.json must be an array.");
    return;
  }
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || entry.logo == null) continue;
    if (typeof entry.logo !== "string") {
      errors.push(`shared/data/dead-stablecoins.json ${entry.id ?? "<unknown>"} logo must be a string.`);
      continue;
    }
    validatePublicImageReference(`/logos/cemetery/${entry.logo}`, `shared/data/dead-stablecoins.json ${entry.id ?? entry.symbol ?? entry.logo}`);
  }
}

function validatePublicImageReference(path, source) {
  if (path.includes("://") || path.startsWith("//")) {
    errors.push(`${source} must use a same-origin public asset path: ${path}`);
    return;
  }
  if (!path.startsWith("/")) {
    errors.push(`${source} must start with /: ${path}`);
    return;
  }
  const relativePath = path.slice(1);
  if (relativePath.includes("..") || normalize(relativePath).startsWith("..")) {
    errors.push(`${source} uses traversal: ${path}`);
    return;
  }
  if (!publicImageExtensionPattern.test(relativePath)) {
    errors.push(`${source} must reference an image asset: ${path}`);
  }
  const fullPath = join(publicRoot, relativePath);
  if (!existsSync(fullPath)) {
    errors.push(`${source} file is missing: ${path}`);
  }
}

function assetIdsInSource(relativePath) {
  const source = readFileSync(join(pharosVilleSrcRoot, relativePath), "utf8");
  return [...source.matchAll(/(?:["'`])((?:building|dock|landmark|overlay|prop|ship|terrain)\.[a-z0-9-]+)(?:["'`])/g)]
    .map((match) => match[1]);
}

function shipHullsInSource(relativePath) {
  const source = readFileSync(join(pharosVilleSrcRoot, relativePath), "utf8");
  return [...source.matchAll(/hull:\s*["'`]([a-z0-9-]+)["'`]/g)].map((match) => match[1]);
}

function pharosVilleSourceFiles() {
  return execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
    .split("\n")
    .filter((file) => file.startsWith("src/"))
    .filter((file) => existsSync(file))
    .filter((file) => pharosVilleSourceExtensionPattern.test(file) && !pharosVilleTestFilePattern.test(file))
    .map((file) => relative(pharosVilleSrcRoot, resolve(repoRoot, file)).split(sep).join("/"))
    .sort();
}
