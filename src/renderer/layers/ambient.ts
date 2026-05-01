import { tileToScreen } from "../../systems/projection";
import type { DrawPharosVilleInput } from "../render-types";
import { lighthouseRenderState, type LighthouseRenderState } from "./lighthouse";
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

type BioluminescentSparkle = {
  isoX: number;
  isoY: number;
  phase: number;
  baseRadius: number;
};

const SPARKLE_POINT_DEFS = [
  { x: 8.3, y: 28.4, phase: 0.0 },
  { x: 9.7, y: 31.2, phase: 0.72 },
  { x: 10.4, y: 33.8, phase: 1.44 },
  { x: 11.1, y: 30.1, phase: 2.16 },
  { x: 12.6, y: 35.4, phase: 2.88 },
  { x: 13.2, y: 27.9, phase: 3.60 },
  { x: 8.8, y: 24.6, phase: 4.32 },
  { x: 11.9, y: 26.3, phase: 5.04 },
  { x: 9.2, y: 29.7, phase: 5.76 },
  { x: 13.8, y: 32.9, phase: 0.38 },
  { x: 15.3, y: 36.8, phase: 1.10 },
  { x: 17.2, y: 39.4, phase: 1.82 },
  { x: 18.8, y: 41.7, phase: 2.54 },
  { x: 20.4, y: 43.2, phase: 3.26 },
  { x: 22.1, y: 44.8, phase: 3.98 },
  { x: 24.3, y: 45.9, phase: 4.70 },
  { x: 26.7, y: 46.5, phase: 5.42 },
  { x: 28.9, y: 47.1, phase: 0.19 },
  { x: 31.2, y: 47.4, phase: 0.91 },
  { x: 33.5, y: 46.8, phase: 1.63 },
  { x: 35.8, y: 45.6, phase: 2.35 },
  { x: 37.4, y: 44.1, phase: 3.07 },
  { x: 16.1, y: 38.2, phase: 3.79 },
  { x: 19.6, y: 40.8, phase: 4.51 },
  { x: 23.4, y: 43.0, phase: 5.23 },
  { x: 29.7, y: 45.3, phase: 0.57 },
  { x: 14.8, y: 35.1, phase: 1.29 },
  { x: 21.8, y: 42.4, phase: 2.01 },
  { x: 27.3, y: 46.0, phase: 2.73 },
  { x: 32.4, y: 47.2, phase: 3.45 },
  { x: 39.1, y: 34.2, phase: 4.17 },
  { x: 40.8, y: 31.7, phase: 4.89 },
  { x: 42.3, y: 29.4, phase: 5.61 },
  { x: 44.1, y: 27.2, phase: 0.45 },
  { x: 45.9, y: 25.1, phase: 1.17 },
  { x: 47.6, y: 23.3, phase: 1.89 },
  { x: 49.2, y: 26.8, phase: 2.61 },
  { x: 50.7, y: 28.9, phase: 3.33 },
  { x: 51.4, y: 31.5, phase: 4.05 },
  { x: 52.1, y: 33.8, phase: 4.77 },
  { x: 43.5, y: 32.6, phase: 5.49 },
  { x: 46.4, y: 30.1, phase: 0.83 },
  { x: 48.8, y: 24.7, phase: 1.55 },
  { x: 38.3, y: 36.1, phase: 2.27 },
  { x: 41.7, y: 22.4, phase: 2.99 },
  { x: 4.2, y: 29.3, phase: 3.71 },
  { x: 5.1, y: 31.8, phase: 4.43 },
  { x: 6.4, y: 28.7, phase: 5.15 },
  { x: 7.3, y: 30.9, phase: 5.87 },
  { x: 5.8, y: 33.4, phase: 0.63 },
  { x: 53.2, y: 29.7, phase: 1.35 },
  { x: 54.1, y: 32.4, phase: 2.07 },
  { x: 55.3, y: 35.1, phase: 2.79 },
  { x: 54.8, y: 37.6, phase: 3.51 },
  { x: 52.7, y: 36.2, phase: 4.23 },
] as const;

const SPARKLE_POINTS = SPARKLE_POINT_DEFS.map((p) => ({
  isoX: (p.x - p.y) * 16,
  isoY: (p.x + p.y) * 8,
  phase: p.phase,
  baseRadius: 0.9 + Math.sin(p.phase * 2.1) * 0.4,
})) as readonly BioluminescentSparkle[];

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

