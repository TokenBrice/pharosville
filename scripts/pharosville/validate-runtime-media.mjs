#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, normalize, relative, resolve, sep } from "node:path";

const repoRoot = process.cwd();
const publicRoot = resolve(repoRoot, "public");
const logosRoot = resolve(publicRoot, "logos");
const errors = [];
const referencedLogos = new Set();
const referencedThreeMedia = new Set();
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".svg", ".webp"]);
const retiredPatterns = [
  /\/chains\/[^"'`]+\.(?:jpe?g|png|svg|webp)/i,
  /\/logos\/cemetery\//,
  /\/pharosville\/assets\//,
  /\/sail-emblems\//,
];

validateStablecoinLogos();
validateThreeMedia();
validateNoRetiredRuntimeReferences();

if (errors.length > 0) {
  console.error("PharosVille runtime media validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `PharosVille runtime media validation passed for ${referencedLogos.size} logos and ${referencedThreeMedia.size} Three media files.`,
);

function validateStablecoinLogos() {
  const logosPath = resolve(repoRoot, "data/logos.json");
  const logos = JSON.parse(readFileSync(logosPath, "utf8"));
  if (!logos || typeof logos !== "object" || Array.isArray(logos)) {
    errors.push("data/logos.json must be an object.");
    return;
  }

  for (const [id, mediaPath] of Object.entries(logos)) {
    if (typeof mediaPath !== "string") {
      errors.push(`data/logos.json ${id} must reference a string path.`);
      continue;
    }
    if (!mediaPath.startsWith("/logos/") || mediaPath.startsWith("/logos/cemetery/")) {
      errors.push(`data/logos.json ${id} must reference a top-level same-origin logo: ${mediaPath}`);
      continue;
    }
    if (!imageExtensions.has(extname(mediaPath).toLowerCase())) {
      errors.push(`data/logos.json ${id} must reference an image: ${mediaPath}`);
      continue;
    }
    if (!validatePublicPath(mediaPath, `data/logos.json ${id}`)) continue;
    referencedLogos.add(mediaPath.slice("/logos/".length));
  }

  for (const fileName of readdirSync(logosRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)) {
    if (!referencedLogos.has(fileName)) {
      errors.push(`Top-level stablecoin logo is not referenced by data/logos.json: ${fileName}`);
    }
  }
}

function validateThreeMedia() {
  for (const sourcePath of [
    "src/three/garden-models.ts",
    "src/three/garden-water.ts",
  ]) {
    const source = readFileSync(resolve(repoRoot, sourcePath), "utf8");
    for (const match of source.matchAll(/\/pharosville\/(?:models|textures)\/[a-z0-9._-]+/gi)) {
      const mediaPath = match[0];
      if (validatePublicPath(mediaPath, sourcePath)) {
        referencedThreeMedia.add(mediaPath);
      }
    }
  }

  if (referencedThreeMedia.size === 0) {
    errors.push("No Three model or texture media references were found.");
  }
}

function validateNoRetiredRuntimeReferences() {
  for (const sourcePath of productionSourceFiles()) {
    const source = readFileSync(resolve(repoRoot, sourcePath), "utf8");
    for (const pattern of retiredPatterns) {
      if (pattern.test(source)) {
        errors.push(`${sourcePath} still references retired runtime media matching ${pattern}`);
      }
    }
  }
}

function validatePublicPath(mediaPath, source) {
  if (mediaPath.includes("://") || mediaPath.startsWith("//")) {
    errors.push(`${source} must use a same-origin public path: ${mediaPath}`);
    return false;
  }
  const relativePath = mediaPath.slice(1);
  if (!relativePath || relativePath.includes("..") || normalize(relativePath).startsWith("..")) {
    errors.push(`${source} uses an invalid public path: ${mediaPath}`);
    return false;
  }
  if (!existsSync(join(publicRoot, relativePath))) {
    errors.push(`${source} file is missing: ${mediaPath}`);
    return false;
  }
  return true;
}

function productionSourceFiles() {
  return execFileSync("git", ["ls-files", "src"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((file) => /\.(?:ts|tsx)$/.test(file))
    .filter((file) => !/(?:^|\/)(?:__fixtures__|__tests__|tests?)\//.test(file))
    .filter((file) => !/\.test\.(?:ts|tsx)$/.test(file))
    .filter((file) => existsSync(resolve(repoRoot, file)))
    .map((file) => relative(repoRoot, resolve(repoRoot, file)).split(sep).join("/"));
}
