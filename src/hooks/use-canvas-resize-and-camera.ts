// Owns the canvas element ref, viewport size, isometric camera state, the
// resize observer (with adaptive DPR plumbing), and DOM event handlers that
// translate pointer/wheel/keyboard input into camera or selection deltas.
import { useCallback, useEffect, useRef, useState, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction } from "react";
import { hitTest, hitTestSpatial, type HitTarget, type HitTargetSnapshot } from "../renderer/hit-testing";
import { cameraZoomLabel, clampCameraToMap, defaultCamera, followTile, panCamera, zoomIn, zoomOut } from "../systems/camera";
import {
  buildObserveTour,
  observeTourPoseFromCamera,
  observeTourPoseToCamera,
  sampleObserveTour,
  type ObserveTour,
  type ObserveTourKeyframe,
  type ObserveTourSample,
} from "../systems/observe-tour";
import { initialAdaptiveDprState, resolveRenderSurfaceBudget, type AdaptiveDprState } from "../systems/render-surface-budget";
import type { ShipMotionSample } from "../systems/motion";
import {
  minZoomForViewport,
  zoomCameraAt,
  type IsoCamera,
  type ScreenPoint,
} from "../systems/projection";
import type {
  PharosVilleWorld as PharosVilleWorldModel,
  WorldSelectableEntity,
} from "../systems/world-types";
import { sameCamera, samePoint } from "../lib/camera-equality";
import { isDialogEventTarget } from "./keyboard-event-target";
import { gardenArrivalCamera, sampleGardenArrivalCamera } from "../systems/garden-arrival";
import { GARDEN_ATTRACT_SEGMENT_SECONDS, GARDEN_ATTRACT_TRAVEL_SECONDS } from "../systems/garden-attract";
import {
  FOLLOW_INITIAL_DELTA_SECONDS,
  FOLLOW_LEAD_SECONDS,
  FOLLOW_MAX_DELTA_SECONDS,
  advanceCameraIntent,
  cameraModeCancelsFollow,
  leadFollowTile,
  selectionCameraTarget,
  zoomCameraByWheelDelta,
  type CameraIntentMode,
  type CameraIntentState,
} from "./camera-intent";
import { firstPointer, pinchSnapshot } from "./pointer-gesture";
import { useLatestRef } from "./use-latest-ref";

export {
  advanceCameraIntent,
  cameraModeCancelsFollow,
  dampFollowCamera,
  leadFollowTile,
  normalizeWheelDeltaY,
  selectionCameraTarget,
  wheelZoomScaleFromDelta,
  zoomCameraByWheelDelta,
} from "./camera-intent";
export type { CameraIntentMode } from "./camera-intent";

export interface UseCanvasResizeAndCameraInput {
  hasSelection: () => boolean;
  hitTargetSnapshotRef: MutableRefObject<HitTargetSnapshot | null>;
  hitTargetsRef: MutableRefObject<readonly HitTarget[]>;
  hoveredDetailIdRef: MutableRefObject<string | null>;
  onClearSelection: () => void;
  onSelectTarget: (target: HitTarget, point: ScreenPoint, viewport: ScreenPoint) => void;
  recomputeHitTargets: () => HitTargetSnapshot | null;
  reducedMotion: boolean;
  resolveSelectedFollowTile?: (
    entity: WorldSelectableEntity,
    shipMotionSamples: ReadonlyMap<string, ShipMotionSample>,
  ) => ScreenPoint | null;
  requestWorldFrame: () => void;
  selectedDetailIdRef: MutableRefObject<string | null>;
  selectedEntity: WorldSelectableEntity | null;
  setHoveredDetailId: Dispatch<SetStateAction<string | null>>;
  shipMotionSamplesRef: MutableRefObject<ReadonlyMap<string, ShipMotionSample>>;
  world: PharosVilleWorldModel;
}

export interface CameraStepResult {
  camera: IsoCamera | null;
  cameraChanged: boolean;
  cameraIntentActive: boolean;
}

export interface UseCanvasResizeAndCameraResult {
  adaptiveDprStateRef: MutableRefObject<AdaptiveDprState>;
  camera: IsoCamera | null;
  cameraRef: MutableRefObject<IsoCamera | null>;
  cameraZoomLabel: string;
  cancelCameraIntent: () => void;
  surfaceBudgetRef: MutableRefObject<ReturnType<typeof resolveRenderSurfaceBudget> | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canvasSize: ScreenPoint;
  canvasSizeRef: MutableRefObject<ScreenPoint>;
  focusTile: (tile: ScreenPoint) => void;
  handleFollowSelected: () => void;
  handleKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  handlePointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  handlePointerCancel: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  handlePointerLeave: () => void;
  handlePointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  handlePointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  handleResetView: () => void;
  handleToolbarPan: (delta: ScreenPoint) => void;
  handleToolbarZoomIn: () => void;
  handleToolbarZoomOut: () => void;
  maximumRequestedDprRef: MutableRefObject<number>;
  moveCameraTo: (camera: IsoCamera) => void;
  focusSelection: (tile: ScreenPoint, onRest: () => void) => IsoCamera | null;
  returnFromSelection: (camera: IsoCamera) => void;
  startArrival: (onComplete: () => void) => void;
  skipArrival: () => void;
  setCamera: Dispatch<SetStateAction<IsoCamera | null>>;
  /**
   * Observe 2.0 (Phase 4): hand the camera to the cinematic tour. The hook
   * builds the spline from the visitor's current framing, samples it per
   * frame, and glides back to that framing when the tour ends. Any user
   * input cancels it instantly (no glide-back — the visitor took over).
   */
  startObserveTour: (
    keyframes: readonly ObserveTourKeyframe[],
    onBeatChange?: (beatIndex: number | null) => void,
  ) => void;
  startAttractTour: (keyframes: readonly ObserveTourKeyframe[]) => void;
  stopAttractTour: () => void;
  stopObserveTour: (options?: { easeBack?: boolean }) => void;
  stepCamera: (now: number, shipMotionSamples: ReadonlyMap<string, ShipMotionSample>) => CameraStepResult;
}

