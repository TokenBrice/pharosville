// @vitest-environment jsdom
import { useMemo, useState, type ReactElement } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGardenObservatoryHitTargetSnapshot } from "../renderer/garden-observatory-hit-testing";
import type { HitTarget, HitTargetSnapshot } from "../renderer/hit-testing";
import type {
  CreateThreeWorldRendererInput,
  ThreeLogoAssets,
  ThreeWorldRendererFrame,
} from "../renderer/world-renderer-backend";
import {
  RENDER_SCHEDULER_IDLE_AFTER_MS,
  RENDER_SCHEDULER_IDLE_TARGET_FRAME_MS,
} from "../renderer/render-scheduler";
import { defaultCamera } from "../systems/camera";
import { initialAdaptiveDprState, resolveRenderSurfaceBudget } from "../systems/render-surface-budget";
import { buildBaseMotionPlan, buildMotionPlan, type ShipMotionSample } from "../systems/motion";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import type { IsoCamera } from "../systems/projection";
import type { PharosVilleWorld } from "../systems/world-types";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import {
  useWorldRenderLoop,
  type UseWorldRenderLoopResult,
  type WorldCameraStepResult,
} from "./use-world-render-loop";

const {
  createThreeWorldRendererMock,
  disposeThreeWorldRendererMock,
  renderThreeWorldMock,
  warmupThreeWorldMock,
} = vi.hoisted(() => {
  const renderThreeWorldMock = vi.fn(() => ({
    objectCount: 0,
    drawOwnerCensus: null,
    gpu: { calls: 0, geometries: 0, lines: 0, points: 0, textures: 0, triangles: 0 },
    movingShipCount: 0,
    rendererBackend: "three" as const,
    visibleShipCount: 0,
  }));
  const disposeThreeWorldRendererMock = vi.fn();
  const warmupThreeWorldMock = vi.fn(() => Promise.resolve());
  return {
    createThreeWorldRendererMock: vi.fn(() => ({
      dispose: disposeThreeWorldRendererMock,
      render: renderThreeWorldMock,
      warmup: warmupThreeWorldMock,
    })),
    disposeThreeWorldRendererMock,
    renderThreeWorldMock,
    warmupThreeWorldMock,
  };
});

const emptyLogoAssets: ThreeLogoAssets = {
  getLogo: () => null,
  getLogoGenerationKey: () => "test",
};

