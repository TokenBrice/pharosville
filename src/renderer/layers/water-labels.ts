import { areaLabelPlacementForArea, type ResolvedAreaLabelPlacement } from "../../systems/area-labels";
import { zoneThemeForTerrain } from "../../systems/palette";
import { tileToScreen } from "../../systems/projection";
import { RISK_WATER_AREAS } from "../../systems/risk-water-areas";
import type { AreaNode, TerrainKind } from "../../systems/world-types";
import { drawSignBoard, roundedRectPath } from "../canvas-primitives";
import type { DrawPharosVilleInput } from "../render-types";

const placementByArea = new WeakMap<AreaNode, ResolvedAreaLabelPlacement>();
const measuredTextWidth = new Map<string, number>();
const fontBySize = new Map<number, string>();
const waterLabelBitmapCache = new Map<string, WaterLabelBitmapCacheEntry>();

const MAX_WATER_LABEL_BITMAP_CACHE_ENTRIES = 96;
const WATER_LABEL_CACHE_PADDING = 14;

export type WaterLabelChromeStyle = "calm-parchment" | "charred-wax" | "generic-board" | "ledger-vellum" | "weathered-wood";

export interface WaterLabelPlaqueMetrics {
  height: number;
  plaqueWidth: number;
  plaqueX: number;
  top: number;
  width: number;
}

interface WaterLabelBitmapCacheEntry {
  bitmap: OffscreenCanvas;
  height: number;
  key: string;
  lastUsed: number;
  left: number;
  top: number;
  width: number;
}

interface WaterLabelRenderBasis {
  bounds: WaterLabelBitmapBounds;
  font: string;
  fontSize: number;
  measuredWidthRaw: number;
  metrics: WaterLabelPlaqueMetrics;
  scale: number;
  text: string;
  width: number;
  zoomBucket: number;
}

export interface WaterLabelBitmapCacheKeyBasis {
  fontSize: number;
  zoomBucket: number;
}

interface WaterLabelBitmapBounds {
  height: number;
  left: number;
  top: number;
  width: number;
}

function cachedAreaLabelPlacement(area: AreaNode): ResolvedAreaLabelPlacement {
  let cached = placementByArea.get(area);
  if (!cached) {
    cached = areaLabelPlacementForArea(area);
    placementByArea.set(area, cached);
  }
  return cached;
}

function cachedMeasureTextWidth(ctx: CanvasRenderingContext2D, text: string, font: string): number {
  const key = `${font}${text}`;
  const cached = measuredTextWidth.get(key);
  if (cached !== undefined) return cached;
  const width = ctx.measureText(text).width;
  measuredTextWidth.set(key, width);
  return width;
}

export function drawWaterAreaLabels({ camera, ctx, dpr, world }: DrawPharosVilleInput): void {
  for (const area of world.areas) {
    const placement = cachedAreaLabelPlacement(area);
    const p = tileToScreen(placement.anchorTile, camera);
    const terrainKind = area.riskPlacement ? RISK_WATER_AREAS[area.riskPlacement].terrain : "water";
    const theme = zoneThemeForTerrain(terrainKind);
    drawCartographicWaterLabel({
      accent: theme.label.accent,
      align: placement.align,
      chromeStyle: waterLabelChromeStyleForTerrain(terrainKind),
      ctx,
      ...(dpr !== undefined ? { dpr } : {}),
      fill: theme.label.fill,
      label: area.label,
      maxWidth: placement.maxWidth,
      outline: theme.label.outline,
      plaqueDark: theme.label.plaqueDark,
      plaqueLight: theme.label.plaqueLight,
      rotation: placement.rotation,
      x: p.x,
      y: p.y,
      zoom: camera.zoom,
    });
  }
}

export function clearWaterLabelBitmapCache(): void {
  waterLabelBitmapCache.clear();
}

export function waterLabelBitmapCacheStats(): { entryCount: number } {
  return { entryCount: waterLabelBitmapCache.size };
}

export function waterLabelChromeStyleForTerrain(terrain: TerrainKind | string): WaterLabelChromeStyle {
  if (terrain === "storm-water") return "charred-wax";
  if (terrain === "warning-water") return "weathered-wood";
  if (terrain === "calm-water") return "calm-parchment";
  if (terrain === "ledger-water") return "ledger-vellum";
  return "generic-board";
}

