"use client";
import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { AccessibilityLedger, type ShipRiskTransitionEntry } from "./components/accessibility-ledger";
import { DetailPanel } from "./components/detail-panel";
import { HarborLog } from "./components/harbor-log";
import { QuickFind } from "./components/quick-find";
import { SinceLastVisitBanner } from "./components/since-last-visit";
import { WorldControls } from "./components/world-controls";
import { WorldStaticOverview } from "./components/world-static-overview";
import { PHAROSVILLE_LATEST_VERSION } from "./content/pharosville-version";
import { isDebugChromeEnabled } from "./lib/pharosville-debug";
import { useShipLogoAssets } from "./hooks/use-ship-logo-assets";
import { useChangelogDialog } from "./hooks/use-changelog-dialog";
import { useLegendDialog } from "./hooks/use-legend-dialog";
import { useCanvasResizeAndCamera } from "./hooks/use-canvas-resize-and-camera";
import { useHarborLog } from "./hooks/use-harbor-log";
import { useGardenAlmanac } from "./hooks/use-garden-almanac";
import { HOVER_NAMEPLATE_DWELL_MS } from "./hooks/hover-nameplate-dwell";
import { isDialogEventTarget } from "./hooks/keyboard-event-target";
import { useLatestRef } from "./hooks/use-latest-ref";
import { useLiveTitle } from "./hooks/use-live-title";
import { useMomentUrl } from "./hooks/use-moment-url";
import { useRecentWorldInput } from "./hooks/use-recent-world-input";
import { useVisitSnapshot } from "./hooks/use-visit-snapshot";
import { detailAnchorForPoint, useWorldKeyboardTargets } from "./hooks/use-world-keyboard-targets";
import { useWorldRenderLoop } from "./hooks/use-world-render-loop";
import { useWorldSelection, resolveSelectedDetail } from "./hooks/use-world-selection";
import {
  sessionHourAnnouncement,
  useWorldTimeControls,
  WORLD_TIME_NUDGE_HOUR,
} from "./hooks/use-world-time-controls";
import { useWorldUrlState } from "./hooks/use-world-url-state";
import { createGardenObservatoryHitTargetSnapshot } from "./renderer/garden-observatory-hit-testing";
import type { HitTarget, HitTargetSnapshot } from "./renderer/hit-testing";
import { clampCameraToMap } from "./systems/camera";
import {
  resolveGardenEntityDisplayTile,
  selectGardenObservatorySlice,
} from "./systems/garden-observatory-slice";
import { buildBaseMotionPlan, disposePathCacheForMap, motionPlanSignature, type ShipMotionSample } from "./systems/motion";
import { buildObserveSequence, type ObserveBeatKind } from "./systems/observe-sequence";
import type { ObserveTourKeyframe } from "./systems/observe-tour";
import { GARDEN_ATTRACT_IDLE_MS, gardenAttractKeyframes } from "./systems/garden-attract";
import { buildQuickFindCandidates } from "./systems/quick-find-match";
import { recentFleetTrendSummary } from "./systems/sea-state";
import { tileToIso, type IsoCamera, type ScreenPoint } from "./systems/projection";
import type { WorldSelectableEntity } from "./systems/world-types";
import { observeReducedMotion } from "./systems/reduced-motion";
import type { PharosVilleWorld as PharosVilleWorldModel } from "./systems/world-types";
import { GARDEN_ARRIVAL_CROSSFADE_MS } from "./systems/garden-arrival";

const LazyChangelogPanel = lazy(() => (
  import("./components/changelog-panel").then((module) => ({ default: module.ChangelogPanel }))
));

const LazyLegendPanel = lazy(() => (
  import("./components/legend-panel").then((module) => ({ default: module.LegendPanel }))
));

const LazyHarborLedgerPanel = lazy(() => (
  import("./components/harbor-ledger-panel").then((module) => ({ default: module.HarborLedgerPanel }))
));

const DATA_REFRESH_ANNOUNCEMENT_THROTTLE_MS = 30_000;
/**
 * Observe 2.0 (Phase 4): dolly zoom per beat kind. The monument holds a wide
 * tableaux; individual hulls and quays push in close. All stay inside the
 * interactive zoom ladder (the tour sampler clamps to it regardless).
 */
const OBSERVE_TOUR_KIND_ZOOM: Record<ObserveBeatKind, number> = {
  lighthouse: 0.84,
  risk: 1.08,
  supply: 1.08,
  concentration: 0.94,
};
/**
 * How long the charting veil takes to lift once the harbor has data. Long
 * enough to carry the scene rebuild that lands in the next frames, short
 * enough that arrival still reads as arrival.
 */
export const HARBORMASTER_NOTE_STORAGE_KEY = "pharosville.harbor-note.dismissed";

function harbormasterNoteAvailable(): boolean {
  try {
    return window.localStorage.getItem(HARBORMASTER_NOTE_STORAGE_KEY) !== "1";
  } catch {
    return false;
  }
}

