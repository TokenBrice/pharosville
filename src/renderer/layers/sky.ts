import { ambientWindPhase } from "../../systems/motion-types";
import type { PharosVilleWorld } from "../../systems/world-types";
import type { DrawPharosVilleInput, PharosVilleCanvasMotion } from "../render-types";
import { lighthouseRenderState, type LighthouseRenderState } from "./lighthouse";
import {
  cloudScalarsForThreat,
  maxActiveThreatLevel,
  windMultiplier,
  type CloudThreatScalars,
  type ThreatLevel,
} from "./weather";

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

type SkyMoodKey = keyof typeof SKY_MOODS;

const SKY_MOOD_KEYS: readonly SkyMoodKey[] = ["dawn", "day", "dusk", "night"];

function moodKeyFor(mood: typeof SKY_MOODS[SkyMoodKey]): SkyMoodKey {
  for (const key of SKY_MOOD_KEYS) {
    if (SKY_MOODS[key] === mood) return key;
  }
  return "day";
}

// Pre-baked cloud stroke colors per (mood × threat × cloud index). At threat
// 0 the matrix matches the legacy table exactly (so default-zone scenes are
// byte-identical). Higher threat scales the per-cloud alpha by
// `cloudScalarsForThreat(...).alphaScale` and keeps the original per-mood
// mist tint. The matrix is fully static — built once at module init — so the
// per-frame draw path only needs an O(1) array lookup.
const SKY_CLOUD_STROKES: Record<SkyMoodKey, readonly (readonly string[])[]> = (() => {
  const result: Record<SkyMoodKey, string[][]> = {
    dawn: [], day: [], dusk: [], night: [],
  };
  for (const moodKey of SKY_MOOD_KEYS) {
    const mist = SKY_MOODS[moodKey].mist;
    for (let threat = 0 as ThreatLevel; threat <= 4; threat = (threat + 1) as ThreatLevel) {
      const { alphaScale } = cloudScalarsForThreat(threat);
      const row: string[] = [];
      for (const cloud of SKY_CLOUDS) {
        const alpha = Math.min(0.95, cloud.alpha * alphaScale);
        row.push(mist.replace(/[\d.]+\)$/, `${alpha.toFixed(3)})`));
      }
      result[moodKey].push(row);
    }
  }
  return result;
})();

interface SkyBackdropCacheEntry {
  canvas: HTMLCanvasElement;
  key: string;
}

let skyBackdropCache: SkyBackdropCacheEntry | null = null;

// LRU caches for the sun and moon glow radial gradients. Both are pure
// functions of `(width, height, zoom-bucket, mood, quantized-phase)` — the
// celestial-arc coordinates derive from `progress` quantized to wall-clock
// minute granularity. Mirrors `nightGradientCache` in lighthouse.ts.
const SKY_GLOW_GRADIENT_CACHE_LIMIT = 12;
const SKY_PROGRESS_QUANTIZATION = 24 * 60;
const sunGlowGradientCache = new Map<string, CanvasGradient>();
const moonGlowGradientCache = new Map<string, CanvasGradient>();

function quantizeSkyProgress(progress: number): number {
  return Math.round(progress * SKY_PROGRESS_QUANTIZATION);
}

function rememberGradient(cache: Map<string, CanvasGradient>, key: string, gradient: CanvasGradient): CanvasGradient {
  cache.set(key, gradient);
  while (cache.size > SKY_GLOW_GRADIENT_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return gradient;
}

function createSkyBackdropCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function paintSkyBackdrop(
  target: CanvasRenderingContext2D,
  width: number,
  height: number,
  mood: typeof SKY_MOODS[SkyMoodKey],
  firePointX: number,
  firePointY: number,
  zoom: number,
  nightFactor: number,
) {
  const gradient = target.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, mood.top);
  gradient.addColorStop(0.52, mood.horizon);
  gradient.addColorStop(1, mood.lower);
  target.fillStyle = gradient;
  target.fillRect(0, 0, width, height);

  target.save();
  // Reduce sky-glow alpha at night so the new ground-level warm aura doesn't
  // stack with a sky halo to read as "two halos."
  target.globalAlpha = 0.72 * (1 - 0.4 * nightFactor);
  const glow = target.createRadialGradient(
    firePointX,
    firePointY,
    14 * zoom,
    firePointX,
    firePointY,
    260 * zoom,
  );
  glow.addColorStop(0, "rgba(255, 213, 119, 0.32)");
  glow.addColorStop(0.34, mood.mist);
  glow.addColorStop(1, "rgba(255, 213, 119, 0)");
  target.fillStyle = glow;
  target.beginPath();
  target.ellipse(firePointX, firePointY, 260 * zoom, 115 * zoom, -0.08, 0, Math.PI * 2);
  target.fill();

  target.globalAlpha = 1;
  target.fillStyle = mood.waterVeil;
  target.fillRect(0, Math.round(height * 0.52), width, Math.ceil(height * 0.48));
  target.restore();
}

