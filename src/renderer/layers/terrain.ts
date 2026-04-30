import { waterTerrainStyle, type WaterTerrainStyle } from "../../systems/palette";
import { TILE_HEIGHT, tileToScreen, type ScreenPoint } from "../../systems/projection";
import { isElevatedTileKind, isShoreTileKind, isWaterTileKind } from "../../systems/world-layout";
import type { TerrainKind } from "../../systems/world-types";
import type { PharosVilleAssetManager } from "../asset-manager";
import { drawAsset, drawDiamond, drawTileLowerFacet, withAlpha } from "../canvas-primitives";
import type { DrawPharosVilleInput, PharosVilleCanvasMotion } from "../render-types";

const TILE_COLORS: Record<string, string> = {
  beach: "#c8b06f",
  cliff: "#2b3943",
  grass: "#4f7e4d",
  hill: "#667f4f",
  land: "#697a4d",
  road: "#9e7446",
  rock: "#4e5d63",
  shore: "#b9955f",
};

const TERRAIN_TEXTURE = {
  beachPebble: "rgba(82, 67, 47, 0.12)",
  cliffFace: "rgba(18, 24, 30, 0.56)",
  foam: "rgba(232, 243, 233, 0.56)",
  grassDark: "rgba(28, 70, 48, 0.38)",
  grassLight: "rgba(174, 194, 118, 0.24)",
  grassMid: "rgba(78, 128, 76, 0.26)",
  groundGrain: "rgba(32, 34, 25, 0.14)",
  mossShadow: "rgba(39, 52, 35, 0.2)",
  roadLight: "rgba(184, 146, 91, 0.24)",
  roadShadow: "rgba(45, 34, 24, 0.18)",
  rockLight: "rgba(176, 177, 160, 0.18)",
  sandLight: "rgba(228, 195, 126, 0.2)",
} as const;

const TERRAIN_ASSET_BY_KIND: Partial<Record<TerrainKind, string>> = {
  "alert-water": "terrain.harbor-water",
  "calm-water": "terrain.harbor-water",
  "deep-water": "terrain.deep-water",
  "harbor-water": "terrain.harbor-water",
  "ledger-water": "terrain.harbor-water",
  "storm-water": "terrain.storm-water",
  "warning-water": "terrain.storm-water",
  "watch-water": "terrain.harbor-water",
  beach: "terrain.shore",
  cliff: "terrain.shore",
  grass: "terrain.land",
  hill: "terrain.land",
  land: "terrain.land",
  road: "terrain.road",
  rock: "terrain.land",
  shore: "terrain.shore",
  water: "terrain.harbor-water",
};

const TERRAIN_ASSET_SCALE = 0.5;

export function drawTerrain({ assets, camera, ctx, height, motion, width, world }: DrawPharosVilleInput) {
  let visibleTileCount = 0;
  for (const tile of world.map.tiles) {
    const terrain = tile.terrain ?? tile.kind;
    if (!isWaterTileKind(terrain)) continue;
    const p = tileToScreen(tile, camera);
    if (!isTileInViewport(p, camera.zoom, width, height)) continue;
    visibleTileCount += 1;
    drawWaterTile(ctx, p.x, p.y, camera.zoom, terrain, tile.x, tile.y, motion, terrainAssetFor(assets, terrain));
  }

  for (const tile of world.map.tiles) {
    const terrain = tile.terrain ?? tile.kind;
    if (isWaterTileKind(terrain)) continue;
    const p = tileToScreen(tile, camera);
    if (!isTileInViewport(p, camera.zoom, width, height)) continue;
    visibleTileCount += 1;
    drawLandTile(ctx, p.x, p.y, camera.zoom, terrain, tile.x, tile.y, terrainAssetFor(assets, terrain));
  }
  return visibleTileCount;
}

function terrainAssetFor(assets: PharosVilleAssetManager | null, terrain: TerrainKind) {
  const assetId = TERRAIN_ASSET_BY_KIND[terrain] ?? null;
  return assetId ? assets?.get(assetId) ?? null : null;
}

