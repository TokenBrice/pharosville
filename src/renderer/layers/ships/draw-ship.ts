import { squadForMember } from "../../../systems/maker-squad";
import {
  CUE_PRIORITY_ACTIVE_RISK,
  CUE_PRIORITY_RECENT_SUPPLY,
  cuePriority,
} from "../../../systems/cue-priority";
import { shipMapVisibilityAlpha, type ShipMotionSample } from "../../../systems/motion";
import type { ScreenPoint } from "../../../systems/projection";
import type { PharosVilleWorld, ShipLivery } from "../../../systems/world-types";
import type { LoadedPharosVilleAsset } from "../../asset-manager";
import { drawAnimatedAsset, drawAnimatedAssetSubpixel, drawAsset, drawAssetSubpixel, stableVisualVariant } from "../../canvas-primitives";
import type { RenderFrameCache } from "../../frame-cache";
import type { ResolvedEntityGeometry } from "../../geometry";
import { buildShipBodyCacheKey, type ShipBodyCache, type ShipBodyPrecomposeRequest } from "../../ship-body-cache";
import type { DrawPharosVilleInput } from "../../render-types";
import {
  SHIP_COLORS,
  SHIP_CONTINUOUS_MOTION,
  PROCEDURAL_SHIP_PENNANT_MARK,
  SHIP_SAIL_EMBLEM_OVERRIDES,
  SHIP_SAIL_EMBLEM_PAINTED,
  SHIP_SAIL_MARKS,
  TITAN_SPRITE_IDS,
} from "../../ship-visual-config";
import { UNIQUE_SPRITE_IDS } from "../../../systems/unique-ships";
import {
  SHIP_LANTERN_RADIUS_BUCKET,
  SHIP_LOD_SKIP_THRESHOLD,
  SHIP_OVERLAY_BUDGET_MIN,
  SHIP_OVERLAY_BUDGET_RATIO,
  SHIP_WAKE_BUDGET_MIN,
  SHIP_WAKE_BUDGET_RATIO,
} from "../../visual-scales";
import { resolveShipPose, zeroShipPose, type ShipPose } from "../ship-pose";
import {
  drawBowspritLogoMark,
  drawDyedSailEmblem,
  drawHeritageNameplate,
  drawMastPennantChrome,
  drawSailLogo,
  drawShipSignalOverlay,
  pennantSpecForShip,
  shouldDrawBowspritLogoMark,
  signalOverlayAnchor,
} from "./sail";
import {
  drawShipLiveryTrim,
  drawProceduralShipLiveryTrim,
  drawShipSailTint,
} from "./livery";
import { drawShipWakeRaw } from "./wake";

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

export interface ShipRenderState {
  bob: number;
  geometry: ResolvedEntityGeometry;
  p: ScreenPoint;
  pose: ShipPose;
  sample: ShipMotionSample | null;
  orientation: ShipVisualOrientation;
  selected: boolean;
  hovered: boolean;
  mapVisibilityAlpha: number;
  animationFrame: number;
  isTitanSprite: boolean;
  isUniqueSprite: boolean;
  drawsWake: boolean;
  shipAsset: LoadedPharosVilleAsset | null;
}

export interface ShipRenderFrame {
  cache: RenderFrameCache;
  shipRenderStates: Map<string, ShipRenderState>;
  // Optional: visible ships needed to look up the squad flagship for
  // synchronised wake ordering. World-canvas frames provide this; tests
  // may omit it (in which case wake ordering reduces to per-ship draw).
  visibleShips?: readonly PharosVilleWorld["ships"][number][];
  // Optional: tracks ship ids whose wake has been drawn this frame. Allows
  // `drawShipWake` to render the flagship's wake first (then mark it) when
  // both flagship and a consort move, so consort wakes overdraw the
  // flagship and create the squad interference pattern.
  wakeDrawnShipIds?: Set<string>;
  // Optional: O(1) flagship lookup keyed by squadId, populated from
  // `visibleShips` once per frame. Avoids O(N) `.find()` inside the
  // per-ship wake loop. World-canvas frames provide this; tests may omit it.
  flagshipById?: Map<string, PharosVilleWorld["ships"][number]>;
  protectedShipBodyCacheKeys?: Set<string>;
  shipBodyCache?: ShipBodyCache;
  shipBodyCacheManifestVersion?: string;
  shipBodyCacheMaxPixels?: number;
  shipBodyCacheWarmupBudget?: { remaining: number };
}

export interface ShipRenderLodPlan {
  drawOverlayShipIds: ReadonlySet<string>;
  drawWakeShipIds: ReadonlySet<string>;
}

const SHIP_ANIMATION_FRAME_CACHE_MAX = 144;

// Per-zoom-bucket cache for the night lantern halo on overlay ships. We bake
// one normalized (alpha=1) radial gradient into a small offscreen canvas per
// quantized radius and modulate the night fade via `globalAlpha` on draw,
// mirroring `lampLightConeSpriteCache` in scenery.ts.
const shipLanternSpriteCache = new Map<number, { canvas: HTMLCanvasElement; halfSize: number }>();

function quantizeShipLanternRadius(radius: number): number {
  return Math.max(2, Math.round(radius * SHIP_LANTERN_RADIUS_BUCKET) / SHIP_LANTERN_RADIUS_BUCKET);
}

function getShipLanternSprite(radius: number): { canvas: HTMLCanvasElement; halfSize: number } | null {
  if (typeof document === "undefined") return null;
  const bucketed = quantizeShipLanternRadius(radius);
  const cached = shipLanternSpriteCache.get(bucketed);
  if (cached) return cached;

  const size = Math.max(2, Math.ceil(bucketed * 2) + 2);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const offCtx = canvas.getContext("2d");
  if (!offCtx) return null;
  const cx = size / 2;
  const cy = size / 2;
  const grad = offCtx.createRadialGradient(cx, cy, 0, cx, cy, bucketed);
  grad.addColorStop(0, "rgba(255, 200, 80, 1)");
  grad.addColorStop(0.4, "rgba(230, 150, 40, 0.45)");
  grad.addColorStop(1, "rgba(200, 100, 20, 0)");
  offCtx.fillStyle = grad;
  offCtx.beginPath();
  offCtx.arc(cx, cy, bucketed, 0, Math.PI * 2);
  offCtx.fill();

  const entry = { canvas, halfSize: cx };
  shipLanternSpriteCache.set(bucketed, entry);
  return entry;
}

