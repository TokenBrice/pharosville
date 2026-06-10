import type { ShipMotionSample } from "../../../systems/motion";
import { getShipHeadingDelta } from "../../../systems/motion-sampling";
import type { PharosVilleWorld, ShipHull, ShipWaterZone } from "../../../systems/world-types";
import { stableVisualVariant } from "../../canvas-primitives";
import { createStatsLruCache } from "../../lru-cache";
import type { DrawPharosVilleInput } from "../../render-types";
import { SHIP_CONTINUOUS_MOTION } from "../../ship-visual-config";
import { SHIP_CHROME_MIN_ZOOM } from "../../visual-scales";
import type { ShipPose } from "../ship-pose";
import { skyState } from "../sky";
import {
  clamp,
  isTopRecentMoverShip,
  shipRenderState,
  withShipMapVisibilityAlpha,
  type ShipRenderFrame,
} from "./draw-ship";

// === Titan procedural path cache ============================================
//
// W1.04: caches Path2D templates for the procedural titan chrome (hull foam,
// bow-spray strands, stern churn, mooring rope/fender/shadow). Each template
// is built once at unit scale + heading-snapped to a 32-bucket grid; per
// draw we apply ctx.translate(x, y) + ctx.scale(scale, scale) + stroke/fill
// of the cached path. Hit rate in steady state approaches 100% for moored
// titans (heading = dockTangent is constant) and stays > 99% for moving
// titans (heading drifts slowly relative to the 11.25° bucket width).
//
// Visual drift: bucketing snaps the heading to the nearest of 32 angles,
// producing at most ~1.2px screen-space drift at the foam tip (a 25px
// extent). Empirically below the test:visual diff thresholds; reduced-motion
// baselines see the bit-identical bucketed path on every render.
const TITAN_PATH_HEADING_BUCKETS = 32;
const TITAN_PATH_TENSION_BUCKETS = 8;
const TITAN_PATH_CACHE_MAX = 512;

export interface TitanPathCacheStats {
  entryCount: number;
  evictionCount: number;
  hitCount: number;
  maxEntries: number;
  missCount: number;
}

const titanPathCache = createStatsLruCache<string, Path2D>(TITAN_PATH_CACHE_MAX);

/**
 * Returns hit/miss/eviction counters for the titan procedural path cache.
 */
export function titanPathCacheStats(): TitanPathCacheStats {
  const stats = titanPathCache.stats();
  return {
    entryCount: stats.size,
    evictionCount: stats.evictions,
    hitCount: stats.hits,
    maxEntries: stats.capacity,
    missCount: stats.misses,
  };
}

/**
 * @internal Test hook to drop the titan path cache between cases.
 */
export function resetTitanPathCache(): void {
  titanPathCache.reset();
}

interface QuantizedHeading {
  bucket: number;
  fx: number;
  fy: number;
}

function quantizeTitanHeading(hx: number, hy: number): QuantizedHeading {
  const mag = Math.sqrt(hx * hx + hy * hy);
  // Match the legacy fallback: zero-vector → bow pointing left.
  const fxRaw = mag > 0 ? hx / mag : -1;
  const fyRaw = mag > 0 ? hy / mag : 0;
  let angle = Math.atan2(fyRaw, fxRaw);
  if (angle < 0) angle += Math.PI * 2;
  const step = (Math.PI * 2) / TITAN_PATH_HEADING_BUCKETS;
  const bucket = Math.round(angle / step) % TITAN_PATH_HEADING_BUCKETS;
  const snappedAngle = bucket * step;
  return { bucket, fx: Math.cos(snappedAngle), fy: Math.sin(snappedAngle) };
}

function quantizeTitanTension(tension: number): { bucket: number; value: number } {
  const clamped = Math.max(0, Math.min(1, tension));
  const bucket = Math.round(clamped * (TITAN_PATH_TENSION_BUCKETS - 1));
  return { bucket, value: bucket / (TITAN_PATH_TENSION_BUCKETS - 1) };
}

