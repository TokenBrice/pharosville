// Owns the requestAnimationFrame draw loop, per-frame timing/metrics refs,
// hit-target snapshot maintenance during the frame, ship motion sample
// collection, and visual debug telemetry. Shared cross-hook refs (camera,
// canvas size, hit-targets, samples) are passed in.
import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import type { PharosVilleAssetLoadError, PharosVilleAssetLoadStats, PharosVilleAssetManager } from "../renderer/asset-manager";
import {
  collectDisplaySampleHitTargetChanges,
  createHitTargetSnapshot,
  recomputeHitTargetsForCameraOnly,
  updateHitTargetSnapshotShips,
  type HitTarget,
  type HitTargetSnapshot,
} from "../renderer/hit-testing";
import { selectionDrawableCount } from "../renderer/layers/selection";
import { drawPharosVille, releasePharosVilleRendererCaches, type PharosVilleRenderMetrics } from "../renderer/world-canvas";
import { createRenderSchedulerHysteresisState, resolveRenderSchedulerState } from "../renderer/render-scheduler";
import type { RenderSchedulerHysteresisState } from "../renderer/render-scheduler";
import { createVisibleTileBoundsCacheState } from "../renderer/viewport";
import { clampCameraToMap } from "../systems/camera";
import {
  createDrawDurationWindow,
  pushDrawDurationSample,
  resolveAdaptiveDprState,
  resolveCanvasBudget,
  type AdaptiveDprState,
  type DrawDurationWindow,
} from "../systems/canvas-budget";
import {
  getSailEmblemSpriteCacheStats,
  getSailLogoSpriteCacheStats,
  getShipSailTintCacheStats,
  type CacheStats,
} from "../renderer/layers/ships";
import {
  buildMotionPlan,
  createShipMotionSample,
  getCurrentMapPathCacheStats,
  isShipMapVisible,
  motionPlanSignature,
  resolveShipMotionSampleInto,
  type ShipMotionSample,
} from "../systems/motion";
import { applySeaRoomSeparationPass } from "../systems/motion-sampling";
import type { IsoCamera, ScreenPoint } from "../systems/projection";
import { seaStateForWorld, type SeaState } from "../systems/sea-state";
import { createVisualMotionSmoothingState, resetVisualMotionSmoothingState, smoothShipMotionSamples } from "../systems/visual-motion";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import { sameCamera } from "../lib/camera-equality";
import { normalizeHour } from "../lib/pharosville-clock";
import {
  createFrameIntervalWindow,
  createLongtaskWindow,
  createNumericMaxWindow,
  emptyFramePacingMetrics,
  pushFrameIntervalSample,
  pushLongtaskWindow,
  pushNumericMaxWindow,
  type FrameIntervalWindow,
  type FramePacingMetrics,
  type LongtaskWindow,
  type NumericMaxWindow,
} from "./world-render-loop-metrics";

type MotionPlan = ReturnType<typeof buildMotionPlan>;

type DebugRenderMetrics = PharosVilleRenderMetrics & {
  drawDurationMs: number;
  framePacing: FramePacingMetrics;
  debugPublishDurationMs?: number;
  hitTargetChangedShipCount?: number;
  hitTargetDurationMs?: number;
  sampleDurationMs?: number;
  snapshotRebuildCount?: number;
  telemetryOverheadMs?: number;
  timeToFirstCoherentFrameMs?: number;
};

interface LastTilePositionSample {
  currentRouteStopId: string | null;
  headingX: number;
  headingY: number;
  routePathKey: string | null | undefined;
  state: ShipMotionSample["state"];
  timeSeconds: number;
  visibilityAlpha: number;
  x: number;
  y: number;
}

interface DetailAnchor extends ScreenPoint {
  side: "left" | "right";
}

export interface UseWorldRenderLoopInput {
  /**
   * Called when the deterministic time bucket flips (every ~10 minutes of
   * wall clock). The hook mirrors the latest callback into a ref so RAF and
   * reduced-motion timer paths can share bucket advancement without rebinding
   * the frame loop.
   */
  onBucketFlip?: (bucket: number) => void;
  adaptiveDprStateRef: MutableRefObject<AdaptiveDprState>;
  assetLoadErrors: PharosVilleAssetLoadError[];
  assetLoadTick: number;
  assetManager: PharosVilleAssetManager;
  camera: IsoCamera | null;
  cameraRef: MutableRefObject<IsoCamera | null>;
  canvasBudgetRef: MutableRefObject<ReturnType<typeof resolveCanvasBudget> | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canvasSize: ScreenPoint;
  canvasSizeRef: MutableRefObject<ScreenPoint>;
  criticalAssetAttemptsSettled: boolean;
  criticalAssetsLoaded: boolean;
  deferredAssetsLoaded: boolean;
  hitTargetSnapshotRef: MutableRefObject<HitTargetSnapshot | null>;
  hitTargetsRef: MutableRefObject<readonly HitTarget[]>;
  hoveredDetailId: string | null;
  hoveredDetailIdRef: MutableRefObject<string | null>;
  /** Hover tooltip DOM node. The loop writes its position/visibility directly
      (style.transform + data-visible) each frame so the tooltip tracks moving
      ships without any React re-render in the RAF path. */
  hoverTooltipElRef?: RefObject<HTMLDivElement | null>;
  /** Latest keyboard-focused detail id; drives the canvas focus beacon when it
      matches the hovered target (keyboard cycling sets hover = focus). */
  keyboardFocusedDetailIdRef?: MutableRefObject<string | null>;
  maximumRequestedDprRef: MutableRefObject<number>;
  mountEpochMsRef: MutableRefObject<number>;
  motionPlan: MotionPlan;
  motionPlanRef: MutableRefObject<MotionPlan>;
  reducedMotion: boolean;
  /**
   * W4.01 reveal envelope in [0, 1]. The render loop reads `.current` per
   * frame; owners drive it from `pharosville-world.tsx` with a RAF tween on
   * cold mount. When omitted, the loop passes `1` (steady state). Reduced
   * motion clients should keep this at `1` (no tween).
   */
  revealEnvelopeRef?: MutableRefObject<number>;
  selectedDetailAnchor: DetailAnchor | null;
  selectedDetailId: string | null;
  selectedDetailIdRef: MutableRefObject<string | null>;
  setCriticalFramePainted: Dispatch<SetStateAction<boolean>>;
  shipMotionSamplesRef: MutableRefObject<ReadonlyMap<string, ShipMotionSample>>;
  shipsById: ReadonlyMap<string, PharosVilleWorldModel["ships"][number]>;
  stepCamera: (now: number, shipMotionSamples: ReadonlyMap<string, ShipMotionSample>) => WorldCameraStepResult;
  wallClockHour: number;
  world: PharosVilleWorldModel;
}

export interface UseWorldRenderLoopResult {
  frameRateFps: number | null;
  requestPaint: () => void;
}

export interface WorldCameraStepResult {
  camera: IsoCamera | null;
  cameraChanged: boolean;
  cameraIntentActive: boolean;
}

