"use client";
// react-hooks/refs flags JSX `ref={...}` prop bindings and event-handler
// bindings as "ref access during render", which is a false positive for
// React's intended ref-binding pattern. Disable the rule file-wide; the
// genuine ref discipline (no .current reads in render) is enforced by the
// rules-of-hooks rule and PR review (see HOOKS.md F1 history).
/* eslint-disable react-hooks/refs */
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Home from "lucide-react/dist/esm/icons/home";
import Maximize2 from "lucide-react/dist/esm/icons/maximize-2";
import Minimize2 from "lucide-react/dist/esm/icons/minimize-2";
import { AccessibilityLedger, type ShipRiskTransitionEntry } from "./components/accessibility-ledger";
import { DetailPanel } from "./components/detail-panel";
import { WorldToolbar } from "./components/world-toolbar";
import { PHAROSVILLE_LATEST_VERSION } from "./content/pharosville-version";
import { useAssetLoadingPipeline } from "./hooks/use-asset-loading-pipeline";
import { useChangelogDialog } from "./hooks/use-changelog-dialog";
import { useCanvasResizeAndCamera } from "./hooks/use-canvas-resize-and-camera";
import { useFullscreenMode } from "./hooks/use-fullscreen-mode";
import { useLatestRef } from "./hooks/use-latest-ref";
import { detailAnchorForPoint, useWorldKeyboardTargets } from "./hooks/use-world-keyboard-targets";
import { useWorldRenderLoop } from "./hooks/use-world-render-loop";
import { useWorldSelection, resolveSelectedDetail } from "./hooks/use-world-selection";
import { useWorldTimeControls } from "./hooks/use-world-time-controls";
import { createHitTargetSnapshot, type HitTarget, type HitTargetSnapshot } from "./renderer/hit-testing";
import { buildBaseMotionPlan, buildMotionPlan, disposePathCacheForMap, motionPlanSignature, type ShipMotionSample } from "./systems/motion";
import type { ScreenPoint } from "./systems/projection";
import { observeReducedMotion } from "./systems/reduced-motion";
import type { PharosVilleWorld as PharosVilleWorldModel } from "./systems/world-types";

const LazyChangelogPanel = lazy(() => (
  import("./components/changelog-panel").then((module) => ({ default: module.ChangelogPanel }))
));

// W4.01 first-load reveal beat duration (ms). Three phases of ~600ms each,
// spec'd by VD #3 in `agents/2026-05-17-pharosville-wow-revamp-plan.md`.
const REVEAL_DURATION_MS = 1800;

