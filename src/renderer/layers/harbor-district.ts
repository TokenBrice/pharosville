import { ambientSeaPhase } from "../../systems/motion-types";
import { ETHEREUM_L2_DOCK_CHAIN_IDS } from "../../systems/world-layout";
import type { PharosVilleWorld } from "../../systems/world-types";
import { tileToScreen, type IsoCamera, type ScreenPoint } from "../../systems/projection";
import { drawAsset, drawDiamond } from "../canvas-primitives";
import { dockDrawPoint } from "../geometry";
import type { DrawPharosVilleInput, PharosVilleCanvasMotion } from "../render-types";

const CENTRAL_ISLAND_MODEL_TILE = { x: 31.0, y: 39.0 } as const;
const CENTRAL_ISLAND_MODEL_SCALE = 1.08;

export function drawCentralIslandModel({ assets, camera, ctx }: DrawPharosVilleInput) {
  const islandAsset = assets?.get("overlay.central-island") ?? null;
  if (!islandAsset) return;
  const point = tileToScreen(CENTRAL_ISLAND_MODEL_TILE, camera);
  ctx.save();
  ctx.fillStyle = "rgba(3, 8, 10, 0.28)";
  ctx.beginPath();
  ctx.ellipse(
    point.x,
    point.y + 18 * camera.zoom,
    138 * camera.zoom,
    54 * camera.zoom,
    -0.08,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.globalAlpha = 0.72;
  drawAsset(
    ctx,
    islandAsset,
    point.x,
    point.y + 10 * camera.zoom,
    camera.zoom * CENTRAL_ISLAND_MODEL_SCALE,
  );
  ctx.restore();
}

export function drawHarborDistrictGround({ camera, ctx }: DrawPharosVilleInput) {
  ctx.save();
  drawDistrictPad(ctx, camera, { x: 31.0, y: 23.3 }, 88, 30, "rgba(55, 55, 47, 0.3)", "rgba(197, 176, 125, 0.16)");
  drawDistrictPad(ctx, camera, { x: 21.2, y: 32.6 }, 72, 34, "rgba(55, 55, 47, 0.34)", "rgba(197, 176, 125, 0.18)");
  drawDistrictPad(ctx, camera, { x: 32.2, y: 39.6 }, 96, 34, "rgba(55, 55, 47, 0.36)", "rgba(197, 176, 125, 0.2)");
  drawDistrictPad(ctx, camera, { x: 42.5, y: 31.7 }, 78, 34, "rgba(55, 55, 47, 0.4)", "rgba(197, 176, 125, 0.22)");

  drawSeawallRun(ctx, camera, [
    { x: 24.4, y: 24.3 },
    { x: 30.2, y: 21.4 },
    { x: 37.8, y: 22.5 },
    { x: 42.3, y: 27.1 },
  ]);
  drawSeawallRun(ctx, camera, [
    { x: 43.5, y: 30.4 },
    { x: 42.2, y: 35.0 },
    { x: 36.8, y: 40.3 },
    { x: 31.0, y: 41.7 },
  ]);
  drawSeawallRun(ctx, camera, [
    { x: 28.0, y: 40.8 },
    { x: 22.5, y: 37.0 },
    { x: 19.0, y: 32.4 },
    { x: 20.0, y: 27.6 },
  ]);
  ctx.restore();
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
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Foam trail just below the wall base
  ctx.strokeStyle = "rgba(218, 238, 231, 0.32)";
  ctx.lineWidth = Math.max(3, 6 * camera.zoom);
  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y + 8 * camera.zoom);
  for (const point of rest) ctx.lineTo(point.x, point.y + 8 * camera.zoom);
  ctx.stroke();

  // Dark wall shadow
  ctx.strokeStyle = "rgba(4, 8, 10, 0.46)";
  ctx.lineWidth = Math.max(4, 8 * camera.zoom);
  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y + 5 * camera.zoom);
  for (const point of rest) ctx.lineTo(point.x, point.y + 5 * camera.zoom);
  ctx.stroke();

  // Limestone wall body
  ctx.strokeStyle = "rgba(212, 195, 152, 0.86)";
  ctx.lineWidth = Math.max(3, 5.4 * camera.zoom);
  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y);
  for (const point of rest) ctx.lineTo(point.x, point.y);
  ctx.stroke();

  // Terracotta tile cap on the wall
  ctx.strokeStyle = "rgba(185, 86, 55, 0.6)";
  ctx.lineWidth = Math.max(1, 1.6 * camera.zoom);
  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y - 2.6 * camera.zoom);
  for (const point of rest) ctx.lineTo(point.x, point.y - 2.6 * camera.zoom);
  ctx.stroke();

  // Crisp highlight stroke
  ctx.strokeStyle = "rgba(248, 232, 188, 0.42)";
  ctx.lineWidth = Math.max(1, 1.2 * camera.zoom);
  ctx.beginPath();
  ctx.moveTo(firstPoint.x - 3 * camera.zoom, firstPoint.y - 1.6 * camera.zoom);
  for (const point of rest) ctx.lineTo(point.x - 3 * camera.zoom, point.y - 1.6 * camera.zoom);
  ctx.stroke();

  // Stone-block diamonds at every densified point + bronze rings every third
  for (const [index, point] of points.entries()) {
    drawDiamond(
      ctx,
      point.x,
      point.y - 1.2 * camera.zoom,
      8 * camera.zoom,
      3.4 * camera.zoom,
      "rgba(232, 211, 158, 0.55)",
    );
    if (index % 3 === 1) {
      ctx.fillStyle = "rgba(178, 122, 64, 0.78)";
      ctx.beginPath();
      ctx.arc(point.x, point.y - 0.4 * camera.zoom, 1.4 * camera.zoom, 0, Math.PI * 2);
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

