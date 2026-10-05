import {
  debugDirectorLog,
  isDebugChromeEnabled,
  isStillCameraRequested,
  isVisualDebugAllowed,
  type DebugDirectorAdmission,
} from "../lib/pharosville-debug";
// Owns the requestAnimationFrame draw loop, per-frame timing/metrics refs,
// hit-target snapshot maintenance during the frame, ship motion sample
// collection, and visual debug telemetry. Shared cross-hook refs (camera,
// canvas size, hit-targets, samples) are passed in.
import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import {
  createGardenObservatoryHitTargetSnapshot,
  createGardenStationLabelFrame,
  type GardenStationLabelFrame,
} from "../renderer/garden-observatory-hit-testing";
import type { HitTarget, HitTargetSnapshot } from "../renderer/hit-testing";
import {
  createRenderSchedulerHysteresisState,
  resolveRenderSchedulerIdleState,
  resolveRenderSchedulerState,
  applyPreviewSchedulerTier,
} from "../renderer/render-scheduler";
import type { RenderSchedulerHysteresisState } from "../renderer/render-scheduler";
import type { PharosVilleRenderMetrics } from "../renderer/render-types";
import type {
  ThreeWorldRenderer,
  ThreeLogoAssets,
  WorldRendererGpuMetrics,
  WorldRendererStatus,
} from "../renderer/world-renderer-backend";
import { clampCameraToMap } from "../systems/camera";
import {
  createDrawDurationWindow,
  pushDrawDurationSample,
  resolveAdaptiveDprState,
  resolveRenderSurfaceBudget,
  type AdaptiveDprState,
  type DrawDurationWindow,
} from "../systems/render-surface-budget";
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
import {
  GARDEN_LIGHTHOUSE_HEIGHT,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_WATER_Y,
  gardenIslandDisplayTile,
  resolveGardenShipDisplayTile,
  selectGardenObservatorySlice,
} from "../systems/garden-observatory-slice";
import { GARDEN_EMPTY_INLET } from "../systems/garden-inlet";
import {
  CAMERA_BREATH_IDENTITY,
  CAMERA_NEAR,
  TILE_SCALE,
  worldToScreen,
  worldViewDepth,
  type CameraBreath,
  type IsoCamera,
  type ScreenPoint,
} from "../systems/projection";
import { REST_SEAT_YAW_RAD } from "../systems/rest-seat";
import { seaStateForWorld, type SeaState } from "../systems/sea-state";
import { weatherForFrame, writeWeatherPlan, type WeatherPlan } from "../systems/weather";
import { createVisualMotionSmoothingState, resetVisualMotionSmoothingState, smoothShipMotionSamples } from "../systems/visual-motion";
import { worldRenderContentSignature } from "../systems/world-render-content-signature";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import type { GardenBeat, GardenDirectorState, GardenRitualKind } from "../systems/garden-director";
import { forceGardenRitual } from "../systems/garden-score";
import { normalizeHour } from "../lib/pharosville-clock";
import { reportClientError } from "../error-reporter";
import { createHoverNameplateDwellState, hoverNameplateVisible } from "./hover-nameplate-dwell";
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

/**
 * W0.12 / K16 camera breath: idle-only and eased. The target weight is 1 only
 * after 45 s with no pointer, wheel or key input, no hover, no selection and
 * no camera intent — the same interaction clock the render scheduler's
 * ambient cadence and 180 s idle read. It eases in over a 12 s smootherstep
 * and out with τ 0.5 s (settled in ~1.5 s); the phase keeps running on the
 * environment clock while suppressed, so a resumed breath grows from zero
 * instead of jumping. Reduced motion and the debug still camera hold 0.
 */
const CAMERA_BREATH_IDLE_MS = 45_000;
const CAMERA_BREATH_EASE_IN_SECONDS = 12;
const CAMERA_BREATH_EASE_OUT_TAU_SECONDS = 0.5;
const CAMERA_BREATH_YAW_RAD = 0.8 * Math.PI / 180;
const CAMERA_BREATH_PITCH_RAD = 0.6 * Math.PI / 180;
const CAMERA_BREATH_DOLLY = 0.012;
const CAMERA_BREATH_TWO_PI = Math.PI * 2;
/** Debug motion stats refresh at most twice a second. */
const MOTION_STATS_REFRESH_MS = 500;
/** Frame-local weather for the motion sampler; rewritten in place every sample pass. */
const samplerWeather = weatherForFrame({ timeSeconds: 0, psiStress: 0, baseWind: 0, reducedMotion: true });

/** Which of the three ways the 3D renderer can retire itself fired. */
type RendererFailureCause = "webgl-context" | "module-load" | "render-loop";

type DebugRenderMetrics = PharosVilleRenderMetrics & {
  drawDurationMs: number;
  framePacing: FramePacingMetrics;
  debugPublishDurationMs?: number;
  hitTargetDurationMs?: number;
  sampleDurationMs?: number;
  snapshotRebuildCount?: number;
  telemetryOverheadMs?: number;
  timeToFirstCoherentFrameMs?: number;
  gpu?: WorldRendererGpuMetrics;
  rendererBackend?: "three";
};

const loadThreeWorldRenderer = () => import("../three/world-renderer");

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
  /** G3/W4.1: the shared director; read through a ref so expiry never restarts the loop. */
  gardenDirector?: GardenDirectorState;
  /**
   * Called when the deterministic time bucket flips (every ~10 minutes of
   * wall clock). The hook mirrors the latest callback into a ref so RAF and
   * reduced-motion timer paths can share bucket advancement without rebinding
   * the frame loop.
  */
  onBucketFlip?: (bucket: number) => void;
  /** Called after a frame publishes display samples, with the same route-owned clock. */
  onShipMotionSamplesReady?: (
    samples: ReadonlyMap<string, ShipMotionSample>,
    timeSeconds: number,
  ) => void;
  /** Publishes station/selected-ship label anchors in the same RAF as hit testing. */
  onStationLabelFrame?: (frame: GardenStationLabelFrame) => void;
  adaptiveDprStateRef: MutableRefObject<AdaptiveDprState>;
  logoGeneration: number;
  logos: ThreeLogoAssets;
  camera: IsoCamera | null;
  cameraRef: MutableRefObject<IsoCamera | null>;
  surfaceBudgetRef: MutableRefObject<ReturnType<typeof resolveRenderSurfaceBudget> | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canvasSize: ScreenPoint;
  canvasSizeRef: MutableRefObject<ScreenPoint>;
  hitTargetSnapshotRef: MutableRefObject<HitTargetSnapshot | null>;
  hitTargetsRef: MutableRefObject<readonly HitTarget[]>;
  hoveredDetailId: string | null;
  hoveredDetailIdRef: MutableRefObject<string | null>;
  /** Hover tooltip DOM node. The loop writes its position/visibility directly
      (style.transform + data-visible) each frame so the tooltip tracks moving
      ships without any React re-render in the RAF path. */
  hoverTooltipElRef?: RefObject<HTMLDivElement | null>;
  maximumRequestedDprRef: MutableRefObject<number>;
  mountEpochMsRef: MutableRefObject<number>;
  motionPlan: MotionPlan;
  motionPlanRef: MutableRefObject<MotionPlan>;
  reducedMotion: boolean;
  selectedDetailAnchor: DetailAnchor | null;
  selectedDetailId: string | null;
  selectedDetailIdRef: MutableRefObject<string | null>;
  /** Last scale actually drawn by the renderer's stele track. */
  seaSignScaleRef?: MutableRefObject<number | null>;
  /**
   * K16 breath of the frame last drawn. Click-time hit snapshots built between
   * frames put it on their camera, so picking always reads the breathed pose.
   */
  cameraBreathRef?: MutableRefObject<Readonly<CameraBreath>>;
  shipMotionSamplesRef: MutableRefObject<ReadonlyMap<string, ShipMotionSample>>;
  shipsById: ReadonlyMap<string, PharosVilleWorldModel["ships"][number]>;
  stepCamera: (now: number, shipMotionSamples: ReadonlyMap<string, ShipMotionSample>) => WorldCameraStepResult;
  wallClockHour: number;
  world: PharosVilleWorldModel;
}

export interface UseWorldRenderLoopResult {
  frameRateFps: number | null;
  rendererFailure: string | null;
  rendererWarmupReady: boolean;
  rendererStatus: WorldRendererStatus;
  requestPaint: () => void;
}

export interface WorldCameraStepResult {
  camera: IsoCamera | null;
  cameraChanged: boolean;
  cameraIntentActive: boolean;
}

