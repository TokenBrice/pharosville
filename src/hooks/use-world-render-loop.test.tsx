// @vitest-environment jsdom
import { useState } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PharosVilleAssetManager } from "../renderer/asset-manager";
import { createHitTargetSnapshot, type HitTarget, type HitTargetSnapshot } from "../renderer/hit-testing";
import { defaultCamera } from "../systems/camera";
import { initialAdaptiveDprState, resolveCanvasBudget } from "../systems/canvas-budget";
import { buildBaseMotionPlan, buildMotionPlan, type ShipMotionSample } from "../systems/motion";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import type { IsoCamera } from "../systems/projection";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import { useWorldRenderLoop, type UseWorldRenderLoopResult, type WorldCameraStepResult } from "./use-world-render-loop";

const { drawPharosVilleMock } = vi.hoisted(() => ({
  drawPharosVilleMock: vi.fn(() => ({
    drawableCount: 0,
    drawableCounts: { underlay: 0, body: 0, overlay: 0, selection: 0 },
    movingShipCount: 0,
    visibleShipCount: 0,
    visibleTileCount: 0,
  })),
}));

vi.mock("../renderer/world-canvas", () => ({
  drawPharosVille: drawPharosVilleMock,
}));

function makeStubCanvasContext(): CanvasRenderingContext2D {
  const noop = () => {};
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "canvas") return null;
      if (prop === "save" || prop === "restore" || prop === "setTransform" || prop === "translate" || prop === "scale" || prop === "rotate" || prop === "fillRect" || prop === "clearRect" || prop === "strokeRect" || prop === "beginPath" || prop === "closePath" || prop === "moveTo" || prop === "lineTo" || prop === "arc" || prop === "fill" || prop === "stroke" || prop === "drawImage" || prop === "fillText" || prop === "strokeText" || prop === "clip" || prop === "rect" || prop === "ellipse" || prop === "quadraticCurveTo" || prop === "bezierCurveTo" || prop === "setLineDash") {
        return noop;
      }
      if (prop === "measureText") return () => ({ width: 0 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient" || prop === "createPattern") {
        return () => ({ addColorStop: noop });
      }
      if (prop === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      return undefined;
    },
    set: () => true,
  };
  return new Proxy({}, handler) as CanvasRenderingContext2D;
}

