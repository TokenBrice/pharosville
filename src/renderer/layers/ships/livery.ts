import type { ShipLivery } from "../../../systems/world-types";
import type { LoadedPharosVilleAsset } from "../../asset-manager";
import { hexToRgba, roundedRectPath, stableVisualVariant } from "../../canvas-primitives";
import { createStatsLruCache, type LruCacheStats } from "../../lru-cache";
import { recolorSailImageData, SHIP_SAIL_TINT_MASKS } from "../../ship-sail-tint";
import {
  SHIP_TRIM_COLOR_STORIES,
  SHIP_TRIM_MARKS,
  type ShipTrimColorStory,
} from "../../ship-visual-config";

// Telemetry shape shared across sail-related caches (sail logo sprites, sail
// emblem sprites, sail tint canvases). Exposed via per-cache getters and merged
// into `__pharosVilleDebug.sailCacheStats` for the perf-dev panel.
export type CacheStats = LruCacheStats;

const SHIP_SAIL_TINT_CACHE_MAX = 256;
const shipSailTintCache = createStatsLruCache<string, HTMLCanvasElement | null>(SHIP_SAIL_TINT_CACHE_MAX);

export function getShipSailTintCacheStats(): CacheStats {
  return shipSailTintCache.stats();
}

export function liveryCacheKey(livery: ShipLivery): string {
  return [
    livery.primary,
    livery.secondary,
    livery.accent,
    livery.sailColor,
    livery.stripePattern,
    livery.sailPanel,
  ].join(":");
}

export function drawShipLiveryTrim(
  ctx: CanvasRenderingContext2D,
  stablecoinId: string,
  livery: ShipLivery,
  visualKey: string,
  x: number,
  y: number,
  scale: number,
) {
  const spec = SHIP_TRIM_MARKS[visualKey];
  if (!spec) return;
  const variant = stableVisualVariant(stablecoinId);
  const story = SHIP_TRIM_COLOR_STORIES[visualKey];
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = trimRgba(story, "rail", livery.primary, 0.88);
  ctx.lineWidth = Math.max(1, 1.15 * scale);
  if (story?.railDash) {
    ctx.setLineDash(story.railDash.map((value) => Math.max(1, value * scale)));
  } else if (variant % 3 === 1) {
    ctx.setLineDash([Math.max(2, 3 * scale), Math.max(1, 1.6 * scale)]);
  }
  drawRelativeLine(ctx, x, y, scale, spec.rail);
  ctx.setLineDash([]);
  if (story?.secondaryRail || variant % 3 === 2) {
    ctx.strokeStyle = story?.secondaryRail ? hexToRgba(story.secondaryRail, 0.82) : hexToRgba(livery.accent, 0.78);
    ctx.lineWidth = Math.max(1, 0.82 * scale);
    drawRelativeLine(ctx, x, y + 2 * scale, scale, spec.rail);
  }

  ctx.strokeStyle = trimRgba(story, "keel", livery.secondary, 0.5);
  ctx.lineWidth = Math.max(1, 0.85 * scale);
  drawRelativeLine(ctx, x, y, scale, spec.keel);

  const stern = spec.stern;
  ctx.fillStyle = trimRgba(story, "sternFill", livery.accent, 0.88);
  roundedRectPath(
    ctx,
    x + stern.x * scale,
    y + stern.y * scale,
    stern.width * scale,
    stern.height * scale,
    Math.max(1, stern.height * scale * 0.25),
  );
  ctx.fill();
  ctx.strokeStyle = trimRgba(story, "sternStroke", livery.secondary, 0.64);
  ctx.stroke();

  const deck = spec.deck[variant % spec.deck.length];
  if (deck) {
    ctx.fillStyle = story
      ? hexToRgba(story.deckFill, 0.88)
      : hexToRgba(variant % 2 === 0 ? livery.logoMatte : livery.accent, 0.86);
    roundedRectPath(
      ctx,
      x + deck.x * scale,
      y + deck.y * scale,
      deck.width * scale,
      deck.height * scale,
      Math.max(1, deck.height * scale * 0.25),
    );
    ctx.fill();
    ctx.strokeStyle = story ? hexToRgba(story.deckStroke, 0.82) : hexToRgba(livery.primary, 0.78);
    ctx.lineWidth = Math.max(1, 0.7 * scale);
    ctx.stroke();
  }
  ctx.restore();
}

