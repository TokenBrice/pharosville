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

export interface DrawPharosVilleInput {
  assets: PharosVilleAssetManager | null;
  cacheMode?: PharosVilleRenderCacheMode;
  camera: IsoCamera;
  ctx: CanvasRenderingContext2D;
  dpr?: number;
  height: number;
  hoveredTarget: HitTarget | null;
  motion: PharosVilleCanvasMotion;
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