const SHIP_SIZE_TIER_PRIORITY: Record<PharosVilleWorld["ships"][number]["visual"]["sizeTier"], number> = {
  titan: 7,
  unique: 6,
  flagship: 5,
  major: 4,
  regional: 3,
  local: 2,
  skiff: 1,
  micro: 1,
  unknown: 0,
};

// Module-level scratch reused by `planShipRenderLod`. Lifecycle: cleared on
// each cache miss; cached plan sets are reused (mutated in place) across
// frames when key matches, then fully rebuilt on miss. `resetPlanCache()`
// drops the cache when the world identity changes.
type ShipLodCandidate = { score: number; shipId: string };
type ShipLodBudgetTier = "constrained" | "full" | "interaction" | "recovery";
const overlayCandidatesScratch: ShipLodCandidate[] = [];
const wakeCandidatesScratch: ShipLodCandidate[] = [];
const drawOverlayShipIdsScratch = new Set<string>();
const drawWakeShipIdsScratch = new Set<string>();
const cachedPlan: ShipRenderLodPlan = {
  drawOverlayShipIds: drawOverlayShipIdsScratch,
  drawWakeShipIds: drawWakeShipIdsScratch,
};
// Fast-path scratch: `planShipRenderLod` returns the same id set for both
// overlay and wake when ship count is below the LOD threshold. Refilled in
// place to avoid the `new Set(visibleShips.map(...))` allocation pair per
// call. Distinct from the slow-path scratch above so a fast→slow transition
// across frames doesn't clobber a still-referenced slow plan.
const fastPathShipIdsScratch = new Set<string>();
const fastPathPlan: ShipRenderLodPlan = {
  drawOverlayShipIds: fastPathShipIdsScratch,
  drawWakeShipIds: fastPathShipIdsScratch,
};
let cachedPlanKey: string | null = null;
let cachedMoverHashSource: ReadonlySet<string> | null = null;
let cachedMoverHash = "";
let cachedEffectHashSource: ReadonlySet<string> | null = null;
let cachedEffectHash = "";

const SHIP_LOD_BUDGET_MULTIPLIERS: Record<ShipLodBudgetTier, { overlay: number; wake: number }> = {
  constrained: { overlay: 0.4, wake: 0.35 },
  full: { overlay: 1, wake: 1 },
  interaction: { overlay: 0.5, wake: 0.42 },
  recovery: { overlay: 0.58, wake: 0.5 },
};

export type TitanPoseBucket = -2 | -1 | 0 | 1 | 2;

export interface ShipVisualOrientation {
  flipX: boolean;
  titanPoseBucket: TitanPoseBucket;
  titanScaleY: number;
  titanSkewX: number;
}

const STATIC_SHIP_ORIENTATION: ShipVisualOrientation = Object.freeze({
  flipX: false,
  titanPoseBucket: 0,
  titanScaleY: 1,
  titanSkewX: 0,
});

const HEADING_FLIP_THRESHOLD = -0.05;
const TITAN_YAW_SKEW_MAX = 0.035;
const topRecentMoverCache = new WeakMap<PharosVilleWorld["ships"], ReadonlySet<string>>();

function compareShipLodCandidates(a: ShipLodCandidate, b: ShipLodCandidate): number {
  const scoreDelta = b.score - a.score;
  if (Math.abs(scoreDelta) > 0.0001) return scoreDelta;
  return a.shipId < b.shipId ? -1 : a.shipId > b.shipId ? 1 : 0;
}

function hashIdSet(set: ReadonlySet<string>, prevSource: ReadonlySet<string> | null, prevHash: string): {
  hash: string;
  source: ReadonlySet<string>;
} {
  if (set === prevSource) return { hash: prevHash, source: set };
  if (set.size === 0) return { hash: "", source: set };
  const ids: string[] = [];
  for (const id of set) ids.push(id);
  ids.sort();
  return { hash: ids.join("|"), source: set };
}

export function resolveShipVisualOrientation(input: {
  heading?: { x: number; y: number } | null;
  isTitanSprite: boolean;
  isUniqueSprite?: boolean;
  shipId: string;
}): ShipVisualOrientation {
  const heading = normalizedHeading(input.heading);
  if (!heading) return STATIC_SHIP_ORIENTATION;

  if (!input.isTitanSprite) {
    return {
      ...STATIC_SHIP_ORIENTATION,
      flipX: input.isUniqueSprite ? false : heading.x < HEADING_FLIP_THRESHOLD,
    };
  }

  const bucket = titanPoseBucketForHeading(heading);
  const stableBias = ((stableVisualVariant(`${input.shipId}:titan-yaw`) % 5) - 2) * 0.0025;
  const skew = clamp(heading.y * 0.018 + bucket * 0.004 + stableBias, -TITAN_YAW_SKEW_MAX, TITAN_YAW_SKEW_MAX);
  return {
    flipX: false,
    titanPoseBucket: bucket,
    titanScaleY: 1 - Math.abs(bucket) * 0.007,
    titanSkewX: skew,
  };
}

function normalizedHeading(heading: { x: number; y: number } | null | undefined): { x: number; y: number } | null {
  if (!heading || !Number.isFinite(heading.x) || !Number.isFinite(heading.y)) return null;
  const magnitude = Math.hypot(heading.x, heading.y);
  if (magnitude <= 0.0001) return null;
  return {
    x: heading.x / magnitude,
    y: heading.y / magnitude,
  };
}

