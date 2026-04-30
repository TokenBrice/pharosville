import type { DrawPharosVilleInput, PharosVilleCanvasMotion } from "../render-types";
import { lighthouseRenderState } from "./lighthouse";

const SKY_MOODS = {
  dawn: {
    horizon: "#d07d55",
    lower: "#0d2035",
    mist: "rgba(255, 211, 154, 0.22)",
    moonAlpha: 0.12,
    starAlpha: 0.16,
    sunAlpha: 0.54,
    top: "#223b57",
    waterVeil: "rgba(42, 97, 112, 0.16)",
  },
  day: {
    horizon: "#d9ad67",
    lower: "#123a53",
    mist: "rgba(255, 225, 164, 0.18)",
    moonAlpha: 0,
    starAlpha: 0,
    sunAlpha: 0.8,
    top: "#496f8b",
    waterVeil: "rgba(43, 128, 132, 0.14)",
  },
  dusk: {
    horizon: "#d36e56",
    lower: "#0b1222",
    mist: "rgba(246, 177, 126, 0.22)",
    moonAlpha: 0.34,
    starAlpha: 0.28,
    sunAlpha: 0.34,
    top: "#151a32",
    waterVeil: "rgba(16, 86, 99, 0.2)",
  },
  night: {
    horizon: "#183154",
    lower: "#050812",
    mist: "rgba(200, 219, 205, 0.12)",
    moonAlpha: 0.74,
    starAlpha: 0.58,
    sunAlpha: 0,
    top: "#100b12",
    waterVeil: "rgba(7, 9, 16, 0.22)",
  },
} as const;

const SKY_STARS = [
  { x: 0.11, y: 0.1, size: 1.1 },
  { x: 0.14, y: 0.31, size: 0.7 },
  { x: 0.18, y: 0.22, size: 0.8 },
  { x: 0.23, y: 0.07, size: 0.6 },
  { x: 0.31, y: 0.14, size: 1 },
  { x: 0.36, y: 0.28, size: 0.65 },
  { x: 0.44, y: 0.08, size: 0.7 },
  { x: 0.51, y: 0.24, size: 0.9 },
  { x: 0.58, y: 0.18, size: 1.2 },
  { x: 0.63, y: 0.06, size: 0.6 },
  { x: 0.69, y: 0.09, size: 0.8 },
  { x: 0.75, y: 0.25, size: 0.75 },
  { x: 0.83, y: 0.16, size: 1 },
  { x: 0.92, y: 0.26, size: 0.7 },
] as const;

const SKY_CONSTELLATIONS = [
  [0, 2],
  [2, 4],
  [4, 7],
  [8, 10],
  [10, 11],
  [11, 13],
] as const;

const SKY_CLOUDS = [
  { alpha: 0.22, rx: 170, ry: 18, x: 0.2, y: 0.36 },
  { alpha: 0.16, rx: 210, ry: 22, x: 0.62, y: 0.33 },
  { alpha: 0.14, rx: 140, ry: 16, x: 0.84, y: 0.43 },
] as const;

export function drawSky(input: DrawPharosVilleInput) {
  const { camera, ctx, height, motion, width } = input;
  const state = skyState(motion);
  const mood = state.mood;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, mood.top);
  gradient.addColorStop(0.52, mood.horizon);
  gradient.addColorStop(1, mood.lower);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  drawCelestialArc(ctx, width, height, camera.zoom, state);
  drawSun(ctx, width, height, camera.zoom, state);
  drawMoon(ctx, width, height, camera.zoom, state);
  drawStars(ctx, width, height, camera.zoom, state, motion);
  drawSkyClouds(ctx, width, height, camera.zoom, state, motion);

  ctx.globalAlpha = 0.72;
  const { firePoint } = lighthouseRenderState(input);
  const glow = ctx.createRadialGradient(
    firePoint.x,
    firePoint.y,
    14 * camera.zoom,
    firePoint.x,
    firePoint.y,
    260 * camera.zoom,
  );
  glow.addColorStop(0, "rgba(255, 213, 119, 0.32)");
  glow.addColorStop(0.34, mood.mist);
  glow.addColorStop(1, "rgba(255, 213, 119, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(firePoint.x, firePoint.y, 260 * camera.zoom, 115 * camera.zoom, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = mood.waterVeil;
  ctx.fillRect(0, Math.round(height * 0.52), width, Math.ceil(height * 0.48));
  ctx.restore();
}

export function skyState(motion: PharosVilleCanvasMotion) {
  const progress = motion.reducedMotion
    ? 0.58
    : ((motion.timeSeconds * 0.006) % 1 + 1) % 1;
  const mood = progress < 0.18
    ? SKY_MOODS.dawn
    : progress < 0.48
      ? SKY_MOODS.day
      : progress < 0.64
        ? SKY_MOODS.dusk
        : SKY_MOODS.night;
  return { mood, progress };
}

