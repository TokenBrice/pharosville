import { areaLabelPlacementForArea, type ResolvedAreaLabelPlacement } from "../../systems/area-labels";
import { zoneThemeForTerrain } from "../../systems/palette";
import { tileToScreen } from "../../systems/projection";
import { RISK_WATER_AREAS } from "../../systems/risk-water-areas";
import type { AreaNode } from "../../systems/world-types";
import { drawSignBoard } from "../canvas-primitives";
import type { DrawPharosVilleInput } from "../render-types";

const placementByArea = new WeakMap<AreaNode, ResolvedAreaLabelPlacement>();
const measuredTextWidth = new Map<string, number>();
const fontBySize = new Map<number, string>();

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

export function drawWaterAreaLabels({ camera, ctx, world }: DrawPharosVilleInput) {
  for (const area of world.areas) {
    const placement = cachedAreaLabelPlacement(area);
    const p = tileToScreen(placement.anchorTile, camera);
    const terrainKind = area.riskPlacement ? RISK_WATER_AREAS[area.riskPlacement].terrain : "water";
    const theme = zoneThemeForTerrain(terrainKind);
    drawCartographicWaterLabel({
      accent: theme.label.accent,
      align: placement.align,
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

function drawCartographicWaterLabel(input: {
  accent: string;
  align: "center" | "left" | "right";
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
  const { accent, align, ctx, fill, label, maxWidth, outline, plaqueDark, plaqueLight, rotation, x, y, zoom } = input;
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
  const plaqueWidth = Math.min(width, measuredWidthRaw + 16 * scale);
  const plaqueX = align === "left" ? -3 * scale : align === "right" ? -plaqueWidth + 3 * scale : -plaqueWidth / 2;
  ctx.globalAlpha = 0.46;
  drawSignBoard(ctx, plaqueX, -8.4 * scale, plaqueWidth, 16.8 * scale, scale * 0.72, plaqueLight, plaqueDark);
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
