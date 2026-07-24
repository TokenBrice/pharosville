export type PharosVilleRenderSchedulerTier =
  | "full"
  | "balanced"
  | "interaction"
  | "constrained"
  | "recovery";

export interface PharosVilleRenderSchedulerState {
  targetFrameMs: number;
  tier: PharosVilleRenderSchedulerTier;
}

export interface PharosVilleRenderMetrics {
  activeLaneCount?: number;
  bucketFlipCount?: number;
  composerEnabled?: boolean;
  objectCount: number;
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
  schedulerTier?: PharosVilleRenderSchedulerTier;
  shipMaxHeadingDeltaDeg?: number;
  shipMaxPositionDeltaTile?: number;
  visibleShipCount: number;
}
