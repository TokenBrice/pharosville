import type { PharosVilleWorld } from "../../systems/world-types";
import { tileToScreen, type ScreenPoint } from "../../systems/projection";
import type { LoadedPharosVilleAsset, PharosVilleAssetManager } from "../asset-manager";
import { drawAsset, drawDiamond, drawFittedText, drawSignBoard, hexToRgba } from "../canvas-primitives";
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

// Per-chain flag fill overrides for chains where the sampled logo average
// produces too little contrast with the logo's own ink. Solana's tri-band
// gradient (green→purple) averages to a muted teal that swallows the mark
// itself, so we lock the flag to the brand purple instead.
const CHAIN_FLAG_COLOR_OVERRIDES: Record<string, string> = {
  solana: "#9945ff",
};

const LOGO_FLAG_COLOR_CACHE = new Map<string, string>();

// Sample a logo image down to a single representative cloth color so the dock
// flag fabric can match the logo's brand palette instead of the dock health
// band. Average the visible (alpha > 200) pixels on a 16x16 grid; if the logo
// has no opaque pixels (rare) fall back to the caller-provided accent.
function logoFlagColor(logo: { image: HTMLImageElement; src: string }, fallback: string): string {
  const cached = LOGO_FLAG_COLOR_CACHE.get(logo.src);
  if (cached) return cached;
  if (typeof document === "undefined" || !logo.image.complete) return fallback;
  const sourceWidth = logo.image.naturalWidth || logo.image.width;
  const sourceHeight = logo.image.naturalHeight || logo.image.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) return fallback;
  const sampleSize = 16;
  const canvas = document.createElement("canvas");
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const sampleCtx = canvas.getContext("2d");
  if (!sampleCtx) return fallback;
  try {
    sampleCtx.drawImage(logo.image, 0, 0, sampleSize, sampleSize);
    const { data } = sampleCtx.getImageData(0, 0, sampleSize, sampleSize);
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 200) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }
    if (count === 0) {
      LOGO_FLAG_COLOR_CACHE.set(logo.src, fallback);
      return fallback;
    }
    const color = rgbToHex(Math.round(r / count), Math.round(g / count), Math.round(b / count));
    LOGO_FLAG_COLOR_CACHE.set(logo.src, color);
    return color;
  } catch {
    return fallback;
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
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
  const flagScale = scale * 1.84;
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

  const flagPath = () => {
    ctx.beginPath();
    ctx.moveTo(mastX, flagY);
    ctx.lineTo(mastX + direction * flagWidth, flagY + 2 * scale);
    ctx.lineTo(mastX + direction * (flagWidth - 5 * flagScale), flagY + flagHeight * 0.5);
    ctx.lineTo(mastX + direction * flagWidth, flagY + flagHeight - 2 * scale);
    ctx.lineTo(mastX, flagY + flagHeight);
    ctx.closePath();
  };

  const flagFill = CHAIN_FLAG_COLOR_OVERRIDES[dock.chainId]
    ?? (logo ? logoFlagColor(logo, accent) : accent);
  ctx.fillStyle = hexToRgba(flagFill, emphasized ? 0.96 : 0.88);
  flagPath();
  ctx.fill();

  drawDockFlagLogo({
    ctx,
    direction,
    flagHeight,
    flagPath,
    flagWidth,
    flagX: mastX,
    flagY,
    flagScale,
    logo,
    mark: dockFlagMark(dock),
    scale,
  });

  ctx.strokeStyle = "#2f2117";
  ctx.lineWidth = Math.max(1, 0.85 * scale);
  flagPath();
  ctx.stroke();

  if (emphasized) {
    drawDockNameRibbon(ctx, dock.label, mastX + direction * 14 * flagScale, mastTopY - 15 * scale, scale);
  }
  ctx.restore();
}

function drawDockFlagLogo(input: {
  ctx: CanvasRenderingContext2D;
  direction: 1 | -1;
  flagHeight: number;
  flagPath: () => void;
  flagWidth: number;
  flagX: number;
  flagY: number;
  flagScale: number;
  logo: ReturnType<PharosVilleAssetManager["getLogo"]>;
  mark: string;
  scale: number;
}) {
  const { ctx, direction, flagHeight, flagPath, flagWidth, flagX, flagY, flagScale, logo, mark, scale } = input;
  const cx = flagX + direction * flagWidth * 0.42;
  const cy = flagY + flagHeight * 0.5;
  const logoSize = Math.round(flagHeight * 0.94);

  ctx.save();
  flagPath();
  ctx.clip();

  if (logo) {
    ctx.globalAlpha = 1;
    ctx.drawImage(logo.image, Math.round(cx - logoSize / 2), Math.round(cy - logoSize / 2), logoSize, logoSize);
  } else {
    ctx.fillStyle = "rgba(20, 14, 8, 0.78)";
    ctx.font = `800 ${Math.max(6, Math.round(flagHeight * 0.62))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(mark.slice(0, 3).toUpperCase(), cx, cy + 0.5 * scale);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  // Vertical fold shadow down the middle of the flag (under the logo) — sells
  // the cloth texture and matches the natural drape of the swallowtail notch.
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(20, 14, 8, 0.18)";
  const foldX = flagX + direction * flagWidth * 0.62;
  const foldHalf = Math.max(0.6, 0.7 * flagScale);
  ctx.fillRect(foldX - foldHalf, flagY, foldHalf * 2, flagHeight);
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

// Hoisted to module scope so the per-frame `dockFlagMark` lookup avoids
// allocating a fresh Record literal for every dock×frame.
const DOCK_FLAG_EXPLICIT_MARKS: Record<string, string> = {
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

// Memoize the fallback (regex+split+slice) result per chainId so repeated
// frames over the same set of docks reuse the previously computed mark.
const DOCK_FLAG_FALLBACK_MARK_CACHE = new Map<string, string>();

function dockFlagMark(dock: PharosVilleWorld["docks"][number]) {
  const explicit = DOCK_FLAG_EXPLICIT_MARKS[dock.chainId];
  if (explicit) return explicit;
  const cached = DOCK_FLAG_FALLBACK_MARK_CACHE.get(dock.chainId);
  if (cached) return cached;
  const words = dock.label
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(" ")
    .filter(Boolean);
  const mark = words.length > 1
    ? words.map((word) => word[0]).join("").slice(0, 3)
    : (words[0] ?? dock.chainId).slice(0, 3);
  DOCK_FLAG_FALLBACK_MARK_CACHE.set(dock.chainId, mark);
  return mark;
}