const SEA_MIST_PATCHES = [
  { x: 22.5, y: 16.2, rx: 5.8, ry: 1.8, phase: 0.3, speed: 0.018 },
  { x: 28.1, y: 18.5, rx: 7.2, ry: 2.1, phase: 1.7, speed: 0.014 },
  { x: 33.6, y: 15.8, rx: 6.1, ry: 1.9, phase: 3.1, speed: 0.021 },
  { x: 44.2, y: 24.3, rx: 6.8, ry: 2.0, phase: 0.9, speed: 0.016 },
  { x: 50.1, y: 29.8, rx: 8.0, ry: 2.4, phase: 2.4, speed: 0.013 },
  { x: 47.5, y: 33.1, rx: 5.5, ry: 1.7, phase: 4.2, speed: 0.019 },
  { x: 6.8,  y: 26.4, rx: 6.3, ry: 1.9, phase: 1.2, speed: 0.017 },
  { x: 10.2, y: 30.2, rx: 7.5, ry: 2.2, phase: 5.1, speed: 0.015 },
  { x: 20.4, y: 54.3, rx: 7.8, ry: 2.3, phase: 2.8, speed: 0.012 },
  { x: 36.7, y: 57.1, rx: 6.6, ry: 2.0, phase: 0.6, speed: 0.020 },
] as const;

export function drawAtmosphere(input: DrawPharosVilleInput, lighthouse?: LighthouseRenderState) {
  const { camera, ctx, motion } = input;
  const sky = skyState(motion);
  // The new warm pool replaces this cool mist at night; drawing it would
  // visibly desaturate the pool centre.
  if (sky.nightFactor > 0.4) return;
  const { firePoint } = lighthouse ?? lighthouseRenderState(input);
  ctx.save();
  ctx.fillStyle = sky.mood.mist;
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

export function drawBioluminescentSparkles(
  input: DrawPharosVilleInput,
  nightFactor: number,
  lighthouse?: LighthouseRenderState,
): void {
  if (nightFactor <= 0) return;
  const { camera, ctx, motion, width, height } = input;
  const { firePoint } = lighthouse ?? lighthouseRenderState(input);
  // Suppress sparkles inside the warm pool — cyan + warm amber stack to white
  // and wash both effects out. Match the lighthouse pool radius.
  const haloRadius = 900 * camera.zoom;
  const haloRadiusSq = haloRadius * haloRadius;
  const invHaloRadius = 1 / haloRadius;
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const zoom = camera.zoom;
  const offsetX = camera.offsetX;
  const offsetY = camera.offsetY;
  const cullPadding = 24 * zoom;
  const minX = -cullPadding;
  const maxX = width + cullPadding;
  const minY = -cullPadding;
  const maxY = height + cullPadding;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const sp of SPARKLE_POINTS) {
    const px = sp.isoX * zoom + offsetX;
    const py = sp.isoY * zoom + offsetY;
    if (px < minX || px > maxX || py < minY || py > maxY) continue;

    const dx = px - firePoint.x;
    const dy = py - firePoint.y;
    const distSq = dx * dx + dy * dy;
    const haloSuppress = distSq < haloRadiusSq ? Math.sqrt(distSq) * invHaloRadius : 1;
    const twinkle = 0.5 + 0.5 * Math.sin(time * 1.4 + sp.phase);
    const alpha = twinkle * twinkle * nightFactor * 0.55 * haloSuppress;
    if (alpha < 0.01) continue;
    const r = Math.max(1, sp.baseRadius * zoom);
    ctx.fillStyle = `rgba(140, 230, 215, ${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
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

export function drawMoonReflection(input: DrawPharosVilleInput, nightFactor: number): void {
  if (nightFactor <= 0) return;
  const { ctx, width, height } = input;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const cx = width * 0.28;
  const cy = height * 0.38;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(width, height) * 0.42);
  grad.addColorStop(0, `rgba(170, 195, 225, ${0.10 * nightFactor})`);
  grad.addColorStop(0.35, `rgba(145, 175, 210, ${0.045 * nightFactor})`);
  grad.addColorStop(1, "rgba(130, 160, 200, 0)");
  ctx.fillStyle = grad;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.55);
  ctx.beginPath();
  ctx.ellipse(0, 0, Math.hypot(width, height) * 0.42, Math.hypot(width, height) * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

export function drawSeaMist(input: DrawPharosVilleInput, nightFactor: number): void {
  if (nightFactor <= 0) return;
  const { camera, ctx, motion } = input;
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  ctx.save();
  for (const patch of SEA_MIST_PATCHES) {
    const drift = Math.sin(time * patch.speed + patch.phase) * 0.4;
    const p = tileToScreen({ x: patch.x + drift, y: patch.y + drift * 0.3 }, camera);
    const alpha = (0.042 + Math.sin(time * patch.speed * 1.8 + patch.phase) * 0.012) * nightFactor;
    ctx.fillStyle = `rgba(165, 178, 195, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, patch.rx * camera.zoom * 12, patch.ry * camera.zoom * 12, -0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