export function useWorldRenderLoop(input: UseWorldRenderLoopInput): UseWorldRenderLoopResult {
  const {
    onBucketFlip,
    adaptiveDprStateRef,
    assetLoadErrors,
    assetLoadTick,
    assetManager,
    camera,
    cameraRef,
    canvasBudgetRef,
    canvasRef,
    canvasSize,
    canvasSizeRef,
    criticalAssetAttemptsSettled,
    criticalAssetsLoaded,
    deferredAssetsLoaded,
    hitTargetSnapshotRef,
    hitTargetsRef,
    hoveredDetailId,
    hoveredDetailIdRef,
    hoverTooltipElRef,
    keyboardFocusedDetailIdRef,
    maximumRequestedDprRef,
    mountEpochMsRef,
    motionPlan,
    motionPlanRef,
    reducedMotion,
    revealEnvelopeRef,
    selectedDetailAnchor,
    selectedDetailId,
    selectedDetailIdRef,
    setCriticalFramePainted,
    shipMotionSamplesRef,
    shipsById,
    stepCamera,
    wallClockHour,
    world,
  } = input;

  // Mirror criticalAssetAttemptsSettled into a ref so the RAF loop reads the
  // latest value without rebinding when it transitions from false → true.
  const criticalAssetAttemptsSettledRef = useRef(criticalAssetAttemptsSettled);
  useEffect(() => {
    criticalAssetAttemptsSettledRef.current = criticalAssetAttemptsSettled;
  }, [criticalAssetAttemptsSettled]);
  const stepCameraRef = useRef(stepCamera);
  useEffect(() => {
    stepCameraRef.current = stepCamera;
  }, [stepCamera]);

  const onBucketFlipRef = useRef(onBucketFlip);
  useEffect(() => {
    onBucketFlipRef.current = onBucketFlip;
  }, [onBucketFlip]);

  const animationFramePendingRef = useRef(false);
  const paintRequestRef = useRef<() => void>(() => {});
  const requestPaint = useCallback(() => {
    paintRequestRef.current();
  }, []);
  const [frameRateFps, setFrameRateFps] = useState<number | null>(null);
  const frameRatePublishRef = useRef<{ fps: number | null; lastPublishedAtMs: number }>({
    fps: null,
    lastPublishedAtMs: 0,
  });
  const visibleTileBoundsCacheRef = useRef(createVisibleTileBoundsCacheState());
  // Tracks whether the canvas is currently visible enough to be worth drawing.
  // The RAF effect updates this from an IntersectionObserver + visibilitychange
  // handler and gates both the loop and on-demand paints.
  const canvasIsVisibleRef = useRef(true);
  const drawDurationWindowRef = useRef<DrawDurationWindow>(createDrawDurationWindow());
  const drawDurationStatsRef = useRef<{ averageMs: number; count: number; p90Ms: number }>({
    averageMs: 0,
    count: 0,
    p90Ms: 0,
  });
  const criticalFramePaintedRef = useRef(false);
  const lastWallRef = useRef<number | null>(null);
  const frameIntervalWindowRef = useRef<FrameIntervalWindow>(createFrameIntervalWindow());
  const framePacingStatsRef = useRef<FramePacingMetrics>(emptyFramePacingMetrics());
  const renderSchedulerHysteresisRef = useRef<RenderSchedulerHysteresisState>(createRenderSchedulerHysteresisState());
  const compactShipMotionSampleCacheRef = useRef<CompactShipMotionSampleCache>(createCompactShipMotionSampleCache());
  const accSecondsRef = useRef(0);
  const pendingResumeRef = useRef(false);
  const motionFrameCountRef = useRef(0);
  const reducedMotionSamplesSignatureRef = useRef<string | null>(null);
  const lastRenderMetricsRef = useRef<DebugRenderMetrics>({
    drawableCount: 0,
    drawableCounts: { underlay: 0, body: 0, overlay: 0, selection: 0 },
    drawDurationMs: 0,
    framePacing: emptyFramePacingMetrics(),
    movingShipCount: 0,
    visibleShipCount: 0,
    visibleTileCount: 0,
  });
  // A1/A2/A5 rolling debug windows. Fixed-size rings avoid per-frame
  // push/shift/copy churn while preserving the debug fields used by perf tests.
  const headingDeltaWindowRef = useRef<NumericMaxWindow>(createNumericMaxWindow(60));
  // A2: scratch map tracking each ship's last-known tile position.
  const lastTilePosRef = useRef<Map<string, LastTilePositionSample>>(new Map());
  const positionDeltaWindowRef = useRef<NumericMaxWindow>(createNumericMaxWindow(60));
  const longtaskWindowRef = useRef<LongtaskWindow>(createLongtaskWindow(60));
  // A5: accumulator for longtasks seen since the last frame flush.
  const longtaskAccRef = useRef<{ count: number; maxDurationMs: number }>({ count: 0, maxDurationMs: 0 });
  // A5: PerformanceObserver disconnect handle (set when observer is created).
  const longtaskObserverRef = useRef<PerformanceObserver | null>(null);
  const lastBucketRef = useRef(0);
  const bucketFlipCountRef = useRef(0);
  const semanticShipMotionSamplesRef = useRef<ReadonlyMap<string, ShipMotionSample>>(new Map());
  const visualMotionStateRef = useRef(createVisualMotionSmoothingState());
  const shipHitRefreshCursorRef = useRef(0);
  const hitTargetCameraRef = useRef<IsoCamera | null>(null);
  const frameStateRef = useRef<{
    samples: ReadonlyMap<string, ShipMotionSample>;
    hoveredTarget: HitTarget | null;
    targets: readonly HitTarget[];
    selectedTarget: HitTarget | null;
    timeSeconds: number;
    wallClockHour: number;
  }>({
    hoveredTarget: null,
    samples: new Map(),
    selectedTarget: null,
    targets: [],
    timeSeconds: 0,
    wallClockHour: 0,
  });

  const resetFramePacingState = useCallback(() => {
    lastWallRef.current = null;
    drawDurationWindowRef.current = createDrawDurationWindow();
    drawDurationStatsRef.current = { averageMs: 0, count: 0, p90Ms: 0 };
    frameIntervalWindowRef.current = createFrameIntervalWindow();
    framePacingStatsRef.current = emptyFramePacingMetrics();
    frameRatePublishRef.current = { fps: null, lastPublishedAtMs: 0 };
    renderSchedulerHysteresisRef.current = createRenderSchedulerHysteresisState();
  }, []);

  const advanceMotionBucket = useCallback((newBucket: number) => {
    if (newBucket === lastBucketRef.current) return false;
    lastBucketRef.current = newBucket;
    bucketFlipCountRef.current += 1;
    onBucketFlipRef.current?.(newBucket);
    return true;
  }, []);

  // Reset per-world transient state (timing, samples, hit snapshot) when the
  // world reference changes.
  useEffect(() => {
    resetFramePacingState();
    accSecondsRef.current = 0;
    pendingResumeRef.current = false;
    motionFrameCountRef.current = 0;
    visibleTileBoundsCacheRef.current = createVisibleTileBoundsCacheState();
    semanticShipMotionSamplesRef.current = new Map();
    shipMotionSamplesRef.current = new Map();
    resetVisualMotionSmoothingState(visualMotionStateRef.current);
    shipHitRefreshCursorRef.current = 0;
    hitTargetCameraRef.current = null;
    hitTargetSnapshotRef.current = null;
    hitTargetsRef.current = [];
    reducedMotionSamplesSignatureRef.current = null;
    compactShipMotionSampleCacheRef.current = createCompactShipMotionSampleCache();
    headingDeltaWindowRef.current = createNumericMaxWindow(60);
    positionDeltaWindowRef.current = createNumericMaxWindow(60);
    lastTilePosRef.current.clear();
    longtaskWindowRef.current = createLongtaskWindow(60);
    longtaskAccRef.current = { count: 0, maxDurationMs: 0 };
    lastBucketRef.current = 0;
    bucketFlipCountRef.current = 0;
  }, [hitTargetSnapshotRef, hitTargetsRef, resetFramePacingState, shipMotionSamplesRef, world]);

  useEffect(() => {
    resetFramePacingState();
  }, [canvasSize.x, canvasSize.y, resetFramePacingState]);

  useEffect(() => () => {
    releasePharosVilleRendererCaches();
  }, []);

  useEffect(() => {
    if (!reducedMotion) return;
    frameRatePublishRef.current = { fps: null, lastPublishedAtMs: 0 };
  }, [reducedMotion]);

  // RAF effect — bound once per plumbing change (`world`, `canvasSize`,
  // `reducedMotion`, `assetManager`, `cameraReady`, `wallClockHour`, `shipsById`).
  // All other inputs (hoveredDetailId, selectedDetailId, motionPlan, camera,
  // criticalAssetAttemptsSettled) are read through refs. Per-hover/select
  // repaints under reduced motion are routed through `requestPaint()` so the
  // loop is not torn down on every interaction. Asset-load ticks also call
  // `requestPaint()` to repaint when sprites arrive without rebinding.
  //
  // The IntersectionObserver + visibilitychange handler are owned by the same
  // effect so their lifecycle is bound to the RAF loop. When the canvas leaves
  // the viewport (intersectionRatio < 0.05) or the tab is hidden, the loop
  // pauses by cancelling the pending frame; when visible again it resumes via
  // scheduleFrame() to paint the current state.
  const cameraReady = camera !== null;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cameraReady || canvasSize.x <= 0 || canvasSize.y <= 0) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    if (!canvasBudgetRef.current) {
      const requestedDpr = adaptiveDprStateRef.current.requestedDpr || Math.max(1, window.devicePixelRatio || 1);
      canvasBudgetRef.current = resolveCanvasBudget({
        cssHeight: canvasSize.y,
        cssWidth: canvasSize.x,
        requestedDpr,
      });
    }
    let frameId = 0;
    let intersectionRatio = 1;
    let documentHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    canvasIsVisibleRef.current = !documentHidden && intersectionRatio >= 0.05;
    const scheduleFrame = () => {
      if (animationFramePendingRef.current) return;
      if (!canvasIsVisibleRef.current) return;
      animationFramePendingRef.current = true;
      frameId = requestAnimationFrame(drawFrame);
    };
    const scheduleNextAnimatedFrame = () => {
      if (!reducedMotion) scheduleFrame();
    };
    const drawFrame = (time: number) => {
      animationFramePendingRef.current = false;
      const activeCamera = cameraRef.current;
      const activeCanvasSize = canvasSizeRef.current;
      const activeMotionPlan = motionPlanRef.current;
      const activeHoveredDetailId = hoveredDetailIdRef.current;
      const activeSelectedDetailId = selectedDetailIdRef.current;
      const activeCriticalSettled = criticalAssetAttemptsSettledRef.current;
      if (!activeCamera || activeCanvasSize.x <= 0 || activeCanvasSize.y <= 0) {
        scheduleNextAnimatedFrame();
        return;
      }
      const activeBudget = canvasBudgetRef.current ?? resolveCanvasBudget({
        cssHeight: activeCanvasSize.y,
        cssWidth: activeCanvasSize.x,
        requestedDpr: adaptiveDprStateRef.current.requestedDpr,
      });
      canvasBudgetRef.current = activeBudget;
      if (canvas.width !== activeBudget.backingWidth) canvas.width = activeBudget.backingWidth;
      if (canvas.height !== activeBudget.backingHeight) canvas.height = activeBudget.backingHeight;
      const dpr = activeBudget.effectiveDpr;
      let timeSeconds: number;
      if (reducedMotion) {
        timeSeconds = 0;
      } else {
        const previousWall = lastWallRef.current;
        const last = previousWall ?? time;
        const rawDt = Math.max((time - last) / 1000, 0);
        if (previousWall !== null && !pendingResumeRef.current) {
          framePacingStatsRef.current = pushFrameIntervalSample(frameIntervalWindowRef.current, Math.max(time - previousWall, 0));
          const framePacing = framePacingStatsRef.current;
          const roundedFps = framePacing.sampleCount > 0 && Number.isFinite(framePacing.effectiveFps)
            ? Math.max(0, Math.round(framePacing.effectiveFps))
            : null;
          if (roundedFps !== null) {
            const published = frameRatePublishRef.current;
            if (
              published.fps === null
              || (roundedFps !== published.fps && time - published.lastPublishedAtMs >= FRAME_RATE_LABEL_UPDATE_MS)
            ) {
              frameRatePublishRef.current = { fps: roundedFps, lastPublishedAtMs: time };
              setFrameRateFps(roundedFps);
            }
          }
        }
        // Skip accumulating across known tab-pause transitions. For ordinary
        // RAF stalls, cap the world-clock step so ships do not visually hop
        // across a delayed frame; very large deltas are reserved for Playwright
        // fake-clock jumps used by visual tests.
        const dt = pendingResumeRef.current
          ? 0
          : rawDt >= TEST_CLOCK_JUMP_DELTA_SECONDS
            ? rawDt
            : Math.min(rawDt, MAX_WORLD_FRAME_DELTA_SECONDS);
        pendingResumeRef.current = false;
        accSecondsRef.current += dt;
        lastWallRef.current = time;
        timeSeconds = accSecondsRef.current;
        advanceMotionBucket(Math.floor(accSecondsRef.current / MOTION_BUCKET_INTERVAL_SECONDS));
      }
      const frameWallClockHour = normalizeHour(wallClockHour);
      const sampleStartedAt = performance.now();
      const seaState = seaStateForWorld(world, { reducedMotion, wallClockHour: frameWallClockHour });
      let semanticShipMotionSamples = semanticShipMotionSamplesRef.current;
      if (reducedMotion) {
        const nextSamplesSignature = `${motionPlanSignature(world)}|sea:${seaStateMotionSignature(seaState)}`;
        if (reducedMotionSamplesSignatureRef.current !== nextSamplesSignature || semanticShipMotionSamples.size === 0) {
          const collected = collectShipMotionSamples({
            motionPlan: activeMotionPlan,
            reducedMotion,
            seaState,
            samples: semanticShipMotionSamples,
            timeSeconds,
            world,
          });
          semanticShipMotionSamples = collected.samples;
          reducedMotionSamplesSignatureRef.current = nextSamplesSignature;
        }
      } else {
        const collected = collectShipMotionSamples({
          motionPlan: activeMotionPlan,
          reducedMotion,
          seaState,
          samples: semanticShipMotionSamples,
          timeSeconds,
          world,
        });
        semanticShipMotionSamples = collected.samples;
        reducedMotionSamplesSignatureRef.current = null;
      }
      semanticShipMotionSamplesRef.current = semanticShipMotionSamples;
      const shipMotionSamples = smoothShipMotionSamples({
        reducedMotion,
        state: visualMotionStateRef.current,
        staticMode: reducedMotion,
        targetSamples: semanticShipMotionSamples,
        timeSeconds,
      });
      shipMotionSamplesRef.current = shipMotionSamples;
      const sampleDurationMs = performance.now() - sampleStartedAt;
      const hitTargetStartedAt = performance.now();
      let hitTargetChangedShipCount = 0;
      let snapshotRebuildCount = 0;
      const cameraStep = stepCameraRef.current(time, shipMotionSamples);
      const frameCamera = cameraStep.camera ?? cameraRef.current;
      if (!frameCamera) {
        scheduleNextAnimatedFrame();
        return;
      }
      const hitTargetsNeedCameraProjection = cameraStep.cameraChanged || !sameCamera(hitTargetCameraRef.current, frameCamera);
      if (!hitTargetSnapshotRef.current) {
        const nextSnapshot = createHitTargetSnapshot({
          assets: assetManager,
          camera: frameCamera,
          hoveredDetailId: activeHoveredDetailId,
          selectedDetailId: activeSelectedDetailId,
          shipMotionSamples,
          viewport: { height: activeCanvasSize.y, width: activeCanvasSize.x },
          world,
        });
        hitTargetSnapshotRef.current = nextSnapshot;
        hitTargetsRef.current = nextSnapshot.targets;
        hitTargetCameraRef.current = frameCamera;
        snapshotRebuildCount += 1;
      } else if (hitTargetsNeedCameraProjection) {
        const nextSnapshot = recomputeHitTargetsForCameraOnly({
          assets: assetManager,
          camera: frameCamera,
          hoveredDetailId: activeHoveredDetailId,
          selectedDetailId: activeSelectedDetailId,
          shipMotionSamples,
          snapshot: hitTargetSnapshotRef.current,
          viewport: { height: activeCanvasSize.y, width: activeCanvasSize.x },
          world,
        });
        hitTargetSnapshotRef.current = nextSnapshot;
        hitTargetsRef.current = nextSnapshot.targets;
        hitTargetCameraRef.current = frameCamera;
        snapshotRebuildCount += 1;
      } else {
        const shipIdsForHitRefresh = collectShipHitRefreshIds({
          cursorRef: shipHitRefreshCursorRef,
          hoveredDetailId: activeHoveredDetailId,
          selectedDetailId: activeSelectedDetailId,
          world,
        });
        const changedShipIds = collectDisplaySampleHitTargetChanges({
          assets: assetManager,
          camera: frameCamera,
          hoveredDetailId: activeHoveredDetailId,
          minScreenDeltaPx: 0.35,
          selectedDetailId: activeSelectedDetailId,
          shipIds: shipIdsForHitRefresh,
          shipMotionSamples,
          snapshot: hitTargetSnapshotRef.current,
          world,
          worldShipsById: shipsById,
        });
        hitTargetChangedShipCount = changedShipIds.length;
        if (changedShipIds.length > 0) {
          const nextSnapshot = updateHitTargetSnapshotShips({
            assets: assetManager,
            camera: frameCamera,
            changedShipIds,
            hoveredDetailId: activeHoveredDetailId,
            selectedDetailId: activeSelectedDetailId,
            shipMotionSamples,
            snapshot: hitTargetSnapshotRef.current,
            viewport: { height: activeCanvasSize.y, width: activeCanvasSize.x },
            world,
            worldShipsById: shipsById,
          });
          hitTargetSnapshotRef.current = nextSnapshot;
          hitTargetsRef.current = nextSnapshot.targets;
          snapshotRebuildCount += 1;
        }
      }
      const hitTargetDurationMs = performance.now() - hitTargetStartedAt;
      const targets = hitTargetsRef.current;
      const nextFrameState = frameStateRef.current;
      const targetByDetailId = hitTargetSnapshotRef.current?.targetsByDetailId;
      nextFrameState.samples = shipMotionSamples;
      nextFrameState.targets = targets;
      nextFrameState.hoveredTarget = activeHoveredDetailId
        ? targetByDetailId?.get(activeHoveredDetailId) ?? null
        : null;
      nextFrameState.selectedTarget = activeSelectedDetailId
        ? targetByDetailId?.get(activeSelectedDetailId) ?? null
        : null;
      nextFrameState.timeSeconds = timeSeconds;
      nextFrameState.wallClockHour = frameWallClockHour;
      const nextHoveredTarget = nextFrameState.hoveredTarget;
      const nextSelectedTarget = nextFrameState.selectedTarget;
      const tooltipEl = hoverTooltipElRef?.current;
      if (tooltipEl) {
        if (nextHoveredTarget) {
          const rect = nextHoveredTarget.rect;
          const tooltipX = Math.round(rect.x + rect.width / 2);
          const tooltipY = Math.round(rect.y);
          tooltipEl.style.transform = `translate(${tooltipX}px, ${tooltipY}px)`;
          tooltipEl.dataset.visible = "true";
        } else if (tooltipEl.dataset.visible !== "false") {
          tooltipEl.dataset.visible = "false";
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const drawStartedAt = performance.now();
      const renderScheduler = resolveRenderSchedulerState({
        cameraIntentActive: cameraStep.cameraIntentActive,
        drawDurationMs: lastRenderMetricsRef.current.drawDurationMs,
        framePacingP90Ms: framePacingStatsRef.current.p90Ms,
        reducedMotion,
      }, renderSchedulerHysteresisRef.current);
      const renderMetrics = drawPharosVille({
        camera: frameCamera,
        ctx,
        dpr,
        height: activeCanvasSize.y,
        hoveredTarget: nextHoveredTarget,
        hoveredTargetKeyboardFocused: activeHoveredDetailId != null
          && keyboardFocusedDetailIdRef?.current === activeHoveredDetailId,
        motion: {
          plan: activeMotionPlan,
          reducedMotion,
          timeSeconds,
          wallClockHour: frameWallClockHour,
        },
        renderScheduler,
        // W4.01 reveal envelope: owner drives via a RAF tween on cold mount;
        // when omitted (or once steady state), draw at full reveal.
        revealEnvelope: revealEnvelopeRef?.current ?? 1,
        visibleTileBoundsCache: visibleTileBoundsCacheRef.current,
        selectedTarget: nextSelectedTarget,
        seaState,
        shipMotionSamples,
        targets,
        width: activeCanvasSize.x,
        world,
        assets: assetManager,
      });
      const previousTimeToFirstCoherentFrameMs = lastRenderMetricsRef.current.timeToFirstCoherentFrameMs;
      lastRenderMetricsRef.current = {
        ...renderMetrics,
        hitTargetChangedShipCount,
        hitTargetDurationMs,
        drawDurationMs: performance.now() - drawStartedAt,
        framePacing: framePacingStatsRef.current,
        sampleDurationMs,
        snapshotRebuildCount,
      };
      if (previousTimeToFirstCoherentFrameMs !== undefined) {
        lastRenderMetricsRef.current.timeToFirstCoherentFrameMs = previousTimeToFirstCoherentFrameMs;
      }
      if (!reducedMotion) {
        drawDurationStatsRef.current = pushDrawDurationSample(drawDurationWindowRef.current, lastRenderMetricsRef.current.drawDurationMs);
        const nextAdaptiveDprState = resolveAdaptiveDprState({
          maximumRequestedDpr: maximumRequestedDprRef.current,
          state: adaptiveDprStateRef.current,
          stats: drawDurationStatsRef.current,
        });
        if (nextAdaptiveDprState.requestedDpr !== adaptiveDprStateRef.current.requestedDpr) {
          adaptiveDprStateRef.current = nextAdaptiveDprState;
          const nextBudget = resolveCanvasBudget({
            cssHeight: activeCanvasSize.y,
            cssWidth: activeCanvasSize.x,
            requestedDpr: nextAdaptiveDprState.requestedDpr,
          });
          canvasBudgetRef.current = nextBudget;
        } else if (
          nextAdaptiveDprState.cooldownFrames !== adaptiveDprStateRef.current.cooldownFrames
          || nextAdaptiveDprState.downshiftStreak !== adaptiveDprStateRef.current.downshiftStreak
          || nextAdaptiveDprState.upshiftStreak !== adaptiveDprStateRef.current.upshiftStreak
        ) {
          adaptiveDprStateRef.current = nextAdaptiveDprState;
        }
      }
      if (activeCriticalSettled && !criticalFramePaintedRef.current) {
        criticalFramePaintedRef.current = true;
        const timeToFirstCoherentFrameMs = performance.now() - mountEpochMsRef.current;
        if (Number.isFinite(timeToFirstCoherentFrameMs)) {
          lastRenderMetricsRef.current = {
            ...lastRenderMetricsRef.current,
            timeToFirstCoherentFrameMs: Math.max(0, timeToFirstCoherentFrameMs),
          };
        }
        setCriticalFramePainted(true);
      }
      if (!reducedMotion) {
        motionFrameCountRef.current += 1;
        scheduleFrame();
      }
      if (isVisualDebugAllowed()) {
        const telemetryStartedAt = performance.now();
        // A1/A2: max continuous display heading and position deltas this frame.
        let frameMaxHeadingDeg = 0;
        let frameMaxPosDelta = 0;
        const lastTilePos = lastTilePosRef.current;
        for (const [id, sample] of nextFrameState.samples) {
          const prev = lastTilePos.get(id);
          if (prev) {
            if (isContinuousPositionDiagnosticSample(prev, sample)) {
              const headingDelta = headingDeltaDegreesPerSecond(prev, sample, nextFrameState.timeSeconds);
              if (headingDelta > frameMaxHeadingDeg) frameMaxHeadingDeg = headingDelta;
              const d = Math.hypot(sample.tile.x - prev.x, sample.tile.y - prev.y);
              if (d > frameMaxPosDelta) frameMaxPosDelta = d;
            }
            writeLastTilePositionSample(prev, sample, nextFrameState.timeSeconds);
          } else {
            lastTilePos.set(id, createLastTilePositionSample(sample, nextFrameState.timeSeconds));
          }
        }
        const shipMaxHeadingDeltaDeg = pushNumericMaxWindow(headingDeltaWindowRef.current, frameMaxHeadingDeg);
        const shipMaxPositionDeltaTile = pushNumericMaxWindow(positionDeltaWindowRef.current, frameMaxPosDelta);

        // A3: route cache stats.
        let routeCacheStats: { hitRatio: number; evictionRate: number; size: number; capacity: number } | undefined;
        const rawStats = getCurrentMapPathCacheStats(world.map);
        if (rawStats) {
          const total = rawStats.hits + rawStats.misses;
          const hitRatio = total > 0 ? rawStats.hits / total : 0;
          const allOps = rawStats.hits + rawStats.misses + rawStats.evictions;
          const evictionRate = allOps > 0 ? rawStats.evictions / allOps : 0;
          routeCacheStats = { hitRatio, evictionRate, size: rawStats.size, capacity: rawStats.capacity };
        }

        // A5: flush longtask accumulator into the rolling window.
        const ltAcc = longtaskAccRef.current;
        const longtask = pushLongtaskWindow(longtaskWindowRef.current, ltAcc.count, ltAcc.maxDurationMs);
        longtaskAccRef.current = { count: 0, maxDurationMs: 0 };

        const nextRenderMetrics: DebugRenderMetrics = {
          ...lastRenderMetricsRef.current,
          shipMaxHeadingDeltaDeg,
          shipMaxPositionDeltaTile,
          longtask,
          bucketFlipCount: bucketFlipCountRef.current,
        };
        if (routeCacheStats) nextRenderMetrics.routeCacheStats = routeCacheStats;
        nextRenderMetrics.telemetryOverheadMs = performance.now() - telemetryStartedAt;
        lastRenderMetricsRef.current = nextRenderMetrics;

        const debugPublishStartedAt = performance.now();
        updateDebugFrame({
          animationFramePending: animationFramePendingRef.current,
          frameCount: motionFrameCountRef.current,
          frameState: nextFrameState,
          camera: frameCamera,
          canvasSize: activeCanvasSize,
          motionPlan: activeMotionPlan,
          reducedMotion,
          renderMetrics: lastRenderMetricsRef.current,
          assetLoadStats: assetManager.getLoadStats(),
          selectedDetailId: activeSelectedDetailId,
          shipsById,
          compactSampleCache: compactShipMotionSampleCacheRef.current,
          world,
        });
        lastRenderMetricsRef.current = {
          ...lastRenderMetricsRef.current,
          debugPublishDurationMs: performance.now() - debugPublishStartedAt,
        };
      }
    };
    paintRequestRef.current = scheduleFrame;

    // Pause the loop when the canvas is offscreen or the tab is hidden; resume
    // by scheduling a one-shot frame to paint the current state. Set the
    // pending-resume flag so the first post-pause frame drops its accumulated
    // dt (otherwise long pauses would teleport ships through cycles).
    const applyVisibility = () => {
      const nextVisible = !documentHidden && intersectionRatio >= 0.05;
      if (nextVisible === canvasIsVisibleRef.current) return;
      canvasIsVisibleRef.current = nextVisible;
      if (nextVisible) {
        pendingResumeRef.current = true;
        scheduleFrame();
      } else {
        if (frameId) {
          cancelAnimationFrame(frameId);
          frameId = 0;
        }
        animationFramePendingRef.current = false;
      }
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === canvas) intersectionRatio = entry.intersectionRatio;
        }
        applyVisibility();
      }, { rootMargin: "0px", threshold: [0, 0.05] });
      observer.observe(canvas);
    }

    const handleVisibilityChange = () => {
      documentHidden = document.visibilityState === "hidden";
      applyVisibility();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    // A5: register a PerformanceObserver for longtask entries inside the debug
    // branch. Guards against jsdom / environments without longtask support.
    if (isVisualDebugAllowed()
      && typeof PerformanceObserver !== "undefined"
      && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      const ltObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longtaskAccRef.current.count += 1;
          if (entry.duration > longtaskAccRef.current.maxDurationMs) {
            longtaskAccRef.current.maxDurationMs = entry.duration;
          }
        }
      });
      ltObserver.observe({ entryTypes: ["longtask"] });
      longtaskObserverRef.current?.disconnect();
      longtaskObserverRef.current = ltObserver;
    }

    drawFrame(performance.now());
    return () => {
      paintRequestRef.current = () => {};
      animationFramePendingRef.current = false;
      lastWallRef.current = null;
      if (frameId) cancelAnimationFrame(frameId);
      if (observer) observer.disconnect();
      if (longtaskObserverRef.current) {
        longtaskObserverRef.current.disconnect();
        longtaskObserverRef.current = null;
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceMotionBucket, assetManager, cameraReady, canvasSize.x, canvasSize.y, reducedMotion, shipsById, wallClockHour, world]);

  // Reduced motion keeps draw-time static (`timeSeconds = 0`) and therefore
  // has no continuous RAF clock to cross the route-variation bucket boundary.
  // Maintain the same 10-minute bucket clock with a timeout, then let the
  // committed motion-plan change below trigger the one-shot repaint.
  useEffect(() => {
    if (!reducedMotion) return;
    const startMs = performance.now() - accSecondsRef.current * 1000;
    let timeoutId = 0;

    const scheduleNextBucket = () => {
      const now = performance.now();
      const elapsedMs = Math.max(0, now - startMs);
      const nextBucket = Math.floor(elapsedMs / MOTION_BUCKET_INTERVAL_MS) + 1;
      const nextBucketAtMs = startMs + nextBucket * MOTION_BUCKET_INTERVAL_MS;
      timeoutId = window.setTimeout(handleBucketTimeout, Math.max(0, nextBucketAtMs - now));
    };
    const handleBucketTimeout = () => {
      const elapsedSeconds = Math.max(0, (performance.now() - startMs) / 1000);
      accSecondsRef.current = elapsedSeconds;
      advanceMotionBucket(Math.floor(elapsedSeconds / MOTION_BUCKET_INTERVAL_SECONDS));
      scheduleNextBucket();
    };

    scheduleNextBucket();
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [advanceMotionBucket, reducedMotion]);

  useEffect(() => {
    if (!reducedMotion) return;
    reducedMotionSamplesSignatureRef.current = null;
    requestPaint();
  }, [motionPlan, reducedMotion, requestPaint]);

  // Asset arrivals must trigger a repaint (especially under reduced motion
  // where the RAF loop is otherwise idle). Route through `requestPaint` so the
  // RAF effect itself never rebinds on a tick bump.
  useEffect(() => {
    requestPaint();
  }, [assetLoadTick, requestPaint]);

  // Visual debug telemetry — published to window for tests / dev tooling.
  useEffect(() => {
    if (!isVisualDebugAllowed()) return;
    const debugWindow = window as typeof window & {
      __pharosVilleDebug?: PharosVilleDebugState;
    };
    const frameState = frameStateRef.current;
    const renderMetrics = renderMetricsWithCurrentSelection({
      hoveredTarget: frameState.hoveredTarget,
      metrics: lastRenderMetricsRef.current,
      selectedTarget: frameState.selectedTarget,
    });
    const framePatch = debugFramePatch({
      animationFramePending: animationFramePendingRef.current,
      assetLoadStats: assetManager.getLoadStats(),
      camera,
      canvasSize,
      compactSampleCache: compactShipMotionSampleCacheRef.current,
      frameCount: motionFrameCountRef.current,
      frameState,
      motionPlan,
      reducedMotion,
      renderMetrics,
      selectedDetailId,
      shipsById,
      world,
    });
    debugWindow.__pharosVilleDebug = {
      ...framePatch,
      camera,
      assetLoadErrors,
      assetsLoaded: criticalAssetsLoaded && deferredAssetsLoaded,
      criticalAssetAttemptsSettled,
      criticalAssetsLoaded,
      deferredAssetsLoaded,
      canvasBudget: canvasBudgetRef.current,
      canvasSize,
      selectedDetailAnchor,
      selectedDetailId,
    };
    return () => {
      delete debugWindow.__pharosVilleDebug;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetLoadErrors, assetManager, camera, canvasSize, criticalAssetAttemptsSettled, criticalAssetsLoaded, deferredAssetsLoaded, hoveredDetailId, motionPlan, reducedMotion, selectedDetailAnchor, selectedDetailId, shipsById, world]);

  return { frameRateFps, requestPaint };
}

type CompactShipMotionSample = {
  currentDockId: string | null;
  currentRouteStopId: string | null;
  currentRouteStopKind: ShipMotionSample["currentRouteStopKind"];
  id: string;
  mapVisible: boolean;
  state: ShipMotionSample["state"];
  x: number;
  y: number;
  zone: ShipMotionSample["zone"];
};

type CompactShipMotionSampleCache = {
  byId: Map<string, CompactShipMotionSample>;
  liveIds: Set<string>;
  output: CompactShipMotionSample[];
};

type PharosVilleDebugState = {
  activeCameraLoopCount: number;
  activeMotionLoopCount: number;
  assetLoadErrors: PharosVilleAssetLoadError[];
  assetLoadStats: PharosVilleAssetLoadStats;
  camera: IsoCamera | null;
  cameraFrameSource: "world-render-loop";
  cameraWithinBounds: boolean;
  assetsLoaded: boolean;
  criticalAssetAttemptsSettled: boolean;
  criticalAssetsLoaded: boolean;
  deferredAssetsLoaded: boolean;
  canvasBudget: ReturnType<typeof resolveCanvasBudget> | null;
  canvasSize: ScreenPoint;
  animationFramePending: boolean;
  motionClockSource: "requestAnimationFrame" | "reduced-motion-static-frame";
  motionCueCounts: MotionCueCounts;
  motionFrameCount: number;
  renderMetrics: DebugRenderMetrics;
  reducedMotion: boolean;
  sailCacheStats?: {
    sailLogo: CacheStats;
    sailEmblem: CacheStats;
    sailTint: CacheStats;
  };
  selectedDetailAnchor: DetailAnchor | null;
  selectedDetailId: string | null;
  shipMotionSamples: CompactShipMotionSample[];
  targets: readonly HitTarget[];
  timeSeconds: number;
  wallClockHour: number;
};

type MotionCueCounts = {
  ambientBirds: number;
  animatedShips: number;
  effectShips: number;
  harborLights: number;
  moverShips: number;
  selectedRelationshipOverlays: number;
};

const PHAROSVILLE_AMBIENT_BIRD_CAP = 9;
const PHAROSVILLE_HARBOR_LIGHT_CAP = 3;
const SHIP_HIT_TARGET_REFRESH_PER_FRAME = 32;
const FRAME_RATE_LABEL_UPDATE_MS = 500;
const MAX_WORLD_FRAME_DELTA_SECONDS = 1 / 30;
const TEST_CLOCK_JUMP_DELTA_SECONDS = 1;
const MOTION_BUCKET_INTERVAL_SECONDS = 600;
const MOTION_BUCKET_INTERVAL_MS = MOTION_BUCKET_INTERVAL_SECONDS * 1000;

function collectShipMotionSamples(input: {
  motionPlan: MotionPlan;
  reducedMotion: boolean;
  seaState: SeaState;
  samples: ReadonlyMap<string, ShipMotionSample>;
  timeSeconds: number;
  world: PharosVilleWorldModel;
  trackShipHitState?: boolean;
}) {
  const samples = input.samples as Map<string, ShipMotionSample>;
  // Process flagships/solo ships before consorts so consorts can read their
  // flagship's already-computed sample from the map instead of re-sampling
  // the flagship's route. Two passes keeps allocation-free; ordering inside
  // each pass is unchanged from world.ships.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const ship of input.world.ships) {
      const isConsort = ship.squadRole === "consort";
      if (pass === 0 && isConsort) continue;
      if (pass === 1 && !isConsort) continue;
      let sample = samples.get(ship.id);
      if (!sample) {
        sample = createShipMotionSample();
        samples.set(ship.id, sample);
      }
      resolveShipMotionSampleInto({
        plan: input.motionPlan,
        reducedMotion: input.reducedMotion,
        seaState: input.seaState,
        ship,
        timeSeconds: input.timeSeconds,
        flagshipSamples: samples,
      }, sample);
    }
  }
  if (samples.size !== input.world.ships.length) {
    const liveIds = new Set(input.world.ships.map((ship) => ship.id));
    for (const id of samples.keys()) {
      if (!liveIds.has(id)) samples.delete(id);
    }
  }
  applySeaRoomSeparationPass(samples, input.world.ships, {
    reducedMotion: input.reducedMotion,
    seaState: input.seaState,
  });
  return { samples };
}

