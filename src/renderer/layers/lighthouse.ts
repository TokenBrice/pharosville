import { tileToScreen, type ScreenPoint } from "../../systems/projection";
import { drawAsset } from "../canvas-primitives";
import { LIGHTHOUSE_DRAW_OFFSET, LIGHTHOUSE_DRAW_SCALE } from "../geometry";
import type { DrawPharosVilleInput, PharosVilleCanvasMotion } from "../render-types";

export type LighthouseRenderState = ReturnType<typeof lighthouseRenderState>;

export function lighthouseRenderState({ assets, camera, world }: DrawPharosVilleInput) {
  const center = tileToScreen(world.lighthouse.tile, camera);
  const lighthouseAsset = assets?.get("landmark.lighthouse");
  const spriteScale = camera.zoom * LIGHTHOUSE_DRAW_SCALE;
  const spriteAnchor = {
    x: center.x + LIGHTHOUSE_DRAW_OFFSET.x * camera.zoom,
    y: center.y + LIGHTHOUSE_DRAW_OFFSET.y * camera.zoom,
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

const LIGHTHOUSE_HEADLAND_SCALE = 0.5;

const NIGHT_WATER_POOL_RADIUS = 900;       // sprite units — warm pool centered slightly below firePoint
const NIGHT_WATER_POOL_MAX_ALPHA = 0.42;

// Sweep beams. Tweak these to taste; module-top so A/B is one edit.
const SWEEP_PAIRED = true;
const SWEEP_LENGTH = 1200;       // sprite-units; reaches all map corners with margin
const SWEEP_APEX_HALF = 6;
const SWEEP_FAR_HALF = 90;
const SWEEP_PERIOD = 48;         // seconds per revolution
const SWEEP_PEAK_ALPHA = 0.22;
const SWEEP_REDUCED_ALPHA = 0.10;
const SWEEP_REDUCED_ANGLE = Math.PI / 4;

// Beam-tail glints — placed near the far end of each sweep beam.
const GLINT_ALONG: ReadonlyArray<number> = [0.78, 0.85, 0.88, 0.92, 0.94, 0.97];
const GLINT_PERP_JITTER: ReadonlyArray<number> = [14, -18, 8, -11, 20, -6];

// Ember spark trail behind each sweep beam.
const TRAIL_PARTICLE_COUNT = 10;
const TRAIL_LAG_RAD = (10 * Math.PI) / 180;
const TRAIL_SPREAD_RAD = (15 * Math.PI) / 180;

// Smoke wisp.
const SMOKE_PUFF_COUNT = 10;
const SMOKE_LIFETIME = 4.5;

// Distance-based ambient warm rim on ships near the lighthouse.
const RIM_RADIUS = 380;
const RIM_PEAK_ALPHA = 0.45;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cached = LANTERN_TIP_RGB_CACHE.get(hex);
  if (cached) return cached;
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return FALLBACK_LANTERN_TIP_RGB;
  const n = parseInt(m[1]!, 16);
  const rgb = { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  LANTERN_TIP_RGB_CACHE.set(hex, rgb);
  return rgb;
}

const FALLBACK_LANTERN_TIP_RGB = { r: 240, g: 140, b: 70 };
const LANTERN_TIP_RGB_CACHE = new Map<string, { r: number; g: number; b: number }>();

type NightGradientBundle = {
  diffuse: CanvasGradient;
  core: CanvasGradient;
  pool: CanvasGradient;
};

const NIGHT_GRADIENT_CACHE_LIMIT = 16;
// Camera-derived inputs make the working set tiny; LRU evicts on overflow.
const nightGradientCache = new Map<string, NightGradientBundle>();

// Pre-baked sweep-beam sprite cache. Each entry is a horizontal trapezoidal
// beam (apex at left, far end at right) baked at sweepAlpha=1; callers
// modulate via `globalAlpha` and rotate via canvas transform. Skips both
// `createLinearGradient` calls per frame. Key: tip-color RGB + bucketed
// beamZoom, since the trapezoid endpoints scale with beamZoom and the last
// two color stops carry the lighthouse tip color.
const SWEEP_BEAM_CACHE_LIMIT = 8;
const SWEEP_BEAM_ZOOM_BUCKETS = 4;
const sweepBeamSpriteCache = new Map<string, { canvas: HTMLCanvasElement; apexX: number; centerY: number }>();

function quantizeSweepBeamZoom(zoom: number): number {
  return Math.max(0.05, Math.round(zoom * SWEEP_BEAM_ZOOM_BUCKETS) / SWEEP_BEAM_ZOOM_BUCKETS);
}

function getSweepBeamSprite(
  tip: { r: number; g: number; b: number },
  beamZoom: number,
): { canvas: HTMLCanvasElement; apexX: number; centerY: number } | null {
  if (typeof document === "undefined") return null;
  const bucketedZoom = quantizeSweepBeamZoom(beamZoom);
  const key = `${tip.r},${tip.g},${tip.b}|z${(bucketedZoom * 100) | 0}`;
  const cached = sweepBeamSpriteCache.get(key);
  if (cached) {
    sweepBeamSpriteCache.delete(key);
    sweepBeamSpriteCache.set(key, cached);
    return cached;
  }

  const sweepLen = SWEEP_LENGTH * bucketedZoom;
  const sweepApex = SWEEP_APEX_HALF * bucketedZoom;
  const sweepFar = SWEEP_FAR_HALF * bucketedZoom;
  const padding = 2;
  const width = Math.max(2, Math.ceil(sweepLen) + padding * 2);
  const height = Math.max(2, Math.ceil(sweepFar * 2) + padding * 2);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const offCtx = canvas.getContext("2d");
  if (!offCtx) return null;
  const apexX = padding;
  const centerY = height / 2;
  const tipX = apexX + sweepLen;

  const grad = offCtx.createLinearGradient(apexX, centerY, tipX, centerY);
  grad.addColorStop(0, "rgba(255, 240, 195, 1)");
  grad.addColorStop(0.25, "rgba(255, 200, 110, 0.78)");
  grad.addColorStop(0.65, "rgba(240, 140, 70, 0.36)");
  grad.addColorStop(0.88, `rgba(${tip.r}, ${tip.g}, ${tip.b}, 0.22)`);
  grad.addColorStop(1, `rgba(${tip.r}, ${tip.g}, ${tip.b}, 0)`);
  offCtx.fillStyle = grad;
  offCtx.beginPath();
  offCtx.moveTo(apexX, centerY - sweepApex);
  offCtx.lineTo(tipX, centerY - sweepFar);
  offCtx.lineTo(tipX, centerY + sweepFar);
  offCtx.lineTo(apexX, centerY + sweepApex);
  offCtx.closePath();
  offCtx.fill();

  const entry = { canvas, apexX, centerY };
  sweepBeamSpriteCache.set(key, entry);
  while (sweepBeamSpriteCache.size > SWEEP_BEAM_CACHE_LIMIT) {
    const oldest = sweepBeamSpriteCache.keys().next().value;
    if (oldest === undefined) break;
    sweepBeamSpriteCache.delete(oldest);
  }
  return entry;
}

export function drawLighthouseHeadland(input: DrawPharosVilleInput) {
  const { assets, camera, ctx, world } = input;
  const headland = assets?.get("overlay.lighthouse-headland");
  if (!headland) return;
  const center = tileToScreen(world.lighthouse.tile, camera);
  drawAsset(ctx, headland, center.x, center.y, camera.zoom * LIGHTHOUSE_HEADLAND_SCALE);
}


export function lighthouseOverlayScreenBounds(
  input: DrawPharosVilleInput,
  selectionRect: { height: number; width: number; x: number; y: number },
  cached: LighthouseRenderState | undefined,
  nightFactor: number,
): { height: number; width: number; x: number; y: number } {
  const { firePoint } = cached ?? lighthouseRenderState(input);
  const beamZoom = input.camera.zoom * 1.35;
  // Day-beam wedge fades with nightFactor; once fully dark the overlay
  // shrinks to the sprite footprint. The rotating sweep is drawn in a
  // separate full-screen pass and doesn't need this culling rect.
  const reach = 1 - nightFactor;
  const beamBounds = {
    height: 120 * beamZoom,
    width: 436 * beamZoom * reach,
    x: firePoint.x - 176 * beamZoom * reach,
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

export function drawLighthouseBody(input: DrawPharosVilleInput, cached?: LighthouseRenderState) {
  const { camera, ctx, world } = input;
  const { center, lighthouseAsset, spriteAnchor, spriteScale } = cached ?? lighthouseRenderState(input);
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

export function drawLighthouseOverlay(
  input: DrawPharosVilleInput,
  cached?: LighthouseRenderState,
  nightFactor = 0,
) {
  const { camera, ctx, motion, world } = input;
  const { firePoint, lighthouseAsset } = cached ?? lighthouseRenderState(input);
  if (world.lighthouse.unavailable) return;
  drawLighthouseBeam(ctx, firePoint, camera.zoom * 1.35, motion, nightFactor);
  // Fire always renders. With the sprite loaded, skip the procedural brazier
  // base (the asset already has one); without it, draw the full fallback.
  drawLighthouseFire(ctx, firePoint, camera.zoom * 1.32, motion, !lighthouseAsset);
  drawBrazierSmoke(ctx, firePoint, camera.zoom * 1.32, motion, nightFactor);
}

const FLAME_OUTER: ReadonlyArray<[number, number]> = [
  [-11, 2],
  [-7, -11],
  [-3, -6],
  [0, -25],
  [5, -8],
  [10, -14],
  [13, 2],
  [6, 10],
  [-5, 10],
];
const FLAME_MID: ReadonlyArray<[number, number]> = [
  [-6, 4],
  [-3, -8],
  [0, -18],
  [4, -7],
  [8, 4],
  [3, 9],
  [-3, 9],
];
const FLAME_INNER: ReadonlyArray<[number, number]> = [
  [-3, 5],
  [0, -8],
  [4, 5],
  [0, 8],
];

const FIRE_GLOW_COLOR = "#ff9a4a";    // warm orange — outer halo and base smoke
const FIRE_OUTER_COLOR = "#ec7c34";   // deep orange — outermost flame band

function drawLighthouseFire(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  motion: PharosVilleCanvasMotion,
  withBrazierBase: boolean,
) {
  const flickerSpeed = motion.plan.lighthouseFireFlickerPerSecond;
  const time = motion.timeSeconds;
  const flicker = motion.reducedMotion ? 0 : Math.sin(time * 14 * flickerSpeed) * 0.12
    + Math.sin(time * 21 * flickerSpeed) * 0.06;
  const scale = zoom * (1 + flicker);
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.scale(scale, scale);

  ctx.globalAlpha = 0.42;
  ctx.fillStyle = FIRE_GLOW_COLOR;
  ctx.beginPath();
  ctx.ellipse(0, 3, 24, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = FIRE_GLOW_COLOR;
  ctx.beginPath();
  ctx.arc(0, -6, 15, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  if (motion.reducedMotion) {
    drawPixelFlame(ctx, FLAME_OUTER, FIRE_OUTER_COLOR);
    drawPixelFlame(ctx, FLAME_MID, "#ffcc62");
    drawPixelFlame(ctx, FLAME_INNER, "#fff2a8");
  } else {
    drawLivingFlame(ctx, FLAME_OUTER, FIRE_OUTER_COLOR, time, flickerSpeed, 1.7);
    drawLivingFlame(ctx, FLAME_MID, "#ffcc62", time, flickerSpeed, 1.3);
    drawLivingFlame(ctx, FLAME_INNER, "#fff2a8", time, flickerSpeed, 0.8);
  }

  if (withBrazierBase) {
    ctx.fillStyle = "#4b2d1d";
    ctx.fillRect(-12, 8, 24, 5);
    ctx.fillStyle = "#9a5a2a";
    ctx.fillRect(-9, 6, 18, 3);
  }
  ctx.restore();

  drawBrazierHeatShimmer(ctx, point, zoom, motion);
  drawHearthEmbers(ctx, point, zoom, motion);
}

const EMBER_MOTES: ReadonlyArray<{ dx: number; dy: number; r: number }> = [
  { dx: -8, dy: -14, r: 1.2 },
  { dx: 4, dy: -22, r: 1.4 },
  { dx: -2, dy: -8, r: 1 },
  { dx: 9, dy: -12, r: 1.3 },
  { dx: -10, dy: -2, r: 1 },
  { dx: 7, dy: -28, r: 1.1 },
];

const EMBER_STREAM_COUNT = 14;
const EMBER_STREAM_LIFETIME = 2.6;

const EMBER_COLOR = "#ffb060";

function drawHearthEmbers(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  motion: PharosVilleCanvasMotion,
) {
  if (motion.reducedMotion) {
    ctx.save();
    ctx.fillStyle = EMBER_COLOR;
    for (let index = 0; index < EMBER_MOTES.length; index += 1) {
      const mote = EMBER_MOTES[index]!;
      ctx.globalAlpha = 0.5;
      const px = point.x + mote.dx * zoom;
      const py = point.y + mote.dy * zoom;
      const radius = Math.max(1, mote.r * zoom);
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  const time = motion.timeSeconds;
  ctx.save();
  ctx.fillStyle = EMBER_COLOR;
  for (let i = 0; i < EMBER_STREAM_COUNT; i += 1) {
    const offset = (i / EMBER_STREAM_COUNT) * EMBER_STREAM_LIFETIME;
    const t = ((time + offset) % EMBER_STREAM_LIFETIME) / EMBER_STREAM_LIFETIME; // 0..1
    const seed = i * 2.713;
    const baseX = Math.sin(seed) * 7;
    const driftX = Math.sin(seed * 1.7 + time * 0.9) * 3.5 * t;
    const px = point.x + (baseX + driftX) * zoom;
    const py = point.y + (-2 - 30 * t) * zoom;
    const radius = Math.max(1, (1.35 - t * 0.55) * zoom);
    // Triangle alpha curve: ramps in fast, fades slow.
    const alpha = (t < 0.18 ? t / 0.18 : (1 - t) / 0.82) * 0.85;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawLighthouseBeam(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  motion: PharosVilleCanvasMotion,
  nightFactor: number,
) {
  // Beams are a daytime affordance; at night the ambient halo + water pool
  // take over the visual footprint. Fade linearly with nightFactor so dawn
  // and dusk transition smoothly.
  const fade = 1 - nightFactor;
  if (fade <= 0) return;
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const pulse = (0.11 + Math.sin(time * 0.7) * 0.025) * fade;
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

  ctx.globalAlpha = 0.24 * fade;
  ctx.fillStyle = "#ffe2a0";
  ctx.beginPath();
  ctx.ellipse(point.x, point.y - 2 * zoom, 58 * zoom, 24 * zoom, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPixelFlame(ctx: CanvasRenderingContext2D, points: ReadonlyArray<[number, number]>, color: string) {
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

// Like drawPixelFlame but each vertex sways with low-freq sine noise. Tips
// (negative y, near the apex) sway most; base vertices stay anchored so the
// flame doesn't visibly slide off the brazier.
function drawLivingFlame(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<[number, number]>,
  color: string,
  time: number,
  flickerSpeed: number,
  swayAmount: number,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    const phase = index * 1.27;
    const tipFactor = Math.max(0, Math.min(1, -y / 22));
    const dx = Math.sin(time * 6.2 * flickerSpeed + phase) * swayAmount * tipFactor;
    const dy = Math.sin(time * 8.4 * flickerSpeed + phase * 0.81) * swayAmount * 0.7 * tipFactor;
    const px = Math.round(x + dx);
    const py = Math.round(y + dy);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
}

function drawBrazierHeatShimmer(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  motion: PharosVilleCanvasMotion,
) {
  if (motion.reducedMotion) return;
  const time = motion.timeSeconds;
  const flickerHz = 9 * motion.plan.lighthouseFireFlickerPerSecond;
  const wobbleX = Math.sin(time * (Math.PI * 2 / 1.6)) * 1.0 * zoom;
  const cy = point.y - 35 * zoom;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const bands: ReadonlyArray<{ rx: number; ry: number; r: number; g: number; b: number; a: number }> = [
    { rx: 5,  ry: 16, r: 255, g: 230, b: 190, a: 0.10 },
    { rx: 9,  ry: 20, r: 255, g: 210, b: 160, a: 0.07 },
    { rx: 12, ry: 22, r: 255, g: 190, b: 130, a: 0.04 },
  ];
  for (let i = 0; i < bands.length; i += 1) {
    const b = bands[i]!;
    const breath = 0.85 + 0.15 * Math.sin(time * flickerHz + i * 1.7);
    ctx.fillStyle = `rgba(${b.r}, ${b.g}, ${b.b}, ${b.a * breath})`;
    ctx.beginPath();
    ctx.ellipse(point.x + wobbleX, cy, b.rx * zoom, b.ry * zoom, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBrazierSmoke(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  motion: PharosVilleCanvasMotion,
  nightFactor: number,
) {
  if (motion.reducedMotion) return;
  const time = motion.timeSeconds;
  const peakBase = 0.18 * (0.55 + 0.45 * (1 - nightFactor));
  ctx.save();
  for (let i = 0; i < SMOKE_PUFF_COUNT; i += 1) {
    const offset = (i / SMOKE_PUFF_COUNT) * SMOKE_LIFETIME;
    const t = ((time + offset) % SMOKE_LIFETIME) / SMOKE_LIFETIME;
    const seed = i * 1.913;
    const dy = -t * 120 * zoom;
    const dx = Math.sin(time * 0.4 + seed) * 14 * zoom * t;
    const r = (3 + t * 6) * zoom;
    const aShape = t < 0.25 ? t / 0.25 : (1 - t) / 0.75;
    const alpha = peakBase * aShape;
    if (alpha < 0.005) continue;
    ctx.fillStyle = `rgba(28, 24, 30, ${alpha})`;
    ctx.beginPath();
    ctx.arc(point.x + dx, point.y - 18 * zoom + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const GOD_RAY_COUNT = 8;
const GOD_RAY_HALF_SPREAD = (3.5 * Math.PI) / 180;
const GOD_RAY_LENGTH = SWEEP_LENGTH * 0.62;
const GOD_RAY_BASE_ALPHA = 0.085;

export function drawLighthouseGodRays(
  ctx: CanvasRenderingContext2D,
  firePoint: ScreenPoint,
  beamZoom: number,
  motion: PharosVilleCanvasMotion,
  nightFactor: number,
) {
  if (nightFactor <= 0) return;
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const sweepAngle = motion.reducedMotion
    ? SWEEP_REDUCED_ANGLE
    : (time / SWEEP_PERIOD) * Math.PI * 2 + Math.sin((time / SWEEP_PERIOD) * Math.PI * 2) * 0.15;
  const length = GOD_RAY_LENGTH * beamZoom;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const armOffset of [0, Math.PI]) {
    for (let i = 0; i < GOD_RAY_COUNT; i += 1) {
      const t = (i + 0.5) / GOD_RAY_COUNT;
      const offset = (t - 0.5) * 2 * GOD_RAY_HALF_SPREAD;
      const breath = 0.78 + 0.22 * Math.sin(time * 0.35 + i * 1.31 + armOffset);
      const angle = sweepAngle + armOffset + offset;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const tipX = firePoint.x + cos * length;
      const tipY = firePoint.y + sin * length;
      const grad = ctx.createLinearGradient(firePoint.x, firePoint.y, tipX, tipY);
      const alpha = GOD_RAY_BASE_ALPHA * breath * nightFactor;
      grad.addColorStop(0, `rgba(255, 220, 150, ${alpha})`);
      grad.addColorStop(0.55, `rgba(245, 185, 105, ${alpha * 0.55})`);
      grad.addColorStop(1, "rgba(240, 160, 80, 0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(1, 2.2 * beamZoom);
      ctx.beginPath();
      ctx.moveTo(firePoint.x, firePoint.y);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawSweepEmberTrail(
  ctx: CanvasRenderingContext2D,
  firePoint: ScreenPoint,
  beamZoom: number,
  beamAngle: number,
  alphaScale: number,
) {
  if (alphaScale <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < TRAIL_PARTICLE_COUNT; i += 1) {
    const lag = TRAIL_LAG_RAD + (i / (TRAIL_PARTICLE_COUNT - 1)) * TRAIL_SPREAD_RAD;
    const angle = beamAngle - lag;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const nR = (i * 0.713) % 1;
    const nS = (i * 0.379) % 1;
    const dist = SWEEP_LENGTH * beamZoom * (0.55 + 0.35 * nR);
    const px = firePoint.x + cos * dist;
    const py = firePoint.y + sin * dist;
    const lifeFraction = i / (TRAIL_PARTICLE_COUNT - 1);
    const alpha = (1 - lifeFraction) * 0.42 * alphaScale;
    if (alpha < 0.01) continue;
    const radius = (1.4 + 0.6 * nS) * beamZoom;
    ctx.fillStyle = `rgba(255, 195, 110, ${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Distance-based ambient warm rim on ships near the lighthouse — replaces the
// old static-wedge rim. No angular check; the dual phase pulses synced to the
// sweep period give the rim a "the beam just passed" cadence anyway.
export function drawLighthouseBeamRim(
  input: DrawPharosVilleInput,
  visibleShips: readonly DrawPharosVilleInput["world"]["ships"][number][],
  cached: LighthouseRenderState | undefined,
  nightFactor: number,
) {
  if (nightFactor <= 0) return;
  const { camera, ctx, motion, world } = input;
  if (motion.reducedMotion) return;
  if (world.lighthouse.unavailable) return;

  const { firePoint } = cached ?? lighthouseRenderState(input);
  const time = motion.timeSeconds;
  const pulseA = 0.7 + 0.3 * Math.sin(time * (Math.PI * 2 / SWEEP_PERIOD) * 2);
  const pulseB = 0.7 + 0.3 * Math.sin(time * (Math.PI * 2 / SWEEP_PERIOD) * 2 + Math.PI);
  const rimRadius = RIM_RADIUS * camera.zoom * 1.35;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1, 1.6);

  for (const ship of visibleShips) {
    const sample = input.shipMotionSamples?.get(ship.id);
    const tile = sample?.tile ?? ship.tile;
    const screen = tileToScreen(tile, camera);
    const dx = screen.x - firePoint.x;
    const dy = screen.y - firePoint.y;
    const dist = Math.hypot(dx, dy);
    if (dist > rimRadius) continue;
    const falloff = 1 - dist / rimRadius;
    const pulse = dx >= 0 ? pulseA : pulseB;
    const alpha = falloff * pulse * RIM_PEAK_ALPHA * nightFactor;
    if (alpha < 0.02) continue;
    const shipScale = camera.zoom * ship.visual.scale * 0.7;
    const bboxWidth = 28 * shipScale;
    const bboxHeight = 28 * shipScale;
    const bboxX = screen.x - bboxWidth / 2;
    const bboxY = screen.y + 12 * camera.zoom - 30 * shipScale;
    const facingLeft = dx >= 0;
    ctx.strokeStyle = `rgba(255, 210, 140, ${alpha})`;
    ctx.beginPath();
    if (facingLeft) {
      ctx.moveTo(bboxX, bboxY);
      ctx.lineTo(bboxX, bboxY + bboxHeight);
    } else {
      ctx.moveTo(bboxX + bboxWidth, bboxY);
      ctx.lineTo(bboxX + bboxWidth, bboxY + bboxHeight);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawLighthouseNightHighlights(
  input: DrawPharosVilleInput,
  cached: LighthouseRenderState | undefined,
  nightFactor: number,
): void {
  if (nightFactor <= 0) return;
  if (input.world.lighthouse.unavailable) return;

  const { camera, ctx, motion } = input;
  const { firePoint } = cached ?? lighthouseRenderState(input);
  const zoom = camera.zoom;
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;

  const gradients = getNightGradientBundle(ctx, firePoint, zoom, nightFactor);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Wide diffuse fill — very low-alpha wash that gently illuminates the entire
  // island and surrounding water rather than blasting from the center.
  ctx.fillStyle = gradients.diffuse;
  ctx.beginPath();
  ctx.arc(firePoint.x, firePoint.y, 1500 * zoom, 0, Math.PI * 2);
  ctx.fill();

  // Core — softer and wider than before; just enough to read as a light source
  // without creating a blinding white hotspot on top of the diffuse wash.
  ctx.fillStyle = gradients.core;
  ctx.beginPath();
  ctx.arc(firePoint.x, firePoint.y, 68 * zoom, 0, Math.PI * 2);
  ctx.fill();

  const flickerSpeed = motion.plan.lighthouseFireFlickerPerSecond;
  const fireFlicker = motion.reducedMotion
    ? 0
    : Math.sin(time * 14 * flickerSpeed) * 0.12 + Math.sin(time * 21 * flickerSpeed) * 0.06;

  // Sweep beams — long, slow rotation, one or two arms 180° apart. The angle
  // is eased so it briefly accelerates through the cardinal sweep and slows
  // at each stop, mimicking a mirrored fire on a hand-cranked turntable.
  const beamZoom = zoom * 1.35;
  const sweepLen = SWEEP_LENGTH * beamZoom;
  const sweepApex = SWEEP_APEX_HALF * beamZoom;
  const sweepFar = SWEEP_FAR_HALF * beamZoom;
  let sweepAngle: number;
  let sweepAlpha: number;
  if (motion.reducedMotion) {
    sweepAngle = SWEEP_REDUCED_ANGLE;
    sweepAlpha = SWEEP_REDUCED_ALPHA * nightFactor;
  } else {
    const tCycle = time / SWEEP_PERIOD;
    sweepAngle = tCycle * Math.PI * 2 + Math.sin(tCycle * Math.PI * 2) * 0.15;
    sweepAlpha = (SWEEP_PEAK_ALPHA + fireFlicker * 0.06) * nightFactor;
  }
  const beamArms = SWEEP_PAIRED ? [0, Math.PI] : [0];
  const tip = hexToRgb(input.world.lighthouse.color);
  const beamSprite = getSweepBeamSprite(tip, beamZoom);
  for (const armOffset of beamArms) {
    const angle = sweepAngle + armOffset;
    if (beamSprite) {
      ctx.save();
      ctx.translate(firePoint.x, firePoint.y);
      ctx.rotate(angle);
      ctx.globalAlpha = sweepAlpha;
      ctx.drawImage(
        beamSprite.canvas,
        -beamSprite.apexX,
        -beamSprite.centerY,
        beamSprite.canvas.width,
        beamSprite.canvas.height,
      );
      ctx.restore();
    } else {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const px = -sin;
      const py = cos;

      const tipX = firePoint.x + cos * sweepLen;
      const tipY = firePoint.y + sin * sweepLen;
      const grad = ctx.createLinearGradient(firePoint.x, firePoint.y, tipX, tipY);
      grad.addColorStop(0, `rgba(255, 240, 195, ${sweepAlpha})`);
      grad.addColorStop(0.25, `rgba(255, 200, 110, ${sweepAlpha * 0.78})`);
      grad.addColorStop(0.65, `rgba(240, 140, 70, ${sweepAlpha * 0.36})`);
      grad.addColorStop(0.88, `rgba(${tip.r}, ${tip.g}, ${tip.b}, ${sweepAlpha * 0.22})`);
      grad.addColorStop(1, `rgba(${tip.r}, ${tip.g}, ${tip.b}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(firePoint.x + px * sweepApex, firePoint.y + py * sweepApex);
      ctx.lineTo(firePoint.x + cos * sweepLen + px * sweepFar, firePoint.y + sin * sweepLen + py * sweepFar);
      ctx.lineTo(firePoint.x + cos * sweepLen - px * sweepFar, firePoint.y + sin * sweepLen - py * sweepFar);
      ctx.lineTo(firePoint.x - px * sweepApex, firePoint.y - py * sweepApex);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Beam-tail water glints — small specks near the far end of each sweep arm,
  // moving with the rotation. Flicker is keyed off the same fire frequency so
  // they sparkle in time with the flame.
  for (let armIdx = 0; armIdx < beamArms.length; armIdx += 1) {
    const angle = sweepAngle + beamArms[armIdx]!;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const px = -sin;
    const py = cos;
    for (let i = 0; i < GLINT_ALONG.length; i += 1) {
      const along = GLINT_ALONG[i]!;
      const perp = GLINT_PERP_JITTER[i]! * beamZoom;
      const cx = firePoint.x + cos * sweepLen * along + px * perp;
      const cy = firePoint.y + sin * sweepLen * along + py * perp;
      const flicker = motion.reducedMotion
        ? 0.7
        : Math.max(0, Math.min(1, 0.5 + 0.5 * Math.sin(time * flickerSpeed * Math.PI * 2 + (armIdx * GLINT_ALONG.length + i) * 1.7)));
      ctx.fillStyle = `rgba(255, 225, 170, ${flicker * 0.55 * nightFactor})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 2 * beamZoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ember spark trails — particles lagging each sweep beam, fading with age.
  // The air "remembers" where the light just passed.
  if (!motion.reducedMotion) {
    for (const armOffset of beamArms) {
      drawSweepEmberTrail(ctx, firePoint, beamZoom, sweepAngle + armOffset, nightFactor);
    }
  }

  ctx.restore();

  // Warm water pool — centered slightly below firePoint, drawn with default
  // composite (source-over) so it warms the dark water without over-saturating.
  ctx.save();
  const poolY = firePoint.y + 36 * zoom;
  const poolRadius = NIGHT_WATER_POOL_RADIUS * zoom;
  ctx.fillStyle = gradients.pool;
  ctx.beginPath();
  ctx.ellipse(firePoint.x, poolY, poolRadius, poolRadius * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function getNightGradientBundle(
  ctx: CanvasRenderingContext2D,
  firePoint: ScreenPoint,
  zoom: number,
  nightFactor: number,
): NightGradientBundle {
  const key = `${firePoint.x | 0}:${firePoint.y | 0}:${(zoom * 100) | 0}:${(nightFactor * 20) | 0}`;
  const hit = nightGradientCache.get(key);
  if (hit) {
    nightGradientCache.delete(key);
    nightGradientCache.set(key, hit);
    return hit;
  }

  const diffuse = ctx.createRadialGradient(
    firePoint.x, firePoint.y, 60 * zoom,
    firePoint.x, firePoint.y, 1500 * zoom,
  );
  diffuse.addColorStop(0, `rgba(215, 210, 192, ${0.13 * nightFactor})`);
  diffuse.addColorStop(0.6, `rgba(190, 200, 180, ${0.045 * nightFactor})`);
  diffuse.addColorStop(1, "rgba(160, 180, 160, 0)");

  const coreAlpha = 0.17 * nightFactor;
  const core = ctx.createRadialGradient(
    firePoint.x, firePoint.y, 0,
    firePoint.x, firePoint.y, 68 * zoom,
  );
  core.addColorStop(0, `rgba(255, 255, 248, ${coreAlpha})`);
  core.addColorStop(0.4, `rgba(255, 248, 210, ${coreAlpha * 0.50})`);
  core.addColorStop(1, "rgba(255, 230, 150, 0)");

  const poolY = firePoint.y + 36 * zoom;
  const poolRadius = NIGHT_WATER_POOL_RADIUS * zoom;
  const poolAlpha = NIGHT_WATER_POOL_MAX_ALPHA * nightFactor;
  const pool = ctx.createRadialGradient(
    firePoint.x, poolY, 18 * zoom,
    firePoint.x, poolY, poolRadius,
  );
  pool.addColorStop(0, `rgba(255, 175, 90, ${poolAlpha})`);
  pool.addColorStop(0.4, `rgba(245, 150, 65, ${poolAlpha * 0.45})`);
  pool.addColorStop(1, "rgba(245, 150, 65, 0)");

  const bundle: NightGradientBundle = { diffuse, core, pool };
  nightGradientCache.set(key, bundle);
  if (nightGradientCache.size > NIGHT_GRADIENT_CACHE_LIMIT) {
    const oldest = nightGradientCache.keys().next().value;
    if (oldest !== undefined) nightGradientCache.delete(oldest);
  }
  return bundle;
}
