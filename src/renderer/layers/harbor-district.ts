import { ambientSeaPhase } from "../../systems/motion-types";
import { ETHEREUM_L2_DOCK_CHAIN_IDS } from "../../systems/world-layout";
import type { PharosVilleWorld } from "../../systems/world-types";
import { tileToScreen, type IsoCamera, type ScreenPoint } from "../../systems/projection";
import { drawAsset, drawDiamond } from "../canvas-primitives";
import { dockDrawPoint } from "../geometry";
import type { DrawPharosVilleInput, PharosVilleCanvasMotion } from "../render-types";

const MAIN_SEAWALL_RUN = [
  { x: 20.0, y: 28.0 },
  { x: 24.4, y: 24.3 },
  { x: 30.2, y: 21.4 },
  { x: 37.8, y: 22.5 },
  { x: 42.3, y: 27.1 },
  { x: 43.5, y: 30.4 },
  { x: 42.2, y: 35.0 },
  { x: 36.8, y: 40.3 },
  { x: 31.0, y: 41.7 },
  { x: 28.0, y: 40.8 },
  { x: 22.5, y: 37.0 },
  { x: 19.0, y: 32.4 },
  { x: 20.0, y: 28.0 },
] as const;

const GENERATED_SEAWALL_ASSETS = [
  {
    assetId: "overlay.seawall-straight",
    flipX: false,
    scale: 0.64,
    tile: { x: 30.8, y: 22.7 },
    yOffset: 2,
  },
  {
    assetId: "overlay.seawall-straight",
    flipX: true,
    scale: 0.62,
    tile: { x: 40.7, y: 28.0 },
    yOffset: 2,
  },
  {
    assetId: "overlay.seawall-straight",
    flipX: false,
    scale: 0.68,
    tile: { x: 34.6, y: 40.9 },
    yOffset: 2,
  },
  {
    assetId: "overlay.seawall-straight",
    flipX: true,
    scale: 0.62,
    tile: { x: 22.4, y: 35.7 },
    yOffset: 2,
  },
  {
    assetId: "overlay.seawall-corner",
    flipX: false,
    scale: 0.52,
    tile: { x: 20.8, y: 29.6 },
    yOffset: 3,
  },
  {
    assetId: "overlay.seawall-corner",
    flipX: true,
    scale: 0.5,
    tile: { x: 42.7, y: 33.6 },
    yOffset: 3,
  },
] as const;

export function drawHarborDistrictGround(input: DrawPharosVilleInput) {
  const { camera, ctx } = input;
  ctx.save();
  drawDistrictPad(ctx, camera, { x: 31.0, y: 23.3 }, 88, 30, "rgba(55, 55, 47, 0.3)", "rgba(197, 176, 125, 0.16)");
  drawDistrictPad(ctx, camera, { x: 21.2, y: 32.6 }, 72, 34, "rgba(55, 55, 47, 0.34)", "rgba(197, 176, 125, 0.18)");
  drawDistrictPad(ctx, camera, { x: 32.2, y: 39.6 }, 96, 34, "rgba(55, 55, 47, 0.36)", "rgba(197, 176, 125, 0.2)");
  drawDistrictPad(ctx, camera, { x: 42.5, y: 31.7 }, 78, 34, "rgba(55, 55, 47, 0.4)", "rgba(197, 176, 125, 0.22)");

  drawSeawallRun(ctx, camera, MAIN_SEAWALL_RUN);
  drawGeneratedSeawallAssets(input);
  ctx.restore();
}

function drawGeneratedSeawallAssets(input: DrawPharosVilleInput) {
  const { assets, camera, ctx } = input;
  if (!assets) return;
  for (const placement of GENERATED_SEAWALL_ASSETS) {
    const asset = assets.get(placement.assetId);
    if (!asset) continue;
    const p = tileToScreen(placement.tile, camera);
    const y = p.y + placement.yOffset * camera.zoom;
    const scale = camera.zoom * placement.scale;
    ctx.save();
    ctx.globalAlpha = 0.76;
    if (placement.flipX) {
      ctx.translate(p.x, y);
      ctx.scale(-1, 1);
      drawAsset(ctx, asset, 0, 0, scale);
    } else {
      drawAsset(ctx, asset, p.x, y, scale);
    }
    ctx.restore();
  }
}