function seaStateMotionSignature(seaState: SeaState): string {
  return [
    seaState.label,
    seaState.reducedMotion ? "rm" : "anim",
    seaState.swell.toFixed(3),
    seaState.wind.toFixed(3),
    seaState.tempo.toFixed(3),
    seaState.source.maxDewsBand ?? "none",
    seaState.source.nightFactor.toFixed(3),
    seaState.source.psiStress.toFixed(3),
  ].join(":");
}

function collectShipHitRefreshIds(input: {
  cursorRef: MutableRefObject<number>;
  hoveredDetailId: string | null;
  selectedDetailId: string | null;
  world: PharosVilleWorldModel;
}): string[] {
  const ships = input.world.ships;
  if (ships.length <= SHIP_HIT_TARGET_REFRESH_PER_FRAME) return ships.map((ship) => ship.id);
  const ids = new Set<string>();
  for (const ship of ships) {
    if (ship.detailId === input.selectedDetailId || ship.detailId === input.hoveredDetailId) {
      ids.add(ship.id);
    }
  }
  const start = input.cursorRef.current % ships.length;
  const count = Math.min(SHIP_HIT_TARGET_REFRESH_PER_FRAME, ships.length);
  for (let offset = 0; offset < count; offset += 1) {
    ids.add(ships[(start + offset) % ships.length]!.id);
  }
  input.cursorRef.current = (start + count) % ships.length;
  return [...ids];
}