export function useCanvasResizeAndCamera(input: UseCanvasResizeAndCameraInput): UseCanvasResizeAndCameraResult {
  const {
    hasSelection,
    hitTargetSnapshotRef,
    hitTargetsRef,
    hoveredDetailIdRef,
    onClearSelection,
    onSelectTarget,
    recomputeHitTargets,
    reducedMotion,
    resolveSelectedFollowTile,
    requestWorldFrame,
    selectedDetailIdRef,
    selectedEntity,
    setHoveredDetailId,
    shipMotionSamplesRef,
    world,
  } = input;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ last: ScreenPoint; moved: boolean; pointerId: number } | null>(null);
  const activePointersRef = useRef<Map<number, ScreenPoint>>(new Map());
  const pinchRef = useRef<{ distance: number; midpoint: ScreenPoint; moved: boolean; pointerIds: [number, number] } | null>(null);
  const canvasRectRef = useRef<Pick<DOMRectReadOnly, "left" | "top"> | null>(null);
  const cameraIntentRef = useRef<CameraIntentState>({ lastFrameTime: null, mode: "idle", targetCamera: null });
  const displayCameraRef = useRef<IsoCamera | null>(null);
  const hoverFrameRef = useRef(0);
  const pendingHoverPointRef = useRef<ScreenPoint | null>(null);
  const adaptiveDprStateRef = useRef<AdaptiveDprState>(initialAdaptiveDprState(1));
  const adaptiveDprInitializedRef = useRef(false);
  const maximumRequestedDprRef = useRef(1);
  const surfaceBudgetRef = useRef<ReturnType<typeof resolveRenderSurfaceBudget> | null>(null);
  const followChaseDetailIdRef = useRef<string | null>(null);
  const followChaseLastTileRef = useRef<ScreenPoint | null>(null);
  const followChaseLastTimeRef = useRef<number | null>(null);
  const selectionCameraRestRef = useRef<(() => void) | null>(null);
  // Observe 2.0: the active tour and the framing to glide back to. The sample
  // scratch is reused every frame — no allocation in the camera path.
  const observeTourRef = useRef<{
    lastBeatIndex: number | null;
    onBeatChange?: (beatIndex: number | null) => void;
    returnPose: ReturnType<typeof observeTourPoseFromCamera>;
    startMs: number | null;
    tour: ObserveTour;
    loop?: boolean;
  } | null>(null);
  const observeSampleRef = useRef<ObserveTourSample>({
    beatIndex: 0,
    done: false,
    isoX: 0,
    isoY: 0,
    zoom: 1,
  });
  const arrivalRef = useRef<{
    from: IsoCamera;
    onComplete: () => void;
    startMs: number | null;
    to: IsoCamera;
  } | null>(null);

  const [camera, setCameraState] = useState<IsoCamera | null>(null);
  const [canvasSize, setCanvasSize] = useState<ScreenPoint>({ x: 0, y: 0 });

  // Mirrored via `useLatestRef` (synchronous render-time write) so consumers
  // reading `.current` from event handlers / RAF observe the latest committed
  // value without an extra effect tick or StrictMode desync. The camera
  // controller also writes this ref before React commits a render.
  const cameraRef = useLatestRef(camera);
  const canvasSizeRef = useLatestRef(canvasSize);
  const selectedEntityRef = useLatestRef(selectedEntity);
  const selectedDetailId = selectedEntity?.detailId ?? null;
  const lastSelectedDetailIdRef = useRef<string | null>(selectedDetailId);

  useEffect(() => () => {
    if (hoverFrameRef.current) cancelAnimationFrame(hoverFrameRef.current);
  }, []);

  const commitCameraState = useCallback((next: IsoCamera | null) => {
    displayCameraRef.current = next;
    cameraRef.current = next;
    setCameraState((previous) => {
      if (previous === null || next === null) return previous === next ? previous : next;
      return sameCamera(previous, next) ? previous : next;
    });
  }, [cameraRef]);

  const applyCameraImmediately = useCallback((next: IsoCamera | null) => {
    cameraIntentRef.current = { lastFrameTime: null, mode: "idle", targetCamera: next };
    commitCameraState(next);
    requestWorldFrame();
  }, [commitCameraState, requestWorldFrame]);

  const finishSelectionCamera = useCallback(() => {
    const onRest = selectionCameraRestRef.current;
    selectionCameraRestRef.current = null;
    onRest?.();
  }, []);

  const freezeDisplayedCamera = useCallback(() => {
    const displayedCamera = displayCameraRef.current ?? cameraRef.current;
    cameraIntentRef.current = {
      lastFrameTime: null,
      mode: "idle",
      targetCamera: displayedCamera,
    };
  }, [cameraRef]);

  const stopFollowChase = useCallback(() => {
    followChaseDetailIdRef.current = null;
    followChaseLastTileRef.current = null;
    followChaseLastTimeRef.current = null;
    // Any follow-canceling gesture (drag, wheel, keys, selection) also ends
    // the observe tour outright — the visitor took the camera back, so there
    // is no glide-back, just the tour releasing its hold.
    observeTourRef.current = null;
    freezeDisplayedCamera();
  }, [freezeDisplayedCamera]);

  const cancelCameraIntent = useCallback(() => {
    stopFollowChase();
    finishSelectionCamera();
  }, [finishSelectionCamera, stopFollowChase]);

  const currentCameraBase = useCallback(() => (
    cameraIntentRef.current.targetCamera ?? displayCameraRef.current ?? cameraRef.current
  ), [cameraRef]);

  // `followTile` centres on `viewport / 2`, so framing against a zero viewport
  // silently lands the camera half a screen off — the ship ends up outside the
  // canvas instead of in the middle of it. `canvasSize` is state mirrored into
  // a ref at render time, so it is still `{0, 0}` for any framing call that
  // happens in the same commit that first measured the canvas: a `#sel=` deep
  // link frames from an effect that can fire in exactly that commit. Measure
  // the element directly when the mirrored size has not caught up.
  const framingViewport = useCallback((): ScreenPoint => {
    const mirrored = canvasSizeRef.current;
    if (mirrored.x > 0 && mirrored.y > 0) return mirrored;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return mirrored;
    return { x: Math.max(1, Math.floor(rect.width)), y: Math.max(1, Math.floor(rect.height)) };
  }, [canvasSizeRef]);

  const selectedFollowTile = useCallback((
    entity: WorldSelectableEntity,
    shipMotionSamples: ReadonlyMap<string, ShipMotionSample>,
  ): ScreenPoint => (
    resolveSelectedFollowTile?.(entity, shipMotionSamples)
    ?? entity.tile
  ), [resolveSelectedFollowTile]);

  const queueCameraTarget = useCallback((targetCamera: IsoCamera, mode: CameraIntentMode) => {
    if (cameraModeCancelsFollow(mode)) stopFollowChase();
    const displayCamera = displayCameraRef.current ?? cameraRef.current;
    if (!displayCamera || reducedMotion || sameCamera(displayCamera, targetCamera)) {
      applyCameraImmediately(targetCamera);
      return;
    }
    cameraIntentRef.current = {
      lastFrameTime: null,
      mode,
      targetCamera,
    };
    requestWorldFrame();
  }, [applyCameraImmediately, cameraRef, reducedMotion, requestWorldFrame, stopFollowChase]);

  const setCamera: Dispatch<SetStateAction<IsoCamera | null>> = useCallback((value) => {
    stopFollowChase();
    const previous = displayCameraRef.current ?? cameraRef.current;
    const next = typeof value === "function"
      ? (value as (previousCamera: IsoCamera | null) => IsoCamera | null)(previous)
      : value;
    applyCameraImmediately(next);
  }, [applyCameraImmediately, cameraRef, stopFollowChase]);

  const moveCameraTo = useCallback((targetCamera: IsoCamera) => {
    queueCameraTarget(targetCamera, "external");
  }, [queueCameraTarget]);

  const focusSelection = useCallback((tile: ScreenPoint, onRest: () => void): IsoCamera | null => {
    stopFollowChase();
    const start = displayCameraRef.current ?? cameraRef.current;
    if (!start) {
      onRest();
      return null;
    }
    selectionCameraRestRef.current = onRest;
    const target = selectionCameraTarget({
      camera: start,
      map: world.map,
      tile,
      viewport: framingViewport(),
    });
    queueCameraTarget(target, "selection");
    if (reducedMotion || sameCamera(start, target)) finishSelectionCamera();
    return start;
  }, [cameraRef, finishSelectionCamera, framingViewport, queueCameraTarget, reducedMotion, stopFollowChase, world.map]);

  const returnFromSelection = useCallback((targetCamera: IsoCamera) => {
    queueCameraTarget(targetCamera, "selection-return");
  }, [queueCameraTarget]);

  const finishArrival = useCallback(() => {
    const arrival = arrivalRef.current;
    if (!arrival) return;
    arrivalRef.current = null;
    applyCameraImmediately(arrival.to);
    arrival.onComplete();
  }, [applyCameraImmediately]);

  const startArrival = useCallback((onComplete: () => void) => {
    const viewport = framingViewport();
    if (viewport.x <= 0 || viewport.y <= 0) {
      onComplete();
      return;
    }
    const target = defaultCamera({ height: viewport.y, map: world.map, width: viewport.x });
    if (reducedMotion) {
      applyCameraImmediately(target);
      onComplete();
      return;
    }
    const from = gardenArrivalCamera(target);
    cameraIntentRef.current = { lastFrameTime: null, mode: "idle", targetCamera: from };
    commitCameraState(from);
    arrivalRef.current = { from, onComplete, startMs: null, to: target };
    requestWorldFrame();
  }, [applyCameraImmediately, commitCameraState, framingViewport, reducedMotion, requestWorldFrame, world.map]);

  const skipArrival = useCallback(() => {
    finishArrival();
  }, [finishArrival]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvasRectRef.current = rect;
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));
      const deviceRequestedDpr = Math.max(1, window.devicePixelRatio || 1);
      maximumRequestedDprRef.current = deviceRequestedDpr;
      if (!adaptiveDprInitializedRef.current) {
        adaptiveDprStateRef.current = initialAdaptiveDprState(deviceRequestedDpr);
        adaptiveDprInitializedRef.current = true;
      } else if (adaptiveDprStateRef.current.requestedDpr > deviceRequestedDpr) {
        adaptiveDprStateRef.current = {
          ...adaptiveDprStateRef.current,
          requestedDpr: deviceRequestedDpr,
        };
      }
      const budget = resolveRenderSurfaceBudget({
        cssHeight,
        cssWidth,
        requestedDpr: adaptiveDprStateRef.current.requestedDpr,
      });
      surfaceBudgetRef.current = budget;
      // Do not mutate canvas.width/height here: backing-store changes clear the
      // bitmap immediately. The render loop syncs the backing store at the top
      // of the next draw so resize clears and repaint happen in one RAF.
      const nextCanvasSize = { x: cssWidth, y: cssHeight };
      setCanvasSize((previous) => samePoint(previous, nextCanvasSize) ? previous : nextCanvasSize);
      const previousCamera = displayCameraRef.current ?? cameraRef.current ?? currentCameraBase();
      const nextCamera = previousCamera
        ? clampCameraToMap(previousCamera, { map: world.map, viewport: nextCanvasSize })
        : defaultCamera({ width: cssWidth, height: cssHeight, map: world.map });
      applyCameraImmediately(nextCamera);
      if (followChaseDetailIdRef.current) requestWorldFrame();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [applyCameraImmediately, cameraRef, currentCameraBase, requestWorldFrame, world.map]);

  const canvasPoint = useCallback((event: Pick<MouseEvent, "clientX" | "clientY">) => {
    const canvas = canvasRef.current;
    const rect = canvasRectRef.current ?? canvas?.getBoundingClientRect();
    if (rect) canvasRectRef.current = rect;
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  }, []);

  const updateHover = useCallback((point: ScreenPoint) => {
    const target = hitTestSpatial(hitTargetSnapshotRef.current?.spatialIndex ?? null, point, {
      hoveredDetailId: hoveredDetailIdRef.current,
      selectedDetailId: selectedDetailIdRef.current,
    }) ?? hitTest(hitTargetsRef.current, point, {
      hoveredDetailId: hoveredDetailIdRef.current,
      selectedDetailId: selectedDetailIdRef.current,
    });
    setHoveredDetailId((previous) => previous === target?.detailId ? previous : (target?.detailId ?? null));
    // Refs (hitTargetSnapshotRef, hitTargetsRef, hoveredDetailIdRef,
    // selectedDetailIdRef) are deliberately omitted: their identity never
    // changes, so listing them is dep-list noise (HOOKS F4).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHoveredDetailId]);

  const scheduleHoverUpdate = useCallback(() => {
    if (hoverFrameRef.current) return;
    hoverFrameRef.current = requestAnimationFrame(() => {
      hoverFrameRef.current = 0;
      const point = pendingHoverPointRef.current;
      if (!point) return;
      updateHover(point);
    });
  }, [updateHover]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    canvasRectRef.current = event.currentTarget.getBoundingClientRect();
    const point = canvasPoint(event);
    activePointersRef.current.set(event.pointerId, point);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic browser tests and some interrupted platform gestures may not
      // expose a capturable active pointer. The registry below still keeps the
      // gesture coherent for events delivered to the canvas.
    }
    const pinch = pinchSnapshot(activePointersRef.current);
    if (pinch) {
      dragRef.current = null;
      pinchRef.current = { ...pinch, moved: false };
      return;
    }
    pinchRef.current = null;
    dragRef.current = { last: point, moved: false, pointerId: event.pointerId };
  }, [canvasPoint]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, point);
    }
    const pinch = pinchSnapshot(activePointersRef.current, pinchRef.current?.pointerIds);
    if (pinch) {
      const previousPinch = pinchRef.current;
      dragRef.current = null;
      if (!previousPinch) {
        pinchRef.current = { ...pinch, moved: false };
        return;
      }
      const midpointDelta = {
        x: pinch.midpoint.x - previousPinch.midpoint.x,
        y: pinch.midpoint.y - previousPinch.midpoint.y,
      };
      const distanceDelta = Math.abs(pinch.distance - previousPinch.distance);
      const scale = previousPinch.distance > 0 ? pinch.distance / previousPinch.distance : 1;
      const moved = previousPinch.moved
        || Math.abs(midpointDelta.x) + Math.abs(midpointDelta.y) > 1
        || distanceDelta > 1;
      if (moved) {
        const previous = currentCameraBase();
        if (previous) {
          const viewport = canvasSizeRef.current;
          const panned = {
            ...previous,
            offsetX: previous.offsetX + midpointDelta.x,
            offsetY: previous.offsetY + midpointDelta.y,
          };
          // N1: same viewport-derived zoom floor as the wheel and toolbar
          // paths, so pinch cannot pull back past the world either.
          const next = clampCameraToMap(
            zoomCameraAt(
              panned,
              pinch.midpoint,
              panned.zoom * scale,
              minZoomForViewport(viewport, world.map),
            ),
            { map: world.map, viewport },
          );
          queueCameraTarget(next, "pinch");
        }
      }
      pinchRef.current = { ...pinch, moved };
      return;
    }
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      const delta = { x: point.x - drag.last.x, y: point.y - drag.last.y };
      if (Math.abs(delta.x) + Math.abs(delta.y) > 1) {
        drag.moved = true;
        const previous = currentCameraBase();
        if (previous) {
          const next = panCamera(previous, delta, { map: world.map, viewport: canvasSizeRef.current });
          queueCameraTarget(next, "drag");
        }
      }
      drag.last = point;
      return;
    }
    pendingHoverPointRef.current = point;
    scheduleHoverUpdate();
    // canvasSizeRef + pendingHoverPointRef omitted: ref identity never
    // changes (HOOKS F4).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasPoint, currentCameraBase, queueCameraTarget, scheduleHoverUpdate, world.map]);

  const handlePointerLeave = useCallback(() => {
    if (hoverFrameRef.current) {
      cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = 0;
    }
    pendingHoverPointRef.current = null;
    setHoveredDetailId(null);
  }, [setHoveredDetailId]);

  const releasePointerCapture = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be gone after pointercancel/lost-capture.
    }
  }, []);

  const resetPointerGesture = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const wasPinching = Boolean(pinchRef.current);
    const pinchMoved = Boolean(pinchRef.current?.moved);
    activePointersRef.current.delete(event.pointerId);
    releasePointerCapture(event);

    const nextPinch = pinchSnapshot(activePointersRef.current);
    if (nextPinch) {
      dragRef.current = null;
      pinchRef.current = { ...nextPinch, moved: pinchMoved };
      return { pinchMoved, wasPinching };
    }

    pinchRef.current = null;
    const remaining = firstPointer(activePointersRef.current);
    dragRef.current = remaining
      ? { last: remaining.point, moved: wasPinching || pinchMoved, pointerId: remaining.pointerId }
      : null;
    return { pinchMoved, wasPinching };
  }, [releasePointerCapture]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    resetPointerGesture(event);
  }, [resetPointerGesture]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    const drag = dragRef.current;
    const { pinchMoved, wasPinching } = resetPointerGesture(event);
    if (wasPinching || pinchMoved) return;
    if (drag?.moved) return;
    const snapshot = recomputeHitTargets();
    const target = hitTestSpatial(snapshot?.spatialIndex ?? null, point, {
      hoveredDetailId: hoveredDetailIdRef.current,
      selectedDetailId: selectedDetailIdRef.current,
    }) ?? hitTest(snapshot?.targets ?? hitTargetsRef.current, point, {
      hoveredDetailId: hoveredDetailIdRef.current,
      selectedDetailId: selectedDetailIdRef.current,
    });
    if (target) {
      stopFollowChase();
      onSelectTarget(target, point, canvasSizeRef.current);
      return;
    }
    if (hasSelection()) {
      stopFollowChase();
      onClearSelection();
    }
    // hitTargetsRef, hoveredDetailIdRef, selectedDetailIdRef omitted: ref
    // identity never changes (HOOKS F4).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasPoint, hasSelection, onClearSelection, onSelectTarget, recomputeHitTargets, resetPointerGesture, stopFollowChase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      const previous = currentCameraBase();
      if (!previous) return;
      event.preventDefault();
      const next = zoomCameraByWheelDelta({
        camera: previous,
        deltaMode: event.deltaMode,
        deltaY: event.deltaY,
        map: world.map,
        point: canvasPoint(event),
        viewport: canvasSizeRef.current,
      });
      queueCameraTarget(next, "wheel");
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [canvasPoint, canvasSizeRef, currentCameraBase, queueCameraTarget, world.map]);

  const handleToolbarPan = useCallback((delta: ScreenPoint) => {
    const previous = currentCameraBase();
    if (!previous) return;
    const next = panCamera(previous, delta, { map: world.map, viewport: canvasSizeRef.current });
    queueCameraTarget(next, "toolbar");
  }, [canvasSizeRef, currentCameraBase, queueCameraTarget, world.map]);

  const handleResetView = useCallback(() => {
    const viewport = canvasSizeRef.current;
    if (viewport.x <= 0 || viewport.y <= 0) return;
    const next = defaultCamera({ height: viewport.y, map: world.map, width: viewport.x });
    queueCameraTarget(next, "reset");
  }, [canvasSizeRef, queueCameraTarget, world.map]);

  const handleToolbarZoomIn = useCallback(() => {
    const previous = currentCameraBase();
    if (!previous) return;
    queueCameraTarget(zoomIn(previous, canvasSizeRef.current, world.map), "toolbar");
  }, [canvasSizeRef, currentCameraBase, queueCameraTarget, world.map]);

  const handleToolbarZoomOut = useCallback(() => {
    const previous = currentCameraBase();
    if (!previous) return;
    queueCameraTarget(zoomOut(previous, canvasSizeRef.current, world.map), "toolbar");
  }, [canvasSizeRef, currentCameraBase, queueCameraTarget, world.map]);

  const stepCamera = useCallback((now: number, shipMotionSamples: ReadonlyMap<string, ShipMotionSample>): CameraStepResult => {
    const displayCamera = displayCameraRef.current ?? cameraRef.current;
    if (!displayCamera) {
      cameraIntentRef.current = { lastFrameTime: null, mode: "idle", targetCamera: null };
      return { camera: null, cameraChanged: false, cameraIntentActive: false };
    }

    const arrival = arrivalRef.current;
    if (arrival && !reducedMotion) {
      if (arrival.startMs === null) arrival.startMs = now;
      const sampled = sampleGardenArrivalCamera(arrival.from, arrival.to, now - arrival.startMs);
      const cameraChanged = !sameCamera(displayCamera, sampled.camera);
      commitCameraState(sampled.camera);
      if (sampled.done) {
        arrivalRef.current = null;
        arrival.onComplete();
      }
      return { camera: sampled.camera, cameraChanged, cameraIntentActive: !sampled.done };
    }

    // Observe 2.0: the tour owns the camera while it runs. Sampling is a pure
    // function of the elapsed clock — no damping, no state to drift.
    const activeTour = observeTourRef.current;
    if (activeTour && !reducedMotion) {
      if (activeTour.startMs === null) activeTour.startMs = now;
      const elapsedSeconds = Math.max(0, (now - activeTour.startMs) / 1000);
      if (elapsedSeconds >= activeTour.tour.totalSeconds && activeTour.loop) {
        activeTour.tour = buildObserveTour({
          keyframes: activeTour.tour.keyframes,
          segmentSeconds: GARDEN_ATTRACT_SEGMENT_SECONDS,
          start: observeTourPoseFromCamera(displayCamera, canvasSizeRef.current),
          travelSeconds: GARDEN_ATTRACT_TRAVEL_SECONDS,
        });
        activeTour.startMs = now;
        const pose = observeSampleRef.current;
        sampleObserveTour(activeTour.tour, 0, pose);
        const nextCamera = observeTourPoseToCamera(pose, canvasSizeRef.current, world.map);
        const cameraChanged = !sameCamera(displayCamera, nextCamera);
        commitCameraState(nextCamera);
        return { camera: nextCamera, cameraChanged, cameraIntentActive: true };
      }
      if (elapsedSeconds >= activeTour.tour.totalSeconds) {
        // Natural end: glide back to the visitor's framing and fall through
        // to the ordinary intent path, which runs that glide below.
        observeTourRef.current = null;
        queueCameraTarget(observeTourPoseToCamera(
          activeTour.returnPose,
          framingViewport(),
          world.map,
        ), "reset");
        activeTour.onBeatChange?.(null);
      } else {
        const pose = observeSampleRef.current;
        sampleObserveTour(activeTour.tour, elapsedSeconds, pose);
        if (pose.beatIndex !== activeTour.lastBeatIndex) {
          activeTour.lastBeatIndex = pose.beatIndex;
          activeTour.onBeatChange?.(pose.beatIndex);
        }
        const viewport = canvasSizeRef.current;
        const nextCamera = observeTourPoseToCamera(pose, viewport, world.map);
        const cameraChanged = !sameCamera(displayCamera, nextCamera);
        commitCameraState(nextCamera);
        return { camera: nextCamera, cameraChanged, cameraIntentActive: true };
      }
    }

    if (reducedMotion) {
      // Reduced motion has no tour: the DOM steps beats by hand. Drop any
      // tour that was mid-flight when the preference flipped.
      observeTourRef.current = null;
      const targetCamera = cameraIntentRef.current.targetCamera;
      if (!targetCamera) {
        cameraIntentRef.current = { lastFrameTime: null, mode: "idle", targetCamera: displayCamera };
        return { camera: displayCamera, cameraChanged: false, cameraIntentActive: false };
      }
      cameraIntentRef.current = { lastFrameTime: null, mode: "idle", targetCamera };
      if (sameCamera(displayCamera, targetCamera)) {
        finishSelectionCamera();
        return { camera: displayCamera, cameraChanged: false, cameraIntentActive: false };
      }
      commitCameraState(targetCamera);
      finishSelectionCamera();
      return { camera: targetCamera, cameraChanged: true, cameraIntentActive: false };
    }

    const activeDetailId = followChaseDetailIdRef.current;
    if (activeDetailId) {
      const entity = selectedEntityRef.current;
      const viewport = canvasSizeRef.current;
      if (
        !entity
        || entity.detailId !== activeDetailId
        || selectedDetailIdRef.current !== activeDetailId
        || entity.kind !== "ship"
        || reducedMotion
        || viewport.x <= 0
        || viewport.y <= 0
      ) {
        stopFollowChase();
      } else {
        const sampledTile = selectedFollowTile(entity, shipMotionSamples);
        const sample = shipMotionSamples.get(entity.id);
        const previousTime = followChaseLastTimeRef.current;
        const rawDeltaSeconds = previousTime === null ? FOLLOW_INITIAL_DELTA_SECONDS : (now - previousTime) / 1000;
        const deltaSeconds = Math.max(0, Math.min(FOLLOW_MAX_DELTA_SECONDS, rawDeltaSeconds));
        const leadTile = leadFollowTile(sampledTile, followChaseLastTileRef.current, deltaSeconds, FOLLOW_LEAD_SECONDS, sample);

        followChaseLastTileRef.current = sampledTile;
        followChaseLastTimeRef.current = now;
        cameraIntentRef.current = {
          lastFrameTime: cameraIntentRef.current.mode === "follow-selected"
            ? cameraIntentRef.current.lastFrameTime
            : null,
          mode: "follow-selected",
          targetCamera: followTile({
            camera: displayCamera,
            map: world.map,
            tile: leadTile,
            viewport,
          }),
        };
      }
    }

    const intent = cameraIntentRef.current;
    const targetCamera = intent.targetCamera;
    if (!targetCamera) {
      cameraIntentRef.current = { lastFrameTime: null, mode: "idle", targetCamera: null };
      return { camera: displayCamera, cameraChanged: false, cameraIntentActive: false };
    }
    const rawDeltaSeconds = intent.lastFrameTime === null
      ? FOLLOW_INITIAL_DELTA_SECONDS
      : (now - intent.lastFrameTime) / 1000;
    const deltaSeconds = Math.max(0, Math.min(FOLLOW_MAX_DELTA_SECONDS, rawDeltaSeconds));
    const advanced = advanceCameraIntent(displayCamera, targetCamera, deltaSeconds, intent.mode);
    const cameraChanged = !sameCamera(displayCamera, advanced.camera);
    commitCameraState(advanced.camera);

    if (followChaseDetailIdRef.current) {
      cameraIntentRef.current = {
        ...cameraIntentRef.current,
        lastFrameTime: now,
      };
      return { camera: advanced.camera, cameraChanged, cameraIntentActive: true };
    }

    if (advanced.settled) {
      cameraIntentRef.current = {
        lastFrameTime: null,
        mode: "idle",
        targetCamera: advanced.camera,
      };
      finishSelectionCamera();
      return { camera: advanced.camera, cameraChanged, cameraIntentActive: false };
    }

    cameraIntentRef.current = {
      ...cameraIntentRef.current,
      lastFrameTime: now,
    };
    return { camera: advanced.camera, cameraChanged, cameraIntentActive: true };
  }, [cameraRef, canvasSizeRef, commitCameraState, finishSelectionCamera, framingViewport, queueCameraTarget, reducedMotion, selectedDetailIdRef, selectedEntityRef, selectedFollowTile, stopFollowChase, world.map]);

  const handleFollowSelected = useCallback(() => {
    if (!selectedEntity) return;
    stopFollowChase();
    const sampledTile = selectedFollowTile(selectedEntity, shipMotionSamplesRef.current);
    const start = currentCameraBase();
    if (!start) return;
    const target = followTile({
      camera: start,
      map: world.map,
      tile: sampledTile,
      viewport: framingViewport(),
    });
    if (reducedMotion) {
      applyCameraImmediately(target);
      return;
    }
    if (selectedEntity.kind === "ship" && selectedDetailId) {
      followChaseDetailIdRef.current = selectedDetailId;
      followChaseLastTileRef.current = sampledTile;
      followChaseLastTimeRef.current = null;
      queueCameraTarget(target, "follow-selected");
      return;
    }
    queueCameraTarget(target, "follow-selected");
    // cameraRef, shipMotionSamplesRef omitted: ref identity never changes
    // (HOOKS F4).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyCameraImmediately, framingViewport, currentCameraBase, queueCameraTarget, reducedMotion, selectedDetailId, selectedEntity, selectedFollowTile, stopFollowChase, world.map]);

  const focusTile = useCallback((tile: ScreenPoint) => {
    stopFollowChase();
    const start = currentCameraBase();
    if (!start) return;
    queueCameraTarget(followTile({
      camera: start,
      map: world.map,
      tile,
      viewport: framingViewport(),
    }), "follow-selected");
  }, [framingViewport, currentCameraBase, queueCameraTarget, stopFollowChase, world.map]);

  // Observe 2.0 (Phase 4): the cinematic tour. The hook derives the start pose
  // from the visitor's live framing, so the first spline span IS the ease-in;
  // `startMs` latches on the first stepped frame so the timeline runs on the
  // same clock as every other camera motion.
  const startObserveTour = useCallback((
    keyframes: readonly ObserveTourKeyframe[],
    onBeatChange?: (beatIndex: number | null) => void,
  ) => {
    stopFollowChase();
    const startCamera = displayCameraRef.current ?? cameraRef.current;
    if (!startCamera || reducedMotion || keyframes.length === 0) return;
    const viewport = framingViewport();
    const returnPose = observeTourPoseFromCamera(startCamera, viewport);
    observeTourRef.current = {
      lastBeatIndex: null,
      ...(onBeatChange ? { onBeatChange } : {}),
      returnPose,
      startMs: null,
      tour: buildObserveTour({
        keyframes,
        start: returnPose,
      }),
    };
    requestWorldFrame();
  }, [cameraRef, framingViewport, reducedMotion, requestWorldFrame, stopFollowChase]);

  const startAttractTour = useCallback((keyframes: readonly ObserveTourKeyframe[]) => {
    stopFollowChase();
    const startCamera = displayCameraRef.current ?? cameraRef.current;
    if (!startCamera || reducedMotion || keyframes.length === 0) return;
    const viewport = framingViewport();
    const returnPose = observeTourPoseFromCamera(startCamera, viewport);
    observeTourRef.current = {
      lastBeatIndex: null,
      loop: true,
      returnPose,
      startMs: null,
      tour: buildObserveTour({
        keyframes,
        segmentSeconds: GARDEN_ATTRACT_SEGMENT_SECONDS,
        start: returnPose,
        travelSeconds: GARDEN_ATTRACT_TRAVEL_SECONDS,
      }),
    };
    requestWorldFrame();
  }, [cameraRef, framingViewport, reducedMotion, requestWorldFrame, stopFollowChase]);

  const stopAttractTour = useCallback(() => {
    if (!observeTourRef.current?.loop) return;
    observeTourRef.current = null;
    freezeDisplayedCamera();
  }, [freezeDisplayedCamera]);

  const stopObserveTour = useCallback((options?: { easeBack?: boolean }) => {
    const active = observeTourRef.current;
    if (!active) return;
    observeTourRef.current = null;
    if (options?.easeBack) {
      // The natural end: hand the framing back with the ordinary damped
      // command glide — the same blend every camera command uses.
      queueCameraTarget(observeTourPoseToCamera(
        active.returnPose,
        framingViewport(),
        world.map,
      ), "reset");
      return;
    }
    freezeDisplayedCamera();
  }, [framingViewport, freezeDisplayedCamera, queueCameraTarget, world.map]);

  useEffect(() => {
    if (lastSelectedDetailIdRef.current !== selectedDetailId) {
      stopFollowChase();
      lastSelectedDetailIdRef.current = selectedDetailId;
    }
  }, [selectedDetailId, stopFollowChase]);

  useEffect(() => {
    if (!reducedMotion) return;
    const targetCamera = cameraIntentRef.current.targetCamera;
    stopFollowChase();
    if (targetCamera) {
      applyCameraImmediately(targetCamera);
      return;
    }
  }, [applyCameraImmediately, reducedMotion, stopFollowChase]);

  useEffect(() => () => {
    stopFollowChase();
  }, [stopFollowChase]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const activeCamera = currentCameraBase();
    if (!activeCamera) return;
    if (event.key === "Escape") {
      if (isDialogEventTarget(event.target)) return;
      onClearSelection();
      stopFollowChase();
      return;
    }
    if (event.key === "+" || event.key === "=") {
      if (isInteractiveEventTarget(event.target)) return;
      event.preventDefault();
      handleToolbarZoomIn();
      return;
    }
    if (event.key === "-" || event.key === "_") {
      if (isInteractiveEventTarget(event.target)) return;
      event.preventDefault();
      handleToolbarZoomOut();
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
      const next = panCamera(activeCamera, deltas[event.key], { map: world.map, viewport: canvasSizeRef.current });
      queueCameraTarget(next, "keyboard");
    }
  }, [canvasSizeRef, currentCameraBase, handleToolbarZoomIn, handleToolbarZoomOut, onClearSelection, queueCameraTarget, stopFollowChase, world.map]);

  return {
    adaptiveDprStateRef,
    camera,
    cameraRef,
    cameraZoomLabel: camera ? cameraZoomLabel(camera) : "100%",
    cancelCameraIntent,
    surfaceBudgetRef,
    canvasRef,
    canvasSize,
    canvasSizeRef,
    focusTile,
    focusSelection,
    handleFollowSelected,
    handleKeyDown,
    handlePointerCancel,
    handlePointerDown,
    handlePointerLeave,
    handlePointerMove,
    handlePointerUp,
    handleResetView,
    handleToolbarPan,
    handleToolbarZoomIn,
    handleToolbarZoomOut,
    maximumRequestedDprRef,
    moveCameraTo,
    returnFromSelection,
    setCamera,
    skipArrival,
    startArrival,
    startAttractTour,
    startObserveTour,
    stopAttractTour,
    stopObserveTour,
    stepCamera,
  };
}

function isInteractiveEventTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest("a, button, input, select, textarea, summary, [role='button']"));
}
