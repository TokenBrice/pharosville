import { tileToScreen, type ScreenPoint } from "../../systems/projection";
import { isElevatedTileKind } from "../../systems/world-layout";
import type { PharosVilleWorld, TerrainKind } from "../../systems/world-types";
import { drawAsset, drawDiamond, drawTileLowerFacet } from "../canvas-primitives";
import type { DrawPharosVilleInput, PharosVilleCanvasMotion } from "../render-types";

const LIGHTHOUSE_ASSET_BOTTOM_OFFSET_Y = 18;
const LIGHTHOUSE_ASSET_SCALE = 1.04;

export function lighthouseRenderState({ assets, camera, world }: DrawPharosVilleInput) {
  const center = tileToScreen(world.lighthouse.tile, camera);
  const lighthouseAsset = assets?.get("landmark.lighthouse");
  const spriteScale = camera.zoom * LIGHTHOUSE_ASSET_SCALE;
  const spriteAnchor = {
    x: center.x,
    y: center.y + LIGHTHOUSE_ASSET_BOTTOM_OFFSET_Y * camera.zoom,
  };
  const firePoint = lighthouseAsset
    ? {
      x: spriteAnchor.x + (lighthouseAsset.entry.beacon?.[0] ?? lighthouseAsset.entry.anchor[0]) * lighthouseAsset.entry.displayScale * spriteScale
        - lighthouseAsset.entry.anchor[0] * lighthouseAsset.entry.displayScale * spriteScale,
      y: spriteAnchor.y + (lighthouseAsset.entry.beacon?.[1] ?? lighthouseAsset.entry.anchor[1]) * lighthouseAsset.entry.displayScale * spriteScale
        - lighthouseAsset.entry.anchor[1] * lighthouseAsset.entry.displayScale * spriteScale,
    }
    : { x: center.x, y: center.y - 148 * camera.zoom };
  return { center, firePoint, lighthouseAsset, spriteAnchor, spriteScale };
}

const LIGHTHOUSE_HEADLAND = {
  cliff: "#2b3943",
  cliffEdge: "rgba(20, 24, 22, 0.62)",
  foam: "rgba(180, 224, 208, 0.46)",
  grass: "#4f7e4d",
  grassTuft: "#3d6240",
  halo: "rgba(255, 200, 87, 0.14)",
  moss: "#667f4f",
  shadow: "rgba(10, 12, 12, 0.42)",
  stone: "#c8b88a",
  stoneShadow: "#7a6c4f",
} as const;

const LIGHTHOUSE_SURF = [
  { x: 15.2, y: 27.8, length: 18, phase: 5.1, tilt: 0.12 },
  { x: 15.9, y: 28.9, length: 22, phase: 0.1, tilt: -0.14 },
  { x: 16.8, y: 31.2, length: 28, phase: 1.7, tilt: 0.02 },
  { x: 18.1, y: 32.2, length: 25, phase: 4.8, tilt: 0.18 },
  { x: 19.8, y: 32.0, length: 31, phase: 2.6, tilt: 0.16 },
  { x: 21.4, y: 30.9, length: 24, phase: 3.4, tilt: -0.12 },
  { x: 20.7, y: 25.7, length: 20, phase: 4.1, tilt: 0.1 },
  { x: 22.0, y: 27.0, length: 18, phase: 5.7, tilt: -0.18 },
] as const;

