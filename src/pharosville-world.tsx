"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Home from "lucide-react/dist/esm/icons/home";
import Maximize2 from "lucide-react/dist/esm/icons/maximize-2";
import Minimize2 from "lucide-react/dist/esm/icons/minimize-2";
import { AccessibilityLedger } from "./components/accessibility-ledger";
import { DetailPanel } from "./components/detail-panel";
import { WorldToolbar } from "./components/world-toolbar";
import { useAssetLoadingPipeline } from "./hooks/use-asset-loading-pipeline";
import { useCanvasResizeAndCamera } from "./hooks/use-canvas-resize-and-camera";
import { useFullscreenMode } from "./hooks/use-fullscreen-mode";
import { useLatestRef } from "./hooks/use-latest-ref";
import { useWorldRenderLoop } from "./hooks/use-world-render-loop";
import { createHitTargetSnapshot, recomputeHitTargetsForCameraOnly, type HitTarget, type HitTargetSnapshot } from "./renderer/hit-testing";
import { buildBaseMotionPlan, buildMotionPlan, motionPlanSignature, type ShipMotionSample } from "./systems/motion";
import type { ScreenPoint } from "./systems/projection";
import { observeReducedMotion } from "./systems/reduced-motion";
import type { PharosVilleWorld as PharosVilleWorldModel } from "./systems/world-types";