export function drawEthereumHarborExtensions({ camera, ctx, motion, world }: DrawPharosVilleInput) {
  const ethereumDock = world.docks.find((dock) => dock.chainId === "ethereum") ?? null;
  if (!ethereumDock) return;

  const extensionDocks = ETHEREUM_L2_DOCK_CHAIN_IDS
    .map((chainId) => world.docks.find((dock) => dock.chainId === chainId) ?? null)
    .filter((dock): dock is PharosVilleWorld["docks"][number] => dock != null);
  if (extensionDocks.length === 0) return;

  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const anchor = dockDrawPoint(ethereumDock, camera, world.map.width);
  ctx.save();
  drawDistrictPad(ctx, camera, { x: 40.4, y: 35.2 }, 90, 30, "rgba(42, 50, 48, 0.34)", "rgba(197, 176, 125, 0.16)");
  for (const [index, dock] of extensionDocks.entries()) {
    const point = dockDrawPoint(dock, camera, world.map.width);
    drawRollupExtensionCauseway(ctx, anchor, point, camera.zoom, index, extensionDocks.length, motion);
    drawRollupExtensionSlip(ctx, point, camera.zoom, dock.size, index, motion);
  }
  drawRollupHubMark(ctx, anchor, camera.zoom, extensionDocks.length, time);
  ctx.restore();
}

function drawRollupExtensionCauseway(
  ctx: CanvasRenderingContext2D,
  from: ScreenPoint,
  to: ScreenPoint,
  zoom: number,
  index: number,
  total: number,
  motion: PharosVilleCanvasMotion,
) {
  const side = index - (total - 1) / 2;
  const bend = Math.max(-26, Math.min(26, side * 9)) * zoom;
  const midX = (from.x + to.x) / 2 + bend;
  const midY = (from.y + to.y) / 2 - (12 + Math.abs(side) * 2.5) * zoom;
  const pulse = 0.22 + ambientSeaPhase(motion, index * 0.7) * 0.04;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(5, 8, 10, 0.34)";
  ctx.lineWidth = Math.max(2.2, 5.2 * zoom);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y + 1.5 * zoom);
  ctx.quadraticCurveTo(midX, midY + 3 * zoom, to.x, to.y + 1.5 * zoom);
  ctx.stroke();

  ctx.strokeStyle = "rgba(176, 153, 104, 0.72)";
  ctx.lineWidth = Math.max(1.4, 2.6 * zoom);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y - 1 * zoom);
  ctx.quadraticCurveTo(midX, midY, to.x, to.y - 1 * zoom);
  ctx.stroke();

  ctx.strokeStyle = `rgba(128, 214, 206, ${pulse})`;
  ctx.lineWidth = Math.max(1, 1.1 * zoom);
  ctx.setLineDash([4 * zoom, 5 * zoom]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y - 3 * zoom);
  ctx.quadraticCurveTo(midX, midY - 2 * zoom, to.x, to.y - 3 * zoom);
  ctx.stroke();
  ctx.restore();
}