function compactShipMotionSamples(
  samples: ReadonlyMap<string, ShipMotionSample>,
  shipsById: ReadonlyMap<string, PharosVilleWorldModel["ships"][number]>,
  cache: CompactShipMotionSampleCache,
): CompactShipMotionSample[] {
  const output = cache.output;
  const liveIds = cache.liveIds;
  output.length = 0;
  liveIds.clear();
  for (const sample of samples.values()) {
    liveIds.add(sample.shipId);
    const ship = shipsById.get(sample.shipId);
    let compact = cache.byId.get(sample.shipId);
    if (!compact) {
      compact = {
        currentDockId: null,
        currentRouteStopId: null,
        currentRouteStopKind: null,
        id: sample.shipId,
        mapVisible: true,
        state: sample.state,
        x: 0,
        y: 0,
        zone: sample.zone,
      };
      cache.byId.set(sample.shipId, compact);
    }
    compact.currentDockId = sample.currentDockId;
    compact.currentRouteStopId = sample.currentRouteStopId;
    compact.currentRouteStopKind = sample.currentRouteStopKind;
    compact.mapVisible = ship ? isShipMapVisible(ship, sample) : true;
    compact.state = sample.state;
    compact.x = sample.tile.x;
    compact.y = sample.tile.y;
    compact.zone = sample.zone;
    output.push(compact);
  }
  for (const id of cache.byId.keys()) {
    if (!liveIds.has(id)) cache.byId.delete(id);
  }
  return output;
}

