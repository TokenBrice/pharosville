// Owns the canvas element ref, viewport size, isometric camera state, the
// resize observer (with adaptive DPR plumbing), and DOM event handlers that
// translate pointer/wheel/keyboard input into camera or selection deltas.
import { useCallback, useEffect, useRef, useState, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction, type WheelEvent as ReactWheelEvent } from "react";
import { entityFollowTile, type WorldSelectableEntity } from "../renderer/geometry";
import { hitTest, hitTestSpatial, type HitTarget, type HitTargetSnapshot } from "../renderer/hit-testing";
import { cameraZoomLabel, clampCameraToMap, defaultCamera, followTile, panCamera, zoomIn, zoomOut } from "../systems/camera";
import { initialAdaptiveDprState, resolveCanvasBudget, type AdaptiveDprState } from "../systems/canvas-budget";
import type { ShipMotionSample } from "../systems/motion";
import { zoomCameraAt, type IsoCamera, type MapLike, type ScreenPoint } from "../systems/projection";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import { useLatestRef } from "./use-latest-ref";

const FOLLOW_CAMERA_DAMPING = 4;
const FOLLOW_LEAD_SECONDS = 0.45;
const FOLLOW_MAX_DELTA_SECONDS = 0.25;
const FOLLOW_INITIAL_DELTA_SECONDS = 1 / 60;
const CAMERA_INTERACTION_DAMPING = 26;
const CAMERA_COMMAND_DAMPING = 12;
const CAMERA_RESIZE_DAMPING = 18;
const WHEEL_DELTA_LINE_HEIGHT_PX = 16;
const WHEEL_DELTA_DEFAULT_PAGE_PX = 800;
const WHEEL_DELTA_CLAMP_PX = 240;
const WHEEL_ZOOM_EXPONENT_PER_PIXEL = 0.00145;

export type CameraIntentMode =
  | "idle"
  | "drag"
  | "wheel"
  | "pinch"
  | "keyboard"
  | "toolbar"
  | "reset"
  | "follow-selected"
  | "resize"
  | "external";

interface CameraIntentState {
  lastFrameTime: number | null;
  mode: CameraIntentMode;
  targetCamera: IsoCamera | null;
}

export interface UseCanvasResizeAndCameraInput {
  exitFullscreen: () => void;
  fullscreenMode: boolean;
  hasSelection: () => boolean;
  hitTargetSnapshotRef: MutableRefObject<HitTargetSnapshot | null>;
  hitTargetsRef: MutableRefObject<readonly HitTarget[]>;
  hoveredDetailIdRef: MutableRefObject<string | null>;
  onClearSelection: () => void;
  onSelectTarget: (target: HitTarget, point: ScreenPoint, viewport: ScreenPoint) => void;
  recomputeHitTargets: () => HitTargetSnapshot | null;
  reducedMotion: boolean;
  selectedDetailIdRef: MutableRefObject<string | null>;
  selectedEntity: WorldSelectableEntity | null;
  setHoveredDetailId: Dispatch<SetStateAction<string | null>>;
  shipMotionSamplesRef: MutableRefObject<ReadonlyMap<string, ShipMotionSample>>;
  world: PharosVilleWorldModel;
}

export interface UseCanvasResizeAndCameraResult {
  adaptiveDprStateRef: MutableRefObject<AdaptiveDprState>;
  camera: IsoCamera | null;
  cameraRef: MutableRefObject<IsoCamera | null>;
  cameraZoomLabel: string;
  canvasBudgetRef: MutableRefObject<ReturnType<typeof resolveCanvasBudget> | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canvasSize: ScreenPoint;
  canvasSizeRef: MutableRefObject<ScreenPoint>;
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
  handleWheel: (event: ReactWheelEvent<HTMLCanvasElement>) => void;
  maximumRequestedDprRef: MutableRefObject<number>;
  setCamera: Dispatch<SetStateAction<IsoCamera | null>>;
}

