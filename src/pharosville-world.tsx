"use client";
// react-hooks/refs flags JSX `ref={...}` prop bindings and event-handler
// bindings as "ref access during render", which is a false positive for
// React's intended ref-binding pattern. Disable the rule file-wide; the
// genuine ref discipline (no .current reads in render) is enforced by the
// rules-of-hooks rule and PR review (see HOOKS.md F1 history).
/* eslint-disable react-hooks/refs */
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { AccessibilityLedger, type ShipRiskTransitionEntry } from "./components/accessibility-ledger";
import { DetailPanel } from "./components/detail-panel";
import { HarborLog } from "./components/harbor-log";
import { SinceLastVisitBanner } from "./components/since-last-visit";
import { WorldControls } from "./components/world-controls";
import { WorldStaticOverview } from "./components/world-static-overview";
import { PHAROSVILLE_LATEST_VERSION } from "./content/pharosville-version";
import { useShipLogoAssets } from "./hooks/use-ship-logo-assets";
import { useChangelogDialog } from "./hooks/use-changelog-dialog";
import { useLegendDialog } from "./hooks/use-legend-dialog";
import { useCanvasResizeAndCamera } from "./hooks/use-canvas-resize-and-camera";
import { useHarborLog } from "./hooks/use-harbor-log";
import { useLatestRef } from "./hooks/use-latest-ref";
import { useLiveTitle } from "./hooks/use-live-title";
import { useRecentWorldInput } from "./hooks/use-recent-world-input";
import { useVisitSnapshot } from "./hooks/use-visit-snapshot";
import { detailAnchorForPoint, useWorldKeyboardTargets } from "./hooks/use-world-keyboard-targets";
import { useWorldRenderLoop } from "./hooks/use-world-render-loop";
import { useWorldSelection, resolveSelectedDetail } from "./hooks/use-world-selection";
import { useWorldTimeControls } from "./hooks/use-world-time-controls";
import { useWorldUrlState } from "./hooks/use-world-url-state";
import { createGardenObservatoryHitTargetSnapshot } from "./renderer/garden-observatory-hit-testing";
import type { HitTarget, HitTargetSnapshot } from "./renderer/hit-testing";
import { clampCameraToMap } from "./systems/camera";
import {
  GARDEN_ZONE_ROOT_Y,
  gardenAreaDisplayTile,
  gardenSemanticView,
  gardenTileToScreen,
  resolveGardenEntityDisplayTile,
  selectGardenObservatorySlice,
} from "./systems/garden-observatory-slice";
import { buildBaseMotionPlan, disposePathCacheForMap, motionPlanSignature, type ShipMotionSample } from "./systems/motion";
import { buildObserveSequence } from "./systems/observe-sequence";
import { recentFleetTrendSummary } from "./systems/sea-state";
import type { ScreenPoint } from "./systems/projection";
import type { WorldSelectableEntity } from "./systems/world-types";
import { observeReducedMotion } from "./systems/reduced-motion";
import type { PharosVilleWorld as PharosVilleWorldModel } from "./systems/world-types";

const LazyChangelogPanel = lazy(() => (
  import("./components/changelog-panel").then((module) => ({ default: module.ChangelogPanel }))
));

const LazyLegendPanel = lazy(() => (
  import("./components/legend-panel").then((module) => ({ default: module.LegendPanel }))
));

const DATA_REFRESH_ANNOUNCEMENT_THROTTLE_MS = 30_000;
const OBSERVE_BEAT_DURATION_MS = 12_000;
/**
 * How long the charting veil takes to lift once the harbor has data. Long
 * enough to carry the scene rebuild that lands in the next frames, short
 * enough that arrival still reads as arrival.
 */
const CHARTING_VEIL_FADE_MS = 420;

