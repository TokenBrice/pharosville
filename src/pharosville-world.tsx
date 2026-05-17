"use client";
// react-hooks/refs flags JSX `ref={...}` prop bindings and event-handler
// bindings as "ref access during render", which is a false positive for
// React's intended ref-binding pattern. Disable the rule file-wide; the
// genuine ref discipline (no .current reads in render) is enforced by the
// rules-of-hooks rule and PR review (see HOOKS.md F1 history).
/* eslint-disable react-hooks/refs */
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import Home from "lucide-react/dist/esm/icons/home";
import Maximize2 from "lucide-react/dist/esm/icons/maximize-2";
import Minimize2 from "lucide-react/dist/esm/icons/minimize-2";
import { AccessibilityLedger } from "./components/accessibility-ledger";
import { DetailPanel } from "./components/detail-panel";
import { WorldToolbar } from "./components/world-toolbar";
import { PHAROSVILLE_LATEST_VERSION } from "./content/pharosville-version";
import { useAssetLoadingPipeline } from "./hooks/use-asset-loading-pipeline";
import { useCanvasResizeAndCamera } from "./hooks/use-canvas-resize-and-camera";
import { useFullscreenMode } from "./hooks/use-fullscreen-mode";
import { useLatestRef } from "./hooks/use-latest-ref";
import { useWorldRenderLoop } from "./hooks/use-world-render-loop";
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
  const [hoveredDetailId, setHoveredDetailId] = useState<string | null>(null);
  const [keyboardFocusedDetailId, setKeyboardFocusedDetailId] = useState<string | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>("lighthouse");
  const [selectedDetailAnchor, setSelectedDetailAnchor] = useState<DetailAnchor | null>(null);
  const [announcement, setAnnouncement] = useState("PharosVille ready.");
  const [reducedMotion, setReducedMotion] = useState(true);
  const [nightMode, setNightMode] = useState(false);
  const [autoNightCycle, setAutoNightCycle] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [manualTimeOverrideHour, setManualTimeOverrideHour] = useState<number | null>(null);
  const manualWallClockRestoreRef = useRef<{ active: boolean; previous: number | undefined }>({
    active: false,
    previous: undefined,
  });
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
  const selectedEntity = selectedDetailId ? world.entityById[selectedDetailId] ?? null : null;
  const selectedDetail = selectedDetailId ? world.detailIndex[selectedDetailId] ?? null : null;

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

  const selectDetail = useCallback((detailId: string, anchor: DetailAnchor | null = null) => {
    const detail = world.detailIndex[detailId];
    setKeyboardFocusedDetailId(null);
    setHoveredDetailId(null);
    setSelectedDetailId(detailId);
    setSelectedDetailAnchor(anchor);
    setAnnouncement(detail ? `Selected ${detail.title}.` : "Selected map entity.");
  }, [world.detailIndex]);

  const clearSelection = useCallback(() => {
    setKeyboardFocusedDetailId(null);
    setHoveredDetailId(null);
    setSelectedDetailId(null);
    setSelectedDetailAnchor(null);
    setAnnouncement("Selection cleared.");
  }, []);

  const openChangelog = useCallback(() => {
    setChangelogOpen(true);
    setAnnouncement("Opened PharosVille changelog.");
  }, []);

  const closeChangelog = useCallback(() => {
    setChangelogOpen(false);
    setAnnouncement("Closed PharosVille changelog.");
  }, []);

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

  const { requestPaint } = useWorldRenderLoop({
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
    nightMode,
    reducedMotion,
    revealEnvelopeRef,
    selectedDetailAnchor,
    selectedDetailId,
    selectedDetailIdRef,
    setCriticalFramePainted: assetPipeline.setCriticalFramePainted,
    shipMotionSamplesRef,
    shipsById,
    stepCamera: canvas.stepCamera,
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

  useEffect(() => {
    if (!changelogOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setChangelogOpen(false);
      setAnnouncement("Closed PharosVille changelog.");
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [changelogOpen]);

  // world.map is a module singleton; this fires once on full teardown.
  useEffect(() => () => disposePathCacheForMap(world.map), [world.map]);

  useEffect(() => {
    if (!autoNightCycle) return;
    const id = setInterval(() => setNightMode((n) => !n), 60_000);
    return () => clearInterval(id);
  }, [autoNightCycle]);

  useEffect(() => {
    if (manualTimeOverrideHour === null) {
      if (manualWallClockRestoreRef.current.active) {
        const previous = manualWallClockRestoreRef.current.previous;
        if (previous === undefined) {
          delete globalThis.__pharosVilleTestWallClockHour;
        } else {
          globalThis.__pharosVilleTestWallClockHour = previous;
        }
        manualWallClockRestoreRef.current = { active: false, previous: undefined };
        requestPaint();
      }
      return;
    }

    if (!manualWallClockRestoreRef.current.active) {
      manualWallClockRestoreRef.current = {
        active: true,
        previous: globalThis.__pharosVilleTestWallClockHour,
      };
    }
    globalThis.__pharosVilleTestWallClockHour = manualTimeOverrideHour;
    requestPaint();
  }, [manualTimeOverrideHour, requestPaint]);

  useEffect(() => () => {
    if (!manualWallClockRestoreRef.current.active) return;
    const previous = manualWallClockRestoreRef.current.previous;
    if (previous === undefined) {
      delete globalThis.__pharosVilleTestWallClockHour;
    } else {
      globalThis.__pharosVilleTestWallClockHour = previous;
    }
  }, []);

  const cycleKeyboardTarget = useCallback((backwards: boolean) => {
    const snapshot = recomputeHitTargets();
    const targets = keyboardTargetOrder(snapshot?.targets ?? hitTargetsRef.current);
    const nextTarget = nextKeyboardTarget(targets, keyboardFocusedDetailId ?? selectedDetailId, backwards);
    if (!nextTarget) {
      setKeyboardFocusedDetailId(null);
      setHoveredDetailId(null);
      setAnnouncement("No map targets available.");
      return;
    }

    setKeyboardFocusedDetailId(nextTarget.detailId);
    setHoveredDetailId(nextTarget.detailId);
    const detail = world.detailIndex[nextTarget.detailId];
    setAnnouncement(`Focused ${detail?.title ?? nextTarget.label}. Press Enter to select.`);
    if (reducedMotion) requestPaint();
  }, [hitTargetsRef, keyboardFocusedDetailId, recomputeHitTargets, reducedMotion, requestPaint, selectedDetailId, world.detailIndex]);

  const selectKeyboardTarget = useCallback((): boolean => {
    if (!keyboardFocusedDetailId) return false;
    const snapshot = recomputeHitTargets();
    const target = snapshot?.targetsByDetailId.get(keyboardFocusedDetailId)
      ?? hitTargetsRef.current.find((entry) => entry.detailId === keyboardFocusedDetailId)
      ?? null;
    const viewport = canvas.canvasSizeRef.current;
    const anchor = target
      ? detailAnchorForPoint(centerPointForTarget(target), viewport)
      : null;
    selectDetail(keyboardFocusedDetailId, anchor);
    if (reducedMotion) requestPaint();
    return true;
  }, [canvas.canvasSizeRef, hitTargetsRef, keyboardFocusedDetailId, recomputeHitTargets, reducedMotion, requestPaint, selectDetail]);

  const handleWorldKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (!isInteractiveEventTarget(event.target) && event.key === "Tab") {
      event.preventDefault();
      cycleKeyboardTarget(event.shiftKey);
      return;
    }
    if (!isInteractiveEventTarget(event.target) && event.key === "Enter" && selectKeyboardTarget()) {
      event.preventDefault();
      return;
    }
    canvas.handleKeyDown(event);
  }, [canvas, cycleKeyboardTarget, selectKeyboardTarget]);

  const detailDockStyle = selectedDetailAnchor
    ? ({
        "--pv-detail-x": `${selectedDetailAnchor.x}px`,
        "--pv-detail-y": `${selectedDetailAnchor.y}px`,
      } as CSSProperties)
    : undefined;
  const timeOfDayHour = manualTimeOverrideHour
    ?? wallClockOverrideHour()
    ?? (nightMode ? 22 : 12);

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
        Use the visible toolbar, wheel zoom, drag pan, arrow keys, Tab and Shift Tab target cycling, Enter selection, and canvas selection to inspect PharosVille map data.
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
        onWheel={canvas.handleWheel}
      />
      <div className="pharosville-overlay" aria-label="PharosVille controls and details">
        <div className="pharosville-hud">
          <WorldToolbar
            selectedDetailId={selectedDetailId}
            zoomLabel={canvas.cameraZoomLabel}
            {...(selectedEntity ? { onFollowSelected: canvas.handleFollowSelected } : {})}
            onResetView={canvas.handleResetView}
            nightMode={nightMode}
            onToggleNightMode={() => {
              setManualTimeOverrideHour(null);
              setNightMode((n) => !n);
            }}
            autoNightCycle={autoNightCycle}
            onToggleAutoNightCycle={() => {
              setManualTimeOverrideHour(null);
              setAutoNightCycle((a) => !a);
            }}
            timeOfDayHour={timeOfDayHour}
            manualTimeOverrideHour={manualTimeOverrideHour}
            onTimeOfDayChange={setManualTimeOverrideHour}
            onClearTimeOverride={() => setManualTimeOverrideHour(null)}
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
      {changelogOpen && (
        <Suspense fallback={<ChangelogPanelLoading />}>
          <LazyChangelogPanel onClose={closeChangelog} />
        </Suspense>
      )}
      <p className="pharosville-beta-tag">
        <span className="pharosville-beta-tag__notice">PharosVille beta {PHAROSVILLE_LATEST_VERSION} - Interpretive view, not financial advice</span>
        <span className="pharosville-beta-tag__separator" aria-hidden="true">|</span>
        <button className="pharosville-beta-tag__button" type="button" onClick={openChangelog}>Changelog</button>
        <span className="pharosville-beta-tag__separator" aria-hidden="true">|</span>
        <span className="pharosville-beta-tag__counter" data-testid="pharosville-ship-counter">{shipCounterLabel}</span>
        <span className="pharosville-beta-tag__separator" aria-hidden="true">|</span>
        <a href="https://pharos.watch/">Pharos</a>
      </p>
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <AccessibilityLedger world={world} />
    </main>
  );
}

