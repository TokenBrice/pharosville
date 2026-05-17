import type { PharosVilleMotionPlan, ShipMotionSample } from "../systems/motion";
import type { IsoCamera } from "../systems/projection";
import type { PharosVilleWorld } from "../systems/world-types";
import type { PharosVilleAssetManager } from "./asset-manager";
import type { WorldDrawablePass } from "./drawable-pass";
import type { HitTarget } from "./hit-testing";
import type { VisibleTileBoundsCacheState } from "./viewport";

export interface PharosVilleCanvasMotion {
  plan: PharosVilleMotionPlan;
  reducedMotion: boolean;
  timeSeconds: number;
  /**
   * User's local wall-clock hour as a fractional value in [0, 24).
   * Production: derived from `new Date().getHours() + getMinutes()/60` (or 12
   * when reducedMotion is true, so RM users get a stable noon scene).
   * Tests: overridden via `installWallClockOverride(page, hour)` (Playwright
   * `addInitScript` overriding `Date.prototype.getHours`/`getMinutes`).
   */
  wallClockHour: number;
}

export type PharosVilleRenderCacheMode = "bucketed" | "exact-zoom";
export type PharosVilleRenderZoomKeyMode = "bucketed-percent" | "exact";
export type PharosVilleRenderSchedulerTier = "full" | "interaction" | "constrained" | "recovery";

export interface PharosVilleRenderSchedulerState {
  degradedPasses: readonly string[];
  skippedPasses: readonly string[];
  targetFrameMs: number;
  tier: PharosVilleRenderSchedulerTier;
}

export interface DrawPharosVilleInput {
  assets: PharosVilleAssetManager | null;
  cacheMode?: PharosVilleRenderCacheMode;
  camera: IsoCamera;
  ctx: CanvasRenderingContext2D;
  dpr?: number;
  height: number;
  hoveredTarget: HitTarget | null;
  motion: PharosVilleCanvasMotion;
  /**
   * First-load reveal beat progress in [0, 1]. Default `1` means fully
   * revealed (steady state). The render loop ramps this from 0 → 1 over
   * ~1.8s on cold mount, then leaves it at 1. Reduced-motion clients skip the
   * tween and pass `1` immediately. See `applyRevealEnvelope` and W4.01.
   */
  revealEnvelope?: number;
  renderScheduler?: PharosVilleRenderSchedulerState;
  selectedTarget: HitTarget | null;
  shipMotionSamples?: ReadonlyMap<string, ShipMotionSample>;
  visibleTileBoundsCache?: VisibleTileBoundsCacheState;
  targets: readonly HitTarget[];
  width: number;
  world: PharosVilleWorld;
}

export interface PharosVilleBackingMetrics {
  dynamicCacheEntryCount: number;
  dynamicCachePixels: number;
  mainCanvasPixels: number;
  maxMainCanvasPixels: number;
  maxTotalBackingPixels: number;
  offscreenCachePixels: number;
  overBudgetPixels: number;
  remainingOffscreenPixels: number;
  spriteCacheEntryCount: number;
  spriteCachePixels: number;
  staticCacheEntryCount: number;
  staticCachePixels: number;
  totalBackingPixels: number;
  totalCacheEntryCount: number;
}

export interface PharosVilleRenderCacheMetrics {
  budgetEvictionCount: number;
  budgetSkipCount: number;
  cacheMode: PharosVilleRenderCacheMode;
  dynamicCameraOffsetBucketPx: number;
  dynamicHitCount: number;
  dynamicMissCount: number;
  dynamicRepaintCount: number;
  dynamicWaterCadenceHz: number;
  staticCameraOffsetBucketPx: number;
  staticHitCount: number;
  staticMissCount: number;
  zoomKeyMode: PharosVilleRenderZoomKeyMode;
}

export interface PharosVilleRenderMetrics {
  backing?: PharosVilleBackingMetrics;
  cache?: PharosVilleRenderCacheMetrics;
  drawableCounts: Record<WorldDrawablePass, number>;
  drawableCount: number;
  movingShipCount: number;
  visibleShipCount: number;
  visibleTileCount: number;
  /** Number of visible water tiles touched by the direct continuous accent pass. */
  waterAccentTileCount?: number;
  /** Wall-clock draw duration for the direct continuous water accent pass. */
  waterAccentDrawMs?: number;
  /** Rendering strategy for water accents. */
  waterAccentMode?: "direct" | "reduced-motion-direct";
  /** Current renderer quality tier for low-priority visual effects. */
  schedulerTier?: PharosVilleRenderSchedulerTier;
  /** Decorative passes reduced by the render scheduler this frame. */
  schedulerDegradedPasses?: readonly string[];
  /** Decorative passes skipped by the render scheduler this frame. */
  schedulerSkippedPasses?: readonly string[];
  /** Scheduler frame-time target used for this frame. */
  renderBudgetTargetMs?: number;
  /** Max |heading delta| in degrees across all ships this frame. */
  shipMaxHeadingDeltaDeg?: number;
  /** Max Euclidean position delta in tiles across all ships since last frame. */
  shipMaxPositionDeltaTile?: number;
  /** Route-cache hit ratio and eviction rate at time of read. */
  routeCacheStats?: { hitRatio: number; evictionRate: number; size: number; capacity: number };
  /** PerformanceObserver longtask counts over the last 60-frame window. */
  longtask?: { count: number; maxDurationMs: number };
  /** Total number of 600-second bucket flips since world mount. */
  bucketFlipCount?: number;
}
