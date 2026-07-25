export type PharosVilleRenderSchedulerTier =
  | "full"
  | "balanced"
  | "interaction"
  | "constrained"
  | "recovery";

export interface PharosVilleRenderSchedulerState {
  targetFrameMs: number;
  tier: PharosVilleRenderSchedulerTier;
  /**
   * The tier this frame would be at if the camera were still — i.e. the
   * hysteresis ladder's current load reading, which `interaction` masks.
   *
   * `tier` conflates two unrelated things: measured GPU load, and whether the
   * user happens to be moving the camera. Systems that shed *quality* want the
   * former; only systems that shed genuine per-frame work want the latter. See
   * `seaQualityTier`.
   *
   * Optional so existing callers and tests that build a bare `{ tier }` keep
   * working; absent, consumers fall back to `tier`.
   */
  loadTier?: Exclude<PharosVilleRenderSchedulerTier, "interaction">;
}

export interface PharosVilleRenderMetrics {
  activeLaneCount?: number;
  bucketFlipCount?: number;
  composerEnabled?: boolean;
  /** W1 evidence: draw calls the instanced fleet contributes, whatever its size. */
  fleetDrawCallCount?: number;
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
