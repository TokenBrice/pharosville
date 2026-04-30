import type { PharosVilleWorld } from "../../systems/world-types";
import { tileToScreen, type ScreenPoint } from "../../systems/projection";
import type { LoadedPharosVilleAsset, PharosVilleAssetManager } from "../asset-manager";
import { drawAsset, drawDiamond, drawFittedText, drawSignBoard, hexToRgba, roundedRectPath } from "../canvas-primitives";
import type { RenderFrameCache } from "../frame-cache";
import { dockOutwardVector, type ResolvedEntityGeometry } from "../geometry";
import type { DrawPharosVilleInput } from "../render-types";

export interface DockRenderState {
  dockAsset: LoadedPharosVilleAsset | null;
  geometry: ResolvedEntityGeometry;
  harbor: ScreenPoint;
}

export interface DockRenderFrame {
  cache: RenderFrameCache;
  dockRenderStates: Map<string, DockRenderState>;
}

export function isBackgroundedHarborDock(dock: PharosVilleWorld["docks"][number]) {
  return dock.chainId === "ethereum";
}

function dockRenderState(input: DrawPharosVilleInput, frame: DockRenderFrame, dock: PharosVilleWorld["docks"][number]): DockRenderState {
  const cached = frame.dockRenderStates.get(dock.id);
  if (cached) return cached;
  const dockAsset = frame.cache.assetForEntity(dock);
  const geometry = frame.cache.geometryForEntity(dock);
  const harbor = geometry.drawPoint;
  const state = { dockAsset, geometry, harbor };
  frame.dockRenderStates.set(dock.id, state);
  return state;
}

export function drawDockBody(input: DrawPharosVilleInput, frame: DockRenderFrame, dock: PharosVilleWorld["docks"][number]) {
  const { camera, ctx } = input;
  const p = tileToScreen(dock.tile, camera);
  const { dockAsset, geometry, harbor } = dockRenderState(input, frame, dock);
  drawDockQuayUnderlay(ctx, dock, harbor, camera.zoom);
  if (dockAsset) {
    drawAsset(
      ctx,
      dockAsset,
      harbor.x,
      harbor.y,
      geometry.drawScale,
    );
  } else {
    ctx.strokeStyle = "#6d4c2f";
    ctx.lineWidth = (3 + dock.size) * camera.zoom;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(harbor.x, harbor.y);
    ctx.stroke();
  }
}

function drawDockQuayUnderlay(
  ctx: CanvasRenderingContext2D,
  dock: PharosVilleWorld["docks"][number],
  point: ScreenPoint,
  zoom: number,
) {
  const size = Math.max(0, dock.size);
  const width = (58 + size * 0.75) * zoom;
  const height = (22 + size * 0.18) * zoom;
  ctx.save();
  drawDiamond(ctx, point.x, point.y + 9 * zoom, width * 1.14, height * 1.12, "rgba(4, 8, 10, 0.28)");
  drawDiamond(ctx, point.x, point.y + 5 * zoom, width, height, "rgba(66, 64, 54, 0.64)");
  drawDiamond(ctx, point.x, point.y + 1 * zoom, width * 0.78, height * 0.62, "rgba(202, 178, 124, 0.4)");
  ctx.strokeStyle = "rgba(47, 35, 24, 0.26)";
  ctx.lineWidth = Math.max(1, 0.9 * zoom);
  ctx.beginPath();
  ctx.moveTo(point.x - width * 0.31, point.y + height * 0.02);
  ctx.lineTo(point.x + width * 0.31, point.y + height * 0.12);
  ctx.moveTo(point.x - width * 0.18, point.y - height * 0.09);
  ctx.lineTo(point.x + width * 0.2, point.y - height * 0.02);
  ctx.stroke();
  ctx.fillStyle = "rgba(247, 214, 138, 0.07)";
  drawDiamond(ctx, point.x + width * 0.04, point.y - height * 0.04, width * 0.34, height * 0.22, ctx.fillStyle);
  ctx.strokeStyle = "rgba(218, 238, 231, 0.26)";
  ctx.lineWidth = Math.max(1, 1.2 * zoom);
  ctx.beginPath();
  ctx.moveTo(point.x - width * 0.42, point.y + height * 0.1);
  ctx.lineTo(point.x - width * 0.08, point.y + height * 0.34);
  ctx.moveTo(point.x + width * 0.14, point.y + height * 0.34);
  ctx.lineTo(point.x + width * 0.42, point.y + height * 0.1);
  ctx.stroke();
  ctx.restore();
}