function isTileInViewport(point: ScreenPoint, zoom: number, width: number, height: number) {
  const marginX = 36 * zoom;
  const marginY = 22 * zoom;
  return (
    point.x >= -marginX
    && point.x <= width + marginX
    && point.y >= -marginY
    && point.y <= height + marginY
  );
}

function terrainColor(kind: TerrainKind) {
  const value = String(kind);
  const waterStyle = waterTerrainStyle(value);
  if (waterStyle) return waterStyle.base;
  const directColor = TILE_COLORS[value];
  if (directColor) return directColor;
  if (value.includes("water")) return value.includes("deep") ? "#050d1b" : "#153d63";
  if (value.includes("road") || value.includes("stair")) return TILE_COLORS.road;
  if (value.includes("cliff")) return TILE_COLORS.cliff;
  if (value.includes("rock")) return TILE_COLORS.rock;
  if (value.includes("hill")) return TILE_COLORS.hill;
  if (value.includes("grass")) return TILE_COLORS.grass;
  if (value.includes("beach")) return TILE_COLORS.beach;
  return TILE_COLORS.land;
}

function drawWaterTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  kind: TerrainKind,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  asset: NonNullable<ReturnType<PharosVilleAssetManager["get"]>> | null,
) {
  const value = String(kind);
  const width = 32 * zoom;
  const height = 16 * zoom;
  const style = waterTerrainStyle(value) ?? waterTerrainStyle("water")!;
  drawDiamond(ctx, x, y, width, height, style.base);
  if (asset) {
    drawTerrainAsset(ctx, asset, x, y, zoom, 0.18);
  }
  drawWaterDepthOverlay(ctx, x, y, zoom, width, height, tileX, tileY, style.inner);
  drawWaterTerrainTexture(ctx, x, y, zoom, style, tileX, tileY, motion);

  if ((tileX * 13 + tileY * 17) % 9 !== 0) return;
  const wave = motion.reducedMotion
    ? 0.13
    : 0.1 + Math.sin(motion.timeSeconds * 1.05 + tileX * 0.27 + tileY * 0.19) * 0.035;
  ctx.save();
  ctx.strokeStyle = withAlpha(style.wave, Math.max(0.08, wave));
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  ctx.moveTo(x - 9 * zoom, y - 2 * zoom);
  ctx.lineTo(x + 7 * zoom, y + 2 * zoom);
  ctx.stroke();
  if ((tileX + tileY) % 3 === 0) {
    ctx.strokeStyle = withAlpha(style.accent, 0.18);
    ctx.beginPath();
    ctx.moveTo(x - 3 * zoom, y + 4 * zoom);
    ctx.lineTo(x + 10 * zoom, y + 7 * zoom);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWaterDepthOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  width: number,
  height: number,
  tileX: number,
  tileY: number,
  fill: string,
) {
  drawDiamond(ctx, x, y + 1 * zoom, width * 0.88, height * 0.76, fill);
  const shimmer = ((tileX * 11 + tileY * 7) % 9 - 4) / 4;
  if (shimmer === 0) return;
  ctx.save();
  const overlayFill = shimmer > 0
    ? `rgba(218, 236, 224, ${0.01 * shimmer})`
    : `rgba(1, 8, 18, ${-0.012 * shimmer})`;
  ctx.fillStyle = overlayFill;
  drawDiamond(ctx, x, y, width * 0.98, height * 0.9, overlayFill);
  ctx.restore();
}

function drawWaterTerrainTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  style: WaterTerrainStyle,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
) {
  const { texture } = style;
  if (texture === "alert") {
    drawAlertChannelTexture(ctx, x, y, zoom, tileX, tileY, motion, style);
    return;
  }
  if (texture === "calm") {
    drawCalmWaterTexture(ctx, x, y, zoom, tileX, tileY, motion, style);
    return;
  }
  if (texture === "deep") {
    drawDeepSeaTexture(ctx, x, y, zoom, tileX, tileY, motion, style);
    return;
  }
  if (texture === "harbor") {
    drawHarborWaterTexture(ctx, x, y, zoom, tileX, tileY, motion, style);
    return;
  }
  if (texture === "ledger") {
    drawLedgerWaterTexture(ctx, x, y, zoom, tileX, tileY, motion, style);
    return;
  }
  if (texture === "storm") {
    drawDangerStraitTexture(ctx, x, y, zoom, tileX, tileY, motion, style);
    return;
  }
  if (texture === "watch") {
    drawWatchWaterTexture(ctx, x, y, zoom, tileX, tileY, motion, style);
    return;
  }
  if (texture === "warning") {
    drawWarningShoalTexture(ctx, x, y, zoom, tileX, tileY, motion, style);
    return;
  }
  drawOpenWaterTexture(ctx, x, y, zoom, tileX, tileY, motion, style);
}

function drawLedgerWaterTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  style: WaterTerrainStyle,
) {
  const ledgerPulse = motion.reducedMotion ? 0.18 : 0.15 + Math.sin(motion.timeSeconds * 0.62 + tileX * 0.25 + tileY * 0.37) * 0.04;
  ctx.save();
  if ((tileX + tileY) % 2 === 0) {
    drawMooringRule(ctx, x, y, zoom, -10, -2, 9, 3, style.accent, 0.16);
    drawMooringRule(ctx, x, y, zoom, -8, 5, 7, 8, style.wave, 0.18);
  }
  if ((tileX * 5 + tileY * 11) % 6 === 0) {
    ctx.strokeStyle = withAlpha(style.accent, 0.24);
    ctx.lineWidth = Math.max(1, 0.75 * zoom);
    ctx.strokeRect(
      Math.round(x - 4 * zoom),
      Math.round(y - 1 * zoom),
      Math.max(2, Math.round(8 * zoom)),
      Math.max(1, Math.round(4 * zoom)),
    );
  }
  ctx.strokeStyle = withAlpha(style.accent, Math.max(0.12, ledgerPulse));
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  ctx.moveTo(x - 11 * zoom, y - 2 * zoom);
  ctx.lineTo(x + 10 * zoom, y + 3 * zoom);
  ctx.moveTo(x - 8 * zoom, y + 5 * zoom);
  ctx.lineTo(x + 7 * zoom, y + 8 * zoom);
  ctx.stroke();
  if ((tileX * 7 + tileY * 5) % 5 === 0) {
    ctx.fillStyle = withAlpha(style.wave, 0.24);
    drawDiamond(ctx, x - 1 * zoom, y + 2 * zoom, 8 * zoom, 3 * zoom, ctx.fillStyle);
  }
  if ((tileX * 3 + tileY) % 7 === 0) {
    drawDepthSounding(ctx, x + 6 * zoom, y + 1 * zoom, zoom, style.accent, 0.22);
  }
  ctx.restore();
}

function drawHarborWaterTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  style: WaterTerrainStyle,
) {
  const pulse = motion.reducedMotion ? 0.16 : 0.13 + Math.sin(motion.timeSeconds * 0.85 + tileX * 0.23 + tileY * 0.17) * 0.04;
  ctx.save();
  ctx.strokeStyle = withAlpha(style.wave, Math.max(0.1, pulse));
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  ctx.moveTo(x - 10 * zoom, y + 2 * zoom);
  ctx.lineTo(x + 8 * zoom, y + 5 * zoom);
  if ((tileX + tileY) % 3 === 0) {
    ctx.moveTo(x - 5 * zoom, y - 2 * zoom);
    ctx.lineTo(x + 5 * zoom, y + 1 * zoom);
  }
  ctx.stroke();
  if ((tileX * 7 + tileY * 5) % 6 === 0) {
    const reflection = withAlpha(style.accent, 0.24);
    ctx.fillStyle = reflection;
    drawDiamond(ctx, x + 2 * zoom, y + 2 * zoom, 8 * zoom, 3 * zoom, reflection);
  }
  ctx.restore();
}

function drawCalmWaterTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  style: WaterTerrainStyle,
) {
  const hush = motion.reducedMotion ? 0.13 : 0.11 + Math.sin(motion.timeSeconds * 0.48 + tileX * 0.19 + tileY * 0.13) * 0.025;
  ctx.save();
  ctx.strokeStyle = withAlpha(style.wave, Math.max(0.08, hush));
  ctx.lineWidth = Math.max(1, 0.85 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 12 * zoom, y + 3 * zoom);
  ctx.quadraticCurveTo(x - 2 * zoom, y + 1.5 * zoom, x + 11 * zoom, y + 3 * zoom);
  if ((tileX * 11 + tileY * 5) % 5 === 0) {
    ctx.moveTo(x - 5 * zoom, y - 1 * zoom);
    ctx.quadraticCurveTo(x, y - 2 * zoom, x + 6 * zoom, y - 1 * zoom);
  }
  ctx.stroke();
  if ((tileX * 7 + tileY * 3) % 8 === 0) {
    drawDepthSounding(ctx, x - 5 * zoom, y + 1 * zoom, zoom, style.accent, 0.18);
  }
  if ((tileX + tileY) % 6 === 0) {
    const reflection = withAlpha(style.accent, 0.2);
    ctx.fillStyle = reflection;
    drawDiamond(ctx, x, y + 2 * zoom, 9 * zoom, 2.5 * zoom, reflection);
  }
  ctx.restore();
}

function drawDeepSeaTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  style: WaterTerrainStyle,
) {
  if ((tileX * 5 + tileY * 7) % 6 !== 0) return;
  const glint = motion.reducedMotion ? 0.08 : 0.06 + Math.sin(motion.timeSeconds * 0.6 + tileX * 0.2 + tileY * 0.31) * 0.025;
  ctx.save();
  ctx.strokeStyle = withAlpha(style.wave, Math.max(0.04, glint));
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  ctx.moveTo(x - 8 * zoom, y);
  ctx.lineTo(x + 6 * zoom, y + 3 * zoom);
  ctx.stroke();
  ctx.restore();
}

function drawAlertChannelTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  style: WaterTerrainStyle,
) {
  const pulse = motion.reducedMotion ? 0.16 : 0.14 + Math.sin(motion.timeSeconds * 1.1 + tileX * 0.31) * 0.04;
  ctx.save();
  const drift = motion.reducedMotion ? 0 : Math.sin(motion.timeSeconds * 0.7 + tileY * 0.23) * 1.5 * zoom;
  ctx.strokeStyle = withAlpha(style.wave, Math.max(0.12, pulse - 0.03));
  ctx.lineWidth = Math.max(1, 0.9 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 12 * zoom + drift, y + 4 * zoom);
  ctx.quadraticCurveTo(x - 4 * zoom + drift, y - 3 * zoom, x + 10 * zoom + drift, y);
  if ((tileX + tileY) % 3 === 0) {
    ctx.moveTo(x - 8 * zoom - drift, y + 8 * zoom);
    ctx.quadraticCurveTo(x - 2 * zoom - drift, y + 3 * zoom, x + 8 * zoom - drift, y + 6 * zoom);
  }
  ctx.stroke();
  ctx.strokeStyle = withAlpha(style.accent, Math.max(0.16, pulse));
  ctx.lineWidth = Math.max(1, 1.1 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 10 * zoom, y - 3 * zoom);
  ctx.lineTo(x + 9 * zoom, y + 2 * zoom);
  if ((tileX + tileY) % 2 === 0) {
    ctx.moveTo(x - 3 * zoom, y + 5 * zoom);
    ctx.lineTo(x + 8 * zoom, y + 8 * zoom);
  }
  ctx.stroke();
  if ((tileX * 13 + tileY * 5) % 7 === 0) {
    drawCurrentWakeMark(ctx, x, y, zoom, style.accent, 0.28);
  }
  ctx.restore();
}

function drawWatchWaterTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  style: WaterTerrainStyle,
) {
  const crosswind = motion.reducedMotion ? 0.16 : 0.14 + Math.sin(motion.timeSeconds * 0.95 + tileY * 0.29) * 0.04;
  ctx.save();
  if ((tileX * 7 + tileY * 2) % 4 !== 1) {
    ctx.strokeStyle = withAlpha(style.accent, 0.16);
    ctx.lineWidth = Math.max(1, 0.8 * zoom);
    ctx.setLineDash([2.8 * zoom, 3.4 * zoom]);
    ctx.beginPath();
    ctx.moveTo(x - 13 * zoom, y - 1 * zoom);
    ctx.lineTo(x + 11 * zoom, y + 5 * zoom);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = withAlpha(style.wave, Math.max(0.12, crosswind));
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  ctx.moveTo(x - 11 * zoom, y + 1 * zoom);
  ctx.lineTo(x - 3 * zoom, y - 1 * zoom);
  ctx.lineTo(x + 7 * zoom, y + 2 * zoom);
  if ((tileX * 3 + tileY * 7) % 3 === 0) {
    ctx.moveTo(x - 7 * zoom, y + 6 * zoom);
    ctx.lineTo(x + 9 * zoom, y + 5 * zoom);
  }
  ctx.stroke();
  if ((tileX + tileY * 5) % 7 === 0) {
    drawBreakwaterFoam(ctx, x, y, zoom, style.wave, 0.22);
  }
  ctx.restore();
}

function drawWarningShoalTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  style: WaterTerrainStyle,
) {
  const chop = motion.reducedMotion ? 0.2 : 0.18 + Math.sin(motion.timeSeconds * 1.6 + tileY * 0.37) * 0.05;
  ctx.save();
  if ((tileX + tileY) % 2 === 0) {
    const shoalFill = withAlpha(style.accent, 0.22);
    drawDiamond(ctx, x + 1 * zoom, y + 1 * zoom, 18 * zoom, 7 * zoom, shoalFill);
    ctx.strokeStyle = withAlpha(style.wave, 0.18);
    ctx.lineWidth = Math.max(1, 0.75 * zoom);
    ctx.beginPath();
    ctx.moveTo(x - 7 * zoom, y + 1 * zoom);
    ctx.lineTo(x + 7 * zoom, y + 4 * zoom);
    ctx.moveTo(x - 3 * zoom, y - 2 * zoom);
    ctx.lineTo(x + 10 * zoom, y + 1 * zoom);
    ctx.stroke();
  }
  ctx.strokeStyle = withAlpha(style.wave, Math.max(0.16, chop));
  ctx.lineWidth = Math.max(1, 1.2 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 11 * zoom, y - 2 * zoom);
  ctx.lineTo(x - 4 * zoom, y + 2 * zoom);
  ctx.lineTo(x + 3 * zoom, y - 1 * zoom);
  ctx.moveTo(x + 3 * zoom, y + 5 * zoom);
  ctx.lineTo(x + 11 * zoom, y + 8 * zoom);
  ctx.stroke();
  if ((tileX * 5 + tileY * 7) % 4 === 0) {
    ctx.fillStyle = withAlpha(style.accent, 0.3);
    ctx.fillRect(Math.round(x - 2 * zoom), Math.round(y + 1 * zoom), Math.max(1, Math.round(4 * zoom)), Math.max(1, Math.round(2 * zoom)));
  }
  if ((tileX * 11 + tileY * 13) % 9 === 0) {
    drawDepthSounding(ctx, x + 7 * zoom, y + 3 * zoom, zoom, style.wave, 0.26);
  }
  ctx.restore();
}

function drawDangerStraitTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  style: WaterTerrainStyle,
) {
  const whitecap = motion.reducedMotion ? 0.22 : 0.18 + Math.sin(motion.timeSeconds * 2.1 + tileX * 0.43 + tileY * 0.29) * 0.08;
  ctx.save();
  if ((tileX * 3 + tileY * 5) % 4 !== 2) {
    ctx.strokeStyle = "rgba(7, 12, 21, 0.34)";
    ctx.lineWidth = Math.max(1, 1.25 * zoom);
    ctx.beginPath();
    ctx.moveTo(x - 13 * zoom, y + 6 * zoom);
    ctx.lineTo(x + 12 * zoom, y - 5 * zoom);
    ctx.stroke();
  }
  ctx.strokeStyle = withAlpha(style.wave, Math.max(0.14, whitecap));
  ctx.lineWidth = Math.max(1, 1.4 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 12 * zoom, y - 4 * zoom);
  ctx.lineTo(x - 6 * zoom, y - 1 * zoom);
  ctx.lineTo(x - 1 * zoom, y - 5 * zoom);
  ctx.moveTo(x + 2 * zoom, y + 4 * zoom);
  ctx.lineTo(x + 8 * zoom, y + 7 * zoom);
  ctx.lineTo(x + 13 * zoom, y + 3 * zoom);
  ctx.stroke();
  if ((tileX + tileY) % 3 === 0) {
    ctx.strokeStyle = withAlpha(style.accent, 0.22);
    ctx.lineWidth = Math.max(1, 0.85 * zoom);
    ctx.beginPath();
    ctx.moveTo(x - 8 * zoom, y + 1 * zoom);
    ctx.lineTo(x - 3 * zoom, y - 3 * zoom);
    ctx.lineTo(x + 2 * zoom, y + 1 * zoom);
    ctx.moveTo(x + 4 * zoom, y + 6 * zoom);
    ctx.lineTo(x + 9 * zoom, y + 2 * zoom);
    ctx.lineTo(x + 13 * zoom, y + 5 * zoom);
    ctx.stroke();
  }
  if ((tileX * 7 + tileY * 11) % 8 === 0) {
    ctx.fillStyle = withAlpha(style.wave, 0.18);
    ctx.fillRect(Math.round(x - 1 * zoom), Math.round(y - 5 * zoom), Math.max(1, Math.round(2 * zoom)), Math.max(1, Math.round(2 * zoom)));
    ctx.fillRect(Math.round(x + 5 * zoom), Math.round(y + 3 * zoom), Math.max(1, Math.round(2 * zoom)), Math.max(1, Math.round(2 * zoom)));
  }
  ctx.restore();
}

function drawOpenWaterTexture(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  tileX: number,
  tileY: number,
  motion: PharosVilleCanvasMotion,
  style: WaterTerrainStyle,
) {
  if ((tileX * 7 + tileY * 13) % 4 !== 0) return;
  const drift = motion.reducedMotion ? 0.12 : 0.1 + Math.sin(motion.timeSeconds * 0.72 + tileX * 0.17 + tileY * 0.21) * 0.03;
  ctx.save();
  ctx.strokeStyle = withAlpha(style.accent, Math.max(0.08, drift));
  ctx.lineWidth = Math.max(1, 0.9 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 11 * zoom, y + 1 * zoom);
  ctx.lineTo(x - 2 * zoom, y + 4 * zoom);
  ctx.lineTo(x + 9 * zoom, y + 1 * zoom);
  if ((tileX + tileY) % 5 === 0) {
    ctx.moveTo(x - 5 * zoom, y - 4 * zoom);
    ctx.lineTo(x + 7 * zoom, y - 1 * zoom);
  }
  ctx.stroke();
  ctx.restore();
}

function drawMooringRule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  alpha: number,
) {
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = Math.max(1, 0.75 * zoom);
  ctx.beginPath();
  ctx.moveTo(x + fromX * zoom, y + fromY * zoom);
  ctx.lineTo(x + toX * zoom, y + toY * zoom);
  ctx.stroke();
}

function drawDepthSounding(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.fillStyle = withAlpha(color, alpha * 0.82);
  ctx.lineWidth = Math.max(1, 0.65 * zoom);
  ctx.beginPath();
  ctx.arc(x, y, Math.max(1.4, 2.2 * zoom), 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillRect(
    Math.round(x - 0.8 * zoom),
    Math.round(y - 0.8 * zoom),
    Math.max(1, Math.round(1.6 * zoom)),
    Math.max(1, Math.round(1.6 * zoom)),
  );
  ctx.restore();
}

function drawCurrentWakeMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = Math.max(1, 0.8 * zoom);
  ctx.beginPath();
  ctx.moveTo(x + 2 * zoom, y - 5 * zoom);
  ctx.lineTo(x + 8 * zoom, y - 1 * zoom);
  ctx.lineTo(x + 2 * zoom, y + 3 * zoom);
  ctx.moveTo(x - 5 * zoom, y - 2 * zoom);
  ctx.lineTo(x + 1 * zoom, y + 2 * zoom);
  ctx.lineTo(x - 5 * zoom, y + 6 * zoom);
  ctx.stroke();
  ctx.restore();
}