function createCompactShipMotionSampleCache(): CompactShipMotionSampleCache {
  return {
    byId: new Map(),
    liveIds: new Set(),
    output: [],
  };
}

function createLastTilePositionSample(sample: ShipMotionSample, timeSeconds: number): LastTilePositionSample {
  return {
    currentRouteStopId: sample.currentRouteStopId,
    headingX: sample.heading.x,
    headingY: sample.heading.y,
    routePathKey: sample.routePathKey,
    state: sample.state,
    timeSeconds,
    visibilityAlpha: sample.mapVisibilityAlpha ?? 1,
    x: sample.tile.x,
    y: sample.tile.y,
  };
}

function writeLastTilePositionSample(target: LastTilePositionSample, sample: ShipMotionSample, timeSeconds: number): void {
  target.currentRouteStopId = sample.currentRouteStopId;
  target.headingX = sample.heading.x;
  target.headingY = sample.heading.y;
  target.routePathKey = sample.routePathKey;
  target.state = sample.state;
  target.timeSeconds = timeSeconds;
  target.visibilityAlpha = sample.mapVisibilityAlpha ?? 1;
  target.x = sample.tile.x;
  target.y = sample.tile.y;
}

function isContinuousPositionDiagnosticSample(previous: LastTilePositionSample, sample: ShipMotionSample): boolean {
  const visibilityAlpha = sample.mapVisibilityAlpha ?? 1;
  return previous.visibilityAlpha >= 0.2
    && visibilityAlpha >= 0.2
    && previous.routePathKey === sample.routePathKey
    && previous.currentRouteStopId === sample.currentRouteStopId
    && isCompatiblePositionDiagnosticState(previous.state, sample.state);
}