// === V1.4 hull-chrome tiers =================================================
//
// Heritage (unique) and standard hulls reuse the titan procedural chrome at
// reduced geometry and alpha so the whole fleet sits *in* the water instead
// of floating like flat decals. The cached unit-scale Path2D templates are
// shared across tiers — the tier factor rides the existing ctx.scale — so
// tiering adds zero path-cache cardinality. Draw cost stays LOD-bounded:
// this code path only runs for wake-budgeted ships
// (`planShipRenderLod().drawWakeShipIds`), so dense scenes shed standard
// chrome exactly like wakes. Standard hulls additionally respect the
// SHIP_CHROME_MIN_ZOOM disclosure gate so far-zoom views stay clean.
interface HullChromeTier {
  foamAlphaBase: number;
  foamAlphaPose: number;
  geometryScale: number;
  mooringDetails: boolean;
  sprayStrandLimit: number;
}

const HULL_CHROME_TIERS: Record<"standard" | "titan" | "unique", HullChromeTier> = {
  standard: { foamAlphaBase: 0.07, foamAlphaPose: 0.12, geometryScale: 0.68, mooringDetails: false, sprayStrandLimit: 1 },
  titan: { foamAlphaBase: 0.12, foamAlphaPose: 0.18, geometryScale: 1, mooringDetails: true, sprayStrandLimit: Number.POSITIVE_INFINITY },
  unique: { foamAlphaBase: 0.1, foamAlphaPose: 0.15, geometryScale: 0.85, mooringDetails: true, sprayStrandLimit: 2 },
};

export function drawShipWakeRaw(input: DrawPharosVilleInput, frame: ShipRenderFrame, ship: PharosVilleWorld["ships"][number]) {
  const { camera, ctx, motion } = input;
  const {
    drawsWake,
    geometry,
    isTitanSprite,
    isUniqueSprite,
    mapVisibilityAlpha,
    p,
    pose,
    sample,
    selected,
  } = shipRenderState(input, frame, ship);
  const chrome = HULL_CHROME_TIERS[isTitanSprite ? "titan" : isUniqueSprite ? "unique" : "standard"];
  const drawsHullChrome = isTitanSprite || isUniqueSprite || camera.zoom >= SHIP_CHROME_MIN_ZOOM;
  const chromeScale = geometry.drawScale * chrome.geometryScale;
  withShipMapVisibilityAlpha(ctx, mapVisibilityAlpha, () => {
    drawShipContactShadow(ctx, geometry.drawPoint.x, geometry.drawPoint.y, geometry.drawScale);
    if (drawsHullChrome) {
      drawHullFoam(
        ctx,
        geometry.drawPoint.x,
        geometry.drawPoint.y,
        chromeScale,
        pose,
        sample?.heading ?? { x: -1, y: 0 },
        sample?.zone ?? ship.riskZone,
        chrome,
      );
      if (chrome.mooringDetails && sample?.state === "moored" && sample.currentDockId) {
        drawTitanMooringDetails(ctx, geometry.drawPoint.x, geometry.drawPoint.y, chromeScale, pose);
      }
    }
    if (drawsWake) {
      const changeIntensity = Math.min(1, Math.abs(ship.change24hPct ?? 0) * 18 + 0.2);
      const sampleIntensity = sample?.wakeIntensity ?? 0;
      const intensity = Math.max(sampleIntensity, motion.plan.moverShipIds.has(ship.id) ? changeIntensity : 0);
      // E2: wakeMultiplier (0.85–1.6 from the route, populated from
      // change24hPct at plan-build) modulates wake stroke *width*, not alpha.
      // The alpha formula `0.22 + intensity × style.alphaScale` has alphaScale
      // 0.10–0.22 by zone, so a 1.5× multiplier on intensity moves alpha by
      // ~3% — invisible. Threading the multiplier into lineWidth produces a
      // visibly thicker wake for high-mover ships at any zoom.
      const wakeMultiplier = motion.plan.shipRoutes.get(ship.id)?.wakeMultiplier ?? 1;
      const heading = sample?.heading ?? { x: -1, y: 0 };
      const zone = sample?.zone ?? ship.riskZone;
      const wakeX = p.x;
      const wakeY = p.y + 8 * camera.zoom;
      drawWake(ctx, wakeX, wakeY, camera.zoom, intensity, heading, zone, wakeMultiplier, ship.visual.hull);
      const { nightFactor } = skyState(motion);
      drawNightWakeGlow(ctx, wakeX, wakeY, camera.zoom, intensity, heading, nightFactor, wakeMultiplier, ship.visual.hull);
      if (selected || motion.plan.effectShipIds.has(ship.id) || motion.plan.moverShipIds.has(ship.id) || isTopRecentMoverShip(input.world, ship.id)) {
        drawTrailingWake(ctx, {
          heading,
          hull: ship.visual.hull,
          intensity,
          sample,
          shipId: ship.id,
          wakeMultiplier,
          x: wakeX,
          y: wakeY,
          zone,
          zoom: camera.zoom,
        });
      }
      if (drawsHullChrome && chrome.sprayStrandLimit > 0) {
        drawTitanBowSpray(
          ctx,
          geometry.drawPoint.x,
          geometry.drawPoint.y,
          chromeScale,
          pose,
          ship.id,
          sample?.heading ?? { x: -1, y: 0 },
          sample?.zone ?? ship.riskZone,
          isTopRecentMoverShip(input.world, ship.id),
          chrome.sprayStrandLimit,
        );
      }
    }
  });
}

