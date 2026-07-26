#!/usr/bin/env node
/**
 * Deterministically generates the tileable water normal map used by the
 * garden sea shader (Lantern Sea plan, V2/B1). Integer wave-vectors keep the
 * texture perfectly tileable; all phases come from a fixed-seed PRNG so the
 * artifact is reproducible byte-for-byte per (seed, size) pair.
 *
 * Usage: node scripts/pharosville/generate-water-normals.mjs [--size 256]
 * Writes public/pharosville/textures/water-normals.png and prints its sha256.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const SEED = 0x1a97e5ea;
const OUTPUT_DIRECTORY = path.join("public", "pharosville", "textures");
const OUTPUT_PATH = path.join(OUTPUT_DIRECTORY, "water-normals.png");

const sizeArgIndex = process.argv.indexOf("--size");
const size = sizeArgIndex === -1 ? 256 : Number(process.argv[sizeArgIndex + 1]);
if (!Number.isInteger(size) || size < 64 || size > 1024) {
  throw new Error("--size must be an integer between 64 and 1024.");
}

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

/**
 * Wave set: integer cycle counts across the tile so every component tiles
 * exactly. Amplitude falls off with frequency for a calm, rounded surface.
 */
function buildWaves() {
  const random = mulberry32(SEED);
  const waves = [];
  const cycleSets = [
    [1, 2], [2, 1], [2, 3], [3, 2], [1, 4], [4, 1],
    [3, 5], [5, 3], [6, 2], [2, 6], [7, 5], [5, 7],
    [9, 4], [4, 9], [11, 7], [8, 10],
  ];
  for (const [cx, cy] of cycleSets) {
    const frequency = Math.hypot(cx, cy);
    waves.push({
      amplitude: (0.8 + random() * 0.4) / (frequency * frequency),
      cx,
      cy,
      phase: random() * Math.PI * 2,
    });
  }
  return waves;
}

function generatePixels() {
  const waves = buildWaves();
  const tau = Math.PI * 2;
  const pixels = new Uint8ClampedArray(size * size * 4);
  const heightAt = (x, y) => {
    let height = 0;
    for (const wave of waves) {
      height += wave.amplitude * Math.sin(
        tau * ((wave.cx * x) / size + (wave.cy * y) / size) + wave.phase,
      );
    }
    return height;
  };
  const strength = size * 0.055;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const left = heightAt((x - 1 + size) % size, y);
      const right = heightAt((x + 1) % size, y);
      const up = heightAt(x, (y - 1 + size) % size);
      const down = heightAt(x, (y + 1) % size);
      const nx = (left - right) * strength;
      const ny = (up - down) * strength;
      const length = Math.hypot(nx, ny, 1);
      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      pixels[offset + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      pixels[offset + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

async function encodePng(pixels) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent("<canvas id='c'></canvas>");
    const dataUrl = await page.evaluate(({ data, dimension }) => {
      const canvas = document.getElementById("c");
      canvas.width = dimension;
      canvas.height = dimension;
      const context = canvas.getContext("2d");
      const image = context.createImageData(dimension, dimension);
      image.data.set(Uint8ClampedArray.from(atob(data), (char) => char.charCodeAt(0)));
      context.putImageData(image, 0, 0);
      return canvas.toDataURL("image/png");
    }, {
      data: Buffer.from(pixels).toString("base64"),
      dimension: size,
    });
    return Buffer.from(dataUrl.split(",")[1], "base64");
  } finally {
    await browser.close();
  }
}

const png = await encodePng(generatePixels());
mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
writeFileSync(OUTPUT_PATH, png);
const sha256 = createHash("sha256").update(png).digest("hex");
console.log(`${OUTPUT_PATH} ${png.length} bytes size=${size} sha256=${sha256}`);