function isCompatiblePositionDiagnosticState(
  previous: ShipMotionSample["state"],
  current: ShipMotionSample["state"],
): boolean {
  if (previous === current) return true;
  if (previous === "departing" && (current === "sailing" || current === "risk-drift")) return true;
  if ((previous === "sailing" || previous === "risk-drift") && current === "arriving") return true;
  return false;
}

function headingDeltaDegreesPerSecond(
  previous: LastTilePositionSample,
  sample: ShipMotionSample,
  timeSeconds: number,
): number {
  const dt = Math.max(0, timeSeconds - previous.timeSeconds);
  if (dt <= 0) return 0;
  const previousAngle = Math.atan2(previous.headingY, previous.headingX);
  const nextAngle = Math.atan2(sample.heading.y, sample.heading.x);
  let delta = nextAngle - previousAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta) * (180 / Math.PI) / dt;
}

function renderMetricsWithCurrentSelection(input: {
  hoveredTarget: HitTarget | null;
  metrics: DebugRenderMetrics;
  selectedTarget: HitTarget | null;
}): DebugRenderMetrics {
  const selectionCount = selectionDrawableCount({ hoveredTarget: input.hoveredTarget, selectedTarget: input.selectedTarget });
  if (selectionCount === input.metrics.drawableCounts.selection) return input.metrics;
  return {
    ...input.metrics,
    drawableCount: input.metrics.drawableCount - input.metrics.drawableCounts.selection + selectionCount,
    drawableCounts: {
      ...input.metrics.drawableCounts,
      selection: selectionCount,
    },
  };
}