export function waterLabelPlaqueMetrics(input: {
  align: "center" | "left" | "right";
  maxWidth: number;
  measuredWidthRaw: number;
  scale: number;
}): WaterLabelPlaqueMetrics {
  const width = input.maxWidth * input.scale;
  const plaqueWidth = Math.min(width, input.measuredWidthRaw + 16 * input.scale);
  const plaqueX = input.align === "left"
    ? -3 * input.scale
    : input.align === "right"
      ? -plaqueWidth + 3 * input.scale
      : -plaqueWidth / 2;
  return {
    height: 16.8 * input.scale,
    plaqueWidth,
    plaqueX,
    top: -8.4 * input.scale,
    width,
  };
}

function drawWaterLabelPlaqueChrome(
  ctx: CanvasRenderingContext2D,
  input: WaterLabelPlaqueMetrics & {
    accent: string;
    chromeStyle: WaterLabelChromeStyle;
    plaqueDark: string;
    plaqueLight: string;
    scale: number;
  },
) {
  const { accent, chromeStyle, height, plaqueDark, plaqueLight, plaqueWidth, plaqueX, scale, top } = input;
  ctx.save();
  if (chromeStyle === "charred-wax") {
    drawCharredWaxPlaque(ctx, plaqueX, top, plaqueWidth, height, scale);
  } else if (chromeStyle === "weathered-wood") {
    drawWeatheredWoodPlaque(ctx, plaqueX, top, plaqueWidth, height, scale, accent);
  } else if (chromeStyle === "calm-parchment") {
    drawCalmParchmentPlaque(ctx, plaqueX, top, plaqueWidth, height, scale, accent);
  } else if (chromeStyle === "ledger-vellum") {
    drawLedgerVellumPlaque(ctx, plaqueX, top, plaqueWidth, height, scale);
  } else {
    ctx.globalAlpha = 0.46;
    drawSignBoard(ctx, plaqueX, top, plaqueWidth, height, scale * 0.72, plaqueLight, plaqueDark);
    drawGenericPennants(ctx, plaqueX, plaqueWidth, scale, accent);
  }
  ctx.restore();
}

function drawCharredWaxPlaque(
  ctx: CanvasRenderingContext2D,
  plaqueX: number,
  top: number,
  width: number,
  height: number,
  scale: number,
) {
  ctx.globalAlpha = 0.62;
  ctx.fillStyle = "rgba(7, 5, 4, 0.86)";
  roundedRectPath(ctx, plaqueX - 2 * scale, top + 1.8 * scale, width + 4 * scale, height, scale * 1.2);
  ctx.fill();
  ctx.fillStyle = "rgba(38, 24, 18, 0.78)";
  roundedRectPath(ctx, plaqueX, top, width, height, scale * 0.9);
  ctx.fill();
  ctx.strokeStyle = "rgba(4, 3, 3, 0.72)";
  ctx.lineWidth = Math.max(1, 0.75 * scale);
  ctx.beginPath();
  ctx.moveTo(plaqueX + width * 0.18, top + height * 0.2);
  ctx.lineTo(plaqueX + width * 0.24, top + height * 0.45);
  ctx.lineTo(plaqueX + width * 0.2, top + height * 0.72);
  ctx.moveTo(plaqueX + width * 0.68, top + height * 0.24);
  ctx.lineTo(plaqueX + width * 0.62, top + height * 0.5);
  ctx.lineTo(plaqueX + width * 0.72, top + height * 0.66);
  ctx.stroke();
  drawWaxSealPennant(ctx, plaqueX + width + 5.3 * scale, top + height * 0.52, scale);
}

function drawWeatheredWoodPlaque(
  ctx: CanvasRenderingContext2D,
  plaqueX: number,
  top: number,
  width: number,
  height: number,
  scale: number,
  accent: string,
) {
  ctx.globalAlpha = 0.56;
  drawSignBoard(ctx, plaqueX, top, width, height, scale * 0.74, "rgba(142, 92, 38, 0.72)", "rgba(58, 34, 15, 0.82)");
  ctx.strokeStyle = "rgba(245, 194, 112, 0.28)";
  ctx.lineWidth = Math.max(1, 0.55 * scale);
  ctx.beginPath();
  ctx.moveTo(plaqueX + 5 * scale, top + height * 0.34);
  ctx.lineTo(plaqueX + width - 6 * scale, top + height * 0.26);
  ctx.moveTo(plaqueX + 6 * scale, top + height * 0.64);
  ctx.lineTo(plaqueX + width - 5 * scale, top + height * 0.7);
  ctx.stroke();
  drawSplitRivetPennant(ctx, plaqueX - 7.5 * scale, top + height * 0.5, -1, scale, accent);
  drawSplitRivetPennant(ctx, plaqueX + width + 7.5 * scale, top + height * 0.5, 1, scale, accent);
}

