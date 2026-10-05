// Owns the canvas element ref, viewport size, isometric camera state, the
// resize observer (with adaptive DPR plumbing), and DOM event handlers that
// translate pointer/wheel/keyboard input into camera or selection deltas.
import { useCallback, useEffect, useRef, useState, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type RefObject, type SetStateAction } from "react";
import { hitTest, hitTestSpatial, type HitTarget, type HitTargetSnapshot } from "../renderer/hit-testing";
import {
  cameraZoomLabel,
  defaultCamera,
  followShotCamera,
  followTile,
  lighthouseLookUpCamera,
  panCameraOnGround,
  clampCameraToMap,
  selectionShot,
  SELECTION_SHIP_ANCHOR,
  withoutRest,
  zoomCameraOnGround,
  zoomIn,
  zoomOut,
  type SelectionShotSubject,
} from "../systems/camera";
import {
  buildObserveTour,
  observeTourPoseFromCamera,
  observeTourPoseToCamera,
  sampleObserveTour,
  type ObserveTour,
  type ObserveTourKeyframe,
  type ObserveTourSample,
} from "../systems/observe-tour";
import {
  initialAdaptiveDprState,
  resolveMaximumRequestedDpr,
  resolveRenderSurfaceBudget,
  type AdaptiveDprState,
} from "../systems/render-surface-budget";
import type { ShipMotionSample } from "../systems/motion";
import {
  cameraAtRest,
  cameraView,
  screenToGround,
  tileToIso,
  worldToScreen,
  TILE_SCALE,
  type CameraRestState,
  type MapLike,
  type IsoCamera,
  type ScreenPoint,
  type WorldPoint,
} from "../systems/projection";
import type {
  PharosVilleWorld as PharosVilleWorldModel,
  WorldSelectableEntity,
} from "../systems/world-types";
import { sameCamera, samePoint } from "../lib/camera-equality";
import { isDialogEventTarget } from "./keyboard-event-target";
import { GARDEN_POSTCARDS, postcardCamera, strollWaypoints } from "../systems/postcards";
import {
  FOLLOW_INITIAL_DELTA_SECONDS,
  FOLLOW_MAX_DELTA_SECONDS,
  LIGHTHOUSE_LOOK_UP_SECONDS,
  REST_HAND_OFF_SECONDS,
  panStationCamera,
  zoomStationCamera,
  wheelZoomScaleFromDelta,
  strollPathClear,
  SELECTION_RETURN_GLIDE_SCALE,
  advanceCameraIntent,
  cameraModeCancelsFollow,
  createShotGlide,
  glidePathPixels,
  sampleShotGlide,
  selectionGlideSeconds,
  zoomCameraByWheelDelta,
  type CameraIntentMode,
  type CameraIntentState,
  type ShotGlide,
} from "./camera-intent";
import { firstPointer, pinchSnapshot } from "./pointer-gesture";
import { useLatestRef } from "./use-latest-ref";

/** An explicit station command travels on the route, never on an idle timer. */
const STROLL_GLIDE_MIN_SECONDS = 2.4;
const STROLL_GLIDE_MAX_SECONDS = 5;
const STROLL_GLIDE_UNITS_PER_SECOND = 80;
export const STROLL_KEY = "w";

export {
  advanceCameraIntent,
  cameraModeCancelsFollow,
  dampFollowCamera,
  leadFollowTile,
  normalizeWheelDeltaY,
  wheelZoomScaleFromDelta,
  zoomCameraByWheelDelta,
} from "./camera-intent";
export type { CameraIntentMode } from "./camera-intent";

/** What a selection frames (W1.7): a ship or dock shot, or the lighthouse look-up. */
export type CameraSelectionSubject = SelectionShotSubject | { kind: "lighthouse" };

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
  /** Frame a selection, saving the displayed station-local pose for its return. */
  focusSelection: (subject: CameraSelectionSubject) => IsoCamera | null;
  returnFromSelection: (camera: IsoCamera) => void;
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
  strollNext: () => { index: number; title: string } | null;
  strollPrevious: () => { index: number; title: string } | null;
  strollIndex: number | null;
  stopObserveTour: (options?: { easeBack?: boolean }) => void;
  stepCamera: (now: number, shipMotionSamples: ReadonlyMap<string, ShipMotionSample>) => CameraStepResult;
}

