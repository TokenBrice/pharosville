#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const publicRoot = resolve(repoRoot, "public");
const logosRoot = resolve(publicRoot, "logos");
const errors = [];
const referencedLogos = new Set();
const referencedThreeMedia = new Set();
const retiredPatterns = [
  /\/chains\/[^"'`]+\.(?:jpe?g|png|svg|webp)/i,
  /\/logos\/cemetery\//,
  /\/pharosville\/assets\//,
  /\/sail-emblems\//,
];

/** Below this a file cannot hold a header plus pixels, whatever the format. */
export const MIN_MEDIA_BYTES = 64;
/** The largest hand-authored logo in the inventory is 74 KB; past this an "SVG" is a bitmap. */
export const MAX_SVG_BYTES = 262_144;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

/**
 * Structural sanity check for a media file: does the container agree with the
 * bytes actually on disk? This is not a decode, but it catches the corruption
 * that renders blank in the browser — truncation above all.
 */
export function findMediaFileProblems(mediaPath, bytes) {
  if (bytes.length === 0) return ["file is empty"];
  if (bytes.length < MIN_MEDIA_BYTES) {
    return [`file is only ${bytes.length} bytes, too small to hold an image`];
  }

  const extension = extname(mediaPath).toLowerCase();
  const declared = DECLARED_FORMATS.get(extension);
  if (!declared) return [];

  // Dispatch on the container actually present, not the extension: a PNG named
  // .jpg still decodes in every browser. Swapping vector for raster does not.
  const actual = detectMediaFormat(bytes);
  if (!actual) {
    return ["is not a recognizable image: no PNG, JPEG, WebP, or SVG container found"];
  }
  if ((actual === "svg") !== (declared === "svg")) {
    const label = actual === "svg" ? "an SVG" : `a ${actual.toUpperCase()}`;
    return [`is ${label} behind a ${extension} extension, so it is served with the wrong media type`];
  }

  switch (actual) {
    case "png":
      return findPngProblems(bytes);
    case "jpeg":
      return findJpegProblems(bytes);
    case "webp":
      return findWebpProblems(bytes);
    default:
      return findSvgProblems(bytes);
  }
}

const DECLARED_FORMATS = new Map([
  [".png", "png"],
  [".jpg", "jpeg"],
  [".jpeg", "jpeg"],
  [".webp", "webp"],
  [".svg", "svg"],
]);

function detectMediaFormat(bytes) {
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") {
    return "webp";
  }
  if (/<svg[\s>]/i.test(bytes.toString("utf8", 0, 4096))) return "svg";
  return null;
}

function findPngProblems(bytes) {
  let offset = 8;
  let sawIdat = false;
  let sawIend = false;

  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) {
      return [`PNG chunk header at byte ${offset} is truncated`];
    }
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    if (length > 0x7fffffff) {
      return [`PNG chunk ${type} declares an out-of-range length of ${length} bytes`];
    }
    const present = Math.max(0, bytes.length - offset - 12);
    if (length > present) {
      return [`PNG chunk ${type} declares ${length} bytes but only ${present} are present`];
    }

    if (offset === 8) {
      if (type !== "IHDR") return [`PNG starts with a ${type} chunk instead of IHDR`];
      const width = bytes.readUInt32BE(offset + 8);
      const height = bytes.readUInt32BE(offset + 12);
      if (width === 0 || height === 0) {
        return [`PNG declares zero dimensions (${width}x${height})`];
      }
    }
    if (type === "IDAT") sawIdat = true;
    offset += 12 + length;
    if (type === "IEND") {
      sawIend = true;
      break;
    }
  }

  const problems = [];
  if (!sawIdat) problems.push("PNG carries no image data (no IDAT chunk)");
  if (!sawIend) problems.push("PNG is truncated: the stream never reaches IEND");
  return problems;
}