function drawBreakwaterFoam(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = Math.max(1, 0.9 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 12 * zoom, y + 5 * zoom);
  ctx.quadraticCurveTo(x - 8 * zoom, y + 1 * zoom, x - 4 * zoom, y + 5 * zoom);
  ctx.quadraticCurveTo(x, y + 9 * zoom, x + 4 * zoom, y + 5 * zoom);
  ctx.quadraticCurveTo(x + 8 * zoom, y + 1 * zoom, x + 12 * zoom, y + 5 * zoom);
  ctx.stroke();
  ctx.restore();
}

function drawLandTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  kind: TerrainKind,
  tileX: number,
  tileY: number,
  asset: NonNullable<ReturnType<PharosVilleAssetManager["get"]>> | null,
) {
  const value = String(kind);
  const width = 32 * zoom;
  const height = 16 * zoom;
  drawDiamond(ctx, x, y, width, height, terrainColor(kind));
  if (asset) {
    drawTerrainAsset(ctx, asset, x, y, zoom, value === "road" ? 0.24 : 0.28);
    drawDiamond(ctx, x, y, width, height, withAlpha(terrainColor(kind), value === "road" ? 0.14 : 0.1));
  }
  drawGroundGrain(ctx, x, y, zoom, value, tileX, tileY);

  if (isElevatedTileKind(kind)) {
    drawTileLowerFacet(ctx, x, y, width, height, value === "cliff" || value.includes("cliff")
      ? TERRAIN_TEXTURE.cliffFace
      : "rgba(54, 63, 45, 0.32)");
  }

  if (isShoreTileKind(kind)) {
    drawShoreFoam(ctx, x, y, zoom, tileX, tileY);
  } else if (value === "road" || value.includes("road") || value.includes("stair")) {
    drawRoadTexture(ctx, x, y, zoom);
  } else if (value === "rock" || value === "cliff" || value.includes("rock") || value.includes("cliff")) {
    drawRockTexture(ctx, x, y, zoom, tileX, tileY);
  } else if (value === "grass" || value === "hill" || value === "land" || (tileX * 19 + tileY * 23) % 6 === 0) {
    drawGrassTexture(ctx, x, y, zoom, tileX, tileY);
  }
}

function drawTerrainAsset(
  ctx: CanvasRenderingContext2D,
  asset: NonNullable<ReturnType<PharosVilleAssetManager["get"]>>,
  x: number,
  y: number,
  zoom: number,
  alpha = 1,
) {
  const scale = zoom * TERRAIN_ASSET_SCALE;
  if (alpha < 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    drawAsset(ctx, asset, x, y + TILE_HEIGHT * zoom * 0.46, scale);
    ctx.restore();
    return;
  }
  drawAsset(ctx, asset, x, y + TILE_HEIGHT * zoom * 0.46, scale);
}

