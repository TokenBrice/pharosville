// Owns the requestAnimationFrame draw loop, per-frame timing/metrics refs,
// hit-target snapshot maintenance during the frame, ship motion sample
// collection, and visual debug telemetry. Shared cross-hook refs (camera,
// canvas size, hit-targets, samples) are passed in.
import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import type { PharosVilleAssetLoadError, PharosVilleAssetLoadStats, PharosVilleAssetManager } from "../renderer/asset-manager";
import { createHitTargetSnapshot, updateHitTargetSnapshotShips, type HitTarget, type HitTargetSnapshot } from "../renderer/hit-testing";
import { selectionDrawableCount } from "../renderer/layers/selection";
import { drawPharosVille, type PharosVilleRenderMetrics } from "../renderer/world-canvas";
import { clampCameraToMap } from "../systems/camera";
import {
  createDrawDurationWindow,
  pushDrawDurationSample,
  resolveAdaptiveDprState,
  resolveCanvasBudget,
  type AdaptiveDprState,
  type DrawDurationWindow,
} from "../systems/canvas-budget";
import { buildMotionPlan, createShipMotionSample, isShipMapVisible, resolveShipMotionSampleInto, type ShipMotionSample } from "../systems/motion";
import type { IsoCamera, ScreenPoint } from "../systems/projection";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";

type MotionPlan = ReturnType<typeof buildMotionPlan>;

interface DetailAnchor extends ScreenPoint {
  side: "left" | "right";
}

export interface UseWorldRenderLoopInput {
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
  maximumRequestedDprRef: MutableRefObject<number>;
  motionPlan: MotionPlan;
  motionPlanRef: MutableRefObject<MotionPlan>;
  nightMode: boolean;
  reducedMotion: boolean;
  selectedDetailAnchor: DetailAnchor | null;
  selectedDetailId: string | null;
  selectedDetailIdRef: MutableRefObject<string | null>;
  setCriticalFramePainted: Dispatch<SetStateAction<boolean>>;
  shipMotionSamplesRef: MutableRefObject<ReadonlyMap<string, ShipMotionSample>>;
  shipsById: ReadonlyMap<string, PharosVilleWorldModel["ships"][number]>;
  world: PharosVilleWorldModel;
}

export interface UseWorldRenderLoopResult {
  requestPaint: () => void;
}

