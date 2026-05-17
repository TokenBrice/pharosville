import { defaultCamera } from "../../systems/camera";
import { tileToScreen, type ScreenPoint } from "../../systems/projection";
import type { DrawPharosVilleInput } from "../render-types";
import { maxActiveThreatLevel, windMultiplier, type ThreatLevel } from "./weather";

export const ATMOSPHERIC_FADE_MAX_ALPHA = 0.18;
export const ATMOSPHERIC_FADE_COLOR = { r: 20, g: 28, b: 48 } as const;
export const CLOUD_SHADOW_PERIOD_SECONDS = 95;
export const CLOUD_SHADOW_NIGHT_CUTOFF = 0.3;
export const ESTABLISHING_LETTERBOX_HEIGHT_PX = 8;
export const FILM_GRAIN_DPR_GATE = 1.25;
export const FILM_GRAIN_TILE_SIZE = 64;
export const FILM_GRAIN_ALPHA = 0.04;
export const SCANLINE_ALPHA = 0.05;

interface CinematicFrameInput {
  camera: DrawPharosVilleInput["camera"];
  height: number;
  motion: DrawPharosVilleInput["motion"];
  selectedTarget: DrawPharosVilleInput["selectedTarget"];
  width: number;
  world: DrawPharosVilleInput["world"];
}

export interface CloudShadowSample {
  alpha: number;
  centerX: number;
  centerY: number;
  rotation: number;
  rx: number;
  ry: number;
}

const CLOUD_SHADOW_BANDS = [
  { alphaScale: 1, lane: -0.18, phaseOffset: 0, rx: 210, ry: 42 },
  { alphaScale: 0.72, lane: 0.14, phaseOffset: 0.38, rx: 155, ry: 34 },
] as const;

