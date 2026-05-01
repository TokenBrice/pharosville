"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { Home, Maximize2, Minimize2 } from "lucide-react";
import { AccessibilityLedger } from "./components/accessibility-ledger";
import { DetailPanel } from "./components/detail-panel";
import { WorldToolbar } from "./components/world-toolbar";
import { useFullscreenMode } from "./hooks/use-fullscreen-mode";
import { PharosVilleAssetManager, type PharosVilleAssetLoadError, type PharosVilleAssetLoadStats } from "./renderer/asset-manager";
import { entityFollowTile } from "./renderer/geometry";
import { collectHitTargets, hitTest, type HitTarget } from "./renderer/hit-testing";
import { selectionDrawableCount } from "./renderer/layers/selection";
import { drawPharosVille, type PharosVilleRenderMetrics } from "./renderer/world-canvas";
import { cameraZoomLabel, clampCameraToMap, defaultCamera, followTile, panCamera, zoomIn, zoomOut } from "./systems/camera";
import { resolveCanvasBudget } from "./systems/canvas-budget";
import { buildBaseMotionPlan, buildMotionPlan, isShipMapVisible, resolveShipMotionSample, type ShipMotionSample } from "./systems/motion";
import { warmAllWaterPaths } from "./systems/motion-water";
import { zoomCameraAt, type IsoCamera, type ScreenPoint } from "./systems/projection";
import { observeReducedMotion } from "./systems/reduced-motion";
import type { PharosVilleWorld as PharosVilleWorldModel } from "./systems/world-types";