type DebugFramePatchInput = {
  animationFramePending: boolean;
  assetLoadStats: PharosVilleAssetLoadStats;
  camera: IsoCamera | null;
  canvasSize: ScreenPoint;
  compactSampleCache: CompactShipMotionSampleCache;
  frameCount: number;
  frameState: {
    samples: ReadonlyMap<string, ShipMotionSample>;
    targets: readonly HitTarget[];
    timeSeconds: number;
    wallClockHour: number;
  };
  motionPlan: MotionPlan;
  reducedMotion: boolean;
  renderMetrics: DebugRenderMetrics;
  selectedDetailId: string | null;
  shipsById: ReadonlyMap<string, PharosVilleWorldModel["ships"][number]>;
  world: PharosVilleWorldModel;
};

type DebugFramePatch = Omit<
  PharosVilleDebugState,
  | "assetLoadErrors"
  | "assetsLoaded"
  | "criticalAssetAttemptsSettled"
  | "criticalAssetsLoaded"
  | "deferredAssetsLoaded"
  | "canvasBudget"
  | "canvasSize"
  | "selectedDetailAnchor"
  | "selectedDetailId"
>;

function debugFramePatch(input: DebugFramePatchInput): DebugFramePatch {
  return {
    activeCameraLoopCount: 0,
    activeMotionLoopCount: input.reducedMotion || !input.animationFramePending ? 0 : 1,
    animationFramePending: input.animationFramePending,
    assetLoadStats: input.assetLoadStats,
    camera: input.camera,
    cameraFrameSource: "world-render-loop",
    cameraWithinBounds: isCameraWithinBounds(input.camera, input.world.map, input.canvasSize),
    motionClockSource: input.reducedMotion ? "reduced-motion-static-frame" : "requestAnimationFrame",
    motionCueCounts: motionCueCounts({
      motionPlan: input.motionPlan,
      selectedDetailId: input.selectedDetailId,
      world: input.world,
    }),
    motionFrameCount: input.frameCount,
    renderMetrics: input.renderMetrics,
    reducedMotion: input.reducedMotion,
    sailCacheStats: {
      sailLogo: getSailLogoSpriteCacheStats(),
      sailEmblem: getSailEmblemSpriteCacheStats(),
      sailTint: getShipSailTintCacheStats(),
    },
    shipMotionSamples: compactShipMotionSamples(input.frameState.samples, input.shipsById, input.compactSampleCache),
    targets: input.frameState.targets,
    timeSeconds: input.frameState.timeSeconds,
    wallClockHour: input.frameState.wallClockHour,
  };
}

