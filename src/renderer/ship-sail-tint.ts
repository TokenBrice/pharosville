import type { ShipLivery } from "../systems/world-types";

export type SailMaskPoint = readonly [number, number];
export type SailMaskPolygon = readonly SailMaskPoint[];

export interface SailMaskSpec {
  bounds: { height: number; width: number; x: number; y: number };
  polygons: readonly SailMaskPolygon[];
}

export interface SailTintCoverage {
  coverageRatio: number;
  polygonPixels: number;
  tintablePixels: number;
}

interface RgbColor {
  blue: number;
  green: number;
  red: number;
}

export const SHIP_SAIL_TINT_MASKS: Record<string, SailMaskSpec> = {
  "ship.algo-junk": {
    bounds: { x: 28, y: 4, width: 40, height: 44 },
    polygons: [
      [[31, 8], [62, 20], [56, 43], [35, 36]],
    ],
  },
  "ship.chartered-brigantine": {
    bounds: { x: 24, y: 16, width: 50, height: 56 },
    polygons: [
      [[30, 22], [47, 18], [47, 65], [30, 55]],
      [[48, 18], [66, 26], [65, 62], [49, 66]],
    ],
  },
  "ship.crypto-caravel": {
    bounds: { x: 34, y: 10, width: 42, height: 45 },
    polygons: [
      [[39, 15], [71, 25], [62, 50], [42, 43]],
    ],
  },
  "ship.dao-schooner": {
    bounds: { x: 28, y: 15, width: 42, height: 42 },
    polygons: [
      [[30, 20], [62, 29], [54, 49], [35, 44]],
    ],
  },
  "ship.treasury-galleon": {
    bounds: { x: 22, y: 16, width: 56, height: 56 },
    polygons: [
      [[26, 25], [42, 18], [42, 62], [27, 55]],
      [[43, 19], [58, 18], [58, 67], [43, 64]],
      [[58, 23], [73, 34], [67, 64], [58, 61]],
    ],
  },
  "ship.usdc-titan": {
    bounds: { x: 34, y: 8, width: 96, height: 90 },
    polygons: [
      [[34, 57], [70, 15], [78, 84], [43, 78]],
      [[36, 52], [53, 19], [68, 17], [57, 47], [46, 57]],
      [[70, 25], [96, 16], [97, 76], [74, 73]],
      [[95, 28], [125, 43], [116, 84], [96, 76]],
      [[101, 60], [126, 72], [116, 93], [99, 83]],
      [[73, 79], [96, 76], [105, 94], [81, 91]],
    ],
  },
  "ship.usds-titan": {
    bounds: { x: 26, y: 18, width: 96, height: 76 },
    polygons: [
      [[29, 70], [61, 17], [68, 86], [37, 80]],
      [[27, 58], [46, 23], [61, 18], [48, 52], [36, 64]],
      [[58, 28], [80, 18], [80, 72], [60, 68]],
      [[79, 25], [105, 35], [99, 76], [80, 71]],
      [[96, 43], [121, 58], [109, 90], [96, 78]],
      [[69, 76], [96, 72], [106, 91], [78, 89]],
    ],
  },
  "ship.usdt-titan": {
    bounds: { x: 26, y: 4, width: 138, height: 112 },
    polygons: [
      [[28, 88], [83, 6], [92, 109]],
      [[86, 13], [111, 9], [110, 91], [88, 83]],
      [[112, 16], [141, 30], [135, 96], [111, 91]],
      [[138, 31], [165, 50], [153, 100], [135, 96]],
      [[54, 108], [82, 59], [95, 111], [64, 112]],
      [[95, 84], [123, 91], [113, 111], [96, 105]],
    ],
  },
};

export function recolorSailImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  spec: SailMaskSpec,
  livery: ShipLivery,
): SailTintCoverage {
  const target = sailClothTintTarget(livery);
  let polygonPixels = 0;
  let tintablePixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const inside = isPointInSailMaskSpec(x + 0.5, y + 0.5, spec);
      const alpha = data[offset + 3] ?? 0;
      if (inside && alpha >= 48) polygonPixels += 1;
      if (
        !inside
        || !isSailTintPixel(data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0, alpha)
      ) {
        data[offset + 3] = 0;
        continue;
      }
      tintablePixels += 1;
      const [red, green, blue] = recolorSailPixel(data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0, target);
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = Math.min(235, Math.max(145, alpha));
    }
  }
  return {
    coverageRatio: polygonPixels > 0 ? tintablePixels / polygonPixels : 0,
    polygonPixels,
    tintablePixels,
  };
}