export function useCanvasResizeAndCamera(input: UseCanvasResizeAndCameraInput): UseCanvasResizeAndCameraResult {
  const {
    exitFullscreen,
    fullscreenMode,
    hasSelection,
    hitTargetSnapshotRef,
    hitTargetsRef,
    hoveredDetailIdRef,
    onClearSelection,
    onSelectTarget,
    recomputeHitTargets,
    reducedMotion,
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
  const cameraFrameRef = useRef(0);
  const cameraIntentRef = useRef<CameraIntentState>({ lastFrameTime: null, mode: "idle", targetCamera: null });
  const displayCameraRef = useRef<IsoCamera | null>(null);
  const hoverFrameRef = useRef(0);
  const pendingHoverPointRef = useRef<ScreenPoint | null>(null);
  const adaptiveDprStateRef = useRef<AdaptiveDprState>(initialAdaptiveDprState(1));
  const adaptiveDprInitializedRef = useRef(false);
  const maximumRequestedDprRef = useRef(1);
  const canvasBudgetRef = useRef<ReturnType<typeof resolveCanvasBudget> | null>(null);
  const followChaseDetailIdRef = useRef<string | null>(null);
  const followChaseLastTileRef = useRef<ScreenPoint | null>(null);
  const followChaseLastTimeRef = useRef<number | null>(null);
  const runCameraFrameRef = useRef<(now: number) => void>(() => {});

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

  useEffect(() => {
    canvasRectRef.current = null;
  }, [fullscreenMode]);

  useEffect(() => () => {
    if (hoverFrameRef.current) cancelAnimationFrame(hoverFrameRef.current);
  }, []);

  const cancelCameraFrame = useCallback(() => {
    if (!cameraFrameRef.current) return;
    cancelAnimationFrame(cameraFrameRef.current);
    cameraFrameRef.current = 0;
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
    cancelCameraFrame();
    cameraIntentRef.current = { lastFrameTime: null, mode: "idle", targetCamera: next };
    commitCameraState(next);
  }, [cancelCameraFrame, commitCameraState]);

  const requestCameraFrame = useCallback(() => {
    if (reducedMotion || cameraFrameRef.current) return;
    cameraFrameRef.current = requestAnimationFrame((now) => runCameraFrameRef.current(now));
  }, [reducedMotion]);

  const stopFollowChase = useCallback(() => {
    followChaseDetailIdRef.current = null;
    followChaseLastTileRef.current = null;
    followChaseLastTimeRef.current = null;
    if (cameraIntentRef.current.mode === "follow-selected") {
      cameraIntentRef.current = {
        lastFrameTime: null,
        mode: "idle",
        targetCamera: displayCameraRef.current,
      };
    }
  }, []);

  const currentCameraBase = useCallback(() => (
    cameraIntentRef.current.targetCamera ?? displayCameraRef.current ?? cameraRef.current
  ), [cameraRef]);

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
    requestCameraFrame();
  }, [applyCameraImmediately, cameraRef, reducedMotion, requestCameraFrame, stopFollowChase]);

  const setCamera: Dispatch<SetStateAction<IsoCamera | null>> = useCallback((value) => {
    stopFollowChase();
    const previous = displayCameraRef.current ?? cameraRef.current;
    const next = typeof value === "function"
      ? (value as (previousCamera: IsoCamera | null) => IsoCamera | null)(previous)
      : value;
    applyCameraImmediately(next);
  }, [applyCameraImmediately, cameraRef, stopFollowChase]);

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
      const budget = resolveCanvasBudget({
        cssHeight,
        cssWidth,
        requestedDpr: adaptiveDprStateRef.current.requestedDpr,
      });
      canvasBudgetRef.current = budget;
      const nextWidth = budget.backingWidth;
      const nextHeight = budget.backingHeight;
      if (canvas.width !== nextWidth) canvas.width = nextWidth;
      if (canvas.height !== nextHeight) canvas.height = nextHeight;
      const nextCanvasSize = { x: cssWidth, y: cssHeight };
      setCanvasSize((previous) => samePoint(previous, nextCanvasSize) ? previous : nextCanvasSize);
      const previousCamera = currentCameraBase();
      const nextCamera = previousCamera
        ? clampCameraToMap(previousCamera, { map: world.map, viewport: nextCanvasSize })
        : defaultCamera({ width: cssWidth, height: cssHeight, map: world.map });
      applyCameraImmediately(nextCamera);
      if (followChaseDetailIdRef.current) requestCameraFrame();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [applyCameraImmediately, currentCameraBase, requestCameraFrame, world.map]);

  const canvasPoint = useCallback((event: ReactPointerEvent<HTMLCanvasElement> | ReactWheelEvent<HTMLCanvasElement>) => {
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
          const next = clampCameraToMap(zoomCameraAt(panned, pinch.midpoint, panned.zoom * scale), {
            map: world.map,
            viewport,
          });
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

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLCanvasElement>) => {
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

  const runCameraFrame = useCallback((now: number) => {
    cameraFrameRef.current = 0;
    const displayCamera = displayCameraRef.current ?? cameraRef.current;
    if (!displayCamera) {
      cameraIntentRef.current = { lastFrameTime: null, mode: "idle", targetCamera: null };
      return;
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
        const sampledTile = entityFollowTile({
          entity,
          mapWidth: world.map.width,
          shipMotionSamples: shipMotionSamplesRef.current,
        });
        const sample = shipMotionSamplesRef.current.get(entity.id);
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
      return;
    }
    const rawDeltaSeconds = intent.lastFrameTime === null
      ? FOLLOW_INITIAL_DELTA_SECONDS
      : (now - intent.lastFrameTime) / 1000;
    const deltaSeconds = Math.max(0, Math.min(FOLLOW_MAX_DELTA_SECONDS, rawDeltaSeconds));
    const advanced = advanceCameraIntent(displayCamera, targetCamera, deltaSeconds, intent.mode);
    commitCameraState(advanced.camera);

    if (followChaseDetailIdRef.current) {
      cameraIntentRef.current = {
        ...cameraIntentRef.current,
        lastFrameTime: now,
      };
      requestCameraFrame();
      return;
    }

    if (advanced.settled) {
      cameraIntentRef.current = {
        lastFrameTime: null,
        mode: "idle",
        targetCamera: advanced.camera,
      };
      return;
    }

    cameraIntentRef.current = {
      ...cameraIntentRef.current,
      lastFrameTime: now,
    };
    requestCameraFrame();
  }, [cameraRef, canvasSizeRef, commitCameraState, reducedMotion, requestCameraFrame, selectedDetailIdRef, selectedEntityRef, shipMotionSamplesRef, stopFollowChase, world.map]);

  useEffect(() => {
    runCameraFrameRef.current = runCameraFrame;
  }, [runCameraFrame]);

  const handleFollowSelected = useCallback(() => {
    if (!selectedEntity) return;
    stopFollowChase();
    const sampledTile = entityFollowTile({
      entity: selectedEntity,
      mapWidth: world.map.width,
      shipMotionSamples: shipMotionSamplesRef.current,
    });
    const start = currentCameraBase();
    if (!start) return;
    const target = followTile({
      camera: start,
      map: world.map,
      tile: sampledTile,
      viewport: canvasSizeRef.current,
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
      requestCameraFrame();
      return;
    }
    queueCameraTarget(target, "follow-selected");
    // cameraRef, shipMotionSamplesRef omitted: ref identity never changes
    // (HOOKS F4).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyCameraImmediately, canvasSizeRef, currentCameraBase, queueCameraTarget, reducedMotion, requestCameraFrame, selectedDetailId, selectedEntity, stopFollowChase, world.map]);

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
    cancelCameraFrame();
  }, [applyCameraImmediately, cancelCameraFrame, reducedMotion, stopFollowChase]);

  useEffect(() => () => {
    cancelCameraFrame();
    stopFollowChase();
  }, [cancelCameraFrame, stopFollowChase]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const activeCamera = currentCameraBase();
    if (!activeCamera) return;
    if (event.key === "Escape") {
      if (fullscreenMode) {
        event.preventDefault();
        exitFullscreen();
        return;
      }
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
  }, [canvasSizeRef, currentCameraBase, exitFullscreen, fullscreenMode, handleToolbarZoomIn, handleToolbarZoomOut, onClearSelection, queueCameraTarget, stopFollowChase, world.map]);

  return {
    adaptiveDprStateRef,
    camera,
    cameraRef,
    cameraZoomLabel: camera ? cameraZoomLabel(camera) : "100%",
    canvasBudgetRef,
    canvasRef,
    canvasSize,
    canvasSizeRef,
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
    handleWheel,
    maximumRequestedDprRef,
    setCamera,
  };
}

function isInteractiveEventTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest("a, button, input, select, textarea, summary, [role='button']"));
}