function getSkyBackdropCanvas(
  width: number,
  height: number,
  mood: typeof SKY_MOODS[SkyMoodKey],
  firePointX: number,
  firePointY: number,
  zoom: number,
  nightFactor: number,
): HTMLCanvasElement | null {
  const key = `${width}x${height}|${moodKeyFor(mood)}|${firePointX},${firePointY}|z${(zoom * 100) | 0}|n${(nightFactor * 20) | 0}`;
  if (skyBackdropCache && skyBackdropCache.key === key) {
    return skyBackdropCache.canvas;
  }
  const canvas = skyBackdropCache?.canvas ?? createSkyBackdropCanvas(width, height);
  if (!canvas) return null;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const offCtx = canvas.getContext("2d");
  if (!offCtx) return null;
  offCtx.clearRect(0, 0, width, height);
  paintSkyBackdrop(offCtx, width, height, mood, firePointX, firePointY, zoom, nightFactor);
  skyBackdropCache = { canvas, key };
  return canvas;
}

export function drawSky(input: DrawPharosVilleInput, lighthouse?: LighthouseRenderState): void {
  const { camera, ctx, height, motion, width, world } = input;
  const state = skyState(motion);
  const mood = state.mood;
  const { firePoint } = lighthouse ?? lighthouseRenderState(input);
  const firePointX = firePoint.x | 0;
  const firePointY = firePoint.y | 0;
  const threat = maxActiveThreatLevel(world);
  const wind = windMultiplier(threat);

  const cached = getSkyBackdropCanvas(width, height, mood, firePointX, firePointY, camera.zoom, state.nightFactor);
  if (cached) {
    ctx.drawImage(cached, 0, 0);
  } else {
    paintSkyBackdrop(ctx, width, height, mood, firePoint.x, firePoint.y, camera.zoom, state.nightFactor);
  }

  ctx.save();
  drawCelestialArc(ctx, width, height, camera.zoom, state);
  drawSun(ctx, width, height, camera.zoom, state);
  drawMoon(ctx, width, height, camera.zoom, state);
  drawStars(ctx, width, height, camera.zoom, state, motion, wind);
  drawHorizonShips(ctx, width, height, camera.zoom, state, motion);
  drawSkyClouds(ctx, width, height, camera.zoom, state, motion, threat, wind);
  ctx.restore();
}

export function skyState(motion: PharosVilleCanvasMotion) {
  const hour = ((motion.wallClockHour % 24) + 24) % 24;
  const mood = hour < 5
    ? SKY_MOODS.night
    : hour < 7
      ? SKY_MOODS.dawn
      : hour < 18
        ? SKY_MOODS.day
        : hour < 20
          ? SKY_MOODS.dusk
          : SKY_MOODS.night;
  const progress = (((hour - 6) / 24) % 1 + 1) % 1;
  const nightFactor = computeNightFactor(hour);
  return { mood, progress, nightFactor };
}

