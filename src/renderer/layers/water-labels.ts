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

export type WaterLabelChromeStyle = "calm-parchment" | "charred-wax" | "generic-board" | "ledger-vellum" | "weathered-wood";

export interface WaterLabelPlaqueMetrics {
  height: number;
  plaqueWidth: number;
  plaqueX: number;
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

export function drawWaterAreaLabels({ camera, ctx, world }: DrawPharosVilleInput): void {
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

function drawCartographicWaterLabel(input: {
  accent: string;
  align: "center" | "left" | "right";
  chromeStyle: WaterLabelChromeStyle;
  ctx: CanvasRenderingContext2D;
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
  const { accent, align, chromeStyle, ctx, fill, label, maxWidth, outline, plaqueDark, plaqueLight, rotation, x, y, zoom } = input;
  const scale = Math.max(0.72, zoom);
  const fontSize = Math.max(8, Math.round(8.6 * scale));
  const text = label.toUpperCase();
  const width = maxWidth * scale;
  let font = fontBySize.get(fontSize);
  if (font === undefined) {
    font = `700 ${fontSize}px "PV Plaque", Georgia, "Times New Roman", serif`;
    fontBySize.set(fontSize, font);
  }

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(rotation);
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const measuredWidthRaw = cachedMeasureTextWidth(ctx, text, font);
  const metrics = waterLabelPlaqueMetrics({ align, maxWidth, measuredWidthRaw, scale });
  drawWaterLabelPlaqueChrome(ctx, {
    accent,
    chromeStyle,
    plaqueDark,
    plaqueLight,
    scale,
    ...metrics,
  });
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
  ctx.restore();
}