function PharosVilleWorldInner({ world }: { world: PharosVilleWorldModel }) {
  const [reducedMotion, setReducedMotion] = useState(true);
  const shellRef = useRef<HTMLElement | null>(null);
  const { exitFullscreen, fullscreenMode, toggleFullscreen } = useFullscreenMode(shellRef);
  const requestWorldFrameRef = useRef<() => void>(() => {});
  const requestWorldFrame = useCallback(() => {
    requestWorldFrameRef.current();
  }, []);

  // W4.01 first-load reveal envelope. Drives 1 → 1 by default; the cold-mount
  // effect below tweens 0 → 1 over 1.8s exactly once per page load. The
  // render loop reads `.current` per frame (no React rerender churn).
  const revealEnvelopeRef = useRef(1);
  const revealHasStartedRef = useRef(false);

  const [motionBucket, setMotionBucket] = useState(0);
  const selection = useWorldSelection({ world });
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
  const timeControls = useWorldTimeControls({ requestPaint: requestWorldFrame });

  // Memoize on a content signature instead of `world` identity so live data
  // refetches that don't change ship/dock/map/lighthouse-flicker fields reuse
  // the prior plan (and skip A* warmups). `world` is still passed to the
  // builder; the signature only gates re-memo.
  const baseMotionPlanSignature = motionPlanSignature(world);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseMotionPlan = useMemo(() => buildBaseMotionPlan(world, motionBucket * 600), [baseMotionPlanSignature, motionBucket]);
  // `buildMotionPlan` only reads `world` to find the selected ship by id.
  // `baseMotionPlan` identity already keys on `motionPlanSignature(world)`, so
  // dropping `world` here avoids re-running the memo on world-ref churn that
  // doesn't change the signature.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const motionPlan = useMemo(() => buildMotionPlan(world, selectedDetailId, baseMotionPlan), [baseMotionPlan, selectedDetailId]);
  const shipsById = useMemo(() => new Map(world.ships.map((ship) => [ship.id, ship])), [world.ships]);
  const shipCounterLabel = useMemo(() => fleetCounterLabel(world.ships), [world.ships]);
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

  // Refs that mirror frequently-changing state so hook-internal effects/RAF can
  // read the latest values without rebinding on every hover/select/motionPlan
  // change. Updated synchronously during render via `useLatestRef` so they
  // stay coherent without an extra sync effect (and survive StrictMode
  // double-invokes).
  const hoveredDetailIdRef = useLatestRef(hoveredDetailId);
  const selectedDetailIdRef = useLatestRef(selectedDetailId);
  const motionPlanRef = useLatestRef(motionPlan);

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

  const assetPipeline = useAssetLoadingPipeline({ motionPlanRef, world });

  const handleSelectTarget = useCallback((target: HitTarget, point: ScreenPoint, viewport: ScreenPoint) => {
    selectDetail(target.detailId, detailAnchorForPoint(point, viewport));
  }, [selectDetail]);

  // selectedDetailIdRef omitted: ref identity never changes (HOOKS F4).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hasSelection = useCallback(() => selectedDetailIdRef.current !== null, []);

  const canvas = useCanvasResizeAndCamera({
    exitFullscreen,
    fullscreenMode,
    hasSelection,
    hitTargetSnapshotRef,
    hitTargetsRef,
    hoveredDetailIdRef,
    onClearSelection: clearSelection,
    onSelectTarget: handleSelectTarget,
    recomputeHitTargets,
    reducedMotion,
    requestWorldFrame,
    selectedDetailIdRef,
    selectedEntity,
    setHoveredDetailId,
    shipMotionSamplesRef,
    world,
  });

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
      const snapshot = createHitTargetSnapshot({
        assets: assetPipeline.assetManager,
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
    assetPipeline.assetManager,
    canvas.cameraRef,
    canvas.canvasSizeRef,
    hitTargetSnapshotRef,
    hitTargetsRef,
    hoveredDetailIdRef,
    selectedDetailIdRef,
    shipMotionSamplesRef,
    world,
  ]);

  const { frameRateFps, requestPaint } = useWorldRenderLoop({
    onBucketFlip: setMotionBucket,
    adaptiveDprStateRef: canvas.adaptiveDprStateRef,
    assetLoadErrors: assetPipeline.assetLoadErrors,
    assetLoadTick: assetPipeline.assetLoadTick,
    assetManager: assetPipeline.assetManager,
    camera: canvas.camera,
    cameraRef: canvas.cameraRef,
    canvasBudgetRef: canvas.canvasBudgetRef,
    canvasRef: canvas.canvasRef,
    canvasSize: canvas.canvasSize,
    canvasSizeRef: canvas.canvasSizeRef,
    criticalAssetAttemptsSettled: assetPipeline.criticalAssetAttemptsSettled,
    criticalAssetsLoaded: assetPipeline.criticalAssetsLoaded,
    deferredAssetsLoaded: assetPipeline.deferredAssetsLoaded,
    hitTargetSnapshotRef,
    hitTargetsRef,
    hoveredDetailId,
    hoveredDetailIdRef,
    maximumRequestedDprRef: canvas.maximumRequestedDprRef,
    motionPlan,
    motionPlanRef,
    reducedMotion,
    revealEnvelopeRef,
    selectedDetailAnchor,
    selectedDetailId,
    selectedDetailIdRef,
    setCriticalFramePainted: assetPipeline.setCriticalFramePainted,
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

  // W4.01 first-load reveal beat. Runs once per cold mount (the
  // `revealHasStartedRef` guard skips client-side route reloads); reduced
  // motion clients jump straight to envelope = 1 (final frame immediately,
  // no animation). The tween writes into `revealEnvelopeRef.current` so the
  // render loop picks it up via `revealEnvelopeRef`.
  useEffect(() => {
    if (revealHasStartedRef.current) return;
    revealHasStartedRef.current = true;
    if (reducedMotion) {
      revealEnvelopeRef.current = 1;
      requestPaint();
      return;
    }
    revealEnvelopeRef.current = 0;
    requestPaint();
    let frameId = 0;
    let startTime: number | null = null;
    const tween = (now: number) => {
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / REVEAL_DURATION_MS);
      revealEnvelopeRef.current = progress;
      requestPaint();
      if (progress < 1) {
        frameId = requestAnimationFrame(tween);
      }
    };
    frameId = requestAnimationFrame(tween);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      revealEnvelopeRef.current = 1;
    };
  }, [reducedMotion, requestPaint]);

  // Full hit-target rebuild on world swap, selection delta, canvas-size
  // changes, or asset-pipeline ready transitions. Ship-cell and visibility
  // transitions are handled incrementally inside the RAF loop.
  useEffect(() => {
    recomputeHitTargets();
    if (reducedMotion) requestPaint();
  }, [
    assetPipeline.assetManager,
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
      if (target instanceof Element && target.closest(".pharosville-overlay, .pharosville-fullscreen-button, .pharosville-home-button")) return;
      clearSelection();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  }, [clearSelection, selectedDetailId]);

  useEffect(() => observeReducedMotion(setReducedMotion), []);

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
  return (
    <main
      ref={shellRef}
      className={fullscreenMode ? "pharosville-desktop pharosville-shell pharosville-shell--fullscreen" : "pharosville-desktop pharosville-shell"}
      data-testid="pharosville-world"
      aria-describedby="pharosville-world-instructions"
      onKeyDown={handleWorldKeyDown}
      tabIndex={0}
    >
      <p id="pharosville-world-instructions" className="sr-only">
        Use toolbar, wheel, drag, arrows, Tab, Shift Tab, Enter, canvas.
      </p>
      <canvas
        ref={canvas.canvasRef}
        className={hoveredDetailId ? "pharosville-canvas pharosville-canvas--selectable" : "pharosville-canvas"}
        data-testid="pharosville-canvas"
        aria-hidden="true"
        onPointerCancel={canvas.handlePointerCancel}
        onPointerDown={canvas.handlePointerDown}
        onPointerLeave={canvas.handlePointerLeave}
        onPointerMove={canvas.handlePointerMove}
        onPointerUp={canvas.handlePointerUp}
      />
      <div className="pharosville-overlay" aria-label="PharosVille controls and details">
        <div className="pharosville-hud">
          <WorldToolbar
            selectedDetailId={selectedDetailId}
            zoomLabel={canvas.cameraZoomLabel}
            {...(selectedEntity ? { onFollowSelected: canvas.handleFollowSelected } : {})}
            onResetView={canvas.handleResetView}
            nightMode={timeControls.nightMode}
            onToggleNightMode={timeControls.toggleNightMode}
            autoNightCycle={timeControls.autoNightCycle}
            onToggleAutoNightCycle={timeControls.toggleAutoNightCycle}
            timeOfDayHour={timeControls.wallClockHour}
            manualTimeOverrideHour={timeControls.manualTimeOverrideHour}
            onTimeOfDayChange={timeControls.setManualTimeOverrideHour}
            onClearTimeOverride={timeControls.clearTimeOverride}
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
        {fullscreenMode ? <Minimize2 aria-hidden="true" size={24} /> : <Maximize2 aria-hidden="true" size={24} />}
      </button>
      <button
        type="button"
        className="pharosville-home-button"
        aria-label="Recenter map"
        title="Recenter map"
        onClick={canvas.handleResetView}
      >
        <Home aria-hidden="true" size={24} />
      </button>
      {changelog.changelogOpen && (
        <Suspense fallback={<ChangelogPanelLoading />}>
          <LazyChangelogPanel onClose={changelog.closeChangelog} />
        </Suspense>
      )}
      <p className="pharosville-beta-tag">
        <span className="pharosville-beta-tag__notice">PharosVille beta {PHAROSVILLE_LATEST_VERSION} - Interpretive view, not financial advice</span>
        <span className="pharosville-beta-tag__separator" aria-hidden="true">|</span>
        <button className="pharosville-beta-tag__button" type="button" onClick={changelog.openChangelog}>Changelog</button>
        <span className="pharosville-beta-tag__separator" aria-hidden="true">|</span>
        <span className="pharosville-beta-tag__counter" data-testid="pharosville-ship-counter">{shipCounterLabel}</span>
        <span className="pharosville-beta-tag__separator" aria-hidden="true">|</span>
        <span className="pharosville-beta-tag__fps" data-testid="pharosville-fps-counter" aria-label={`Frame rate: ${frameRateLabel}`}>{frameRateLabel}</span>
        <span className="pharosville-beta-tag__separator" aria-hidden="true">|</span>
        <a href="https://pharos.watch/">Pharos</a>
      </p>
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <AccessibilityLedger world={world} riskTransitionByShipId={riskTransitionByShipId} />
    </main>
  );
}

