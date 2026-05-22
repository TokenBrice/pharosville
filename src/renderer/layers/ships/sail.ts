import type { PharosVilleWorld, ShipLivery, ShipLogoShape, ShipSizeTier, ShipStripePattern } from "../../../systems/world-types";
import type { LoadedPharosVilleAsset, PharosVilleAssetManager } from "../../asset-manager";
import { hexToRgba, readableInkForFill, roundedRectPath } from "../../canvas-primitives";
import { createStatsLruCache } from "../../lru-cache";
import { pickSailEmblemInk, SHIP_SAIL_TINT_MASKS } from "../../ship-sail-tint";
import {
  HERITAGE_NAMEPLATE_MIN_ZOOM,
  SHIP_HERITAGE_NAMEPLATES,
  SHIP_PENNANT_MARKS,
  PROCEDURAL_SHIP_PENNANT_MARK,
  SHIP_SAIL_MARKS,
  type ShipPennantSpec,
} from "../../ship-visual-config";
import { clamp, multiplyGlobalAlpha } from "./draw-ship";
import type { CacheStats } from "./livery";

/**
 * W6.04 (decision D8 §6) — Heritage-tier stern engraving. Paints the
 * `SHIP_HERITAGE_NAMEPLATES[spriteAssetId]` label as 4 px serif lettering
 * along the lower stern. Gated on `camera.zoom >= 0.7` (tighter than the
 * dock-plaque gate at 0.55 — heritage nameplates are inspect-a-hull-level
 * detail). No-op for ships without a heritage entry. Designed to layer onto
 * the existing heritage hull paint without obscuring the painted emblem.
 */
