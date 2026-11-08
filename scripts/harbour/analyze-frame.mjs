#!/usr/bin/env node
import sharp from "sharp";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Pixel boxes [x,y,width,height], at 1600×1000 heart view. Explicit boxes are REQUIRED for other framing.
 * Tower: lit face only; band: sky/sea behind the hero (tower excluded); fire: lantern/fire;
 * region: open basin, excluding chrome. Defaults are starting regions, not landmark detection.
 */
export const DEFAULT_BOXES = { tower: [760, 330, 16, 65], band: [560, 210, 480, 300], fire: [746, 270, 55, 55], region: [300, 600, 1000, 250] };
export function box(value, width, height) {
  const b = typeof value === "string" ? value.split(",").map(Number) : value;
  if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isInteger) || b[0] < 0 || b[1] < 0 || b[2] <= 0 || b[3] <= 0 || b[0] + b[2] > width || b[1] + b[3] > height) throw new Error("Box must be x,y,width,height inside the image");
  return b;
}
const contains = ([x, y, w, h], px, py) => px >= x && px < x + w && py >= y && py < y + h;
const linear = (v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
export function pixelMetrics(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  const lightness = luminance > 216 / 24389 ? 116 * Math.cbrt(luminance) - 16 : luminance * 24389 / 27;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(max + min - 1));
  return { luminance, lightness, saturation };
}

/** 8-connected bright islands <=maxSpeckArea pixels; larger lit surfaces are not specks. */
export function speckDensity(lightness, width, height, region, threshold = 85, maxSpeckArea = 9) {
  const [x, y, w, h] = box(region, width, height), seen = new Uint8Array(w * h);
  let specks = 0;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const start = yy * w + xx;
    if (seen[start] || lightness[(y + yy) * width + x + xx] < threshold) continue;
    const stack = [start]; seen[start] = 1;
    let area = 0;
    while (stack.length) {
      const i = stack.pop(), sx = i % w, sy = Math.floor(i / w); area++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = sx + dx, ny = sy + dy, next = ny * w + nx;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || seen[next] || lightness[(y + ny) * width + x + nx] < threshold) continue;
        seen[next] = 1; stack.push(next);
      }
    }
    if (area <= maxSpeckArea) specks++;
  }
  return { count: specks, per10kPixels: specks * 10000 / (w * h), thresholdLStar: threshold, maxSpeckArea, connectivity: 8 };
}

/** RGB/sRGB input; brightest-0.7% cutoff ties receive proportional weight (no scan-order bias). */
export function analyzePixels(data, width, height, options = {}) {
  if (!(width > 0 && height > 0) || data.length !== width * height * 3) throw new Error("Expected packed RGB pixels");
  const boxes = Object.fromEntries(Object.entries(DEFAULT_BOXES).map(([key, value]) => [key, box(options[key] ?? value, width, height)]));
  const luminance = new Float64Array(width * height), lightness = new Float64Array(width * height);
  let towerSum = 0, regionL = 0, regionS = 0;
  for (let i = 0; i < luminance.length; i++) {
    const m = pixelMetrics(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]), x = i % width, y = Math.floor(i / width);
    luminance[i] = m.luminance; lightness[i] = m.lightness;
    if (contains(boxes.tower, x, y)) towerSum += m.luminance;
    if (contains(boxes.region, x, y)) { regionL += m.lightness; regionS += m.saturation; }
  }
  const towerLuminance = towerSum / (boxes.tower[2] * boxes.tower[3]);
  let bandPixels = 0, heroBright = 0;
  for (let i = 0; i < luminance.length; i++) {
    const x = i % width, y = Math.floor(i / width);
    if (contains(boxes.band, x, y) && !contains(boxes.tower, x, y)) { bandPixels++; if (luminance[i] >= towerLuminance - 1e-12) heroBright++; }
  }
  if (!bandPixels) throw new Error("Band must include pixels outside the tower box");
  const brightestPixels = Math.max(1, Math.ceil(luminance.length * 0.007));
  const sorted = Float64Array.from(luminance).sort(), cutoff = sorted[sorted.length - brightestPixels];
  let above = 0, tied = 0, fireAbove = 0, fireTied = 0;
  for (let i = 0; i < luminance.length; i++) {
    const fire = contains(boxes.fire, i % width, Math.floor(i / width));
    if (luminance[i] > cutoff) { above++; if (fire) fireAbove++; }
    else if (luminance[i] === cutoff) { tied++; if (fire) fireTied++; }
  }
  const regionPixels = boxes.region[2] * boxes.region[3];
  return { width, height, boxes, hero: { bandShare: heroBright / bandPixels, bandPixels, towerMeanLuminance: towerLuminance, dayTargetMax: 0.25 },
    fire: { brightestShare: (fireAbove + fireTied * (brightestPixels - above) / tied) / brightestPixels, brightestFraction: 0.007, brightestPixels, cutoffLuminance: cutoff, ties: "proportional" },
    specks: speckDensity(lightness, width, height, boxes.region, options.speckL ?? 85, options.maxSpeckArea ?? 9),
    region: { meanLStar: regionL / regionPixels, meanHslSaturation: regionS / regionPixels } };
}
export async function analyzeFrame(path, options) {
  const { data, info } = await sharp(path).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return analyzePixels(data, info.width, info.height, options);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values: a, positionals } = parseArgs({ allowPositionals: true, options: {
    help: { type: "boolean" }, tower: { type: "string" }, band: { type: "string" }, fire: { type: "string" }, region: { type: "string" }, "speck-l": { type: "string" }, "max-speck-area": { type: "string" },
  } });
  if (a.help) console.log("Usage: node scripts/harbour/analyze-frame.mjs IMAGE.png [--tower x,y,w,h --band x,y,w,h --fire x,y,w,h --region x,y,w,h] [--speck-l 85 --max-speck-area 9]\nBoxes use physical pixels; defaults describe 1600×1000 heart view. Metrics screen captures; they do not approve art. See scripts/perf/README.md.");
  else {
    try {
      if (!positionals[0]) throw new Error("Supply a PNG");
      const speckL = Number(a["speck-l"] ?? 85), maxSpeckArea = Number(a["max-speck-area"] ?? 9);
      if (!Number.isFinite(speckL) || speckL < 0 || speckL > 100 || !Number.isInteger(maxSpeckArea) || maxSpeckArea < 1) throw new Error("Invalid speck thresholds");
      console.log(JSON.stringify(await analyzeFrame(positionals[0], { ...a, speckL, maxSpeckArea }), null, 2));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