export function drawDockOverlay(input: DrawPharosVilleInput, frame: DockRenderFrame, dock: PharosVilleWorld["docks"][number]) {
  const { assets, camera, ctx, hoveredTarget, selectedTarget, world } = input;
  const { harbor } = dockRenderState(input, frame, dock);
  drawHarborFlag({
    accent: dockHealthColor(dock.healthBand),
    ctx,
    dock,
    emphasized: hoveredTarget?.detailId === dock.detailId || selectedTarget?.detailId === dock.detailId,
    logo: assets?.getLogo(dock.logoSrc) ?? null,
    mapWidth: world.map.width,
    outward: dockOutwardVector(dock.tile, world.map.width),
    x: harbor.x,
    y: harbor.y - 12 * camera.zoom,
    zoom: camera.zoom,
  });
}

function dockHealthColor(healthBand: PharosVilleWorld["docks"][number]["healthBand"]) {
  if (healthBand === "robust" || healthBand === "healthy") return "#78b689";
  if (healthBand === "mixed") return "#dfb95a";
  if (healthBand === "fragile") return "#d98b54";
  if (healthBand === "concentrated") return "#c9675c";
  return "#9fb0aa";
}

function drawHarborFlag(input: {
  accent: string;
  ctx: CanvasRenderingContext2D;
  dock: PharosVilleWorld["docks"][number];
  emphasized: boolean;
  logo: ReturnType<PharosVilleAssetManager["getLogo"]>;
  mapWidth: number;
  outward: { x: -1 | 0 | 1; y: -1 | 0 | 1 };
  x: number;
  y: number;
  zoom: number;
}) {
  const { accent, ctx, dock, emphasized, logo, mapWidth, outward, x, y, zoom } = input;
  const scale = Math.max(0.72, zoom);
  const flagScale = scale * 1.65;
  const side = outward.x === 0 ? (dock.tile.x < (mapWidth - 1) / 2 ? -1 : 1) : -outward.x;
  const direction = side < 0 ? -1 : 1;
  const mastX = x + side * (22 + dock.size * 0.55) * scale;
  const mastBaseY = y - (5 + dock.size * 0.55) * scale;
  const flagWidth = (20 + (emphasized ? 3 : 0)) * flagScale;
  const flagHeight = (13 + (emphasized ? 1 : 0)) * flagScale;
  const mastTopY = mastBaseY - flagHeight - (15 + (emphasized ? 3 : 0)) * scale;
  const flagY = mastTopY + 2 * scale;

  ctx.save();
  ctx.lineJoin = "miter";

  ctx.fillStyle = "rgba(7, 10, 13, 0.32)";
  ctx.beginPath();
  ctx.ellipse(mastX + direction * flagWidth * 0.24, mastBaseY + 4 * scale, 9 * flagScale, 2.8 * flagScale, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#231811";
  ctx.lineWidth = Math.max(1, 1.15 * scale);
  ctx.beginPath();
  ctx.moveTo(Math.round(mastX), Math.round(mastBaseY));
  ctx.lineTo(Math.round(mastX), Math.round(mastTopY - 2 * scale));
  ctx.stroke();

  ctx.strokeStyle = "#7d603a";
  ctx.lineWidth = Math.max(1, 0.8 * scale);
  ctx.beginPath();
  ctx.moveTo(Math.round(mastX + direction * 0.6 * scale), Math.round(mastBaseY - 1 * scale));
  ctx.lineTo(Math.round(mastX + direction * 0.6 * scale), Math.round(mastTopY - 2 * scale));
  ctx.stroke();

  ctx.fillStyle = hexToRgba(accent, emphasized ? 0.94 : 0.78);
  ctx.beginPath();
  ctx.moveTo(mastX, flagY);
  ctx.lineTo(mastX + direction * flagWidth, flagY + 2 * scale);
  ctx.lineTo(mastX + direction * (flagWidth - 5 * flagScale), flagY + flagHeight * 0.5);
  ctx.lineTo(mastX + direction * flagWidth, flagY + flagHeight - 2 * scale);
  ctx.lineTo(mastX, flagY + flagHeight);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#2f2117";
  ctx.lineWidth = Math.max(1, 0.85 * scale);
  ctx.stroke();

  drawDockFlagCrest({
    accent,
    ctx,
    logo,
    mark: dockFlagMark(dock),
    radius: flagHeight * 0.32,
    x: mastX + direction * flagWidth * 0.44,
    y: flagY + flagHeight * 0.52,
  });

  if (emphasized) {
    drawDockNameRibbon(ctx, dock.label, mastX + direction * 14 * flagScale, mastTopY - 15 * scale, scale);
  }
  ctx.restore();
}

function drawDockFlagCrest(input: {
  accent: string;
  ctx: CanvasRenderingContext2D;
  logo: ReturnType<PharosVilleAssetManager["getLogo"]>;
  mark: string;
  radius: number;
  x: number;
  y: number;
}) {
  const { accent, ctx, logo, mark, radius, x, y } = input;
  const safeRadius = Math.max(3, radius);
  const width = safeRadius * 1.9;
  const height = safeRadius * 1.72;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));

  ctx.fillStyle = "rgba(248, 231, 190, 0.72)";
  ctx.strokeStyle = "rgba(47, 33, 23, 0.62)";
  ctx.lineWidth = Math.max(1, safeRadius * 0.1);
  ctx.beginPath();
  ctx.moveTo(-width * 0.42, -height * 0.42);
  ctx.lineTo(width * 0.42, -height * 0.42);
  ctx.quadraticCurveTo(width * 0.5, -height * 0.06, width * 0.32, height * 0.17);
  ctx.lineTo(0, height * 0.46);
  ctx.lineTo(-width * 0.32, height * 0.17);
  ctx.quadraticCurveTo(-width * 0.5, -height * 0.06, -width * 0.42, -height * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = hexToRgba(accent, 0.56);
  ctx.lineWidth = Math.max(1, safeRadius * 0.08);
  ctx.beginPath();
  ctx.moveTo(-width * 0.28, -height * 0.25);
  ctx.quadraticCurveTo(0, -height * 0.32, width * 0.28, -height * 0.25);
  ctx.stroke();

  if (logo) {
    ctx.save();
    roundedRectPath(ctx, -safeRadius * 0.68, -safeRadius * 0.68, safeRadius * 1.36, safeRadius * 1.36, safeRadius * 0.22);
    ctx.clip();
    ctx.globalAlpha = 0.92;
    const size = Math.max(2, Math.round(safeRadius * 1.36));
    ctx.drawImage(logo.image, -size / 2, -size / 2, size, size);
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = hexToRgba(accent, 0.1);
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255, 244, 214, 0.22)";
    ctx.lineWidth = Math.max(1, safeRadius * 0.07);
    ctx.beginPath();
    ctx.moveTo(-safeRadius * 0.72, -safeRadius * 0.12);
    ctx.quadraticCurveTo(0, -safeRadius * 0.25, safeRadius * 0.72, -safeRadius * 0.08);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.fillStyle = "#152334";
    ctx.font = `800 ${Math.max(4, safeRadius * (mark.length > 2 ? 0.72 : 0.96))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(mark.slice(0, 3).toUpperCase(), 0, 0.35);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
}

function drawDockNameRibbon(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, scale: number) {
  const fontSize = Math.max(7, Math.round(7.4 * scale));
  ctx.save();
  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  const width = Math.min(82 * scale, Math.max(34 * scale, ctx.measureText(label).width + 11 * scale));
  const height = 13 * scale;
  const left = x - width / 2;
  const top = y - height / 2;
  ctx.globalAlpha = 0.88;
  drawSignBoard(ctx, left, top, width, height, scale * 0.82, "#654323", "#2e1e14");
  ctx.fillStyle = "#f7e5ba";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawFittedText(ctx, label, x, y + 0.7 * scale, width - 7 * scale, fontSize, 5.8 * scale, "700");
  ctx.restore();
}

function dockFlagMark(dock: PharosVilleWorld["docks"][number]) {
  const explicit: Record<string, string> = {
    aptos: "APT",
    arbitrum: "ARB",
    avalanche: "AVAX",
    base: "B",
    bsc: "BSC",
    ethereum: "ETH",
    hyperliquid: "HYPE",
    polygon: "POL",
    solana: "SOL",
    tron: "TRX",
  };
  if (explicit[dock.chainId]) return explicit[dock.chainId];
  const words = dock.label
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);
  if (words.length > 1) return words.map((word) => word[0]).join("").slice(0, 3);
  return (words[0] ?? dock.chainId).slice(0, 3);
}