function PharosVilleWorldInner({ world }: { world: PharosVilleWorldModel }) {
  const [reducedMotion, setReducedMotion] = useState(true);
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
  const changelog = useChangelogDialog({ setAnnouncement });
  const legend = useLegendDialog({ setAnnouncement });
  // The legend and changelog are the two true modal overlays; keep at most
  // one open so screen readers never see concurrent aria-modal dialogs.
  const openLegendExclusive = useCallback(() => {
    if (changelog.changelogOpen) changelog.closeChangelog();
    legend.openLegend();
  }, [changelog, legend]);
  const openChangelogExclusive = useCallback(() => {
    if (legend.legendOpen) legend.closeLegend();
    changelog.openChangelog();
  }, [changelog, legend]);
  const visitSnapshot = useVisitSnapshot({ world, setAnnouncement });
  const timeControls = useWorldTimeControls({
    initialManualTimeOverrideHour: worldUrlState.initialState.manualTimeOverrideHour,
    initialNightMode: worldUrlState.initialState.nightMode,
    requestPaint: requestWorldFrame,
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
      selectedDetailId,
      timeHour: timeControls.wallClockHour,
    });
  }, [
    selectedDetailId,
    timeControls.nightMode,
    timeControls.wallClockHour,
    worldUrlState,
  ]);

  const cameraOffsetX = canvas.camera?.offsetX ?? null;
  const cameraOffsetY = canvas.camera?.offsetY ?? null;
  const cameraZoom = canvas.camera?.zoom ?? null;
  useEffect(() => {
    if (cameraOffsetX === null || cameraOffsetY === null || cameraZoom === null) return;
    const id = window.setTimeout(() => {
      worldUrlState.replaceWorldUrlState({
        camera: {
          offsetX: cameraOffsetX,
          offsetY: cameraOffsetY,
          zoom: cameraZoom,
        },
      });
    }, 500);
    return () => window.clearTimeout(id);
  }, [cameraOffsetX, cameraOffsetY, cameraZoom, worldUrlState]);

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
    shipMotionSamplesRef,
    world,
  ]);

  const {
    frameRateFps,
    rendererStatus,
    requestPaint,
  } = useWorldRenderLoop({
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
  const observatoryAreas = useMemo(
    () => observatorySlice?.areas ?? [],
    [observatorySlice],
  );
  const observeSequence = useMemo(
    () => buildObserveSequence(world),
    [world],
  );
  const [observeIndex, setObserveIndex] = useState<number | null>(null);
  const rendererFailed = rendererStatus === "failed";
  const threeExperienceReady = rendererStatus === "ready";
  const observeBeat = threeExperienceReady && !reducedMotion && observeIndex !== null
    ? observeSequence[observeIndex] ?? null
    : null;
  const cancelCameraIntent = canvas.cancelCameraIntent;
  const focusTile = canvas.focusTile;

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
    focusTile(displayTile ?? observeBeat.tile);
    setAnnouncement(observeBeat.label);
    const timeoutId = window.setTimeout(() => {
      setObserveIndex((current) => {
        if (current === null) return null;
        return current + 1 < observeSequence.length ? current + 1 : null;
      });
    }, OBSERVE_BEAT_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [
    focusTile,
    observatorySlice,
    observeBeat,
    observeSequence.length,
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
  }, [cancelCameraIntent, observeBeat]);

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

  const canFollowSelected = !rendererFailed && selectedEntity
    ? resolveGardenEntityDisplayTile({
        entity: selectedEntity,
        slice: selectGardenObservatorySlice(world, selectedDetailId),
      }) !== null
    : false;
  const followSelectedFromCanvas = canvas.handleFollowSelected;
  useEffect(() => {
    if (!pendingFollowDetailIdRef.current || !selectedEntity) return;
    if (selectedEntity.detailId !== pendingFollowDetailIdRef.current) return;
    pendingFollowDetailIdRef.current = null;
    if (canFollowSelected) followSelectedFromCanvas();
  }, [canFollowSelected, followSelectedFromCanvas, selectedEntity]);

  useEffect(() => observeReducedMotion((matches) => {
    if (matches) {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof Element
        && activeElement.closest("[data-observe-control]")
      ) {
        shellRef.current?.focus();
      }
      cancelCameraIntent();
      setObserveIndex(null);
    }
    setReducedMotion(matches);
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
  const activeCamera = canvas.camera;
  const projectedObservatoryAreas = useMemo(() => {
    if (!threeExperienceReady || !activeCamera) return [];
    const semanticView = gardenSemanticView(activeCamera.zoom, selectedDetailId);
    if (semanticView === "analyze") return [];
    const visibleAreas = semanticView === "explore" ? world.areas : observatoryAreas;
    return visibleAreas.flatMap((area) => {
      const point = gardenTileToScreen(
        gardenAreaDisplayTile(area),
        GARDEN_ZONE_ROOT_Y,
        activeCamera,
      );
      const insideSafeViewport = point.x >= 68
        && point.x <= canvas.canvasSize.x - 68
        && point.y >= 132
        && point.y <= canvas.canvasSize.y - 16;
      return insideSafeViewport ? [{ area, point }] : [];
    });
  }, [
    activeCamera,
    canvas.canvasSize.x,
    canvas.canvasSize.y,
    observatoryAreas,
    selectedDetailId,
    threeExperienceReady,
    world.areas,
  ]);
  const handleSelectObservatoryArea = useCallback((
    detailId: string,
    point: ScreenPoint,
  ) => {
    selectDetail(detailId, detailAnchorForPoint(point, canvas.canvasSize));
  }, [canvas.canvasSize, selectDetail]);
  const handleToggleObserve = useCallback(() => {
    if (observeIndex !== null) cancelCameraIntent();
    setObserveIndex(observeIndex === null ? 0 : null);
  }, [cancelCameraIntent, observeIndex]);

  const handleSelectStaticDetail = useCallback((detailId: string) => {
    selectDetail(detailId, null);
  }, [selectDetail]);

  // The harbor before its data is an empty sea: island, water and sky, no
  // fleet. Showing it meant the first thing a visitor saw was a world with
  // nothing in it, and then every ship arriving in the same frame. The runtime
  // still mounts immediately — the renderer and its shaders warm up underneath
  // — but the sea stays behind the charting veil until there is a harbor to
  // show, so arrival reads as arrival instead of a pop.
  const worldIsCharting = world.routeMode === "loading";
  const [chartingVeilDismissed, setChartingVeilDismissed] = useState(false);
  // Stays mounted through the fade so the lift is a transition, not a cut.
  const chartingVeilMounted = worldIsCharting || !chartingVeilDismissed;
  useEffect(() => {
    if (worldIsCharting) return;
    const id = window.setTimeout(() => setChartingVeilDismissed(true), CHARTING_VEIL_FADE_MS);
    return () => window.clearTimeout(id);
  }, [worldIsCharting]);

  return (
    <main
      ref={shellRef}
      className="pharosville-desktop pharosville-shell"
      data-testid="pharosville-world"
      aria-describedby="pharosville-world-instructions"
      onKeyDown={rendererFailed ? undefined : handleWorldKeyDown}
      tabIndex={0}
    >
      <p id="pharosville-world-instructions" className="sr-only">
        Tab cycles map targets and Enter opens their details; past the last
        target, Tab continues into the page controls. Arrow keys pan, plus and
        minus zoom, Escape closes panels.
      </p>
      <canvas
        ref={canvas.canvasRef}
        className={hoveredDetailId ? "pharosville-canvas pharosville-canvas--selectable" : "pharosville-canvas"}
        data-testid="pharosville-canvas"
        data-renderer="three"
        data-renderer-status={rendererStatus}
        aria-hidden="true"
        hidden={rendererFailed}
        onPointerCancel={canvas.handlePointerCancel}
        onPointerDown={canvas.handlePointerDown}
        onPointerLeave={canvas.handlePointerLeave}
        onPointerMove={canvas.handlePointerMove}
        onPointerUp={canvas.handlePointerUp}
      />
      {rendererFailed && (
        <WorldStaticOverview world={world} onSelectDetail={handleSelectStaticDetail} />
      )}
      {chartingVeilMounted && !rendererFailed && (
        <div
          className="pharosville-loading pharosville-loading--veil"
          data-testid="pharosville-charting-veil"
          data-charting={worldIsCharting ? "true" : "false"}
          role="status"
          aria-busy={worldIsCharting}
          aria-live="polite"
        >
          Charting market winds…
        </div>
      )}
      <div className="pharosville-overlay" aria-label="PharosVille controls and details">
        {projectedObservatoryAreas.length > 0 && (
          <div className="pharosville-observatory-labels" aria-label="Active analytical areas">
            {projectedObservatoryAreas.map(({ area, point }) => {
              const copy = observatoryAreaLabelCopy(area);
              return (
                <button
                  key={area.id}
                  type="button"
                  className="pharosville-observatory-label"
                  style={{
                    "--pv-observatory-x": `${point.x}px`,
                    "--pv-observatory-y": `${point.y}px`,
                    ...(area.band === "DANGER"
                      ? { transform: "translate(-18%, calc(-100% - 18px))" }
                      : {}),
                  } as CSSProperties}
                  aria-pressed={selectedDetailId === area.detailId}
                  aria-label={`Open ${area.label} details: ${copy.spoken}`}
                  onClick={() => handleSelectObservatoryArea(area.detailId, point)}
                >
                  <strong>{area.label}</strong>
                  <span>{copy.visible}</span>
                </button>
              );
            })}
          </div>
        )}
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
            <span>Observe</span>
            {observeBeat.label}
          </p>
        )}
        <SinceLastVisitBanner delta={visitSnapshot.delta} onDismiss={visitSnapshot.dismiss} />
        {selectedDetail && (
          <div
            className={selectedDetailAnchor ? `pharosville-detail-dock pharosville-detail-dock--anchored pharosville-detail-dock--${selectedDetailAnchor.side}` : "pharosville-detail-dock"}
            style={detailDockStyle}
          >
            <DetailPanel detail={selectedDetail} onClose={clearSelection} onSelectDetail={selectDetail} />
          </div>
        )}
      </div>
      {!rendererFailed && (
        <div className="pharosville-world-chrome" ref={chromeRef} data-recent-input="false">
          <WorldControls
            onResetView={canvas.handleResetView}
            nightMode={timeControls.nightMode}
            onToggleNightMode={timeControls.toggleNightMode}
            {...(threeExperienceReady && !reducedMotion ? {
              observing: observeBeat !== null,
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
          <LazyLegendPanel onClose={legend.closeLegend} onSelectDetail={selectDetail} recentFleetTrend={recentFleetTrend} />
        </Suspense>
      )}
      <p className="pharosville-footer">
        <span className="pharosville-footer__mark">PharosVille {PHAROSVILLE_LATEST_VERSION}</span>
        <span className="pharosville-footer__separator" aria-hidden="true">·</span>
        <button className="pharosville-footer__button" type="button" onClick={openLegendExclusive}>Legend</button>
        <span className="pharosville-footer__separator" aria-hidden="true">·</span>
        <button className="pharosville-footer__button" type="button" onClick={openChangelogExclusive}>Changelog</button>
        <span className="pharosville-footer__separator" aria-hidden="true">·</span>
        <span className="pharosville-footer__counter" data-testid="pharosville-ship-counter">{shipCounterLabel}</span>
        <span className="pharosville-footer__separator" aria-hidden="true">·</span>
        <span className="pharosville-footer__fps" data-testid="pharosville-fps-counter" aria-label={`Frame rate: ${frameRateLabel}`}>{frameRateLabel}</span>
      </p>
      <HarborLog
        entries={harborLog.entries}
        onDismiss={harborLog.dismiss}
        onSelectDetail={selectDetail}
      />
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <AccessibilityLedger world={world} riskTransitionByShipId={riskTransitionByShipId} />
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

function fleetCounterLabel(ships: PharosVilleWorldModel["ships"]): string {
  const dockedShips = ships.filter((ship) => ship.dockVisits.length > 0).length;
  const totalShips = ships.length;
  return `${integerFormatter.format(dockedShips)} of ${integerFormatter.format(totalShips)} docked`;
}

function observatoryAreaLabelCopy(
  area: PharosVilleWorldModel["areas"][number],
): { spoken: string; visible: string } {
  if (!area.band || area.count == null) {
    return {
      spoken: "NAV ledger water",
      visible: "NAV ledger water",
    };
  }
  const noun = area.count === 1 ? "ship" : "ships";
  return {
    spoken: `${area.band}, ${area.count} ${noun}`,
    visible: `${area.band} · ${area.count} ${noun}`,
  };
}

function formatFrameRateLabel(frameRateFps: number | null, reducedMotion: boolean): string {
  if (reducedMotion) return "Static";
  if (frameRateFps === null) return "FPS --";
  return `${integerFormatter.format(frameRateFps)} fps`;
}
