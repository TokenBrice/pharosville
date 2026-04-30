import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { SHIP_SAIL_TINT_MASKS, sailTintCoverageForPixels } from "./ship-sail-tint";

const SHIP_ASSET_FILES: Record<string, string> = {
  "ship.algo-junk": "algo-junk.png",
  "ship.chartered-brigantine": "chartered-brigantine.png",
  "ship.crypto-caravel": "crypto-caravel.png",
  "ship.dao-schooner": "dao-schooner.png",
  "ship.treasury-galleon": "treasury-galleon.png",
  "ship.usdc-titan": "usdc-titan.png",
  "ship.usdt-titan": "usdt-titan.png",
};

const MIN_SAIL_COVERAGE: Record<string, number> = {
  "ship.algo-junk": 0.34,
  "ship.chartered-brigantine": 0.34,
  "ship.crypto-caravel": 0.34,
  "ship.dao-schooner": 0.34,
  "ship.treasury-galleon": 0.34,
  "ship.usdc-titan": 0.38,
  "ship.usdt-titan": 0.38,
};

describe("ship sail tint masks", () => {
  it("covers actual sail cloth across every ship sprite", () => {
    expect(Object.keys(SHIP_SAIL_TINT_MASKS).sort()).toEqual(Object.keys(SHIP_ASSET_FILES).sort());

    for (const [assetId, fileName] of Object.entries(SHIP_ASSET_FILES)) {
      const image = readRgbaPng(path.resolve("public/pharosville/assets/ships", fileName));
      const spec = SHIP_SAIL_TINT_MASKS[assetId];
      expect(spec).toBeDefined();
      const coverage = sailTintCoverageForPixels(image.data, image.width, image.height, spec!);

      expect(coverage.polygonPixels, `${assetId} polygon pixels`).toBeGreaterThan(150);
      expect(coverage.tintablePixels, `${assetId} tintable pixels`).toBeGreaterThan(80);
      expect(coverage.coverageRatio, `${assetId} sail coverage`).toBeGreaterThanOrEqual(MIN_SAIL_COVERAGE[assetId] ?? 0.34);
    }
  });
});

function readRgbaPng(filePath: string): { data: Uint8ClampedArray; height: number; width: number } {
  const bytes = readFileSync(filePath);
  expect(bytes.toString("hex", 0, 8)).toBe("89504e470d0a1a0a");
  let offset = 8;
  let width = 0;
  let height = 0;
  const idatChunks: Buffer[] = [];

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunk = bytes.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      expect(chunk[8]).toBe(8);
      expect(chunk[9]).toBe(6);
      expect(chunk[12]).toBe(0);
    } else if (type === "IDAT") {
      idatChunks.push(chunk);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const output = Buffer.alloc(width * height * bytesPerPixel);
  let inputOffset = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const source = inflated.subarray(inputOffset, inputOffset + stride);
    inputOffset += stride;
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] ?? 0 : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] ?? 0 : 0;
      row[x] = unfilterByte(source[x] ?? 0, filter ?? 0, left, up, upLeft);
    }
    row.copy(output, y * stride);
    previous = row;
  }

  return { data: new Uint8ClampedArray(output), height, width };
}

function unfilterByte(value: number, filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) return value;
  if (filter === 1) return (value + left) & 0xff;
  if (filter === 2) return (value + up) & 0xff;
  if (filter === 3) return (value + Math.floor((left + up) / 2)) & 0xff;
  if (filter === 4) return (value + paethPredictor(left, up, upLeft)) & 0xff;
  throw new Error(`Unsupported PNG filter ${filter}`);
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}