function drawRollupExtensionSlip(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  dockSize: number,
  index: number,
  motion: PharosVilleCanvasMotion,
) {
  const scale = Math.max(0.72, zoom);
  const width = (34 + dockSize * 0.8) * scale;
  const height = (12 + dockSize * 0.28) * scale;
  const shimmer = 0.2 + ambientSeaPhase(motion, index) * 0.035;
  ctx.save();
  drawDiamond(ctx, point.x, point.y + 12 * scale, width * 1.35, height * 1.45, "rgba(5, 8, 10, 0.26)");
  drawDiamond(ctx, point.x, point.y + 9 * scale, width, height, "rgba(73, 67, 55, 0.54)");
  drawDiamond(ctx, point.x, point.y + 6 * scale, width * 0.68, height * 0.58, "rgba(211, 184, 126, 0.28)");
  ctx.strokeStyle = `rgba(128, 214, 206, ${shimmer})`;
  ctx.lineWidth = Math.max(1, 0.9 * scale);
  ctx.beginPath();
  ctx.moveTo(point.x - width * 0.3, point.y + 8 * scale);
  ctx.lineTo(point.x - width * 0.04, point.y + 10.5 * scale);
  ctx.moveTo(point.x + width * 0.08, point.y + 10.5 * scale);
  ctx.lineTo(point.x + width * 0.32, point.y + 8 * scale);
  ctx.stroke();
  ctx.restore();
}

function drawRollupHubMark(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  extensionCount: number,
  time: number,
) {
  const scale = Math.max(0.72, zoom);
  const pulse = 0.24 + Math.sin(time * 0.64) * 0.035;
  ctx.save();
  ctx.globalAlpha = extensionCount > 0 ? 1 : 0.5;
  ctx.strokeStyle = `rgba(128, 214, 206, ${pulse})`;
  ctx.lineWidth = Math.max(1, 1.2 * scale);
  ctx.beginPath();
  ctx.ellipse(point.x, point.y + 4 * scale, 26 * scale, 8 * scale, -0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 224, 160, 0.24)";
  drawDiamond(ctx, point.x, point.y + 4 * scale, 14 * scale, 6 * scale, ctx.fillStyle);
  ctx.restore();
}

function drawDistrictPad(
  ctx: CanvasRenderingContext2D,
  camera: IsoCamera,
  tile: { x: number; y: number },
  width: number,
  height: number,
  fill: string,
  top: string,
) {
  const p = tileToScreen(tile, camera);
  const zoom = camera.zoom;
  drawDiamond(ctx, p.x, p.y + 10 * zoom, width * zoom, height * zoom, "rgba(4, 8, 10, 0.2)");
  drawDiamond(ctx, p.x, p.y + 6 * zoom, width * zoom * 0.92, height * zoom * 0.82, fill);
  drawDiamond(ctx, p.x, p.y + 1 * zoom, width * zoom * 0.76, height * zoom * 0.5, top);
  drawDistrictPaving(ctx, p.x, p.y + 1 * zoom, width * zoom * 0.76, height * zoom * 0.5, zoom);
}