// Memoized so re-renders triggered by parent (e.g. from React Query refetches that
// produce identical payloads) don't reach the canvas component when `world` reference
// is stable. Pairs with the structural-compare cache in `pharosville-desktop-data.tsx`.
export const PharosVilleWorld = memo(PharosVilleWorldInner);

/**
 * W4.07 canvas-palette loading state. Renders the same className the
 * top-level `client.tsx` Suspense fallback uses (`pharosville-loading`), so
 * the CSS re-skin (deep `#050d13` background, warm spinner halo, distant
 * horizon-ship silhouettes mirroring `drawHorizonShips`) applies whether
 * the shell mounts this directly or the legacy inline `<div>` is hit. The
 * loading frame is designed to read as the first envelope <= 0.33 reveal
 * frame so the transition into the W4.01 reveal beat feels continuous.
 */
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
  const shipNoun = dockedShips === 1 ? "ship" : "ships";
  return `${integerFormatter.format(dockedShips)} ${shipNoun} docked / ${integerFormatter.format(totalShips)} total`;
}

function formatFrameRateLabel(frameRateFps: number | null, reducedMotion: boolean): string {
  if (reducedMotion) return "Static";
  if (frameRateFps === null) return "FPS --";
  return `${integerFormatter.format(frameRateFps)} fps`;
}
