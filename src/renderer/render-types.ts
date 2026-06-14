import type { PharosVilleMotionPlan, ShipMotionSample } from "../systems/motion";
import type { IsoCamera } from "../systems/projection";
import type { SeaState } from "../systems/sea-state";
import type { PharosVilleWorld } from "../systems/world-types";
import type { PharosVilleAssetManager } from "./asset-manager";
import type { WorldDrawablePass } from "./drawable-pass";
import type { HitTarget } from "./hit-testing";
import type { ShipBodyCacheStats } from "./ship-body-cache";
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
  /** True when the hovered target is the keyboard-focused entity (Tab
      cycling); the selection layer renders a distinct focus beacon so
      keyboard users can see where focus sits on the map. */
  hoveredTargetKeyboardFocused?: boolean;
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
  /** Frame-level sea state computed once by the render loop. */
  seaState?: SeaState | null;
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
  /** Number of nearshore tiles touched by the dynamic coastal motif/spray pass. */
  coastalWaterTileCount?: number;
  /** Wall-clock draw duration for the direct continuous water accent pass. */
  waterAccentDrawMs?: number;
  /** Rendering strategy for water accents. */
  waterAccentMode?: "direct" | "reduced-motion-direct";
  /** Wall-clock draw duration for the sky backdrop pass. */
  skyDrawMs?: number;
  /** Combined wall-clock blit duration for the cached terrain + scene static passes. */
  staticBlitDrawMs?: number;
  /** Wall-clock draw duration for the z-sorted entity pass plus squad chrome. */
  entityPassDrawMs?: number;
  /** Wall-clock draw duration for the fleet-wide ticker nameplate pass. */
  nameplateDrawMs?: number;
  /** Number of ticker nameplates drawn this frame (zoom-gated). */
  nameplateDrawCount?: number;
  /** Combined wall-clock duration for ambient/effect passes (surf, caustics,
      labels, night, weather, birds, grain, …) outside entity/selection work. */
  ambientDrawMs?: number;
  /** Wall-clock draw duration for the selection chrome pass. */
  selectionChromeDrawMs?: number;
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
  /** Ship-body precompose cache counters (cumulative since cache creation).
      V4.2: grounds cap/cardinality tuning before V3.1 poses and V3.5
      weathering widen the key space. */
  shipBodyCacheStats?: ShipBodyCacheStats;
  /** PerformanceObserver longtask counts over the last 60-frame window. */
  longtask?: { count: number; maxDurationMs: number };
  /** Total number of 600-second bucket flips since world mount. */
  bucketFlipCount?: number;
}
