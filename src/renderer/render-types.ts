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
  // C4 (Garden Sea debug & evidence contract, frozen in P0): these fields are
  // published on `__pharosVilleDebug.renderMetrics` and reused by every visual
  // packet's evidence JSON. cloudShadowsOn/rippleRingCount are P0 stubs —
  // Lane W wires the real values via contract C2; zoneRadii is live data.
  sessionTierReached?: PharosVilleRenderSchedulerTier;
  cloudShadowsOn?: boolean;
  rippleRingCount?: number;
  zoneRadii?: readonly { id: string; radiusX: number; radiusZ: number }[];
  shipMaxHeadingDeltaDeg?: number;
  shipMaxPositionDeltaTile?: number;
  visibleShipCount: number;
}