export function useWorldRenderLoop(input: UseWorldRenderLoopInput): UseWorldRenderLoopResult {
  const {
    gardenDirector,
    onBucketFlip,
    onShipMotionSamplesReady,
    adaptiveDprStateRef,
    onStationLabelFrame,
    logoGeneration,
    logos,
    camera,
    cameraRef,
    surfaceBudgetRef,
    canvasRef,
    canvasSize,
    canvasSizeRef,
    hitTargetSnapshotRef,
    hitTargetsRef,
    hoveredDetailId,
    hoveredDetailIdRef,
    hoverTooltipElRef,
    maximumRequestedDprRef,
    mountEpochMsRef,
    motionPlan,
    motionPlanRef,
    reducedMotion,
    selectedDetailAnchor,
    selectedDetailId,
    selectedDetailIdRef,
    seaSignScaleRef: providedSeaSignScaleRef,
    cameraBreathRef: providedCameraBreathRef,
    shipMotionSamplesRef,
    shipsById,
    stepCamera,
    wallClockHour,
    world,
  } = input;

  const fallbackSeaSignScaleRef = useRef<number | null>(null);
  const seaSignScaleTargetRef = useRef<MutableRefObject<number | null>>(fallbackSeaSignScaleRef);
  useEffect(() => {
    seaSignScaleTargetRef.current = providedSeaSignScaleRef ?? fallbackSeaSignScaleRef;
  }, [providedSeaSignScaleRef, fallbackSeaSignScaleRef]);
  const fallbackCameraBreathRef = useRef<Readonly<CameraBreath>>(CAMERA_BREATH_IDENTITY);
  const cameraBreathTargetRef = useRef<MutableRefObject<Readonly<CameraBreath>>>(fallbackCameraBreathRef);
  useEffect(() => {
    cameraBreathTargetRef.current = providedCameraBreathRef ?? fallbackCameraBreathRef;
  }, [providedCameraBreathRef]);

  const stepCameraRef = useRef(stepCamera);
  useEffect(() => {
    stepCameraRef.current = stepCamera;
  }, [stepCamera]);

  const onBucketFlipRef = useRef(onBucketFlip);
  useEffect(() => {
    onBucketFlipRef.current = onBucketFlip;
  }, [onBucketFlip]);

  const onShipMotionSamplesReadyRef = useRef(onShipMotionSamplesReady);
  useEffect(() => {
    onShipMotionSamplesReadyRef.current = onShipMotionSamplesReady;
  }, [onShipMotionSamplesReady]);

  const onStationLabelFrameRef = useRef(onStationLabelFrame);
  useEffect(() => {
    onStationLabelFrameRef.current = onStationLabelFrame;
  }, [onStationLabelFrame]);

  const gardenDirectorRef = useRef(gardenDirector);
  useEffect(() => {
    gardenDirectorRef.current = gardenDirector;
  }, [gardenDirector]);

  const animationFramePendingRef = useRef(false);
  const paintRequestRef = useRef<() => void>(() => {});
  const requestPaint = useCallback(() => {
    paintRequestRef.current();
  }, []);
  const worldContentSignature = worldRenderContentSignature(world);
  const worldRef = useRef(world);
  const shipsByIdRef = useRef(shipsById);
  useEffect(() => {
    worldRef.current = world;
    shipsByIdRef.current = shipsById;
    requestPaint();
  }, [requestPaint, shipsById, world]);
  const threeRendererRef = useRef<ThreeWorldRenderer | null>(null);
  const [rendererStatus, setRendererStatus] = useState<WorldRendererStatus>("loading");
  // Bumped whenever a renderer instance is created. The status alone cannot
  // carry a re-creation ("ready" → "ready" is no state change), and the RAF
  // effect binds the instance it starts with: without this, re-running the
  // creation effect (React Fast Refresh in dev) left the loop bound to the
  // disposed instance and the world froze with no error.
  const [rendererGeneration, setRendererGeneration] = useState(0);
  const [rendererWarmupReady, setRendererWarmupReady] = useState(false);
  const rendererWarmupStartedRef = useRef(false);
  const [rendererFailure, setRendererFailure] = useState<string | null>(null);
  // Every path that retires the 3D world to the DOM overview lands here — the
  // WebGL context-loss/creation failures the backend reports through
  // `onContextFailure`, the renderer module failing to load, and a render that
  // threw for RENDER_FAILURE_STREAK_LIMIT frames running. None of them throw
  // uncaught, so this is the only place the failure can be reported from.
  const failThreeRenderer = useCallback((message: string, cause: RendererFailureCause) => {
    threeRendererRef.current?.dispose();
    threeRendererRef.current = null;
    reportClientError("render", { kind: "renderer-failure", cause, message }, message);
    setRendererFailure(message);
    setRendererStatus("failed");
  }, []);
  const [frameRateFps, setFrameRateFps] = useState<number | null>(null);
  const frameRatePublishRef = useRef<{ fps: number | null; lastPublishedAtMs: number }>({
    fps: null,
    lastPublishedAtMs: 0,
  });
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
  const firstFramePaintedRef = useRef(false);
  const lastWallRef = useRef<number | null>(null);
  const frameIntervalWindowRef = useRef<FrameIntervalWindow>(createFrameIntervalWindow());
  const framePacingStatsRef = useRef<FramePacingMetrics>(emptyFramePacingMetrics());
  const renderSchedulerHysteresisRef = useRef<RenderSchedulerHysteresisState>(createRenderSchedulerHysteresisState());
  const compactShipMotionSampleCacheRef = useRef<CompactShipMotionSampleCache>(createCompactShipMotionSampleCache());
  // Environment time is monotonic across world-content replacement so wind,
  // waves, rain, sails, and post do not snap together. Ship/path sampling uses
  // a content-local epoch derived from this same clock.
  const accSecondsRef = useRef(0);
  const motionEpochSecondsRef = useRef(0);
  const pendingResumeRef = useRef(false);
  // Idle governor state. `lastInteractionAtMs` is stamped by raw input events
  // and by the in-frame signals that outlive them (camera intent, hover,
  // selection); null until the first frame gives it a clock reading.
  // `previousFrameIdle` remembers whether the last frame the loop actually DREW
  // was throttled, because the interval measured on a waking frame spans the
  // idle gap and is no more a load sample than the idle frames themselves.
  const lastInteractionAtMsRef = useRef<number | null>(null);
  const previousFrameIdleRef = useRef(false);
  // W0.12 eased breath: `weight` is the applied amplitude share, `rise` the
  // 0..1 progress of the 12 s smootherstep ease-in; `breath` is the one scratch
  // object the frame's camera state carries while breathing.
  const cameraBreathStateRef = useRef<{ breath: CameraBreath; rise: number; weight: number }>({
    breath: { dolly: 1, pitch: 0, yaw: 0 },
    rise: 0,
    weight: 0,
  });
  // W0.2 debug motion stats: one object, refreshed in place ≤ 2×/s from the
  // per-frame heading deltas the debug telemetry already computes.
  const motionStatsRef = useRef<DebugMotionStats>({
    meanAbsRestTurnDegPerSec: 0,
    meanAbsTurnDegPerSec: 0,
    sampledAtMs: 0,
    underwayShips: 0,
    visibleShips: 0,
  });
  const motionStatsAccRef = useRef({ lastRefreshAtMs: Number.NEGATIVE_INFINITY, restTurnCount: 0, restTurnSum: 0, turnCount: 0, turnSum: 0 });
  const lastInteractionInputRef = useRef<{ hoveredDetailId: string | null; selectedDetailId: string | null }>({
    hoveredDetailId: null,
    selectedDetailId: null,
  });
  const hoverNameplateDwellRef = useRef(createHoverNameplateDwellState());
  /** True when the frame just drawn created GPU resources for the first time. */
  const gpuWarmupFrameRef = useRef(false);
  /** Consecutive frames whose render threw. Reset by any frame that draws. */
  const renderFailureStreakRef = useRef(0);
  /** Frames still to skip for pacing after a world swap. */
  const worldSwapSettleFramesRef = useRef(0);
  const motionFrameCountRef = useRef(0);
  const reducedMotionSamplesSignatureRef = useRef<string | null>(null);
  const lastRenderMetricsRef = useRef<DebugRenderMetrics>({
    objectCount: 0,
    drawOwnerCensus: null,
    drawDurationMs: 0,
    framePacing: emptyFramePacingMetrics(),
    movingShipCount: 0,
    visibleShipCount: 0,
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let active = true;
    let renderer: ThreeWorldRenderer | null = null;
    let unmountLookdev: (() => void) | undefined;
    void loadThreeWorldRenderer()
      .then(async (module) => {
        if (!active) return;
        const createdRenderer = module.createThreeWorldRenderer({
          canvas,
          onAssetReady: requestPaint,
          onContextFailure: (message) => {
            if (active) failThreeRenderer(message, "webgl-context");
          },
        });
        renderer = createdRenderer;
        // Vite removes this import and its entire panel/inspector graph in production.
        if (import.meta.env.DEV && createdRenderer.gardenLookdev) {
          const lookdev = await import("../dev/garden-lookdev");
          if (!active) return;
          unmountLookdev = lookdev.mountGardenLookdev(createdRenderer, canvas);
        }
        threeRendererRef.current = renderer;
        rendererWarmupStartedRef.current = false;
        setRendererWarmupReady(false);
        setRendererStatus("ready");
        setRendererGeneration((generation) => generation + 1);
      })
      .catch((error) => {
        if (!active) return;
        unmountLookdev?.();
        renderer?.dispose();
        failThreeRenderer(error instanceof Error ? error.message : String(error), "module-load");
      });

    return () => {
      active = false;
      if (threeRendererRef.current === renderer) threeRendererRef.current = null;
      unmountLookdev?.();
      renderer?.dispose();
    };
  }, [canvasRef, failThreeRenderer, requestPaint]);

  const resetFramePacingState = useCallback(() => {
    lastWallRef.current = null;
    drawDurationWindowRef.current = createDrawDurationWindow();
    drawDurationStatsRef.current = { averageMs: 0, count: 0, p90Ms: 0 };
    frameIntervalWindowRef.current = createFrameIntervalWindow();
    framePacingStatsRef.current = emptyFramePacingMetrics();
    frameRatePublishRef.current = { fps: null, lastPublishedAtMs: 0 };
    renderSchedulerHysteresisRef.current = createRenderSchedulerHysteresisState();
    previousFrameIdleRef.current = false;
  }, []);

  const advanceMotionBucket = useCallback((newBucket: number) => {
    if (newBucket === lastBucketRef.current) return false;
    lastBucketRef.current = newBucket;
    bucketFlipCountRef.current += 1;
    onBucketFlipRef.current?.(newBucket);
    return true;
  }, []);

  // Reset transient state only when baked renderer content changes. Metadata-
  // only refreshes keep the frame loop, pacing window, and sample caches alive.
  useEffect(() => {
    resetFramePacingState();
    motionEpochSecondsRef.current = accSecondsRef.current;
    pendingResumeRef.current = false;
    motionFrameCountRef.current = 0;
    semanticShipMotionSamplesRef.current = new Map();
    shipMotionSamplesRef.current = new Map();
    resetVisualMotionSmoothingState(visualMotionStateRef.current);
    hitTargetSnapshotRef.current = null;
    hitTargetsRef.current = [];
    seaSignScaleTargetRef.current.current = null;
    reducedMotionSamplesSignatureRef.current = null;
    compactShipMotionSampleCacheRef.current = createCompactShipMotionSampleCache();
    headingDeltaWindowRef.current = createNumericMaxWindow(60);
    positionDeltaWindowRef.current = createNumericMaxWindow(60);
    lastTilePosRef.current.clear();
    longtaskWindowRef.current = createLongtaskWindow(60);
    longtaskAccRef.current = { count: 0, maxDurationMs: 0 };
    lastBucketRef.current = Math.floor(
      accSecondsRef.current / MOTION_BUCKET_INTERVAL_SECONDS,
    );
    bucketFlipCountRef.current = 0;
    worldSwapSettleFramesRef.current = WORLD_SWAP_SETTLE_FRAMES;
  }, [
    hitTargetSnapshotRef,
    hitTargetsRef,
    resetFramePacingState,
    seaSignScaleTargetRef,
    shipMotionSamplesRef,
    worldContentSignature,
  ]);

  useEffect(() => {
    resetFramePacingState();
  }, [canvasSize.x, canvasSize.y, resetFramePacingState]);

  useEffect(() => {
    if (!reducedMotion) return;
    frameRatePublishRef.current = { fps: null, lastPublishedAtMs: 0 };
  }, [reducedMotion]);

  // RAF effect — bound once per plumbing change (`world`, `canvasSize`,
  // `reducedMotion`, `cameraReady`, `wallClockHour`, `shipsById`) and per
  // renderer instance (`rendererGeneration`).
  // All other inputs (hoveredDetailId, selectedDetailId, motionPlan, camera,
  // and ship-logo state) are read through refs. Per-hover/select repaints under
  // reduced motion are routed through `requestPaint()` so the loop is not torn
  // down on every interaction. Logo-load ticks also call `requestPaint()`.
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
    const threeRenderer = rendererStatus === "ready" ? threeRendererRef.current : null;
    if (!threeRenderer) return;
    if (!surfaceBudgetRef.current) {
      const requestedDpr = adaptiveDprStateRef.current.requestedDpr || Math.max(1, window.devicePixelRatio || 1);
      surfaceBudgetRef.current = resolveRenderSurfaceBudget({
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
    const noteInteraction = (atMs: number) => {
      lastInteractionAtMsRef.current = atMs;
    };
    const drawFrame = (time: number) => {
      animationFramePendingRef.current = false;
      if (threeRendererRef.current !== threeRenderer) return;
      const activeCamera = cameraRef.current;
      const activeCanvasSize = canvasSizeRef.current;
      const activeMotionPlan = motionPlanRef.current;
      const activeHoveredDetailId = hoveredDetailIdRef.current;
      const activeSelectedDetailId = selectedDetailIdRef.current;
      const activeWorld = worldRef.current;
      const activeShipsById = shipsByIdRef.current;
      if (!activeCamera || activeCanvasSize.x <= 0 || activeCanvasSize.y <= 0) {
        scheduleNextAnimatedFrame();
        return;
      }
      // Hover and selection normally follow a raw input event that has already
      // stamped the interaction clock, but they also move on their own — quick
      // find, restored URL state, a ship the camera is following — and those
      // are somebody using the world too.
      const lastInteractionInput = lastInteractionInputRef.current;
      if (
        activeHoveredDetailId !== lastInteractionInput.hoveredDetailId
        || activeSelectedDetailId !== lastInteractionInput.selectedDetailId
      ) {
        lastInteractionInput.hoveredDetailId = activeHoveredDetailId;
        lastInteractionInput.selectedDetailId = activeSelectedDetailId;
        noteInteraction(time);
      }
      if (lastInteractionAtMsRef.current === null) lastInteractionAtMsRef.current = time;
      const idleState = resolveRenderSchedulerIdleState({
        msSinceInteraction: time - lastInteractionAtMsRef.current,
        reducedMotion,
      });
      // The RAF callback keeps arriving at display rate — only the frame's
      // WORK is skipped. That is what makes waking instant: the first callback
      // after an input already sees a fresh interaction stamp and draws, so
      // there is nothing to spin back up. W0.21: between interaction (full
      // display rate, plus 500 ms) and idle (the 33 ms duty cycle) the garden
      // draws at the ambient 60 Hz cadence, so a 120 Hz panel skips every
      // second callback and a 60 Hz panel skips none.
      if (
        idleState.minFrameIntervalMs > 0
        && lastWallRef.current !== null
        && time - lastWallRef.current < idleState.minFrameIntervalMs
      ) {
        scheduleNextAnimatedFrame();
        return;
      }
      const activeBudget = surfaceBudgetRef.current ?? resolveRenderSurfaceBudget({
        cssHeight: activeCanvasSize.y,
        cssWidth: activeCanvasSize.x,
        requestedDpr: adaptiveDprStateRef.current.requestedDpr,
      });
      surfaceBudgetRef.current = activeBudget;
      const dpr = activeBudget.effectiveDpr;
      let timeSeconds: number;
      // Candidate frame-pacing sample. Stays null on resume frames (mirroring
      // the pendingResume dt exclusion) and is pushed into the pacing window
      // only after the camera step so camera-interaction frames can be
      // excluded too — see the push site below.
      let frameIntervalMs: number | null = null;
      /** The world-clock step this frame; drives the breath weight's easing too. */
      let frameDtSeconds = 0;
      if (reducedMotion) {
        timeSeconds = 0;
      } else {
        const previousWall = lastWallRef.current;
        const last = previousWall ?? time;
        const rawDt = Math.max((time - last) / 1000, 0);
        if (previousWall !== null && !pendingResumeRef.current) {
          frameIntervalMs = Math.max(time - previousWall, 0);
        }
        // Skip accumulating across known tab-pause transitions. For ordinary
        // RAF stalls, cap the world-clock step so ships do not visually hop
        // across a delayed frame; very large deltas are reserved for Playwright
        // fake-clock jumps used by visual tests.
        //
        // The ceiling has to follow the duty cycle, because this is the one
        // place motion is not purely a function of the world clock: the clock
        // is accumulated from capped frame deltas. At the idle target a frame
        // interval sits AT the 1/30s cap, so every scrap of vsync jitter above
        // it would be shaved off the world clock and the fleet would slowly
        // fall behind wall time — the exact "ships slow down" failure idle
        // sampling must not cause. Two idle frames' worth of headroom keeps
        // deliberate spacing intact while a genuine stall is still capped.
        const maxFrameDeltaSeconds = idleState.idle
          ? (idleState.targetFrameMs * 2) / 1000
          : MAX_WORLD_FRAME_DELTA_SECONDS;
        const dt = pendingResumeRef.current
          ? 0
          : rawDt >= TEST_CLOCK_JUMP_DELTA_SECONDS
            ? rawDt
            : Math.min(rawDt, maxFrameDeltaSeconds);
        pendingResumeRef.current = false;
        accSecondsRef.current += dt;
        frameDtSeconds = dt;
        lastWallRef.current = time;
        timeSeconds = accSecondsRef.current;
        advanceMotionBucket(Math.floor(accSecondsRef.current / MOTION_BUCKET_INTERVAL_SECONDS));
      }
      const motionTimeSeconds = reducedMotion
        ? 0
        : Math.max(0, timeSeconds - motionEpochSecondsRef.current);
      const frameWallClockHour = normalizeHour(wallClockHour);
      const sampleStartedAt = performance.now();
      const seaState = seaStateForWorld(activeWorld, { reducedMotion, wallClockHour: frameWallClockHour });
      // G3/W4.4: one wind. The sampler reads the same plan the renderer writes
      // from the same inputs, so bow-to-wind and the cross-current agree with
      // the sails and flags to the frame.
      writeWeatherPlan({
        timeSeconds: motionTimeSeconds,
        wallClockHour: frameWallClockHour,
        reducedMotion,
        psiStress: seaState.source.psiStress,
        baseWind: seaState.wind,
      }, samplerWeather);
      let semanticShipMotionSamples = semanticShipMotionSamplesRef.current;
      if (reducedMotion) {
        const nextSamplesSignature = `${motionPlanSignature(activeWorld)}|sea:${seaStateMotionSignature(seaState)}`;
        if (reducedMotionSamplesSignatureRef.current !== nextSamplesSignature || semanticShipMotionSamples.size === 0) {
          const collected = collectShipMotionSamples({
            motionPlan: activeMotionPlan,
            reducedMotion,
            seaState,
            samples: semanticShipMotionSamples,
            wind: samplerWeather.wind,
            timeSeconds: motionTimeSeconds,
            world: activeWorld,
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
          wind: samplerWeather.wind,
          timeSeconds: motionTimeSeconds,
          world: activeWorld,
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
        timeSeconds: motionTimeSeconds,
      });
      // Resolve the composition before separation: raw route tiles do not include
      // the garden's home offsets, and separating those misses visible neighbours.
      for (const sample of shipMotionSamples.values()) sample.displayTile = null;
      for (const placement of selectGardenObservatorySlice(activeWorld, activeSelectedDetailId).ships) {
        const sample = shipMotionSamples.get(placement.ship.id);
        if (sample) sample.displayTile = { ...resolveGardenShipDisplayTile({ ...placement, sample }) };
      }
      applySeaRoomSeparationPass(shipMotionSamples, activeWorld.ships, {
        reducedMotion,
        seaState,
        timeSeconds: motionTimeSeconds,
      });
      shipMotionSamplesRef.current = shipMotionSamples;
      onShipMotionSamplesReadyRef.current?.(shipMotionSamples, motionTimeSeconds);
      const sampleDurationMs = performance.now() - sampleStartedAt;
      let snapshotRebuildCount = 0;
      const cameraStep = stepCameraRef.current(time, shipMotionSamples);
      // Camera intent that no input event produced — a follow, a focus flight —
      // still means the view is in use.
      if (cameraStep.cameraIntentActive) {
        noteInteraction(time);
        // Camera-intent intervals are deliberately absent from the scheduler's
        // pacing window. Do not leave an old startup sample masquerading as the
        // current frame rate while a moving-ship follow keeps that exclusion
        // active indefinitely.
        if (frameRatePublishRef.current.fps !== null) {
          frameRatePublishRef.current = { fps: null, lastPublishedAtMs: time };
          setFrameRateFps(null);
        }
      }
      const frameCamera = cameraStep.camera ?? cameraRef.current;
      if (!frameCamera) {
        scheduleNextAnimatedFrame();
        return;
      }
      // Camera pan/zoom frames legitimately run 40-220ms intervals; feeding
      // them into the 120-sample pacing window would hold framePacingP90Ms
      // above the render-scheduler recovery threshold for ~2s after the
      // gesture settles, visibly shedding water motion/sparkles/birds.
      // Sample steady-state frames only — resume frames are already excluded
      // above (frameIntervalMs stays null). The adaptive-DPR governor below
      // reads this same cleaned window, so interaction frames cannot trigger
      // DPR downshifts either.
      //
      // A STALL is excluded for the same reason. When a world build, a scene
      // rebuild or a GC blocks the main thread, the next RAF callback reports
      // the whole blocked span as one frame interval. Measured on the
      // reference GPU: the first frame after a data refresh reported 2117ms,
      // which — against a pacing window the world swap had just emptied — put
      // p90 at 2150ms and pinned the scheduler to `constrained` for the ~120
      // frames it took to age out. For those two seconds the beam froze at its
      // static angle and snapped on the way out, shadows, gulls, weather and
      // bloom all dropped, and none of it was a rendering cost: the frame that
      // finally drew was a normal 16.7ms frame.
      //
      // The frames right after a world swap are not pacing samples either.
      //
      // A swap rebuilds the world model and the scene on the main thread, and
      // the next RAF callback reports that whole blocked span as one interval —
      // measured at 2117ms on the reference GPU. Landing that in a window the
      // swap had just emptied put p90 at 2150ms and pinned the scheduler to
      // `constrained` for the ~120 frames it took to age out: the beam froze at
      // its static angle and snapped on the way out, and shadows, gulls,
      // weather and bloom all dropped, none of it a rendering cost.
      //
      // Deliberately a bounded FRAME COUNT rather than a duration threshold.
      // Discarding any interval over some size looks equivalent and is not: a
      // genuinely slow renderer produces long intervals too, and filtering
      // those leaves the pacing window permanently empty on exactly the
      // hardware the scheduler exists for. Software rasterisation draws this
      // scene at ~2fps, where every interval clears any fixed threshold and
      // `sampleCount` sticks at zero forever — which is also what the
      // `@visual-motion` gate measures, so it fails on CI's software renderer.
      // Nor can the previous frame's own draw time stand in for the interval:
      // WebGL submission returns before the GPU has done the work, so a 500ms
      // software frame still reports single-digit JS draw time.
      if (frameIntervalMs !== null && worldSwapSettleFramesRef.current > 0) {
        worldSwapSettleFramesRef.current -= 1;
        frameIntervalMs = null;
      }
      // A frame that had to compile shader programs is a one-off cost, not a
      // rendering budget. The interval measured HERE spans the previous frame,
      // so it is the previous frame's compiling that disqualifies it. Without
      // this, the ~7 frames that first draw each new material after a world
      // swap (~120ms each on the reference GPU) dropped the ladder to
      // `constrained` for the second or so it takes the fleet to settle —
      // shedding shadows, gulls, weather and bloom exactly as the world
      // appears, then popping them all back on.
      if (frameIntervalMs !== null && gpuWarmupFrameRef.current) frameIntervalMs = null;
      // An idle frame's interval is a duty cycle, not a rendering cost, and the
      // waking frame's interval spans the last idle gap. Both are excluded for
      // the same reason interaction frames are: this one window feeds the tier
      // ladder, the adaptive-DPR governor, the fps label and the perf tripwire,
      // and a 33ms sample from a machine that is barely working would read as
      // `recovery` in all four.
      if (frameIntervalMs !== null && (idleState.idle || previousFrameIdleRef.current)) frameIntervalMs = null;
      previousFrameIdleRef.current = idleState.idle;
      if (frameIntervalMs !== null && !cameraStep.cameraIntentActive) {
        framePacingStatsRef.current = pushFrameIntervalSample(frameIntervalWindowRef.current, frameIntervalMs);
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
      const drawStartedAt = performance.now();
      let renderScheduler = resolveRenderSchedulerState({
        cameraIntentActive: cameraStep.cameraIntentActive,
        // Same reason the pacing sample is dropped above: a compiling frame's
        // draw duration measures the compile, not the frame.
        drawDurationMs: gpuWarmupFrameRef.current ? 0 : lastRenderMetricsRef.current.drawDurationMs,
        framePacingP90Ms: framePacingStatsRef.current.p90Ms,
        idleActive: idleState.idle,
        reducedMotion,
      }, renderSchedulerHysteresisRef.current);
      if (import.meta.env.DEV && previewSchedulerTier !== undefined) {
        renderScheduler = applyPreviewSchedulerTier(renderScheduler,
          previewSchedulerTier);
      }
      let renderMetrics: PharosVilleRenderMetrics;
      // K16: breath is idle-only. Hover, selection, camera intent (a glide, a
      // follow, a postcard move) or any input in the last 45 s target zero;
      // the weight eases rather than snapping. The breath rides on this
      // frame's camera state, so the renderer, the hit snapshot and the label
      // anchors all project the same breathed pose.
      const cameraBreath = stepCameraBreath(cameraBreathStateRef.current, {
        dtSeconds: frameDtSeconds,
        forcedStill: reducedMotion || isStillCameraRequested() || (frameCamera.shot?.presence === 1 && !frameCamera.rest),
        idle: activeHoveredDetailId === null
          && activeSelectedDetailId === null
          && !cameraStep.cameraIntentActive
          && time - (lastInteractionAtMsRef.current ?? time) >= CAMERA_BREATH_IDLE_MS,
        phaseSeconds: timeSeconds,
      });
      const drawnCamera: IsoCamera = cameraBreath === CAMERA_BREATH_IDENTITY
        ? frameCamera
        : { ...frameCamera, breath: cameraBreath };
      cameraBreathTargetRef.current.current = cameraBreath;
      try {
        renderMetrics = threeRenderer.render({
          gardenDirector: gardenDirectorRef.current,
          epochSeconds: Date.now() / 1000,
          logos,
          camera: drawnCamera,
          dpr,
          height: activeCanvasSize.y,
          hoveredDetailId: activeHoveredDetailId,
          motionPlan: activeMotionPlan,
          reducedMotion,
          renderScheduler,
          seaState,
          selectedDetailId: activeSelectedDetailId,
          shipMotionSamples,
          timeSeconds,
          wallClockHour: frameWallClockHour,
          width: activeCanvasSize.x,
          world: activeWorld,
        });
      } catch (error) {
        // One throw is not a broken renderer.
        //
        // This used to retire the world to the DOM overview on the first
        // exception, for the rest of the session. But a frame runs against
        // state that several async paths mutate — a hero GLB resolving, the
        // logo atlas repainting, a world swap landing — so a single bad frame
        // is a race, not a diagnosis, and the next frame usually draws fine.
        // A renderer that is genuinely broken throws every frame and still
        // falls back within a few frames. Same shape as the WebGL context
        // grace period: give it a moment to prove which one it is.
        renderFailureStreakRef.current += 1;
        if (renderFailureStreakRef.current >= RENDER_FAILURE_STREAK_LIMIT) {
          failThreeRenderer(error instanceof Error ? error.message : String(error), "render-loop");
          return;
        }
        console.warn("[pharosville] recovered from a world render error", error);
        scheduleNextAnimatedFrame();
        return;
      }
      renderFailureStreakRef.current = 0;
      const drawDurationMs = performance.now() - drawStartedAt;

      // The renderer owns the stele's eased, hysteretic overview rung. Build
      // this frame's hit snapshot only after it has advanced and drawn that
      // track, so the hand sees exactly the same extent as the eye. Pointer
      // event rebuilds between frames reuse this last-drawn value through the
      // shared ref rather than independently resolving a zoom rung.
      const drawnSeaSignScale = threeRenderer.getSeaSignScale();
      seaSignScaleTargetRef.current.current = drawnSeaSignScale;
      const hitTargetStartedAt = performance.now();
      const nextSnapshot = createGardenObservatoryHitTargetSnapshot({
        camera: drawnCamera,
        hoveredDetailId: activeHoveredDetailId,
        seaSignScale: drawnSeaSignScale,
        selectedDetailId: activeSelectedDetailId,
        shipMotionSamples,
        viewport: { height: activeCanvasSize.y, width: activeCanvasSize.x },
        world: activeWorld,
      });
      hitTargetSnapshotRef.current = nextSnapshot;
      hitTargetsRef.current = nextSnapshot.targets;
      onStationLabelFrameRef.current?.(createGardenStationLabelFrame({
        camera: drawnCamera,
        snapshot: nextSnapshot,
        viewport: { height: activeCanvasSize.y, width: activeCanvasSize.x },
        world: activeWorld,
      }));
      snapshotRebuildCount += 1;
      const hitTargetDurationMs = performance.now() - hitTargetStartedAt;

      const targets = hitTargetsRef.current;
      const nextFrameState = frameStateRef.current;
      const targetByDetailId = nextSnapshot.targetsByDetailId;
      nextFrameState.samples = shipMotionSamples;
      nextFrameState.targets = targets;
      nextFrameState.hoveredTarget = activeHoveredDetailId
        ? targetByDetailId.get(activeHoveredDetailId) ?? null
        : null;
      nextFrameState.selectedTarget = activeSelectedDetailId
        ? targetByDetailId.get(activeSelectedDetailId) ?? null
        : null;
      nextFrameState.timeSeconds = timeSeconds;
      nextFrameState.wallClockHour = frameWallClockHour;
      const nextHoveredTarget = nextFrameState.hoveredTarget;
      const tooltipEl = hoverTooltipElRef?.current;
      if (tooltipEl) {
        const nameplateVisible = hoverNameplateVisible(
          hoverNameplateDwellRef.current,
          nextHoveredTarget?.detailId ?? null,
          time,
        );
        if (nextHoveredTarget && nameplateVisible) {
          const rect = nextHoveredTarget.rect;
          const tooltipX = Math.round(rect.x + rect.width / 2);
          const tooltipY = Math.round(rect.y);
          tooltipEl.style.transform = `translate(${tooltipX}px, ${tooltipY}px)`;
          tooltipEl.dataset.visible = "true";
        } else if (tooltipEl.dataset.visible !== "false") {
          tooltipEl.dataset.visible = "false";
        }
      }
      if (activeWorld.routeMode === "world" && !rendererWarmupStartedRef.current) {
        rendererWarmupStartedRef.current = true;
        void threeRenderer.warmup()
          .then(() => {
            if (threeRendererRef.current !== threeRenderer) return;
            setRendererWarmupReady(true);
            requestPaint();
          })
          .catch((error) => {
            if (threeRendererRef.current !== threeRenderer) return;
            failThreeRenderer(error instanceof Error ? error.message : String(error), "render-loop");
          });
      }
      gpuWarmupFrameRef.current = (renderMetrics.gpuWarmupCount ?? 0) > 0;
      const previousTimeToFirstCoherentFrameMs = lastRenderMetricsRef.current.timeToFirstCoherentFrameMs;
      lastRenderMetricsRef.current = {
        ...renderMetrics,
        hitTargetDurationMs,
        drawDurationMs,
        framePacing: framePacingStatsRef.current,
        sampleDurationMs,
        snapshotRebuildCount,
        rendererBackend: "three",
      };
      if (previousTimeToFirstCoherentFrameMs !== undefined) {
        lastRenderMetricsRef.current.timeToFirstCoherentFrameMs = previousTimeToFirstCoherentFrameMs;
      }
      if (!reducedMotion && !gpuWarmupFrameRef.current) {
        drawDurationStatsRef.current = pushDrawDurationSample(drawDurationWindowRef.current, lastRenderMetricsRef.current.drawDurationMs);
        // Pass the pacing window alongside draw durations so the governor can
        // see raster/compositor-bound frames where JS-side draw time stays
        // quiet while real frame pacing collapses (interaction frames are
        // already excluded from this window above).
        const gpuTimings = renderMetrics.gpuTimings;
        const nextAdaptiveDprState = resolveAdaptiveDprState({
          deviceDpr: Math.max(1, window.devicePixelRatio || 1),
          framePacing: framePacingStatsRef.current,
          gpuFrameP95Ms: gpuTimings?.supported && !gpuTimings.disjoint ? gpuTimings.frameP95Ms : null,
          maximumRequestedDpr: maximumRequestedDprRef.current,
          state: adaptiveDprStateRef.current,
          stats: drawDurationStatsRef.current,
        });
        if (nextAdaptiveDprState.requestedDpr !== adaptiveDprStateRef.current.requestedDpr) {
          adaptiveDprStateRef.current = nextAdaptiveDprState;
          const nextBudget = resolveRenderSurfaceBudget({
            cssHeight: activeCanvasSize.y,
            cssWidth: activeCanvasSize.x,
            requestedDpr: nextAdaptiveDprState.requestedDpr,
          });
          surfaceBudgetRef.current = nextBudget;
        } else if (
          nextAdaptiveDprState.cooldownFrames !== adaptiveDprStateRef.current.cooldownFrames
          || nextAdaptiveDprState.downshiftStreak !== adaptiveDprStateRef.current.downshiftStreak
          || nextAdaptiveDprState.upshiftStreak !== adaptiveDprStateRef.current.upshiftStreak
        ) {
          adaptiveDprStateRef.current = nextAdaptiveDprState;
        }
      }
      if (!firstFramePaintedRef.current) {
        firstFramePaintedRef.current = true;
        const timeToFirstCoherentFrameMs = performance.now() - mountEpochMsRef.current;
        if (Number.isFinite(timeToFirstCoherentFrameMs)) {
          lastRenderMetricsRef.current = {
            ...lastRenderMetricsRef.current,
            timeToFirstCoherentFrameMs: Math.max(0, timeToFirstCoherentFrameMs),
          };
        }
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
        const motionStatsAcc = motionStatsAccRef.current;
        for (const [id, sample] of nextFrameState.samples) {
          const prev = lastTilePos.get(id);
          if (prev) {
            if (isContinuousPositionDiagnosticSample(prev, sample)) {
              const headingDelta = headingDeltaDegreesPerSecond(prev, sample, nextFrameState.timeSeconds);
              if (headingDelta > frameMaxHeadingDeg) frameMaxHeadingDeg = headingDelta;
              if (nextFrameState.timeSeconds > prev.timeSeconds) {
                if (isUnderwayState(sample.state)) {
                  motionStatsAcc.turnSum += headingDelta;
                  motionStatsAcc.turnCount += 1;
                } else {
                  motionStatsAcc.restTurnSum += headingDelta;
                  motionStatsAcc.restTurnCount += 1;
                }
              }
              const tile = sample.displayTile ?? sample.tile;
              const d = Math.hypot(tile.x - prev.x, tile.y - prev.y);
              if (d > frameMaxPosDelta) frameMaxPosDelta = d;
            }
            writeLastTilePositionSample(prev, sample, nextFrameState.timeSeconds);
          } else {
            lastTilePos.set(id, createLastTilePositionSample(sample, nextFrameState.timeSeconds));
          }
        }
        const shipMaxHeadingDeltaDeg = pushNumericMaxWindow(headingDeltaWindowRef.current, frameMaxHeadingDeg);
        const shipMaxPositionDeltaTile = pushNumericMaxWindow(positionDeltaWindowRef.current, frameMaxPosDelta);

        // W0.2 motion stats: counted from this frame's samples at most twice
        // a second, written into the one published object.
        if (time - motionStatsAcc.lastRefreshAtMs >= MOTION_STATS_REFRESH_MS) {
          let visibleShips = 0;
          let underwayShips = 0;
          for (const [id, sample] of nextFrameState.samples) {
            const ship = activeShipsById.get(id);
            if (ship && !isShipMapVisible(ship, sample)) continue;
            visibleShips += 1;
            if (isUnderwayState(sample.state)) underwayShips += 1;
          }
          const stats = motionStatsRef.current;
          stats.visibleShips = visibleShips;
          stats.underwayShips = underwayShips;
          stats.meanAbsTurnDegPerSec = motionStatsAcc.turnCount > 0 ? motionStatsAcc.turnSum / motionStatsAcc.turnCount : 0;
          stats.meanAbsRestTurnDegPerSec = motionStatsAcc.restTurnCount > 0 ? motionStatsAcc.restTurnSum / motionStatsAcc.restTurnCount : 0;
          stats.sampledAtMs = time;
          motionStatsAcc.lastRefreshAtMs = time;
          motionStatsAcc.turnSum = 0;
          motionStatsAcc.turnCount = 0;
          motionStatsAcc.restTurnSum = 0;
          motionStatsAcc.restTurnCount = 0;
        }

        // A3: route cache stats.
        let routeCacheStats: { hitRatio: number; evictionRate: number; size: number; capacity: number } | undefined;
        const rawStats = getCurrentMapPathCacheStats(activeWorld.map);
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
          cameraBreathWeight: cameraBreathStateRef.current.weight,
          frameCount: motionFrameCountRef.current,
          frameState: nextFrameState,
          camera: frameCamera,
          canvasSize: activeCanvasSize,
          reducedMotion,
          gardenDirector: gardenDirectorRef.current,
          motionStats: motionStatsRef.current,
          renderMetrics: lastRenderMetricsRef.current,
          shipsById: activeShipsById,
          compactSampleCache: compactShipMotionSampleCacheRef.current,
          world: activeWorld,
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

    // Idle wake-ups. Listened for at the window, in the capture phase, so a
    // handler that stops propagation somewhere in the tree cannot leave the
    // world throttled under a hand that is plainly on the mouse. Each one only
    // stamps a timestamp, and pointer moves over empty water — which change no
    // hover and no camera — are exactly the input the in-frame signals miss.
    // Reduced motion has no continuous loop to throttle, so it registers none
    // of this.
    const handleInteractionEvent = () => {
      noteInteraction(performance.now());
    };
    const interactionEventNames = ["pointermove", "pointerdown", "wheel", "keydown"] as const;
    if (!reducedMotion) {
      for (const eventName of interactionEventNames) {
        window.addEventListener(eventName, handleInteractionEvent, { capture: true, passive: true });
      }
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

    if (canvasIsVisibleRef.current) drawFrame(performance.now());
    return () => {
      paintRequestRef.current = () => {};
      animationFramePendingRef.current = false;
      lastWallRef.current = null;
      // With no loop drawing, click-time picking returns to the unbreathed pose.
      cameraBreathTargetRef.current.current = CAMERA_BREATH_IDENTITY;
      if (frameId) cancelAnimationFrame(frameId);
      if (observer) observer.disconnect();
      if (longtaskObserverRef.current) {
        longtaskObserverRef.current.disconnect();
        longtaskObserverRef.current = null;
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      if (!reducedMotion) {
        for (const eventName of interactionEventNames) {
          window.removeEventListener(eventName, handleInteractionEvent, { capture: true });
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    advanceMotionBucket,
    cameraReady,
    canvasSize.x,
    canvasSize.y,
    failThreeRenderer,
    logos,
    reducedMotion,
    rendererGeneration,
    rendererStatus,
    wallClockHour,
    worldContentSignature,
  ]);

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
  }, [logoGeneration, requestPaint]);

  // Visual debug telemetry — published to window for tests / dev tooling.
  useEffect(() => {
    if (!isVisualDebugAllowed()) return;
    const debugWindow = window as typeof window & {
      __pharosVilleDebug?: PharosVilleDebugState;
    };
    const frameState = frameStateRef.current;
    const framePatch = debugFramePatch({
      animationFramePending: animationFramePendingRef.current,
      camera,
      cameraBreathWeight: cameraBreathStateRef.current.weight,
      canvasSize,
      compactSampleCache: compactShipMotionSampleCacheRef.current,
      frameCount: motionFrameCountRef.current,
      frameState,
      reducedMotion,
      gardenDirector,
      motionStats: motionStatsRef.current,
      renderMetrics: lastRenderMetricsRef.current,
      shipsById,
      world,
    });
    debugWindow.__pharosVilleDebug = {
      ...framePatch,
      worldGeneratedAtMs: world.generatedAt,
      admittedShipDetailIds: () => selectGardenObservatorySlice(world, selectedDetailId).ships.map(({ ship }) => ship.detailId),
      anchors: debugWorldAnchors(world),
      camera,
      surfaceBudget: surfaceBudgetRef.current,
      canvasSize,
      // W0.3: world → CSS-pixel canvas coordinates with the pose last drawn
      // (breath included, as the hit snapshot reads it).
      project: (points) => {
        const breath = cameraBreathTargetRef.current.current;
        const activeCamera = cameraRef.current && breath !== CAMERA_BREATH_IDENTITY
          ? { ...cameraRef.current, breath }
          : cameraRef.current;
        const viewport = canvasSizeRef.current;
        return points.map((point) => {
          if (!activeCamera || viewport.x <= 0 || viewport.y <= 0) return { x: Number.NaN, y: Number.NaN, visible: false };
          const screen = worldToScreen(point, activeCamera, viewport);
          return {
            x: screen.x,
            y: screen.y,
            visible: worldViewDepth(point, activeCamera, viewport) > CAMERA_NEAR
              && screen.x >= 0 && screen.x <= viewport.x
              && screen.y >= 0 && screen.y <= viewport.y,
          };
        });
      },
      selectedDetailAnchor,
      selectedDetailId,
      stillCamera: isStillCameraRequested(),
    };
    return () => {
      delete debugWindow.__pharosVilleDebug;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, canvasSize, hoveredDetailId, motionPlan, reducedMotion, selectedDetailAnchor, selectedDetailId, shipsById, world]);

  return {
    frameRateFps,
    rendererFailure,
    rendererWarmupReady,
    rendererStatus,
    requestPaint,
  };
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
  worldGeneratedAtMs: number | null;
  admittedShipDetailIds: () => string[];
  activeCameraLoopCount: number;
  activeMotionLoopCount: number;
  /** W0.3 world-unit anchors for picture metrics. */
  anchors: DebugWorldAnchors;
  camera: IsoCamera | null;
  /** W0.12 eased breath weight applied to the frame last drawn (0 = no breath). */
  cameraBreathWeight: number;
  cameraFrameSource: "world-render-loop";
  cameraWithinBounds: boolean;
  /** W0.2: every beat the director admitted, oldest first, capped at 200. */
  directorLog: readonly DebugDirectorAdmission[];
  /** W5.1: start a ritual now through its registered handler, outside the score. */
  forceRitual: (kind: GardenRitualKind) => boolean;
  directorActive: GardenBeat | null;
  /** W0.2 fleet motion instruments, refreshed ≤ 2×/s. */
  motionStats: DebugMotionStats;
  project: (points: readonly DebugWorldPoint[]) => { x: number; y: number; visible: boolean }[];
  /** W0.2 `still=1`: no breath, no attract. */
  stillCamera: boolean;
  surfaceBudget: ReturnType<typeof resolveRenderSurfaceBudget> | null;
  canvasSize: ScreenPoint;
  animationFramePending: boolean;
  motionClockSource: "requestAnimationFrame" | "reduced-motion-static-frame";
  motionFrameCount: number;
  renderMetrics: DebugRenderMetrics;
  reducedMotion: boolean;
  selectedDetailAnchor: DetailAnchor | null;
  selectedDetailId: string | null;
  shipMotionSamples: CompactShipMotionSample[];
  targets: readonly HitTarget[];
  timeSeconds: number;
  wallClockHour: number;
};

const FRAME_RATE_LABEL_UPDATE_MS = 500;
/**
 * Frames after a world swap kept out of the pacing window, because their
 * intervals contain the rebuild rather than a rendering cost.
 *
 * ONE, because the evidence only ever supported one. The swap produces a single
 * enormous interval — 2117ms measured — and the ~7 warm-up frames that follow
 * are real rendering cost that belongs in the window. Three was defensive
 * padding, and on a renderer slow enough to produce few frames per second it
 * ate most of the samples the `@visual-motion` gate needs: CI reported
 * `sampleCount` 3 against a floor of 5.
 */
const WORLD_SWAP_SETTLE_FRAMES = 1;
/**
 * Consecutive throwing frames before the world gives up and hands over to the
 * DOM overview. Small enough that a genuinely broken renderer falls back within
 * a few frames, large enough that a one-off race does not cost the session.
 */
const RENDER_FAILURE_STREAK_LIMIT = 4;
const MAX_WORLD_FRAME_DELTA_SECONDS = 1 / 30;
const TEST_CLOCK_JUMP_DELTA_SECONDS = 1;
const MOTION_BUCKET_INTERVAL_SECONDS = 600;
const MOTION_BUCKET_INTERVAL_MS = MOTION_BUCKET_INTERVAL_SECONDS * 1000;

function collectShipMotionSamples(input: {
  motionPlan: MotionPlan;
  reducedMotion: boolean;
  seaState: SeaState;
  samples: ReadonlyMap<string, ShipMotionSample>;
  wind: WeatherPlan["wind"];
  timeSeconds: number;
  world: PharosVilleWorldModel;
  trackShipHitState?: boolean;
}) {
  const samples = input.samples as Map<string, ShipMotionSample>;
  // Consorts sample their flagship's route at their own rank delay
  // (W4.F11), so ships resolve in any order.
  for (const ship of input.world.ships) {
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
      wind: input.wind,
    }, sample);
  }
  if (samples.size !== input.world.ships.length) {
    const liveIds = new Set(input.world.ships.map((ship) => ship.id));
    for (const id of samples.keys()) {
      if (!liveIds.has(id)) samples.delete(id);
    }
  }
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
    compact.x = (sample.displayTile ?? sample.tile).x;
    compact.y = (sample.displayTile ?? sample.tile).y;
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
    visibilityAlpha: sample.mapVisibilityAlpha,
    x: (sample.displayTile ?? sample.tile).x,
    y: (sample.displayTile ?? sample.tile).y,
  };
}

function writeLastTilePositionSample(target: LastTilePositionSample, sample: ShipMotionSample, timeSeconds: number): void {
  target.currentRouteStopId = sample.currentRouteStopId;
  target.headingX = sample.heading.x;
  target.headingY = sample.heading.y;
  target.routePathKey = sample.routePathKey;
  target.state = sample.state;
  target.timeSeconds = timeSeconds;
  target.visibilityAlpha = sample.mapVisibilityAlpha;
  target.x = (sample.displayTile ?? sample.tile).x;
  target.y = (sample.displayTile ?? sample.tile).y;
}

function isContinuousPositionDiagnosticSample(previous: LastTilePositionSample, sample: ShipMotionSample): boolean {
  const visibilityAlpha = sample.mapVisibilityAlpha;
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

type DebugFramePatchInput = {
  animationFramePending: boolean;
  camera: IsoCamera | null;
  cameraBreathWeight: number;
  canvasSize: ScreenPoint;
  compactSampleCache: CompactShipMotionSampleCache;
  frameCount: number;
  frameState: {
    samples: ReadonlyMap<string, ShipMotionSample>;
    targets: readonly HitTarget[];
    timeSeconds: number;
    wallClockHour: number;
  };
  reducedMotion: boolean;
  gardenDirector: GardenDirectorState | undefined;
  motionStats: DebugMotionStats;
  renderMetrics: DebugRenderMetrics;
  shipsById: ReadonlyMap<string, PharosVilleWorldModel["ships"][number]>;
  world: PharosVilleWorldModel;
};

type DebugFramePatch = Omit<
  PharosVilleDebugState,
  | "anchors"
  | "worldGeneratedAtMs"
  | "admittedShipDetailIds"
  | "surfaceBudget"
  | "canvasSize"
  | "project"
  | "selectedDetailAnchor"
  | "selectedDetailId"
  | "stillCamera"
>;

function debugFramePatch(input: DebugFramePatchInput): DebugFramePatch {
  return {
    activeCameraLoopCount: 0,
    activeMotionLoopCount: input.reducedMotion || !input.animationFramePending ? 0 : 1,
    animationFramePending: input.animationFramePending,
    camera: input.camera,
    cameraBreathWeight: input.cameraBreathWeight,
    cameraFrameSource: "world-render-loop",
    directorActive: input.gardenDirector?.active ?? null,
    directorLog: debugDirectorLog,
    forceRitual: (kind) => forceGardenRitual(kind),
    cameraWithinBounds: isCameraWithinBounds(input.camera, input.world.map, input.canvasSize),
    motionClockSource: input.reducedMotion ? "reduced-motion-static-frame" : "requestAnimationFrame",
    motionFrameCount: input.frameCount,
    motionStats: input.motionStats,
    renderMetrics: input.renderMetrics,
    reducedMotion: input.reducedMotion,
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
    __pharosVilleFrameEvidence?: (metrics: DebugRenderMetrics, worldGeneratedAt: number) => void;
  };
  if (import.meta.env.DEV && input.world.generatedAt !== null) {
    debugWindow.__pharosVilleFrameEvidence?.(input.renderMetrics, input.world.generatedAt);
  }
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

type CameraBreathState = { breath: CameraBreath; rise: number; weight: number };

/**
 * One frame of the W0.12 breath: advance the eased weight, then write the
 * breathed offsets into the state's scratch object. Returns the identity
 * constant (no allocation) whenever the weight is zero.
 */
export function stepCameraBreath(
  state: CameraBreathState,
  input: { dtSeconds: number; forcedStill: boolean; idle: boolean; phaseSeconds: number },
): Readonly<CameraBreath> {
  if (input.forcedStill) {
    state.rise = 0;
    state.weight = 0;
    return CAMERA_BREATH_IDENTITY;
  }
  const dt = Math.max(0, input.dtSeconds);
  if (input.idle) {
    state.rise = Math.min(1, state.rise + dt / CAMERA_BREATH_EASE_IN_SECONDS);
    const rise = state.rise;
    // Quintic smootherstep: zero velocity and acceleration at both ends.
    state.weight = Math.max(state.weight, rise * rise * rise * (rise * (rise * 6 - 15) + 10));
  } else {
    state.rise = 0;
    state.weight *= Math.exp(-dt / CAMERA_BREATH_EASE_OUT_TAU_SECONDS);
    if (state.weight < 1e-4) state.weight = 0;
  }
  const weight = state.weight;
  if (weight === 0) return CAMERA_BREATH_IDENTITY;
  const phase = CAMERA_BREATH_TWO_PI * input.phaseSeconds;
  state.breath.dolly = 1 + weight * CAMERA_BREATH_DOLLY * Math.sin(phase / 131 + 2.1);
  state.breath.pitch = weight * CAMERA_BREATH_PITCH_RAD * Math.sin(phase / 97 + 1.3);
  state.breath.yaw = weight * CAMERA_BREATH_YAW_RAD * Math.sin(phase / 118);
  return state.breath;
}

type DebugWorldPoint = { x: number; y: number; z: number };

type DebugMotionStats = {
  /** Mean |yaw rate| of hulls under way (departing, sailing, arriving). */
  meanAbsTurnDegPerSec: number;
  /** Mean |yaw rate| of hulls at rest (moored, anchored): near zero by design (W4.F9). */
  meanAbsRestTurnDegPerSec: number;
  sampledAtMs: number;
  underwayShips: number;
  visibleShips: number;
};

type DebugWorldAnchors = {
  inletPolygon: DebugWorldPoint[];
  towerCrown: DebugWorldPoint;
  towerFaceLeft: DebugWorldPoint;
  towerFaceRight: DebugWorldPoint;
  towerFoot: DebugWorldPoint;
};

/** Under way means a voyage; an anchored (risk-drift) hull is at rest. */
function isUnderwayState(state: ShipMotionSample["state"]): boolean {
  return state === "departing" || state === "sailing" || state === "arriving";
}

// The Pharos's battered square tier (L1 silhouette contract, mirrored from
// `garden-lighthouse.ts`): lighthouse-local y 2.5 → 20.5, half-width
// 4.6 → 3.7, flat faces on the local ±X/±Z axes (the tower yaw is a quarter
// turn, which keeps them axis-aligned in the world).
const TOWER_SQUARE_BASE_Y = 2.5;
const TOWER_SQUARE_TOP_Y = 20.5;
const TOWER_SQUARE_BASE_HALF = 4.6;
const TOWER_SQUARE_TOP_HALF = 3.7;
const INLET_CAP_STEPS = 8;

/**
 * W0.3 world anchors for picture metrics, in world units: the tower foot and
 * crown, the centres of the two square-tier faces the rest camera sees (at
 * the tier's mid-height, split by the camera's right axis) and the
 * `GARDEN_EMPTY_INLET` corridor outlined at water level.
 */
function debugWorldAnchors(world: PharosVilleWorldModel): DebugWorldAnchors {
  const islandTile = gardenIslandDisplayTile(world.lighthouse.tile);
  const footX = islandTile.x * TILE_SCALE + GARDEN_LIGHTHOUSE_ROOT_OFFSET.x;
  const footY = GARDEN_LIGHTHOUSE_ROOT_OFFSET.y;
  const footZ = islandTile.y * TILE_SCALE + GARDEN_LIGHTHOUSE_ROOT_OFFSET.z;
  const midLocalY = (TOWER_SQUARE_BASE_Y + TOWER_SQUARE_TOP_Y) / 2;
  const midHalf = (TOWER_SQUARE_BASE_HALF + TOWER_SQUARE_TOP_HALF) / 2;
  // Faces whose outward normal points toward the eye; the one further along
  // the camera's right axis is the right face.
  const eyeX = Math.sin(REST_SEAT_YAW_RAD);
  const eyeZ = Math.cos(REST_SEAT_YAW_RAD);
  const rightX = Math.cos(REST_SEAT_YAW_RAD);
  const rightZ = -Math.sin(REST_SEAT_YAW_RAD);
  const faceX = { x: Math.sign(eyeX) || 1, z: 0 };
  const faceZ = { x: 0, z: Math.sign(eyeZ) || 1 };
  const [leftFace, rightFace] = faceX.x * rightX + faceX.z * rightZ < faceZ.x * rightX + faceZ.z * rightZ
    ? [faceX, faceZ]
    : [faceZ, faceX];
  const facePoint = (face: { x: number; z: number }): DebugWorldPoint => ({
    x: footX + face.x * midHalf,
    y: footY + midLocalY,
    z: footZ + face.z * midHalf,
  });
  return {
    inletPolygon: inletCorridorPolygon(),
    towerCrown: { x: footX, y: footY + GARDEN_LIGHTHOUSE_HEIGHT, z: footZ },
    towerFaceLeft: facePoint(leftFace),
    towerFaceRight: facePoint(rightFace),
    towerFoot: { x: footX, y: footY, z: footZ },
  };
}

/** The inlet's buffered polyline (mitred sides, round ends) as a closed outline at water level. */
function inletCorridorPolygon(): DebugWorldPoint[] {
  const line = GARDEN_EMPTY_INLET.polyline;
  const radius = GARDEN_EMPTY_INLET.halfWidth;
  const last = line.length - 1;
  const direction = (from: number, to: number) => {
    const dx = line[to]!.x - line[from]!.x;
    const dy = line[to]!.y - line[from]!.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  };
  const toWorld = (x: number, y: number): DebugWorldPoint => ({ x: x * TILE_SCALE, y: GARDEN_WATER_Y, z: y * TILE_SCALE });
  const left: DebugWorldPoint[] = [];
  const right: DebugWorldPoint[] = [];
  for (let index = 0; index <= last; index += 1) {
    const incoming = direction(Math.max(0, index - 1), Math.max(1, index));
    const outgoing = direction(Math.min(last - 1, index), Math.min(last, index + 1));
    const normalX = -(incoming.y + outgoing.y);
    const normalY = incoming.x + outgoing.x;
    const normalLength = Math.hypot(normalX, normalY) || 1;
    const nx = normalX / normalLength;
    const ny = normalY / normalLength;
    const miter = radius / Math.max(0.25, nx * -outgoing.y + ny * outgoing.x);
    const point = line[index]!;
    left.push(toWorld(point.x + nx * miter, point.y + ny * miter));
    right.push(toWorld(point.x - nx * miter, point.y - ny * miter));
  }
  const cap = (index: number, forward: { x: number; y: number }, sign: 1 | -1): DebugWorldPoint[] => {
    const point = line[index]!;
    const nx = -forward.y * sign;
    const ny = forward.x * sign;
    const out: DebugWorldPoint[] = [];
    for (let step = 1; step < INLET_CAP_STEPS; step += 1) {
      const angle = step / INLET_CAP_STEPS * Math.PI;
      out.push(toWorld(
        point.x + radius * (nx * Math.cos(angle) + forward.x * sign * Math.sin(angle)),
        point.y + radius * (ny * Math.cos(angle) + forward.y * sign * Math.sin(angle)),
      ));
    }
    return out;
  };
  return [
    ...left,
    ...cap(last, direction(last - 1, last), 1),
    ...right.reverse(),
    ...cap(0, direction(0, 1), -1),
  ];
}

// Installed before navigation by the real-GPU preview harness, never a shipped control.
const previewSchedulerTier = import.meta.env.DEV && isDebugChromeEnabled()
  ? (window as typeof window & { __pharosVilleTestSchedulerTier?: unknown }).__pharosVilleTestSchedulerTier
  : undefined;