export function useWorldRenderLoop(input: UseWorldRenderLoopInput): UseWorldRenderLoopResult {
  const {
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
    maximumRequestedDprRef,
    motionPlan,
    motionPlanRef,
    nightMode,
    reducedMotion,
    selectedDetailAnchor,
    selectedDetailId,
    selectedDetailIdRef,
    setCriticalFramePainted,
    shipMotionSamplesRef,
    shipsById,
    world,
  } = input;

  // Mirror criticalAssetAttemptsSettled into a ref so the RAF loop reads the
  // latest value without rebinding when it transitions from false → true.
  const criticalAssetAttemptsSettledRef = useRef(criticalAssetAttemptsSettled);
  useEffect(() => {
    criticalAssetAttemptsSettledRef.current = criticalAssetAttemptsSettled;
  }, [criticalAssetAttemptsSettled]);

  const animationFramePendingRef = useRef(false);
  const paintRequestRef = useRef<() => void>(() => {});
  const requestPaint = useCallback(() => {
    paintRequestRef.current();
  }, []);
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
  const accSecondsRef = useRef(0);
  const pendingResumeRef = useRef(false);
  const motionFrameCountRef = useRef(0);
  const lastRenderMetricsRef = useRef<PharosVilleRenderMetrics & { drawDurationMs: number }>({
    drawableCount: 0,
    drawableCounts: { underlay: 0, body: 0, overlay: 0, selection: 0 },
    drawDurationMs: 0,
    movingShipCount: 0,
    visibleShipCount: 0,
    visibleTileCount: 0,
  });
  const shipHitStateRef = useRef(new Map<string, { cellX: number; cellY: number; visible: boolean }>());
  const frameStateRef = useRef<{
    samples: ReadonlyMap<string, ShipMotionSample>;
    targets: readonly HitTarget[];
    timeSeconds: number;
    wallClockHour: number;
  }>({ samples: new Map(), targets: [], timeSeconds: 0, wallClockHour: 0 });

  // Reset per-world transient state (timing, samples, hit snapshot) when the
  // world reference changes.
  useEffect(() => {
    lastWallRef.current = null;
    accSecondsRef.current = 0;
    pendingResumeRef.current = false;
    motionFrameCountRef.current = 0;
    shipMotionSamplesRef.current = new Map();
    hitTargetSnapshotRef.current = null;
    hitTargetsRef.current = [];
    shipHitStateRef.current.clear();
    drawDurationWindowRef.current = createDrawDurationWindow();
    drawDurationStatsRef.current = { averageMs: 0, count: 0, p90Ms: 0 };
  }, [hitTargetSnapshotRef, hitTargetsRef, shipMotionSamplesRef, world]);

  // RAF effect — bound once per plumbing change (`world`, `canvasSize`,
  // `reducedMotion`, `assetManager`, `cameraReady`, `nightMode`, `shipsById`).
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
    const drawFrame = (time: number) => {
      animationFramePendingRef.current = false;
      const activeCamera = cameraRef.current;
      const activeCanvasSize = canvasSizeRef.current;
      const activeMotionPlan = motionPlanRef.current;
      const activeHoveredDetailId = hoveredDetailIdRef.current;
      const activeSelectedDetailId = selectedDetailIdRef.current;
      const activeCriticalSettled = criticalAssetAttemptsSettledRef.current;
      if (!activeCamera || activeCanvasSize.x <= 0 || activeCanvasSize.y <= 0) return;
      const activeBudget = canvasBudgetRef.current ?? resolveCanvasBudget({
        cssHeight: activeCanvasSize.y,
        cssWidth: activeCanvasSize.x,
        requestedDpr: adaptiveDprStateRef.current.requestedDpr,
      });
      canvasBudgetRef.current = activeBudget;
      const dpr = activeBudget.effectiveDpr;
      let timeSeconds: number;
      if (reducedMotion) {
        timeSeconds = 0;
      } else {
        const last = lastWallRef.current ?? time;
        const rawDt = Math.max((time - last) / 1000, 0);
        // Skip accumulating across known tab-pause transitions: the
        // visibilitychange handler raises pendingResumeRef when the page goes
        // hidden, so the first frame after resume drops its (large) dt. For all
        // other gaps — including Playwright fake-clock fastForward — accept the
        // raw dt so motion advances naturally.
        const dt = pendingResumeRef.current ? 0 : rawDt;
        pendingResumeRef.current = false;
        accSecondsRef.current += dt;
        lastWallRef.current = time;
        timeSeconds = accSecondsRef.current;
      }
      let wallClockHour: number;
      const testOverride = (globalThis as { __pharosVilleTestWallClockHour?: number }).__pharosVilleTestWallClockHour;
      if (typeof testOverride === "number" && Number.isFinite(testOverride)) {
        // Visual tests inject this global to render at a specific hour. Takes
        // precedence over the reduced-motion noon pin so dawn/dusk/night
        // baselines are stable without losing reduced-motion's animation
        // suppression.
        wallClockHour = ((testOverride % 24) + 24) % 24;
      } else if (nightMode) {
        wallClockHour = 22;
      } else {
        wallClockHour = 12;
      }
      const shipMotionSamples = collectShipMotionSamples({
        motionPlan: activeMotionPlan,
        reducedMotion,
        samples: shipMotionSamplesRef.current,
        timeSeconds,
        world,
      });
      shipMotionSamplesRef.current = shipMotionSamples;
      const changedShipIds = changedShipHitTargets({
        shipHitStateById: shipHitStateRef.current,
        samples: shipMotionSamples,
        world,
      });
      if (changedShipIds.length > 0) {
        const snapshot = hitTargetSnapshotRef.current;
        if (snapshot) {
          const nextSnapshot = updateHitTargetSnapshotShips({
            assets: assetManager,
            camera: activeCamera,
            changedShipIds,
            hoveredDetailId: activeHoveredDetailId,
            selectedDetailId: activeSelectedDetailId,
            shipMotionSamples,
            snapshot,
            viewport: { height: activeCanvasSize.y, width: activeCanvasSize.x },
            world,
            worldShipsById: shipsById,
          });
          hitTargetSnapshotRef.current = nextSnapshot;
          hitTargetsRef.current = nextSnapshot.targets;
        }
      }
      if (!hitTargetSnapshotRef.current) {
        const nextSnapshot = createHitTargetSnapshot({
          assets: assetManager,
          camera: activeCamera,
          selectedDetailId: activeSelectedDetailId,
          shipMotionSamples,
          viewport: { height: activeCanvasSize.y, width: activeCanvasSize.x },
          world,
        });
        hitTargetSnapshotRef.current = nextSnapshot;
        hitTargetsRef.current = nextSnapshot.targets;
      }
      const targets = hitTargetsRef.current;
      const nextFrameState = frameStateRef.current;
      nextFrameState.samples = shipMotionSamples;
      nextFrameState.targets = targets;
      nextFrameState.timeSeconds = timeSeconds;
      nextFrameState.wallClockHour = wallClockHour;
      const nextHoveredTarget = targets.find((target) => target.detailId === activeHoveredDetailId) ?? null;
      const nextSelectedTarget = targets.find((target) => target.detailId === activeSelectedDetailId) ?? null;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const drawStartedAt = performance.now();
      const renderMetrics = drawPharosVille({
        camera: activeCamera,
        ctx,
        dpr,
        height: activeCanvasSize.y,
        hoveredTarget: nextHoveredTarget,
        motion: {
          plan: activeMotionPlan,
          reducedMotion,
          timeSeconds,
          wallClockHour,
        },
        selectedTarget: nextSelectedTarget,
        shipMotionSamples,
        targets,
        width: activeCanvasSize.x,
        world,
        assets: assetManager,
      });
      lastRenderMetricsRef.current = {
        ...renderMetrics,
        drawDurationMs: performance.now() - drawStartedAt,
      };
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
          const nextBackingWidth = nextBudget.backingWidth;
          const nextBackingHeight = nextBudget.backingHeight;
          if (canvas.width !== nextBackingWidth) canvas.width = nextBackingWidth;
          if (canvas.height !== nextBackingHeight) canvas.height = nextBackingHeight;
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
        setCriticalFramePainted(true);
      }
      if (!reducedMotion) {
        motionFrameCountRef.current += 1;
        scheduleFrame();
      }
      if (isVisualDebugAllowed()) {
        updateDebugFrame({
          animationFramePending: animationFramePendingRef.current,
          frameCount: motionFrameCountRef.current,
          frameState: nextFrameState,
          motionPlan: activeMotionPlan,
          reducedMotion,
          renderMetrics: lastRenderMetricsRef.current,
          assetLoadStats: assetManager.getLoadStats(),
          selectedDetailId: activeSelectedDetailId,
          shipsById,
          world,
        });
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

    drawFrame(performance.now());
    return () => {
      paintRequestRef.current = () => {};
      animationFramePendingRef.current = false;
      lastWallRef.current = null;
      if (frameId) cancelAnimationFrame(frameId);
      if (observer) observer.disconnect();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetManager, cameraReady, canvasSize.x, canvasSize.y, nightMode, reducedMotion, shipsById, world]);

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
      hoveredDetailId,
      metrics: lastRenderMetricsRef.current,
      selectedDetailId,
      targets: frameState.targets,
    });
    debugWindow.__pharosVilleDebug = {
      camera,
      cameraWithinBounds: isCameraWithinBounds(camera, world.map, canvasSize),
      assetLoadErrors,
      assetLoadStats: assetManager.getLoadStats(),
      assetsLoaded: criticalAssetsLoaded && deferredAssetsLoaded,
      criticalAssetAttemptsSettled,
      criticalAssetsLoaded,
      deferredAssetsLoaded,
      activeMotionLoopCount: reducedMotion || !animationFramePendingRef.current ? 0 : 1,
      animationFramePending: animationFramePendingRef.current,
      canvasBudget: canvasBudgetRef.current,
      canvasSize,
      motionClockSource: reducedMotion ? "reduced-motion-static-frame" : "requestAnimationFrame",
      motionCueCounts: motionCueCounts({ motionPlan, selectedDetailId, world }),
      motionFrameCount: motionFrameCountRef.current,
      renderMetrics,
      reducedMotion,
      selectedDetailAnchor,
      selectedDetailId,
      shipMotionSamples: compactShipMotionSamples(frameState.samples, shipsById),
      targets: frameState.targets,
      timeSeconds: frameState.timeSeconds,
      wallClockHour: frameState.wallClockHour,
    };
    return () => {
      delete debugWindow.__pharosVilleDebug;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetLoadErrors, assetManager, camera, canvasSize, criticalAssetAttemptsSettled, criticalAssetsLoaded, deferredAssetsLoaded, hoveredDetailId, motionPlan, reducedMotion, selectedDetailAnchor, selectedDetailId, shipsById, world]);

  return { requestPaint };
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