export function drawHeritageNameplate(
  ctx: CanvasRenderingContext2D,
  spriteAssetId: string | null | undefined,
  shipScreenX: number,
  shipScreenY: number,
  zoom: number,
  scale: number,
): void {
  if (!spriteAssetId) return;
  if (zoom < HERITAGE_NAMEPLATE_MIN_ZOOM) return;
  const label = SHIP_HERITAGE_NAMEPLATES[spriteAssetId];
  if (!label) return;
  ctx.save();
  // 4 px serif lettering scaled with the ship; cream on dark-wood stern.
  const fontPx = Math.max(4, Math.round(4 * zoom * 0.8));
  ctx.font = `${fontPx}px "PV Plaque", "Times New Roman", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  // Tiny outline so the engraving reads against any stern color.
  ctx.lineWidth = Math.max(1, Math.round(zoom));
  ctx.strokeStyle = "rgba(20, 14, 8, 0.85)";
  ctx.fillStyle = "rgba(238, 220, 178, 0.92)";
  // Stern offset: ~6 px below the ship anchor at 1.0 scale, scaled by ship + zoom.
  const sternY = shipScreenY - 4 * zoom * scale;
  ctx.strokeText(label, shipScreenX, sternY);
  ctx.fillText(label, shipScreenX, sternY);
  ctx.restore();
}

export function pennantSpecForShip(ship: PharosVilleWorld["ships"][number], hasAsset: boolean): ShipPennantSpec {
  if (!hasAsset) return PROCEDURAL_SHIP_PENNANT_MARK;
  return SHIP_PENNANT_MARKS[ship.visual.spriteAssetId ?? ship.visual.hull]
    ?? SHIP_PENNANT_MARKS[ship.visual.hull]
    ?? SHIP_PENNANT_MARKS["treasury-galleon"]!;
}

export function signalOverlayAnchor(
  ship: PharosVilleWorld["ships"][number],
  x: number,
  y: number,
  scale: number,
  standardSprite: boolean,
): { x: number; y: number } {
  if (standardSprite) {
    const spec = pennantSpecForShip(ship, true);
    return {
      x: x + (spec.mastTopX - 7) * scale,
      y: y + (spec.mastTopY + 9) * scale,
    };
  }
  const sail = SHIP_SAIL_MARKS[ship.visual.spriteAssetId ?? ship.visual.hull]
    ?? SHIP_SAIL_MARKS[ship.visual.hull]
    ?? SHIP_SAIL_MARKS["treasury-galleon"]!;
  return {
    x: x + (sail.x - sail.width * 0.72) * scale,
    y: y + (sail.y - sail.height * 0.62) * scale,
  };
}

export function shouldDrawBowspritLogoMark(sizeTier: ShipSizeTier): boolean {
  return sizeTier === "regional" || sizeTier === "major" || sizeTier === "flagship";
}

export function drawMastPennantChrome(
  ctx: CanvasRenderingContext2D,
  livery: ShipLivery,
  mark: string,
  x: number,
  y: number,
  scale: number,
  spec: ShipPennantSpec,
  sailFlutter = 0,
) {
  const mastX = x + spec.mastTopX * scale;
  const mastY = y + spec.mastTopY * scale;
  const width = spec.pennantWidth * scale;
  const height = spec.pennantHeight * scale;
  const flutter = clamp(sailFlutter, 0, 1) * scale;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(36, 25, 18, 0.82)";
  ctx.lineWidth = Math.max(1, 1 * scale);
  ctx.beginPath();
  ctx.moveTo(mastX, mastY + spec.poleHeight * scale);
  ctx.lineTo(mastX, mastY - 1 * scale);
  ctx.stroke();

  ctx.fillStyle = hexToRgba(livery.primary, 0.94);
  ctx.strokeStyle = "rgba(37, 25, 16, 0.76)";
  ctx.lineWidth = Math.max(1, 0.8 * scale);
  ctx.beginPath();
  ctx.moveTo(mastX, mastY);
  ctx.lineTo(mastX + width + flutter * 2.6, mastY + height * 0.16 - flutter * 0.7);
  ctx.lineTo(mastX + width * 0.72 + flutter * 1.2, mastY + height * 0.5);
  ctx.lineTo(mastX + width + flutter * 2.1, mastY + height * 0.84 + flutter * 0.55);
  ctx.lineTo(mastX, mastY + height);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = hexToRgba(readableInkForFill(livery.primary), 0.52);
  ctx.font = `800 ${Math.max(5, height * 0.76)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(mark.slice(0, 3).toUpperCase(), mastX + width * 0.42, mastY + height * 0.52, width * 0.58);

  drawMastLantern(ctx, x + spec.lanternX * scale, y + spec.lanternY * scale, scale);
  ctx.restore();
}

function drawMastLantern(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const radius = Math.max(1.6, 2.6 * scale);
  ctx.save();
  ctx.fillStyle = "rgba(63, 41, 22, 0.82)";
  ctx.beginPath();
  ctx.ellipse(x, y, radius * 0.82, radius * 1.12, 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(248, 210, 126, 0.92)";
  ctx.beginPath();
  ctx.ellipse(x, y, radius * 0.42, radius * 0.58, 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(19, 13, 8, 0.7)";
  ctx.lineWidth = Math.max(1, 0.65 * scale);
  ctx.beginPath();
  ctx.ellipse(x, y, radius * 0.82, radius * 1.12, 0.05, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawBowspritLogoMark(input: {
  ctx: CanvasRenderingContext2D;
  livery: ShipLivery;
  logo: ReturnType<PharosVilleAssetManager["getLogo"]>;
  mark: string;
  scale: number;
  spec: ShipPennantSpec;
  x: number;
  y: number;
}) {
  const { ctx, livery, logo, mark, scale, spec, x, y } = input;
  const size = Math.max(4, spec.bowLogoSize * scale);
  const cx = x + spec.bowLogoX * scale;
  const cy = y + spec.bowLogoY * scale;
  ctx.save();
  logoShapePath(ctx, livery.logoShape, cx, cy, size, size * 0.82);
  ctx.fillStyle = hexToRgba(livery.primary, 0.86);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(livery.accent, 0.82);
  ctx.lineWidth = Math.max(1, 0.7 * scale);
  ctx.stroke();
  if (logo) {
    ctx.save();
    logoShapePath(ctx, livery.logoShape, cx, cy, size * 0.78, size * 0.66);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(logo.image, cx - size * 0.36, cy - size * 0.36, size * 0.72, size * 0.72);
    ctx.restore();
  } else {
    ctx.fillStyle = hexToRgba(readableInkForFill(livery.primary), 0.78);
    ctx.font = `800 ${Math.max(4, size * 0.48)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(mark.slice(0, 2).toUpperCase(), cx, cy, size * 0.8);
  }
  ctx.restore();
}

export function drawSailLogo(input: {
  ctx: CanvasRenderingContext2D;
  height: number;
  livery: ShipLivery;
  logo: ReturnType<PharosVilleAssetManager["getLogo"]>;
  mark: string;
  sailColor: string;
  stripeColor: string;
  width: number;
  x: number;
  y: number;
}) {
  const { ctx, height, livery, logo, mark, sailColor, stripeColor, width, x, y } = input;
  const safeWidth = Math.max(6, width * 1.14);
  const safeHeight = Math.max(6, height * 1.1);
  const widthPx = Math.max(6, Math.round(safeWidth));
  const heightPx = Math.max(6, Math.round(safeHeight));
  const sprite = getSailLogoSprite(livery, sailColor, stripeColor, mark, logo, widthPx, heightPx);
  if (sprite) {
    ctx.drawImage(
      sprite.canvas,
      Math.round(x - sprite.anchorX),
      Math.round(y - sprite.anchorY),
    );
    return;
  }
  drawSailLogoInline(ctx, {
    height,
    livery,
    logo,
    mark,
    sailColor,
    stripeColor,
    width,
    x,
    y,
  });
}

// Sprite cache for sail logos. The logo is fully determined by the livery
// fields, sail/stripe colors, the 3-char mark fallback, the logo image
// identity (its `src`), and integer-bucketed width/height. Liveries are
// shared across squad consorts (~10 unique liveries in a typical scene),
// width/height settle into 2-3 buckets per camera zoom; total cardinality
// is comfortably under the LRU cap.
const SAIL_LOGO_SPRITE_CACHE_MAX = 128;
interface SailLogoSprite {
  canvas: HTMLCanvasElement;
  anchorX: number;
  anchorY: number;
}
const sailLogoSpriteCache = createStatsLruCache<string, SailLogoSprite | null>(SAIL_LOGO_SPRITE_CACHE_MAX);

export function getSailLogoSpriteCacheStats(): CacheStats {
  return sailLogoSpriteCache.stats();
}

function liverySpriteFingerprint(livery: ShipLivery): string {
  return `${livery.sailPanel}|${livery.stripePattern}|${livery.logoShape}|${livery.logoMatte}|${livery.primary}|${livery.accent}`;
}

function sailLogoSpriteKey(
  livery: ShipLivery,
  sailColor: string,
  stripeColor: string,
  mark: string,
  logo: ReturnType<PharosVilleAssetManager["getLogo"]>,
  widthPx: number,
  heightPx: number,
): string {
  const liveryKey = liverySpriteFingerprint(livery);
  const logoKey = logo ? `img:${logo.src}` : `txt:${mark.slice(0, 3).toUpperCase()}`;
  return `${liveryKey}|${sailColor}|${stripeColor}|${widthPx}x${heightPx}|${logoKey}`;
}

function rememberSailLogoSprite(key: string, sprite: SailLogoSprite | null) {
  sailLogoSpriteCache.set(key, sprite);
}

function getSailLogoSprite(
  livery: ShipLivery,
  sailColor: string,
  stripeColor: string,
  mark: string,
  logo: ReturnType<PharosVilleAssetManager["getLogo"]>,
  widthPx: number,
  heightPx: number,
): SailLogoSprite | null {
  const key = sailLogoSpriteKey(livery, sailColor, stripeColor, mark, logo, widthPx, heightPx);
  const cached = sailLogoSpriteCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const sprite = buildSailLogoSprite(livery, sailColor, stripeColor, mark, logo, widthPx, heightPx);
  rememberSailLogoSprite(key, sprite);
  return sprite;
}

function buildSailLogoSprite(
  livery: ShipLivery,
  sailColor: string,
  stripeColor: string,
  mark: string,
  logo: ReturnType<PharosVilleAssetManager["getLogo"]>,
  widthPx: number,
  heightPx: number,
): SailLogoSprite | null {
  if (typeof document === "undefined") return null;
  // The inline draw paints within ±widthPx/2, ±heightPx/2 around its origin.
  // Pad by stroke half-width (max stroke is widthPx*0.08) plus 1px for safety.
  const padX = Math.ceil(Math.max(2, widthPx * 0.05));
  const padY = Math.ceil(Math.max(2, heightPx * 0.05));
  const canvasWidth = widthPx + padX * 2;
  const canvasHeight = heightPx + padY * 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const spriteCtx = canvas.getContext("2d");
  if (!spriteCtx) return null;
  // The inline path translates to (round(x), round(y)) and uses safeWidth/
  // safeHeight derived from the input width/height. We pre-bucketed those
  // to widthPx/heightPx, so build a synthetic input that yields exactly
  // safeWidth=widthPx and safeHeight=heightPx after the same Math.max
  // expansion. width*1.14 = widthPx → width = widthPx/1.14; height*1.1 →
  // height = heightPx/1.1.
  // Floor to ensure integer anchors; the sail polygon is symmetric around
  // its origin, so picking the floor of the half-width is visually
  // identical to the half-pixel center.
  const anchorX = padX + Math.floor(widthPx / 2);
  const anchorY = padY + Math.floor(heightPx / 2);
  drawSailLogoInline(spriteCtx, {
    height: heightPx / 1.1,
    livery,
    logo,
    mark,
    sailColor,
    stripeColor,
    width: widthPx / 1.14,
    x: anchorX,
    y: anchorY,
  });
  return { canvas, anchorX, anchorY };
}

function drawSailLogoInline(
  ctx: CanvasRenderingContext2D,
  input: {
    height: number;
    livery: ShipLivery;
    logo: ReturnType<PharosVilleAssetManager["getLogo"]>;
    mark: string;
    sailColor: string;
    stripeColor: string;
    width: number;
    x: number;
    y: number;
  },
) {
  const { height, livery, logo, mark, sailColor, stripeColor, width, x, y } = input;
  const safeWidth = Math.max(6, width * 1.14);
  const safeHeight = Math.max(6, height * 1.1);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.fillStyle = sailColor;
  ctx.strokeStyle = "rgba(43, 28, 18, 0.72)";
  ctx.lineWidth = Math.max(1, safeWidth * 0.08);
  ctx.beginPath();
  ctx.moveTo(-safeWidth * 0.42, -safeHeight * 0.48);
  ctx.lineTo(safeWidth * 0.42, -safeHeight * 0.36);
  ctx.lineTo(safeWidth * 0.36, safeHeight * 0.34);
  ctx.lineTo(-safeWidth * 0.36, safeHeight * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.clip();
  drawLiverySailPanel(ctx, livery, safeWidth, safeHeight);
  drawLiveryStripePattern(ctx, livery.stripePattern, stripeColor, safeWidth, safeHeight);
  ctx.fillStyle = "rgba(255, 250, 222, 0.32)";
  ctx.fillRect(-safeWidth * 0.38, -safeHeight * 0.41, safeWidth * 0.22, safeHeight * 0.82);
  ctx.restore();

  const matteWidth = safeWidth * 0.82;
  const matteHeight = safeHeight * 0.78;
  ctx.save();
  logoShapePath(ctx, livery.logoShape, 0, -safeHeight * 0.04, matteWidth, matteHeight);
  ctx.fillStyle = livery.logoMatte;
  ctx.fill();
  ctx.strokeStyle = hexToRgba(livery.primary, 0.86);
  ctx.lineWidth = Math.max(1, safeWidth * 0.07);
  ctx.stroke();
  ctx.restore();

  if (logo) {
    ctx.save();
    logoShapePath(ctx, livery.logoShape, 0, -safeHeight * 0.04, matteWidth * 0.8, matteHeight * 0.8);
    ctx.clip();
    const size = Math.round(Math.min(safeWidth, safeHeight) * 0.82);
    ctx.drawImage(logo.image, -size / 2, -safeHeight * 0.04 - size / 2, size, size);
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = readableInkForFill(livery.logoMatte);
    ctx.font = `800 ${Math.max(5, Math.min(safeHeight * 0.72, safeWidth * 0.48))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(mark.slice(0, 3).toUpperCase(), 0, -safeHeight * 0.02, safeWidth * 0.58);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }
  ctx.restore();
}

// Generic-hull emblem path. Replaces the white-matte "sticker" with a
// silhouette of the issuer logo (or 3-letter glyph) painted directly on
// the recolored sail cloth, clipped to the sail polygon transformed into
// hull-pose-local screen space. Visually matches the crvUSD heritage hull
// where the llama mark is baked into the sail art instead of layered on
// top — see plan §B in agents/.
export function drawDyedSailEmblem(input: {
  asset: LoadedPharosVilleAsset;
  ctx: CanvasRenderingContext2D;
  drawScale: number;
  drawX: number;
  drawY: number;
  livery: ShipLivery;
  logo: ReturnType<PharosVilleAssetManager["getLogo"]>;
  mark: string;
  sailMark: { height: number; width: number; x: number; y: number };
}) {
  const { asset, ctx, drawScale, drawX, drawY, livery, logo, mark, sailMark } = input;
  const spec = SHIP_SAIL_TINT_MASKS[asset.entry.id];
  if (!spec) return;
  const widthPx = Math.max(8, Math.round(sailMark.width * drawScale * 1.05));
  const heightPx = Math.max(8, Math.round(sailMark.height * drawScale * 1.05));
  const ink = pickSailEmblemInk(livery);
  const sprite = getSailEmblemSilhouetteSprite(asset, livery, logo, mark, ink, widthPx, heightPx, sailMark);
  if (!sprite) return;

  const [anchorX, anchorY] = asset.entry.anchor;
  const ds = asset.entry.displayScale * drawScale;

  ctx.save();
  // ctx is already inside drawWithShipPose's translate/rotate-around-(drawX,drawY)
  // sandwich, so polygon vertices are emitted in screen-space; the active
  // transform applies pose-roll automatically.
  ctx.beginPath();
  for (const polygon of spec.polygons) {
    if (polygon.length === 0) continue;
    const first = polygon[0];
    if (!first) continue;
    ctx.moveTo(drawX + (first[0] - anchorX) * ds, drawY + (first[1] - anchorY) * ds);
    for (let index = 1; index < polygon.length; index += 1) {
      const point = polygon[index];
      if (!point) continue;
      ctx.lineTo(drawX + (point[0] - anchorX) * ds, drawY + (point[1] - anchorY) * ds);
    }
    ctx.closePath();
  }
  ctx.clip("evenodd");
  // Slight translucency so the recolored cloth shading reads through and
  // the emblem feels printed/dyed rather than glued on.
  multiplyGlobalAlpha(ctx, 0.88);
  ctx.drawImage(
    sprite.canvas,
    Math.round(drawX + sailMark.x * drawScale - sprite.anchorX),
    Math.round(drawY + sailMark.y * drawScale - sprite.anchorY),
  );
  ctx.restore();
}

const SAIL_EMBLEM_SPRITE_CACHE_MAX = 128;
const sailEmblemSpriteCache = createStatsLruCache<string, SailLogoSprite | null>(SAIL_EMBLEM_SPRITE_CACHE_MAX);

export function getSailEmblemSpriteCacheStats(): CacheStats {
  return sailEmblemSpriteCache.stats();
}

function sailEmblemSpriteKey(
  asset: LoadedPharosVilleAsset,
  livery: ShipLivery,
  logo: ReturnType<PharosVilleAssetManager["getLogo"]>,
  mark: string,
  ink: string,
  widthPx: number,
  heightPx: number,
  sailMark: { height: number; width: number; x: number; y: number },
): string {
  const logoKey = logo ? `img:${logo.src}` : `txt:${mark.slice(0, 3).toUpperCase()}`;
  const markKey = `${sailMark.x},${sailMark.y},${sailMark.width},${sailMark.height}`;
  return `${asset.entry.id}|${livery.logoMatte}|${livery.primary}|${ink}|${widthPx}x${heightPx}|${logoKey}|${markKey}`;
}

function getSailEmblemSilhouetteSprite(
  asset: LoadedPharosVilleAsset,
  livery: ShipLivery,
  logo: ReturnType<PharosVilleAssetManager["getLogo"]>,
  mark: string,
  ink: string,
  widthPx: number,
  heightPx: number,
  sailMark: { height: number; width: number; x: number; y: number },
): SailLogoSprite | null {
  const key = sailEmblemSpriteKey(asset, livery, logo, mark, ink, widthPx, heightPx, sailMark);
  const cached = sailEmblemSpriteCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const sprite = buildSailEmblemSilhouetteSprite(asset, logo, mark, ink, widthPx, heightPx, sailMark);
  sailEmblemSpriteCache.set(key, sprite);
  return sprite;
}

function buildSailEmblemSilhouetteSprite(
  asset: LoadedPharosVilleAsset,
  logo: ReturnType<PharosVilleAssetManager["getLogo"]>,
  mark: string,
  ink: string,
  widthPx: number,
  heightPx: number,
  sailMark: { height: number; width: number; x: number; y: number },
): SailLogoSprite | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (logo) {
    ctx.imageSmoothingEnabled = false;
    const size = Math.round(Math.min(widthPx, heightPx) * 0.96);
    const offsetX = Math.round((widthPx - size) / 2);
    const offsetY = Math.round((heightPx - size) / 2);
    ctx.drawImage(logo.image, offsetX, offsetY, size, size);
  } else {
    ctx.fillStyle = ink;
    ctx.font = `800 ${Math.max(6, Math.min(heightPx * 0.78, widthPx * 0.5))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(mark.slice(0, 3).toUpperCase(), widthPx / 2, heightPx / 2, widthPx * 0.92);
  }
  bakeSailFoldShading(ctx, asset, sailMark, widthPx, heightPx);
  return { canvas, anchorX: Math.round(widthPx / 2), anchorY: Math.round(heightPx / 2) };
}

// Modulate the silhouette's RGB by the underlying source-PNG sail luminance so
// the emblem inherits cloth fold-darkening — same effect crvUSD got by hand
// painting its llama with fold-aware shading. Done at sprite-build time so
// the runtime path stays a single drawImage.
function bakeSailFoldShading(
  spriteCtx: CanvasRenderingContext2D,
  asset: LoadedPharosVilleAsset,
  sailMark: { height: number; width: number; x: number; y: number },
  widthPx: number,
  heightPx: number,
) {
  const sailCanvas = document.createElement("canvas");
  sailCanvas.width = widthPx;
  sailCanvas.height = heightPx;
  const sailCtx = sailCanvas.getContext("2d");
  if (!sailCtx) return;
  // Source PNG region under the emblem: hull-anchor + sailMark center,
  // extent matches the runtime 1.05× safety margin so source/sprite align.
  const [anchorX, anchorY] = asset.entry.anchor;
  const srcW = sailMark.width * 1.05;
  const srcH = sailMark.height * 1.05;
  const srcX = anchorX + sailMark.x - srcW / 2;
  const srcY = anchorY + sailMark.y - srcH / 2;
  sailCtx.imageSmoothingEnabled = false;
  sailCtx.drawImage(asset.image, srcX, srcY, srcW, srcH, 0, 0, widthPx, heightPx);

  let sailData: ImageData;
  let spriteData: ImageData;
  try {
    sailData = sailCtx.getImageData(0, 0, widthPx, heightPx);
    spriteData = spriteCtx.getImageData(0, 0, widthPx, heightPx);
  } catch {
    return;
  }
  // Survey sail luminance to anchor the modulation range. Brightest sail
  // pixel becomes 1.0 (no darkening); darker folds darken the kraken
  // proportionally, floored at 0.55 so the silhouette still reads.
  let maxLum = 0;
  let sumLum = 0;
  let count = 0;
  for (let i = 0; i < sailData.data.length; i += 4) {
    if (sailData.data[i + 3]! === 0) continue;
    const lum = 0.2126 * sailData.data[i]! + 0.7152 * sailData.data[i + 1]! + 0.0722 * sailData.data[i + 2]!;
    if (lum > maxLum) maxLum = lum;
    sumLum += lum;
    count += 1;
  }
  if (maxLum <= 0) return;
  const meanLum = count > 0 ? sumLum / count : maxLum;

  for (let i = 0; i < spriteData.data.length; i += 4) {
    if (spriteData.data[i + 3]! === 0) continue;
    const sailA = sailData.data[i + 3]!;
    const sl = sailA === 0
      ? meanLum
      : 0.2126 * sailData.data[i]! + 0.7152 * sailData.data[i + 1]! + 0.0722 * sailData.data[i + 2]!;
    const ratio = sl / maxLum;
    const mod = ratio < 0.55 ? 0.55 : ratio > 1 ? 1 : ratio;
    spriteData.data[i] = Math.round(spriteData.data[i]! * mod);
    spriteData.data[i + 1] = Math.round(spriteData.data[i + 1]! * mod);
    spriteData.data[i + 2] = Math.round(spriteData.data[i + 2]! * mod);
  }
  spriteCtx.putImageData(spriteData, 0, 0);
}

function drawLiverySailPanel(ctx: CanvasRenderingContext2D, livery: ShipLivery, width: number, height: number) {
  ctx.fillStyle = hexToRgba(livery.accent, 0.24);
  if (livery.sailPanel === "field") {
    ctx.fillRect(-width * 0.42, -height * 0.44, width * 0.84, height * 0.88);
  } else if (livery.sailPanel === "hoist") {
    ctx.fillRect(-width * 0.42, -height * 0.44, width * 0.3, height * 0.88);
  } else if (livery.sailPanel === "quartered") {
    ctx.fillRect(-width * 0.42, -height * 0.44, width * 0.42, height * 0.44);
    ctx.fillRect(0, 0, width * 0.42, height * 0.44);
  } else {
    roundedRectPath(ctx, -width * 0.32, -height * 0.32, width * 0.64, height * 0.62, Math.max(1, width * 0.12));
    ctx.fill();
  }
}

function drawLiveryStripePattern(
  ctx: CanvasRenderingContext2D,
  pattern: ShipStripePattern,
  color: string,
  width: number,
  height: number,
) {
  ctx.fillStyle = hexToRgba(color, 0.84);
  ctx.strokeStyle = hexToRgba(color, 0.88);
  ctx.lineWidth = Math.max(1, height * 0.12);
  if (pattern === "double") {
    ctx.fillRect(-width * 0.43, height * 0.08, width * 0.88, Math.max(1, height * 0.1));
    ctx.fillRect(-width * 0.43, height * 0.27, width * 0.88, Math.max(1, height * 0.1));
  } else if (pattern === "diagonal") {
    ctx.save();
    ctx.rotate(-0.42);
    ctx.fillRect(-width * 0.54, height * 0.08, width * 1.08, Math.max(1.2, height * 0.16));
    ctx.restore();
  } else if (pattern === "chevron") {
    ctx.beginPath();
    ctx.moveTo(-width * 0.42, height * 0.24);
    ctx.lineTo(0, height * 0.04);
    ctx.lineTo(width * 0.42, height * 0.24);
    ctx.stroke();
  } else if (pattern === "wave") {
    ctx.beginPath();
    ctx.moveTo(-width * 0.42, height * 0.2);
    ctx.quadraticCurveTo(-width * 0.2, height * 0.02, 0, height * 0.2);
    ctx.quadraticCurveTo(width * 0.2, height * 0.38, width * 0.42, height * 0.2);
    ctx.stroke();
  } else if (pattern === "ladder") {
    ctx.fillRect(-width * 0.43, height * 0.18, width * 0.88, Math.max(1, height * 0.1));
    for (const offset of [-0.24, 0, 0.24]) {
      ctx.fillRect(width * offset, -height * 0.34, Math.max(1, width * 0.06), height * 0.7);
    }
  } else if (pattern === "cross") {
    ctx.fillRect(-width * 0.43, height * 0.16, width * 0.88, Math.max(1, height * 0.11));
    ctx.fillRect(-width * 0.04, -height * 0.42, Math.max(1, width * 0.08), height * 0.82);
  } else if (pattern === "grain") {
    for (const offset of [-0.24, 0, 0.24]) {
      ctx.beginPath();
      ctx.ellipse(width * offset, height * 0.18, width * 0.07, height * 0.2, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillRect(-width * 0.43, height * 0.19, width * 0.88, Math.max(1.2, height * 0.16));
  }
}

function logoShapePath(ctx: CanvasRenderingContext2D, shape: ShipLogoShape, x: number, y: number, width: number, height: number) {
  if (shape === "circle" || shape === "ring") {
    ctx.beginPath();
    ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else if (shape === "diamond") {
    ctx.beginPath();
    ctx.moveTo(x, y - height / 2);
    ctx.lineTo(x + width / 2, y);
    ctx.lineTo(x, y + height / 2);
    ctx.lineTo(x - width / 2, y);
    ctx.closePath();
  } else if (shape === "hex") {
    ctx.beginPath();
    ctx.moveTo(x - width * 0.28, y - height / 2);
    ctx.lineTo(x + width * 0.28, y - height / 2);
    ctx.lineTo(x + width / 2, y);
    ctx.lineTo(x + width * 0.28, y + height / 2);
    ctx.lineTo(x - width * 0.28, y + height / 2);
    ctx.lineTo(x - width / 2, y);
    ctx.closePath();
  } else if (shape === "triangle") {
    ctx.beginPath();
    ctx.moveTo(x, y - height / 2);
    ctx.lineTo(x + width / 2, y + height / 2);
    ctx.lineTo(x - width / 2, y + height / 2);
    ctx.closePath();
  } else if (shape === "slash") {
    ctx.beginPath();
    ctx.moveTo(x - width * 0.28, y - height / 2);
    ctx.lineTo(x + width / 2, y - height / 2);
    ctx.lineTo(x + width * 0.28, y + height / 2);
    ctx.lineTo(x - width / 2, y + height / 2);
    ctx.closePath();
  } else {
    roundedRectPath(ctx, x - width / 2, y - height / 2, width, height, Math.max(1, width * 0.2));
  }
}

export function drawShipSignalOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: PharosVilleWorld["ships"][number]["visual"]["overlay"],
  x: number,
  y: number,
  scale: number,
) {
  if (overlay === "none") return;
  ctx.save();
  ctx.strokeStyle = "#2f2117";
  ctx.lineWidth = Math.max(1, 1 * scale);
  ctx.beginPath();
  ctx.moveTo(x, y - 1 * scale);
  ctx.lineTo(x, y + 17 * scale);
  ctx.stroke();

  const squareSize = Math.max(3, 6 * scale);
  const triangleWidth = Math.max(4, 8 * scale);
  const triangleHeight = Math.max(3, 6 * scale);
  const squareX = x + 1 * scale;
  const squareY = y;
  const triangleX = x + 1 * scale;
  const triangleY = y + 8 * scale;

  if (overlay === "watch") {
    drawCheckerSignalSquare(ctx, squareX, squareY, squareSize);
  } else {
    ctx.fillStyle = overlay === "nav" ? "#2866b5" : "#2c8b57";
    ctx.fillRect(squareX, squareY, squareSize, squareSize);
  }
  ctx.strokeStyle = "rgba(24, 16, 10, 0.8)";
  ctx.lineWidth = Math.max(1, 0.72 * scale);
  ctx.strokeRect(squareX, squareY, squareSize, squareSize);

  ctx.fillStyle = overlay === "nav" ? "#f5f4e8" : overlay === "yield" ? "#f0cf4f" : "#cf3f32";
  ctx.beginPath();
  ctx.moveTo(triangleX, triangleY);
  ctx.lineTo(triangleX + triangleWidth, triangleY + triangleHeight * 0.5);
  ctx.lineTo(triangleX, triangleY + triangleHeight);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawCheckerSignalSquare(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const cell = size / 2;
  ctx.fillStyle = "#1a1712";
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "#e2bd42";
  ctx.fillRect(x + cell, y, cell, cell);
  ctx.fillRect(x, y + cell, cell, cell);
}