function titanPoseBucketForHeading(heading: { x: number; y: number }): TitanPoseBucket {
  const lateral = clamp(heading.x * 0.72 + heading.y * 0.28, -1, 1);
  if (lateral <= -0.62) return -2;
  if (lateral <= -0.18) return -1;
  if (lateral >= 0.62) return 2;
  if (lateral >= 0.18) return 1;
  return 0;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function withShipMapVisibilityAlpha(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void): void {
  const bounded = clamp(alpha, 0, 1);
  if (bounded <= 0) return;
  if (bounded >= 0.999) {
    draw();
    return;
  }
  ctx.save();
  ctx.globalAlpha *= bounded;
  draw();
  ctx.restore();
}

export function multiplyGlobalAlpha(ctx: CanvasRenderingContext2D, alpha: number): void {
  ctx.globalAlpha *= clamp(alpha, 0, 1);
}

/**
 * @internal Test-only hook to drop the LOD plan cache between test cases.
 * Not part of the stable layer API.
 */
export function resetPlanCache(): void {
  cachedPlanKey = null;
  cachedMoverHashSource = null;
  cachedMoverHash = "";
  cachedEffectHashSource = null;
  cachedEffectHash = "";
}

/**
 * @internal LOD planning helper consumed by `entity-pass.ts` and tests.
 * Not part of the stable layer draw API; use the `drawShip*` functions for
 * rendering.
 */
export function planShipRenderLod(
  input: Pick<DrawPharosVilleInput, "camera" | "height" | "hoveredTarget" | "motion" | "renderScheduler" | "selectedTarget" | "shipMotionSamples" | "width">,
  cache: Pick<RenderFrameCache, "geometryForEntity">,
  visibleShips: readonly PharosVilleWorld["ships"][number][],
): ShipRenderLodPlan {
  if (visibleShips.length <= SHIP_LOD_SKIP_THRESHOLD) {
    fastPathShipIdsScratch.clear();
    for (const ship of visibleShips) fastPathShipIdsScratch.add(ship.id);
    return fastPathPlan;
  }

  const selectedId = input.selectedTarget?.id ?? null;
  const selectedDetailId = input.selectedTarget?.detailId ?? null;
  const hoveredId = input.hoveredTarget?.id ?? null;
  const hoveredDetailId = input.hoveredTarget?.detailId ?? null;

  const moverIds = input.motion.plan.moverShipIds;
  const effectIds = input.motion.plan.effectShipIds;
  const moverHashed = hashIdSet(moverIds, cachedMoverHashSource, cachedMoverHash);
  const effectHashed = hashIdSet(effectIds, cachedEffectHashSource, cachedEffectHash);
  const topRecentIds = topRecentMoverShipIdsForShips(visibleShips);
  const topRecentHash = hashShipChangeSignature(visibleShips);
  const budgetTier = shipLodBudgetTierForInput(input);
  cachedMoverHashSource = moverHashed.source;
  cachedMoverHash = moverHashed.hash;
  cachedEffectHashSource = effectHashed.source;
  cachedEffectHash = effectHashed.hash;

  const zoomBucket = (input.camera.zoom * 100) | 0;
  const cacheKey = `${budgetTier}|${zoomBucket}|${input.width}|${input.height}|${visibleShips.length}|${selectedId ?? ""}|${selectedDetailId ?? ""}|${hoveredId ?? ""}|${hoveredDetailId ?? ""}|${moverHashed.hash}|${effectHashed.hash}|${topRecentHash}`;
  if (cacheKey === cachedPlanKey) {
    return cachedPlan;
  }

  const centerX = input.width / 2;
  const centerY = input.height / 2;
  const maxDistance = Math.max(320, Math.sqrt(centerX * centerX + centerY * centerY) + 220 * input.camera.zoom);
  const viewportMargin = Math.max(96, 160 * input.camera.zoom);
  const zoomFactor = Math.max(0.72, Math.min(1.2, input.camera.zoom));
  const budgetMultiplier = SHIP_LOD_BUDGET_MULTIPLIERS[budgetTier];
  const overlayBudget = Math.min(
    visibleShips.length,
    Math.max(
      Math.ceil(SHIP_OVERLAY_BUDGET_MIN * budgetMultiplier.overlay),
      Math.floor(visibleShips.length * SHIP_OVERLAY_BUDGET_RATIO * zoomFactor * budgetMultiplier.overlay),
    ),
  );
  const wakeBudget = Math.min(
    visibleShips.length,
    Math.max(
      Math.ceil(SHIP_WAKE_BUDGET_MIN * budgetMultiplier.wake),
      Math.floor(visibleShips.length * SHIP_WAKE_BUDGET_RATIO * zoomFactor * budgetMultiplier.wake),
    ),
  );

  drawOverlayShipIdsScratch.clear();
  drawWakeShipIdsScratch.clear();
  overlayCandidatesScratch.length = 0;
  wakeCandidatesScratch.length = 0;

  for (const ship of visibleShips) {
    const geometry = cache.geometryForEntity(ship);
    const sample = input.shipMotionSamples?.get(ship.id) ?? null;
    const mover = moverIds.has(ship.id);
    const effect = effectIds.has(ship.id);
    const topRecent = topRecentIds.has(ship.id);
    const selected = ship.id === selectedId || ship.detailId === selectedDetailId;
    const hovered = ship.id === hoveredId || ship.detailId === hoveredDetailId;
    const preserveTier = ship.visual.sizeTier === "titan"
      || ship.visual.sizeTier === "unique"
      || isTitanSprite(ship)
      || isUniqueSprite(ship);
    const inViewport = isShipRectInViewport(geometry.selectionRect, input.width, input.height, viewportMargin);
    const dx = geometry.screenPoint.x - centerX;
    const dy = geometry.screenPoint.y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const proximityScore = Math.max(-1, 1 - distance / maxDistance);
    const sizePriority = SHIP_SIZE_TIER_PRIORITY[ship.visual.sizeTier] ?? 0;
    const transit = sample?.state === "departing" || sample?.state === "sailing" || sample?.state === "arriving";
    const preserve = selected || hovered || preserveTier;

    if (preserve) {
      drawOverlayShipIdsScratch.add(ship.id);
      drawWakeShipIdsScratch.add(ship.id);
      continue;
    }
    if (topRecent) {
      drawWakeShipIdsScratch.add(ship.id);
    }

    const visibilityScore = inViewport ? 2.2 : -2.4;
    // W4.27: cue-priority arbiter — break cap-bound ties by MOTION_POLICY tier.
    // `selected`/`hovered`/preserve tiers already short-circuited above, so
    // here we only need to distinguish active-risk vs recent-supply vs scenery.
    const priorityTier = cuePriority({ ship, sample, selected: false });
    const priorityBonus = priorityTier === CUE_PRIORITY_ACTIVE_RISK
      ? 3.0
      : priorityTier === CUE_PRIORITY_RECENT_SUPPLY
        ? 1.4
        : 0;
    const overlayScore = proximityScore * 5.6
      + visibilityScore
      + sizePriority
      + (effect ? 2.1 : 0)
      + (mover ? 2.8 : 0)
      + (transit ? 0.8 : -0.4)
      + priorityBonus;
    overlayCandidatesScratch.push({ score: overlayScore, shipId: ship.id });

    const wakeScore = proximityScore * 5.1
      + visibilityScore
      + (effect ? 3.1 : 0)
      + (topRecent ? 3.5 : 0)
      + (mover ? 5.8 : 0)
      + (transit ? 4.4 : -3.6)
      + sizePriority * 0.4
      + priorityBonus;
    wakeCandidatesScratch.push({ score: wakeScore, shipId: ship.id });
  }

  addTopBudgetedShips(drawOverlayShipIdsScratch, overlayCandidatesScratch, overlayBudget);
  addTopBudgetedShips(drawWakeShipIdsScratch, wakeCandidatesScratch, wakeBudget);

  cachedPlanKey = cacheKey;
  return cachedPlan;
}

function shipLodBudgetTierForInput(
  input: Pick<DrawPharosVilleInput, "motion" | "renderScheduler">,
): ShipLodBudgetTier {
  if (input.motion.reducedMotion) return "full";
  const tier = input.renderScheduler?.tier;
  if (tier === "interaction") return "interaction";
  if (tier === "constrained") return "constrained";
  if (tier === "recovery") return "recovery";
  return "full";
}

function addTopBudgetedShips(
  output: Set<string>,
  candidates: ShipLodCandidate[],
  targetBudget: number,
) {
  const target = Math.max(targetBudget, output.size);
  if (output.size >= target || candidates.length === 0) return;
  candidates.sort(compareShipLodCandidates);
  for (const candidate of candidates) {
    output.add(candidate.shipId);
    if (output.size >= target) break;
  }
}

function isShipRectInViewport(
  rect: { height: number; width: number; x: number; y: number },
  width: number,
  height: number,
  margin: number,
) {
  return (
    rect.x + rect.width >= -margin
    && rect.x <= width + margin
    && rect.y + rect.height >= -margin
    && rect.y <= height + margin
  );
}

export function shipRenderState(input: DrawPharosVilleInput, frame: ShipRenderFrame, ship: PharosVilleWorld["ships"][number]): ShipRenderState {
  const cached = frame.shipRenderStates.get(ship.id);
  if (cached) return cached;
  const { camera, hoveredTarget, motion, selectedTarget, shipMotionSamples } = input;
  const sample = shipMotionSamples?.get(ship.id) ?? null;
  const shipAsset = frame.cache.assetForEntity(ship);
  const geometry = frame.cache.geometryForEntity(ship);
  const p = geometry.screenPoint;
  const phase = motion.plan.shipPhases.get(ship.id) ?? 0;
  const selected = selectedTarget?.id === ship.id || selectedTarget?.detailId === ship.detailId;
  const hovered = hoveredTarget?.id === ship.id || hoveredTarget?.detailId === ship.detailId;
  const mapVisibilityAlpha = shipMapVisibilityAlpha(ship, sample);
  const titanSprite = isTitanSprite(ship);
  const uniqueSprite = isUniqueSprite(ship);
  const animated = !motion.reducedMotion && motion.plan.animatedShipIds.has(ship.id);
  const topRecentMover = isTopRecentMoverShip(input.world, ship.id);
  const drawsWake = !motion.reducedMotion
    && (sample?.state === "departing" || sample?.state === "sailing" || sample?.state === "arriving")
    && (motion.plan.effectShipIds.has(ship.id) || selected || motion.plan.moverShipIds.has(ship.id) || topRecentMover);
  const pose = animated
    ? resolveShipPose({
      phase,
      reducedMotion: motion.reducedMotion,
      sample,
      shipId: ship.id,
      timeSeconds: motion.timeSeconds,
      visualSizeTier: ship.visual.sizeTier,
      zoom: camera.zoom,
    })
    : zeroShipPose();
  const bob = pose.bobPixels;
  const animationFrame = shipAsset && titanSprite
    ? shipAnimationFrameIndex(shipAsset, motion.timeSeconds, ship.id)
    : 0;
  const orientation = resolveShipVisualOrientation({
    ...(sample?.heading ? { heading: sample.heading } : {}),
    isTitanSprite: titanSprite,
    isUniqueSprite: uniqueSprite,
    shipId: ship.id,
  });
  const state: ShipRenderState = {
    bob,
    geometry,
    p,
    pose,
    sample,
    orientation,
    selected,
    hovered,
    mapVisibilityAlpha,
    animationFrame,
    isTitanSprite: titanSprite,
    isUniqueSprite: uniqueSprite,
    drawsWake,
    shipAsset,
  };
  frame.shipRenderStates.set(ship.id, state);
  return state;
}

function isTitanSprite(ship: PharosVilleWorld["ships"][number]): boolean {
  return !!ship.visual.spriteAssetId && TITAN_SPRITE_IDS.has(ship.visual.spriteAssetId);
}

function isUniqueSprite(ship: PharosVilleWorld["ships"][number]): boolean {
  return !!ship.visual.spriteAssetId && UNIQUE_SPRITE_IDS.has(ship.visual.spriteAssetId);
}

function drawWithShipPose(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pose: ShipPose,
  orientation: ShipVisualOrientation,
  draw: () => void,
) {
  const needsRoll = Math.abs(pose.rollRadians) >= 0.0005;
  const needsOrientation = orientation.flipX
    || Math.abs(orientation.titanSkewX) >= 0.0005
    || Math.abs(orientation.titanScaleY - 1) >= 0.0005;
  if (!needsRoll && !needsOrientation) {
    draw();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  if (needsRoll) ctx.rotate(pose.rollRadians);
  if (needsOrientation) {
    ctx.scale(orientation.flipX ? -1 : 1, orientation.titanScaleY);
    if (Math.abs(orientation.titanSkewX) >= 0.0005 && typeof ctx.transform === "function") {
      ctx.transform(1, 0, orientation.titanSkewX, 1, 0, 0);
    }
  }
  ctx.translate(-x, -y);
  draw();
  ctx.restore();
}

function applyShipOrientationToLocalPoint(
  localX: number,
  localY: number,
  orientation: ShipVisualOrientation,
): { x: number; y: number } {
  const skewedX = localX + orientation.titanSkewX * localY;
  return {
    x: skewedX * (orientation.flipX ? -1 : 1),
    y: localY * orientation.titanScaleY,
  };
}

/**
 * Draws a ship's wake. May also paint the flagship's wake out-of-turn for
 * synchronised-squad-wake interference: when called for a Maker squad consort
 * that's a mover and the flagship is also a mover, the flagship's wake is
 * drawn first via `drawShipWakeRaw` and marked in `frame.wakeDrawnShipIds`
 * to prevent double-draw. See `ShipRenderFrame.wakeDrawnShipIds`.
 */
export function drawShipWake(input: DrawPharosVilleInput, frame: ShipRenderFrame, ship: PharosVilleWorld["ships"][number]): void {
  // Synchronised squad wake: when this hull is a squad consort that is
  // currently a mover and its squad's flagship is also a mover, draw the
  // flagship's wake first so consort wakes overdraw additively.
  const squad = ship.squadId ? squadForMember(ship.id) : null;
  if (
    squad
    && ship.squadRole === "consort"
    && input.motion.plan.moverShipIds.has(ship.id)
    && input.motion.plan.moverShipIds.has(squad.flagshipId)
  ) {
    const flagship = frame.flagshipById?.get(squad.id)
      ?? frame.visibleShips?.find((entry) => entry.id === squad.flagshipId);
    const drawn = frame.wakeDrawnShipIds;
    if (flagship && drawn && !drawn.has(squad.flagshipId)) {
      drawShipWakeRaw(input, frame, flagship);
      drawn.add(squad.flagshipId);
    }
  }
  if (frame.wakeDrawnShipIds?.has(ship.id)) return;
  drawShipWakeRaw(input, frame, ship);
  frame.wakeDrawnShipIds?.add(ship.id);
}

export function isTopRecentMoverShip(world: PharosVilleWorld, shipId: string): boolean {
  return topRecentMoverShipIds(world).has(shipId);
}

function topRecentMoverShipIds(world: PharosVilleWorld): ReadonlySet<string> {
  const cached = topRecentMoverCache.get(world.ships);
  if (cached) return cached;
  const ids = topRecentMoverShipIdsForShips(world.ships);
  topRecentMoverCache.set(world.ships, ids);
  return ids;
}

function topRecentMoverShipIdsForShips(ships: readonly PharosVilleWorld["ships"][number][]): ReadonlySet<string> {
  return new Set(
    ships
      .filter((ship) => Math.abs(ship.change24hUsd ?? 0) > 0)
      .toSorted((a, b) => Math.abs(b.change24hUsd ?? 0) - Math.abs(a.change24hUsd ?? 0) || a.id.localeCompare(b.id))
      .slice(0, 3)
      .map((ship) => ship.id),
  );
}

function hashShipChangeSignature(ships: readonly PharosVilleWorld["ships"][number][]): string {
  return ships
    .map((ship) => `${ship.id}:${ship.change24hUsd ?? ""}`)
    .join("|");
}

export function drawShipBody(input: DrawPharosVilleInput, frame: ShipRenderFrame, ship: PharosVilleWorld["ships"][number]): void {
  const { camera, ctx, motion } = input;
  const {
    animationFrame,
    bob,
    geometry,
    isTitanSprite,
    orientation,
    mapVisibilityAlpha,
    p,
    pose,
    shipAsset,
  } = shipRenderState(input, frame, ship);
  withShipMapVisibilityAlpha(ctx, mapVisibilityAlpha, () => {
    if (shipAsset) {
      const drawY = geometry.drawPoint.y + bob;
      const useLiveSubpixelDraw = !motion.reducedMotion;
      drawWithShipPose(ctx, geometry.drawPoint.x, drawY, pose, orientation, () => {
        if (!drawPrecomposedShipBody({
          animationFrame,
          frame,
          input,
          ship,
          shipAsset,
          useLiveSubpixelDraw,
          x: geometry.drawPoint.x,
          y: drawY,
          scale: geometry.drawScale,
          visualKey: ship.visual.spriteAssetId ?? ship.visual.hull,
        })) {
          drawShipBodyInline({
            animationFrame,
            ctx,
            isTitanSprite,
            livery: ship.visual.livery,
            shipAsset,
            shipId: ship.id,
            useLiveSubpixelDraw,
            visualKey: ship.visual.spriteAssetId ?? ship.visual.hull,
            x: geometry.drawPoint.x,
            y: drawY,
            scale: geometry.drawScale,
            reducedMotion: motion.reducedMotion,
          });
        }
      });
    } else {
      const drawY = p.y - 4 * camera.zoom + bob;
      const proceduralScale = camera.zoom * ship.visual.scale;
      drawWithShipPose(ctx, p.x, drawY, pose, orientation, () => {
        drawShip(
          ctx,
          p.x,
          drawY,
          ship.visual.scale,
          ship.visual.livery.sailColor,
          SHIP_COLORS[ship.visual.hull],
          camera.zoom,
          pose.sailFlutter,
        );
        drawProceduralShipLiveryTrim(ctx, ship.id, ship.visual.livery, p.x, drawY, proceduralScale);
        drawSquadIdentityAccent(ctx, ship.id, p.x, drawY, proceduralScale);
      });
    }
  });
}

function drawShipBodyInline(input: {
  animationFrame: number;
  ctx: CanvasRenderingContext2D;
  isTitanSprite: boolean;
  livery: ShipLivery;
  reducedMotion: boolean;
  scale: number;
  shipAsset: LoadedPharosVilleAsset;
  shipId: string;
  useLiveSubpixelDraw: boolean;
  visualKey: string;
  x: number;
  y: number;
}): void {
  if (input.isTitanSprite) {
    const drawAnimated = input.useLiveSubpixelDraw ? drawAnimatedAssetSubpixel : drawAnimatedAsset;
    drawAnimated(
      input.ctx,
      input.shipAsset,
      input.x,
      input.y,
      input.scale,
      input.animationFrame,
      input.reducedMotion,
    );
  } else {
    const drawStatic = input.useLiveSubpixelDraw ? drawAssetSubpixel : drawAsset;
    drawStatic(input.ctx, input.shipAsset, input.x, input.y, input.scale);
  }
  drawShipSailTint(input.ctx, input.shipAsset, input.x, input.y, input.scale, input.livery, input.useLiveSubpixelDraw);
  drawShipLiveryTrim(input.ctx, input.shipId, input.livery, input.visualKey, input.x, input.y, input.scale);
  drawSquadIdentityAccent(input.ctx, input.shipId, input.x, input.y, input.scale);
}

function drawPrecomposedShipBody(input: {
  animationFrame: number;
  frame: ShipRenderFrame;
  input: DrawPharosVilleInput;
  scale: number;
  ship: PharosVilleWorld["ships"][number];
  shipAsset: LoadedPharosVilleAsset;
  useLiveSubpixelDraw: boolean;
  visualKey: string;
  x: number;
  y: number;
}): boolean {
  const cache = input.frame.shipBodyCache;
  const manifestCacheVersion = input.frame.shipBodyCacheManifestVersion;
  if (!cache || !manifestCacheVersion) return false;
  const entry = input.shipAsset.entry;
  const displayScale = entry.displayScale;
  const logicalSize = {
    height: entry.height * displayScale,
    width: entry.width * displayScale,
  };
  const request: ShipBodyPrecomposeRequest = {
    animationFrameKey: input.frame.shipRenderStates.get(input.ship.id)?.isTitanSprite ? input.animationFrame : 0,
    assetId: entry.id,
    dpr: 1,
    logicalSize,
    manifestCacheVersion,
    shipId: input.ship.id,
    sourceSize: { height: entry.height, width: entry.width },
  };
  const key = buildShipBodyCacheKey(request);
  const cacheHit = cache.has(key);
  const warmupBudget = input.frame.shipBodyCacheWarmupBudget;
  if (!cacheHit && warmupBudget && warmupBudget.remaining <= 0) return false;
  const result = cache.getOrCreate(request, ({ ctx }) => {
    const anchorX = entry.anchor[0] * displayScale;
    const anchorY = entry.anchor[1] * displayScale;
    drawShipBodyInline({
      animationFrame: input.animationFrame,
      ctx,
      isTitanSprite: input.frame.shipRenderStates.get(input.ship.id)?.isTitanSprite ?? false,
      livery: input.ship.visual.livery,
      reducedMotion: input.input.motion.reducedMotion,
      scale: 1,
      shipAsset: input.shipAsset,
      shipId: input.ship.id,
      useLiveSubpixelDraw: false,
      visualKey: input.visualKey,
      x: anchorX,
      y: anchorY,
    });
  }, {
    maxPixels: input.frame.shipBodyCacheMaxPixels,
    protectedKeys: input.frame.protectedShipBodyCacheKeys,
  });
  if (!cacheHit && warmupBudget && result.status === "miss") {
    warmupBudget.remaining = Math.max(0, warmupBudget.remaining - 1);
  }
  input.frame.protectedShipBodyCacheKeys?.add(key);
  if (!result.canvas) return false;
  const destinationX = input.x - entry.anchor[0] * displayScale * input.scale;
  const destinationY = input.y - entry.anchor[1] * displayScale * input.scale;
  input.input.ctx.drawImage(
    result.canvas,
    input.useLiveSubpixelDraw ? destinationX : Math.round(destinationX),
    input.useLiveSubpixelDraw ? destinationY : Math.round(destinationY),
    Math.round(logicalSize.width * input.scale),
    Math.round(logicalSize.height * input.scale),
  );
  return true;
}

// Per-hull identity accents, drawn after sprite blit and livery trim but
// before overlay chrome. Gated by ship.id so only the three squad members
// with a distinct callsign render an accent.
export function drawSquadIdentityAccent(
  ctx: CanvasRenderingContext2D,
  shipId: string,
  x: number,
  y: number,
  scale: number,
): void {
  // Both squad flagships fly the admiral's banner. DAI (Maker flagship) also
  // carries weathered hull patches as elder consort lore.
  const squad = squadForMember(shipId);
  if (squad && shipId === squad.flagshipId) drawAdmiralBanner(ctx, x, y, scale);
  if (shipId === "stusds-sky") drawForgeGlow(ctx, x, y, scale);
  if (shipId === "dai-makerdao") drawWeatheredPatches(ctx, x, y, scale);
}

// Forked admiral banner raised above the mast tip; flagship-only.
function drawAdmiralBanner(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const mastX = x - 2 * scale;
  const topY = y - 72 * scale;
  const width = 18 * scale;
  const height = 6 * scale;
  ctx.save();
  ctx.strokeStyle = "rgba(18, 12, 8, 0.72)";
  ctx.lineWidth = Math.max(1, 1.2 * scale);
  ctx.beginPath();
  ctx.moveTo(mastX - 1 * scale, topY + height + 3 * scale);
  ctx.lineTo(mastX - 1 * scale, topY - 1 * scale);
  ctx.stroke();

  ctx.fillStyle = "#e8bb60";
  ctx.strokeStyle = "rgba(43, 28, 18, 0.78)";
  ctx.lineWidth = Math.max(1, 0.8 * scale);
  ctx.beginPath();
  ctx.rect(mastX, topY, width, height);
  ctx.fill();
  ctx.stroke();
  // Forked tip for admiral's banner.
  ctx.beginPath();
  ctx.moveTo(mastX + width, topY);
  ctx.lineTo(mastX + width + 5 * scale, topY + height * 0.5);
  ctx.lineTo(mastX + width, topY + height);
  ctx.lineTo(mastX + width - 3.5 * scale, topY + height * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Soft warm-orange radial gradient at the bow ram joint; reads as forge-glow.
function drawForgeGlow(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const cx = x + 14 * scale;
  const cy = y - 4 * scale;
  const radius = Math.max(2, 9 * scale);
  ctx.save();
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, "rgba(255, 140, 40, 0.32)");
  gradient.addColorStop(0.6, "rgba(255, 140, 40, 0.12)");
  gradient.addColorStop(1, "rgba(255, 140, 40, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Three desaturated grey-brown rectangles near the waterline; reads as
// patched-up timbers on the elder consort.
function drawWeatheredPatches(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.fillStyle = "rgba(96, 78, 60, 0.55)";
  ctx.strokeStyle = "rgba(40, 32, 24, 0.5)";
  ctx.lineWidth = Math.max(1, 0.5 * scale);
  const patches: ReadonlyArray<readonly [number, number, number, number]> = [
    [-16, -3, 5, 2.4],
    [-6, -4, 4.4, 2.2],
    [4, -3, 4.8, 2.6],
    [13, -4, 3.6, 2.0],
  ];
  for (const [px, py, pw, ph] of patches) {
    ctx.beginPath();
    ctx.rect(x + px * scale, y + py * scale, pw * scale, ph * scale);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// Mast-top in screen-space, including hull pose (bob + roll). Used by the
// squad chrome layer to anchor the bunting catenary so it follows wake.
export function shipMastTopScreenPoint(
  input: DrawPharosVilleInput,
  frame: ShipRenderFrame,
  ship: PharosVilleWorld["ships"][number],
): { x: number; y: number } {
  const { bob, geometry, orientation, pose } = shipRenderState(input, frame, ship);
  const drawX = geometry.drawPoint.x;
  const drawY = geometry.drawPoint.y + bob;
  const sailKey = ship.visual.spriteAssetId ?? ship.visual.hull;
  const sail = SHIP_SAIL_MARKS[sailKey] ?? SHIP_SAIL_MARKS["treasury-galleon"]!;
  // Mast tip sits above the sail mark, slightly inboard of the sail's nominal X
  // (the sail mark sits roughly mid-sail; the mast pole is closer to centerline).
  const MAST_TOP_HEIGHT_FACTOR = 0.6; // mast extends 60% of sail-mark height above the mark
  const MAST_X_INSET_FACTOR = 0.1; // mast pole sits at 10% of sail.x toward centerline
  const localX = sail.x * geometry.drawScale * MAST_X_INSET_FACTOR;
  const localY = (sail.y - sail.height * MAST_TOP_HEIGHT_FACTOR) * geometry.drawScale;
  // Apply pose roll about the hull origin (drawX, drawY).
  const cos = Math.cos(pose.rollRadians);
  const sin = Math.sin(pose.rollRadians);
  const oriented = applyShipOrientationToLocalPoint(localX, localY, orientation);
  return {
    x: drawX + oriented.x * cos - oriented.y * sin,
    y: drawY + oriented.x * sin + oriented.y * cos,
  };
}

function shipAnimationFrameIndex(asset: LoadedPharosVilleAsset, timeSeconds: number, shipId: string): number {
  const animation = asset.entry.animation;
  if (!animation || animation.frameCount <= 1) return 0;
  if (animation.frameCount <= SHIP_CONTINUOUS_MOTION.titanStaticAnimationFrameCountMax) {
    return shipAnimationFrameOffset(asset, shipId);
  }
  const fps = animation.fps
    ?? (animation.durationMs && animation.durationMs > 0 ? animation.frameCount / (animation.durationMs / 1000) : 4);
  const phase = shipAnimationFrameOffset(asset, shipId);
  return Math.floor(timeSeconds * fps + phase);
}

const shipAnimationFrameOffsetCache = new Map<string, number>();

function shipAnimationFrameOffset(asset: LoadedPharosVilleAsset, shipId: string): number {
  const frameCount = asset.entry.animation?.frameCount ?? 0;
  const animation = asset.entry.animation;
  if (!animation || frameCount <= 1) return 0;
  const key = `${shipId}|${asset.entry.id}|${frameCount}`;
  const cached = shipAnimationFrameOffsetCache.get(key);
  if (cached !== undefined) return cached;
  const phase = stableVisualVariant(`${shipId}:${asset.entry.id}:animation-frame`) % frameCount;
  shipAnimationFrameOffsetCache.set(key, phase);
  while (shipAnimationFrameOffsetCache.size > SHIP_ANIMATION_FRAME_CACHE_MAX) {
    const oldest = shipAnimationFrameOffsetCache.keys().next().value;
    if (typeof oldest !== "string") break;
    shipAnimationFrameOffsetCache.delete(oldest);
  }
  return phase;
}

export function drawShipOverlay(input: DrawPharosVilleInput, frame: ShipRenderFrame, ship: PharosVilleWorld["ships"][number], nightFactor: number): void {
  const { assets, camera, ctx } = input;
  const {
    bob,
    geometry,
    hovered,
    isTitanSprite,
    isUniqueSprite,
    mapVisibilityAlpha,
    orientation,
    p,
    pose,
    selected,
    shipAsset,
  } = shipRenderState(input, frame, ship);
  withShipMapVisibilityAlpha(ctx, mapVisibilityAlpha, () => {
    if (shipAsset) {
      const overrideEmblemSrc = SHIP_SAIL_EMBLEM_OVERRIDES[ship.id];
      const overrideEmblemLogo = overrideEmblemSrc ? assets?.getLogo(overrideEmblemSrc) ?? null : null;
      const dyedEmblem = (!isTitanSprite && !isUniqueSprite) || overrideEmblemLogo !== null;
      const standardSprite = !isTitanSprite && !isUniqueSprite;
      const drawY = geometry.drawPoint.y + bob;
      drawWithShipPose(ctx, geometry.drawPoint.x, drawY, pose, orientation, () => {
        if (selected) {
          drawSelectedShipOutline(ctx, geometry.drawPoint.x, drawY, geometry.drawScale, input.motion);
        } else if (hovered) {
          drawHoverShipOutline(ctx, geometry.drawPoint.x, drawY, geometry.drawScale);
        }
        const mark = SHIP_SAIL_MARKS[ship.visual.spriteAssetId ?? ship.visual.hull] ?? SHIP_SAIL_MARKS[ship.visual.hull];
        const flutterY = isTitanSprite ? pose.sailFlutter * geometry.drawScale : 0;
        if (standardSprite) {
          const pennantSpec = pennantSpecForShip(ship, true);
          drawMastPennantChrome(ctx, ship.visual.livery, ship.symbol, geometry.drawPoint.x, drawY, geometry.drawScale, pennantSpec, pose.sailFlutter);
          if (shouldDrawBowspritLogoMark(ship.visual.sizeTier)) {
            drawBowspritLogoMark({
              ctx,
              logo: assets?.getLogo(ship.logoSrc) ?? null,
              livery: ship.visual.livery,
              mark: ship.symbol,
              spec: pennantSpec,
              scale: geometry.drawScale,
              x: geometry.drawPoint.x,
              y: drawY,
            });
          }
        } else if (dyedEmblem) {
          drawDyedSailEmblem({
            ctx,
            asset: shipAsset,
            drawX: geometry.drawPoint.x,
            drawY,
            drawScale: geometry.drawScale,
            sailMark: mark,
            livery: ship.visual.livery,
            logo: overrideEmblemLogo ?? assets?.getLogo(ship.logoSrc) ?? null,
            mark: ship.symbol,
          });
        } else if (!SHIP_SAIL_EMBLEM_PAINTED.has(ship.id)) {
          drawSailLogo({
            ctx,
            logo: assets?.getLogo(ship.logoSrc) ?? null,
            livery: ship.visual.livery,
            mark: ship.symbol,
            sailColor: ship.visual.sailColor,
            stripeColor: ship.visual.sailStripeColor,
            height: mark.height * geometry.drawScale,
            width: mark.width * geometry.drawScale,
            x: geometry.drawPoint.x + mark.x * geometry.drawScale,
            y: drawY + mark.y * geometry.drawScale + flutterY,
          });
        }
        const signalAnchor = signalOverlayAnchor(ship, geometry.drawPoint.x, drawY, geometry.drawScale, standardSprite);
        drawShipSignalOverlay(ctx, ship.visual.overlay, signalAnchor.x, signalAnchor.y, geometry.drawScale);
      });
    } else {
      const proceduralScale = camera.zoom * ship.visual.scale;
      const drawY = p.y - 4 * camera.zoom + bob;
      drawWithShipPose(ctx, p.x, drawY, pose, orientation, () => {
        if (selected) {
          drawSelectedShipOutline(ctx, p.x, drawY, proceduralScale * 0.7, input.motion);
        } else if (hovered) {
          drawHoverShipOutline(ctx, p.x, drawY, proceduralScale * 0.7);
        }
        drawMastPennantChrome(ctx, ship.visual.livery, ship.symbol, p.x, drawY, proceduralScale, PROCEDURAL_SHIP_PENNANT_MARK, pose.sailFlutter);
        if (shouldDrawBowspritLogoMark(ship.visual.sizeTier)) {
          drawBowspritLogoMark({
            ctx,
            logo: assets?.getLogo(ship.logoSrc) ?? null,
            livery: ship.visual.livery,
            mark: ship.symbol,
            spec: PROCEDURAL_SHIP_PENNANT_MARK,
            scale: proceduralScale,
            x: p.x,
            y: drawY,
          });
        }
        drawShipSignalOverlay(ctx, ship.visual.overlay, p.x - 10 * proceduralScale, drawY - 20 * proceduralScale, proceduralScale);
      });
    }
    // W6.04 — heritage-tier stern engraving. Runs OUTSIDE the pose transform
    // so the label stays axis-aligned with the camera (no roll/bob). No-op
    // when the ship isn't a heritage hull or the camera is too zoomed out.
    if (isUniqueSprite && shipAsset) {
      const drawY = geometry.drawPoint.y + bob;
      drawHeritageNameplate(ctx, ship.visual.spriteAssetId ?? null, geometry.drawPoint.x, drawY, camera.zoom, geometry.drawScale);
    }
    if (nightFactor > 0) {
      const mast = shipMastTopScreenPoint(input, frame, ship);
      const lanternZoom = input.camera.zoom * ship.visual.scale;
      const lanternAlpha = nightFactor * 0.55;
      const lanternRadius = 18 * lanternZoom;
      const sprite = getShipLanternSprite(lanternRadius);
      input.ctx.save();
      input.ctx.globalCompositeOperation = "lighter";
      if (sprite) {
        multiplyGlobalAlpha(input.ctx, lanternAlpha);
        input.ctx.drawImage(
          sprite.canvas,
          mast.x - sprite.halfSize,
          mast.y - sprite.halfSize,
          sprite.canvas.width,
          sprite.canvas.height,
        );
      } else {
        const lg = input.ctx.createRadialGradient(mast.x, mast.y, 0, mast.x, mast.y, lanternRadius);
        lg.addColorStop(0, `rgba(255, 200, 80, ${lanternAlpha})`);
        lg.addColorStop(0.4, `rgba(230, 150, 40, ${lanternAlpha * 0.45})`);
        lg.addColorStop(1, "rgba(200, 100, 20, 0)");
        input.ctx.fillStyle = lg;
        input.ctx.beginPath();
        input.ctx.arc(mast.x, mast.y, lanternRadius, 0, Math.PI * 2);
        input.ctx.fill();
      }
      input.ctx.restore();
    }
  });
}

function drawHoverShipOutline(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 214, 122, 0.86)";
  ctx.lineWidth = Math.max(1, 1.15 * scale);
  ctx.setLineDash([Math.max(2, 4 * scale), Math.max(2, 3 * scale)]);
  ctx.beginPath();
  ctx.ellipse(x, y - 18 * scale, 35 * scale, 24 * scale, -0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSelectedShipOutline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  motion: DrawPharosVilleInput["motion"],
) {
  const pulse = motion.reducedMotion ? 1 : (Math.sin(motion.timeSeconds * Math.PI * 4) * 0.5 + 0.5);
  const alpha = 0.72 + pulse * 0.22;
  ctx.save();
  ctx.strokeStyle = `rgba(255, 229, 160, ${alpha.toFixed(3)})`;
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.beginPath();
  ctx.ellipse(x, y - 18 * scale, 34 * scale, 23 * scale, -0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(98, 226, 207, ${(0.5 + pulse * 0.22).toFixed(3)})`;
  ctx.lineWidth = Math.max(1, 1.05 * scale);
  ctx.beginPath();
  ctx.ellipse(x, y - 18 * scale, 42 * scale, 28 * scale, -0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, sail: string, hull: string, zoom: number, sailFlutter = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * zoom, scale * zoom);
  const flutter = clamp(sailFlutter, 0, 1);
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.lineTo(14, 0);
  ctx.lineTo(8, 8);
  ctx.lineTo(-9, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#271b12";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#5c4932";
  ctx.fillRect(-1, -22, 2, 23);
  ctx.fillStyle = sail;
  ctx.beginPath();
  ctx.moveTo(1, -21);
  ctx.lineTo(1, -3);
  ctx.lineTo(14 + flutter * 2.4, -6 - flutter * 1.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