describe("useWorldRenderLoop", () => {
  const world = buildPharosVilleWorld(makePharosVilleWorldInput());
  const canvasSize = { x: 800, y: 600 };
  const camera = defaultCamera({ width: canvasSize.x, height: canvasSize.y, map: world.map });

  let rafSpy: ReturnType<typeof vi.spyOn>;
  let cafSpy: ReturnType<typeof vi.spyOn>;
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let latestRafId = 0;
  let intersectionObservers: Array<{
    callback: IntersectionObserverCallback;
    target: Element | null;
    fire: (ratio: number) => void;
  }> = [];

  beforeEach(() => {
    drawPharosVilleMock.mockClear();
    // Don't fire scheduled callbacks during the test — we only care about
    // counts of cancel/request calls unless a test explicitly invokes one.
    let nextFrameId = 1;
    rafCallbacks = new Map();
    latestRafId = 0;
    rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextFrameId += 1;
      latestRafId = nextFrameId;
      rafCallbacks.set(nextFrameId, callback);
      return nextFrameId;
    });
    cafSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      rafCallbacks.delete(id);
    });
    HTMLCanvasElement.prototype.getContext = (function getContext() {
      return makeStubCanvasContext();
    }) as unknown as HTMLCanvasElement["getContext"];
    // Stub IntersectionObserver so the test can drive visibility transitions.
    intersectionObservers = [];
    const StubIntersectionObserver = class {
      callback: IntersectionObserverCallback;
      target: Element | null = null;
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        intersectionObservers.push({
          callback,
          target: null,
          fire: (ratio: number) => {
            const target = this.target;
            if (!target) return;
            this.callback([{ intersectionRatio: ratio, target } as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver);
          },
        });
      }
      observe(target: Element) {
        this.target = target;
        const entry = intersectionObservers[intersectionObservers.length - 1];
        if (entry) entry.target = target;
      }
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    };
    (window as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver
      = StubIntersectionObserver as unknown as typeof IntersectionObserver;
    (globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver
      = StubIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    rafSpy.mockRestore();
    cafSpy.mockRestore();
    delete (window as unknown as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
    delete (globalThis as unknown as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
  });

  function Harness({
    hoveredDetailId,
    initialRequestedDpr = 1,
    maximumRequestedDpr = 1,
    onInternals,
    onStepCamera,
    onResult,
    reducedMotion = true,
  }: {
    hoveredDetailId: string | null;
    initialRequestedDpr?: number;
    maximumRequestedDpr?: number;
    onInternals?: (internals: {
      adaptiveDprStateRef: { current: ReturnType<typeof initialAdaptiveDprState> };
      canvasBudgetRef: { current: ReturnType<typeof resolveCanvasBudget> | null };
      canvasRef: { current: HTMLCanvasElement };
    }) => void;
    onStepCamera?: (input: {
      cameraRef: { current: IsoCamera | null };
      now: number;
      samples: ReadonlyMap<string, ShipMotionSample>;
    }) => WorldCameraStepResult;
    onResult: (result: UseWorldRenderLoopResult) => void;
    reducedMotion?: boolean;
  }) {
    const [assetManager] = useState(() => new PharosVilleAssetManager());
    const [canvasRef] = useState(() => ({ current: document.createElement("canvas") }));
    const [adaptiveDprStateRef] = useState(() => ({ current: initialAdaptiveDprState(initialRequestedDpr) }));
    const [maximumRequestedDprRef] = useState(() => ({ current: maximumRequestedDpr }));
    const [canvasBudgetRef] = useState(() => ({
      current: resolveCanvasBudget({ cssHeight: canvasSize.y, cssWidth: canvasSize.x, requestedDpr: initialRequestedDpr }),
    }));
    const [cameraRef] = useState(() => ({ current: camera }));
    const [canvasSizeRef] = useState(() => ({ current: canvasSize }));
    const [hoveredDetailIdRef] = useState<{ current: string | null }>(() => ({ current: hoveredDetailId }));
    const [selectedDetailIdRef] = useState<{ current: string | null }>(() => ({ current: null }));
    const [hitTargetSnapshotRef] = useState<{ current: HitTargetSnapshot | null }>(() => ({ current: null }));
    const [hitTargetsRef] = useState<{ current: readonly HitTarget[] }>(() => ({ current: [] }));
    const [shipMotionSamplesRef] = useState<{ current: ReadonlyMap<string, ShipMotionSample> }>(() => ({ current: new Map() }));
    const [shipsById] = useState(() => new Map(world.ships.map((ship) => [ship.id, ship])));
    const [baseMotionPlan] = useState(() => buildBaseMotionPlan(world));
    const [motionPlan] = useState(() => buildMotionPlan(world, null, baseMotionPlan));
    const [motionPlanRef] = useState(() => ({ current: motionPlan }));
    hoveredDetailIdRef.current = hoveredDetailId;
    maximumRequestedDprRef.current = maximumRequestedDpr;
    onInternals?.({ adaptiveDprStateRef, canvasBudgetRef, canvasRef });

    // Pre-seed a snapshot so the loop's hit-target work has a target list.
    if (!hitTargetSnapshotRef.current) {
      const snapshot = createHitTargetSnapshot({
        assets: assetManager,
        camera,
        shipMotionSamples: new Map(),
        viewport: { height: canvasSize.y, width: canvasSize.x },
        world,
      });
      hitTargetSnapshotRef.current = snapshot;
      hitTargetsRef.current = snapshot.targets;
    }
    const stepCamera = (now: number, samples: ReadonlyMap<string, ShipMotionSample>): WorldCameraStepResult => {
      if (onStepCamera) return onStepCamera({ cameraRef, now, samples });
      return { camera: cameraRef.current, cameraChanged: false, cameraIntentActive: false };
    };

    const result = useWorldRenderLoop({
      adaptiveDprStateRef,
      assetLoadErrors: [],
      assetLoadTick: 0,
      assetManager,
      camera,
      cameraRef,
      canvasBudgetRef,
      canvasRef,
      canvasSize,
      canvasSizeRef,
      criticalAssetAttemptsSettled: true,
      criticalAssetsLoaded: true,
      deferredAssetsLoaded: true,
      hitTargetSnapshotRef,
      hitTargetsRef,
      hoveredDetailId,
      hoveredDetailIdRef,
      maximumRequestedDprRef,
      motionPlan,
      motionPlanRef,
      nightMode: false,
      reducedMotion,
      selectedDetailAnchor: null,
      selectedDetailId: null,
      selectedDetailIdRef,
      setCriticalFramePainted: () => {},
      shipMotionSamplesRef,
      shipsById,
      stepCamera,
      world,
    });
    onResult(result);
    return null;
  }

  function fireLatestRaf(time: number) {
    const callback = rafCallbacks.get(latestRafId);
    expect(callback).toBeDefined();
    rafCallbacks.delete(latestRafId);
    act(() => {
      callback!(time);
    });
  }

  it("does not rebind RAF effect across many hover changes under reduced motion", () => {
    let latest: UseWorldRenderLoopResult | null = null;
    const onResult = (r: UseWorldRenderLoopResult) => { latest = r; };
    const { rerender, unmount } = render(<Harness hoveredDetailId={null} onResult={onResult} />);

    const cancelsAfterMount = cafSpy.mock.calls.length;

    // Simulate ten hover changes.
    for (let i = 0; i < 10; i += 1) {
      act(() => {
        rerender(<Harness hoveredDetailId={`hover-${i}`} onResult={onResult} />);
      });
    }

    // No additional cancelAnimationFrame calls should have happened: the RAF
    // effect cleanup must not run on hover-only state changes.
    expect(cafSpy.mock.calls.length).toBe(cancelsAfterMount);

    // Sanity: the hook still exposed a stable requestPaint callback.
    expect(latest).not.toBeNull();
    expect(typeof latest!.requestPaint).toBe("function");

    unmount();
    // After unmount the cleanup runs at most once (it may be 0 if no RAF was
    // pending, since cancelAnimationFrame is only called when frameId !== 0).
    expect(cafSpy.mock.calls.length - cancelsAfterMount).toBeLessThanOrEqual(1);
  });

  it("requestPaint coalesces while a frame is pending under reduced motion", () => {
    let latest: UseWorldRenderLoopResult | null = null;
    const onResult = (r: UseWorldRenderLoopResult) => { latest = r; };
    render(<Harness hoveredDetailId={null} onResult={onResult} />);

    // Mount triggers an initial draw plus the assetLoadTick repaint, leaving a
    // RAF already pending (rafSpy was called at least once). Repeated
    // requestPaint() must not schedule additional frames while one is pending.
    const beforeRepeats = rafSpy.mock.calls.length;
    act(() => {
      latest!.requestPaint();
      latest!.requestPaint();
      latest!.requestPaint();
    });
    expect(rafSpy.mock.calls.length).toBe(beforeRepeats);
  });

  it("publishes frame pacing metrics from normal-motion RAF intervals", () => {
    const onResult = () => {};
    render(<Harness hoveredDetailId={null} onResult={onResult} reducedMotion={false} />);

    const base = performance.now() + 100;
    fireLatestRaf(base);
    fireLatestRaf(base + 16);
    fireLatestRaf(base + 56);
    fireLatestRaf(base + 96);
    fireLatestRaf(base + 112);

    const debug = (window as typeof window & {
      __pharosVilleDebug?: {
        renderMetrics?: {
          framePacing?: {
            averageMs: number;
            droppedFrameCount: number;
            effectiveFps: number;
            longestDroppedBurst: number;
            maxMs: number;
            p50Ms: number;
            p90Ms: number;
            sampleCount: number;
          };
        };
      };
    }).__pharosVilleDebug;
    const framePacing = debug?.renderMetrics?.framePacing;

    expect(framePacing).toBeDefined();
    expect(framePacing!.sampleCount).toBe(5);
    expect(framePacing!.averageMs).toBeGreaterThan(0);
    expect(framePacing!.effectiveFps).toBeGreaterThan(0);
    expect(framePacing!.p50Ms).toBeGreaterThan(0);
    expect(framePacing!.p90Ms).toBeGreaterThanOrEqual(framePacing!.p50Ms);
    expect(framePacing!.maxMs).toBeGreaterThanOrEqual(40);
    expect(framePacing!.droppedFrameCount).toBeGreaterThanOrEqual(2);
    expect(framePacing!.longestDroppedBurst).toBe(2);
  });

  it("defers adaptive DPR backing-store resize until the next frame can repaint", () => {
    let internals: {
      adaptiveDprStateRef: { current: ReturnType<typeof initialAdaptiveDprState> };
      canvasBudgetRef: { current: ReturnType<typeof resolveCanvasBudget> | null };
      canvasRef: { current: HTMLCanvasElement };
    } | null = null;
    let fakeNow = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => fakeNow);
    drawPharosVilleMock.mockImplementation(() => {
      fakeNow += 25;
      return {
        drawableCount: 0,
        drawableCounts: { underlay: 0, body: 0, overlay: 0, selection: 0 },
        movingShipCount: 0,
        visibleShipCount: 0,
        visibleTileCount: 0,
      };
    });

    try {
      render(
        <Harness
          hoveredDetailId={null}
          initialRequestedDpr={2}
          maximumRequestedDpr={2}
          onInternals={(nextInternals) => {
            internals = nextInternals;
          }}
          onResult={() => {}}
          reducedMotion={false}
        />,
      );

      expect(internals).not.toBeNull();
      const canvas = internals!.canvasRef.current;
      expect(canvas.width).toBe(1600);
      expect(canvas.height).toBe(1200);

      let downshifted = false;
      for (let index = 0; index < 32; index += 1) {
        fireLatestRaf(1_000 + index * 16);
        if (internals!.adaptiveDprStateRef.current.requestedDpr < 2) {
          downshifted = true;
          break;
        }
      }

      expect(downshifted).toBe(true);
      expect(internals!.adaptiveDprStateRef.current.requestedDpr).toBe(1.875);
      expect(internals!.canvasBudgetRef.current?.backingWidth).toBe(1500);
      expect(internals!.canvasBudgetRef.current?.backingHeight).toBe(1125);
      // The just-painted frame remains visible; resizing here would clear the
      // canvas to black until the browser gets another RAF.
      expect(canvas.width).toBe(1600);
      expect(canvas.height).toBe(1200);

      fireLatestRaf(2_000);
      expect(canvas.width).toBe(1500);
      expect(canvas.height).toBe(1125);
    } finally {
      nowSpy.mockRestore();
      drawPharosVilleMock.mockImplementation(() => ({
        drawableCount: 0,
        drawableCounts: { underlay: 0, body: 0, overlay: 0, selection: 0 },
        movingShipCount: 0,
        visibleShipCount: 0,
        visibleTileCount: 0,
      }));
    }
  });

  it("does not turn reduced-motion paints into a continuous frame-pacing loop", () => {
    const onResult = () => {};
    render(<Harness hoveredDetailId={null} onResult={onResult} />);

    const beforePaint = rafSpy.mock.calls.length;
    fireLatestRaf(performance.now() + 100);
    expect(rafSpy.mock.calls.length).toBe(beforePaint);

    const debug = (window as typeof window & {
      __pharosVilleDebug?: {
        renderMetrics?: {
          framePacing?: { sampleCount: number };
        };
      };
    }).__pharosVilleDebug;
    expect(debug?.renderMetrics?.framePacing?.sampleCount).toBe(0);
  });

  it("accepts onBucketFlip callback without error and does not call it on initial mount (B2)", () => {
    // B2 lifecycle wiring: verify onBucketFlip is wired into the interface and
    // does not fire on the initial frame (accSeconds starts at 0, bucket=0,
    // which equals lastBucketRef=0 so no flip). A full bucket-flip integration
    // test (requiring 600s of simulated clock) is deferred to a Playwright lane
    // because the jsdom RAF mock only runs drawFrame once at mount.
    const bucketFlipSpy = vi.fn();
    function HarnessWithBucketFlip() {
      const [assetManager] = useState(() => new PharosVilleAssetManager());
      const [canvasRef] = useState(() => ({ current: document.createElement("canvas") }));
      const [adaptiveDprStateRef] = useState(() => ({ current: initialAdaptiveDprState(1) }));
      const [maximumRequestedDprRef] = useState(() => ({ current: 1 }));
      const [canvasBudgetRef] = useState(() => ({
        current: resolveCanvasBudget({ cssHeight: canvasSize.y, cssWidth: canvasSize.x, requestedDpr: 1 }),
      }));
      const [cameraRef] = useState(() => ({ current: camera }));
      const [canvasSizeRef] = useState(() => ({ current: canvasSize }));
      const [hoveredDetailIdRef] = useState<{ current: string | null }>(() => ({ current: null }));
      const [selectedDetailIdRef] = useState<{ current: string | null }>(() => ({ current: null }));
      const [hitTargetSnapshotRef] = useState<{ current: HitTargetSnapshot | null }>(() => ({ current: null }));
      const [hitTargetsRef] = useState<{ current: readonly HitTarget[] }>(() => ({ current: [] }));
      const [shipMotionSamplesRef] = useState<{ current: ReadonlyMap<string, ShipMotionSample> }>(() => ({ current: new Map() }));
      const [shipsById] = useState(() => new Map(world.ships.map((ship) => [ship.id, ship])));
      const [baseMotionPlan] = useState(() => buildBaseMotionPlan(world));
      const [motionPlan] = useState(() => buildMotionPlan(world, null, baseMotionPlan));
      const [motionPlanRef] = useState(() => ({ current: motionPlan }));
      useWorldRenderLoop({
        onBucketFlip: bucketFlipSpy,
        adaptiveDprStateRef,
        assetLoadErrors: [],
        assetLoadTick: 0,
        assetManager,
        camera,
        cameraRef,
        canvasBudgetRef,
        canvasRef,
        canvasSize,
        canvasSizeRef,
        criticalAssetAttemptsSettled: true,
        criticalAssetsLoaded: true,
        deferredAssetsLoaded: true,
        hitTargetSnapshotRef,
        hitTargetsRef,
        hoveredDetailId: null,
        hoveredDetailIdRef,
        maximumRequestedDprRef,
        motionPlan,
        motionPlanRef,
        nightMode: false,
        reducedMotion: false,
        selectedDetailAnchor: null,
        selectedDetailId: null,
        selectedDetailIdRef,
        setCriticalFramePainted: () => {},
        shipMotionSamplesRef,
        shipsById,
        stepCamera: () => ({ camera: cameraRef.current, cameraChanged: false, cameraIntentActive: false }),
        world,
      });
      return null;
    }
    const { unmount } = render(<HarnessWithBucketFlip />);
    // Initial drawFrame runs with accSeconds=0 (bucket 0 = lastBucket 0): no flip.
    expect(bucketFlipSpy).not.toHaveBeenCalled();
    unmount();
  });

  it("pauses RAF when canvas reports intersectionRatio 0 and resumes when it goes back to 1", () => {
    let latest: UseWorldRenderLoopResult | null = null;
    const onResult = (r: UseWorldRenderLoopResult) => { latest = r; };
    render(<Harness hoveredDetailId={null} onResult={onResult} />);

    // Find the IntersectionObserver instance attached to the canvas.
    const observer = intersectionObservers.find((entry) => entry.target !== null);
    expect(observer).toBeDefined();

    // Drive the canvas offscreen — requestPaint() must NOT schedule a frame.
    act(() => observer!.fire(0));
    const rafsAfterOffscreen = rafSpy.mock.calls.length;
    act(() => latest!.requestPaint());
    expect(rafSpy.mock.calls.length).toBe(rafsAfterOffscreen);

    // Drive it back onscreen — the visibility transition itself should
    // schedule a one-shot frame to repaint the current state.
    act(() => observer!.fire(1));
    expect(rafSpy.mock.calls.length).toBeGreaterThan(rafsAfterOffscreen);
  });

  it("steps camera after ship samples and draws with the updated camera", () => {
    const nextCamera = { ...camera, offsetX: camera.offsetX + 48, offsetY: camera.offsetY - 12 };
    let samplesAtStep = 0;
    render(
      <Harness
        hoveredDetailId={null}
        onResult={() => {}}
        reducedMotion={false}
        onStepCamera={({ cameraRef, samples }) => {
          samplesAtStep = samples.size;
          cameraRef.current = nextCamera;
          return { camera: nextCamera, cameraChanged: true, cameraIntentActive: true };
        }}
      />,
    );

    expect(samplesAtStep).toBe(world.ships.length);
    expect(drawPharosVilleMock).toHaveBeenCalled();
    const drawCalls = drawPharosVilleMock.mock.calls as unknown as Array<[{
      camera: IsoCamera;
      targets: readonly HitTarget[];
    }]>;
    const lastCall = drawCalls[drawCalls.length - 1]![0];
    expect(lastCall.camera).toEqual(nextCamera);

    const originalSnapshot = createHitTargetSnapshot({
      assets: new PharosVilleAssetManager(),
      camera,
      shipMotionSamples: new Map(),
      viewport: { height: canvasSize.y, width: canvasSize.x },
      world,
    });
    const shiftedSnapshot = createHitTargetSnapshot({
      assets: new PharosVilleAssetManager(),
      camera: nextCamera,
      shipMotionSamples: new Map(),
      viewport: { height: canvasSize.y, width: canvasSize.x },
      world,
    });
    const drawnLighthouse = lastCall.targets.find((target) => target.detailId === "lighthouse");
    const originalLighthouse = originalSnapshot.targetsByDetailId.get("lighthouse");
    const shiftedLighthouse = shiftedSnapshot.targetsByDetailId.get("lighthouse");

    expect(drawnLighthouse?.rect.x).not.toBe(originalLighthouse?.rect.x);
    expect(drawnLighthouse?.rect.x).toBeCloseTo(shiftedLighthouse!.rect.x);
    expect(drawnLighthouse?.rect.y).toBeCloseTo(shiftedLighthouse!.rect.y);
  });

  it("publishes camera loop proof fields", () => {
    render(<Harness hoveredDetailId={null} onResult={() => {}} reducedMotion={false} />);

    const debug = (window as typeof window & {
      __pharosVilleDebug?: {
        activeCameraLoopCount?: number;
        cameraFrameSource?: string;
      };
    }).__pharosVilleDebug;

    expect(debug?.activeCameraLoopCount).toBe(0);
    expect(debug?.cameraFrameSource).toBe("world-render-loop");
  });
});
