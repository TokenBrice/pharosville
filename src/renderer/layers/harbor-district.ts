import { ambientSeaPhase } from "../../systems/motion-types";
import { SEAWALL_RENDER_PLACEMENTS } from "../../systems/seawall";
import { ETHEREUM_L2_DOCK_CHAIN_IDS } from "../../systems/world-layout";
import type { PharosVilleWorld } from "../../systems/world-types";
import { tileToScreen, type IsoCamera, type ScreenPoint } from "../../systems/projection";
import { drawAsset, drawDiamond } from "../canvas-primitives";
import { dockDrawPoint } from "../geometry";
import type { DrawPharosVilleInput, PharosVilleCanvasMotion } from "../render-types";

export function drawHarborDistrictGround(input: DrawPharosVilleInput) {
  const { camera, ctx } = input;
  ctx.save();
  drawDistrictPad(ctx, camera, { x: 31.0, y: 23.3 }, 88, 30, "rgba(55, 55, 47, 0.3)", "rgba(197, 176, 125, 0.16)");
  drawDistrictPad(ctx, camera, { x: 21.2, y: 32.6 }, 72, 34, "rgba(55, 55, 47, 0.34)", "rgba(197, 176, 125, 0.18)");
  drawDistrictPad(ctx, camera, { x: 32.2, y: 39.6 }, 96, 34, "rgba(55, 55, 47, 0.36)", "rgba(197, 176, 125, 0.2)");
  drawDistrictPad(ctx, camera, { x: 42.5, y: 31.7 }, 78, 34, "rgba(55, 55, 47, 0.4)", "rgba(197, 176, 125, 0.22)");

  drawGeneratedSeawallAssets(input);
  ctx.restore();
}

function drawGeneratedSeawallAssets(input: DrawPharosVilleInput) {
  const { assets, camera, ctx } = input;
  if (!assets) return;
  for (const placement of SEAWALL_RENDER_PLACEMENTS) {
    const asset = assets.get(placement.assetId);
    if (!asset) continue;
    const p = tileToScreen(placement.tile, camera);
    const y = p.y + placement.yOffset * camera.zoom;
    const scale = camera.zoom * placement.scale;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, 0.94 + placement.alphaJitter));
    ctx.translate(p.x, y);
    if (placement.rotation) ctx.rotate((placement.rotation * Math.PI) / 180);
    if (placement.flipX) ctx.scale(-1, 1);
    drawAsset(ctx, asset, 0, 0, scale);
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
