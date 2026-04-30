import { areaLabelPlacementForArea } from "../../systems/area-labels";
import { DEWS_AREA_LABEL_COLORS } from "../../systems/palette";
import { tileToScreen } from "../../systems/projection";
import { ETHEREUM_L2_DOCK_CHAIN_IDS } from "../../systems/world-layout";
import type { PharosVilleWorld } from "../../systems/world-types";
import { drawSignBoard } from "../canvas-primitives";
import type { DrawPharosVilleInput } from "../render-types";

const ETHEREUM_HARBOR_SIGNS = [
  {
    accent: "#d9b974",
    chainIds: ["ethereum"],
    label: "Ethereum Harbor",
    maxWidth: 136,
    rotation: -0.035,
    tile: { x: 42.1, y: 29.1 },
  },
  {
    accent: "#88ccc1",
    chainIds: ETHEREUM_L2_DOCK_CHAIN_IDS,
    label: "L2 Bay",
    maxWidth: 76,
    rotation: 0.035,
    tile: { x: 38.2, y: 36.1 },
  },
] as const;

export function drawWaterAreaLabels({ camera, ctx, world }: DrawPharosVilleInput) {
  for (const area of world.areas) {
    const placement = areaLabelPlacementForArea(area);
    const p = tileToScreen(placement.anchorTile, camera);
    const accent = area.band ? dewsAreaColor(area.band) : riskWaterAreaColor(area.riskZone);
    drawCartographicWaterLabel({
      accent,
      align: placement.align,
      ctx,
      label: area.label,
      maxWidth: placement.maxWidth,
      rotation: placement.rotation,
      x: p.x,
      y: p.y,
      zoom: camera.zoom,
    });
  }
}

export function drawEthereumHarborSigns({ camera, ctx, world }: DrawPharosVilleInput) {
  const renderedChainIds = new Set(world.docks.map((dock) => dock.chainId));
  for (const sign of ETHEREUM_HARBOR_SIGNS) {
    if (!sign.chainIds.some((chainId) => renderedChainIds.has(chainId))) continue;
    const p = tileToScreen(sign.tile, camera);
    drawCartographicWaterLabel({
      accent: sign.accent,
      align: "center",
      ctx,
      label: sign.label,
      maxWidth: sign.maxWidth,
      rotation: sign.rotation,
      x: p.x,
      y: p.y,
      zoom: camera.zoom,
    });
  }
}

function dewsAreaColor(band: NonNullable<PharosVilleWorld["areas"][number]["band"]>) {
  return DEWS_AREA_LABEL_COLORS[band];
}

function riskWaterAreaColor(zone: PharosVilleWorld["areas"][number]["riskZone"]) {
  if (zone === "ledger") return "#d9b974";
  return "#d8b56a";
}

function drawCartographicWaterLabel(input: {
  accent: string;
  align: "center" | "left" | "right";
  ctx: CanvasRenderingContext2D;
  label: string;
  maxWidth: number;
  rotation: number;
  x: number;
  y: number;
  zoom: number;
}) {
  const { accent, align, ctx, label, maxWidth, rotation, x, y, zoom } = input;
  const scale = Math.max(0.72, zoom);
  const fontSize = Math.max(8, Math.round(8.6 * scale));
  const text = label.toUpperCase();
  const width = maxWidth * scale;

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(rotation);
  ctx.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const plaqueWidth = Math.min(width, ctx.measureText(text).width + 16 * scale);
  const plaqueX = align === "left" ? -3 * scale : align === "right" ? -plaqueWidth + 3 * scale : -plaqueWidth / 2;
  ctx.globalAlpha = 0.46;
  drawSignBoard(ctx, plaqueX, -8.4 * scale, plaqueWidth, 16.8 * scale, scale * 0.72, "rgba(74, 50, 27, 0.5)", "rgba(15, 10, 7, 0.76)");
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
  ctx.strokeStyle = "rgba(5, 10, 17, 0.7)";
  ctx.lineWidth = Math.max(1.2, 2.2 * scale);
  ctx.strokeText(text, 0, 0, width);
  ctx.fillStyle = "rgba(238, 218, 169, 0.78)";
  ctx.fillText(text, 0, 0, width);

  const metrics = ctx.measureText(text);
  const measuredWidth = Math.min(width, metrics.width);
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