export function drawLighthouseSurf({ camera, ctx, motion }: DrawPharosVilleInput) {
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  ctx.save();
  ctx.lineCap = "round";
  for (const surf of LIGHTHOUSE_SURF) {
    const p = tileToScreen(surf, camera);
    const wash = motion.reducedMotion ? 0.66 : 0.58 + Math.sin(time * 1.4 + surf.phase) * 0.12;
    ctx.strokeStyle = `rgba(232, 243, 233, ${wash})`;
    ctx.lineWidth = Math.max(1, 1.8 * camera.zoom);
    ctx.beginPath();
    ctx.moveTo(p.x - surf.length * camera.zoom * 0.5, p.y);
    ctx.quadraticCurveTo(
      p.x,
      p.y + surf.tilt * surf.length * camera.zoom,
      p.x + surf.length * camera.zoom * 0.5,
      p.y + 4 * camera.zoom,
    );
    ctx.stroke();

    ctx.strokeStyle = "rgba(130, 216, 204, 0.26)";
    ctx.lineWidth = Math.max(1, 0.9 * camera.zoom);
    ctx.beginPath();
    ctx.moveTo(p.x - surf.length * camera.zoom * 0.35, p.y + 5 * camera.zoom);
    ctx.lineTo(p.x + surf.length * camera.zoom * 0.32, p.y + 8 * camera.zoom);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawLighthouseHeadland({ camera, ctx, world }: DrawPharosVilleInput) {
  const center = tileToScreen(world.lighthouse.tile, camera);
  const terrain = lighthouseTerrain(world);
  const crownColor = isElevatedTileKind(terrain) ? LIGHTHOUSE_HEADLAND.moss : LIGHTHOUSE_HEADLAND.grass;
  const zoom = camera.zoom;
  ctx.save();

  ctx.fillStyle = LIGHTHOUSE_HEADLAND.halo;
  ctx.beginPath();
  ctx.ellipse(center.x - 2 * zoom, center.y + 12 * zoom, 95 * zoom, 32 * zoom, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = LIGHTHOUSE_HEADLAND.foam;
  ctx.beginPath();
  ctx.ellipse(center.x - 2 * zoom, center.y + 30 * zoom, 132 * zoom, 56 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();

  drawDiamond(ctx, center.x - 2 * zoom, center.y + 27 * zoom, 130 * zoom, 55 * zoom, LIGHTHOUSE_HEADLAND.shadow);
  drawDiamond(ctx, center.x - 2 * zoom, center.y + 14 * zoom, 110 * zoom, 46 * zoom, LIGHTHOUSE_HEADLAND.cliff);
  drawTileLowerFacet(ctx, center.x - 2 * zoom, center.y + 14 * zoom, 110 * zoom, 46 * zoom, LIGHTHOUSE_HEADLAND.cliffEdge);
  drawDiamond(ctx, center.x - 1 * zoom, center.y + 1 * zoom, 84 * zoom, 32 * zoom, crownColor);
  drawDiamond(ctx, center.x, center.y - 4 * zoom, 60 * zoom, 24 * zoom, LIGHTHOUSE_HEADLAND.stone);
  drawTileLowerFacet(ctx, center.x, center.y - 4 * zoom, 60 * zoom, 24 * zoom, LIGHTHOUSE_HEADLAND.stoneShadow);

  ctx.fillStyle = LIGHTHOUSE_HEADLAND.grassTuft;
  for (const tuft of [
    { dx: -16, dy: -1 }, { dx: 14, dy: -3 }, { dx: -28, dy: 6 },
    { dx: 28, dy: 6 }, { dx: -6, dy: 7 }, { dx: 8, dy: 9 },
  ]) {
    ctx.beginPath();
    ctx.ellipse(center.x + tuft.dx * zoom, center.y + tuft.dy * zoom, 2.2 * zoom, 1.3 * zoom, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function lighthouseTerrain(world: PharosVilleWorld): TerrainKind {
  const tile = world.map.tiles.find((candidate) => (
    candidate.x === world.lighthouse.tile.x && candidate.y === world.lighthouse.tile.y
  ));
  return tile?.terrain ?? tile?.kind ?? "hill";
}


export function lighthouseOverlayScreenBounds(
  input: DrawPharosVilleInput,
  selectionRect: { height: number; width: number; x: number; y: number },
): { height: number; width: number; x: number; y: number } {
  const { firePoint } = lighthouseRenderState(input);
  const beamZoom = input.camera.zoom * 1.35;
  const beamBounds = {
    height: 120 * beamZoom,
    width: 436 * beamZoom,
    x: firePoint.x - 176 * beamZoom,
    y: firePoint.y - 82 * beamZoom,
  };
  const minX = Math.min(selectionRect.x, beamBounds.x);
  const minY = Math.min(selectionRect.y, beamBounds.y);
  const maxX = Math.max(selectionRect.x + selectionRect.width, beamBounds.x + beamBounds.width);
  const maxY = Math.max(selectionRect.y + selectionRect.height, beamBounds.y + beamBounds.height);
  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY,
  };
}

export function drawLighthouseBody(input: DrawPharosVilleInput) {
  const { camera, ctx, world } = input;
  const { center, lighthouseAsset, spriteAnchor, spriteScale } = lighthouseRenderState(input);
  if (lighthouseAsset) {
    drawAsset(ctx, lighthouseAsset, spriteAnchor.x, spriteAnchor.y, spriteScale);
    return;
  }

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.fillStyle = "rgba(10, 12, 12, 0.42)";
  ctx.beginPath();
  ctx.ellipse(2, 3, 34, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d8d0ad";
  ctx.fillRect(-31, -23, 62, 21);
  ctx.fillStyle = "#a99973";
  ctx.fillRect(-24, -35, 48, 14);
  ctx.fillStyle = "#f4f0d2";
  ctx.beginPath();
  ctx.moveTo(-18, -34);
  ctx.lineTo(18, -34);
  ctx.lineTo(12, -134);
  ctx.lineTo(-12, -134);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(92, 82, 60, 0.28)";
  ctx.beginPath();
  ctx.moveTo(5, -34);
  ctx.lineTo(18, -34);
  ctx.lineTo(12, -134);
  ctx.lineTo(3, -134);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#b34b37";
  ctx.fillRect(-14, -109, 28, 11);
  ctx.fillRect(-15, -73, 30, 11);
  ctx.fillStyle = "#28313a";
  ctx.fillRect(-5, -50, 10, 18);
  ctx.fillStyle = "#c89a43";
  ctx.fillRect(-19, -148, 38, 15);
  ctx.fillStyle = "#392e26";
  ctx.fillRect(-24, -153, 48, 6);
  ctx.fillStyle = "#f4e9ad";
  ctx.fillRect(-13, -146, 26, 10);
  ctx.fillStyle = "#723927";
  ctx.beginPath();
  ctx.moveTo(-20, -153);
  ctx.lineTo(0, -172);
  ctx.lineTo(20, -153);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = world.lighthouse.color;
  ctx.beginPath();
  ctx.arc(0, -150, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawLighthouseOverlay(input: DrawPharosVilleInput) {
  const { camera, ctx, motion, world } = input;
  const { firePoint, lighthouseAsset } = lighthouseRenderState(input);
  if (!world.lighthouse.unavailable) drawLighthouseBeam(ctx, firePoint, camera.zoom * 1.35, motion);
  if (lighthouseAsset) return;
  drawLighthouseFire(ctx, firePoint, camera.zoom * 1.32, world.lighthouse.color, motion);
}

function drawLighthouseFire(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  psiColor: string,
  motion: PharosVilleCanvasMotion,
) {
  const flickerSpeed = motion.plan.lighthouseFireFlickerPerSecond;
  const flicker = motion.reducedMotion ? 0 : Math.sin(motion.timeSeconds * 14 * flickerSpeed) * 0.12
    + Math.sin(motion.timeSeconds * 21 * flickerSpeed) * 0.06;
  const scale = zoom * (1 + flicker);
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.scale(scale, scale);

  ctx.globalAlpha = 0.42;
  ctx.fillStyle = psiColor;
  ctx.beginPath();
  ctx.ellipse(0, 3, 24, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = psiColor;
  ctx.beginPath();
  ctx.arc(0, -6, 15, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  drawPixelFlame(ctx, [
    [-11, 2],
    [-7, -11],
    [-3, -6],
    [0, -25],
    [5, -8],
    [10, -14],
    [13, 2],
    [6, 10],
    [-5, 10],
  ], psiColor);
  drawPixelFlame(ctx, [
    [-6, 4],
    [-3, -8],
    [0, -18],
    [4, -7],
    [8, 4],
    [3, 9],
    [-3, 9],
  ], "#ffcc62");
  drawPixelFlame(ctx, [
    [-3, 5],
    [0, -8],
    [4, 5],
    [0, 8],
  ], "#fff2a8");

  ctx.fillStyle = "#4b2d1d";
  ctx.fillRect(-12, 8, 24, 5);
  ctx.fillStyle = "#9a5a2a";
  ctx.fillRect(-9, 6, 18, 3);
  ctx.restore();
}

function drawLighthouseBeam(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  motion: PharosVilleCanvasMotion,
) {
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const pulse = 0.11 + Math.sin(time * 0.7) * 0.025;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = "#f5d176";
  ctx.beginPath();
  ctx.moveTo(point.x + 4 * zoom, point.y - 2 * zoom);
  ctx.lineTo(point.x + 250 * zoom, point.y - 74 * zoom);
  ctx.lineTo(point.x + 228 * zoom, point.y + 28 * zoom);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = pulse * 0.72;
  ctx.fillStyle = "#fff1bb";
  ctx.beginPath();
  ctx.moveTo(point.x - 5 * zoom, point.y);
  ctx.lineTo(point.x - 168 * zoom, point.y - 42 * zoom);
  ctx.lineTo(point.x - 154 * zoom, point.y + 25 * zoom);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.24;
  ctx.fillStyle = "#ffe2a0";
  ctx.beginPath();
  ctx.ellipse(point.x, point.y - 2 * zoom, 58 * zoom, 24 * zoom, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPixelFlame(ctx: CanvasRenderingContext2D, points: Array<[number, number]>, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    const px = Math.round(x);
    const py = Math.round(y);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
}