vi.mock("../three/world-renderer", () => ({
  createThreeWorldRenderer: createThreeWorldRendererMock,
}));

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
    createThreeWorldRendererMock.mockClear();
    disposeThreeWorldRendererMock.mockClear();
    renderThreeWorldMock.mockClear();
    warmupThreeWorldMock.mockClear();
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
    motionBucket = 0,
    mountEpochMs = 0,
    onBucketFlip,
    onInternals,
    onStepCamera,
    onResult,
    preseedSnapshot = true,
    reducedMotion = true,
    wallClockHour = 12,
    worldOverride,
  }: {
    hoveredDetailId: string | null;
    initialRequestedDpr?: number;
    maximumRequestedDpr?: number;
    motionBucket?: number;
    mountEpochMs?: number;
    onBucketFlip?: (bucket: number) => void;
    onInternals?: (internals: {
      adaptiveDprStateRef: { current: ReturnType<typeof initialAdaptiveDprState> };
      surfaceBudgetRef: { current: ReturnType<typeof resolveRenderSurfaceBudget> | null };
      cameraRef: { current: IsoCamera | null };
      canvasRef: { current: HTMLCanvasElement };
      canvasSizeRef: { current: { x: number; y: number } };
      hitTargetsRef: { current: readonly HitTarget[] };
      shipMotionSamplesRef: { current: ReadonlyMap<string, ShipMotionSample> };
    }) => void;
    onStepCamera?: (input: {
      cameraRef: { current: IsoCamera | null };
      now: number;
      samples: ReadonlyMap<string, ShipMotionSample>;
    }) => WorldCameraStepResult;
    onResult: (result: UseWorldRenderLoopResult) => void;
    preseedSnapshot?: boolean;
    reducedMotion?: boolean;
    wallClockHour?: number;
    worldOverride?: PharosVilleWorld;
  }) {
    const harnessWorld = worldOverride ?? world;
    const [canvasRef] = useState(() => ({ current: document.createElement("canvas") }));
    const [adaptiveDprStateRef] = useState(() => ({ current: initialAdaptiveDprState(initialRequestedDpr) }));
    const [maximumRequestedDprRef] = useState(() => ({ current: maximumRequestedDpr }));
    const [surfaceBudgetRef] = useState(() => ({
      current: resolveRenderSurfaceBudget({ cssHeight: canvasSize.y, cssWidth: canvasSize.x, requestedDpr: initialRequestedDpr }),
    }));
    const [cameraRef] = useState(() => ({ current: camera }));
    const [canvasSizeRef] = useState(() => ({ current: canvasSize }));
    const [hoveredDetailIdRef] = useState<{ current: string | null }>(() => ({ current: hoveredDetailId }));
    const [selectedDetailIdRef] = useState<{ current: string | null }>(() => ({ current: null }));
    const [hitTargetSnapshotRef] = useState<{ current: HitTargetSnapshot | null }>(() => ({ current: null }));
    const [hitTargetsRef] = useState<{ current: readonly HitTarget[] }>(() => ({ current: [] }));
    const [shipMotionSamplesRef] = useState<{ current: ReadonlyMap<string, ShipMotionSample> }>(() => ({ current: new Map() }));
    const shipsById = useMemo(
      () => new Map(harnessWorld.ships.map((ship) => [ship.id, ship])),
      [harnessWorld],
    );
    const baseMotionPlan = useMemo(
      () => buildBaseMotionPlan(harnessWorld, motionBucket * 600),
      [harnessWorld, motionBucket],
    );
    const motionPlan = useMemo(
      () => buildMotionPlan(harnessWorld, null, baseMotionPlan),
      [baseMotionPlan, harnessWorld],
    );
    const [motionPlanRef] = useState(() => ({ current: motionPlan }));
    const [mountEpochMsRef] = useState(() => ({ current: mountEpochMs }));
    hoveredDetailIdRef.current = hoveredDetailId;
    maximumRequestedDprRef.current = maximumRequestedDpr;
    onInternals?.({
      adaptiveDprStateRef,
      cameraRef,
      surfaceBudgetRef,
      canvasRef,
      canvasSizeRef,
      hitTargetsRef,
      shipMotionSamplesRef,
    });

    // Pre-seed a snapshot so the loop's hit-target work has a target list.
    if (preseedSnapshot && !hitTargetSnapshotRef.current) {
      const snapshot = createGardenObservatoryHitTargetSnapshot({
        camera,
        hoveredDetailId,
        selectedDetailId: null,
        shipMotionSamples: new Map(),
        viewport: { height: canvasSize.y, width: canvasSize.x },
        world: harnessWorld,
      });
      hitTargetSnapshotRef.current = snapshot;
      hitTargetsRef.current = snapshot.targets;
    }
    const stepCamera = (now: number, samples: ReadonlyMap<string, ShipMotionSample>): WorldCameraStepResult => {
      if (onStepCamera) return onStepCamera({ cameraRef, now, samples });
      return { camera: cameraRef.current, cameraChanged: false, cameraIntentActive: false };
    };

    const result = useWorldRenderLoop({
      ...(onBucketFlip ? { onBucketFlip } : {}),
      adaptiveDprStateRef,
      logoGeneration: 0,
      logos: emptyLogoAssets,
      camera,
      cameraRef,
      surfaceBudgetRef,
      canvasRef,
      canvasSize,
      canvasSizeRef,
      hitTargetSnapshotRef,
      hitTargetsRef,
      hoveredDetailId,
      hoveredDetailIdRef,
      maximumRequestedDprRef,
      mountEpochMsRef,
      motionPlan,
      motionPlanRef,
      reducedMotion,
      selectedDetailAnchor: null,
      selectedDetailId: null,
      selectedDetailIdRef,
      shipMotionSamplesRef,
      shipsById,
      stepCamera,
      wallClockHour,
      world: harnessWorld,
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

  function lastDrawnFrame(): ThreeWorldRendererFrame {
    const drawCalls = renderThreeWorldMock.mock.calls as unknown as Array<[ThreeWorldRendererFrame]>;
    return drawCalls[drawCalls.length - 1]![0];
  }

  function framePacingSampleCount(): number {
    return (window as typeof window & {
      __pharosVilleDebug?: { renderMetrics?: { framePacing?: { sampleCount: number } } };
    }).__pharosVilleDebug?.renderMetrics?.framePacing?.sampleCount ?? -1;
  }

  async function renderWithReadyRenderer(ui: ReactElement) {
    const result = render(ui);
    await act(async () => {
      await import("../three/world-renderer");
    });
    expect(createThreeWorldRendererMock).toHaveBeenCalled();
    return result;
  }

  it("does not rebind RAF effect across many hover changes under reduced motion", async () => {
    let latest: UseWorldRenderLoopResult | null = null;
    const onResult = (r: UseWorldRenderLoopResult) => { latest = r; };
    const { rerender, unmount } = await renderWithReadyRenderer(<Harness hoveredDetailId={null} onResult={onResult} />);

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

  it("disposes the Three renderer only when the loop owner unmounts", async () => {
    const { rerender, unmount } = await renderWithReadyRenderer(<Harness hoveredDetailId={null} onResult={() => {}} />);

    rerender(<Harness hoveredDetailId="ship.hover-only" onResult={() => {}} />);
    expect(disposeThreeWorldRendererMock).not.toHaveBeenCalled();

    unmount();
    expect(disposeThreeWorldRendererMock).toHaveBeenCalledTimes(1);
  });

  it("reports Three loading and ready states", async () => {
    const statuses: UseWorldRenderLoopResult["rendererStatus"][] = [];
    await renderWithReadyRenderer(
      <Harness
        hoveredDetailId={null}
        onResult={(result) => {
          statuses.push(result.rendererStatus);
        }}
      />,
    );

    expect(statuses).toContain("loading");
    expect(statuses.at(-1)).toBe("ready");
  });

  it("publishes arrival readiness only after the compiled-scene warmup", async () => {
    let latest: UseWorldRenderLoopResult | null = null;
    await renderWithReadyRenderer(
      <Harness hoveredDetailId={null} onResult={(result) => { latest = result; }} />,
    );
    await act(async () => Promise.resolve());

    expect(warmupThreeWorldMock).toHaveBeenCalledTimes(1);
    expect((latest as UseWorldRenderLoopResult | null)?.rendererWarmupReady).toBe(true);
  });

  it("fails cleanly when the WebGL context is lost", async () => {
    let latest: UseWorldRenderLoopResult | null = null;
    await renderWithReadyRenderer(
      <Harness hoveredDetailId={null} onResult={(result) => {
        latest = result;
      }} />,
    );
    const createCalls = createThreeWorldRendererMock.mock.calls as unknown as Array<[CreateThreeWorldRendererInput]>;

    act(() => {
      createCalls[0]![0].onContextFailure("WebGL context lost");
    });

    expect((latest as UseWorldRenderLoopResult | null)?.rendererStatus).toBe("failed");
    expect((latest as UseWorldRenderLoopResult | null)?.rendererFailure).toBe("WebGL context lost");
    expect(disposeThreeWorldRendererMock).toHaveBeenCalledTimes(1);
  });

  it("requestPaint coalesces while a frame is pending under reduced motion", async () => {
    let latest: UseWorldRenderLoopResult | null = null;
    const onResult = (r: UseWorldRenderLoopResult) => { latest = r; };
    await renderWithReadyRenderer(<Harness hoveredDetailId={null} onResult={onResult} />);

    act(() => {
      latest!.requestPaint();
    });
    // Repeated requestPaint() calls must not schedule additional frames while
    // the first requested frame is pending.
    const beforeRepeats = rafSpy.mock.calls.length;
    act(() => {
      latest!.requestPaint();
      latest!.requestPaint();
      latest!.requestPaint();
    });
    expect(rafSpy.mock.calls.length).toBe(beforeRepeats);
  });

  it("publishes frame pacing metrics from normal-motion RAF intervals", async () => {
    let latest: UseWorldRenderLoopResult | null = null;
    const onResult = (r: UseWorldRenderLoopResult) => { latest = r; };
    await renderWithReadyRenderer(<Harness hoveredDetailId={null} onResult={onResult} reducedMotion={false} />);

    // The first frames after a world lands carry the build, not a rendering
    // cost, so the loop keeps WORLD_SWAP_SETTLE_FRAMES of them out of the
    // pacing window. Burn them before the intervals under test.
    const settle = performance.now() + 10;
    fireLatestRaf(settle);

    const base = settle + 100;
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
    const latestResult = latest as UseWorldRenderLoopResult | null;
    expect(latestResult?.frameRateFps ?? 0).toBeGreaterThan(0);
  });

  it("publishes time to first coherent frame from the mount epoch", async () => {
    const nowSpy = vi.spyOn(performance, "now").mockReturnValue(250);
    try {
      await renderWithReadyRenderer(<Harness hoveredDetailId={null} mountEpochMs={100} onResult={() => {}} />);

      const debug = (window as typeof window & {
        __pharosVilleDebug?: {
          renderMetrics?: {
            timeToFirstCoherentFrameMs?: number;
          };
        };
      }).__pharosVilleDebug;

      expect(debug?.renderMetrics?.timeToFirstCoherentFrameMs).toBe(150);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("applies an adaptive DPR change on the next Three render", async () => {
    let internals: {
      adaptiveDprStateRef: { current: ReturnType<typeof initialAdaptiveDprState> };
      surfaceBudgetRef: { current: ReturnType<typeof resolveRenderSurfaceBudget> | null };
      canvasRef: { current: HTMLCanvasElement };
    } | null = null;
    let fakeNow = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => fakeNow);
    renderThreeWorldMock.mockImplementation(() => {
      fakeNow += 25;
      return {
        objectCount: 0,
        drawOwnerCensus: null,
        gpu: { calls: 0, geometries: 0, lines: 0, points: 0, textures: 0, triangles: 0 },
        movingShipCount: 0,
        rendererBackend: "three",
        visibleShipCount: 0,
      };
    });

    try {
      await renderWithReadyRenderer(
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
      expect(renderThreeWorldMock).toHaveBeenLastCalledWith(expect.objectContaining({ dpr: 2 }));

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
      expect(internals!.surfaceBudgetRef.current?.backingWidth).toBe(1500);
      expect(internals!.surfaceBudgetRef.current?.backingHeight).toBe(1125);
      expect(renderThreeWorldMock).toHaveBeenLastCalledWith(expect.objectContaining({ dpr: 2 }));

      fireLatestRaf(2_000);
      expect(renderThreeWorldMock).toHaveBeenLastCalledWith(expect.objectContaining({ dpr: 1.875 }));
    } finally {
      nowSpy.mockRestore();
      renderThreeWorldMock.mockImplementation(() => ({
        objectCount: 0,
        drawOwnerCensus: null,
        gpu: { calls: 0, geometries: 0, lines: 0, points: 0, textures: 0, triangles: 0 },
        movingShipCount: 0,
        rendererBackend: "three",
        visibleShipCount: 0,
      }));
    }
  });

  it("does not turn reduced-motion paints into a continuous frame-pacing loop", async () => {
    const onResult = () => {};
    let latest: UseWorldRenderLoopResult | null = null;
    await renderWithReadyRenderer(<Harness hoveredDetailId={null} onResult={(result) => {
      latest = result;
      onResult();
    }} />);

    act(() => latest!.requestPaint());
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

  it("advances the route bucket under reduced motion without starting a continuous RAF loop", async () => {
    vi.useFakeTimers();
    const bucketFlipSpy = vi.fn();
    let latest: UseWorldRenderLoopResult | null = null;

    function BucketHarness() {
      const [bucket, setBucket] = useState(0);
      return (
        <Harness
          hoveredDetailId={null}
          motionBucket={bucket}
          onBucketFlip={(nextBucket) => {
            bucketFlipSpy(nextBucket);
            setBucket(nextBucket);
          }}
          onResult={(result) => {
            latest = result;
          }}
        />
      );
    }

    try {
      await renderWithReadyRenderer(<BucketHarness />);
      const latestResult = latest as UseWorldRenderLoopResult | null;
      expect(latestResult?.requestPaint).toBeDefined();

      act(() => latestResult!.requestPaint());
      fireLatestRaf(1);
      const rafsAfterInitialPaint = rafSpy.mock.calls.length;
      const drawsAfterInitialPaint = renderThreeWorldMock.mock.calls.length;

      act(() => {
        vi.advanceTimersByTime(599_999);
      });
      expect(bucketFlipSpy).not.toHaveBeenCalled();
      expect(rafSpy.mock.calls.length).toBe(rafsAfterInitialPaint);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(bucketFlipSpy).toHaveBeenCalledTimes(1);
      expect(bucketFlipSpy).toHaveBeenLastCalledWith(1);
      expect(rafSpy.mock.calls.length).toBe(rafsAfterInitialPaint + 1);

      fireLatestRaf(600_000);
      expect(renderThreeWorldMock.mock.calls.length).toBe(drawsAfterInitialPaint + 1);
      expect(rafSpy.mock.calls.length).toBe(rafsAfterInitialPaint + 1);

      const drawCalls = renderThreeWorldMock.mock.calls as unknown as Array<[ThreeWorldRendererFrame]>;
      const lastCall = drawCalls[drawCalls.length - 1]![0];
      expect(lastCall.reducedMotion).toBe(true);
      expect(lastCall.timeSeconds).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the animated RAF loop scheduled when the active camera ref is temporarily unavailable", async () => {
    let internals: {
      cameraRef: { current: IsoCamera | null };
    } | null = null;
    await renderWithReadyRenderer(
      <Harness
        hoveredDetailId={null}
        onInternals={(nextInternals) => {
          internals = nextInternals;
        }}
        onResult={() => {}}
        reducedMotion={false}
      />,
    );

    expect(internals).not.toBeNull();
    const beforeFrame = rafSpy.mock.calls.length;
    internals!.cameraRef.current = null;
    fireLatestRaf(performance.now() + 100);

    expect(rafSpy.mock.calls.length).toBe(beforeFrame + 1);
  });

  it("keeps the animated RAF loop scheduled when the camera step returns no frame camera", async () => {
    await renderWithReadyRenderer(
      <Harness
        hoveredDetailId={null}
        onResult={() => {}}
        onStepCamera={() => ({ camera: null, cameraChanged: false, cameraIntentActive: false })}
        reducedMotion={false}
      />,
    );

    const beforeFrame = rafSpy.mock.calls.length;
    fireLatestRaf(performance.now() + 100);

    expect(rafSpy.mock.calls.length).toBe(beforeFrame + 1);
  });

  it("passes the resolved wall-clock hour into renderer motion state", async () => {
    await renderWithReadyRenderer(<Harness hoveredDetailId={null} onResult={() => {}} wallClockHour={22.5} />);

    expect(renderThreeWorldMock).toHaveBeenCalled();
    const drawCalls = renderThreeWorldMock.mock.calls as unknown as Array<[ThreeWorldRendererFrame]>;
    const lastCall = drawCalls[drawCalls.length - 1]![0];
    expect(lastCall.wallClockHour).toBe(22.5);
    expect(lastCall.seaState.reducedMotion).toBe(true);
    expect(lastCall.seaState.source.nightFactor).toBe(1);
  });

  it("preserves the current hover when building the initial hit-target snapshot", async () => {
    const hoveredShip = world.ships[0]!;
    await renderWithReadyRenderer(
      <Harness
        hoveredDetailId={hoveredShip.detailId}
        onInternals={({ canvasSizeRef }) => {
          canvasSizeRef.current = { x: 1, y: 1 };
        }}
        onResult={() => {}}
        preseedSnapshot={false}
      />,
    );

    expect(renderThreeWorldMock).toHaveBeenCalled();
    const drawCalls = renderThreeWorldMock.mock.calls as unknown as Array<[ThreeWorldRendererFrame]>;
    const lastCall = drawCalls[drawCalls.length - 1]![0];
    expect(lastCall.hoveredDetailId).toBe(hoveredShip.detailId);
  });

  it("accepts onBucketFlip callback without error and does not call it on initial mount (B2)", async () => {
    // B2 lifecycle wiring: verify onBucketFlip is wired into the interface and
    // does not fire on the initial frame (accSeconds starts at 0, bucket=0,
    // which equals lastBucketRef=0 so no flip). A full bucket-flip integration
    // test (requiring 600s of simulated clock) is deferred to a Playwright lane
    // because the jsdom RAF mock only runs drawFrame once at mount.
    const bucketFlipSpy = vi.fn();
    function HarnessWithBucketFlip() {
      const [canvasRef] = useState(() => ({ current: document.createElement("canvas") }));
      const [adaptiveDprStateRef] = useState(() => ({ current: initialAdaptiveDprState(1) }));
      const [maximumRequestedDprRef] = useState(() => ({ current: 1 }));
      const [surfaceBudgetRef] = useState(() => ({
        current: resolveRenderSurfaceBudget({ cssHeight: canvasSize.y, cssWidth: canvasSize.x, requestedDpr: 1 }),
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
      const [mountEpochMsRef] = useState(() => ({ current: 0 }));
      useWorldRenderLoop({
        onBucketFlip: bucketFlipSpy,
        adaptiveDprStateRef,
        logoGeneration: 0,
        logos: emptyLogoAssets,
        camera,
        cameraRef,
        surfaceBudgetRef,
        canvasRef,
        canvasSize,
        canvasSizeRef,
        hitTargetSnapshotRef,
        hitTargetsRef,
        hoveredDetailId: null,
        hoveredDetailIdRef,
        maximumRequestedDprRef,
        mountEpochMsRef,
        motionPlan,
        motionPlanRef,
        reducedMotion: false,
        selectedDetailAnchor: null,
        selectedDetailId: null,
        selectedDetailIdRef,
        shipMotionSamplesRef,
        shipsById,
        stepCamera: () => ({ camera: cameraRef.current, cameraChanged: false, cameraIntentActive: false }),
        wallClockHour: 12,
        world,
      });
      return null;
    }
    const { unmount } = await renderWithReadyRenderer(<HarnessWithBucketFlip />);
    // Initial drawFrame runs with accSeconds=0 (bucket 0 = lastBucket 0): no flip.
    expect(bucketFlipSpy).not.toHaveBeenCalled();
    unmount();
  });

  it("keeps the RAF lifecycle across metadata-only refreshes and rebinds for visual content", async () => {
    const onResult = () => {};
    const metadataOnlyWorld: PharosVilleWorld = {
      ...world,
      freshness: { ...world.freshness, stablecoinsStale: !world.freshness.stablecoinsStale },
      generatedAt: (world.generatedAt ?? 0) + 60_000,
    };
    const subject = world.ships[0]!;
    const visuallyChangedWorld: PharosVilleWorld = {
      ...metadataOnlyWorld,
      ships: metadataOnlyWorld.ships.map((ship) => (
        ship.id === subject.id
          ? {
              ...ship,
              visual: {
                ...ship.visual,
                overlay: ship.visual.overlay === "nav" ? "yield" : "nav",
              },
            }
          : ship
      )),
    };
    const { rerender } = await renderWithReadyRenderer(
      <Harness hoveredDetailId={null} onResult={onResult} worldOverride={world} />,
    );
    const cancelsAfterMount = cafSpy.mock.calls.length;
    const observersAfterMount = intersectionObservers.length;

    act(() => {
      rerender(
        <Harness
          hoveredDetailId={null}
          onResult={onResult}
          worldOverride={metadataOnlyWorld}
        />,
      );
    });
    expect(cafSpy.mock.calls.length).toBe(cancelsAfterMount);
    expect(intersectionObservers).toHaveLength(observersAfterMount);

    act(() => {
      rerender(
        <Harness
          hoveredDetailId={null}
          onResult={onResult}
          worldOverride={visuallyChangedWorld}
        />,
      );
    });
    expect(cafSpy.mock.calls.length).toBeGreaterThan(cancelsAfterMount);
    expect(intersectionObservers.length).toBeGreaterThan(observersAfterMount);
  });

  it("keeps environment time monotonic across visual content replacement", async () => {
    const subject = world.ships[0]!;
    const visuallyChangedWorld: PharosVilleWorld = {
      ...world,
      ships: world.ships.map((ship) => (
        ship.id === subject.id
          ? {
              ...ship,
              visual: {
                ...ship.visual,
                overlay: ship.visual.overlay === "nav" ? "yield" : "nav",
              },
            }
          : ship
      )),
    };
    const { rerender } = await renderWithReadyRenderer(
      <Harness
        hoveredDetailId={null}
        onResult={() => {}}
        reducedMotion={false}
        worldOverride={world}
      />,
    );
    const base = performance.now() + 100;
    for (let index = 0; index <= 10; index += 1) {
      fireLatestRaf(base + index * 16);
    }
    const beforeReplacement = lastDrawnFrame().timeSeconds;
    expect(beforeReplacement).toBeGreaterThan(0.1);

    act(() => {
      rerender(
        <Harness
          hoveredDetailId={null}
          onResult={() => {}}
          reducedMotion={false}
          worldOverride={visuallyChangedWorld}
        />,
      );
    });
    fireLatestRaf(base + 11 * 16);

    expect(lastDrawnFrame().timeSeconds).toBeGreaterThanOrEqual(beforeReplacement);
  });

  it("pauses RAF when canvas reports intersectionRatio 0 and resumes when it goes back to 1", async () => {
    let latest: UseWorldRenderLoopResult | null = null;
    const onResult = (r: UseWorldRenderLoopResult) => { latest = r; };
    await renderWithReadyRenderer(<Harness hoveredDetailId={null} onResult={onResult} />);

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

  it("does not draw an initial frame while the document is hidden", async () => {
    const visibilitySpy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    const { unmount } = await renderWithReadyRenderer(<Harness hoveredDetailId={null} onResult={() => {}} />);

    expect(renderThreeWorldMock).not.toHaveBeenCalled();
    expect(rafSpy).not.toHaveBeenCalled();

    unmount();
    visibilitySpy.mockRestore();
  });

  it("steps camera after ship samples and draws with the updated camera", async () => {
    const nextCamera = { ...camera, offsetX: camera.offsetX + 48, offsetY: camera.offsetY - 12 };
    let internals: {
      hitTargetsRef: { current: readonly HitTarget[] };
      shipMotionSamplesRef: { current: ReadonlyMap<string, ShipMotionSample> };
    } | null = null;
    let samplesAtStep = 0;
    await renderWithReadyRenderer(
      <Harness
        hoveredDetailId={null}
        onInternals={(nextInternals) => {
          internals = nextInternals;
        }}
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
    expect(renderThreeWorldMock).toHaveBeenCalled();
    const drawCalls = renderThreeWorldMock.mock.calls as unknown as Array<[ThreeWorldRendererFrame]>;
    const lastCall = drawCalls[drawCalls.length - 1]![0];
    expect(lastCall.camera).toEqual(nextCamera);

    const originalSnapshot = createGardenObservatoryHitTargetSnapshot({
      camera,
      hoveredDetailId: null,
      selectedDetailId: null,
      shipMotionSamples: internals!.shipMotionSamplesRef.current,
      viewport: { height: canvasSize.y, width: canvasSize.x },
      world,
    });
    const shiftedSnapshot = createGardenObservatoryHitTargetSnapshot({
      camera: nextCamera,
      hoveredDetailId: null,
      selectedDetailId: null,
      shipMotionSamples: internals!.shipMotionSamplesRef.current,
      viewport: { height: canvasSize.y, width: canvasSize.x },
      world,
    });
    const drawnLighthouse = internals!.hitTargetsRef.current.find((target) => target.detailId === "lighthouse");
    const originalLighthouse = originalSnapshot.targetsByDetailId.get("lighthouse");
    const shiftedLighthouse = shiftedSnapshot.targetsByDetailId.get("lighthouse");

    expect(drawnLighthouse?.rect.x).not.toBe(originalLighthouse?.rect.x);
    expect(drawnLighthouse?.rect.x).toBeCloseTo(shiftedLighthouse!.rect.x);
    expect(drawnLighthouse?.rect.y).toBeCloseTo(shiftedLighthouse!.rect.y);
  });

  it("does not publish stale frame-rate samples during persistent camera intent", async () => {
    let cameraIntentActive = false;
    let latest: UseWorldRenderLoopResult | null = null;
    await renderWithReadyRenderer(
      <Harness
        hoveredDetailId={null}
        onResult={(result) => { latest = result; }}
        reducedMotion={false}
        onStepCamera={({ cameraRef }) => ({
          camera: cameraRef.current,
          cameraChanged: cameraIntentActive,
          cameraIntentActive,
        })}
      />,
    );

    // Burn the bounded post-swap warmup and publish healthy steady-state FPS.
    for (let frame = 1; frame <= 16; frame += 1) fireLatestRaf(frame * 16);
    expect((latest as UseWorldRenderLoopResult | null)?.frameRateFps ?? 0).toBeGreaterThan(0);

    // A moving-ship follow can remain active indefinitely. Its frames stay out
    // of scheduler pacing, so the user-facing counter must become unknown
    // instead of preserving unrelated startup samples.
    cameraIntentActive = true;
    fireLatestRaf(17 * 16);
    expect((latest as UseWorldRenderLoopResult | null)?.frameRateFps).toBeNull();
  });

  it("drops to the idle duty cycle after a quiet spell and wakes on the next input", async () => {
    // The RAF timestamp and performance.now() are the same clock in a browser,
    // so drive both from one fake reading — otherwise a dispatched input would
    // stamp real wall time against fictional frame times.
    let fakeNow = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => fakeNow);
    const fireFrame = (time: number) => {
      fakeNow = time;
      fireLatestRaf(time);
    };

    try {
      await renderWithReadyRenderer(<Harness hoveredDetailId={null} onResult={() => {}} reducedMotion={false} />);

      // Awake, every display frame draws.
      fireFrame(16);
      fireFrame(32);
      const drawsWhileAwake = renderThreeWorldMock.mock.calls.length;
      fireFrame(48);
      expect(renderThreeWorldMock.mock.calls.length).toBe(drawsWhileAwake + 1);
      expect(lastDrawnFrame().renderScheduler.targetFrameMs).toBe(16.7);

      // Nobody has touched the world for the whole idle timeout.
      const quiet = RENDER_SCHEDULER_IDLE_AFTER_MS + 48;
      fireFrame(quiet);
      const drawsAtIdleEntry = renderThreeWorldMock.mock.calls.length;
      expect(lastDrawnFrame().renderScheduler.targetFrameMs).toBe(RENDER_SCHEDULER_IDLE_TARGET_FRAME_MS);

      // A display-rate frame inside the idle budget does no work — but the loop
      // still asks for the next one, which is what makes waking instant.
      const rafsBeforeSkip = rafSpy.mock.calls.length;
      fireFrame(quiet + 16);
      expect(renderThreeWorldMock.mock.calls.length).toBe(drawsAtIdleEntry);
      expect(rafSpy.mock.calls.length).toBe(rafsBeforeSkip + 1);

      // One duty cycle later it draws again.
      fireFrame(quiet + 34);
      expect(renderThreeWorldMock.mock.calls.length).toBe(drawsAtIdleEntry + 1);

      // A hand on the mouse restores full rate on the very next frame, 10ms
      // later — inside the idle budget it would otherwise have waited out. Not
      // a hover, not a click: a pointer move over open water.
      fakeNow = quiet + 38;
      act(() => {
        window.dispatchEvent(new Event("pointermove"));
      });
      fireFrame(quiet + 44);
      expect(renderThreeWorldMock.mock.calls.length).toBe(drawsAtIdleEntry + 2);
      expect(lastDrawnFrame().renderScheduler.targetFrameMs).toBe(16.7);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("keeps idle frames out of the load tier and the frame-pacing window", async () => {
    let fakeNow = 0;
    const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => fakeNow);
    const fireFrame = (time: number) => {
      fakeNow = time;
      fireLatestRaf(time);
    };

    try {
      await renderWithReadyRenderer(<Harness hoveredDetailId={null} onResult={() => {}} reducedMotion={false} />);

      // Earn the full tier on healthy 60fps frames.
      const awakeFrames = 24;
      for (let frame = 1; frame <= awakeFrames; frame += 1) fireFrame(frame * 16);
      expect(lastDrawnFrame().renderScheduler.tier).toBe("full");
      const awakeSamples = framePacingSampleCount();
      expect(awakeSamples).toBeGreaterThan(0);

      // Idle intervals sit at ~34ms, squarely inside the `recovery` band. The
      // machine is not struggling — it is being asked for half the frames — so
      // neither the tier nor the shared pacing window may register them.
      const quiet = RENDER_SCHEDULER_IDLE_AFTER_MS + awakeFrames * 16;
      for (let frame = 0; frame < 10; frame += 1) {
        fireFrame(quiet + frame * 34);
        expect(lastDrawnFrame().renderScheduler.tier).toBe("full");
      }
      expect(framePacingSampleCount()).toBe(awakeSamples);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("leaves the reduced-motion static frame outside the idle governor", async () => {
    let latest: UseWorldRenderLoopResult | null = null;
    await renderWithReadyRenderer(<Harness hoveredDetailId={null} onResult={(result) => { latest = result; }} />);
    const latestResult = latest as UseWorldRenderLoopResult | null;

    const drawsAfterMount = renderThreeWorldMock.mock.calls.length;
    act(() => latestResult!.requestPaint());
    // Long past the idle timeout: the deterministic frame is still drawn on
    // demand, at the full target, with the motion clock pinned at zero.
    fireLatestRaf(RENDER_SCHEDULER_IDLE_AFTER_MS * 2);

    expect(renderThreeWorldMock.mock.calls.length).toBe(drawsAfterMount + 1);
    const frame = lastDrawnFrame();
    expect(frame.renderScheduler.targetFrameMs).toBe(16.7);
    expect(frame.renderScheduler.tier).toBe("full");
    expect(frame.timeSeconds).toBe(0);
  });

  it("publishes camera loop proof fields", async () => {
    await renderWithReadyRenderer(<Harness hoveredDetailId={null} onResult={() => {}} reducedMotion={false} />);

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