function samePoint(left: ScreenPoint, right: ScreenPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameCamera(left: IsoCamera, right: IsoCamera): boolean {
  return left.offsetX === right.offsetX && left.offsetY === right.offsetY && left.zoom === right.zoom;
}

function nearlySameCamera(left: IsoCamera, right: IsoCamera): boolean {
  return Math.abs(left.offsetX - right.offsetX) < 0.01
    && Math.abs(left.offsetY - right.offsetY) < 0.01
    && Math.abs(left.zoom - right.zoom) < 0.0001;
}

export function normalizeWheelDeltaY(deltaY: number, deltaMode: number, pageSize = WHEEL_DELTA_DEFAULT_PAGE_PX): number {
  const pixelDelta = deltaMode === 1
    ? deltaY * WHEEL_DELTA_LINE_HEIGHT_PX
    : deltaMode === 2
      ? deltaY * Math.max(1, pageSize)
      : deltaY;
  if (!Number.isFinite(pixelDelta)) return 0;
  return Math.max(-WHEEL_DELTA_CLAMP_PX, Math.min(WHEEL_DELTA_CLAMP_PX, pixelDelta));
}

export function wheelZoomScaleFromDelta(deltaY: number, deltaMode: number, pageSize = WHEEL_DELTA_DEFAULT_PAGE_PX): number {
  return Math.exp(-normalizeWheelDeltaY(deltaY, deltaMode, pageSize) * WHEEL_ZOOM_EXPONENT_PER_PIXEL);
}

export function zoomCameraByWheelDelta(input: {
  camera: IsoCamera;
  deltaMode: number;
  deltaY: number;
  map?: MapLike;
  point: ScreenPoint;
  viewport: ScreenPoint;
}): IsoCamera {
  const next = zoomCameraAt(
    input.camera,
    input.point,
    input.camera.zoom * wheelZoomScaleFromDelta(input.deltaY, input.deltaMode, input.viewport.y),
  );
  return input.map ? clampCameraToMap(next, { map: input.map, viewport: input.viewport }) : next;
}

export function advanceCameraIntent(
  current: IsoCamera,
  target: IsoCamera,
  deltaSeconds: number,
  mode: CameraIntentMode = "toolbar",
): { camera: IsoCamera; settled: boolean } {
  if (nearlySameCamera(current, target)) return { camera: target, settled: true };
  const next = dampFollowCamera(current, target, deltaSeconds, cameraDampingForMode(mode));
  if (nearlySameCamera(next, target)) return { camera: target, settled: true };
  return { camera: next, settled: false };
}

export function cameraModeCancelsFollow(mode: CameraIntentMode): boolean {
  return mode === "drag"
    || mode === "wheel"
    || mode === "pinch"
    || mode === "keyboard"
    || mode === "toolbar"
    || mode === "reset"
    || mode === "external";
}

function cameraDampingForMode(mode: CameraIntentMode): number {
  if (mode === "follow-selected") return FOLLOW_CAMERA_DAMPING;
  if (mode === "resize") return CAMERA_RESIZE_DAMPING;
  if (mode === "drag" || mode === "wheel" || mode === "pinch" || mode === "keyboard") {
    return CAMERA_INTERACTION_DAMPING;
  }
  return CAMERA_COMMAND_DAMPING;
}

export function leadFollowTile(
  currentTile: ScreenPoint,
  previousTile: ScreenPoint | null,
  deltaSeconds: number,
  leadSeconds = FOLLOW_LEAD_SECONDS,
  sample?: Pick<ShipMotionSample, "speedTilesPerSecond" | "velocity"> | null,
): ScreenPoint {
  const velocity = sample?.velocity;
  if (
    velocity
    && leadSeconds > 0
    && Number.isFinite(velocity.x)
    && Number.isFinite(velocity.y)
    && (sample.speedTilesPerSecond ?? Math.hypot(velocity.x, velocity.y)) > 0
  ) {
    return {
      x: currentTile.x + velocity.x * leadSeconds,
      y: currentTile.y + velocity.y * leadSeconds,
    };
  }
  if (!previousTile || deltaSeconds <= 0 || leadSeconds <= 0) return currentTile;
  const velocityX = (currentTile.x - previousTile.x) / deltaSeconds;
  const velocityY = (currentTile.y - previousTile.y) / deltaSeconds;
  if (!Number.isFinite(velocityX) || !Number.isFinite(velocityY)) return currentTile;
  return {
    x: currentTile.x + velocityX * leadSeconds,
    y: currentTile.y + velocityY * leadSeconds,
  };
}

export function dampFollowCamera(
  current: IsoCamera,
  target: IsoCamera,
  deltaSeconds: number,
  damping = FOLLOW_CAMERA_DAMPING,
): IsoCamera {
  if (deltaSeconds <= 0 || damping <= 0) return current;
  const alpha = 1 - Math.exp(-damping * deltaSeconds);
  return {
    offsetX: current.offsetX + (target.offsetX - current.offsetX) * alpha,
    offsetY: current.offsetY + (target.offsetY - current.offsetY) * alpha,
    zoom: current.zoom + (target.zoom - current.zoom) * alpha,
  };
}

function firstPointer(points: ReadonlyMap<number, ScreenPoint>): { pointerId: number; point: ScreenPoint } | null {
  const next = points.entries().next();
  if (next.done) return null;
  return { pointerId: next.value[0], point: next.value[1] };
}

function pinchSnapshot(
  points: ReadonlyMap<number, ScreenPoint>,
  preferredIds?: readonly [number, number],
): { distance: number; midpoint: ScreenPoint; pointerIds: [number, number] } | null {
  let pointerIds: [number, number] | null = null;
  if (preferredIds && points.has(preferredIds[0]) && points.has(preferredIds[1])) {
    pointerIds = [preferredIds[0], preferredIds[1]];
  } else {
    const ids = Array.from(points.keys()).slice(0, 2);
    if (ids.length === 2) pointerIds = [ids[0], ids[1]];
  }
  if (!pointerIds) return null;
  const first = points.get(pointerIds[0]);
  const second = points.get(pointerIds[1]);
  if (!first || !second) return null;
  return {
    distance: Math.hypot(second.x - first.x, second.y - first.y),
    midpoint: {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    },
    pointerIds,
  };
}
