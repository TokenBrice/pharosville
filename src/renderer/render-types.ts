export type WorldDrawablePass = "underlay" | "body" | "overlay" | "selection";

export type PharosVilleRenderSchedulerTier =
  | "full"
  | "balanced"
  | "interaction"
  | "constrained"
  | "recovery";

export interface PharosVilleRenderSchedulerState {
  degradedPasses: readonly string[];
  skippedPasses: readonly string[];
  targetFrameMs: number;
  tier: PharosVilleRenderSchedulerTier;
}

export interface PharosVilleRenderMetrics {
  activeLaneCount?: number;
  bucketFlipCount?: number;
  composerEnabled?: boolean;
  drawableCount: number;
  drawableCounts: Record<WorldDrawablePass, number>;
  postPassList?: readonly string[];
  shadowMapSize?: number;
  longtask?: { count: number; maxDurationMs: number };
  movingShipCount: number;
  renderBudgetTargetMs?: number;
  routeCacheStats?: {
    capacity: number;
    evictionRate: number;
    hitRatio: number;
    size: number;
  };
  schedulerDegradedPasses?: readonly string[];
  schedulerSkippedPasses?: readonly string[];
  schedulerTier?: PharosVilleRenderSchedulerTier;
  shipMaxHeadingDeltaDeg?: number;
  shipMaxPositionDeltaTile?: number;
  visibleShipCount: number;
  visibleTileCount: number;
}