function drawCalmParchmentPlaque(
  ctx: CanvasRenderingContext2D,
  plaqueX: number,
  top: number,
  width: number,
  height: number,
  scale: number,
  accent: string,
) {
  ctx.globalAlpha = 0.58;
  ctx.fillStyle = "rgba(238, 222, 174, 0.78)";
  roundedRectPath(ctx, plaqueX, top, width, height, scale * 1.1);
  ctx.fill();
  ctx.strokeStyle = "rgba(83, 97, 56, 0.72)";
  ctx.lineWidth = Math.max(1, 0.9 * scale);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(plaqueX + 4 * scale, top + height + 0.4 * scale);
  ctx.lineTo(plaqueX + width - 4 * scale, top + height + 0.4 * scale);
  ctx.lineTo(plaqueX + width - 10 * scale, top + height + 4.4 * scale);
  ctx.lineTo(plaqueX + 10 * scale, top + height + 4.4 * scale);
  ctx.closePath();
  ctx.fill();
}

function drawLedgerVellumPlaque(
  ctx: CanvasRenderingContext2D,
  plaqueX: number,
  top: number,
  width: number,
  height: number,
  scale: number,
) {
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = "rgba(232, 218, 184, 0.72)";
  roundedRectPath(ctx, plaqueX, top, width, height, scale * 0.8);
  ctx.fill();
  ctx.strokeStyle = "rgba(74, 51, 27, 0.78)";
  ctx.lineWidth = Math.max(1, 0.85 * scale);
  ctx.stroke();
  ctx.strokeStyle = "rgba(61, 72, 96, 0.28)";
  ctx.lineWidth = Math.max(1, 0.5 * scale);
  ctx.beginPath();
  ctx.moveTo(plaqueX + 6 * scale, top + height * 0.34);
  ctx.lineTo(plaqueX + width - 6 * scale, top + height * 0.34);
  ctx.moveTo(plaqueX + 6 * scale, top + height * 0.66);
  ctx.lineTo(plaqueX + width - 6 * scale, top + height * 0.66);
  ctx.stroke();
}