function computeNightFactor(hour: number): number {
  if (hour < 5) return 1;
  if (hour < 7) return 1 - (hour - 5) / 2;
  if (hour < 18) return 0;
  if (hour < 20) return (hour - 18) / 2;
  return 1;
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
  const zoomBucket = (zoom * 100) | 0;
  const phaseBucket = quantizeSkyProgress(state.progress);
  const sunKey = `${width|0}x${height|0}|${moodKeyFor(state.mood)}|z${zoomBucket}|p${phaseBucket}`;
  let glow = sunGlowGradientCache.get(sunKey);
  if (!glow) {
    glow = ctx.createRadialGradient(point.x, point.y, radius * 0.3, point.x, point.y, radius * 4.6);
    glow.addColorStop(0, `rgba(255, 220, 128, ${0.56 * state.mood.sunAlpha})`);
    glow.addColorStop(0.42, `rgba(255, 164, 90, ${0.2 * state.mood.sunAlpha})`);
    glow.addColorStop(1, "rgba(255, 164, 90, 0)");
    rememberGradient(sunGlowGradientCache, sunKey, glow);
  }
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
  const zoomBucket = (zoom * 100) | 0;
  const phaseBucket = quantizeSkyProgress(state.progress);
  const moonKey = `${width|0}x${height|0}|${moodKeyFor(state.mood)}|z${zoomBucket}|p${phaseBucket}`;
  let glow = moonGlowGradientCache.get(moonKey);
  if (!glow) {
    glow = ctx.createRadialGradient(point.x, point.y, radius * 0.5, point.x, point.y, radius * 4.2);
    glow.addColorStop(0, `rgba(220, 231, 220, ${0.32 * state.mood.moonAlpha})`);
    glow.addColorStop(1, "rgba(220, 231, 220, 0)");
    rememberGradient(moonGlowGradientCache, moonKey, glow);
  }
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
  windScale: number,
) {
  if (state.mood.starAlpha <= 0) return;
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  // Parallax: slow horizontal drift (depth-modulated) wrapped over the
  // viewport width so stars never leave the sky band. Wind multiplier scales
  // the drift speed based on the active DEWS threat across visible zones —
  // higher threat → ambient air moves faster.
  const driftBase = motion.reducedMotion ? 0 : time * 1.6 * 0.3 * zoom * windScale;
  ctx.save();
  ctx.globalAlpha = state.mood.starAlpha;
  ctx.strokeStyle = "rgba(245, 231, 184, 0.22)";
  ctx.lineWidth = Math.max(1, zoom * 0.75);
  for (const [from, to] of SKY_CONSTELLATIONS) {
    const start = SKY_STARS[from];
    const end = SKY_STARS[to];
    if (!start || !end) continue;
    const fromDepth = 0.6 + ((from * 37) % 100) / 250;
    const sx = ((width * start.x + driftBase * fromDepth) % width + width) % width;
    const toDepth = 0.6 + ((to * 37) % 100) / 250;
    const ex = ((width * end.x + driftBase * toDepth) % width + width) % width;
    if (Math.abs(ex - sx) > width * 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(sx, height * start.y);
    ctx.lineTo(ex, height * end.y);
    ctx.stroke();
  }

  for (const [index, star] of SKY_STARS.entries()) {
    const twinkle = motion.reducedMotion ? 1 : 0.78 + Math.sin(time * 0.9 + index * 1.7) * 0.22;
    const size = Math.max(1, star.size * zoom * twinkle * (0.85 + zoom * 0.3));
    const depth = 0.6 + ((index * 37) % 100) / 250;
    const x = Math.round(((width * star.x + driftBase * depth) % width + width) % width);
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

function drawHorizonShips(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom: number,
  state: ReturnType<typeof skyState>,
  motion: PharosVilleCanvasMotion,
) {
  const count = 10;
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const orbit = (time / 300) * Math.PI * 2;
  const cx = width * 0.5;
  const cy = height * 0.52;
  const rx = width * 0.46;
  const ry = height * 0.06;
  const hullAlpha = 0.18 + state.nightFactor * 0.08;
  const sailAlpha = 0.26 + state.nightFactor * 0.1;
  ctx.save();
  for (let i = 0; i < count; i += 1) {
    const phase = (i / count) * Math.PI * 2 + orbit + (i * 0.37);
    const x = cx + Math.cos(phase) * rx;
    const y = cy + Math.sin(phase) * ry;
    if (y < height * 0.46 || y > height * 0.58) continue;
    const dir = Math.cos(phase) >= 0 ? 1 : -1;
    const s = Math.max(1, zoom * 0.9);
    ctx.fillStyle = `rgba(28, 38, 54, ${hullAlpha})`;
    ctx.fillRect(Math.round(x - 2 * s), Math.round(y), Math.round(4 * s), Math.max(1, s));
    ctx.fillStyle = `rgba(232, 222, 196, ${sailAlpha})`;
    ctx.beginPath();
    ctx.moveTo(Math.round(x), Math.round(y));
    ctx.lineTo(Math.round(x + dir * 2 * s), Math.round(y - 3 * s));
    ctx.lineTo(Math.round(x), Math.round(y - 3 * s));
    ctx.closePath();
    ctx.fill();
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
  threat: ThreatLevel,
  windScale: number,
) {
  ctx.save();
  const strokes = SKY_CLOUD_STROKES[moodKeyFor(state.mood)][threat]!;
  const scalars: CloudThreatScalars = cloudScalarsForThreat(threat);
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  // Reduced-motion: clouds render in their threat-modulated state but do not
  // animate over time. We zero the per-cloud drift terms so the ellipses sit
  // at their nominal X.
  const driftScale = motion.reducedMotion ? 0 : 1;
  for (let i = 0; i < SKY_CLOUDS.length; i += 1) {
    const cloud = SKY_CLOUDS[i]!;
    const drift = ambientWindPhase(motion, cloud.x * 8) * 22 * zoom * windScale * driftScale;
    const horizontalDrift = motion.reducedMotion ? 0 : Math.sin(time * 0.12 * windScale + i * 1.3) * 8 * zoom;
    ctx.strokeStyle = strokes[i]!;
    ctx.lineWidth = Math.max(1, 5 * zoom * scalars.thicknessScale);
    ctx.beginPath();
    ctx.ellipse(
      width * cloud.x + drift + horizontalDrift,
      height * (cloud.y + scalars.yBias),
      cloud.rx * zoom * scalars.thicknessScale,
      cloud.ry * zoom * scalars.thicknessScale,
      -0.08,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  ctx.restore();
}