function PharosVilleWorldInner({ world }: { world: PharosVilleWorldModel }) {
  const [assetManager] = useState(() => new PharosVilleAssetManager());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ last: ScreenPoint; moved: boolean; pointerId: number } | null>(null);
  const animationFramePendingRef = useRef(false);
  const canvasBudgetRef = useRef<ReturnType<typeof resolveCanvasBudget> | null>(null);
  const criticalFramePaintedRef = useRef(false);
  const deferredLoadStartedRef = useRef(false);
  const lastWallRef = useRef<number | null>(null);
  const accSecondsRef = useRef(0);
  const pendingResumeRef = useRef(false);
  const motionFrameCountRef = useRef(0);
  const canvasRectRef = useRef<Pick<DOMRectReadOnly, "left" | "top"> | null>(null);
  const dragPanDeltaRef = useRef<ScreenPoint>({ x: 0, y: 0 });
  const dragPanFrameRef = useRef(0);
  const lastRenderMetricsRef = useRef<PharosVilleRenderMetrics & { drawDurationMs: number }>({
    drawableCount: 0,
    drawableCounts: { underlay: 0, body: 0, overlay: 0, selection: 0 },
    drawDurationMs: 0,
    movingShipCount: 0,
    visibleShipCount: 0,
    visibleTileCount: 0,
  });
  const currentShipMotionSamplesRef = useRef<ReadonlyMap<string, ShipMotionSample>>(new Map());
  const currentHitTargetsRef = useRef<readonly HitTarget[]>([]);
  const lastHitTargetCellHashRef = useRef(-1);
  const frameStateRef = useRef<{
    samples: ReadonlyMap<string, ShipMotionSample>;
    targets: readonly HitTarget[];
    timeSeconds: number;
  }>({ samples: new Map(), targets: [], timeSeconds: 0 });
  const [camera, setCamera] = useState<IsoCamera | null>(null);
  const [canvasSize, setCanvasSize] = useState<ScreenPoint>({ x: 0, y: 0 });
  const [hoveredDetailId, setHoveredDetailId] = useState<string | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>("lighthouse");
  const [selectedDetailAnchor, setSelectedDetailAnchor] = useState<DetailAnchor | null>(null);
  const [announcement, setAnnouncement] = useState("PharosVille ready.");
  const [assetLoadTick, setAssetLoadTick] = useState(0);
  const [assetLoadErrors, setAssetLoadErrors] = useState<PharosVilleAssetLoadError[]>([]);
  const [criticalFramePainted, setCriticalFramePainted] = useState(false);
  const [criticalAssetAttemptsSettled, setCriticalAssetAttemptsSettled] = useState(false);
  const [criticalAssetsLoaded, setCriticalAssetsLoaded] = useState(false);
  const [deferredAssetsLoaded, setDeferredAssetsLoaded] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [paintRequestTick, setPaintRequestTick] = useState(0);
  const shellRef = useRef<HTMLElement | null>(null);
  const { exitFullscreen, fullscreenMode, toggleFullscreen } = useFullscreenMode(shellRef);
  const baseMotionPlan = useMemo(() => buildBaseMotionPlan(world), [world]);
  const motionPlan = useMemo(() => buildMotionPlan(world, selectedDetailId, baseMotionPlan), [baseMotionPlan, selectedDetailId, world]);
  const shipsById = useMemo(() => new Map(world.ships.map((ship) => [ship.id, ship])), [world.ships]);
  const shipCellHashSeeds = useMemo(() => new Map(world.ships.map((ship) => [ship.id, stableStringHash(ship.id)])), [world.ships]);
  const selectedEntity = useMemo(() => findWorldEntity(world, selectedDetailId), [selectedDetailId, world]);
  const selectedDetail = selectedDetailId ? world.detailIndex[selectedDetailId] ?? null : null;

  useEffect(() => {
    canvasRectRef.current = null;
  }, [fullscreenMode]);

  // Refs that mirror frequently-changing state so the RAF effect can read the
  // latest values without rebinding on every hover/select/motionPlan change.
  // Synced via a single effect so they stay coherent.
  const hoveredDetailIdRef = useRef(hoveredDetailId);
  const selectedDetailIdRef = useRef(selectedDetailId);
  const motionPlanRef = useRef(motionPlan);
  const cameraRef = useRef(camera);
  const canvasSizeRef = useRef(canvasSize);
  const criticalAssetAttemptsSettledRef = useRef(criticalAssetAttemptsSettled);
  useEffect(() => {
    hoveredDetailIdRef.current = hoveredDetailId;
    selectedDetailIdRef.current = selectedDetailId;
    motionPlanRef.current = motionPlan;
    cameraRef.current = camera;
    canvasSizeRef.current = canvasSize;
    criticalAssetAttemptsSettledRef.current = criticalAssetAttemptsSettled;
  }, [camera, canvasSize, criticalAssetAttemptsSettled, hoveredDetailId, motionPlan, selectedDetailId]);

  const selectDetail = useCallback((detailId: string, anchor: DetailAnchor | null = null) => {
    const detail = world.detailIndex[detailId];
    setSelectedDetailId(detailId);
    setSelectedDetailAnchor(anchor);
    setAnnouncement(detail ? `Selected ${detail.title}.` : "Selected map entity.");
  }, [world.detailIndex]);

  const clearSelection = useCallback(() => {
    setSelectedDetailId(null);
    setSelectedDetailAnchor(null);
    setAnnouncement("Selection cleared.");
  }, []);

  useEffect(() => {
    if (!selectedDetailId) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const shell = shellRef.current;
      if (!shell?.contains(target)) return;
      const detailPanel = document.getElementById("pharosville-detail-panel");
      if (detailPanel?.contains(target)) return;
      if (target instanceof Element && target.closest(".pharosville-overlay, .pharosville-fullscreen-button, .pharosville-home-button")) return;
      clearSelection();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  }, [clearSelection, selectedDetailId]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    criticalFramePaintedRef.current = false;
    deferredLoadStartedRef.current = false;
    setCriticalFramePainted(false);
    setCriticalAssetAttemptsSettled(false);
    setCriticalAssetsLoaded(false);
    setDeferredAssetsLoaded(false);
    assetManager.loadCritical(controller.signal)
      .then((criticalResult) => {
        if (!active) return;
        setAssetLoadErrors(criticalResult.errors);
        setCriticalAssetsLoaded(assetManager.areCriticalAssetsLoaded());
        setCriticalAssetAttemptsSettled(true);
        setAssetLoadTick((tick) => tick + 1);
      })
      .catch((error) => {
        if (!active) return;
        setCriticalAssetsLoaded(false);
        setCriticalAssetAttemptsSettled(true);
        setAssetLoadErrors([{
          id: "manifest",
          message: error instanceof Error ? error.message : String(error),
          path: "manifest.json",
          priority: "critical",
        }]);
        setAssetLoadTick((tick) => tick + 1);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [assetManager]);

  useEffect(() => {
    if (!criticalAssetAttemptsSettled || !criticalFramePainted || deferredLoadStartedRef.current) return;

    const controller = new AbortController();
    let active = true;
    deferredLoadStartedRef.current = true;
    const startDeferredLoad = () => {
      const planForWarmup = motionPlanRef.current;
      if (planForWarmup) warmAllWaterPaths(planForWarmup);
      assetManager.loadDeferred(controller.signal)
        .then((deferredResult) => {
          if (!active) return;
          setAssetLoadErrors((previous) => [...previous, ...deferredResult.errors]);
          setDeferredAssetsLoaded(assetManager.areDeferredAssetsSettled() && deferredResult.errors.length === 0);
          setAssetLoadTick((tick) => tick + 1);
        })
        .catch((error) => {
          if (!active) return;
          setAssetLoadErrors((previous) => [
            ...previous,
            {
              id: "deferred-assets",
              message: error instanceof Error ? error.message : String(error),
              path: "manifest.json",
              priority: "deferred",
            },
          ]);
          setAssetLoadTick((tick) => tick + 1);
        });
    };

    const requestIdleCallback = window.requestIdleCallback?.bind(window);
    const cancelIdleCallback = window.cancelIdleCallback?.bind(window);
    if (requestIdleCallback && cancelIdleCallback) {
      const idleId = requestIdleCallback(startDeferredLoad, { timeout: 800 });
      return () => {
        active = false;
        controller.abort();
        cancelIdleCallback(idleId);
      };
    }

    const timeoutId = globalThis.setTimeout(startDeferredLoad, 0);
    return () => {
      active = false;
      controller.abort();
      globalThis.clearTimeout(timeoutId);
    };
  }, [assetManager, criticalAssetAttemptsSettled, criticalFramePainted]);

  useEffect(() => {
    const logoSrcs = [
      ...world.docks.map((dock) => dock.logoSrc),
      ...world.graves
        .filter((grave) => grave.visual.scale >= 0.41)
        .map((grave) => grave.logoSrc),
      ...world.ships.map((ship) => ship.logoSrc),
    ]
      .filter((src): src is string => typeof src === "string" && src.startsWith("/"));
    if (logoSrcs.length === 0) return;

    const controller = new AbortController();
    assetManager.loadLogos(logoSrcs, controller.signal)
      .then(() => setAssetLoadTick((tick) => tick + 1))
      .catch(() => setAssetLoadTick((tick) => tick + 1));
    return () => {
      controller.abort();
    };
  }, [assetManager, world.docks, world.graves, world.ships]);

  useEffect(() => observeReducedMotion(setReducedMotion), []);

  useEffect(() => {
    lastWallRef.current = null;
    accSecondsRef.current = 0;
    pendingResumeRef.current = false;
    motionFrameCountRef.current = 0;
    currentShipMotionSamplesRef.current = new Map();
    lastHitTargetCellHashRef.current = -1;
  }, [world]);

  // When the tab is hidden, RAFs pause; on resume the next frame can carry a
  // multi-second time delta. Flag the next frame so it skips accumulating that
  // gap, preventing ships from teleporting through cycles after a long pause.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        pendingResumeRef.current = true;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvasRectRef.current = rect;
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));
      const budget = resolveCanvasBudget({
        cssHeight,
        cssWidth,
        requestedDpr: window.devicePixelRatio || 1,
      });
      canvasBudgetRef.current = budget;
      const nextWidth = budget.backingWidth;
      const nextHeight = budget.backingHeight;
      if (canvas.width !== nextWidth) canvas.width = nextWidth;
      if (canvas.height !== nextHeight) canvas.height = nextHeight;
      const nextCanvasSize = { x: cssWidth, y: cssHeight };
      setCanvasSize((previous) => samePoint(previous, nextCanvasSize) ? previous : nextCanvasSize);
      setCamera((previous) => {
        const next = previous
          ? clampCameraToMap(previous, { map: world.map, viewport: nextCanvasSize })
          : defaultCamera({ width: cssWidth, height: cssHeight, map: world.map });
        return previous && sameCamera(previous, next) ? previous : next;
      });
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [world.map]);

  // RAF effect — bound once per `world` / `canvasSize` / `reducedMotion` /
  // `assetManager` / `assetLoadTick` / `cameraReady`. All other inputs
  // (hoveredDetailId, selectedDetailId, motionPlan, camera, criticalAssetAttemptsSettled)
  // are read through refs so per-hover / per-selection state changes do not
  // cancel and re-create the RAF loop. `assetLoadTick` is kept in the dep set
  // because reduced-motion mode paints exactly one frame on bind, and a freshly
  // loaded sprite must trigger a re-bind to repaint. `cameraReady` (boolean)
  // gates the initial bind from null→non-null camera; subsequent camera moves
  // flow through the ref.
  const cameraReady = camera !== null;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cameraReady || canvasSize.x <= 0 || canvasSize.y <= 0) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const budget = canvasBudgetRef.current ?? resolveCanvasBudget({
      cssHeight: canvasSize.y,
      cssWidth: canvasSize.x,
      requestedDpr: window.devicePixelRatio || 1,
    });
    const dpr = budget.effectiveDpr;
    let frameId = 0;
    const drawFrame = (time: number) => {
      animationFramePendingRef.current = false;
      const activeCamera = cameraRef.current;
      const activeCanvasSize = canvasSizeRef.current;
      const activeMotionPlan = motionPlanRef.current;
      const activeHoveredDetailId = hoveredDetailIdRef.current;
      const activeSelectedDetailId = selectedDetailIdRef.current;
      const activeCriticalSettled = criticalAssetAttemptsSettledRef.current;
      if (!activeCamera || activeCanvasSize.x <= 0 || activeCanvasSize.y <= 0) return;
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
      const shipMotionSamples = collectShipMotionSamples({
        motionPlan: activeMotionPlan,
        reducedMotion,
        samples: currentShipMotionSamplesRef.current,
        timeSeconds,
        world,
      });
      // Hit-targets are no longer recomputed on every RAF tick. They are
      // recomputed only on input/state changes (pointer move, selection, hover,
      // camera, canvas) and on ship-cell transitions detected here.
      const cellHash = shipCellSignature(shipMotionSamples, world, shipCellHashSeeds);
      if (cellHash !== lastHitTargetCellHashRef.current) {
        lastHitTargetCellHashRef.current = cellHash;
        currentHitTargetsRef.current = collectHitTargets({
          assets: assetManager,
          camera: activeCamera,
          hoveredDetailId: activeHoveredDetailId,
          selectedDetailId: activeSelectedDetailId,
          shipMotionSamples,
          viewport: { height: activeCanvasSize.y, width: activeCanvasSize.x },
          world,
        });
      }
      const targets = currentHitTargetsRef.current;
      const nextFrameState = frameStateRef.current;
      nextFrameState.samples = shipMotionSamples;
      nextFrameState.targets = targets;
      nextFrameState.timeSeconds = timeSeconds;
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
      if (activeCriticalSettled && !criticalFramePaintedRef.current) {
        criticalFramePaintedRef.current = true;
        setCriticalFramePainted(true);
      }
      if (!reducedMotion) {
        motionFrameCountRef.current += 1;
        animationFramePendingRef.current = true;
        frameId = requestAnimationFrame(drawFrame);
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
    drawFrame(performance.now());
    return () => {
      animationFramePendingRef.current = false;
      lastWallRef.current = null;
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [assetLoadTick, assetManager, cameraReady, canvasSize.x, canvasSize.y, paintRequestTick, reducedMotion, shipCellHashSeeds, shipsById, world]);

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
    };
    return () => {
      delete debugWindow.__pharosVilleDebug;
    };
  }, [assetLoadErrors, assetManager, camera, canvasSize, criticalAssetAttemptsSettled, criticalAssetsLoaded, deferredAssetsLoaded, hoveredDetailId, motionPlan, reducedMotion, selectedDetailAnchor, selectedDetailId, shipsById, world]);

  const canvasPoint = useCallback((event: ReactPointerEvent<HTMLCanvasElement> | ReactWheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const rect = canvasRectRef.current ?? canvas?.getBoundingClientRect();
    if (rect) canvasRectRef.current = rect;
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  }, []);

  const recomputeHitTargets = useCallback(() => {
    const activeCamera = cameraRef.current;
    if (!activeCamera) return currentHitTargetsRef.current;
    const activeCanvasSize = canvasSizeRef.current;
    const targets = collectHitTargets({
      assets: assetManager,
      camera: activeCamera,
      hoveredDetailId: hoveredDetailIdRef.current,
      selectedDetailId: selectedDetailIdRef.current,
      shipMotionSamples: currentShipMotionSamplesRef.current,
      viewport: { height: activeCanvasSize.y, width: activeCanvasSize.x },
      world,
    });
    currentHitTargetsRef.current = targets;
    return targets;
  }, [assetManager, world]);

  // Keep hit-targets in sync with state-driven inputs that affect them:
  // hover, selection, camera (pan/zoom/follow), and canvas size. Ship-cell
  // transitions are handled in-frame by the RAF effect via cell-hash diffing.
  useEffect(() => {
    recomputeHitTargets();
    if (reducedMotion) setPaintRequestTick((t) => t + 1);
  }, [camera, canvasSize.x, canvasSize.y, hoveredDetailId, recomputeHitTargets, reducedMotion, selectedDetailId]);

  const updateHover = useCallback((point: ScreenPoint) => {
    const target = hitTest(currentHitTargetsRef.current, point);
    setHoveredDetailId((previous) => previous === target?.detailId ? previous : (target?.detailId ?? null));
  }, []);

  const scheduleDragPan = useCallback((delta: ScreenPoint) => {
    dragPanDeltaRef.current = {
      x: dragPanDeltaRef.current.x + delta.x,
      y: dragPanDeltaRef.current.y + delta.y,
    };
    if (dragPanFrameRef.current) return;
    dragPanFrameRef.current = requestAnimationFrame(() => {
      dragPanFrameRef.current = 0;
      const queuedDelta = dragPanDeltaRef.current;
      dragPanDeltaRef.current = { x: 0, y: 0 };
      if (queuedDelta.x === 0 && queuedDelta.y === 0) return;
      setCamera((previous) => {
        if (!previous) return previous;
        const viewport = canvasSizeRef.current;
        const next = panCamera(previous, queuedDelta, { map: world.map, viewport });
        return sameCamera(previous, next) ? previous : next;
      });
    });
  }, [world.map]);

  useEffect(() => () => {
    if (dragPanFrameRef.current) cancelAnimationFrame(dragPanFrameRef.current);
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    canvasRectRef.current = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { last: canvasPoint(event), moved: false, pointerId: event.pointerId };
  }, [canvasPoint]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      const delta = { x: point.x - drag.last.x, y: point.y - drag.last.y };
      if (Math.abs(delta.x) + Math.abs(delta.y) > 1) {
        drag.moved = true;
        scheduleDragPan(delta);
      }
      drag.last = point;
      return;
    }
    updateHover(point);
  }, [canvasPoint, scheduleDragPan, updateHover]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    const drag = dragRef.current;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag?.moved) return;
    const target = hitTest(recomputeHitTargets(), point);
    if (target) {
      selectDetail(target.detailId, detailAnchorForPoint(point, canvasSize));
      return;
    }
    if (selectedDetailId) clearSelection();
  }, [canvasPoint, canvasSize, clearSelection, recomputeHitTargets, selectDetail, selectedDetailId]);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLCanvasElement>) => {
    if (!camera) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const next = clampCameraToMap(zoomCameraAt(camera, canvasPoint(event), camera.zoom * direction), { map: world.map, viewport: canvasSize });
    if (!sameCamera(camera, next)) setCamera(next);
  }, [camera, canvasPoint, canvasSize, world.map]);

  const handleToolbarPan = useCallback((delta: ScreenPoint) => {
    setCamera((previous) => {
      if (!previous) return previous;
      const next = panCamera(previous, delta, { map: world.map, viewport: canvasSize });
      return sameCamera(previous, next) ? previous : next;
    });
  }, [canvasSize, world.map]);

  const handleResetView = useCallback(() => {
    if (canvasSize.x <= 0 || canvasSize.y <= 0) return;
    setCamera((previous) => {
      const next = defaultCamera({ height: canvasSize.y, map: world.map, width: canvasSize.x });
      return previous && sameCamera(previous, next) ? previous : next;
    });
  }, [canvasSize, world.map]);

  const handleToolbarZoomIn = useCallback(() => {
    setCamera((previous) => {
      if (!previous) return previous;
      const next = zoomIn(previous, canvasSize, world.map);
      return sameCamera(previous, next) ? previous : next;
    });
  }, [canvasSize, world.map]);

  const handleToolbarZoomOut = useCallback(() => {
    setCamera((previous) => {
      if (!previous) return previous;
      const next = zoomOut(previous, canvasSize, world.map);
      return sameCamera(previous, next) ? previous : next;
    });
  }, [canvasSize, world.map]);

  const handleFollowSelected = useCallback(() => {
    if (!selectedEntity) return;
    const sampledTile = entityFollowTile({
      entity: selectedEntity,
      mapWidth: world.map.width,
      shipMotionSamples: currentShipMotionSamplesRef.current,
    });
    setCamera((previous) => {
      if (!previous) return previous;
      const next = followTile({
        camera: previous,
        map: world.map,
        tile: sampledTile,
        viewport: canvasSize,
      });
      return sameCamera(previous, next) ? previous : next;
    });
  }, [canvasSize, selectedEntity, world.map]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (!camera) return;
    if (event.key === "Escape") {
      if (fullscreenMode) {
        event.preventDefault();
        exitFullscreen();
        return;
      }
      clearSelection();
      return;
    }
    const step = event.shiftKey ? 72 : 32;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (isInteractiveEventTarget(event.target)) return;
      event.preventDefault();
      const deltas: Record<string, ScreenPoint> = {
        ArrowDown: { x: 0, y: -step },
        ArrowLeft: { x: step, y: 0 },
        ArrowRight: { x: -step, y: 0 },
        ArrowUp: { x: 0, y: step },
      };
      const next = panCamera(camera, deltas[event.key], { map: world.map, viewport: canvasSize });
      if (!sameCamera(camera, next)) setCamera(next);
    }
  }, [camera, canvasSize, clearSelection, exitFullscreen, fullscreenMode, world.map]);

  const detailDockStyle = selectedDetailAnchor
    ? ({
        "--pv-detail-x": `${selectedDetailAnchor.x}px`,
        "--pv-detail-y": `${selectedDetailAnchor.y}px`,
      } as CSSProperties)
    : undefined;

  return (
    <main
      ref={shellRef}
      className={fullscreenMode ? "pharosville-desktop pharosville-shell pharosville-shell--fullscreen" : "pharosville-desktop pharosville-shell"}
      data-testid="pharosville-world"
      aria-describedby="pharosville-world-instructions"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <p id="pharosville-world-instructions" className="sr-only">
        Use the visible toolbar, wheel zoom, drag pan, arrow keys, and canvas selection to inspect PharosVille map data.
      </p>
      <canvas
        ref={canvasRef}
        className={hoveredDetailId ? "pharosville-canvas pharosville-canvas--selectable" : "pharosville-canvas"}
        data-testid="pharosville-canvas"
        aria-hidden="true"
        onPointerDown={handlePointerDown}
        onPointerLeave={() => setHoveredDetailId(null)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      />
      <div className="pharosville-overlay" aria-label="PharosVille controls and details">
        <div className="pharosville-hud">
          <WorldToolbar
            world={world}
            selectedDetailId={selectedDetailId}
            selectedDetailLabel={selectedDetail?.title ?? null}
            zoomLabel={camera ? cameraZoomLabel(camera) : "100%"}
            onClearSelection={clearSelection}
            onFollowSelected={selectedEntity ? handleFollowSelected : undefined}
            onPan={handleToolbarPan}
            onResetView={handleResetView}
            onZoomIn={handleToolbarZoomIn}
            onZoomOut={handleToolbarZoomOut}
          />
        </div>
        {selectedDetail && (
          <div
            className={selectedDetailAnchor ? `pharosville-detail-dock pharosville-detail-dock--anchored pharosville-detail-dock--${selectedDetailAnchor.side}` : "pharosville-detail-dock"}
            style={detailDockStyle}
          >
            <DetailPanel detail={selectedDetail} onClose={clearSelection} />
          </div>
        )}
      </div>
      <button
        type="button"
        className="pharosville-fullscreen-button"
        aria-label={fullscreenMode ? "Exit fullscreen" : "Enter fullscreen"}
        title={fullscreenMode ? "Exit fullscreen" : "Enter fullscreen"}
        onClick={toggleFullscreen}
      >
        {fullscreenMode ? <Minimize2 aria-hidden="true" size={17} /> : <Maximize2 aria-hidden="true" size={17} />}
      </button>
      <a
        href="https://pharos.watch/"
        className="pharosville-home-button"
        aria-label="Go to Pharos homepage"
        title="Go to Pharos homepage"
      >
        <Home aria-hidden="true" size={17} />
      </a>
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <AccessibilityLedger world={world} />
    </main>
  );
}

