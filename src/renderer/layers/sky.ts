import { ambientWindPhase } from "../../systems/motion-types";
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
  predawn: {
    horizon: "#b76758",
    horizonBleedAlpha: 0.16,
    lower: "#0a1424",
    mist: "rgba(244, 184, 126, 0.18)",
    moonAlpha: 0.56,
    starAlpha: 0.44,
    sunAlpha: 0.1,
    top: "#151a31",
    waterVeil: "rgba(18, 55, 72, 0.2)",
  },
  dawn: {
    horizon: "#d07d55",
    horizonBleedAlpha: 0.28,
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
    horizonBleedAlpha: 0.24,
    lower: "#123a53",
    mist: "rgba(255, 225, 164, 0.18)",
    moonAlpha: 0,
    starAlpha: 0,
    sunAlpha: 0.8,
    top: "#496f8b",
    waterVeil: "rgba(43, 128, 132, 0.14)",
  },
  golden: {
    horizon: "#df9a55",
    horizonBleedAlpha: 0.34,
    lower: "#153349",
    mist: "rgba(255, 210, 146, 0.2)",
    moonAlpha: 0,
    starAlpha: 0,
    sunAlpha: 0.72,
    top: "#385f78",
    waterVeil: "rgba(56, 116, 118, 0.16)",
  },
  dusk: {
    horizon: "#d36e56",
    horizonBleedAlpha: 0.24,
    lower: "#0b1222",
    mist: "rgba(246, 177, 126, 0.22)",
    moonAlpha: 0.34,
    starAlpha: 0.28,
    sunAlpha: 0.34,
    top: "#151a32",
    waterVeil: "rgba(16, 86, 99, 0.2)",
  },
  night: {
    horizon: "#102f30",
    horizonBleedAlpha: 0.05,
    lower: "#03070d",
    mist: "rgba(96, 145, 132, 0.08)",
    moonAlpha: 0.42,
    starAlpha: 0.68,
    sunAlpha: 0,
    top: "#050308",
    waterVeil: "rgba(2, 7, 10, 0.3)",
  },
} as const;

const SKY_STARS = [
  [0.06, 0.09, 0.85],
  [0.1, 0.16, 0.5],
  [0.14, 0.28, 0.65],
  [0.18, 0.1, 0.75],
  [0.22, 0.21, 0.55],
  [0.27, 0.06, 0.95],
  [0.31, 0.15, 0.7],
  [0.35, 0.31, 0.5],
  [0.4, 0.1, 0.8],
  [0.44, 0.23, 0.6],
  [0.48, 0.16, 1.05],
  [0.52, 0.29, 0.55],
  [0.56, 0.08, 0.7],
  [0.6, 0.19, 0.6],
  [0.64, 0.32, 0.85],
  [0.68, 0.12, 0.55],
  [0.72, 0.24, 0.75],
  [0.76, 0.07, 1.1],
  [0.81, 0.17, 0.7],
  [0.86, 0.3, 0.55],
  [0.91, 0.12, 0.9],
  [0.95, 0.23, 0.55],
  [0.08, 0.36, 0.45],
  [0.24, 0.34, 0.6],
  [0.38, 0.36, 0.55],
  [0.5, 0.38, 0.7],
  [0.62, 0.36, 0.55],
  [0.74, 0.35, 0.6],
  [0.88, 0.38, 0.5],
  [0.16, 0.05, 0.5],
  [0.33, 0.24, 0.65],
  [0.46, 0.06, 0.55],
  [0.58, 0.26, 0.8],
  [0.7, 0.18, 0.55],
  [0.82, 0.06, 0.65],
  [0.12, 0.24, 0.75],
  [0.54, 0.13, 0.65],
  [0.94, 0.34, 0.45],
] as const;

const SKY_CONSTELLATION_ROUTES = [
  [0, 3, 6, 9],
  [5, 8, 10, 13],
  [17, 15, 16, 14],
  [34, 18, 21, 28],
] as const;

const SKY_CLOUDS = [
  [0.22, 170, 18, 0.2, 0.36],
  [0.16, 210, 22, 0.62, 0.33],
  [0.14, 140, 16, 0.84, 0.43],
] as const;

const SKY_NIGHT_VEILS = [
  [0.13, 340, 20, -0.05, 0.24, 0.2],
  [0.11, 300, 18, 0.04, 0.7, 0.31],
  [0.08, 260, 14, -0.02, 0.5, 0.39],
] as const;

// V1.3 horizon cloud bank: [centerX fraction, dy px, radiusX px, radiusY px].
// Long flat silhouettes resting just above the sea-meets-sky line.
const HORIZON_CLOUD_BANK = [
  [0.12, -7, 150, 7],
  [0.34, -4, 210, 9],
  [0.55, -9, 120, 6],
  [0.74, -5, 230, 10],
  [0.93, -8, 140, 7],
] as const;