type PharosVilleDebugState = {
  activeMotionLoopCount: number;
  assetLoadErrors: PharosVilleAssetLoadError[];
  assetLoadStats: PharosVilleAssetLoadStats;
  camera: IsoCamera | null;
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
  renderMetrics: PharosVilleRenderMetrics & { drawDurationMs: number };
  reducedMotion: boolean;
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

function changedShipHitTargets(input: {
  samples: ReadonlyMap<string, ShipMotionSample>;
  shipHitStateById: Map<string, { cellX: number; cellY: number; visible: boolean }>;
  world: PharosVilleWorldModel;
}): string[] {
  const changedShipIds: string[] = [];
  for (const ship of input.world.ships) {
    const sample = input.samples.get(ship.id);
    if (!sample) continue;
    const visible = isShipMapVisible(ship, sample);
    const cellX = Math.floor(sample.tile.x);
    const cellY = Math.floor(sample.tile.y);
    const previous = input.shipHitStateById.get(ship.id);
    if (!previous || previous.cellX !== cellX || previous.cellY !== cellY || previous.visible !== visible) {
      input.shipHitStateById.set(ship.id, { cellX, cellY, visible });
      changedShipIds.push(ship.id);
    }
  }
  return changedShipIds;
}

function collectShipMotionSamples(input: {
  motionPlan: MotionPlan;
  reducedMotion: boolean;
  samples: ReadonlyMap<string, ShipMotionSample>;
  timeSeconds: number;
  world: PharosVilleWorldModel;
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
  return samples;
}

function compactShipMotionSamples(
  samples: ReadonlyMap<string, ShipMotionSample>,
  shipsById: ReadonlyMap<string, PharosVilleWorldModel["ships"][number]>,
): CompactShipMotionSample[] {
  return Array.from(samples.values(), (sample) => {
    const ship = shipsById.get(sample.shipId);
    return {
      currentDockId: sample.currentDockId,
      currentRouteStopId: sample.currentRouteStopId,
      currentRouteStopKind: sample.currentRouteStopKind,
      id: sample.shipId,
      mapVisible: ship ? isShipMapVisible(ship, sample) : true,
      state: sample.state,
      x: sample.tile.x,
      y: sample.tile.y,
      zone: sample.zone,
    };
  });
}

function renderMetricsWithCurrentSelection(input: {
  hoveredDetailId: string | null;
  metrics: PharosVilleRenderMetrics & { drawDurationMs: number };
  selectedDetailId: string | null;
  targets: readonly HitTarget[];
}): PharosVilleRenderMetrics & { drawDurationMs: number } {
  const selectedTarget = input.targets.find((target) => target.detailId === input.selectedDetailId) ?? null;
  const hoveredTarget = input.targets.find((target) => target.detailId === input.hoveredDetailId) ?? null;
  const selectionCount = selectionDrawableCount({ hoveredTarget, selectedTarget });
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

function updateDebugFrame(input: {
  animationFramePending: boolean;
  frameCount: number;
  frameState: {
    samples: ReadonlyMap<string, ShipMotionSample>;
    targets: readonly HitTarget[];
    timeSeconds: number;
    wallClockHour: number;
  };
  motionPlan: MotionPlan;
  reducedMotion: boolean;
  renderMetrics: PharosVilleRenderMetrics & { drawDurationMs: number };
  assetLoadStats: PharosVilleAssetLoadStats;
  selectedDetailId: string | null;
  shipsById: ReadonlyMap<string, PharosVilleWorldModel["ships"][number]>;
  world: PharosVilleWorldModel;
}) {
  if (!isVisualDebugAllowed()) return;
  const debugWindow = window as typeof window & {
    __pharosVilleDebug?: Partial<PharosVilleDebugState>;
  };
  if (!debugWindow.__pharosVilleDebug) return;
  Object.assign(debugWindow.__pharosVilleDebug, {
    activeMotionLoopCount: input.reducedMotion || !input.animationFramePending ? 0 : 1,
    animationFramePending: input.animationFramePending,
    assetLoadStats: input.assetLoadStats,
    motionClockSource: input.reducedMotion ? "reduced-motion-static-frame" : "requestAnimationFrame",
    motionCueCounts: motionCueCounts({
      motionPlan: input.motionPlan,
      selectedDetailId: input.selectedDetailId,
      world: input.world,
    }),
    motionFrameCount: input.frameCount,
    renderMetrics: input.renderMetrics,
    reducedMotion: input.reducedMotion,
    shipMotionSamples: compactShipMotionSamples(input.frameState.samples, input.shipsById),
    targets: input.frameState.targets,
    timeSeconds: input.frameState.timeSeconds,
    wallClockHour: input.frameState.wallClockHour,
  });
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

function isVisualDebugAllowed() {
  if (!import.meta.env.PROD) return true;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
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
    harborLights: PHAROSVILLE_HARBOR_LIGHT_CAP,
    moverShips: input.motionPlan.moverShipIds.size,
    selectedRelationshipOverlays,
  };
}