function drawGenericPennants(
  ctx: CanvasRenderingContext2D,
  plaqueX: number,
  plaqueWidth: number,
  scale: number,
  accent: string,
) {
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(plaqueX - 4 * scale, 0);
  ctx.lineTo(plaqueX - 10 * scale, -4 * scale);
  ctx.lineTo(plaqueX - 8 * scale, 4 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(plaqueX + plaqueWidth + 4 * scale, 0);
  ctx.lineTo(plaqueX + plaqueWidth + 10 * scale, -4 * scale);
  ctx.lineTo(plaqueX + plaqueWidth + 8 * scale, 4 * scale);
  ctx.closePath();
  ctx.fill();
}

function drawWaxSealPennant(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.fillStyle = "rgba(137, 31, 28, 0.9)";
  ctx.beginPath();
  ctx.moveTo(x - 2.8 * scale, y + 1.8 * scale);
  ctx.lineTo(x + 3.8 * scale, y + 1.8 * scale);
  ctx.lineTo(x + 1.2 * scale, y + 7.2 * scale);
  ctx.lineTo(x - 1.2 * scale, y + 4.5 * scale);
  ctx.lineTo(x - 3.6 * scale, y + 7.2 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, Math.max(2.2, 3.4 * scale), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(251, 194, 141, 0.34)";
  ctx.lineWidth = Math.max(1, 0.7 * scale);
  ctx.stroke();
}

function drawSplitRivetPennant(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: -1 | 1,
  scale: number,
  accent: string,
) {
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(x - direction * 5 * scale, y - 5 * scale);
  ctx.lineTo(x + direction * 5 * scale, y - 2.2 * scale);
  ctx.lineTo(x + direction * 2.4 * scale, y);
  ctx.lineTo(x + direction * 5 * scale, y + 2.2 * scale);
  ctx.lineTo(x - direction * 5 * scale, y + 5 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(49, 29, 13, 0.72)";
  ctx.beginPath();
  ctx.arc(x - direction * 1.8 * scale, y, Math.max(1.2, 1.8 * scale), 0, Math.PI * 2);
  ctx.fill();
}

export function drawCartographicWaterLabel(input: {
  accent: string;
  align: "center" | "left" | "right";
  chromeStyle: WaterLabelChromeStyle;
  ctx: CanvasRenderingContext2D;
  dpr?: number;
  fill: string;
  label: string;
  maxWidth: number;
  outline: string;
  plaqueDark: string;
  plaqueLight: string;
  rotation: number;
  x: number;
  y: number;
  zoom: number;
}) {
  const { accent, align, chromeStyle, ctx, fill, label, maxWidth, outline, plaqueDark, plaqueLight, rotation, x, y } = input;
  const dprBucket = waterLabelDprBucket(input.dpr);
  const basis = waterLabelRenderBasis(ctx, input);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(rotation);
  const cached = retainedWaterLabelBitmap({
    accent,
    align,
    basis,
    chromeStyle,
    dprBucket,
    fill,
    label,
    maxWidth,
    outline,
    plaqueDark,
    plaqueLight,
  });
  if (cached) {
    ctx.drawImage(cached.bitmap, cached.left, cached.top, cached.width, cached.height);
    drawWaterLabelTextLocal(ctx, { accent, align, basis, fill, outline });
  } else {
    drawWaterLabelLocal(ctx, {
      accent,
      align,
      basis,
      chromeStyle,
      fill,
      outline,
      plaqueDark,
      plaqueLight,
    });
  }
  ctx.restore();
}

function waterLabelRenderBasis(
  ctx: CanvasRenderingContext2D,
  input: {
    align: "center" | "left" | "right";
    label: string;
    maxWidth: number;
    zoom: number;
  },
): WaterLabelRenderBasis {
  const scale = Math.max(0.72, Number.isFinite(input.zoom) ? input.zoom : 1);
  const fontSize = Math.max(8, Math.round(8.6 * scale));
  const text = input.label.toUpperCase();
  const width = input.maxWidth * scale;
  let font = fontBySize.get(fontSize);
  if (font === undefined) {
    font = `700 ${fontSize}px "PV Plaque", Georgia, "Times New Roman", serif`;
    fontBySize.set(fontSize, font);
  }
  const measuredWidthRaw = cachedMeasureTextWidth(ctx, text, font);
  const metrics = waterLabelPlaqueMetrics({
    align: input.align,
    maxWidth: input.maxWidth,
    measuredWidthRaw,
    scale,
  });
  return {
    bounds: waterLabelBitmapBounds(input.align, metrics, measuredWidthRaw, scale, width),
    font,
    fontSize,
    measuredWidthRaw,
    metrics,
    scale,
    text,
    width,
    zoomBucket: waterLabelZoomBucket(input.zoom),
  };
}

function drawWaterLabelLocal(
  ctx: CanvasRenderingContext2D,
  input: {
    accent: string;
    align: "center" | "left" | "right";
    basis: WaterLabelRenderBasis;
    chromeStyle: WaterLabelChromeStyle;
    fill: string;
    outline: string;
    plaqueDark: string;
    plaqueLight: string;
  },
): void {
  const { accent, align, basis, chromeStyle, fill, outline, plaqueDark, plaqueLight } = input;
  drawWaterLabelChromeLocal(ctx, { accent, basis, chromeStyle, plaqueDark, plaqueLight });
  drawWaterLabelTextLocal(ctx, { accent, align, basis, fill, outline });
}

function drawWaterLabelChromeLocal(
  ctx: CanvasRenderingContext2D,
  input: {
    accent: string;
    basis: WaterLabelRenderBasis;
    chromeStyle: WaterLabelChromeStyle;
    plaqueDark: string;
    plaqueLight: string;
  },
): void {
  const { accent, basis, chromeStyle, plaqueDark, plaqueLight } = input;
  const { metrics, scale } = basis;
  drawWaterLabelPlaqueChrome(ctx, {
    accent,
    chromeStyle,
    plaqueDark,
    plaqueLight,
    scale,
    ...metrics,
  });
}

function drawWaterLabelTextLocal(
  ctx: CanvasRenderingContext2D,
  input: {
    accent: string;
    align: "center" | "left" | "right";
    basis: WaterLabelRenderBasis;
    fill: string;
    outline: string;
  },
): void {
  const { accent, align, basis, fill, outline } = input;
  const { font, measuredWidthRaw, scale, text, width } = basis;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 0.88;
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1.2, 2.2 * scale);
  ctx.strokeText(text, 0, 0, width);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0, width);

  const measuredWidth = Math.min(width, measuredWidthRaw);
  const lineStart = align === "left" ? 0 : align === "right" ? -measuredWidth : -measuredWidth / 2;
  const lineEnd = align === "left" ? measuredWidth : align === "right" ? 0 : measuredWidth / 2;
  ctx.globalAlpha = 0.48;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, 0.9 * scale);
  ctx.beginPath();
  ctx.moveTo(lineStart, 8.2 * scale);
  ctx.lineTo(lineEnd, 8.2 * scale);
  ctx.stroke();
}

