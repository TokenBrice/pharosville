#!/usr/bin/env node
/** Deterministic, periodic pond normals. Importing this module never writes an asset. */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

export const WATER_NORMAL_SIZE = 256;
export const WATER_NORMAL_SEED = 0x1a97e5ea;
export const WATER_NORMAL_RMS_SLOPE = 0.045;
const TAU = Math.PI * 2;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer 2–12 cycle vectors; 95% of analytic slope energy is within ±20° of X. */
export function buildWaterNormalWaves(seed = WATER_NORMAL_SEED) {
  const random = mulberry32(seed);
  const waves = [[2, 0], [3, 0], [4, 1], [5, -1], [6, 1], [7, -2], [9, 1], [11, -2], [2, 3]]
    .map(([cx, cy], index) => ({
      cx, cy, secondary: index === 8,
      amplitude: (0.85 + random() * 0.3) / Math.pow(Math.hypot(cx, cy), 2),
      phase: random() * TAU,
    }));
  let primaryEnergy = 0;
  let secondaryEnergy = 0;
  for (const wave of waves) {
    const energy = Math.pow(wave.amplitude * TAU, 2) * (wave.cx * wave.cx + wave.cy * wave.cy) * 0.5;
    if (wave.secondary) secondaryEnergy += energy;
    else primaryEnergy += energy;
  }
  for (const wave of waves) {
    const share = wave.secondary ? 0.05 : 0.95;
    const energy = wave.secondary ? secondaryEnergy : primaryEnergy;
    wave.amplitude *= WATER_NORMAL_RMS_SLOPE * Math.sqrt(share / energy);
  }
  return waves;
}

/** Analytic height and slopes at normalized, unwrapped tile coordinates. */
export function sampleWaterNormalField(waves, x, y) {
  let height = 0;
  let slopeX = 0;
  let slopeY = 0;
  for (const wave of waves) {
    const phase = TAU * (wave.cx * x + wave.cy * y) + wave.phase;
    height += wave.amplitude * Math.sin(phase);
    const derivative = wave.amplitude * TAU * Math.cos(phase);
    slopeX += derivative * wave.cx;
    slopeY += derivative * wave.cy;
  }
  return { height, slopeX, slopeY };
}

export function generateWaterNormalPixels(size = WATER_NORMAL_SIZE, seed = WATER_NORMAL_SEED) {
  const waves = buildWaterNormalWaves(seed);
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const { slopeX, slopeY } = sampleWaterNormalField(waves, x / size, y / size);
      const length = Math.hypot(slopeX, slopeY, 1);
      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round((0.5 - slopeX / length * 0.5) * 255);
      pixels[offset + 1] = Math.round((0.5 - slopeY / length * 0.5) * 255);
      pixels[offset + 2] = Math.round((0.5 + 1 / length * 0.5) * 255);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

/** PNG RGBA8, filter 0: no browser, colour conversion, timestamps or external encoder. */
export function encodeWaterNormalPng(pixels, size) {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let crc = n;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    crcTable[n] = crc >>> 0;
  }
  const chunk = (type, data) => {
    const output = Buffer.alloc(data.length + 12);
    output.writeUInt32BE(data.length, 0);
    output.write(type, 4, 4, "ascii");
    data.copy(output, 8);
    let crc = 0xffffffff;
    for (let i = 4; i < data.length + 8; i++) crc = crcTable[(crc ^ output[i]) & 255] ^ (crc >>> 8);
    output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, data.length + 8);
    return output;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  const bytes = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  for (let y = 0; y < size; y++) bytes.copy(scanlines, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const sizeArgIndex = process.argv.indexOf("--size");
  const size = sizeArgIndex === -1 ? WATER_NORMAL_SIZE : Number(process.argv[sizeArgIndex + 1]);
  if (!Number.isInteger(size) || size < 64 || size > 1024) throw new Error("--size must be an integer between 64 and 1024.");
  const outputDirectory = path.join("public", "pharosville", "textures");
  const outputPath = path.join(outputDirectory, "water-normals.png");
  const png = encodeWaterNormalPng(generateWaterNormalPixels(size), size);
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(outputPath, png);
  console.log(`${outputPath} ${png.length} bytes size=${size} sha256=${createHash("sha256").update(png).digest("hex")}`);
}