/**
 * Translate the perspective rig so the ship sits on the selection shot's
 * anchor (W1.7: the lower-left third, mirrored when `heading` points left).
 */
export function voyageCamera(
  camera: IsoCamera,
  tile: ScreenPoint,
  viewport: ScreenPoint,
  map: MapLike,
  heading?: ScreenPoint | null,
): IsoCamera {
  const centered = followTile({ camera, tile, viewport, map });
  let anchorX = SELECTION_SHIP_ANCHOR.x;
  const speed = heading ? Math.hypot(heading.x, heading.y) : 0;
  if (heading && speed > 1e-6) {
    const at = worldToScreen({ x: tile.x * TILE_SCALE, y: -1.07, z: tile.y * TILE_SCALE }, centered, viewport);
    const ahead = worldToScreen({
      x: (tile.x + (heading.x / speed) * 3) * TILE_SCALE,
      y: -1.07,
      z: (tile.y + (heading.y / speed) * 3) * TILE_SCALE,
    }, centered, viewport);
    if (ahead.x - at.x < -0.002 * viewport.x) anchorX = 1 - anchorX;
  }
  const anchor = screenToGround({ x: viewport.x * anchorX, y: viewport.y * SELECTION_SHIP_ANCHOR.y }, centered, viewport, -1.07);
  const delta = tileToIso({ x: tile.x - anchor.x, y: tile.y - anchor.y });
  return {
    ...centered,
    offsetX: centered.offsetX - delta.x * centered.zoom,
    offsetY: centered.offsetY - delta.y * centered.zoom,
  };
}

/**
 * The rest ShotSpec solved for `viewport`, or a clamped rig. A resize or a
 * selection return that catches a hand-off mid-ease lands on whichever end it
 * is nearer. (An interruption instead holds the blend exactly.) A composed
 * shot is a free view, valid at any viewport, so it rides along unchanged.
 */
export function settleCamera(camera: IsoCamera, viewport: ScreenPoint, map: MapLike): IsoCamera {
  const presence = camera.rest?.presence ?? 0;
  const settled = presence >= 0.5
    ? defaultCamera({ height: viewport.y, map, width: viewport.x })
    : clampCameraToMap(withoutRest(camera), { map, viewport });
  return camera.shot ? { ...settled, shot: camera.shot } : settled;
}

/**
 * A resize keeps the visitor's framing; at rest the ShotSpec is re-solved for
 * the new viewport (the tall window has its own seat eye).
 */
export function resizeCamera(camera: IsoCamera, viewport: ScreenPoint, map: MapLike): IsoCamera {
  const card = GARDEN_POSTCARDS.find((station) => camera.shot?.subject?.world === station.subject);
  if (card && camera.shot) return postcardCamera({ ...card, eye: camera.shot.view.eye }, withoutRest(camera), viewport);
  return settleCamera(camera, viewport, map);
}