function PharosVilleWorldInner({ world }: { world: PharosVilleWorldModel }) {
  const [reducedMotion, setReducedMotion] = useState(true);
  const [motionPreferenceResolved, setMotionPreferenceResolved] = useState(false);
  const shellRef = useRef<HTMLElement | null>(null);
  // Holds the faint world controls; `useRecentWorldInput` flags it after any
  // camera input so they surface for a beat without a re-render.
  const chromeRef = useRef<HTMLDivElement | null>(null);
  useRecentWorldInput(chromeRef);
  const requestWorldFrameRef = useRef<() => void>(() => {});
  const requestWorldFrame = useCallback(() => {
    requestWorldFrameRef.current();
  }, []);

  const mountEpochMsRef = useRef(0);
  useEffect(() => {
    mountEpochMsRef.current = performance.now();
  }, []);

  const [motionBucket, setMotionBucket] = useState(0);
  const worldUrlState = useWorldUrlState({ world });
  // S1: no default selection at all, so there is nothing to defer around the
  // first-visit legend any more. A `sel=` permalink still selects on arrival.
  const selection = useWorldSelection({
    initialSelectedDetailId: worldUrlState.initialState.selectedDetailId,
    world,
  });
  const {
    announcement,
    clearSelection,
    hoveredDetailId,
    keyboardFocusedDetailId,
    selectDetail,
    selectedDetailAnchor,
    selectedDetailId,
    selectedEntity,
    setAnnouncement,
    setHoveredDetailId,
    setKeyboardFocusedDetailId,
  } = selection;
  const [panelReadyDetailId, setPanelReadyDetailId] = useState<string | null>(() => (
    worldUrlState.initialState.followSelectedDetailId ? null : selectedDetailId
  ));
  const changelog = useChangelogDialog({ setAnnouncement });
  const legend = useLegendDialog({ setAnnouncement });
  const [quickFindOpen, setQuickFindOpen] = useState(false);
  // The harbor ledger keeps its state here rather than in a dialog hook of its
  // own because the sr-only ledger and the visible panel are one component:
  // the shell has to pick which of the two is mounted, so it owns the switch.
  const [harborLedgerOpen, setHarborLedgerOpen] = useState(false);
  // The legend, changelog and harbor ledger are the true modal overlays; keep
  // at most one open so screen readers never see concurrent aria-modal
  // dialogs, and drop the quick-find field rather than leave it focusable
  // behind one.
  const openLegendExclusive = useCallback(() => {
    if (changelog.changelogOpen) changelog.closeChangelog();
    setQuickFindOpen(false);
    setHarborLedgerOpen(false);
    legend.openLegend();
  }, [changelog, legend]);
  const openChangelogExclusive = useCallback(() => {
    if (legend.legendOpen) legend.closeLegend();
    setQuickFindOpen(false);
    setHarborLedgerOpen(false);
    changelog.openChangelog();
  }, [changelog, legend]);
  const openHarborLedgerExclusive = useCallback(() => {
    if (changelog.changelogOpen) changelog.closeChangelog();
    if (legend.legendOpen) legend.closeLegend();
    setQuickFindOpen(false);
    setHarborLedgerOpen(true);
    setAnnouncement("Opened harbor ledger.");
  }, [changelog, legend, setAnnouncement]);
  const closeHarborLedger = useCallback(() => {
    setHarborLedgerOpen(false);
    setAnnouncement("Closed harbor ledger.");
  }, [setAnnouncement]);
  useEffect(() => {
    if (!harborLedgerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeHarborLedger();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeHarborLedger, harborLedgerOpen]);
  const visitSnapshot = useVisitSnapshot({ world, setAnnouncement });
  const timeControls = useWorldTimeControls({
    initialManualTimeOverrideHour: worldUrlState.initialState.manualTimeOverrideHour,
    initialNightMode: worldUrlState.initialState.nightMode,
    requestPaint: requestWorldFrame,
  });
  const gardenAlmanac = useGardenAlmanac({
    reducedMotion,
    wallClockHour: timeControls.wallClockHour,
  });
  useLiveTitle(world);

  const previousDataRefreshSnapshotRef = useRef<WorldDataRefreshSnapshot | null>(null);
  const lastDataRefreshAnnouncementRef = useRef<{ key: string; announcedAt: number } | null>(null);
  useEffect(() => {
    const currentSnapshot = worldDataRefreshSnapshot(world);
    const previousSnapshot = previousDataRefreshSnapshotRef.current;
    previousDataRefreshSnapshotRef.current = currentSnapshot;
    if (!previousSnapshot) return;

    const message = worldDataRefreshAnnouncement(previousSnapshot, currentSnapshot);
    if (!message) return;

    const lastAnnouncement = lastDataRefreshAnnouncementRef.current;
    if (lastAnnouncement?.key === currentSnapshot.key) return;

    const now = Date.now();
    const freshnessChanged = previousSnapshot.staleSourceKey !== currentSnapshot.staleSourceKey;
    if (
      !freshnessChanged
      && lastAnnouncement
      && now - lastAnnouncement.announcedAt < DATA_REFRESH_ANNOUNCEMENT_THROTTLE_MS
    ) {
      lastDataRefreshAnnouncementRef.current = {
        key: currentSnapshot.key,
        announcedAt: lastAnnouncement.announcedAt,
      };
      return;
    }

    lastDataRefreshAnnouncementRef.current = {
      key: currentSnapshot.key,
      announcedAt: now,
    };
    setAnnouncement(message);
  }, [setAnnouncement, world]);

  // Memoize on a content signature instead of `world` identity so live data
  // refetches that don't change ship/dock/map fields reuse
  // the prior plan (and skip A* warmups). `world` is still passed to the
  // builder; the signature only gates re-memo.
  const baseMotionPlanSignature = motionPlanSignature(world);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseMotionPlan = useMemo(() => buildBaseMotionPlan(world, motionBucket * 600), [baseMotionPlanSignature, motionBucket]);
  const motionPlan = baseMotionPlan;
  const shipsById = useMemo(() => new Map(world.ships.map((ship) => [ship.id, ship])), [world.ships]);
  const shipCounterLabel = useMemo(() => fleetCounterLabel(world.ships), [world.ships]);
  const recentFleetTrend = useMemo(() => recentFleetTrendSummary(world), [world]);
  // W5.01 — derive the live risk-band tack-out per ship from the motion plan
  // at world-refresh cadence. The detail panel and accessibility ledger both
  // consume this; progress is a synthetic in-transit marker (the actual
  // per-frame progress lives on the sample, but world-refresh cadence is
  // acceptable per followup plan §5 W5.01). When the motion plan re-runs
  // without `previousRiskTile`, the entry drops out and the row hides.
  const riskTransitionByShipId = useMemo(() => {
    const map = new Map<string, ShipRiskTransitionEntry>();
    for (const route of motionPlan.shipRoutes.values()) {
      if (!route.previousRiskTile || !route.previousRiskLabel) continue;
      const ship = shipsById.get(route.shipId);
      if (!ship) continue;
      if (ship.riskWaterLabel === route.previousRiskLabel) continue;
      map.set(route.shipId, {
        fromLabel: route.previousRiskLabel,
        toLabel: ship.riskWaterLabel,
        progress: 0,
      });
    }
    return map;
  }, [motionPlan, shipsById]);
  const selectedDetail = useMemo(() => resolveSelectedDetail({
    riskTransitionByShipId,
    selectedDetailId,
    world,
  }), [riskTransitionByShipId, selectedDetailId, world]);
  const harborLog = useHarborLog({ riskTransitionByShipId, setAnnouncement, shipsById });

  // Refs that mirror frequently-changing state so hook-internal effects/RAF can
  // read the latest values without rebinding on every hover/select/motionPlan
  // change. Updated synchronously during render via `useLatestRef` so they
  // stay coherent without an extra sync effect (and survive StrictMode
  // double-invokes).
  const hoveredDetailIdRef = useLatestRef(hoveredDetailId);
  const selectedDetailIdRef = useLatestRef(selectedDetailId);
  const motionPlanRef = useLatestRef(motionPlan);
  const hoverTooltipElRef = useRef<HTMLDivElement | null>(null);

  // Hover tooltip content: a glanceable title + one-line reading for the
  // hovered entity. Hidden for the selected entity (the detail panel already
  // covers it) and skipped entirely when nothing is hovered. Position is
  // written by the render loop (style.transform), not React.
  const hoverTooltip = useMemo(() => {
    if (!hoveredDetailId || hoveredDetailId === selectedDetailId) return null;
    const detail = world.detailIndex[hoveredDetailId];
    if (!detail) return null;
    const entity = world.entityById[hoveredDetailId];
    const meta = entity?.kind === "ship" && entity.visual?.sizeLabel && entity.riskWaterLabel
      ? `${entity.visual.sizeLabel} · ${entity.riskWaterLabel}`
      : detail.kind;
    return { title: detail.title, meta };
  }, [hoveredDetailId, selectedDetailId, world]);

  // Cross-hook shared refs: filled by the render loop, read by the canvas
  // hook (for hover/select hit-testing) and by the recompute callback.
  const hitTargetSnapshotRef = useRef<HitTargetSnapshot | null>(null);
  const hitTargetsRef = useRef<readonly HitTarget[]>([]);
  const seaSignScaleRef = useRef<number | null>(null);
  const shipMotionSamplesRef = useRef<ReadonlyMap<string, ShipMotionSample>>(new Map());

  // `recomputeHitTargets` is a stable wrapper that reads through this ref so
  // the canvas hook's pointer handlers can call it without depending on hook
  // ordering (the render-loop hook is bound after the canvas hook).
  const recomputeHitTargetsRef = useRef<() => HitTargetSnapshot | null>(() => null);
  const recomputeHitTargets = useCallback((): HitTargetSnapshot | null => recomputeHitTargetsRef.current(), []);

  const shipLogoAssets = useShipLogoAssets({ world });

  const handleSelectTarget = useCallback((target: HitTarget, point: ScreenPoint, viewport: ScreenPoint) => {
    selectDetail(target.detailId, detailAnchorForPoint(target.anchor ?? point, viewport));
  }, [selectDetail]);

  // Deep link → select → follow. `handleFollowSelected` reads the committed
  // `selectedEntity`, so the follow fires from the effect below once the
  // linked ship's selection has actually landed.
  const pendingFollowDetailIdRef = useRef<string | null>(null);

  useEffect(() => {
    const detailId = worldUrlState.initialState.followSelectedDetailId;
    if (!detailId) return;
    pendingFollowDetailIdRef.current = detailId;
    selectDetail(detailId, null);
  }, [selectDetail, worldUrlState.initialState.followSelectedDetailId]);

  useEffect(() => {
    const late = worldUrlState.lateResolvedSelection;
    if (!late) return;
    if (late.follow) pendingFollowDetailIdRef.current = late.detailId;
    selectDetail(late.detailId, null);
  }, [selectDetail, worldUrlState.lateResolvedSelection]);

  // selectedDetailIdRef omitted: ref identity never changes (HOOKS F4).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hasSelection = useCallback(() => selectedDetailIdRef.current !== null, []);

  const resolveSelectedFollowTile = useCallback((
    entity: WorldSelectableEntity,
    samples: ReadonlyMap<string, ShipMotionSample>,
  ): ScreenPoint | null => {
    return resolveGardenEntityDisplayTile({
      entity,
      shipMotionSamples: samples,
      slice: selectGardenObservatorySlice(world, entity.detailId),
    });
  }, [world]);

  const canvas = useCanvasResizeAndCamera({
    hasSelection,
    hitTargetSnapshotRef,
    hitTargetsRef,
    hoveredDetailIdRef,
    onClearSelection: clearSelection,
    onSelectTarget: handleSelectTarget,
    recomputeHitTargets,
    reducedMotion,
    resolveSelectedFollowTile,
    requestWorldFrame,
    selectedDetailIdRef,
    selectedEntity,
    setHoveredDetailId,
    shipMotionSamplesRef,
    world,
  });
  // Destructure the hook's stable JSX bindings once. Besides keeping the
  // canvas markup readable, this lets the refs rule distinguish those bindings
  // from real `.current` reads and remain enforced across the whole file.
  const {
    canvasRef: canvasElementRef,
    focusTile: focusCanvasTile,
    focusSelection: focusCanvasSelection,
    handlePointerCancel: handleCanvasPointerCancel,
    handlePointerDown: handleCanvasPointerDown,
    handlePointerLeave: handleCanvasPointerLeave,
    handlePointerMove: handleCanvasPointerMove,
    handlePointerUp: handleCanvasPointerUp,
    handleResetView: handleCanvasResetView,
    returnFromSelection: returnCanvasFromSelection,
  } = canvas;

  const selectionReturnCameraRef = useRef<IsoCamera | null>(null);
  const lastCameraSelectionRef = useRef<string | null>(selectedDetailId);
  const focusSelectedCamera = useCallback((detailId: string, entity: WorldSelectableEntity) => {
    const markPanelReady = () => setPanelReadyDetailId(detailId);
    const displayTile = resolveGardenEntityDisplayTile({
      entity,
      shipMotionSamples: shipMotionSamplesRef.current,
      slice: selectGardenObservatorySlice(world, detailId),
    });
    if (!displayTile || entity.kind !== "ship") {
      queueMicrotask(markPanelReady);
      return;
    }
    // Older renderer test doubles predate the W4.6 seam. They still exercise
    // selection correctly through the established focusTile command.
    if (typeof focusCanvasSelection !== "function") {
      focusCanvasTile(displayTile);
      queueMicrotask(markPanelReady);
      return;
    }
    const returnCamera = focusCanvasSelection(displayTile, markPanelReady);
    if (!selectionReturnCameraRef.current && returnCamera) {
      selectionReturnCameraRef.current = returnCamera;
    }
  }, [focusCanvasSelection, focusCanvasTile, shipMotionSamplesRef, world]);

  // W4.6: selecting a ship is itself the camera command. The layout effect
  // hides the panel before the browser paints the selection commit; its
  // callback reveals the panel only after the exponential dolly settles.
  useLayoutEffect(() => {
    const previous = lastCameraSelectionRef.current;
    if (previous === selectedDetailId) return;
    lastCameraSelectionRef.current = selectedDetailId;
    if (!selectedDetailId || !selectedEntity) {
      queueMicrotask(() => setPanelReadyDetailId(null));
      const returnCamera = selectionReturnCameraRef.current;
      selectionReturnCameraRef.current = null;
      if (returnCamera && typeof returnCanvasFromSelection === "function") {
        returnCanvasFromSelection(returnCamera);
      }
      return;
    }
    focusSelectedCamera(selectedDetailId, selectedEntity);
  }, [focusSelectedCamera, returnCanvasFromSelection, selectedDetailId, selectedEntity]);

  const restoredUrlCameraRef = useRef(false);
  const canvasWidth = canvas.canvasSize.x;
  const canvasHeight = canvas.canvasSize.y;
  const setCanvasCamera = canvas.setCamera;
  useEffect(() => {
    if (restoredUrlCameraRef.current) return;
    const urlCamera = worldUrlState.initialState.camera;
    if (!urlCamera || canvasWidth <= 0 || canvasHeight <= 0) return;
    restoredUrlCameraRef.current = true;
    setCanvasCamera(clampCameraToMap(urlCamera, {
      map: world.map,
      viewport: { x: canvasWidth, y: canvasHeight },
    }));
  }, [canvasHeight, canvasWidth, setCanvasCamera, world.map, worldUrlState.initialState.camera]);

  useEffect(() => {
    worldUrlState.replaceWorldUrlState({
      nightMode: timeControls.nightMode,
      timeHour: timeControls.wallClockHour,
    });
  }, [timeControls.nightMode, timeControls.wallClockHour, worldUrlState]);

  // Wire the late-bound recompute callbacks now that the canvas hook has
  // exposed its refs. We assign in a useEffect (not during render) so the
  // closures capture committed values only — this is rules-of-hooks-pure
  // under concurrent rendering and StrictMode double-invokes (HOOKS F1).
  // The pointer-handler call sites read through the wrapper useCallback that
  // dereferences `.current` lazily, so the one-effect-tick delay is invisible
  // to event handlers (canvas isn't ready until after first commit anyway).
  useEffect(() => {
    recomputeHitTargetsRef.current = (): HitTargetSnapshot | null => {
      const activeCamera = canvas.cameraRef.current;
      if (!activeCamera) return hitTargetSnapshotRef.current;
      const activeCanvasSize = canvas.canvasSizeRef.current;
      const snapshot = createGardenObservatoryHitTargetSnapshot({
        camera: activeCamera,
        hoveredDetailId: hoveredDetailIdRef.current,
        selectedDetailId: selectedDetailIdRef.current,
        seaSignScale: seaSignScaleRef.current,
        shipMotionSamples: shipMotionSamplesRef.current,
        viewport: { height: activeCanvasSize.y, width: activeCanvasSize.x },
        world,
      });
      hitTargetSnapshotRef.current = snapshot;
      hitTargetsRef.current = snapshot.targets;
      return snapshot;
    };
  }, [
    canvas.cameraRef,
    canvas.canvasSizeRef,
    hitTargetSnapshotRef,
    hitTargetsRef,
    hoveredDetailIdRef,
    selectedDetailIdRef,
    seaSignScaleRef,
    shipMotionSamplesRef,
    world,
  ]);

  const {
    frameRateFps,
    rendererWarmupReady,
    rendererStatus,
    requestPaint,
  } = useWorldRenderLoop({
    almanacEvent: gardenAlmanac.activeEvent,
    onBucketFlip: setMotionBucket,
    adaptiveDprStateRef: canvas.adaptiveDprStateRef,
    logoGeneration: shipLogoAssets.logoGeneration,
    logos: shipLogoAssets.logos,
    camera: canvas.camera,
    cameraRef: canvas.cameraRef,
    surfaceBudgetRef: canvas.surfaceBudgetRef,
    canvasRef: canvas.canvasRef,
    canvasSize: canvas.canvasSize,
    canvasSizeRef: canvas.canvasSizeRef,
    hitTargetSnapshotRef,
    hitTargetsRef,
    hoveredDetailId,
    hoveredDetailIdRef,
    hoverTooltipElRef,
    maximumRequestedDprRef: canvas.maximumRequestedDprRef,
    mountEpochMsRef,
    motionPlan,
    motionPlanRef,
    reducedMotion,
    selectedDetailAnchor,
    selectedDetailId,
    selectedDetailIdRef,
    seaSignScaleRef,
    shipMotionSamplesRef,
    shipsById,
    stepCamera: canvas.stepCamera,
    wallClockHour: timeControls.wallClockHour,
    world,
  });

  useEffect(() => {
    requestWorldFrameRef.current = requestPaint;
    return () => {
      if (requestWorldFrameRef.current === requestPaint) {
        requestWorldFrameRef.current = () => {};
      }
    };
  }, [requestPaint]);

  const observatorySlice = useMemo(() => selectGardenObservatorySlice(world, null), [world]);
  const observeSequence = useMemo(
    () => buildObserveSequence(world),
    [world],
  );
  const [observeIndex, setObserveIndex] = useState<number | null>(null);
  const rendererFailed = rendererStatus === "failed";
  const threeExperienceReady = rendererStatus === "ready";
  const observeBeat = threeExperienceReady && observeIndex !== null
    ? observeSequence[observeIndex] ?? null
    : null;
  const cancelCameraIntent = canvas.cancelCameraIntent;
  const focusTile = canvas.focusTile;

  const restoreMomentShip = useCallback((detailId: string, frameSelection: boolean) => {
    if (frameSelection) pendingFollowDetailIdRef.current = detailId;
    selectDetail(detailId, null);
  }, [selectDetail]);

  useMomentUrl({
    camera: canvas.camera,
    canvasSize: canvas.canvasSize,
    moveCameraTo: canvas.moveCameraTo,
    onRestoreShip: restoreMomentShip,
    ready: threeExperienceReady && motionPreferenceResolved && world.routeMode === "world",
    selectedDetailId,
    setCamera: canvas.setCamera,
    world,
  });

  const observingTour = observeIndex !== null && !reducedMotion && threeExperienceReady;
  const startObserveTour = canvas.startObserveTour;
  const stopObserveTour = canvas.stopObserveTour;
  const startAttractTour = canvas.startAttractTour;
  const stopAttractTour = canvas.stopAttractTour;
  const attractKeyframes = useMemo(
    () => gardenAttractKeyframes(world.lighthouse.tile, world.map),
    [world.lighthouse.tile, world.map],
  );
  useEffect(() => {
    const eligible = threeExperienceReady
      && !reducedMotion
      && observeIndex === null
      && selectedDetailId === null
      && gardenAlmanac.activeEvent === null;
    if (!eligible) {
      stopAttractTour();
      return;
    }
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === "hidden") return;
      timer = window.setTimeout(() => startAttractTour(attractKeyframes), GARDEN_ATTRACT_IDLE_MS);
    };
    const takeAgency = () => {
      stopAttractTour();
      schedule();
    };
    const handleVisibility = () => {
      stopAttractTour();
      schedule();
    };
    const events = ["pointermove", "pointerdown", "wheel", "keydown", "touchstart"] as const;
    for (const eventName of events) document.addEventListener(eventName, takeAgency, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    schedule();
    return () => {
      window.clearTimeout(timer);
      stopAttractTour();
      for (const eventName of events) document.removeEventListener(eventName, takeAgency);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [
    attractKeyframes,
    gardenAlmanac.activeEvent,
    observeIndex,
    reducedMotion,
    selectedDetailId,
    startAttractTour,
    stopAttractTour,
    threeExperienceReady,
  ]);
  useEffect(() => {
    if (!observingTour || observeSequence.length === 0) return;
    // Observe 2.0 (Phase 4): resolve every beat's display tile up front and
    // convert it to the spline's iso space, with the dolly zoom for its kind.
    // The camera hook derives the ease-in from the visitor's live framing.
    // Keyframes are built here (not in render) because display-tile resolution
    // reads the live ship-motion ref.
    const observeTourKeyframes: ObserveTourKeyframe[] = observeSequence.map((beat, beatIndex) => {
      const observedEntity = world.entityById[beat.detailId];
      const displayTile = observedEntity && observatorySlice
        ? resolveGardenEntityDisplayTile({
            entity: observedEntity,
            shipMotionSamples: shipMotionSamplesRef.current,
            slice: observatorySlice,
          })
        : null;
      const iso = tileToIso(displayTile ?? beat.tile);
      return {
        beatIndex,
        isoX: iso.x,
        isoY: iso.y,
        zoom: OBSERVE_TOUR_KIND_ZOOM[beat.kind],
      };
    });
    // The camera sampler publishes its current beat, so captions and framing
    // cannot diverge after a throttled frame or a background/foreground jump.
    startObserveTour(observeTourKeyframes, setObserveIndex);
    // On the way out the camera glides back to the visitor's framing — unless
    // input already cancelled the tour, in which case this is a no-op.
    return () => stopObserveTour({ easeBack: true });
  }, [observingTour, observatorySlice, observeSequence, shipMotionSamplesRef, startObserveTour, stopObserveTour, world.entityById]);

  useEffect(() => {
    if (!observeBeat) return;

    const observedEntity = world.entityById[observeBeat.detailId];
    const displayTile = observedEntity && observatorySlice
      ? resolveGardenEntityDisplayTile({
          entity: observedEntity,
          shipMotionSamples: shipMotionSamplesRef.current,
          slice: observatorySlice,
        })
      : null;
    // Reduced motion steps beats by hand: focusTile queues a camera intent,
    // which the controller applies in one step — the beat lands without a
    // glide. With motion the Observe 2.0 tour owns the camera (started above),
    // so the beat only speaks.
    if (reducedMotion) focusTile(displayTile ?? observeBeat.tile);
    setAnnouncement(observeBeat.label);
    // Reduced motion gets the same beats without the sampled tour: the
    // observe control steps to the next one, so nothing moves unless asked.
  }, [
    focusTile,
    observatorySlice,
    observeBeat,
    observeSequence.length,
    reducedMotion,
    setAnnouncement,
    shipMotionSamplesRef,
    world.entityById,
  ]);

  useEffect(() => {
    if (!observeBeat) return;
    const stopObserve = (event: Event) => {
      const target = event.target;
      const targetsObserveControl = target instanceof Element
        && Boolean(target.closest("[data-observe-control]"));
      const activationKey = event instanceof KeyboardEvent
        && (event.key === "Enter" || event.key === " ");
      if (targetsObserveControl && (event.type === "pointerdown" || activationKey)) return;
      // Reduced motion has no timer to carry the tour: the next beat comes only
      // from the observe control, so reaching it must not end the sequence.
      // Tab is how a keyboard reader gets there, which makes it navigation
      // here, not the input that cancels.
      if (reducedMotion && event instanceof KeyboardEvent && event.key === "Tab") return;
      cancelCameraIntent();
      setObserveIndex(null);
    };
    document.addEventListener("pointerdown", stopObserve, true);
    document.addEventListener("wheel", stopObserve, { capture: true, passive: true });
    document.addEventListener("keydown", stopObserve, true);
    document.addEventListener("visibilitychange", stopObserve);
    return () => {
      document.removeEventListener("pointerdown", stopObserve, true);
      document.removeEventListener("wheel", stopObserve, true);
      document.removeEventListener("keydown", stopObserve, true);
      document.removeEventListener("visibilitychange", stopObserve);
    };
  }, [cancelCameraIntent, observeBeat, reducedMotion]);

  // Full hit-target rebuild on world swap, selection delta, canvas-size
  // changes. Ship-cell and visibility transitions are handled inside the RAF
  // loop.
  useEffect(() => {
    recomputeHitTargets();
    if (reducedMotion) requestPaint();
  }, [
    canvas.canvasSize.x,
    canvas.canvasSize.y,
    recomputeHitTargets,
    reducedMotion,
    requestPaint,
    selectedDetailId,
    world,
  ]);

  useEffect(() => {
    if (!reducedMotion) return;
    requestPaint();
    if (!hoveredDetailId) return;
    const timer = window.setTimeout(requestPaint, HOVER_NAMEPLATE_DWELL_MS + 8);
    return () => window.clearTimeout(timer);
  }, [hoveredDetailId, reducedMotion, requestPaint]);

  useEffect(() => {
    if (!selectedDetailId) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const shell = shellRef.current;
      if (!shell?.contains(target)) return;
      const detailPanel = document.getElementById("pharosville-detail-panel");
      if (detailPanel?.contains(target)) return;
      if (target instanceof Element && target.closest(".pharosville-canvas")) return;
      if (target instanceof Element && target.closest(".pharosville-overlay, .pharosville-world-chrome, .pharosville-footer")) return;
      clearSelection();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  }, [clearSelection, selectedDetailId]);

  useEffect(() => {
    if (!pendingFollowDetailIdRef.current || !selectedEntity) return;
    if (selectedEntity.detailId !== pendingFollowDetailIdRef.current) return;
    pendingFollowDetailIdRef.current = null;
    if (!rendererFailed) focusSelectedCamera(selectedEntity.detailId, selectedEntity);
  }, [focusSelectedCamera, rendererFailed, selectedEntity]);

  useEffect(() => observeReducedMotion((matches) => {
    if (matches) cancelCameraIntent();
    setReducedMotion(matches);
    setMotionPreferenceResolved(true);
  }), [cancelCameraIntent]);

  // world.map is a module singleton; this fires once on full teardown.
  useEffect(() => () => disposePathCacheForMap(world.map), [world.map]);

  const handleWorldKeyDown = useWorldKeyboardTargets({
    canvasHandleKeyDown: canvas.handleKeyDown,
    canvasSizeRef: canvas.canvasSizeRef,
    hitTargetsRef,
    keyboardFocusedDetailId,
    recomputeHitTargets,
    reducedMotion,
    requestPaint,
    selectDetail,
    selectedDetailId,
    setAnnouncement,
    setHoveredDetailId,
    setKeyboardFocusedDetailId,
    world,
  });

  const detailDockStyle = selectedDetailAnchor
    ? ({
        "--pv-detail-x": `${selectedDetailAnchor.x}px`,
        "--pv-detail-y": `${selectedDetailAnchor.y}px`,
      } as CSSProperties)
    : undefined;
  const frameRateLabel = formatFrameRateLabel(frameRateFps, reducedMotion);
  // W0.4: a live frame-rate number is developer telemetry, and a permanent one
  // is the loudest piece of tech-demo chrome left in a product whose whole
  // proposition is calm. It stays for perf work behind ?debug=1 — the flag
  // `scripts/pharosville/preview.mjs` already appends to every URL it opens —
  // and no ordinary visitor sees it. Read once: a session does not change its
  // mind about being a debug session.
  const [debugChrome] = useState(isDebugChromeEnabled);
  const handleToggleObserve = useCallback(() => {
    if (observeIndex !== null) cancelCameraIntent();
    if (reducedMotion) {
      // Not a toggle here: each press is one step through the sequence, and
      // the press past the last beat ends it.
      setObserveIndex((current) => {
        if (current === null) return 0;
        return current + 1 < observeSequence.length ? current + 1 : null;
      });
      return;
    }
    setObserveIndex(observeIndex === null ? 0 : null);
  }, [cancelCameraIntent, observeIndex, observeSequence.length, reducedMotion]);

  // "Watch the harbor" under reduced motion sets the first beat and stops
  // there — the sequence steps from the observe control and nothing else. Left
  // where the legend's focus restore put them, a keyboard reader would have to
  // tab backwards through the footer to find that control. Send them to it, so
  // the next beat is one press away.
  const observeStepFocusPendingRef = useRef(false);
  const handleObserveFromLegend = useCallback(() => {
    observeStepFocusPendingRef.current = reducedMotion;
    setObserveIndex(0);
  }, [reducedMotion]);
  useEffect(() => {
    if (!observeBeat || !observeStepFocusPendingRef.current) return;
    observeStepFocusPendingRef.current = false;
    document.querySelector<HTMLElement>("[data-observe-control]")?.focus({ preventScroll: true });
  }, [observeBeat]);

  const handleSelectStaticDetail = useCallback((detailId: string) => {
    selectDetail(detailId, null);
  }, [selectDetail]);

  // Quick find: "where is my coin?" is the first thing a visitor wants, and
  // tabbing through the whole fleet is not an answer. `/` is the field's only
  // entry point, so it must not steal the key from anything that takes typing.
  const quickFindCandidates = useMemo(() => buildQuickFindCandidates(world), [world]);
  const referencePanelOpen = changelog.changelogOpen || legend.legendOpen || harborLedgerOpen;
  useEffect(() => {
    if (rendererFailed || quickFindOpen || referencePanelOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTextEntryTarget(event.target)) return;
      event.preventDefault();
      setQuickFindOpen(true);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [quickFindOpen, referencePanelOpen, rendererFailed]);

  // Time of day used to be reachable only by hand-editing `t=` into the
  // address bar. `[` and `]` walk it instead, under the same guards as the
  // quick-find key: not while a text field has focus, not behind a dialog, not
  // with a modifier. The hour still rides out through the URL write below, so
  // a nudged sky is still a shareable one.
  const nudgeSessionHour = timeControls.nudgeSessionHour;
  useEffect(() => {
    if (rendererFailed || quickFindOpen || referencePanelOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "[" && event.key !== "]") return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTextEntryTarget(event.target)) return;
      event.preventDefault();
      const hour = nudgeSessionHour(event.key === "]" ? WORLD_TIME_NUDGE_HOUR : -WORLD_TIME_NUDGE_HOUR);
      if (hour !== null) setAnnouncement(sessionHourAnnouncement(hour));
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [nudgeSessionHour, quickFindOpen, referencePanelOpen, rendererFailed, setAnnouncement]);

  const closeQuickFind = useCallback(() => {
    setQuickFindOpen(false);
    setAnnouncement("Closed quick find.");
  }, [setAnnouncement]);

  const handleQuickFindSelect = useCallback((detailId: string) => {
    setQuickFindOpen(false);
    selectDetail(detailId, null);
    const entity = world.entityById[detailId];
    const displayTile = entity
      ? resolveGardenEntityDisplayTile({
          entity,
          shipMotionSamples: shipMotionSamplesRef.current,
          slice: selectGardenObservatorySlice(world, detailId),
        })
      : null;
    // Same camera path as the observe beats: an intent the controller applies
    // in one step under reduced motion and glides otherwise.
    if (displayTile) focusTile(displayTile);
    const title = world.detailIndex[detailId]?.title ?? entity?.label ?? "target";
    setAnnouncement(displayTile
      ? `Selected ${title}. The view is centring on it.`
      : `Selected ${title}.`);
  }, [focusTile, selectDetail, setAnnouncement, world]);

  // A visitor whose browser cannot render the world still gets the signal
  // overview, opens details from it, and is told in the instructions above that
  // "Escape closes panels" — but the shell dropped its whole key handler when
  // the renderer failed, so Escape did nothing and the only way out was the
  // close button. The map-target cycling in the full handler is meaningless
  // without a canvas; Escape is not.
  const handleFallbackKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    // The reference panels open over the static fallback too, and Escape in one
    // of them closes that panel — not the selection underneath it.
    if (isDialogEventTarget(event.target)) return;
    if (selectedDetailIdRef.current === null) return;
    event.preventDefault();
    clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSelection]);

  // The harbor before its data is an empty sea: island, water and sky, no
  // fleet. Showing it meant the first thing a visitor saw was a world with
  // nothing in it, and then every ship arriving in the same frame. The runtime
  // still mounts immediately — the renderer and its shaders warm up underneath
  // — but the sea stays behind the charting veil until there is a harbor to
  // show, so arrival reads as arrival instead of a pop.
  const worldIsCharting = world.routeMode === "loading";
  const [arrivalStage, setArrivalStage] = useState<"waiting" | "arriving" | "crossfade" | "complete">("waiting");
  const arrivalStartedRef = useRef(false);
  const startCanvasArrival = canvas.startArrival;
  const skipCanvasArrival = canvas.skipArrival;
  useEffect(() => {
    if (worldIsCharting) {
      arrivalStartedRef.current = false;
      // Renderer/data lifecycle is the external state this choreography mirrors.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setArrivalStage("waiting");
      return undefined;
    }
    if (!rendererWarmupReady || arrivalStartedRef.current || !motionPreferenceResolved) return undefined;
    arrivalStartedRef.current = true;
    // A restored moment is already an authored vantage. Do not replace it
    // with the establishing camera after URL restoration has run.
    if (worldUrlState.initialState.camera || worldUrlState.initialState.selectedDetailId) {
      setArrivalStage("complete");
      return undefined;
    }
    if (reducedMotion) {
      setArrivalStage("crossfade");
      const id = window.setTimeout(() => {
        startCanvasArrival(() => setArrivalStage("complete"));
      }, GARDEN_ARRIVAL_CROSSFADE_MS);
      return () => window.clearTimeout(id);
    }
    setArrivalStage("arriving");
    startCanvasArrival(() => setArrivalStage("complete"));
    return undefined;
  }, [motionPreferenceResolved, reducedMotion, rendererWarmupReady, startCanvasArrival, worldIsCharting, worldUrlState.initialState.camera, worldUrlState.initialState.selectedDetailId]);

  useEffect(() => {
    if (arrivalStage !== "arriving") return undefined;
    const skip = () => {
      skipCanvasArrival();
      setArrivalStage("complete");
    };
    const events = ["pointerdown", "wheel", "keydown", "touchstart"] as const;
    for (const eventName of events) window.addEventListener(eventName, skip, { capture: true, passive: true });
    return () => {
      for (const eventName of events) window.removeEventListener(eventName, skip, { capture: true });
    };
  }, [arrivalStage, skipCanvasArrival]);

  const [harbormasterNotePresent, setHarbormasterNotePresent] = useState(harbormasterNoteAvailable);
  const [harbormasterNoteOpen, setHarbormasterNoteOpen] = useState(false);
  const dismissHarbormasterNote = useCallback(() => {
    try {
      window.localStorage.setItem(HARBORMASTER_NOTE_STORAGE_KEY, "1");
    } catch {
      // The note is optional and dismissal is best-effort in private storage.
    }
    setHarbormasterNoteOpen(false);
    setHarbormasterNotePresent(false);
  }, []);
  const chartingVeilMounted = !rendererFailed && (worldIsCharting || arrivalStage !== "complete");

  return (
    <main
      ref={shellRef}
      className="pharosville-desktop pharosville-shell"
      data-testid="pharosville-world"
      aria-describedby="pharosville-world-instructions"
      onKeyDown={rendererFailed ? handleFallbackKeyDown : handleWorldKeyDown}
      tabIndex={0}
    >
      <p id="pharosville-world-instructions" className="sr-only">
        Tab cycles map targets and Enter opens their details; past the last
        target, Tab continues into the page controls. Slash opens quick find,
        to reach a ship or harbor by name. Arrow keys pan, plus and minus zoom,
        left and right square brackets shift the time of day, Escape closes
        panels.
      </p>
      <canvas
        ref={canvasElementRef}
        className={hoveredDetailId ? "pharosville-canvas pharosville-canvas--selectable" : "pharosville-canvas"}
        data-testid="pharosville-canvas"
        data-renderer="three"
        data-renderer-status={rendererStatus}
        aria-hidden="true"
        hidden={rendererFailed}
        onPointerCancel={handleCanvasPointerCancel}
        onPointerDown={handleCanvasPointerDown}
        onPointerLeave={handleCanvasPointerLeave}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
      />
      {rendererFailed && (
        <WorldStaticOverview world={world} onSelectDetail={handleSelectStaticDetail} />
      )}
      {chartingVeilMounted && !rendererFailed && (
        <div
          className="pharosville-loading pharosville-loading--veil"
          data-testid="pharosville-charting-veil"
          data-arrival={worldIsCharting ? "waiting" : arrivalStage}
          data-charting={worldIsCharting ? "true" : "false"}
          role="status"
          aria-busy={worldIsCharting}
          aria-live="polite"
        >
          Charting market winds…
        </div>
      )}
      {arrivalStage === "complete" && harbormasterNotePresent && !rendererFailed && (
        <div className="pharosville-harbormaster-note" data-open={harbormasterNoteOpen ? "true" : "false"}>
          {harbormasterNoteOpen && (
            <aside aria-label="Harbormaster's note" className="pharosville-harbormaster-note__paper">
              <p>The lanterns are warm; the ledger is current.</p>
              <p>Ships keep their own water, and the quiet between them is part of the chart.</p>
              <p aria-hidden="true">— the harbormaster</p>
              <button type="button" onClick={dismissHarbormasterNote} aria-label="Put away harbormaster's note">×</button>
            </aside>
          )}
          {!harbormasterNoteOpen && (
            <button
              type="button"
              className="pharosville-harbormaster-note__glyph"
              aria-label="Read harbormaster's note"
              onClick={() => setHarbormasterNoteOpen(true)}
            >
              ⌁
            </button>
          )}
        </div>
      )}
      <div className="pharosville-overlay" aria-label="PharosVille controls and details">
        {!rendererFailed && (
          <div
            ref={hoverTooltipElRef}
            className="pharosville-hover-tooltip"
            data-visible="false"
            data-testid="pharosville-hover-tooltip"
            aria-hidden="true"
          >
            {hoverTooltip && (
              <div className="pharosville-hover-tooltip__card">
                <strong>{hoverTooltip.title}</strong>
                <span>{hoverTooltip.meta}</span>
              </div>
            )}
          </div>
        )}
        {observeBeat && (
          <p className="pharosville-observe-caption" data-testid="pharosville-observe-caption">
            {/* Stepping has no clock to promise the next beat, so the eyebrow
                carries the position instead. */}
            <span>
              {reducedMotion && observeIndex !== null
                ? `Observe ${observeIndex + 1}/${observeSequence.length}`
                : "Observe"}
            </span>
            {observeBeat.label}
          </p>
        )}
        {quickFindOpen && !rendererFailed && (
          <QuickFind
            candidates={quickFindCandidates}
            onClose={closeQuickFind}
            onSelect={handleQuickFindSelect}
          />
        )}
        <SinceLastVisitBanner delta={visitSnapshot.delta} onDismiss={visitSnapshot.dismiss} />
        {selectedDetail && (
          <div
            className={selectedDetailAnchor ? `pharosville-detail-dock pharosville-detail-dock--anchored pharosville-detail-dock--${selectedDetailAnchor.side}` : "pharosville-detail-dock"}
            data-camera-rest={panelReadyDetailId === selectedDetailId ? "true" : "false"}
            style={detailDockStyle}
          >
            <DetailPanel detail={selectedDetail} onClose={clearSelection} onSelectDetail={selectDetail} setAnnouncement={setAnnouncement} />
          </div>
        )}
      </div>
      {!rendererFailed && (
        <div className="pharosville-world-chrome" ref={chromeRef} data-recent-input="false">
          <WorldControls
            onResetView={handleCanvasResetView}
            nightMode={timeControls.nightMode}
            onToggleNightMode={timeControls.toggleNightMode}
            {...(threeExperienceReady ? {
              // Under reduced motion the control steps rather than runs, so it
              // never latches into a "stop" state the press would not honour.
              observing: observeBeat !== null && !reducedMotion,
              onToggleObserve: handleToggleObserve,
            } : {})}
          />
        </div>
      )}
      {changelog.changelogOpen && (
        <Suspense fallback={<ChangelogPanelLoading />}>
          <LazyChangelogPanel onClose={changelog.closeChangelog} />
        </Suspense>
      )}
      {legend.legendOpen && (
        <Suspense fallback={<ChangelogPanelLoading />}>
          <LazyLegendPanel
            onClose={legend.closeLegend}
            onSelectDetail={selectDetail}
            recentFleetTrend={recentFleetTrend}
            {...(threeExperienceReady ? { onObserve: handleObserveFromLegend } : {})}
          />
        </Suspense>
      )}
      {harborLedgerOpen && (
        <Suspense fallback={<ChangelogPanelLoading />}>
          <LazyHarborLedgerPanel
            almanacEntries={gardenAlmanac.entries}
            onClose={closeHarborLedger}
            world={world}
            riskTransitionByShipId={riskTransitionByShipId}
          />
        </Suspense>
      )}
      <p className="pharosville-footer">
        <span className="pharosville-footer__primary">
          <span className="pharosville-footer__brand">
            <span className="pharosville-footer__mark">PharosVille {PHAROSVILLE_LATEST_VERSION}</span>
            <span className="pharosville-footer__separator" aria-hidden="true">·</span>
          </span>
          <button className="pharosville-footer__button" type="button" onClick={openLegendExclusive}>Legend</button>
          <span className="pharosville-footer__separator" aria-hidden="true">·</span>
          <button className="pharosville-footer__button" type="button" onClick={openChangelogExclusive}>Changelog</button>
          <span className="pharosville-footer__separator" aria-hidden="true">·</span>
          <button className="pharosville-footer__button" type="button" onClick={openHarborLedgerExclusive}>Harbor ledger</button>
        </span>
        <span className="pharosville-footer__telemetry">
          <span className="pharosville-footer__separator" aria-hidden="true">·</span>
          <span className="pharosville-footer__counter" data-testid="pharosville-ship-counter">{shipCounterLabel}</span>
          {debugChrome && (
            <span className="pharosville-footer__frame-rate">
              <span className="pharosville-footer__separator" aria-hidden="true">·</span>
              <span className="pharosville-footer__fps" data-testid="pharosville-fps-counter" aria-label={`Frame rate: ${frameRateLabel}`}>{frameRateLabel}</span>
            </span>
          )}
        </span>
      </p>
      <HarborLog
        entries={harborLog.entries}
        onDismiss={harborLog.dismiss}
        onSelectDetail={selectDetail}
      />
      <p className="sr-only" aria-live="polite">{announcement}</p>
      {/* One ledger, two presentations. While the panel is open it carries the
          same component visibly, so the region landmark is never in the DOM
          twice and a screen reader never reads the world through twice. */}
      {!harborLedgerOpen && (
        <AccessibilityLedger
          almanacEntries={gardenAlmanac.entries}
          world={world}
          riskTransitionByShipId={riskTransitionByShipId}
        />
      )}
    </main>
  );
}

// Memoized so re-renders triggered by parent (e.g. from React Query refetches that
// produce identical payloads) don't reach the canvas component when `world` reference
// is stable. Pairs with the structural-compare cache in `pharosville-desktop-data.tsx`.
export const PharosVilleWorld = memo(PharosVilleWorldInner);

type FreshnessKey = keyof PharosVilleWorldModel["freshness"];

interface WorldDataRefreshSnapshot {
  generatedAt: number | null;
  key: string;
  staleSourceKey: string;
  staleSourceLabels: readonly string[];
}

const FRESHNESS_LABELS: ReadonlyArray<readonly [FreshnessKey, string]> = [
  ["stablecoinsStale", "stablecoins"],
  ["chainsStale", "chains"],
  ["stabilityStale", "PSI"],
  ["pegSummaryStale", "peg summary"],
  ["stressStale", "stress signals"],
  ["reportCardsStale", "report cards"],
];

/** True for anything the visitor could be typing into, where `/` is a slash. */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function worldDataRefreshSnapshot(world: PharosVilleWorldModel): WorldDataRefreshSnapshot {
  const staleSourceLabels = FRESHNESS_LABELS
    .filter(([key]) => world.freshness[key] === true)
    .map(([, label]) => label);
  const staleSourceKey = staleSourceLabels.join("|");
  return {
    generatedAt: world.generatedAt,
    key: `${world.generatedAt}|${staleSourceKey}`,
    staleSourceKey,
    staleSourceLabels,
  };
}

function worldDataRefreshAnnouncement(
  previous: WorldDataRefreshSnapshot,
  current: WorldDataRefreshSnapshot,
): string | null {
  const generatedAtChanged = previous.generatedAt !== current.generatedAt;
  const freshnessChanged = previous.staleSourceKey !== current.staleSourceKey;
  if (!generatedAtChanged && !freshnessChanged) return null;

  const previousStaleSources = new Set(previous.staleSourceLabels);
  const currentStaleSources = new Set(current.staleSourceLabels);
  const newlyStale = current.staleSourceLabels.filter((label) => !previousStaleSources.has(label));
  const restored = previous.staleSourceLabels.filter((label) => !currentStaleSources.has(label));
  let leadingClause = "Harbor data updated";
  const clauses: string[] = [];

  if (newlyStale.length > 0) {
    clauses.push(`Stale source groups: ${formatAnnouncementList(newlyStale)}`);
  }
  if (restored.length > 0) {
    clauses.push(`Fresh source groups restored: ${formatAnnouncementList(restored)}`);
  }
  if (!freshnessChanged) {
    const generatedAtText = formatGeneratedAtForAnnouncement(current.generatedAt);
    if (generatedAtText) {
      leadingClause = `Harbor data updated ${generatedAtText}`;
    }
  }

  return `${[leadingClause, ...clauses].join(". ")}.`;
}

function formatAnnouncementList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0] ?? ""} and ${items[1] ?? ""}`;
  const lastItem = items[items.length - 1] ?? "";
  return `${items.slice(0, -1).join(", ")}, and ${lastItem}`;
}

function formatGeneratedAtForAnnouncement(generatedAt: number | null): string | null {
  if (generatedAt === null) return null;
  if (!Number.isFinite(generatedAt) || generatedAt <= 0) return null;
  return `at ${new Date(generatedAt).toISOString()}`;
}

/** Shared loading state for both the lazy desktop runtime and world shell. */
export function PharosVilleLoading({ message = "Charting market winds…" }: { message?: string }) {
  return (
    <div className="pharosville-loading pharosville-desktop" role="status" aria-busy="true" aria-live="polite">
      {message}
    </div>
  );
}

const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function ChangelogPanelLoading() {
  return (
    <aside className="pharosville-changelog-panel pharosville-changelog-panel--loading" role="status">
      <p>Loading changelog...</p>
    </aside>
  );
}

/**
 * A ship earns a dock visit only where it holds supply on a chain large enough
 * to be drawn as a harbor, so this counts ships with a berth SOMEWHERE on the
 * chart — a reading of how concentrated supply is on the charted chains. It is
 * not how many ships are moored at this moment: that share is set by
 * `DOCKED_SHIP_DWELL_SHARE` and varies by zone. The copy says "hold a berth"
 * rather than "docked" because "docked" invites the second reading.
 */
function fleetCounterLabel(ships: PharosVilleWorldModel["ships"]): string {
  const berthedShips = ships.filter((ship) => ship.dockVisits.length > 0).length;
  const totalShips = ships.length;
  return `${integerFormatter.format(berthedShips)} of ${integerFormatter.format(totalShips)} hold a berth`;
}

function formatFrameRateLabel(frameRateFps: number | null, reducedMotion: boolean): string {
  if (reducedMotion) return "Static";
  if (frameRateFps === null) return "FPS --";
  return `${integerFormatter.format(frameRateFps)} fps`;
}