function drawGroundGrain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  value: string,
  tileX: number,
  tileY: number,
) {
  if (value === "road" || value.includes("road") || value.includes("stair")) return;
  if (value === "rock" || value === "cliff" || value.includes("rock") || value.includes("cliff")) return;
  const offset = ((tileX * 11 + tileY * 5) % 5 - 2) * zoom;
  ctx.save();
  if (value === "beach" || value === "shore") {
    ctx.fillStyle = TERRAIN_TEXTURE.beachPebble;
    ctx.fillRect(Math.round(x - 4 * zoom + offset), Math.round(y + 1 * zoom), Math.max(1, Math.round(2 * zoom)), Math.max(1, Math.round(2 * zoom)));
    if ((tileX + tileY) % 3 === 0) {
      ctx.strokeStyle = TERRAIN_TEXTURE.sandLight;
      ctx.lineWidth = Math.max(1, 0.8 * zoom);
      ctx.beginPath();
      ctx.moveTo(x - 9 * zoom, y - 2 * zoom);
      ctx.lineTo(x + 7 * zoom, y + 1 * zoom);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  ctx.strokeStyle = TERRAIN_TEXTURE.mossShadow;
  ctx.lineWidth = Math.max(1, 0.8 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 9 * zoom + offset, y + 2 * zoom);
  ctx.lineTo(x - 2 * zoom + offset, y + 5 * zoom);
  if ((tileX * 3 + tileY * 7) % 2 === 0) {
    ctx.moveTo(x + 1 * zoom - offset, y - 3 * zoom);
    ctx.lineTo(x + 8 * zoom - offset, y);
  }
  ctx.stroke();
  if ((tileX * 17 + tileY * 19) % 4 === 0) {
    ctx.fillStyle = TERRAIN_TEXTURE.groundGrain;
    drawDiamond(ctx, x + 2 * zoom, y + 2 * zoom, 7 * zoom, 3 * zoom, ctx.fillStyle);
  }
  ctx.restore();
}

function drawShoreFoam(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, tileX: number, tileY: number) {
  ctx.save();
  ctx.strokeStyle = TERRAIN_TEXTURE.foam;
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  if ((tileX + tileY) % 2 === 0) {
    ctx.moveTo(x - 12 * zoom, y + 1 * zoom);
    ctx.lineTo(x - 2 * zoom, y + 6 * zoom);
  } else {
    ctx.moveTo(x + 2 * zoom, y + 6 * zoom);
    ctx.lineTo(x + 12 * zoom, y + 1 * zoom);
  }
  ctx.stroke();
  ctx.strokeStyle = TERRAIN_TEXTURE.sandLight;
  ctx.beginPath();
  ctx.moveTo(x - 6 * zoom, y - 2 * zoom);
  ctx.lineTo(x + 6 * zoom, y + 1 * zoom);
  ctx.stroke();
  ctx.restore();
}

function drawRoadTexture(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number) {
  ctx.save();
  ctx.strokeStyle = TERRAIN_TEXTURE.roadShadow;
  ctx.lineWidth = Math.max(1, 1.8 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 11 * zoom, y + 2 * zoom);
  ctx.lineTo(x + 9 * zoom, y + 5 * zoom);
  ctx.stroke();
  ctx.strokeStyle = TERRAIN_TEXTURE.roadLight;
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  ctx.moveTo(x - 10 * zoom, y - 1 * zoom);
  ctx.lineTo(x + 10 * zoom, y + 2 * zoom);
  ctx.stroke();
  ctx.restore();
}

function drawRockTexture(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, tileX: number, tileY: number) {
  const offset = ((tileX * 7 + tileY * 11) % 5 - 2) * zoom;
  ctx.save();
  ctx.strokeStyle = TERRAIN_TEXTURE.rockLight;
  ctx.lineWidth = Math.max(1, zoom);
  ctx.beginPath();
  ctx.moveTo(x - 7 * zoom + offset, y - 2 * zoom);
  ctx.lineTo(x - 1 * zoom + offset, y + 1 * zoom);
  ctx.lineTo(x + 6 * zoom + offset, y - 1 * zoom);
  ctx.stroke();
  ctx.restore();
}

function drawGrassTexture(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, tileX: number, tileY: number) {
  const offset = ((tileX * 5 + tileY * 3) % 7 - 3) * zoom;
  ctx.save();
  ctx.fillStyle = TERRAIN_TEXTURE.grassDark;
  ctx.fillRect(Math.round(x - 2 * zoom + offset), Math.round(y - 1 * zoom), Math.max(1, Math.round(2 * zoom)), Math.max(1, Math.round(3 * zoom)));
  ctx.fillStyle = TERRAIN_TEXTURE.grassMid;
  ctx.fillRect(Math.round(x - 5 * zoom - offset * 0.4), Math.round(y + 2 * zoom), Math.max(1, Math.round(2 * zoom)), Math.max(1, Math.round(2 * zoom)));
  ctx.fillStyle = TERRAIN_TEXTURE.grassLight;
  ctx.fillRect(Math.round(x + 2 * zoom + offset), Math.round(y + 1 * zoom), Math.max(1, Math.round(2 * zoom)), Math.max(1, Math.round(2 * zoom)));
  ctx.restore();
}
