// Owns the canvas element ref, viewport size, isometric camera state, the
// resize observer (with adaptive DPR plumbing), and DOM event handlers that
// translate pointer/wheel/keyboard input into camera or selection deltas.
import { useCallback, useEffect, useRef, useState, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction, type WheelEvent as ReactWheelEvent } from "react";
import { entityFollowTile, type WorldSelectableEntity } from "../renderer/geometry";
import { hitTest, hitTestSpatial, type HitTarget, type HitTargetSnapshot } from "../renderer/hit-testing";
import { cameraZoomLabel, clampCameraToMap, defaultCamera, followTile, panCamera, zoomIn, zoomOut } from "../systems/camera";
import { initialAdaptiveDprState, resolveCanvasBudget, type AdaptiveDprState } from "../systems/canvas-budget";
import type { ShipMotionSample } from "../systems/motion";
import { zoomCameraAt, type IsoCamera, type ScreenPoint } from "../systems/projection";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import { useLatestRef } from "./use-latest-ref";

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
  const canvasRectRef = useRef<Pick<DOMRectReadOnly, "left" | "top"> | null>(null);
  const dragPanDeltaRef = useRef<ScreenPoint>({ x: 0, y: 0 });
  const dragPanFrameRef = useRef(0);
  const hoverFrameRef = useRef(0);
  const pendingHoverPointRef = useRef<ScreenPoint | null>(null);
  const adaptiveDprStateRef = useRef<AdaptiveDprState>(initialAdaptiveDprState(1));
  const adaptiveDprInitializedRef = useRef(false);
  const maximumRequestedDprRef = useRef(1);
  const canvasBudgetRef = useRef<ReturnType<typeof resolveCanvasBudget> | null>(null);
  const followTweenFrameRef = useRef(0);

  const [camera, setCamera] = useState<IsoCamera | null>(null);
  const [canvasSize, setCanvasSize] = useState<ScreenPoint>({ x: 0, y: 0 });

  // Mirrored via `useLatestRef` (synchronous render-time write) so consumers
  // reading `.current` from event handlers / RAF observe the latest committed
  // value without an extra effect tick or StrictMode desync.
  const cameraRef = useLatestRef(camera);
  const canvasSizeRef = useLatestRef(canvasSize);

  useEffect(() => {
    canvasRectRef.current = null;
  }, [fullscreenMode]);

  useEffect(() => () => {
    if (hoverFrameRef.current) cancelAnimationFrame(hoverFrameRef.current);
  }, []);

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
  }, [hitTargetSnapshotRef, hitTargetsRef, hoveredDetailIdRef, selectedDetailIdRef, setHoveredDetailId]);

  const scheduleHoverUpdate = useCallback(() => {
    if (hoverFrameRef.current) return;
    hoverFrameRef.current = requestAnimationFrame(() => {
      hoverFrameRef.current = 0;
      const point = pendingHoverPointRef.current;
      if (!point) return;
      updateHover(point);
    });
  }, [updateHover]);

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
    pendingHoverPointRef.current = point;
    scheduleHoverUpdate();
  }, [canvasPoint, scheduleDragPan, scheduleHoverUpdate]);

  const handlePointerLeave = useCallback(() => {
    if (hoverFrameRef.current) {
      cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = 0;
    }
    pendingHoverPointRef.current = null;
    setHoveredDetailId(null);
  }, [setHoveredDetailId]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    const drag = dragRef.current;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
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
      onSelectTarget(target, point, canvasSizeRef.current);
      return;
    }
    if (hasSelection()) onClearSelection();
  }, [canvasPoint, hasSelection, hitTargetsRef, hoveredDetailIdRef, onClearSelection, onSelectTarget, recomputeHitTargets, selectedDetailIdRef]);

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
      shipMotionSamples: shipMotionSamplesRef.current,
    });
    const start = cameraRef.current;
    if (!start) return;
    const target = followTile({
      camera: start,
      map: world.map,
      tile: sampledTile,
      viewport: canvasSize,
    });
    if (followTweenFrameRef.current) {
      cancelAnimationFrame(followTweenFrameRef.current);
      followTweenFrameRef.current = 0;
    }
    if (sameCamera(start, target)) return;
    if (reducedMotion) {
      setCamera(target);
      return;
    }
    const duration = 400;
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const next: IsoCamera = {
        offsetX: start.offsetX + (target.offsetX - start.offsetX) * eased,
        offsetY: start.offsetY + (target.offsetY - start.offsetY) * eased,
        zoom: start.zoom + (target.zoom - start.zoom) * eased,
      };
      setCamera(next);
      if (t < 1) {
        followTweenFrameRef.current = requestAnimationFrame(tick);
      } else {
        followTweenFrameRef.current = 0;
      }
    };
    followTweenFrameRef.current = requestAnimationFrame(tick);
  }, [cameraRef, canvasSize, reducedMotion, selectedEntity, shipMotionSamplesRef, world.map]);

  useEffect(() => () => {
    if (followTweenFrameRef.current) cancelAnimationFrame(followTweenFrameRef.current);
  }, []);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (!camera) return;
    if (event.key === "Escape") {
      if (fullscreenMode) {
        event.preventDefault();
        exitFullscreen();
        return;
      }
      onClearSelection();
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
      const next = panCamera(camera, deltas[event.key], { map: world.map, viewport: canvasSize });
      if (!sameCamera(camera, next)) setCamera(next);
    }
  }, [camera, canvasSize, exitFullscreen, fullscreenMode, handleToolbarZoomIn, handleToolbarZoomOut, onClearSelection, world.map]);

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
