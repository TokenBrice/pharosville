import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { GARDEN_WATER_NORMAL_MAP_URL } from "./garden-water";

interface WaterNormalWave {
  cx: number;
  cy: number;
  amplitude: number;
  phase: number;
  secondary: boolean;
}
interface NormalGenerator {
  WATER_NORMAL_SIZE: number;
  WATER_NORMAL_RMS_SLOPE: number;
  buildWaterNormalWaves: (seed?: number) => WaterNormalWave[];
  sampleWaterNormalField: (waves: WaterNormalWave[], x: number, y: number) => {
    height: number; slopeX: number; slopeY: number;
  };
  generateWaterNormalPixels: (size?: number, seed?: number) => Uint8ClampedArray;
  encodeWaterNormalPng: (pixels: Uint8ClampedArray, size: number) => Buffer;
}
const generatorUrl = new URL("../../scripts/pharosville/generate-water-normals.mjs", import.meta.url);
// Intentionally exercise the Node generator's import-only boundary: importing
// must not run its CLI writer. The browser app never imports this module.
const generator = await import(/* @vite-ignore */ generatorUrl.href) as NormalGenerator;

// The normal PNG has one deflated RGBA8 IDAT with unfiltered rows, no browser colour conversion.
const asset = readFileSync(new URL("../../public/pharosville/textures/water-normals.png", import.meta.url));

describe("periodic pond normal generator", () => {
  it("imports pure functions without exporting an image or starting a browser", () => {
    const source = readFileSync(generatorUrl, "utf8");
    expect(source).not.toContain("playwright");
    expect(source).not.toContain("chromium");
    const cliGuard = source.indexOf("if (process.argv[1] && import.meta.url ===");
    expect(cliGuard).toBeGreaterThan(0);
    expect(source.lastIndexOf("writeFileSync(outputPath, png)")).toBeGreaterThan(cliGuard);
    expect(generator.WATER_NORMAL_SIZE).toBe(256);
  });

  it("uses seeded unequal integer bands with at least 85% directional slope energy", () => {
    const waves = generator.buildWaterNormalWaves();
    expect(waves).toEqual(generator.buildWaterNormalWaves());
    expect(waves).not.toEqual(generator.buildWaterNormalWaves(123));
    let totalEnergy = 0;
    let directionalEnergy = 0;
    const frequencies = new Set<string>();
    for (const wave of waves) {
      const frequency = Math.hypot(wave.cx, wave.cy);
      expect(Number.isInteger(wave.cx) && Number.isInteger(wave.cy)).toBe(true);
      expect(frequency).toBeGreaterThanOrEqual(2);
      expect(frequency).toBeLessThanOrEqual(12);
      expect(frequencies.has(`${wave.cx},${wave.cy}`)).toBe(false);
      expect(frequencies.has(`${wave.cy},${wave.cx}`)).toBe(false);
      frequencies.add(`${wave.cx},${wave.cy}`);
      const energy = (wave.amplitude * Math.PI * 2) ** 2 * frequency ** 2 * 0.5;
      totalEnergy += energy;
      if (Math.abs(Math.atan2(wave.cy, wave.cx)) <= 20 * Math.PI / 180) directionalEnergy += energy;
    }
    expect(directionalEnergy / totalEnergy).toBeGreaterThanOrEqual(0.85);
    expect(1 - directionalEnergy / totalEnergy).toBeLessThanOrEqual(0.15);
    expect(Math.sqrt(totalEnergy)).toBeCloseTo(generator.WATER_NORMAL_RMS_SLOPE, 10);
    expect(Math.sqrt(totalEnergy)).toBeLessThanOrEqual(0.06);
    const primary = waves.filter((wave) => !wave.secondary);
    for (let i = 1; i < primary.length; i++) {
      expect(primary[i]!.amplitude).toBeLessThan(primary[i - 1]!.amplitude);
    }
  });

  it("holds height and analytic slope continuously across both periodic seams", () => {
    const waves = generator.buildWaterNormalWaves();
    for (const [x, y] of [[0, 0], [0.17, 0.23], [0.93, 0.71]]) {
      const sample = generator.sampleWaterNormalField(waves, x!, y!);
      for (const shifted of [
        generator.sampleWaterNormalField(waves, x! + 1, y!),
        generator.sampleWaterNormalField(waves, x!, y! + 1),
      ]) {
        expect(shifted.height).toBeCloseTo(sample.height, 12);
        expect(shifted.slopeX).toBeCloseTo(sample.slopeX, 12);
        expect(shifted.slopeY).toBeCloseTo(sample.slopeY, 12);
      }
      const delta = 1e-6;
      const left = generator.sampleWaterNormalField(waves, x! - delta, y!);
      const right = generator.sampleWaterNormalField(waves, x! + delta, y!);
      expect((right.height - left.height) / (2 * delta)).toBeCloseTo(sample.slopeX, 7);
    }
  });

  it("publishes the exact deterministic local linear 256-square normal asset and URL hash", () => {
    const pixels = generator.generateWaterNormalPixels();
    expect(pixels).toEqual(generator.generateWaterNormalPixels());
    const encoded = generator.encodeWaterNormalPng(pixels, 256);
    expect(encoded).toEqual(asset);
    expect(asset.readUInt32BE(16)).toBe(256);
    expect(asset.readUInt32BE(20)).toBe(256);
    expect(asset[24]).toBe(8);
    expect(asset[25]).toBe(6);
    const hash = createHash("sha256").update(asset).digest("hex").slice(0, 12);
    expect(GARDEN_WATER_NORMAL_MAP_URL).toBe(`/pharosville/textures/water-normals.png?v=${hash}`);
    const idatStart = 8 + 25;
    const idatLength = asset.readUInt32BE(idatStart);
    const scanlines = inflateSync(asset.subarray(idatStart + 8, idatStart + 8 + idatLength));
    let slopeEnergy = 0;
    for (let y = 0; y < 256; y++) {
      expect(scanlines[y * 1025]).toBe(0);
      for (let x = 0; x < 256; x++) {
        const offset = y * 1025 + 1 + x * 4;
        const nx = scanlines[offset]! / 255 * 2 - 1;
        const ny = scanlines[offset + 1]! / 255 * 2 - 1;
        const nz = scanlines[offset + 2]! / 255 * 2 - 1;
        expect(nz).toBeGreaterThan(0);
        expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 2);
        slopeEnergy += (nx * nx + ny * ny) / (nz * nz);
      }
    }
    expect(Math.sqrt(slopeEnergy / (256 * 256))).toBeLessThanOrEqual(0.06);
  });

  it("preserves lost mip normal variance instead of renormalizing it away", () => {
    const waves = generator.buildWaterNormalWaves();
    let meanX = 0, meanY = 0, meanZ = 0;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const { slopeX, slopeY } = generator.sampleWaterNormalField(waves, x / 64, y / 64);
        const length = Math.hypot(slopeX, slopeY, 1);
        meanX -= slopeX / length / 4096;
        meanY -= slopeY / length / 4096;
        meanZ += 1 / length / 4096;
      }
    }
    const meanLength = Math.hypot(meanX, meanY, meanZ);
    expect(meanLength).toBeLessThan(1);
    const lostVariance = Math.max(0, 1 - meanLength * meanLength);
    expect(lostVariance).toBeGreaterThan(0);
    expect(Math.sqrt(0.12 ** 2 + lostVariance)).toBeGreaterThan(0.12);
    expect(meanZ / meanLength).toBeCloseTo(1, 5);
  });
});