// Memoized so re-renders triggered by parent (e.g. from React Query refetches that
// produce identical payloads) don't reach the canvas component when `world` reference
// is stable. Pairs with the structural-compare cache in `pharosville-desktop-data.tsx`.
export const PharosVilleWorld = memo(PharosVilleWorldInner);

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

interface DetailAnchor extends ScreenPoint {
  side: "left" | "right";
}

function detailAnchorForPoint(point: ScreenPoint, viewport: ScreenPoint): DetailAnchor {
  const side = point.x > viewport.x * 0.6 ? "left" : "right";
  return { ...point, side };
}

function centerPointForTarget(target: HitTarget): ScreenPoint {
  return {
    x: target.rect.x + target.rect.width / 2,
    y: target.rect.y + target.rect.height / 2,
  };
}

function keyboardTargetOrder(targets: readonly HitTarget[]): HitTarget[] {
  const seenDetailIds = new Set<string>();
  const ordered: HitTarget[] = [];
  const byVisualPriority = targets
    .map((target, index) => ({ index, target }))
    .sort((left, right) => (
      right.target.priority - left.target.priority
      || right.index - left.index
    ));

  for (const entry of byVisualPriority) {
    if (seenDetailIds.has(entry.target.detailId)) continue;
    seenDetailIds.add(entry.target.detailId);
    ordered.push(entry.target);
  }
  return ordered;
}

function nextKeyboardTarget(
  targets: readonly HitTarget[],
  currentDetailId: string | null,
  backwards: boolean,
): HitTarget | null {
  if (targets.length === 0) return null;
  const currentIndex = currentDetailId
    ? targets.findIndex((target) => target.detailId === currentDetailId)
    : -1;
  if (currentIndex === -1) return backwards ? targets[targets.length - 1]! : targets[0]!;
  const delta = backwards ? -1 : 1;
  const nextIndex = (currentIndex + delta + targets.length) % targets.length;
  return targets[nextIndex]!;
}

function wallClockOverrideHour(): number | null {
  const override = globalThis.__pharosVilleTestWallClockHour;
  if (typeof override !== "number" || !Number.isFinite(override)) return null;
  return ((override % 24) + 24) % 24;
}

function isInteractiveEventTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && Boolean(target.closest("a, button, input, select, textarea, summary, [role='button']"));
}