function drawShipContactShadow(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.fillStyle = "rgba(3, 7, 10, 0.34)";
  ctx.beginPath();
  ctx.ellipse(x, y - 1 * scale, 28 * scale, 7.5 * scale, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(169, 224, 213, 0.12)";
  ctx.lineWidth = Math.max(1, 1.1 * scale);
  ctx.beginPath();
  ctx.moveTo(x - 25 * scale, y + 2 * scale);
  ctx.lineTo(x + 20 * scale, y + 3.5 * scale);
  ctx.stroke();
  ctx.restore();
}

function drawHullFoam(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  pose: ShipPose,
  heading: { x: number; y: number },
  zone: ShipWaterZone,
  chrome: HullChromeTier,
) {
  const style = wakeStyleForZone(zone);
  const { bucket, fx, fy } = quantizeTitanHeading(heading.x, heading.y);
  const alpha = chrome.foamAlphaBase + pose.bowWake * chrome.foamAlphaPose + pose.mooringTension * 0.08;
  const path = titanPathCache.getOrBuild(`foam:${bucket}`, () => buildTitanFoamPath(fx, fy));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  ctx.strokeStyle = wakeRgba(style, alpha);
  // ctx.lineWidth is in the current user-space units. Because we applied
  // `ctx.scale(scale, scale)` above, an on-screen width of
  // `max(1, 1.15 * scale)` requires `max(1/scale, 1.15)` in unit space.
  ctx.lineWidth = Math.max(1 / scale, 1.15);
  ctx.stroke(path);
  ctx.restore();
}

function buildTitanFoamPath(fx: number, fy: number): Path2D {
  const cx = -fy;
  const cy = fx;
  const path = new Path2D();
  for (const side of [-1, 1] as const) {
    path.moveTo(
      -fx * 3 + cx * side * 25,
      4 - fy * 3 + cy * side * 25,
    );
    path.quadraticCurveTo(
      fx * 10 + cx * side * 18,
      7 + fy * 10 + cy * side * 18,
      fx * 19 + cx * side * 8,
      4 + fy * 19 + cy * side * 8,
    );
  }
  return path;
}

// Mooring rope geometry: each tuple is [x0, y0, x1, y1] in unit-scale local
// coords. The rope mid-control y is shifted by `tension * 2.5` to draw the
// sag, so the path itself depends on the tension bucket.
const TITAN_MOORING_ROPES = [
  [-42, -14, -66, -2],
  [36, -12, 58, -1],
] as const;

function drawTitanMooringDetails(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  pose: ShipPose,
) {
  const tension = pose.mooringTension;
  const tensionBucket = quantizeTitanTension(tension);
  const shadowPath = titanPathCache.getOrBuild("mooring:shadow", buildTitanMooringShadowPath);
  const fenderPath = titanPathCache.getOrBuild("mooring:fenders", buildTitanMooringFenderPath);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = `rgba(2, 6, 8, ${0.16 + tension * 0.12})`;
  ctx.fill(shadowPath);

  ctx.lineCap = "round";
  ctx.strokeStyle = `rgba(232, 205, 145, ${0.32 + tension * 0.2})`;
  // ctx.scale applied above; convert legacy `max(1, 1.1 * scale)` screen
  // width into unit-space lineWidth.
  ctx.lineWidth = Math.max(1 / scale, 1.1);
  for (let ropeIndex = 0; ropeIndex < TITAN_MOORING_ROPES.length; ropeIndex += 1) {
    const ropePath = titanPathCache.getOrBuild(
      `mooring:rope:${ropeIndex}:${tensionBucket.bucket}`,
      () => buildTitanMooringRopePath(TITAN_MOORING_ROPES[ropeIndex]!, tensionBucket.value),
    );
    ctx.stroke(ropePath);
  }

  ctx.fillStyle = "rgba(231, 225, 198, 0.78)";
  ctx.fill(fenderPath);
  ctx.restore();
}

function buildTitanMooringShadowPath(): Path2D {
  const path = new Path2D();
  path.ellipse(-4, 4, 46, 9, -0.08, 0, Math.PI * 2);
  return path;
}

function buildTitanMooringRopePath(rope: readonly [number, number, number, number], tension: number): Path2D {
  const [x0, y0, x1, y1] = rope;
  const path = new Path2D();
  path.moveTo(x0, y0);
  path.quadraticCurveTo(
    (x0 + x1) / 2,
    (y0 + y1) / 2 + tension * 2.5,
    x1,
    y1,
  );
  return path;
}

function buildTitanMooringFenderPath(): Path2D {
  const path = new Path2D();
  for (const fenderX of [-34, 31] as const) {
    // Each ellipse spans 0..2π and closes itself, so two non-overlapping
    // ellipses in one path fill as two separate blobs (same as the original
    // beginPath-per-fender + fill sequence). The leading `moveTo` makes the
    // subpath split explicit so any future stroke wouldn't connect them.
    path.moveTo(fenderX + 3.2 * Math.cos(0.14), -1 + 3.2 * Math.sin(0.14));
    path.ellipse(fenderX, -1, 3.2, 6.8, 0.14, 0, Math.PI * 2);
  }
  return path;
}

function drawTitanBowSpray(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  pose: ShipPose,
  shipId: string,
  heading: { x: number; y: number },
  zone: ShipWaterZone,
  topRecentMover: boolean,
  strandLimit: number = Number.POSITIVE_INFINITY,
) {
  if (pose.bowWake <= 0.02 && pose.sternChurn <= 0.02) return;
  const style = wakeStyleForZone(zone);
  const { bucket, fx, fy } = quantizeTitanHeading(heading.x, heading.y);
  const baseAlpha = 0.16 + pose.bowWake * 0.24;
  const allStrands = resolveTitanBowSprayStrands({
    headingDelta: getShipHeadingDelta(shipId),
    shipId,
    topRecentMover,
  });
  // V1.4: lower chrome tiers draw a subset of the strand set; the cache key
  // is per strand so partial draws reuse the same Path2D templates.
  const strands = Number.isFinite(strandLimit) ? allStrands.slice(0, Math.max(0, strandLimit)) : allStrands;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  // Unit-space lineWidth that preserves the legacy `max(1, 1.05 * scale)`
  // screen-pixel width after ctx.scale.
  ctx.lineWidth = Math.max(1 / scale, 1.05);
  for (const strand of strands) {
    const strandPath = titanPathCache.getOrBuild(
      `spray:strand:${bucket}:${strand.side}:${strand.spread}:${strand.start}:${strand.length}`,
      () => buildTitanBowSprayStrandPath(fx, fy, strand),
    );
    ctx.strokeStyle = wakeRgba(style, baseAlpha * strand.alphaScale);
    ctx.stroke(strandPath);
  }

  // Stern churn stays a two-tier-and-up flourish (titan + unique).
  if (strandLimit >= 2 && pose.sternChurn > 0.05) {
    const sternPath = titanPathCache.getOrBuild(
      `spray:stern:${bucket}`,
      () => buildTitanSternChurnPath(fx, fy),
    );
    ctx.strokeStyle = wakeRgba(style, 0.12 + pose.sternChurn * 0.2);
    ctx.lineWidth = Math.max(1 / scale, 1);
    ctx.stroke(sternPath);
  }
  ctx.restore();
}

function buildTitanBowSprayStrandPath(fx: number, fy: number, strand: TitanBowSprayStrand): Path2D {
  const cx = -fy;
  const cy = fx;
  const spread = strand.spread * strand.side;
  const start = strand.start;
  const length = strand.length;
  const path = new Path2D();
  path.moveTo(fx * start + cx * spread, 2 + fy * start + cy * spread);
  path.lineTo(
    fx * (start + length) + cx * spread * 1.7,
    2 + fy * (start + length) + cy * spread * 1.7,
  );
  return path;
}

function buildTitanSternChurnPath(fx: number, fy: number): Path2D {
  const cx = -fy;
  const cy = fx;
  const path = new Path2D();
  path.moveTo(-fx * 34 - cx * 10, 6 - fy * 34 - cy * 10);
  path.lineTo(-fx * 48 - cx * 15, 8 - fy * 48 - cy * 15);
  path.moveTo(-fx * 34 + cx * 10, 6 - fy * 34 + cy * 10);
  path.lineTo(-fx * 48 + cx * 15, 8 - fy * 48 + cy * 15);
  return path;
}

export interface TitanBowSprayStrand {
  alphaScale: number;
  length: number;
  side: -1 | 1;
  spread: number;
  start: number;
}

export function resolveTitanBowSprayStrands(input: {
  headingDelta: number;
  shipId: string;
  topRecentMover: boolean;
}): readonly TitanBowSprayStrand[] {
  const outerSide = titanOuterRailSide(input.shipId, input.headingDelta);
  const strands: TitanBowSprayStrand[] = [
    titanBowSprayStrand({ side: 1, spread: 5, start: 24 }, outerSide),
    titanBowSprayStrand({ side: -1, spread: 9, start: 27 }, outerSide),
    titanBowSprayStrand({ side: 1, spread: 13, start: 30 }, outerSide),
  ];
  if (input.topRecentMover) {
    strands.push(titanBowSprayStrand({ side: outerSide, spread: 17, start: 33, length: 14 }, outerSide));
  }
  return strands;
}

function titanBowSprayStrand(
  base: { length?: number; side: -1 | 1; spread: number; start: number },
  outerSide: -1 | 1,
): TitanBowSprayStrand {
  const outer = base.side === outerSide;
  return {
    alphaScale: outer ? 1.2 : 0.7,
    length: (base.length ?? 12) * (outer ? 1.5 : 1),
    side: base.side,
    spread: base.spread,
    start: base.start,
  };
}

function titanOuterRailSide(shipId: string, headingDelta: number): -1 | 1 {
  if (Number.isFinite(headingDelta) && Math.abs(headingDelta) >= 0.015) {
    return headingDelta > 0 ? 1 : -1;
  }
  return stableVisualVariant(`${shipId}:titan-bow-spray-side`) % 2 === 0 ? 1 : -1;
}

function drawWake(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  intensity: number,
  heading: { x: number; y: number },
  zone: ShipWaterZone,
  wakeMultiplier: number = 1,
  hull: ShipHull = "crypto-caravel",
) {
  const style = wakeStyleForZone(zone);
  const personality = wakePersonalityForHull(hull);
  const headingMagnitude = Math.sqrt(heading.x * heading.x + heading.y * heading.y);
  const fx = headingMagnitude > 0 ? heading.x / headingMagnitude : -1;
  const fy = headingMagnitude > 0 ? heading.y / headingMagnitude : 0;
  const wx = -fx;
  const wy = -fy;
  const cx = -fy;
  const cy = fx;
  ctx.save();
  ctx.strokeStyle = wakeRgba(style, (0.22 + intensity * style.alphaScale) * personality.alphaScale);
  ctx.lineWidth = Math.max(1, zoom * style.lineScale * wakeMultiplier * personality.lineScale);
  for (let index = 0; index < 3; index += 1) {
    const strand = wakeStrandModifier(personality, index);
    const offset = index * style.spacing * zoom * personality.spacingScale * strand.spacingScale;
    const baseDistance = (14 + offset) * zoom;
    const spread = (style.spread + index * style.spreadStep) * zoom * personality.spreadScale * strand.spreadScale;
    const length = (style.length + index * style.lengthStep) * zoom * personality.lengthScale * strand.lengthScale;
    ctx.beginPath();
    ctx.moveTo(
      x + wx * baseDistance + cx * spread,
      y + wy * baseDistance + cy * spread,
    );
    ctx.lineTo(
      x + wx * (baseDistance + length) + cx * spread * 1.45,
      y + wy * (baseDistance + length) + cy * spread * 1.45,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawTrailingWake(
  ctx: CanvasRenderingContext2D,
  input: {
    heading: { x: number; y: number };
    hull: ShipHull;
    intensity: number;
    sample: ShipMotionSample | null;
    shipId: string;
    wakeMultiplier: number;
    x: number;
    y: number;
    zone: ShipWaterZone;
    zoom: number;
  },
) {
  const speedRatio = sampleSpeedRatio(input.sample);
  const trailIntensity = clamp(input.intensity * (0.72 + speedRatio * 0.28), 0, 1.2);
  if (trailIntensity < SHIP_CONTINUOUS_MOTION.trailingWakeMinIntensity) return;
  const headingMagnitude = Math.sqrt(input.heading.x * input.heading.x + input.heading.y * input.heading.y);
  const fx = headingMagnitude > 0 ? input.heading.x / headingMagnitude : -1;
  const fy = headingMagnitude > 0 ? input.heading.y / headingMagnitude : 0;
  const wx = -fx;
  const wy = -fy;
  const cx = -fy;
  const cy = fx;
  const style = wakeStyleForZone(input.zone);
  const personality = wakePersonalityForHull(input.hull);
  const variant = stableVisualVariant(`${input.shipId}:trailing-wake`);
  const sideBias = variant % 2 === 0 ? 1 : -1;
  const phase = (variant % 11) * 0.17;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1, input.zoom * 0.74 * input.wakeMultiplier * personality.lineScale);
  for (let index = 0; index < SHIP_CONTINUOUS_MOTION.trailingWakeSegmentCount; index += 1) {
    const t = index / SHIP_CONTINUOUS_MOTION.trailingWakeSegmentCount;
    const fade = 1 - t;
    const baseDistance = (22 + index * SHIP_CONTINUOUS_MOTION.trailingWakeSpacingPixels * (0.85 + speedRatio * 0.22))
      * input.zoom
      * personality.spacingScale;
    const lateral = (Math.sin(phase + index * 1.7) * 2.2 + sideBias * (2 + index * 0.85))
      * input.zoom
      * personality.spreadScale;
    const length = (7 + speedRatio * 8 + index * 2.4)
      * input.zoom
      * personality.lengthScale;
    ctx.strokeStyle = wakeRgba(style, (0.09 + trailIntensity * 0.12) * fade * personality.alphaScale);
    ctx.beginPath();
    ctx.moveTo(
      input.x + wx * baseDistance + cx * lateral,
      input.y + wy * baseDistance + cy * lateral,
    );
    ctx.lineTo(
      input.x + wx * (baseDistance + length) + cx * lateral * 1.18,
      input.y + wy * (baseDistance + length) + cy * lateral * 1.18,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawNightWakeGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  intensity: number,
  heading: { x: number; y: number },
  nightFactor: number,
  wakeMultiplier: number = 1,
  hull: ShipHull = "crypto-caravel",
) {
  if (nightFactor <= 0) return;
  const personality = wakePersonalityForHull(hull);
  const headingMagnitude = Math.sqrt(heading.x * heading.x + heading.y * heading.y);
  const fx = headingMagnitude > 0 ? heading.x / headingMagnitude : -1;
  const fy = headingMagnitude > 0 ? heading.y / headingMagnitude : 0;
  const wx = -fx;
  const wy = -fy;
  const cx = -fy;
  const cy = fx;
  const glowAlpha = (0.14 + intensity * 0.18) * nightFactor;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(80, 215, 195, ${Math.min(0.45, glowAlpha * personality.alphaScale)})`;
  ctx.lineWidth = Math.max(1, zoom * 1.4 * wakeMultiplier * personality.lineScale);
  ctx.lineCap = "round";
  for (let index = 0; index < 3; index += 1) {
    const strand = wakeStrandModifier(personality, index);
    const offset = index * 6 * zoom * personality.spacingScale * strand.spacingScale;
    const baseDistance = (14 + offset) * zoom;
    const spread = (4 + index * 2) * zoom * personality.spreadScale * strand.spreadScale;
    const length = (10 + index * 3) * zoom * personality.lengthScale * strand.lengthScale;
    ctx.beginPath();
    ctx.moveTo(
      x + wx * baseDistance + cx * spread,
      y + wy * baseDistance + cy * spread,
    );
    ctx.lineTo(
      x + wx * (baseDistance + length) + cx * spread * 1.45,
      y + wy * (baseDistance + length) + cy * spread * 1.45,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function sampleSpeedRatio(sample: ShipMotionSample | null): number {
  if (!sample) return 0;
  const optional = sample as ShipMotionSample & {
    speedRatio?: number;
    speedTilesPerSecond?: number;
    velocity?: { x: number; y: number };
  };
  if (Number.isFinite(optional.speedRatio)) return clamp(optional.speedRatio!, 0, 1.6);
  if (Number.isFinite(optional.speedTilesPerSecond)) return clamp(optional.speedTilesPerSecond! / 1.8, 0, 1.6);
  if (optional.velocity && Number.isFinite(optional.velocity.x) && Number.isFinite(optional.velocity.y)) {
    return clamp(Math.hypot(optional.velocity.x, optional.velocity.y) / 1.8, 0, 1.6);
  }
  return clamp(sample.wakeIntensity, 0, 1.2);
}

export interface WakePersonality {
  alphaScale: number;
  irregular: boolean;
  lengthScale: number;
  lineScale: number;
  spacingScale: number;
  spreadScale: number;
}

export function wakePersonalityForHull(hull: ShipHull): WakePersonality {
  if (hull === "treasury-galleon") {
    return { alphaScale: 1.04, irregular: false, lengthScale: 0.92, lineScale: 1.16, spacingScale: 1.2, spreadScale: 1.34 };
  }
  if (hull === "chartered-brigantine") {
    return { alphaScale: 1, irregular: false, lengthScale: 1.02, lineScale: 1.02, spacingScale: 1, spreadScale: 1.06 };
  }
  if (hull === "dao-schooner") {
    return { alphaScale: 0.9, irregular: false, lengthScale: 1.28, lineScale: 0.82, spacingScale: 0.92, spreadScale: 0.72 };
  }
  if (hull === "algo-junk") {
    return { alphaScale: 1.1, irregular: true, lengthScale: 0.88, lineScale: 1.08, spacingScale: 0.82, spreadScale: 1.08 };
  }
  return { alphaScale: 1, irregular: false, lengthScale: 1, lineScale: 1, spacingScale: 1, spreadScale: 1 };
}

function wakeStrandModifier(
  personality: WakePersonality,
  index: number,
): { lengthScale: number; spacingScale: number; spreadScale: number } {
  if (!personality.irregular) return { lengthScale: 1, spacingScale: 1, spreadScale: 1 };
  const lengthScale = index === 0 ? 0.72 : index === 1 ? 1.08 : 0.84;
  const spreadScale = index === 0 ? 1.22 : index === 1 ? 0.88 : 1.08;
  const spacingScale = index === 0 ? 0.86 : index === 1 ? 1.12 : 0.94;
  return { lengthScale, spacingScale, spreadScale };
}

function wakeStyleForZone(zone: ShipWaterZone): {
  alphaScale: number;
  b: number;
  g: number;
  length: number;
  lengthStep: number;
  lineScale: number;
  r: number;
  spacing: number;
  spread: number;
  spreadStep: number;
} {
  if (zone === "ledger") return { r: 228, g: 210, b: 142, alphaScale: 0.1, length: 9, lengthStep: 2, lineScale: 0.84, spacing: 5.5, spread: 3, spreadStep: 1.5 };
  if (zone === "calm") return { r: 177, g: 232, b: 222, alphaScale: 0.12, length: 10, lengthStep: 2.4, lineScale: 0.9, spacing: 6, spread: 3.5, spreadStep: 1.7 };
  if (zone === "watch") return { r: 180, g: 224, b: 234, alphaScale: 0.15, length: 12, lengthStep: 3, lineScale: 1, spacing: 7, spread: 4, spreadStep: 2 };
  if (zone === "alert") return { r: 190, g: 238, b: 229, alphaScale: 0.17, length: 13, lengthStep: 3.4, lineScale: 1.04, spacing: 7.2, spread: 4.4, spreadStep: 2.1 };
  if (zone === "warning") return { r: 222, g: 235, b: 225, alphaScale: 0.19, length: 15, lengthStep: 4, lineScale: 1.08, spacing: 7.8, spread: 4.8, spreadStep: 2.4 };
  return { r: 236, g: 241, b: 230, alphaScale: 0.22, length: 17, lengthStep: 4.8, lineScale: 1.14, spacing: 8.4, spread: 5.2, spreadStep: 2.8 };
}

function wakeRgba(style: ReturnType<typeof wakeStyleForZone>, alpha: number): string {
  return `rgba(${style.r}, ${style.g}, ${style.b}, ${Math.max(0, Math.min(0.52, alpha))})`;
}