function trimRgba(
  story: ShipTrimColorStory | undefined,
  key: "deckFill" | "deckStroke" | "keel" | "rail" | "sternFill" | "sternStroke",
  fallback: string,
  alpha: number,
): string {
  return hexToRgba(story?.[key] ?? fallback, alpha);
}

export function drawProceduralShipLiveryTrim(
  ctx: CanvasRenderingContext2D,
  stablecoinId: string,
  livery: ShipLivery,
  x: number,
  y: number,
  scale: number,
) {
  const variant = stableVisualVariant(stablecoinId);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = hexToRgba(livery.primary, 0.86);
  ctx.lineWidth = Math.max(1, 1.1 * scale);
  ctx.beginPath();
  ctx.moveTo(x - 12 * scale, y + 1 * scale);
  ctx.lineTo(x + 12 * scale, y + 1.5 * scale);
  ctx.stroke();
  ctx.fillStyle = hexToRgba(variant % 2 === 0 ? livery.accent : livery.logoMatte, 0.86);
  roundedRectPath(ctx, x - 5 * scale, y - 6 * scale, 7 * scale, 3.4 * scale, Math.max(1, scale));
  ctx.fill();
  ctx.strokeStyle = hexToRgba(livery.secondary, 0.62);
  ctx.stroke();
  ctx.restore();
}

function drawRelativeLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  line: readonly [number, number, number, number],
) {
  ctx.beginPath();
  ctx.moveTo(x + line[0] * scale, y + line[1] * scale);
  ctx.lineTo(x + line[2] * scale, y + line[3] * scale);
  ctx.stroke();
}

export function drawShipSailTint(
  ctx: CanvasRenderingContext2D,
  asset: LoadedPharosVilleAsset,
  x: number,
  y: number,
  scale: number,
  livery: ShipLivery,
  subpixel: boolean,
) {
  const tint = shipSailTintCanvasFor(asset, livery);
  if (!tint) return;
  const { entry } = asset;
  const width = entry.width * entry.displayScale * scale;
  const height = entry.height * entry.displayScale * scale;
  const destinationX = x - entry.anchor[0] * entry.displayScale * scale;
  const destinationY = y - entry.anchor[1] * entry.displayScale * scale;
  const left = subpixel ? destinationX : Math.round(destinationX);
  const top = subpixel ? destinationY : Math.round(destinationY);
  ctx.save();
  ctx.drawImage(tint, left, top, Math.round(width), Math.round(height));
  ctx.restore();
}

// Per-livery memo of the lower-cased cache-key suffix. Liveries are
// referentially stable across frames (constructed once in ship-visuals.ts),
// so we can collapse `livery.sailColor.toLowerCase()` plus the two sibling
// `.toLowerCase()` calls and the join into one WeakMap lookup per call site
// after warmup. Per-asset prefix is concatenated below.
const liveryLowerKeyCache = new WeakMap<ShipLivery, string>();

function liveryLowerKey(livery: ShipLivery): string {
  const cached = liveryLowerKeyCache.get(livery);
  if (cached !== undefined) return cached;
  const built = `${livery.sailColor.toLowerCase()}:${livery.primary.toLowerCase()}:${livery.accent.toLowerCase()}`;
  liveryLowerKeyCache.set(livery, built);
  return built;
}

function shipSailTintCanvasFor(asset: LoadedPharosVilleAsset, livery: ShipLivery): HTMLCanvasElement | null {
  const { entry, image } = asset;
  const spec = SHIP_SAIL_TINT_MASKS[entry.id];
  const cacheKey = `${entry.id}:${liveryLowerKey(livery)}`;
  const cached = shipSailTintCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const canvas = spec ? createSailTintCanvas(entry.width, entry.height) : null;
  if (!canvas || !spec) {
    rememberShipSailTint(cacheKey, null);
    return null;
  }
  const tintCtx = canvas.getContext("2d", { willReadFrequently: true });
  if (!tintCtx) {
    rememberShipSailTint(cacheKey, null);
    return null;
  }
  try {
    tintCtx.drawImage(image, 0, 0, entry.width, entry.height);
    const imageData = tintCtx.getImageData(0, 0, entry.width, entry.height);
    recolorSailImageData(imageData.data, entry.width, entry.height, spec, livery);
    tintCtx.putImageData(imageData, 0, 0);
  } catch {
    rememberShipSailTint(cacheKey, null);
    return null;
  }
  rememberShipSailTint(cacheKey, canvas);
  return canvas;
}

function rememberShipSailTint(cacheKey: string, canvas: HTMLCanvasElement | null) {
  shipSailTintCache.set(cacheKey, canvas);
}

function createSailTintCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
