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

const NIGHT_HALO_OUTER_RADIUS = 760;       // sprite units — additive halo at firePoint
const NIGHT_HALO_MAX_ALPHA = 0.7;
const NIGHT_WATER_POOL_RADIUS = 640;       // sprite units — warm pool centered slightly below firePoint
const NIGHT_WATER_POOL_MAX_ALPHA = 0.42;

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
  // Beams fade with nightFactor (see drawLighthouseBeam); the night halo
  // takes over the visual footprint. Reach contracts with darkness.
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
  drawLighthouseFire(ctx, firePoint, camera.zoom * 1.32, world.lighthouse.color, motion, !lighthouseAsset);
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

function drawLighthouseFire(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  psiColor: string,
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
  if (motion.reducedMotion) {
    drawPixelFlame(ctx, FLAME_OUTER, psiColor);
    drawPixelFlame(ctx, FLAME_MID, "#ffcc62");
    drawPixelFlame(ctx, FLAME_INNER, "#fff2a8");
  } else {
    drawLivingFlame(ctx, FLAME_OUTER, psiColor, time, flickerSpeed, 1.7);
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

  drawHearthEmbers(ctx, point, zoom, psiColor, motion);
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

function drawHearthEmbers(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  psiColor: string,
  motion: PharosVilleCanvasMotion,
) {
  if (motion.reducedMotion) {
    ctx.save();
    ctx.fillStyle = psiColor;
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
  ctx.fillStyle = psiColor;
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

export function drawLighthouseBeamRim(
  input: DrawPharosVilleInput,
  visibleShips: readonly DrawPharosVilleInput["world"]["ships"][number][],
  cached: LighthouseRenderState | undefined,
  nightFactor: number,
) {
  // Rim highlight is active for both day beams (warm) and night beams (cool-white).
  const dayRimAlpha = 0.5 * (1 - nightFactor);
  const nightRimAlpha = 0.8 * nightFactor;
  const rimAlpha = Math.max(dayRimAlpha, nightRimAlpha);
  if (rimAlpha <= 0) return;
  const { camera, ctx, motion, world } = input;
  if (motion.reducedMotion) return;
  if (world.lighthouse.unavailable) return;

  const { firePoint } = cached ?? lighthouseRenderState(input);
  const beamZoom = camera.zoom * 1.35;
  const wedges = [
    {
      apex: { x: firePoint.x + 4 * beamZoom, y: firePoint.y - 2 * beamZoom },
      a: { x: firePoint.x + 250 * beamZoom, y: firePoint.y - 74 * beamZoom },
      b: { x: firePoint.x + 228 * beamZoom, y: firePoint.y + 28 * beamZoom },
    },
    {
      apex: { x: firePoint.x - 5 * beamZoom, y: firePoint.y },
      a: { x: firePoint.x - 168 * beamZoom, y: firePoint.y - 42 * beamZoom },
      b: { x: firePoint.x - 154 * beamZoom, y: firePoint.y + 25 * beamZoom },
    },
  ];

  ctx.save();
  ctx.globalAlpha = rimAlpha;
  ctx.strokeStyle = nightFactor > 0.5 ? "rgba(255, 210, 140, 1)" : world.lighthouse.color;
  ctx.lineWidth = Math.max(1, 2);
  ctx.lineCap = "round";

  for (const ship of visibleShips) {
    const sample = input.shipMotionSamples?.get(ship.id);
    const tile = sample?.tile ?? ship.tile;
    const screen = tileToScreen(tile, camera);
    const shipScale = camera.zoom * ship.visual.scale * 0.7;
    // Approximate sail bbox: sits above the ship anchor, ~28×28 sprite-units.
    const bboxWidth = 28 * shipScale;
    const bboxHeight = 28 * shipScale;
    const bboxX = screen.x - bboxWidth / 2;
    const bboxY = screen.y + 12 * camera.zoom - 30 * shipScale;
    const corners = [
      { x: bboxX, y: bboxY },
      { x: bboxX + bboxWidth, y: bboxY },
      { x: bboxX, y: bboxY + bboxHeight },
      { x: bboxX + bboxWidth, y: bboxY + bboxHeight },
    ];

    let intersectingWedge: typeof wedges[number] | null = null;
    for (const wedge of wedges) {
      if (corners.some((corner) => pointInTriangle(corner, wedge.apex, wedge.a, wedge.b))) {
        intersectingWedge = wedge;
        break;
      }
    }
    if (!intersectingWedge) continue;

    // Brighten the bbox edge nearest the beam apex.
    const apex = intersectingWedge.apex;
    const dxLeft = Math.abs(apex.x - bboxX);
    const dxRight = Math.abs(apex.x - (bboxX + bboxWidth));
    ctx.beginPath();
    if (dxLeft <= dxRight) {
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

function pointInTriangle(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): boolean {
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function sign(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  return (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
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

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Wide diffuse fill — very low-alpha wash that gently illuminates the entire
  // island and surrounding water rather than blasting from the center.
  const diffuse = ctx.createRadialGradient(
    firePoint.x, firePoint.y, 60 * zoom,
    firePoint.x, firePoint.y, 1000 * zoom,
  );
  diffuse.addColorStop(0, `rgba(215, 210, 192, ${0.14 * nightFactor})`);
  diffuse.addColorStop(0.6, `rgba(190, 200, 180, ${0.07 * nightFactor})`);
  diffuse.addColorStop(1, "rgba(160, 180, 160, 0)");
  ctx.fillStyle = diffuse;
  ctx.beginPath();
  ctx.arc(firePoint.x, firePoint.y, 1000 * zoom, 0, Math.PI * 2);
  ctx.fill();

  // Core — softer and wider than before; just enough to read as a light source
  // without creating a blinding white hotspot on top of the halo.
  const coreAlpha = 0.17 * nightFactor;
  const core = ctx.createRadialGradient(
    firePoint.x, firePoint.y, 0,
    firePoint.x, firePoint.y, 68 * zoom,
  );
  core.addColorStop(0, `rgba(255, 255, 248, ${coreAlpha})`);
  core.addColorStop(0.4, `rgba(255, 248, 210, ${coreAlpha * 0.50})`);
  core.addColorStop(1, "rgba(255, 230, 150, 0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(firePoint.x, firePoint.y, 68 * zoom, 0, Math.PI * 2);
  ctx.fill();

  // Night beam cones — warm firelight cast down the wedges so they read as
  // ember-glow streaming from the brazier rather than Fresnel-lens beams.
  // Pulse is tied to the same flicker pair drawLighthouseFire uses, so the
  // beams visibly breathe with the flame.
  const flickerSpeed = motion.plan.lighthouseFireFlickerPerSecond;
  const fireFlicker = motion.reducedMotion
    ? 0
    : Math.sin(time * 14 * flickerSpeed) * 0.12 + Math.sin(time * 21 * flickerSpeed) * 0.06;
  const beamPulse = 0.26 + fireFlicker * 0.55;
  const beamAlpha = beamPulse * nightFactor;

  // Right beam
  const rg = ctx.createLinearGradient(
    firePoint.x, firePoint.y,
    firePoint.x + 240 * zoom, firePoint.y - 23 * zoom,
  );
  rg.addColorStop(0, `rgba(255, 232, 170, ${beamAlpha})`);
  rg.addColorStop(0.45, `rgba(255, 165, 80, ${beamAlpha * 0.55})`);
  rg.addColorStop(1, `rgba(190, 70, 30, 0)`);
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(firePoint.x + 4 * zoom, firePoint.y - 2 * zoom);
  ctx.lineTo(firePoint.x + 250 * zoom, firePoint.y - 74 * zoom);
  ctx.lineTo(firePoint.x + 228 * zoom, firePoint.y + 28 * zoom);
  ctx.closePath();
  ctx.fill();

  // Left beam
  const lg = ctx.createLinearGradient(
    firePoint.x, firePoint.y,
    firePoint.x - 158 * zoom, firePoint.y - 9 * zoom,
  );
  lg.addColorStop(0, `rgba(255, 232, 170, ${beamAlpha})`);
  lg.addColorStop(0.45, `rgba(255, 165, 80, ${beamAlpha * 0.55})`);
  lg.addColorStop(1, `rgba(190, 70, 30, 0)`);
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.moveTo(firePoint.x - 5 * zoom, firePoint.y);
  ctx.lineTo(firePoint.x - 168 * zoom, firePoint.y - 42 * zoom);
  ctx.lineTo(firePoint.x - 154 * zoom, firePoint.y + 25 * zoom);
  ctx.closePath();
  ctx.fill();

  // Water reflection shimmers — warm gold glints under each beam path,
  // breathing with the same flicker so the water under the lighthouse
  // looks lit by firelight rather than moonlight.
  const shimAlpha = (0.32 + fireFlicker * 0.4) * nightFactor;

  ctx.save();
  ctx.translate(firePoint.x + 122 * zoom, firePoint.y + 12 * zoom);
  ctx.rotate(-0.09);
  const rs = ctx.createRadialGradient(0, 0, 6 * zoom, 0, 0, 164 * zoom);
  rs.addColorStop(0, `rgba(255, 195, 110, ${shimAlpha})`);
  rs.addColorStop(1, `rgba(255, 165, 80, 0)`);
  ctx.fillStyle = rs;
  ctx.beginPath();
  ctx.ellipse(0, 0, 164 * zoom, 34 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(firePoint.x - 82 * zoom, firePoint.y + 10 * zoom);
  ctx.rotate(0.06);
  const ls = ctx.createRadialGradient(0, 0, 6 * zoom, 0, 0, 132 * zoom);
  ls.addColorStop(0, `rgba(255, 195, 110, ${shimAlpha})`);
  ls.addColorStop(1, `rgba(255, 165, 80, 0)`);
  ctx.fillStyle = ls;
  ctx.beginPath();
  ctx.ellipse(0, 0, 132 * zoom, 28 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Warm halo — reduced intensity now that the diffuse fill carries the broader
  // scene illumination; 0.58 factor keeps warmth near the tower without stacking
  // too much additive light on top of the core and beams.
  const haloRadius = NIGHT_HALO_OUTER_RADIUS * zoom;
  const haloAlpha = NIGHT_HALO_MAX_ALPHA * 0.32 * nightFactor;
  const halo = ctx.createRadialGradient(
    firePoint.x, firePoint.y, 12 * zoom,
    firePoint.x, firePoint.y, haloRadius,
  );
  halo.addColorStop(0, `rgba(255, 220, 130, ${haloAlpha})`);
  halo.addColorStop(0.4, `rgba(255, 180, 80, ${haloAlpha * 0.38})`);
  halo.addColorStop(1, "rgba(255, 160, 60, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(firePoint.x, firePoint.y, haloRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Warm water pool — centered slightly below firePoint, drawn with default
  // composite (source-over) so it warms the dark water without over-saturating.
  ctx.save();
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
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(firePoint.x, poolY, poolRadius, poolRadius * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