function retainedWaterLabelBitmap(input: {
  accent: string;
  align: "center" | "left" | "right";
  basis: WaterLabelRenderBasis;
  chromeStyle: WaterLabelChromeStyle;
  dprBucket: number;
  fill: string;
  label: string;
  maxWidth: number;
  outline: string;
  plaqueDark: string;
  plaqueLight: string;
}): WaterLabelBitmapCacheEntry | null {
  if (typeof OffscreenCanvas === "undefined") return null;

  const key = waterLabelBitmapCacheKey(input);
  const cached = waterLabelBitmapCache.get(key);
  if (cached) {
    cached.lastUsed = performance.now();
    return cached;
  }

  const { bounds } = input.basis;
  const dpr = input.dprBucket / 100;
  const pixelWidth = Math.max(1, Math.ceil(bounds.width * dpr));
  const pixelHeight = Math.max(1, Math.ceil(bounds.height * dpr));
  const bitmap = new OffscreenCanvas(pixelWidth, pixelHeight);
  const offscreenCtx = bitmap.getContext("2d", { alpha: true });
  if (!offscreenCtx) return null;

  offscreenCtx.setTransform(dpr, 0, 0, dpr, -bounds.left * dpr, -bounds.top * dpr);
  drawWaterLabelChromeLocal(offscreenCtx as unknown as CanvasRenderingContext2D, input);

  const entry = {
    bitmap,
    height: bounds.height,
    key,
    lastUsed: performance.now(),
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
  };
  waterLabelBitmapCache.set(key, entry);
  evictWaterLabelBitmapCache();
  return entry;
}

export function waterLabelBitmapCacheKey(input: {
  accent: string;
  align: "center" | "left" | "right";
  basis: WaterLabelBitmapCacheKeyBasis;
  chromeStyle: WaterLabelChromeStyle;
  dprBucket: number;
  fill: string;
  label: string;
  maxWidth: number;
  outline: string;
  plaqueDark: string;
  plaqueLight: string;
}): string {
  return [
    input.label.toUpperCase(),
    `theme:${input.chromeStyle}:${input.fill}:${input.outline}:${input.accent}:${input.plaqueLight}:${input.plaqueDark}`,
    `align:${input.align}`,
    `max:${Math.round(input.maxWidth * 10) / 10}`,
    `font:${input.basis.fontSize}`,
    `z:${input.basis.zoomBucket}`,
    `dpr:${input.dprBucket}`,
  ].join("|");
}

function waterLabelBitmapBounds(
  align: "center" | "left" | "right",
  metrics: WaterLabelPlaqueMetrics,
  measuredWidthRaw: number,
  scale: number,
  width: number,
): WaterLabelBitmapBounds {
  const measuredWidth = Math.min(width, measuredWidthRaw);
  const textLeft = align === "left" ? 0 : align === "right" ? -width : -width / 2;
  const textRight = align === "left" ? width : align === "right" ? 0 : width / 2;
  const underlineLeft = align === "left" ? 0 : align === "right" ? -measuredWidth : -measuredWidth / 2;
  const underlineRight = align === "left" ? measuredWidth : align === "right" ? 0 : measuredWidth / 2;
  const padding = WATER_LABEL_CACHE_PADDING * scale;
  const left = Math.min(metrics.plaqueX, textLeft, underlineLeft) - padding;
  const right = Math.max(metrics.plaqueX + metrics.plaqueWidth, textRight, underlineRight) + padding;
  const top = metrics.top - padding;
  const bottom = metrics.top + metrics.height + padding;
  return {
    height: Math.max(1, bottom - top),
    left,
    top,
    width: Math.max(1, right - left),
  };
}

function waterLabelZoomBucket(zoom: number): number {
  const scale = Math.max(0.72, Number.isFinite(zoom) ? zoom : 1);
  return Math.max(720, Math.round(scale * 1000));
}

function waterLabelDprBucket(dpr: number | undefined): number {
  return Math.max(100, Math.round((dpr && dpr > 0 ? dpr : 1) * 100));
}

function evictWaterLabelBitmapCache(): void {
  while (waterLabelBitmapCache.size > MAX_WATER_LABEL_BITMAP_CACHE_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestUsed = Number.POSITIVE_INFINITY;
    for (const [key, entry] of waterLabelBitmapCache) {
      if (entry.lastUsed < oldestUsed) {
        oldestKey = key;
        oldestUsed = entry.lastUsed;
      }
    }
    if (!oldestKey) return;
    waterLabelBitmapCache.delete(oldestKey);
  }
}