// Memoized so re-renders triggered by parent (e.g. from React Query refetches that
// produce identical payloads) don't reach the canvas component when `world` reference
// is stable. Pairs with the structural-compare cache in `pharosville-desktop-data.tsx`.
export const PharosVilleWorld = memo(PharosVilleWorldInner);

interface DetailAnchor extends ScreenPoint {
  side: "left" | "right";
}

function detailAnchorForPoint(point: ScreenPoint, viewport: ScreenPoint): DetailAnchor {
  const side = point.x > viewport.x * 0.6 ? "left" : "right";
  return { ...point, side };
}

type SelectableWorldEntity =
  | PharosVilleWorldModel["lighthouse"]
  | PharosVilleWorldModel["docks"][number]
  | PharosVilleWorldModel["ships"][number]
  | PharosVilleWorldModel["areas"][number]
  | PharosVilleWorldModel["graves"][number];

function findWorldEntity(world: PharosVilleWorldModel, detailId: string | null): SelectableWorldEntity | null {
  if (!detailId) return null;
  return [
    world.lighthouse,
    ...world.docks,
    ...world.ships,
    ...world.areas,
    ...world.graves,
  ].find((entity) => entity.detailId === detailId) ?? null;
}

function isInteractiveEventTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest("a, button, input, select, textarea, summary, [role='button']"));
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