function updateDebugFrame(input: DebugFramePatchInput) {
  if (!isVisualDebugAllowed()) return;
  const debugWindow = window as typeof window & {
    __pharosVilleDebug?: Partial<PharosVilleDebugState>;
  };
  if (!debugWindow.__pharosVilleDebug) return;
  Object.assign(debugWindow.__pharosVilleDebug, debugFramePatch(input));
}

function isCameraWithinBounds(camera: IsoCamera | null, map: PharosVilleWorldModel["map"], viewport: ScreenPoint) {
  if (!camera || viewport.x <= 0 || viewport.y <= 0) return false;
  const clamped = clampCameraToMap(camera, { map, viewport });
  return (
    Math.abs(clamped.offsetX - camera.offsetX) <= 1
    && Math.abs(clamped.offsetY - camera.offsetY) <= 1
    && clamped.zoom === camera.zoom
  );
}

// Cached at module scope: PROD vs dev never changes inside a session, and
// hostname doesn't change for a SPA. The lazy initialiser keeps SSR / module
// load safe by deferring the window read until first call. Evaluating once
// (not on every effect-rebind tick) makes the per-render guard cost trivial
// even when the body short-circuits (HOOKS F3).
let cachedDebugAllowed: boolean | null = null;
function isVisualDebugAllowed(): boolean {
  if (cachedDebugAllowed === null) {
    cachedDebugAllowed = !import.meta.env.PROD
      || (typeof window !== "undefined"
        && (window.location.hostname === "localhost"
          || window.location.hostname === "127.0.0.1"));
  }
  return cachedDebugAllowed;
}

function motionCueCounts(input: {
  motionPlan: MotionPlan;
  selectedDetailId: string | null;
  world: PharosVilleWorldModel;
}): MotionCueCounts {
  const selectedDetail = input.selectedDetailId ? input.world.detailIndex[input.selectedDetailId] ?? null : null;
  const selectedRelationshipOverlays = selectedDetail && /ship|dock/i.test(selectedDetail.kind) ? 1 : 0;
  return {
    ambientBirds: PHAROSVILLE_AMBIENT_BIRD_CAP,
    animatedShips: input.motionPlan.animatedShipIds.size,
    effectShips: input.motionPlan.effectShipIds.size,
    // V2.5: civic-core lamp cap plus one quay lantern per rendered dock
    // (bounded by the dock cap, ≤ 10 with TON).
    harborLights: PHAROSVILLE_HARBOR_LIGHT_CAP + input.world.docks.length,
    moverShips: input.motionPlan.moverShipIds.size,
    selectedRelationshipOverlays,
  };
}