function skyPathPoint(width: number, height: number, progress: number, phaseOffset = 0) {
  const angle = (progress + phaseOffset) * Math.PI * 2;
  return {
    x: width * (0.5 + Math.cos(angle - Math.PI) * 0.38),
    y: height * (0.29 + Math.sin(angle - Math.PI) * 0.19),
  };
}

function drawCelestialArc(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom: number,
  state: ReturnType<typeof skyState>,
) {
  ctx.save();
  ctx.strokeStyle = `rgba(246, 225, 176, ${0.08 + state.mood.starAlpha * 0.08})`;
  ctx.lineWidth = Math.max(1, zoom);
  ctx.setLineDash([8 * zoom, 10 * zoom]);
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.32, width * 0.38, height * 0.17, -0.05, Math.PI * 1.02, Math.PI * 1.98);
  ctx.stroke();
  ctx.restore();
}

function drawSun(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom: number,
  state: ReturnType<typeof skyState>,
) {
  if (state.mood.sunAlpha <= 0) return;
  const point = skyPathPoint(width, height, state.progress);
  const radius = 18 * zoom;
  ctx.save();
  const glow = ctx.createRadialGradient(point.x, point.y, radius * 0.3, point.x, point.y, radius * 4.6);
  glow.addColorStop(0, `rgba(255, 220, 128, ${0.56 * state.mood.sunAlpha})`);
  glow.addColorStop(0.42, `rgba(255, 164, 90, ${0.2 * state.mood.sunAlpha})`);
  glow.addColorStop(1, "rgba(255, 164, 90, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius * 4.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = state.mood.sunAlpha;
  ctx.fillStyle = "#ffd36f";
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 244, 190, 0.58)";
  ctx.beginPath();
  ctx.arc(point.x - 5 * zoom, point.y - 6 * zoom, radius * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMoon(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom: number,
  state: ReturnType<typeof skyState>,
) {
  if (state.mood.moonAlpha <= 0) return;
  const point = skyPathPoint(width, height, state.progress, 0.5);
  const radius = 14 * zoom;
  ctx.save();
  const glow = ctx.createRadialGradient(point.x, point.y, radius * 0.5, point.x, point.y, radius * 4.2);
  glow.addColorStop(0, `rgba(220, 231, 220, ${0.32 * state.mood.moonAlpha})`);
  glow.addColorStop(1, "rgba(220, 231, 220, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius * 4.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = state.mood.moonAlpha;
  ctx.fillStyle = "#e5dcc0";
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(point.x + radius * 0.44, point.y - radius * 0.08, radius * 0.95, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(229, 220, 192, 0.26)";
  ctx.beginPath();
  ctx.arc(point.x - radius * 0.3, point.y - radius * 0.22, radius * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom: number,
  state: ReturnType<typeof skyState>,
  motion: PharosVilleCanvasMotion,
) {
  if (state.mood.starAlpha <= 0) return;
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  ctx.save();
  ctx.globalAlpha = state.mood.starAlpha;
  ctx.strokeStyle = "rgba(245, 231, 184, 0.22)";
  ctx.lineWidth = Math.max(1, zoom * 0.75);
  for (const [from, to] of SKY_CONSTELLATIONS) {
    const start = SKY_STARS[from];
    const end = SKY_STARS[to];
    if (!start || !end) continue;
    ctx.beginPath();
    ctx.moveTo(width * start.x, height * start.y);
    ctx.lineTo(width * end.x, height * end.y);
    ctx.stroke();
  }

  for (const [index, star] of SKY_STARS.entries()) {
    const twinkle = motion.reducedMotion ? 1 : 0.78 + Math.sin(time * 0.9 + index * 1.7) * 0.22;
    const size = Math.max(1, star.size * zoom * twinkle);
    const x = Math.round(width * star.x);
    const y = Math.round(height * star.y);
    ctx.fillStyle = index % 4 === 0 ? "#fff3c7" : "#e9f0d8";
    ctx.fillRect(x, y, size, size);
    if (star.size > 0.95) {
      ctx.fillRect(x - Math.round(size), y, size, Math.max(1, size * 0.45));
      ctx.fillRect(x, y - Math.round(size), Math.max(1, size * 0.45), size);
    }
  }
  ctx.restore();
}

function drawSkyClouds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom: number,
  state: ReturnType<typeof skyState>,
  motion: PharosVilleCanvasMotion,
) {
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  ctx.save();
  for (const cloud of SKY_CLOUDS) {
    const drift = Math.sin(time * 0.035 + cloud.x * 8) * 22 * zoom;
    ctx.strokeStyle = state.mood.mist.replace(/[\d.]+\)$/, `${cloud.alpha})`);
    ctx.lineWidth = Math.max(1, 5 * zoom);
    ctx.beginPath();
    ctx.ellipse(width * cloud.x + drift, height * cloud.y, cloud.rx * zoom, cloud.ry * zoom, -0.08, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
