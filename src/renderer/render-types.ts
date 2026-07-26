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
  /** Number of baked Three.js content roots created in this renderer session. */
  contentReplacementCount?: number;
  /** Per-content-family hashes used to attribute refresh-driven replacements. */
  contentSignaturePartHashes?: Readonly<Record<string, string>>;
  /** W1 evidence: draw calls the instanced fleet contributes, whatever its size. */
  fleetDrawCallCount?: number;
  objectCount: number;
  postPassList?: readonly string[];
  /**
   * GPU resources (shader programs, geometry buffers, textures) this frame had
   * to create for the first time.
   *
   * A frame that compiles a shader or uploads a buffer is paying a one-off
   * warm-up cost, not reporting a rendering budget, so the render loop keeps it
   * out of the load measurement entirely. Steady-state frames read 0.
   */
  gpuWarmupCount?: number;
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