function drawSeawallRun(ctx: CanvasRenderingContext2D, camera: IsoCamera, tiles: readonly { x: number; y: number }[]) {
  const dense = densifySeawallTiles(tiles, 1.4);
  const points = dense.map((tile) => tileToScreen(tile, camera));
  const [firstPoint, ...rest] = points;
  if (!firstPoint) return;
  ctx.save();
  const zoom = camera.zoom;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";

  ctx.strokeStyle = "rgba(225, 243, 235, 0.36)";
  ctx.lineWidth = Math.max(4, 7.4 * zoom);
  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y + 10 * zoom);
  for (const point of rest) ctx.lineTo(point.x, point.y + 10 * zoom);
  ctx.stroke();

  ctx.strokeStyle = "rgba(10, 14, 16, 0.5)";
  ctx.lineWidth = Math.max(5, 9.6 * zoom);
  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y + 7 * zoom);
  for (const point of rest) ctx.lineTo(point.x, point.y + 7 * zoom);
  ctx.stroke();

  ctx.strokeStyle = "rgba(91, 126, 119, 0.74)";
  ctx.lineWidth = Math.max(4, 7 * zoom);
  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y + 4.8 * zoom);
  for (const point of rest) ctx.lineTo(point.x, point.y + 4.8 * zoom);
  ctx.stroke();

  ctx.strokeStyle = "rgba(154, 139, 112, 0.92)";
  ctx.lineWidth = Math.max(4, 6.6 * zoom);
  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y + 2.2 * zoom);
  for (const point of rest) ctx.lineTo(point.x, point.y + 2.2 * zoom);
  ctx.stroke();

  ctx.strokeStyle = "rgba(224, 209, 170, 0.95)";
  ctx.lineWidth = Math.max(3, 4.4 * zoom);
  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y - 0.8 * zoom);
  for (const point of rest) ctx.lineTo(point.x, point.y - 0.8 * zoom);
  ctx.stroke();

  ctx.strokeStyle = "rgba(110, 92, 74, 0.42)";
  ctx.lineWidth = Math.max(1, 0.95 * zoom);
  ctx.setLineDash([5 * zoom, 4 * zoom]);
  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y + 2.4 * zoom);
  for (const point of rest) ctx.lineTo(point.x, point.y + 2.4 * zoom);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(249, 235, 196, 0.48)";
  ctx.lineWidth = Math.max(1, 1.2 * zoom);
  ctx.beginPath();
  ctx.moveTo(firstPoint.x - 3 * zoom, firstPoint.y - 3 * zoom);
  for (const point of rest) ctx.lineTo(point.x - 3 * zoom, point.y - 3 * zoom);
  ctx.stroke();

  for (const [index, point] of points.entries()) {
    if (index % 2 === 0) {
      ctx.strokeStyle = "rgba(72, 58, 48, 0.38)";
      ctx.lineWidth = Math.max(1, 0.85 * zoom);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y - 2.5 * zoom);
      ctx.lineTo(point.x, point.y + 5.5 * zoom);
      ctx.stroke();
    }
    drawDiamond(
      ctx,
      point.x,
      point.y - 1.8 * zoom,
      8.2 * zoom,
      3.2 * zoom,
      "rgba(238, 222, 178, 0.6)",
    );
    if (index % 3 === 1) {
      ctx.fillStyle = "rgba(160, 110, 58, 0.72)";
      ctx.beginPath();
      ctx.arc(point.x, point.y - 0.6 * zoom, 1.3 * zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function densifySeawallTiles(
  tiles: readonly { x: number; y: number }[],
  step: number,
): { x: number; y: number }[] {
  if (tiles.length < 2) return tiles.slice();
  const out: { x: number; y: number }[] = [tiles[0]!];
  for (let i = 0; i < tiles.length - 1; i += 1) {
    const a = tiles[i]!;
    const b = tiles[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const subdiv = Math.max(1, Math.round(dist / step));
    for (let j = 1; j <= subdiv; j += 1) {
      const t = j / subdiv;
      out.push({ x: a.x + dx * t, y: a.y + dy * t });
    }
  }
  return out;
}

function drawDistrictPaving(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  zoom: number,
) {
  ctx.save();
  ctx.strokeStyle = "rgba(55, 39, 25, 0.24)";
  ctx.lineWidth = Math.max(1, 0.8 * zoom);
  for (const ratio of [-0.28, -0.08, 0.12, 0.31]) {
    const span = width * (0.43 - Math.abs(ratio) * 0.46);
    ctx.beginPath();
    ctx.moveTo(x - span, y + ratio * height);
    ctx.lineTo(x + span, y + ratio * height + 2 * zoom);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(235, 213, 160, 0.18)";
  for (const ratio of [-0.2, 0.04, 0.26]) {
    const span = width * (0.28 - Math.abs(ratio) * 0.26);
    ctx.beginPath();
    ctx.moveTo(x - span, y + ratio * height - 2 * zoom);
    ctx.lineTo(x - span * 0.2, y + ratio * height + 1 * zoom);
    ctx.moveTo(x + span * 0.22, y + ratio * height - 1 * zoom);
    ctx.lineTo(x + span, y + ratio * height + 2 * zoom);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(247, 214, 138, 0.08)";
  drawDiamond(ctx, x, y - 1 * zoom, width * 0.46, height * 0.28, ctx.fillStyle);
  ctx.restore();
}