const BAYER_8 = [
  [0, 48, 12, 60, 3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8, 56, 4, 52, 11, 59, 7, 55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [2, 50, 14, 62, 1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6, 54, 9, 57, 5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21],
] as const;

let scanlineTileCanvas: HTMLCanvasElement | null | undefined;
let grainTileCanvas: HTMLCanvasElement | null | undefined;
const ATMOSPHERIC_FADE_GRADIENT_CACHE_LIMIT = 24;
const atmosphericFadeGradientCacheByContext = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>();
const patternCacheByContext = new WeakMap<CanvasRenderingContext2D, {
  grain?: CanvasPattern | null;
  scanlines?: CanvasPattern | null;
}>();

export function drawAtmosphericFade(input: DrawPharosVilleInput, nightFactor: number): void {
  if (input.width <= 0 || input.height <= 0) return;
  const alpha = atmosphericFadeMaxAlpha(nightFactor);
  if (alpha <= 0) return;

  const anchor = atmosphericFadeAnchorScreen(input);
  const radius = Math.max(1, farthestViewportCornerDistance(anchor, input.width, input.height));
  const gradient = atmosphericFadeGradient(input.ctx, {
    alpha,
    anchorX: anchor.x,
    anchorY: anchor.y,
    dpr: input.dpr,
    height: input.height,
    innerRadius: Math.max(36, 84 * input.camera.zoom),
    outerRadius: radius,
    width: input.width,
  });

  input.ctx.save();
  input.ctx.fillStyle = gradient;
  input.ctx.fillRect(0, 0, input.width, input.height);
  input.ctx.restore();
}

export function atmosphericFadeMaxAlpha(nightFactor: number): number {
  return ATMOSPHERIC_FADE_MAX_ALPHA * (1 - clamp01(nightFactor) * 0.4);
}

export function atmosphericFadeAnchorScreen(input: Pick<CinematicFrameInput, "camera" | "world">): ScreenPoint {
  const mapCenter = tileToScreen({
    x: (input.world.map.width - 1) / 2,
    y: (input.world.map.height - 1) / 2,
  }, input.camera);
  const lighthouse = tileToScreen(input.world.lighthouse.tile, input.camera);
  return {
    x: mapCenter.x * 0.58 + lighthouse.x * 0.42,
    y: mapCenter.y * 0.58 + lighthouse.y * 0.42,
  };
}

export function drawCloudShadowDrift(input: DrawPharosVilleInput, nightFactor: number): void {
  const samples = cloudShadowSamples(input, nightFactor);
  if (samples.length === 0) return;

  input.ctx.save();
  input.ctx.globalCompositeOperation = "multiply";
  for (const sample of samples) {
    drawSoftCloudShadow(input.ctx, sample);
  }
  input.ctx.restore();
}

export function cloudShadowSamples(input: Pick<CinematicFrameInput, "camera" | "height" | "motion" | "width" | "world">, nightFactor: number): readonly CloudShadowSample[] {
  if (input.width <= 0 || input.height <= 0) return [];
  const threat = maxActiveThreatLevel(input.world);
  const alpha = cloudShadowAlpha(nightFactor, threat);
  if (alpha <= 0) return [];

  const wind = windMultiplier(threat);
  const phaseBase = cloudShadowPhase(input.motion.timeSeconds, wind, input.motion.reducedMotion);
  const center = islandCentroidScreen(input);
  const travelLength = Math.max(input.width, input.height) * 1.42;
  const laneSpan = Math.min(input.width, input.height) * 0.28;
  const angle = -0.48;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const normalX = -dirY;
  const normalY = dirX;
  const zoomScale = Math.max(0.72, Math.min(1.55, input.camera.zoom));
  const threatScale = 1 + threat * 0.035;

  return CLOUD_SHADOW_BANDS.map((band) => {
    const phase = positiveModulo(phaseBase + band.phaseOffset, 1);
    const travel = (phase - 0.5) * travelLength;
    const lane = band.lane * laneSpan;
    return {
      alpha: alpha * band.alphaScale,
      centerX: center.x + dirX * travel + normalX * lane,
      centerY: center.y + dirY * travel + normalY * lane,
      rotation: angle,
      rx: band.rx * zoomScale * threatScale,
      ry: band.ry * zoomScale * (1 + threat * 0.025),
    };
  });
}

export function cloudShadowAlpha(nightFactor: number, threat: ThreatLevel): number {
  if (nightFactor > CLOUD_SHADOW_NIGHT_CUTOFF) return 0;
  const dayScale = 1 - Math.max(0, nightFactor) / CLOUD_SHADOW_NIGHT_CUTOFF;
  return (0.044 + threat * 0.006) * Math.max(0, dayScale);
}

export function cloudShadowPhase(timeSeconds: number, windScale: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0.18;
  return positiveModulo(timeSeconds * Math.max(0.1, windScale) / CLOUD_SHADOW_PERIOD_SECONDS, 1);
}

export function drawEstablishingShotLetterbox(input: DrawPharosVilleInput): void {
  if (!isEstablishingShotEligible(input)) return;

  const caption = establishingShotCaption(input.world);
  const barHeight = ESTABLISHING_LETTERBOX_HEIGHT_PX;
  const captionY = input.height - Math.max(15, barHeight + 8);
  const fontSize = Math.max(11, Math.min(14, Math.round(12 * input.camera.zoom)));

  input.ctx.save();
  input.ctx.fillStyle = "rgba(5, 8, 12, 0.55)";
  input.ctx.fillRect(0, 0, input.width, barHeight);
  input.ctx.fillRect(0, input.height - barHeight, input.width, barHeight);
  input.ctx.font = `600 ${fontSize}px "PV Plaque", Georgia, serif`;
  input.ctx.textAlign = "center";
  input.ctx.textBaseline = "middle";
  input.ctx.shadowColor = "rgba(5, 8, 12, 0.7)";
  input.ctx.shadowBlur = 6;
  input.ctx.fillStyle = "rgba(248, 229, 178, 0.9)";
  input.ctx.fillText(caption, input.width / 2, captionY);
  input.ctx.restore();
}

export function establishingShotCaption(world: DrawPharosVilleInput["world"]): string {
  const band = world.lighthouse.unavailable ? "UNAVAILABLE" : world.lighthouse.psiBand ?? "UNAVAILABLE";
  return `PHAROS LIGHTHOUSE — PSI ${band.toUpperCase()}`;
}

export function isEstablishingShotEligible(input: Pick<CinematicFrameInput, "camera" | "height" | "selectedTarget" | "width" | "world">): boolean {
  if (input.selectedTarget || input.width <= 0 || input.height <= 0) return false;
  const homeCamera = defaultCamera({
    height: input.height,
    map: input.world.map,
    width: input.width,
  });
  // Renderer input has no "has panned" history. This deliberately conservative
  // home test makes any material pan/zoom/select hide the shot; resetting to
  // the default camera can show it again.
  const offsetTolerance = Math.max(18, 28 * input.camera.zoom);
  return Math.abs(input.camera.zoom - homeCamera.zoom) <= 0.025
    && Math.abs(input.camera.offsetX - homeCamera.offsetX) <= offsetTolerance
    && Math.abs(input.camera.offsetY - homeCamera.offsetY) <= offsetTolerance;
}

export function drawFilmGrainPass(input: DrawPharosVilleInput): void {
  if (!shouldDrawFilmGrain(input.motion.reducedMotion, input.dpr)) return;
  if (input.width <= 0 || input.height <= 0) return;

  drawScanlines(input.ctx, input.width, input.height);
  drawOrderedDitherGrain(input.ctx, input.width, input.height);
}

export function shouldDrawFilmGrain(reducedMotion: boolean, dpr?: number): boolean {
  if (reducedMotion) return false;
  return dpr === undefined || dpr >= FILM_GRAIN_DPR_GATE;
}

export function orderedDitherThreshold(x: number, y: number): number {
  return (BAYER_8[y & 7]![x & 7]! + 0.5) / 64;
}

function drawScanlines(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  const pattern = cachedPattern(ctx, "scanlines", scanlineTile());
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = `rgba(5, 8, 12, ${SCANLINE_ALPHA})`;
    for (let y = 0; y < height; y += 2) {
      ctx.fillRect(0, y, width, 1);
    }
  }
  ctx.restore();
}