type SkyMoodKey = keyof typeof SKY_MOODS;

const SKY_MOOD_KEYS: readonly SkyMoodKey[] = ["predawn", "dawn", "day", "golden", "dusk", "night"];

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
    dawn: [],
    day: [],
    dusk: [],
    golden: [],
    night: [],
    predawn: [],
  };
  for (const moodKey of SKY_MOOD_KEYS) {
    const mist = SKY_MOODS[moodKey].mist;
    for (let threat = 0 as ThreatLevel; threat <= 4; threat = (threat + 1) as ThreatLevel) {
      const { alphaScale } = cloudScalarsForThreat(threat);
      const row: string[] = [];
      for (const cloud of SKY_CLOUDS) {
        const alpha = Math.min(0.95, cloud[0] * alphaScale);
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

// V2.4 — threat-aware sky staging. The gradient itself now darkens and
// cools as fleet threat climbs, extending the existing threat channel
// (clouds/mist/stars/lightning are already threat-aware). Alphas stay
// subtle (≤ 0.13 day) so mood identity and analytical water colors hold;
// night scales the stage down since the scene is already dark.
const SKY_THREAT_STAGE_ALPHA: readonly number[] = [0, 0.025, 0.055, 0.09, 0.13];

function paintSkyBackdrop(
  target: CanvasRenderingContext2D,
  width: number,
  height: number,
  mood: typeof SKY_MOODS[SkyMoodKey],
  firePointX: number,
  firePointY: number,
  zoom: number,
  nightFactor: number,
  threat: ThreatLevel = 0,
) {
  const gradient = target.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, mood.top);
  gradient.addColorStop(0.52, mood.horizon);
  gradient.addColorStop(1, mood.lower);
  target.fillStyle = gradient;
  target.fillRect(0, 0, width, height);

  const threatStageAlpha = (SKY_THREAT_STAGE_ALPHA[threat] ?? 0) * (1 - 0.55 * nightFactor);
  if (threatStageAlpha > 0.004) {
    target.fillStyle = `rgba(22, 34, 52, ${threatStageAlpha.toFixed(3)})`;
    target.fillRect(0, 0, width, height);
  }

  const horizonBleedAlpha = mood.horizonBleedAlpha * (0.72 + 0.28 * (1 - nightFactor));
  if (horizonBleedAlpha > 0) {
    const haze = target.createLinearGradient(0, 0, 0, height);
    haze.addColorStop(0.38, "rgba(255, 223, 156, 0)");
    haze.addColorStop(0.5, `rgba(255, 223, 156, ${horizonBleedAlpha})`);
    haze.addColorStop(0.58, `rgba(212, 154, 74, ${horizonBleedAlpha * 0.54})`);
    haze.addColorStop(0.72, "rgba(212, 154, 74, 0)");
    target.fillStyle = haze;
    target.fillRect(0, 0, width, height);
  }

  // V1.3 — distant cloud bank hugging the horizon line so the sea reads as
  // extending past the world rim. Long flat silhouettes just above the
  // water-veil boundary; static, so it lives in the cached backdrop. Night
  // keeps a faint trace (the bank alpha follows the mood's horizon bleed).
  const bankAlpha = (0.045 + mood.horizonBleedAlpha * 0.22) * (1 - 0.5 * nightFactor);
  if (bankAlpha > 0.01) {
    const horizonY = height * 0.505;
    target.save();
    target.fillStyle = mood.mist.replace(/[\d.]+\)$/, `${bankAlpha.toFixed(3)})`);
    for (const [cx, dy, rx, ry] of HORIZON_CLOUD_BANK) {
      target.beginPath();
      target.ellipse(width * cx, horizonY + dy, rx, ry, 0, 0, Math.PI * 2);
      target.fill();
    }
    // A whisper of a horizon line where sea meets sky.
    target.fillStyle = `rgba(255, 235, 190, ${(bankAlpha * 0.8).toFixed(3)})`;
    target.fillRect(0, Math.round(height * 0.52) - 1, width, 1);
    target.restore();
  }

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
  threat: ThreatLevel,
): HTMLCanvasElement | null {
  const horizonBleedBucket = (mood.horizonBleedAlpha * 100) | 0;
  const key = `${width}x${height}|${moodKeyFor(mood)}|h${horizonBleedBucket}|${firePointX},${firePointY}|z${(zoom * 100) | 0}|n${(nightFactor * 20) | 0}|t${threat}`;
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
  paintSkyBackdrop(offCtx, width, height, mood, firePointX, firePointY, zoom, nightFactor, threat);
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

  const cached = getSkyBackdropCanvas(width, height, mood, firePointX, firePointY, camera.zoom, state.nightFactor, threat);
  if (cached) {
    ctx.drawImage(cached, 0, 0);
  } else {
    paintSkyBackdrop(ctx, width, height, mood, firePoint.x, firePoint.y, camera.zoom, state.nightFactor, threat);
  }

  ctx.save();
  drawCelestialArc(ctx, width, height, camera.zoom, state);
  drawSun(ctx, width, height, camera.zoom, state);
  drawMoon(ctx, width, height, camera.zoom, state);
  drawStars(ctx, width, height, camera.zoom, state, motion, wind, firePointX, firePointY);
  drawNightCloudVeils(ctx, width, height, camera.zoom, state);
  drawHorizonShips(ctx, width, height, camera.zoom, state, motion);
  drawSkyClouds(ctx, width, height, camera.zoom, state, motion, threat, wind);
  ctx.restore();
}

export function skyState(motion: PharosVilleCanvasMotion) {
  const hour = ((motion.wallClockHour % 24) + 24) % 24;
  let mood: typeof SKY_MOODS[SkyMoodKey];
  if (hour < 5) {
    mood = SKY_MOODS.night;
  } else if (hour < 6) {
    mood = SKY_MOODS.predawn;
  } else if (hour < 7) {
    mood = SKY_MOODS.dawn;
  } else if (hour < 17) {
    mood = SKY_MOODS.day;
  } else if (hour < 18) {
    mood = SKY_MOODS.golden;
  } else if (hour < 20) {
    mood = SKY_MOODS.dusk;
  } else {
    mood = SKY_MOODS.night;
  }
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
  const isNight = moodKeyFor(state.mood) === "night";
  const point = skyPathPoint(width, height, state.progress, 0.5);
  const radius = (isNight ? 11 : 14) * zoom;
  ctx.save();
  const zoomBucket = (zoom * 100) | 0;
  const phaseBucket = quantizeSkyProgress(state.progress);
  const moonKey = `${width|0}x${height|0}|${moodKeyFor(state.mood)}|z${zoomBucket}|p${phaseBucket}`;
  let glow = moonGlowGradientCache.get(moonKey);
  if (!glow) {
    const glowRadius = isNight ? radius * 3.1 : radius * 4.2;
    glow = ctx.createRadialGradient(point.x, point.y, radius * 0.5, point.x, point.y, glowRadius);
    glow.addColorStop(0, isNight
      ? `rgba(154, 178, 157, ${0.14 * state.mood.moonAlpha})`
      : `rgba(220, 231, 220, ${0.32 * state.mood.moonAlpha})`);
    glow.addColorStop(1, isNight ? "rgba(154, 178, 157, 0)" : "rgba(220, 231, 220, 0)");
    rememberGradient(moonGlowGradientCache, moonKey, glow);
  }
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(point.x, point.y, isNight ? radius * 3.1 : radius * 4.2, 0, Math.PI * 2);
  ctx.fill();

  if (isNight) {
    ctx.fillStyle = `rgba(185, 186, 145, ${0.5 * state.mood.moonAlpha})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(4, 6, 10, ${0.88 * state.mood.moonAlpha})`;
    ctx.beginPath();
    ctx.arc(point.x + radius * 0.38, point.y - radius * 0.04, radius * 1.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(193, 112, 69, ${0.36 * state.mood.moonAlpha})`;
    ctx.lineWidth = Math.max(1, 1.1 * zoom);
    ctx.beginPath();
    ctx.arc(point.x - radius * 0.04, point.y, radius * 0.98, Math.PI * 0.58, Math.PI * 1.38);
    ctx.stroke();
    ctx.restore();
    return;
  }

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
  focusX: number,
  focusY: number,
) {
  if (state.mood.starAlpha <= 0) return;
  const isNight = moodKeyFor(state.mood) === "night";
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  // Parallax: slow horizontal drift (depth-modulated) wrapped over the
  // viewport width so stars never leave the sky band. Wind multiplier scales
  // the drift speed based on the active DEWS threat across visible zones —
  // higher threat → ambient air moves faster.
  const driftBase = motion.reducedMotion ? 0 : time * 1.6 * 0.3 * zoom * windScale;
  ctx.save();
  ctx.globalAlpha = state.mood.starAlpha;
  ctx.strokeStyle = isNight ? "rgba(137, 185, 166, 0.2)" : "rgba(245, 231, 184, 0.22)";
  ctx.lineWidth = Math.max(1, zoom * 0.75);
  for (const route of SKY_CONSTELLATION_ROUTES) {
    for (let i = 0; i < route.length - 1; i += 1) {
      drawStarRouteSegment(ctx, width, height, driftBase, route[i]!, route[i + 1]!);
    }
  }
  if (isNight) {
    const target = {
      x: Math.max(width * 0.18, Math.min(width * 0.82, focusX)),
      y: Math.max(height * 0.1, Math.min(height * 0.42, focusY - 116 * zoom)),
    };
    ctx.strokeStyle = `rgba(111, 174, 154, ${0.18 + state.nightFactor * 0.1})`;
    ctx.setLineDash([3 * zoom, 7 * zoom]);
    for (const route of SKY_CONSTELLATION_ROUTES) {
      const end = starScreenPoint(route[route.length - 1]!, width, height, driftBase);
      if (!end || Math.abs(target.x - end.x) > width * 0.5) continue;
      const pullX = end.x + (target.x - end.x) * 0.62;
      const pullY = end.y + (target.y - end.y) * 0.62;
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(pullX, pullY);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  for (const [index, star] of SKY_STARS.entries()) {
    const twinkle = motion.reducedMotion ? 1 : 0.78 + Math.sin(time * 0.9 + index * 1.7) * 0.22;
    const baseSize = star[2];
    const size = Math.max(1, baseSize * zoom * twinkle * (0.85 + zoom * 0.3));
    const depth = 0.6 + ((index * 37) % 100) / 250;
    const x = Math.round(((width * star[0] + driftBase * depth) % width + width) % width);
    const y = Math.round(height * star[1]);
    ctx.fillStyle = isNight
      ? (index % 5 === 0 ? "#d5c68f" : index % 3 === 0 ? "#b8d7c8" : "#dce8cf")
      : (index % 4 === 0 ? "#fff3c7" : "#e9f0d8");
    ctx.fillRect(x, y, size, size);
    if (baseSize > 0.95) {
      ctx.fillRect(x - Math.round(size), y, size, Math.max(1, size * 0.45));
      ctx.fillRect(x, y - Math.round(size), Math.max(1, size * 0.45), size);
    }
  }
  ctx.restore();
}

function starScreenPoint(
  index: number,
  width: number,
  height: number,
  driftBase: number,
): { x: number; y: number } | null {
  const star = SKY_STARS[index];
  if (!star) return null;
  const depth = 0.6 + ((index * 37) % 100) / 250;
  return {
    x: ((width * star[0] + driftBase * depth) % width + width) % width,
    y: height * star[1],
  };
}

function drawStarRouteSegment(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  driftBase: number,
  from: number,
  to: number,
): void {
  const start = starScreenPoint(from, width, height, driftBase);
  const end = starScreenPoint(to, width, height, driftBase);
  if (!start || !end || Math.abs(end.x - start.x) > width * 0.5) return;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

function drawNightCloudVeils(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom: number,
  state: ReturnType<typeof skyState>,
): void {
  if (state.nightFactor <= 0) return;
  ctx.save();
  ctx.globalAlpha = state.nightFactor;
  for (const [alpha, rx, ry, tilt, x, y] of SKY_NIGHT_VEILS) {
    ctx.fillStyle = `rgba(1, 5, 9, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(
      width * x,
      height * y,
      rx * zoom,
      ry * zoom,
      tilt,
      0,
      Math.PI * 2,
    );
    ctx.fill();
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
    const drift = ambientWindPhase(motion, cloud[3] * 8) * 22 * zoom * windScale * driftScale;
    const horizontalDrift = motion.reducedMotion ? 0 : Math.sin(time * 0.12 * windScale + i * 1.3) * 8 * zoom;
    ctx.strokeStyle = strokes[i]!;
    ctx.lineWidth = Math.max(1, 5 * zoom * scalars.thicknessScale);
    // V1.3 — clouds stroke as layered top-arc humps instead of full ellipse
    // outlines, which read as wireframe rings against the open horizon at
    // far zoom. Same colors, drift, and threat scaling; only the path shape
    // changes.
    const cloudX = width * cloud[3] + drift + horizontalDrift;
    const cloudY = height * (cloud[4] + scalars.yBias);
    const cloudRx = cloud[1] * zoom * scalars.thicknessScale;
    const cloudRy = cloud[2] * zoom * scalars.thicknessScale;
    ctx.beginPath();
    ctx.ellipse(cloudX, cloudY, cloudRx, cloudRy, -0.08, Math.PI * 0.97, Math.PI * 2.03);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(
      cloudX - cloudRx * 0.34,
      cloudY - cloudRy * 0.5,
      cloudRx * 0.46,
      cloudRy * 0.82,
      -0.08,
      Math.PI * 0.92,
      Math.PI * 2.02,
    );
    ctx.stroke();
  }
  ctx.restore();
}
