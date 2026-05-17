import { tileToScreen } from "../../systems/projection";
import { drawAsset } from "../canvas-primitives";
import type { DrawPharosVilleInput } from "../render-types";
import { skyState } from "./sky";

export const YGGDRASIL_TILE = { x: 42.5, y: 29.2 } as const;

export function drawYggdrasil(input: DrawPharosVilleInput): void {
  const asset = input.assets?.get("landmark.yggdrasil");
  if (!asset) return;
  const p = tileToScreen(YGGDRASIL_TILE, input.camera);
  drawAsset(input.ctx, asset, p.x, p.y, input.camera.zoom);
  drawYggdrasilCanopyLanterns(input.ctx, p.x, p.y, input.camera.zoom, skyState(input.motion).nightFactor, input.motion);
}

const CANOPY_LANTERNS = [
  { phase: 0.1, scale: 0.82, x: -35, y: -125 },
  { phase: 1.8, scale: 0.68, x: -16, y: -149 },
  { phase: 2.7, scale: 0.76, x: 12, y: -139 },
  { phase: 4.0, scale: 0.72, x: 35, y: -116 },
  { phase: 5.3, scale: 0.62, x: -25, y: -101 },
  { phase: 3.3, scale: 0.58, x: 6, y: -111 },
] as const;

function drawYggdrasilCanopyLanterns(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  nightFactor: number,
  motion: DrawPharosVilleInput["motion"],
) {
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  ctx.save();
  for (const lantern of CANOPY_LANTERNS) {
    const scale = zoom * lantern.scale;
    const sway = motion.reducedMotion ? 0 : Math.sin(time * 0.8 + lantern.phase) * 1.5 * scale;
    const lx = x + lantern.x * zoom + sway;
    const ly = y + lantern.y * zoom;
    drawCanopyLantern(ctx, lx, ly, scale, nightFactor, time + lantern.phase);
  }
  ctx.restore();
}

function drawCanopyLantern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  nightFactor: number,
  phase: number,
) {
  const glow = (0.18 + nightFactor * 0.72) * (0.9 + Math.sin(phase * 1.4) * 0.08);
  ctx.save();
  ctx.strokeStyle = "rgba(52, 37, 24, 0.72)";
  ctx.lineWidth = Math.max(1, 0.72 * scale);
  ctx.beginPath();
  ctx.moveTo(x, y - 9 * scale);
  ctx.quadraticCurveTo(x + 1.4 * scale, y - 4 * scale, x, y - 1 * scale);
  ctx.stroke();

  if (nightFactor > 0.04) {
    ctx.globalCompositeOperation = "lighter";
    const halo = ctx.createRadialGradient(x, y + 1 * scale, 0, x, y + 1 * scale, 17 * scale);
    halo.addColorStop(0, `rgba(255, 205, 111, ${0.42 * glow})`);
    halo.addColorStop(0.5, `rgba(226, 143, 69, ${0.16 * glow})`);
    halo.addColorStop(1, "rgba(226, 143, 69, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(x, y + 2 * scale, 15 * scale, 10 * scale, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.fillStyle = "#3f2d1f";
  ctx.fillRect(Math.round(x - 2.6 * scale), Math.round(y - 2 * scale), Math.max(2, Math.round(5.2 * scale)), Math.max(3, Math.round(7 * scale)));
  ctx.fillStyle = `rgba(250, 202, 105, ${0.58 + 0.38 * nightFactor})`;
  ctx.fillRect(Math.round(x - 1.6 * scale), Math.round(y - 1 * scale), Math.max(1, Math.round(3.2 * scale)), Math.max(2, Math.round(4.8 * scale)));
  ctx.fillStyle = "#8a6840";
  ctx.fillRect(Math.round(x - 3.4 * scale), Math.round(y - 3.5 * scale), Math.max(2, Math.round(6.8 * scale)), Math.max(1, Math.round(1.6 * scale)));
  ctx.restore();
}