function findJpegProblems(bytes) {
  let offset = 2;
  let scanOffset = -1;
  let sawFrame = false;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      return [`JPEG segment at byte ${offset} is malformed: expected a marker`];
    }
    let markerOffset = offset;
    while (markerOffset + 1 < bytes.length && bytes[markerOffset + 1] === 0xff) markerOffset += 1;
    const marker = bytes[markerOffset + 1];
    offset = markerOffset;

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9) break;

    if (offset + 4 > bytes.length) {
      return [`JPEG segment 0x${marker.toString(16)} is truncated at byte ${offset}`];
    }
    const length = bytes.readUInt16BE(offset + 2);
    const present = bytes.length - offset - 2;
    if (length < 2) {
      return [`JPEG segment 0x${marker.toString(16)} declares an invalid length of ${length}`];
    }
    if (length > present) {
      return [
        `JPEG segment 0x${marker.toString(16)} declares ${length} bytes but only ${present} are present`,
      ];
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      if (width === 0 || height === 0) {
        return [`JPEG declares zero dimensions (${width}x${height})`];
      }
      sawFrame = true;
    }
    offset += 2 + length;
    if (marker === 0xda) {
      scanOffset = offset;
      break;
    }
  }

  const problems = [];
  if (!sawFrame) problems.push("JPEG carries no frame header (no SOFn segment)");
  if (scanOffset < 0) {
    problems.push("JPEG carries no scan data (no SOS segment)");
  } else if (bytes.lastIndexOf(JPEG_EOI) < scanOffset) {
    // 0xFFD9 cannot occur inside entropy-coded data, so its absence means truncation.
    problems.push("JPEG is truncated: the scan never reaches an EOI marker");
  }
  return problems;
}

function findWebpProblems(bytes) {
  const declared = bytes.readUInt32LE(4) + 8;
  if (declared > bytes.length) {
    return [`WebP RIFF header declares ${declared} bytes but the file is ${bytes.length}`];
  }

  let offset = 12;
  let sawImage = false;
  while (offset + 8 <= declared) {
    const fourcc = bytes.toString("latin1", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const present = bytes.length - offset - 8;
    if (size > present) {
      return [`WebP chunk ${fourcc} declares ${size} bytes but only ${present} are present`];
    }
    if (fourcc === "VP8 " || fourcc === "VP8L" || fourcc === "VP8X") sawImage = true;
    offset += 8 + size + (size % 2);
  }

  return sawImage ? [] : ["WebP carries no image chunk (VP8, VP8L, or VP8X)"];
}

const SVG_ROOT_PATTERN = /<svg\b[^>]*>/i;
const EMBEDDED_RASTER_PATTERN = /data:image\/(?:png|jpe?g|gif|webp|bmp|tiff);base64,\s*([A-Za-z0-9+/=\s]+)/gi;

function findSvgProblems(bytes) {
  const text = bytes.toString("utf8");

  let rasterBytes = 0;
  for (const match of text.matchAll(EMBEDDED_RASTER_PATTERN)) rasterBytes += match[1].length;
  if (rasterBytes * 2 > text.length) {
    const share = Math.round((rasterBytes / text.length) * 100);
    return [`is a bitmap wearing an .svg extension: ${share}% of the file is base64 raster data`];
  }
  if (bytes.length > MAX_SVG_BYTES) {
    return [
      `SVG is ${Math.round(bytes.length / 1024)} KB, far past the ${Math.round(MAX_SVG_BYTES / 1024)} KB ceiling for vector art`,
    ];
  }

  const root = SVG_ROOT_PATTERN.exec(text);
  if (!root) return ["is not an SVG: no <svg> root element"];
  const rootTag = root[0];

  const problems = [];
  if (!rootTag.endsWith("/>") && !/<\/svg\s*>\s*$/i.test(text)) {
    problems.push("SVG is truncated: no closing </svg> tag");
  }
  const hasViewBox = /\bviewBox\s*=\s*["'][^"']*\d/i.test(rootTag);
  const hasSize = /\bwidth\s*=\s*["'][^"']*\d/i.test(rootTag) && /\bheight\s*=\s*["'][^"']*\d/i.test(rootTag);
  if (!hasViewBox && !hasSize) {
    problems.push("SVG has neither a viewBox nor an intrinsic width/height, so it has no size to render at");
  }
  return problems;
}

function main() {
  validateStablecoinLogos();
  validateThreeMedia();
  validateNoRetiredRuntimeReferences();

  if (errors.length > 0) {
    console.error("PharosVille runtime media validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `PharosVille runtime media validation passed for ${referencedLogos.size} logos and ${referencedThreeMedia.size} Three media files, all structurally decodable.`,
  );
}

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
    if (!DECLARED_FORMATS.has(extname(mediaPath).toLowerCase())) {
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
  const filePath = join(publicRoot, relativePath);
  if (!existsSync(filePath)) {
    errors.push(`${source} file is missing: ${mediaPath}`);
    return false;
  }
  // The file is referenced correctly even when its bytes are broken, so the
  // caller still counts it; a decode problem fails the run on its own.
  for (const problem of findMediaFileProblems(mediaPath, readFileSync(filePath))) {
    errors.push(`${source} file cannot render: ${mediaPath} ${problem}`);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