function PharosVilleWorldInner({ world }: { world: PharosVilleWorldModel }) {
  const [hoveredDetailId, setHoveredDetailId] = useState<string | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>("lighthouse");
  const [selectedDetailAnchor, setSelectedDetailAnchor] = useState<DetailAnchor | null>(null);
  const [announcement, setAnnouncement] = useState("PharosVille ready.");
  const [reducedMotion, setReducedMotion] = useState(true);
  const [nightMode, setNightMode] = useState(false);
  const [autoNightCycle, setAutoNightCycle] = useState(false);
  const shellRef = useRef<HTMLElement | null>(null);
  const { exitFullscreen, fullscreenMode, toggleFullscreen } = useFullscreenMode(shellRef);

  // Memoize on a content signature instead of `world` identity so live data
  // refetches that don't change ship/dock/map/lighthouse-flicker fields reuse
  // the prior plan (and skip A* warmups). `world` is still passed to the
  // builder; the signature only gates re-memo.
  const baseMotionPlanSignature = motionPlanSignature(world);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseMotionPlan = useMemo(() => buildBaseMotionPlan(world), [baseMotionPlanSignature]);
  // `buildMotionPlan` only reads `world` to find the selected ship by id.
  // `baseMotionPlan` identity already keys on `motionPlanSignature(world)`, so
  // dropping `world` here avoids re-running the memo on world-ref churn that
  // doesn't change the signature.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const motionPlan = useMemo(() => buildMotionPlan(world, selectedDetailId, baseMotionPlan), [baseMotionPlan, selectedDetailId]);
  const shipsById = useMemo(() => new Map(world.ships.map((ship) => [ship.id, ship])), [world.ships]);
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
  // Camera-only re-projection path: reuses the existing record list (no
  // recordsById Map rebuild, no full sort, no per-entity asset/visibility
  // re-evaluation) and only re-projects screen rects + re-bins them in the
  // spatial index. Falls back to a full rebuild when no prior snapshot exists.
  const recomputeHitTargetsForCameraRef = useRef<() => HitTargetSnapshot | null>(() => null);
  const recomputeHitTargetsForCamera = useCallback((): HitTargetSnapshot | null => recomputeHitTargetsForCameraRef.current(), []);

  const assetPipeline = useAssetLoadingPipeline({ motionPlanRef, world });

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

  const handleSelectTarget = useCallback((target: HitTarget, point: ScreenPoint, viewport: ScreenPoint) => {
    selectDetail(target.detailId, detailAnchorForPoint(point, viewport));
  }, [selectDetail]);

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
    selectedDetailIdRef,
    selectedEntity,
    setHoveredDetailId,
    shipMotionSamplesRef,
    world,
  });

  // Wire the late-bound recompute callback now that the canvas hook has
  // exposed its refs. The ref-of-callback indirection lets the canvas hook's
  // pointer handlers reach this without forcing the render-loop hook to be
  // bound first.
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
  recomputeHitTargetsForCameraRef.current = (): HitTargetSnapshot | null => {
    const activeCamera = canvas.cameraRef.current;
    if (!activeCamera) return hitTargetSnapshotRef.current;
    const previous = hitTargetSnapshotRef.current;
    if (!previous) return recomputeHitTargetsRef.current();
    const activeCanvasSize = canvas.canvasSizeRef.current;
    const snapshot = recomputeHitTargetsForCameraOnly({
      assets: assetPipeline.assetManager,
      camera: activeCamera,
      hoveredDetailId: hoveredDetailIdRef.current,
      selectedDetailId: selectedDetailIdRef.current,
      shipMotionSamples: shipMotionSamplesRef.current,
      snapshot: previous,
      viewport: { height: activeCanvasSize.y, width: activeCanvasSize.x },
      world,
    });
    hitTargetSnapshotRef.current = snapshot;
    hitTargetsRef.current = snapshot.targets;
    return snapshot;
  };

  const { requestPaint } = useWorldRenderLoop({
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
    selectedDetailAnchor,
    selectedDetailId,
    selectedDetailIdRef,
    setCriticalFramePainted: assetPipeline.setCriticalFramePainted,
    shipMotionSamplesRef,
    shipsById,
    world,
  });

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

  // Camera-only re-projection on drag pan / wheel zoom / follow. Reuses the
  // existing record list and only re-projects screen rects + re-bins them in
  // the spatial index; ~60×/sec during drag previously paid for a full
  // recordsById rebuild + sort + spatial-index rebuild.
  useEffect(() => {
    recomputeHitTargetsForCamera();
    if (reducedMotion) requestPaint();
  }, [canvas.camera, recomputeHitTargetsForCamera, reducedMotion, requestPaint]);

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
    if (!autoNightCycle) return;
    const id = setInterval(() => setNightMode((n) => !n), 60_000);
    return () => clearInterval(id);
  }, [autoNightCycle]);

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
      onKeyDown={canvas.handleKeyDown}
      tabIndex={0}
    >
      <p id="pharosville-world-instructions" className="sr-only">
        Use the visible toolbar, wheel zoom, drag pan, arrow keys, and canvas selection to inspect PharosVille map data.
      </p>
      <canvas
        ref={canvas.canvasRef}
        className={hoveredDetailId ? "pharosville-canvas pharosville-canvas--selectable" : "pharosville-canvas"}
        data-testid="pharosville-canvas"
        aria-hidden="true"
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
            onFollowSelected={selectedEntity ? canvas.handleFollowSelected : undefined}
            onResetView={canvas.handleResetView}
            nightMode={nightMode}
            onToggleNightMode={() => setNightMode((n) => !n)}
            autoNightCycle={autoNightCycle}
            onToggleAutoNightCycle={() => setAutoNightCycle((a) => !a)}
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
      <a
        href="https://pharos.watch/"
        className="pharosville-home-button"
        aria-label="Go to Pharos homepage"
        title="Go to Pharos homepage"
      >
        <Home aria-hidden="true" size={24} />
      </a>
      <p className="pharosville-beta-tag" aria-label="PharosVille beta v0.1 — interpretive view, not financial advice">
        PharosVille beta v0.1 - Interpretive view, not financial advice
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

interface DetailAnchor extends ScreenPoint {
  side: "left" | "right";
}

function detailAnchorForPoint(point: ScreenPoint, viewport: ScreenPoint): DetailAnchor {
  const side = point.x > viewport.x * 0.6 ? "left" : "right";
  return { ...point, side };
}