/** Toolbar and arrow-key pans move the water at the frame centre by `delta` (ground plane, W1.1). */
function panFromCentre(camera: IsoCamera, delta: ScreenPoint, viewport: ScreenPoint, map: MapLike): IsoCamera {
  const centre = { x: viewport.x / 2, y: viewport.y / 2 };
  return panCameraOnGround(camera, centre, { x: centre.x + delta.x, y: centre.y + delta.y }, { map, viewport });
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
  const [strollIndex, setStrollIndex] = useState<number | null>(null);
  const strollIndexRef = useRef<number | null>(null);
  const stationPoseRef = useRef<IsoCamera | null>(null);
  const captureGlideRef = useRef<ShotGlide | null>(null);
  const selectionFromStationRef = useRef(false);
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
  // W1.7: the selection/return glide in flight (sampled on the RAF clock), the
  // last selection glide's length (the return walks at least that long), and
  // the composed shot a ship follow translates with its subject.
  const shotGlideRef = useRef<{ glide: ShotGlide; startMs: number | null } | null>(null);
  const selectionGlideSecondsRef = useRef(0);
  const followShotRef = useRef<IsoCamera | null>(null);
  // Observe 2.0: the active tour and the framing to glide back to. The sample
  // scratch is reused every frame — no allocation in the camera path.
  const observeTourRef = useRef<{
    lastBeatIndex: number | null;
    onBeatChange?: (beatIndex: number | null) => void;
    returnPose: ReturnType<typeof observeTourPoseFromCamera>;
    startMs: number | null;
    tour: ObserveTour;
    /** W1.0: the tour left the rest seat, so its natural end glides back onto the seat. */
    returnToRest: boolean;
    /**
     * The rest the tour set out from (captured when its clock starts). It
     * eases off on the tour's own clock, so a hold is still however far apart
     * the frames land.
     */
    restLeft: CameraRestState | undefined;
  } | null>(null);
  const observeSampleRef = useRef<ObserveTourSample>({
    beatIndex: 0,
    done: false,
    isoX: 0,
    isoY: 0,
    zoom: 1,
  });

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
    const previousDisplay = displayCameraRef.current;
    displayCameraRef.current = next;
    cameraRef.current = next;
    // Avoid a same-state render bailout: render-time mirrors can otherwise
    // overwrite event-time refs without running the matching layout effects.
    if (sameCamera(previousDisplay, next)) return;
    setCameraState((previous) => {
      if (previous === null || next === null) return previous === next ? previous : next;
      return sameCamera(previous, next) ? previous : next;
    });
  }, [cameraRef]);

  const applyCameraImmediately = useCallback((next: IsoCamera | null) => {
    shotGlideRef.current = null;
    cameraIntentRef.current = { lastFrameTime: null, mode: "idle", targetCamera: next };
    commitCameraState(next);
    requestWorldFrame();
  }, [commitCameraState, requestWorldFrame]);


  // An interruption holds the whole displayed pose — offsets, zoom and any
  // part-eased rest blend. Only reset and selection-return ease the
  // rest; the next gesture hands off from wherever the blend was held.
  const freezeDisplayedCamera = useCallback(() => {
    const displayedCamera = displayCameraRef.current ?? cameraRef.current;
    shotGlideRef.current = null;
    cameraIntentRef.current = {
      lastFrameTime: null,
      mode: "idle",
      targetCamera: displayedCamera,
    };
  }, [cameraRef]);

  const stopFollowChase = useCallback(() => {
    followChaseDetailIdRef.current = null;
    followShotRef.current = null;
    // Any follow-canceling gesture (drag, wheel, keys, selection) also ends
    // the observe tour outright — the visitor took the camera back, so there
    // is no glide-back, just the tour releasing its hold.
    observeTourRef.current = null;
    freezeDisplayedCamera();
  }, [freezeDisplayedCamera]);

  const cancelCameraIntent = useCallback(() => {
    stopFollowChase();
  }, [stopFollowChase]);

  const currentCameraBase = useCallback(() => (
    displayCameraRef.current ?? cameraRef.current ?? cameraIntentRef.current.targetCamera
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

  // An explicitly requested Observe sequence returns to its starting framing.
  const tourReturnCamera = useCallback((tour: { returnPose: ReturnType<typeof observeTourPoseFromCamera>; returnToRest: boolean }) => {
    const viewport = framingViewport();
    return tour.returnToRest
      ? defaultCamera({ height: viewport.y, map: world.map, width: viewport.x })
      : observeTourPoseToCamera(tour.returnPose, viewport, world.map);
  }, [framingViewport, world.map]);

  const selectedFollowTile = useCallback((
    entity: WorldSelectableEntity,
    shipMotionSamples: ReadonlyMap<string, ShipMotionSample>,
  ): ScreenPoint => (
    resolveSelectedFollowTile?.(entity, shipMotionSamples)
    ?? entity.tile
  ), [resolveSelectedFollowTile]);

  const queueCameraTarget = useCallback((targetCamera: IsoCamera, mode: CameraIntentMode) => {
    if (cameraModeCancelsFollow(mode)) stopFollowChase();
    shotGlideRef.current = null;
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


  /**
   * W1.7: glide from the shown view onto `target` on the smootherstep clock.
   * `seconds` fixes the length (the lighthouse look-up); otherwise it follows
   * the screen travel (`selectionGlideSeconds`) times `scale`, and never runs
   * shorter than `minimumSeconds`. Reduced motion, an unmeasured canvas or no
   * travel cut straight to the target and open the panel.
   */
  const startShotGlide = useCallback((target: IsoCamera, mode: "selection" | "selection-return", options: {
    seconds?: number;
    scale?: number;
    minimumSeconds?: number;
    waypoints?: readonly WorldPoint[];
  } = {}): number => {
    const display = displayCameraRef.current ?? cameraRef.current;
    const viewport = framingViewport();
    if (!display || reducedMotion || viewport.x <= 0 || viewport.y <= 0 || sameCamera(display, target)) {
      applyCameraImmediately(target);
      return 0;
    }
    const seconds = options.seconds ?? Math.max(
      options.minimumSeconds ?? 0,
      selectionGlideSeconds(glidePathPixels(
        cameraView(display, viewport, { breath: false }),
        cameraView(target, viewport, { breath: false }),
        viewport,
      )),
    ) * (options.scale ?? 1);
    shotGlideRef.current = {
      glide: createShotGlide({ ...(options.waypoints ? { waypoints: options.waypoints } : {}), durationSeconds: seconds, from: display, to: target, viewport }),
      startMs: null,
    };
    cameraIntentRef.current = { lastFrameTime: null, mode, targetCamera: target };
    requestWorldFrame();
    return seconds;
  }, [applyCameraImmediately, cameraRef, framingViewport, reducedMotion, requestWorldFrame]);

  const focusSelection = useCallback((subject: CameraSelectionSubject): IsoCamera | null => {
    stopFollowChase();
    const start = displayCameraRef.current ?? cameraRef.current;
    const viewport = framingViewport();
    if (!start || viewport.x <= 0 || viewport.y <= 0) return start;
    if (strollIndexRef.current !== null && !selectionFromStationRef.current) {
      stationPoseRef.current = start;
      selectionFromStationRef.current = true;
    }
    const target = subject.kind === "lighthouse"
      ? lighthouseLookUpCamera(start, viewport)
      : selectionShot(subject, viewport, {
        currentCamera: start,
        pathClear: (view) => strollPathClear(cameraView(start, viewport, { breath: false }), view),
      }).camera;
    if (!target) return start;
    selectionGlideSecondsRef.current = startShotGlide(target, "selection", subject.kind === "lighthouse" ? { seconds: LIGHTHOUSE_LOOK_UP_SECONDS } : {});
    return start;
  }, [cameraRef, framingViewport, startShotGlide, stopFollowChase]);

  const navigateStation = useCallback((direction: -1 | 1): { index: number; title: string } | null => {
    const viewport = framingViewport();
    if (viewport.x <= 0 || viewport.y <= 0 || !(displayCameraRef.current ?? cameraRef.current)) return null;
    const current = strollIndexRef.current;
    const index = current === null ? (direction === 1 ? 0 : GARDEN_POSTCARDS.length - 1) : (current + direction + GARDEN_POSTCARDS.length) % GARDEN_POSTCARDS.length;
    stopFollowChase();
    const card = GARDEN_POSTCARDS[index]!;
    const target = postcardCamera(card, { offsetX: 0, offsetY: 0, zoom: 1 }, viewport);
    const displayed = displayCameraRef.current ?? cameraRef.current!;
    const travel = Math.hypot(target.shot!.view.eye.x - cameraView(displayed, viewport, { breath: false }).eye.x, target.shot!.view.eye.z - cameraView(displayed, viewport, { breath: false }).eye.z);
    startShotGlide(target, "selection", {
      waypoints: strollWaypoints(current, index),
      seconds: Math.min(STROLL_GLIDE_MAX_SECONDS, STROLL_GLIDE_MIN_SECONDS + travel / STROLL_GLIDE_UNITS_PER_SECOND),
    });
    strollIndexRef.current = index;
    setStrollIndex(index);
    stationPoseRef.current = target;
    selectionFromStationRef.current = false;
    return { index, title: card.title };
  }, [cameraRef, framingViewport, startShotGlide, stopFollowChase]);

  const strollNext = useCallback(() => navigateStation(1), [navigateStation]);
  const strollPrevious = useCallback(() => navigateStation(-1), [navigateStation]);

  // DEV-only synchronous capture controls share the exact production route.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const host = window as typeof window & { __pharosVilleStroll?: { station: (id: string) => boolean; pathProgress: (progress: number) => boolean } };
    const api = {
      station: (id: string): boolean => {
        const index = GARDEN_POSTCARDS.findIndex((card) => card.id === id);
        const viewport = framingViewport();
        if (index < 0 || viewport.x <= 0 || viewport.y <= 0) return false;
        const previous = (index + GARDEN_POSTCARDS.length - 1) % GARDEN_POSTCARDS.length;
        const from = postcardCamera(GARDEN_POSTCARDS[previous]!, { offsetX: 0, offsetY: 0, zoom: 1 }, viewport);
        const to = postcardCamera(GARDEN_POSTCARDS[index]!, { offsetX: 0, offsetY: 0, zoom: 1 }, viewport);
        captureGlideRef.current = createShotGlide({ from, to, viewport, waypoints: strollWaypoints(previous, index), durationSeconds: 4, holdSeconds: 0 });
        strollIndexRef.current = index;
        setStrollIndex(index);
        stationPoseRef.current = to;
        selectionFromStationRef.current = false;
        applyCameraImmediately(to);
        return true;
      },
      pathProgress: (progress: number): boolean => {
        const glide = captureGlideRef.current;
        if (!glide || !Number.isFinite(progress) || progress < 0 || progress > 1) return false;
        applyCameraImmediately(sampleShotGlide(glide, progress * glide.durationSeconds).camera);
        return true;
      },
    };
    host.__pharosVilleStroll = api;
    return () => { if (host.__pharosVilleStroll === api) delete host.__pharosVilleStroll; };
  }, [applyCameraImmediately, framingViewport]);

  const applyLocalGesture = useCallback((next: IsoCamera) => {
    stopFollowChase();
    stationPoseRef.current = next;
    applyCameraImmediately(next);
  }, [applyCameraImmediately, stopFollowChase]);

  const returnFromSelection = useCallback((targetCamera: IsoCamera) => {
    // The chase ends with the selection; drop it here, without freezing, so
    // the selection-change effect finds nothing left to stop and keeps this glide.
    followChaseDetailIdRef.current = null;
    followShotRef.current = null;
    const viewport = framingViewport();
    const local = stationPoseRef.current ?? targetCamera;
    const target = strollIndexRef.current !== null
      ? local
      : cameraAtRest(targetCamera) && viewport.x > 0 && viewport.y > 0
        ? settleCamera(targetCamera, viewport, world.map)
        : targetCamera;
    startShotGlide(target, "selection-return", {
      minimumSeconds: selectionGlideSecondsRef.current,
      scale: SELECTION_RETURN_GLIDE_SCALE,
    });
    selectionGlideSecondsRef.current = 0;
    selectionFromStationRef.current = false;
  }, [framingViewport, startShotGlide, world.map]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvasRectRef.current = rect;
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));
      const deviceRequestedDpr = Math.max(1, window.devicePixelRatio || 1);
      // The governor starts at the device's own density and may earn up to
      // the supersample ceiling on a DPR-1 display (W8.1).
      maximumRequestedDprRef.current = resolveMaximumRequestedDpr(deviceRequestedDpr);
      if (!adaptiveDprInitializedRef.current) {
        adaptiveDprStateRef.current = initialAdaptiveDprState(deviceRequestedDpr);
        adaptiveDprInitializedRef.current = true;
      } else if (adaptiveDprStateRef.current.requestedDpr > maximumRequestedDprRef.current) {
        adaptiveDprStateRef.current = {
          ...adaptiveDprStateRef.current,
          requestedDpr: maximumRequestedDprRef.current,
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
      const glide = shotGlideRef.current;
      // A same-size notification (the observer's first callback) must not cut a glide short.
      if (glide && samePoint(canvasSizeRef.current, nextCanvasSize)) return;
      setCanvasSize((previous) => samePoint(previous, nextCanvasSize) ? previous : nextCanvasSize);
      // Interrupt at the displayed pose, never teleport to an unseen destination.
      const previousCamera = displayCameraRef.current ?? cameraRef.current ?? currentCameraBase();
      const station = strollIndexRef.current;
      const nextCamera = previousCamera
        ? resizeCamera(previousCamera, nextCanvasSize, world.map)
        : defaultCamera({ width: cssWidth, height: cssHeight, map: world.map });
      if (stationPoseRef.current && station !== null) {
        stationPoseRef.current = resizeCamera(stationPoseRef.current, nextCanvasSize, world.map);
      }
      applyCameraImmediately(nextCamera);
      if (followChaseDetailIdRef.current) requestWorldFrame();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [applyCameraImmediately, cameraRef, canvasSizeRef, currentCameraBase, requestWorldFrame, world.map]);

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
    // A grab interrupts travel at the displayed pose, not its destination.
    stopFollowChase();
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
  }, [canvasPoint, stopFollowChase]);

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
          // The water under the previous midpoint follows the fingers to the
          // new one while the spread zooms. N1: same viewport-derived zoom
          // floor as the wheel and toolbar paths, so pinch cannot pull back
          // past the world either.
          const station = strollIndexRef.current;
          if (station !== null && !hasSelection()) {
            const card = GARDEN_POSTCARDS[station]!;
            const zoomed = zoomStationCamera(previous, previousPinch.midpoint, scale, canvasSizeRef.current, card);
            applyLocalGesture(panStationCamera(zoomed, previousPinch.midpoint, pinch.midpoint, canvasSizeRef.current, card));
          } else {
            queueCameraTarget(zoomCameraOnGround(previous, previousPinch.midpoint, previous.zoom * scale, { map: world.map, viewport: canvasSizeRef.current }, pinch.midpoint), "pinch");
          }
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
          // W1.1 ground-plane drag: the water under the pointer stays under it.
          const station = strollIndexRef.current;
          if (station !== null && !hasSelection()) {
            applyLocalGesture(panStationCamera(previous, drag.last, point, canvasSizeRef.current, GARDEN_POSTCARDS[station]!));
          } else {
            queueCameraTarget(panCameraOnGround(previous, drag.last, point, { map: world.map, viewport: canvasSizeRef.current }), "drag");
          }
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
  }, [applyLocalGesture, canvasPoint, currentCameraBase, hasSelection, queueCameraTarget, scheduleHoverUpdate, world.map]);

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
      const station = strollIndexRef.current;
      if (station !== null && !hasSelection()) {
        applyLocalGesture(zoomStationCamera(previous, canvasPoint(event), wheelZoomScaleFromDelta(event.deltaY, event.deltaMode, canvasSizeRef.current.y), canvasSizeRef.current, GARDEN_POSTCARDS[station]!));
        return;
      }
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
  }, [applyLocalGesture, canvasPoint, canvasSizeRef, currentCameraBase, hasSelection, queueCameraTarget, world.map]);

  const handleToolbarPan = useCallback((delta: ScreenPoint) => {
    const previous = currentCameraBase();
    if (!previous) return;
    const station = strollIndexRef.current;
    const viewport = canvasSizeRef.current;
    const centre = { x: viewport.x / 2, y: viewport.y / 2 };
    if (station !== null && !hasSelection()) applyLocalGesture(panStationCamera(previous, centre, { x: centre.x + delta.x, y: centre.y + delta.y }, viewport, GARDEN_POSTCARDS[station]!));
    else queueCameraTarget(panFromCentre(previous, delta, viewport, world.map), "toolbar");
  }, [applyLocalGesture, canvasSizeRef, currentCameraBase, hasSelection, queueCameraTarget, world.map]);

  const handleResetView = useCallback(() => {
    const viewport = canvasSizeRef.current;
    if (viewport.x <= 0 || viewport.y <= 0) return;
    stopFollowChase();
    const origin = strollIndexRef.current;
    strollIndexRef.current = null;
    setStrollIndex(null);
    stationPoseRef.current = null;
    selectionFromStationRef.current = false;
    const next = defaultCamera({ height: viewport.y, map: world.map, width: viewport.x });
    startShotGlide(next, "selection-return", { waypoints: strollWaypoints(origin, null), seconds: STROLL_GLIDE_MAX_SECONDS });
  }, [canvasSizeRef, startShotGlide, stopFollowChase, world.map]);

  const handleToolbarZoomIn = useCallback(() => {
    const previous = currentCameraBase();
    if (!previous) return;
    const station = strollIndexRef.current;
    const viewport = canvasSizeRef.current;
    if (station !== null && !hasSelection()) applyLocalGesture(zoomStationCamera(previous, { x: viewport.x / 2, y: viewport.y / 2 }, 1.1, viewport, GARDEN_POSTCARDS[station]!));
    else queueCameraTarget(zoomIn(previous, viewport, world.map), "toolbar");
  }, [applyLocalGesture, canvasSizeRef, currentCameraBase, hasSelection, queueCameraTarget, world.map]);

  const handleToolbarZoomOut = useCallback(() => {
    const previous = currentCameraBase();
    if (!previous) return;
    const station = strollIndexRef.current;
    const viewport = canvasSizeRef.current;
    if (station !== null && !hasSelection()) applyLocalGesture(zoomStationCamera(previous, { x: viewport.x / 2, y: viewport.y / 2 }, 1 / 1.1, viewport, GARDEN_POSTCARDS[station]!));
    else queueCameraTarget(zoomOut(previous, viewport, world.map), "toolbar");
  }, [applyLocalGesture, canvasSizeRef, currentCameraBase, hasSelection, queueCameraTarget, world.map]);

  const stepCamera = useCallback((now: number, shipMotionSamples: ReadonlyMap<string, ShipMotionSample>): CameraStepResult => {
    const displayCamera = displayCameraRef.current ?? cameraRef.current;
    if (!displayCamera) {
      cameraIntentRef.current = { lastFrameTime: null, mode: "idle", targetCamera: null };
      return { camera: null, cameraChanged: false, cameraIntentActive: false };
    }


    // Observe 2.0: the tour owns the camera while it runs. Sampling is a pure
    // function of the elapsed clock — no damping, no state to drift.
    const activeTour = observeTourRef.current;
    if (activeTour && !reducedMotion) {
      if (activeTour.startMs === null) {
        activeTour.startMs = now;
        activeTour.restLeft = displayCamera.rest;
      }
      const elapsedSeconds = Math.max(0, (now - activeTour.startMs) / 1000);
      if (elapsedSeconds >= activeTour.tour.totalSeconds) {
        // Natural end: glide back to the visitor's framing and fall through
        // to the ordinary intent path, which runs that glide below.
        observeTourRef.current = null;
        queueCameraTarget(tourReturnCamera(activeTour), "reset");
        activeTour.onBeatChange?.(null);
      } else {
        const pose = observeSampleRef.current;
        sampleObserveTour(activeTour.tour, elapsedSeconds, pose);
        if (pose.beatIndex !== activeTour.lastBeatIndex) {
          activeTour.lastBeatIndex = pose.beatIndex;
          activeTour.onBeatChange?.(pose.beatIndex);
        }
        const viewport = canvasSizeRef.current;
        const sampledCamera = observeTourPoseToCamera(pose, viewport, world.map);
        // W1.0: a tour that leaves the rest seat eases off it like any hand-off.
        const restLeft = activeTour.restLeft;
        const presence = restLeft ? restLeft.presence - elapsedSeconds / REST_HAND_OFF_SECONDS : 0;
        const nextCamera = restLeft && presence > 0
          ? { ...sampledCamera, rest: { presence, view: restLeft.view } }
          : sampledCamera;
        const cameraChanged = !sameCamera(displayCamera, nextCamera);
        commitCameraState(nextCamera);
        return { camera: nextCamera, cameraChanged, cameraIntentActive: true };
      }
    }

    if (reducedMotion) {
      // Reduced motion has no tour: the DOM steps beats by hand. Drop any
      // tour that was mid-flight when the preference flipped.
      observeTourRef.current = null;
      shotGlideRef.current = null;
      const targetCamera = cameraIntentRef.current.targetCamera;
      if (!targetCamera) {
        cameraIntentRef.current = { lastFrameTime: null, mode: "idle", targetCamera: displayCamera };
        return { camera: displayCamera, cameraChanged: false, cameraIntentActive: false };
      }
      cameraIntentRef.current = { lastFrameTime: null, mode: "idle", targetCamera };
      if (sameCamera(displayCamera, targetCamera)) {
        return { camera: displayCamera, cameraChanged: false, cameraIntentActive: false };
      }
      commitCameraState(targetCamera);
      return { camera: targetCamera, cameraChanged: true, cameraIntentActive: false };
    }

    // Selection/return glides sample the shared clock; DOM facts are already visible.
    const glideState = shotGlideRef.current;
    if (glideState) {
      if (glideState.startMs === null) glideState.startMs = now;
      const sampled = sampleShotGlide(glideState.glide, (now - glideState.startMs) / 1000);
      const cameraChanged = !sameCamera(displayCamera, sampled.camera);
      commitCameraState(sampled.camera);
      if (!sampled.done) return { camera: sampled.camera, cameraChanged, cameraIntentActive: true };
      shotGlideRef.current = null;
      cameraIntentRef.current = { lastFrameTime: null, mode: "idle", targetCamera: sampled.camera };
      return { camera: sampled.camera, cameraChanged, cameraIntentActive: false };
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
        cameraIntentRef.current = {
          lastFrameTime: cameraIntentRef.current.mode === "follow-selected"
            ? cameraIntentRef.current.lastFrameTime
            : null,
          mode: "follow-selected",
          // Follow inherits the selection's composition: a composed shot
          // translates with the ship; a rig keeps the ship on the same anchor.
          targetCamera: (followShotRef.current && followShotCamera(followShotRef.current, sampledTile, viewport, world.map))
            ?? voyageCamera(displayCamera, sampledTile, viewport, world.map, sample?.velocity),
        };
        if (sample?.state === "moored" || sample?.state === "idle") {
          // Keep the final berth target, letting ordinary damping ease out.
          followChaseDetailIdRef.current = null;
        }
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
      return { camera: advanced.camera, cameraChanged, cameraIntentActive: false };
    }

    cameraIntentRef.current = {
      ...cameraIntentRef.current,
      lastFrameTime: now,
    };
    return { camera: advanced.camera, cameraChanged, cameraIntentActive: true };
  }, [cameraRef, canvasSizeRef, commitCameraState, queueCameraTarget, reducedMotion, selectedDetailIdRef, selectedEntityRef, selectedFollowTile, stopFollowChase, tourReturnCamera, world.map]);

  const handleFollowSelected = useCallback(() => {
    if (!selectedEntity) return;
    // A follow pressed mid-glide starts from the shot the glide was composing.
    const glideTarget = shotGlideRef.current?.glide.to ?? null;
    stopFollowChase();
    const sampledTile = selectedFollowTile(selectedEntity, shipMotionSamplesRef.current);
    const start = glideTarget ?? currentCameraBase();
    if (!start) return;
    const viewport = framingViewport();
    const shotReference = selectedEntity.kind === "ship" && start.shot?.subject && start.shot.presence >= 1 ? start : null;
    followShotRef.current = shotReference;
    const target = selectedEntity.kind === "ship"
      ? (shotReference && followShotCamera(shotReference, sampledTile, viewport, world.map))
        ?? voyageCamera(start, sampledTile, viewport, world.map, shipMotionSamplesRef.current.get(selectedEntity.id)?.velocity)
      : followTile({ camera: start, map: world.map, tile: sampledTile, viewport });
    if (reducedMotion) {
      applyCameraImmediately(target);
      return;
    }
    if (selectedEntity.kind === "ship" && selectedDetailId) {
      followChaseDetailIdRef.current = selectedDetailId;
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
      restLeft: undefined,
      returnPose,
      returnToRest: cameraAtRest(startCamera),
      startMs: null,
      tour: buildObserveTour({
        keyframes,
        start: returnPose,
      }),
    };
    requestWorldFrame();
  }, [cameraRef, framingViewport, reducedMotion, requestWorldFrame, stopFollowChase]);

  const stopObserveTour = useCallback((options?: { easeBack?: boolean }) => {
    const active = observeTourRef.current;
    if (!active) return;
    observeTourRef.current = null;
    if (options?.easeBack) {
      // The natural end: hand the framing back with the ordinary damped
      // command glide — the same blend every camera command uses.
      queueCameraTarget(tourReturnCamera(active), "reset");
      return;
    }
    freezeDisplayedCamera();
  }, [freezeDisplayedCamera, queueCameraTarget, tourReturnCamera]);

  useEffect(() => {
    if (lastSelectedDetailIdRef.current !== selectedDetailId) {
      // The world may have queued its new selection dolly in a layout effect.
      // Only cancel an existing chase/tour, not that newer selection intent.
      if (followChaseDetailIdRef.current || observeTourRef.current) stopFollowChase();
      lastSelectedDetailIdRef.current = selectedDetailId;
    }
  }, [selectedDetailId, stopFollowChase]);

  useEffect(() => {
    if (!reducedMotion) return;
    const targetCamera = cameraIntentRef.current.targetCamera;
    // Reduced motion is an external preference: parking the tour (and any
    // postcard's index) once is not a render-derived cascade.
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
      if (hasSelection()) {
        stopFollowChase();
        onClearSelection();
      } else {
        stopFollowChase();
      }
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
      handleToolbarPan(deltas[event.key]!);
    }
  }, [currentCameraBase, handleToolbarPan, handleToolbarZoomIn, handleToolbarZoomOut, hasSelection, onClearSelection, stopFollowChase]);

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
    startObserveTour,
    stopObserveTour,
    stepCamera,
    strollNext,
    strollPrevious,
    strollIndex,
  };
}

function isInteractiveEventTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    && Boolean(target.closest("a, button, input, select, textarea, summary, [role='button']"));
}