function drawOrderedDitherGrain(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const pattern = cachedPattern(ctx, "grain", grainTile());
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = FILM_GRAIN_ALPHA;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawSoftCloudShadow(ctx: CanvasRenderingContext2D, sample: CloudShadowSample): void {
  ctx.save();
  ctx.translate(sample.centerX, sample.centerY);
  ctx.rotate(sample.rotation);
  ctx.scale(sample.rx, sample.ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, `rgba(5, 8, 12, ${sample.alpha.toFixed(3)})`);
  gradient.addColorStop(0.62, `rgba(5, 8, 12, ${(sample.alpha * 0.55).toFixed(3)})`);
  gradient.addColorStop(1, "rgba(5, 8, 12, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function islandCentroidScreen(input: Pick<CinematicFrameInput, "camera" | "world">): ScreenPoint {
  return tileToScreen({
    x: (input.world.map.width - 1) / 2,
    y: (input.world.map.height - 1) / 2,
  }, input.camera);
}

function farthestViewportCornerDistance(anchor: ScreenPoint, width: number, height: number): number {
  return Math.max(
    Math.hypot(anchor.x, anchor.y),
    Math.hypot(width - anchor.x, anchor.y),
    Math.hypot(anchor.x, height - anchor.y),
    Math.hypot(width - anchor.x, height - anchor.y),
  );
}

function scanlineTile(): HTMLCanvasElement | null {
  if (scanlineTileCanvas !== undefined) return scanlineTileCanvas;
  const canvas = createTileCanvas(1, 2);
  if (!canvas) {
    scanlineTileCanvas = null;
    return null;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    scanlineTileCanvas = null;
    return null;
  }
  ctx.fillStyle = `rgba(5, 8, 12, ${SCANLINE_ALPHA})`;
  ctx.fillRect(0, 0, 1, 1);
  scanlineTileCanvas = canvas;
  return scanlineTileCanvas;
}

function grainTile(): HTMLCanvasElement | null {
  if (grainTileCanvas !== undefined) return grainTileCanvas;
  const canvas = createTileCanvas(FILM_GRAIN_TILE_SIZE, FILM_GRAIN_TILE_SIZE);
  if (!canvas) {
    grainTileCanvas = null;
    return null;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    grainTileCanvas = null;
    return null;
  }
  const image = ctx.createImageData(FILM_GRAIN_TILE_SIZE, FILM_GRAIN_TILE_SIZE);
  for (let y = 0; y < FILM_GRAIN_TILE_SIZE; y += 1) {
    for (let x = 0; x < FILM_GRAIN_TILE_SIZE; x += 1) {
      const threshold = orderedDitherThreshold(x, y);
      const idx = (y * FILM_GRAIN_TILE_SIZE + x) * 4;
      if (threshold > 0.5) {
        image.data[idx] = 250;
        image.data[idx + 1] = 236;
        image.data[idx + 2] = 206;
      } else {
        image.data[idx] = 5;
        image.data[idx + 1] = 8;
        image.data[idx + 2] = 12;
      }
      image.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  grainTileCanvas = canvas;
  return grainTileCanvas;
}

function createTileCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function patternFromCanvas(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement | null): CanvasPattern | null {
  if (!canvas) return null;
  return ctx.createPattern(canvas, "repeat");
}

function cachedPattern(
  ctx: CanvasRenderingContext2D,
  kind: "grain" | "scanlines",
  canvas: HTMLCanvasElement | null,
): CanvasPattern | null {
  if (!canvas) return null;
  let cache = patternCacheByContext.get(ctx);
  if (!cache) {
    cache = {};
    patternCacheByContext.set(ctx, cache);
  }
  const cached = cache[kind];
  if (cached !== undefined) return cached;
  const pattern = patternFromCanvas(ctx, canvas);
  cache[kind] = pattern;
  return pattern;
}

function atmosphericFadeGradient(
  ctx: CanvasRenderingContext2D,
  params: {
    alpha: number;
    anchorX: number;
    anchorY: number;
    dpr?: number;
    height: number;
    innerRadius: number;
    outerRadius: number;
    width: number;
  },
): CanvasGradient {
  const alphaBucket = Math.round(clamp01(params.alpha) * 1000);
  const key = [
    Math.round(params.width),
    Math.round(params.height),
    dprBucket(params.dpr),
    Math.round(params.anchorX),
    Math.round(params.anchorY),
    Math.round(params.innerRadius),
    Math.round(params.outerRadius),
    alphaBucket,
  ].join(":");
  const cache = atmosphericFadeCacheForContext(ctx);
  const cached = cache.get(key);
  if (cached) return cached;

  const alpha = alphaBucket / 1000;
  const gradient = ctx.createRadialGradient(
    params.anchorX,
    params.anchorY,
    Math.max(1, params.innerRadius),
    params.anchorX,
    params.anchorY,
    Math.max(1, params.outerRadius),
  );
  gradient.addColorStop(0, rgba(ATMOSPHERIC_FADE_COLOR, 0));
  gradient.addColorStop(0.58, rgba(ATMOSPHERIC_FADE_COLOR, alpha * 0.34));
  gradient.addColorStop(1, rgba(ATMOSPHERIC_FADE_COLOR, alpha));
  cache.set(key, gradient);
  trimOldest(cache, ATMOSPHERIC_FADE_GRADIENT_CACHE_LIMIT);
  return gradient;
}

function atmosphericFadeCacheForContext(ctx: CanvasRenderingContext2D): Map<string, CanvasGradient> {
  let cache = atmosphericFadeGradientCacheByContext.get(ctx);
  if (!cache) {
    cache = new Map();
    atmosphericFadeGradientCacheByContext.set(ctx, cache);
  }
  return cache;
}

function trimOldest<TKey, TValue>(cache: Map<TKey, TValue>, limit: number): void {
  if (cache.size <= limit) return;
  const oldest = cache.keys().next().value;
  if (oldest !== undefined) cache.delete(oldest);
}

function dprBucket(dpr?: number): number {
  return Math.max(1, Math.round((dpr && dpr > 0 ? dpr : 1) * 100));
}

function rgba(color: typeof ATMOSPHERIC_FADE_COLOR, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
