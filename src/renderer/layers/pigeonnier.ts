import { tileToScreen } from "../../systems/projection";
import { PIGEON_ISLAND_CENTER } from "../../systems/world-layout";
import { drawAsset } from "../canvas-primitives";
import type { DrawPharosVilleInput } from "../render-types";
import { skyState } from "./sky";

// The renderer reads the islet center directly from world-layout so a single
// constant edit moves both the tile-mask and the rendered tower.
export function drawPigeonnier(input: DrawPharosVilleInput): void {
  const asset = input.assets?.get("landmark.pigeonnier");
  if (!asset) return;
  const p = tileToScreen(PIGEON_ISLAND_CENTER, input.camera);
  const { nightFactor } = skyState(input.motion);
  drawPigeonnierNightHalo(input.ctx, p.x, p.y, input.camera.zoom, nightFactor, input.motion);
  drawAsset(input.ctx, asset, p.x, p.y, input.camera.zoom);
  drawPigeonnierBirdSilhouettes(input.ctx, p.x, p.y, input.camera.zoom, nightFactor);
}

function drawPigeonnierNightHalo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  nightFactor: number,
  motion: DrawPharosVilleInput["motion"],
) {
  if (nightFactor <= 0.04) return;
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const pulse = 0.84 + Math.sin(time * 0.78) * 0.08;
  const alpha = nightFactor * pulse;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const towerX = x;
  const towerY = y - 76 * zoom;
  const radius = 82 * zoom;
  const halo = ctx.createRadialGradient(towerX, towerY, 0, towerX, towerY, radius);
  halo.addColorStop(0, `rgba(248, 203, 118, ${0.28 * alpha})`);
  halo.addColorStop(0.38, `rgba(211, 138, 70, ${0.12 * alpha})`);
  halo.addColorStop(1, "rgba(211, 138, 70, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(towerX, towerY, 44 * zoom, 74 * zoom, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(250, 204, 118, ${0.09 * alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y - 3 * zoom, 42 * zoom, 13 * zoom, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPigeonnierBirdSilhouettes(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  nightFactor: number,
) {
  const alpha = 0.34 + nightFactor * 0.34;
  const birds = [
    { bank: 1, scale: 0.74, x: -26, y: -76 },
    { bank: -1, scale: 0.64, x: 21, y: -94 },
    { bank: 1, scale: 0.58, x: 6, y: -122 },
    { bank: -1, scale: 0.48, x: -12, y: -137 },
  ] as const;
  ctx.save();
  ctx.strokeStyle = `rgba(23, 18, 14, ${alpha})`;
  ctx.fillStyle = `rgba(23, 18, 14, ${alpha + 0.12})`;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const bird of birds) {
    drawPerchedBirdSilhouette(
      ctx,
      x + bird.x * zoom,
      y + bird.y * zoom,
      zoom * bird.scale,
      bird.bank,
    );
  }
  ctx.restore();
}

function drawPerchedBirdSilhouette(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  bank: 1 | -1,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(bank, 1);
  ctx.lineWidth = Math.max(1, 1.25 * scale);
  ctx.beginPath();
  ctx.moveTo(-5 * scale, 0);
  ctx.quadraticCurveTo(-2 * scale, -4.8 * scale, 0, -0.4 * scale);
  ctx.quadraticCurveTo(2.5 * scale, -4.8 * scale, 5.6 * scale, 0.4 * scale);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 1.1 * scale, 2.3 * scale, 1.5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-1.8 * scale, 2.2 * scale);
  ctx.lineTo(-3.2 * scale, 4.2 * scale);
  ctx.moveTo(1.6 * scale, 2.2 * scale);
  ctx.lineTo(2.7 * scale, 4.2 * scale);
  ctx.stroke();
  ctx.restore();
}
