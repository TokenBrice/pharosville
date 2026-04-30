import { tileToScreen } from "../../systems/projection";
import type { DrawPharosVilleInput } from "../render-types";
import { lighthouseRenderState } from "./lighthouse";
import { skyState } from "./sky";

const VILLAGE_LIGHTS = [
  { x: 16.7, y: 29.4, size: 0.52 },
  { x: 18.4, y: 27.9, size: 0.58 },
  { x: 19.8, y: 29.0, size: 0.48 },
  { x: 20.8, y: 30.8, size: 0.44 },
  { x: 24.6, y: 23.4, size: 0.42 },
  { x: 28.8, y: 22.3, size: 0.46 },
  { x: 30.1, y: 31.8, size: 0.54 },
  { x: 33.2, y: 30.1, size: 0.5 },
  { x: 35.4, y: 42.5, size: 0.48 },
  { x: 37.2, y: 29.5, size: 0.52 },
  { x: 41.1, y: 28.9, size: 0.5 },
  { x: 44.2, y: 33.7, size: 0.52 },
] as const;

const BIRDS = [
  { anchorX: -4.2, anchorY: -3.2, radiusX: 3.8, radiusY: 1.4, scale: 1.14, speed: 0.24, phase: 0.1 },
  { anchorX: -1.4, anchorY: -5.2, radiusX: 4.4, radiusY: 1.7, scale: 0.98, speed: 0.2, phase: 1.9 },
  { anchorX: 2.8, anchorY: -4.3, radiusX: 3.2, radiusY: 1.2, scale: 0.9, speed: 0.23, phase: 3.4 },
  { anchorX: -18.5, anchorY: -10.8, radiusX: 8.5, radiusY: 2.2, scale: 0.76, speed: 0.13, phase: 0.6 },
  { anchorX: -29.5, anchorY: 4.4, radiusX: 7.4, radiusY: 1.8, scale: 0.68, speed: 0.15, phase: 2.8 },
  { anchorX: 10.5, anchorY: -15.5, radiusX: 8.8, radiusY: 2.6, scale: 0.72, speed: 0.12, phase: 4.2 },
  { anchorX: 18.2, anchorY: 2.2, radiusX: 6.2, radiusY: 1.6, scale: 0.62, speed: 0.18, phase: 5.3 },
  { anchorX: 7.2, anchorY: -7.6, radiusX: 5.2, radiusY: 1.5, scale: 0.84, speed: 0.19, phase: 2.2 },
  { anchorX: -9.8, anchorY: -8.2, radiusX: 5.8, radiusY: 1.7, scale: 0.82, speed: 0.17, phase: 4.9 },
] as const;

export function drawAtmosphere(input: DrawPharosVilleInput) {
  const { camera, ctx, motion } = input;
  const mood = skyState(motion).mood;
  const { firePoint } = lighthouseRenderState(input);
  ctx.save();
  ctx.fillStyle = mood.mist;
  ctx.beginPath();
  ctx.ellipse(firePoint.x - 18 * camera.zoom, firePoint.y + 30 * camera.zoom, 190 * camera.zoom, 48 * camera.zoom, -0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawBirds({ camera, ctx, motion, world }: DrawPharosVilleInput) {
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const origin = world.lighthouse.tile;
  ctx.save();
  for (const bird of BIRDS) {
    const angle = time * bird.speed + bird.phase;
    const tile = {
      x: origin.x + bird.anchorX + Math.cos(angle) * bird.radiusX,
      y: origin.y + bird.anchorY + Math.sin(angle) * bird.radiusY,
    };
    const p = tileToScreen(tile, camera);
    const wing = motion.reducedMotion ? 0.34 : 0.34 + Math.sin(time * 5.2 + bird.phase) * 0.18;
    drawBird(ctx, p.x, p.y - 46 * camera.zoom * bird.scale, camera.zoom * bird.scale, wing, Math.cos(angle));
  }
  ctx.restore();
}

function drawBird(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, wing: number, bank: number) {
  const direction = bank >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(direction, 1);
  ctx.strokeStyle = "rgba(241, 235, 207, 0.86)";
  ctx.lineWidth = Math.max(1, 1.8 * zoom);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-12 * zoom, 0);
  ctx.quadraticCurveTo(-6 * zoom, -13 * zoom * wing, -1 * zoom, 0);
  ctx.quadraticCurveTo(6 * zoom, -13 * zoom * wing, 13 * zoom, -1 * zoom);
  ctx.stroke();

  ctx.fillStyle = "rgba(24, 30, 31, 0.74)";
  ctx.beginPath();
  ctx.ellipse(1 * zoom, 1 * zoom, 3.2 * zoom, 1.6 * zoom, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(27, 35, 37, 0.38)";
  ctx.lineWidth = Math.max(1, 1.1 * zoom);
  ctx.beginPath();
  ctx.moveTo(-5 * zoom, 1 * zoom);
  ctx.lineTo(6 * zoom, 1 * zoom);
  ctx.stroke();
  ctx.restore();
}

export function drawDecorativeLights({ camera, ctx, motion }: DrawPharosVilleInput) {
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  for (const light of VILLAGE_LIGHTS) {
    const p = tileToScreen(light, camera);
    drawLamp(ctx, p.x, p.y, camera.zoom * light.size, time + light.x * 0.31 + light.y * 0.17);
  }
}

export function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, phase: number) {
  const glow = 0.22 + Math.sin(phase * 1.6) * 0.04;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const halo = ctx.createRadialGradient(x, y - 9 * zoom, 1 * zoom, x, y - 9 * zoom, 22 * zoom);
  halo.addColorStop(0, `rgba(247, 214, 138, ${glow * 0.9})`);
  halo.addColorStop(0.46, `rgba(212, 154, 62, ${glow * 0.28})`);
  halo.addColorStop(1, "rgba(212, 154, 62, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(x, y - 8 * zoom, 22 * zoom, 12 * zoom, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(255, 197, 95, ${glow})`;
  ctx.beginPath();
  ctx.ellipse(x, y - 7 * zoom, 12 * zoom, 7 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3f2d1f";
  ctx.fillRect(Math.round(x - zoom), Math.round(y - 12 * zoom), Math.max(1, Math.round(2 * zoom)), Math.max(4, Math.round(12 * zoom)));
  ctx.fillStyle = "#f5c766";
  ctx.fillRect(Math.round(x - 2 * zoom), Math.round(y - 14 * zoom), Math.max(2, Math.round(4 * zoom)), Math.max(2, Math.round(3 * zoom)));
  ctx.strokeStyle = `rgba(247, 214, 138, ${glow * 0.58})`;
  ctx.lineWidth = Math.max(1, 0.85 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 8 * zoom, y + 2 * zoom);
  ctx.lineTo(x + 9 * zoom, y + 4 * zoom);
  ctx.stroke();
  ctx.restore();
}