export function sailTintCoverageForPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  spec: SailMaskSpec,
): SailTintCoverage {
  let polygonPixels = 0;
  let tintablePixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (!isPointInSailMaskSpec(x + 0.5, y + 0.5, spec)) continue;
      if ((data[offset + 3] ?? 0) < 48) continue;
      polygonPixels += 1;
      if (isSailTintPixel(data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0, data[offset + 3] ?? 0)) {
        tintablePixels += 1;
      }
    }
  }
  return {
    coverageRatio: polygonPixels > 0 ? tintablePixels / polygonPixels : 0,
    polygonPixels,
    tintablePixels,
  };
}

export function isSailTintPixel(red: number, green: number, blue: number, alpha: number): boolean {
  if (alpha < 48) return false;
  const luminance = colorLuminance(red, green, blue);
  if (luminance < 96) return false;
  if (Math.max(red, green, blue) < 104) return false;
  const warmDarkWood = red > green + 36 && green > blue + 16 && luminance < 178;
  if (warmDarkWood) return false;
  const saturatedDarkInk = Math.max(red, green, blue) - Math.min(red, green, blue) > 96 && luminance < 138;
  return !saturatedDarkInk;
}

export function isPointInSailMaskSpec(x: number, y: number, spec: SailMaskSpec): boolean {
  const { bounds } = spec;
  if (x < bounds.x || y < bounds.y || x > bounds.x + bounds.width || y > bounds.y + bounds.height) return false;
  return spec.polygons.some((polygon) => isPointInPolygon(x, y, polygon));
}

export function isPointInPolygon(x: number, y: number, polygon: SailMaskPolygon): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [xi, yi] = polygon[index] ?? [0, 0];
    const [xj, yj] = polygon[previous] ?? [0, 0];
    const crosses = yi > y !== yj > y;
    if (crosses) {
      const intersectionX = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (x < intersectionX) inside = !inside;
    }
  }
  return inside;
}

export function parseHexColor(hex: string): RgbColor {
  const normalized = hex.replace("#", "");
  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function sailClothTintTarget(livery: ShipLivery): RgbColor {
  const sail = parseHexColor(livery.sailColor);
  const primary = parseHexColor(livery.primary);
  const accent = parseHexColor(livery.accent);
  return {
    red: clampChannel(sail.red * 0.32 + primary.red * 0.48 + accent.red * 0.2),
    green: clampChannel(sail.green * 0.32 + primary.green * 0.48 + accent.green * 0.2),
    blue: clampChannel(sail.blue * 0.32 + primary.blue * 0.48 + accent.blue * 0.2),
  };
}

function recolorSailPixel(red: number, green: number, blue: number, target: RgbColor): [number, number, number] {
  const sourceLuminance = colorLuminance(red, green, blue);
  const shade = clamp(sourceLuminance / 204, 0.68, 1.08);
  const highlight = clamp((sourceLuminance - 238) / 44, 0, 0.06);
  const shadedTarget = {
    red: clampChannel(target.red * shade),
    green: clampChannel(target.green * shade),
    blue: clampChannel(target.blue * shade),
  };
  const liftedTarget = {
    red: mix(shadedTarget.red, 248, highlight),
    green: mix(shadedTarget.green, 244, highlight),
    blue: mix(shadedTarget.blue, 226, highlight),
  };
  return [
    clampChannel(mix(red, liftedTarget.red, 0.99)),
    clampChannel(mix(green, liftedTarget.green, 0.99)),
    clampChannel(mix(blue, liftedTarget.blue, 0.99)),
  ];
}

function colorLuminance(red: number, green: number, blue: number): number {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function mix(first: number, second: number, amount: number): number {
  return first + (second - first) * amount;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampChannel(value: number): number {
  return Math.round(clamp(value, 0, 255));
}
