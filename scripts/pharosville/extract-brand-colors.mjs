#!/usr/bin/env node
/**
 * Build-time brand color extraction for ship liveries (identity pass P3).
 *
 * Reads every slug-keyed logo in `data/logos.json`, decodes it in headless
 * Chromium (handles png/jpg/svg uniformly), and derives a dominant brand
 * `primary` plus a `secondary` color per stablecoin id. Results are
 * normalized into a livery-safe lightness/saturation window, then passed
 * through a deterministic perceptual-distance guard (OKLab) so no two
 * generated primaries collapse into the same swatch.
 *
 * Output: `data/brand-colors.json` (checked in; regenerate when logos
 * change). Optional `data/brand-color-overrides.json` entries are copied
 * verbatim over extracted values for logos that defeat the heuristic
 * (white-on-transparent marks, multi-color rainbow logos, …).
 *
 * Usage: node scripts/pharosville/extract-brand-colors.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const REPO_ROOT = resolve(new URL("../..", import.meta.url).pathname);
const LOGOS_JSON = resolve(REPO_ROOT, "data/logos.json");
const OUTPUT_JSON = resolve(REPO_ROOT, "data/brand-colors.json");
const OVERRIDES_JSON = resolve(REPO_ROOT, "data/brand-color-overrides.json");
const SAMPLE_SIZE = 48;

// Livery-safe window for the brand primary (HSL lightness).
const PRIMARY_LIGHTNESS_MIN = 0.24;
const PRIMARY_LIGHTNESS_MAX = 0.58;
// Minimum OKLab distance between any two generated primaries.
const MIN_OKLAB_DISTANCE = 0.055;
const GUARD_LIGHTNESS_STEP = 0.05;
const GUARD_MAX_ATTEMPTS = 8;

const MIME_BY_EXT = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function mimeFor(path) {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return MIME_BY_EXT[ext] ?? "image/png";
}

// --- color math -------------------------------------------------------------

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  return {
    r: Math.round(channel(h + 1 / 3) * 255),
    g: Math.round(channel(h) * 255),
    b: Math.round(channel(h - 1 / 3) * 255),
  };
}

function rgbToHex({ r, g, b }) {
  const part = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function hexToRgb(hex) {
  const n = hex.replace("#", "");
  return {
    r: Number.parseInt(n.slice(0, 2), 16),
    g: Number.parseInt(n.slice(2, 4), 16),
    b: Number.parseInt(n.slice(4, 6), 16),
  };
}

function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function rgbToOklab({ r, g, b }) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabDistance(first, second) {
  const a = rgbToOklab(hexToRgb(first));
  const b = rgbToOklab(hexToRgb(second));
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

// --- dominant color heuristic -------------------------------------------------

const HUE_BUCKETS = 12;

function dominantColors(pixels) {
  // pixels: flat RGBA array. Two passes: chromatic hue-bucket histogram
  // weighted by saturation; greyscale fallback when the logo has no
  // chromatic mass (monochrome brands like Ethena or BlackRock).
  const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
  const grey = { weight: 0, r: 0, g: 0, b: 0 };
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a < 200) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const { h, s, l } = rgbToHsl(r, g, b);
    if (l > 0.93 || l < 0.07) continue; // ignore white/black framing
    if (s < 0.18) {
      // Greys count toward the fallback, mid-tones weighted up.
      const w = 1 - Math.abs(l - 0.45);
      grey.weight += w;
      grey.r += r * w;
      grey.g += g * w;
      grey.b += b * w;
      continue;
    }
    const bucket = buckets[Math.min(HUE_BUCKETS - 1, Math.floor(h * HUE_BUCKETS))];
    const w = s * (1 - Math.abs(l - 0.5) * 0.8);
    bucket.weight += w;
    bucket.r += r * w;
    bucket.g += g * w;
    bucket.b += b * w;
  }
  const ranked = buckets
    .map((bucket, index) => ({ ...bucket, index }))
    .filter((bucket) => bucket.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const toHex = (acc) => rgbToHex({ r: acc.r / acc.weight, g: acc.g / acc.weight, b: acc.b / acc.weight });
  if (ranked.length === 0) {
    if (grey.weight <= 0) return null;
    const greyHex = toHex(grey);
    return { primary: greyHex, secondary: greyHex };
  }
  const primary = toHex(ranked[0]);
  // Secondary: next hue bucket with meaningful mass, else the grey mass,
  // else the primary itself (callers derive shades from it).
  const second = ranked.find((bucket, position) => position > 0 && bucket.weight >= ranked[0].weight * 0.25);
  if (second) return { primary, secondary: toHex(second) };
  if (grey.weight >= ranked[0].weight * 0.25) return { primary, secondary: toHex(grey) };
  return { primary, secondary: primary };
}

function clampPrimary(hex) {
  const { h, s, l } = rgbToHsl(hexToRgb(hex).r, hexToRgb(hex).g, hexToRgb(hex).b);
  const clampedL = Math.max(PRIMARY_LIGHTNESS_MIN, Math.min(PRIMARY_LIGHTNESS_MAX, l));
  return rgbToHex(hslToRgb(h, s, clampedL));
}

function nudgeLightness(hex, delta) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const next = Math.max(0.14, Math.min(0.72, l + delta));
  return rgbToHex(hslToRgb(h, s, next));
}

// --- main ---------------------------------------------------------------------

const logosById = JSON.parse(readFileSync(LOGOS_JSON, "utf8"));
const slugEntries = Object.entries(logosById)
  .filter(([id]) => !/^\d+$/.test(id))
  .sort(([a], [b]) => (a < b ? -1 : 1));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<canvas id='c'></canvas>");

const extracted = {};
const skipped = [];
for (const [id, src] of slugEntries) {
  const filePath = resolve(REPO_ROOT, "public", `.${src}`);
  if (!existsSync(filePath)) {
    skipped.push(`${id} (missing file ${src})`);
    continue;
  }
  const dataUrl = `data:${mimeFor(src)};base64,${readFileSync(filePath).toString("base64")}`;
  const pixels = await page.evaluate(async ({ dataUrl: url, size }) => {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      return null;
    }
    const canvas = document.getElementById("c");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, 0, 0, size, size);
    return Array.from(ctx.getImageData(0, 0, size, size).data);
  }, { dataUrl, size: SAMPLE_SIZE });
  if (!pixels) {
    skipped.push(`${id} (decode failed)`);
    continue;
  }
  const colors = dominantColors(pixels);
  if (!colors) {
    skipped.push(`${id} (no usable pixels)`);
    continue;
  }
  // Compact "#primary|#secondary" packing keeps the checked-in JSON (and the
  // desktop bundle chunk it ships in) small; parsed in
  // `stablecoin-ship-branding.ts`.
  extracted[id] = `${clampPrimary(colors.primary)}|${colors.secondary}`;
}
await browser.close();

// Manual overrides win over extraction.
if (existsSync(OVERRIDES_JSON)) {
  const overrides = JSON.parse(readFileSync(OVERRIDES_JSON, "utf8"));
  for (const [id, entry] of Object.entries(overrides)) {
    extracted[id] = entry;
  }
}

// Deterministic perceptual-distance guard: walk ids in sorted order; when a
// primary lands within MIN_OKLAB_DISTANCE of an already-accepted primary,
// nudge its lightness in alternating directions until it clears.
const ids = Object.keys(extracted).sort();
const accepted = [];
let nudgedCount = 0;
for (const id of ids) {
  const [initialPrimary, secondary] = extracted[id].split("|");
  let primary = initialPrimary;
  let attempt = 0;
  while (attempt < GUARD_MAX_ATTEMPTS && accepted.some((other) => oklabDistance(primary, other) < MIN_OKLAB_DISTANCE)) {
    attempt += 1;
    const direction = attempt % 2 === 1 ? 1 : -1;
    const magnitude = Math.ceil(attempt / 2) * GUARD_LIGHTNESS_STEP;
    primary = nudgeLightness(initialPrimary, direction * magnitude);
  }
  if (primary !== initialPrimary) {
    extracted[id] = `${primary}|${secondary}`;
    nudgedCount += 1;
  }
  accepted.push(primary);
}

const sorted = Object.fromEntries(ids.map((id) => [id, extracted[id]]));
writeFileSync(OUTPUT_JSON, `${JSON.stringify(sorted, null, 1)}\n`);

console.log(`brand-colors: wrote ${ids.length} entries to data/brand-colors.json`);
console.log(`brand-colors: ${nudgedCount} primaries nudged by the distance guard`);
if (skipped.length > 0) {
  console.log(`brand-colors: skipped ${skipped.length}: ${skipped.join(", ")}`);
}