// Hash visible ships by their integer tile cell; if any ship crosses a tile
// boundary the hash changes and the RAF effect rebuilds hit-targets eagerly.
function shipCellSignature(
  samples: ReadonlyMap<string, ShipMotionSample>,
  world: PharosVilleWorldModel,
  shipHashSeeds: ReadonlyMap<string, number>,
): number {
  let hash = 2_166_136_261;
  for (const ship of world.ships) {
    const sample = samples.get(ship.id);
    if (!sample) continue;
    if (!isShipMapVisible(ship, sample)) continue;
    hash ^= shipHashSeeds.get(sample.shipId) ?? 0;
    hash = Math.imul(hash, 16_777_619);
    hash ^= Math.floor(sample.tile.x) + 1_024;
    hash = Math.imul(hash, 16_777_619);
    hash ^= Math.floor(sample.tile.y) + 1_024;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function collectShipMotionSamples(input: {
  motionPlan: ReturnType<typeof buildMotionPlan>;
  reducedMotion: boolean;
  samples: ReadonlyMap<string, ShipMotionSample>;
  timeSeconds: number;
  world: PharosVilleWorldModel;
}) {
  const samples = input.samples as Map<string, ShipMotionSample>;
  if (samples.size !== input.world.ships.length) samples.clear();
  for (const ship of input.world.ships) {
    samples.set(ship.id, resolveShipMotionSample({
      plan: input.motionPlan,
      reducedMotion: input.reducedMotion,
      ship,
      timeSeconds: input.timeSeconds,
    }));
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
  };
  motionPlan: ReturnType<typeof buildMotionPlan>;
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
  });
}

function samePoint(left: ScreenPoint, right: ScreenPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameCamera(left: IsoCamera, right: IsoCamera): boolean {
  return left.offsetX === right.offsetX && left.offsetY === right.offsetY && left.zoom === right.zoom;
}

function stableStringHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function isVisualDebugAllowed() {
  if (!import.meta.env.PROD) return true;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function motionCueCounts(input: {
  motionPlan: ReturnType<typeof buildMotionPlan>;
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
