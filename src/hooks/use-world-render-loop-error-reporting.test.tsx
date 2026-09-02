/* @vitest-environment jsdom */
// Covers the reporting side of the renderer's failure paths only. Failure
// STATE (status/rendererFailure/dispose) is covered by
// use-world-render-loop.test.tsx; this file asserts each path also reaches
// /_log, which is otherwise invisible because none of them throw uncaught.
import { useState } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HitTarget, HitTargetSnapshot } from "../renderer/hit-testing";
import type {
  CreateThreeWorldRendererInput,
  ThreeLogoAssets,
} from "../renderer/world-renderer-backend";
import { defaultCamera } from "../systems/camera";
import { initialAdaptiveDprState, resolveRenderSurfaceBudget } from "../systems/render-surface-budget";
import { buildBaseMotionPlan, buildMotionPlan, type ShipMotionSample } from "../systems/motion";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import { reportClientError } from "../error-reporter";
import { useWorldRenderLoop, type WorldCameraStepResult } from "./use-world-render-loop";

const { createThreeWorldRendererMock } = vi.hoisted(() => ({
  createThreeWorldRendererMock: vi.fn(() => ({
    dispose: vi.fn(),
    getSeaSignScale: () => 1,
    warmup: vi.fn(async () => {}),
    render: vi.fn(() => ({
      objectCount: 0,
      gpu: { calls: 0, geometries: 0, lines: 0, points: 0, textures: 0, triangles: 0 },
      movingShipCount: 0,
      rendererBackend: "three" as const,
      visibleShipCount: 0,
    })),
  })),
}));

vi.mock("../three/world-renderer", () => ({
  createThreeWorldRenderer: createThreeWorldRendererMock,
}));

vi.mock("../error-reporter", () => ({
  reportClientError: vi.fn(),
}));

const reportClientErrorMock = vi.mocked(reportClientError);

const emptyLogoAssets: ThreeLogoAssets = {
  getLogo: () => null,
  getLogoGenerationKey: () => "test",
};

describe("useWorldRenderLoop error reporting", () => {
  const world = buildPharosVilleWorld(makePharosVilleWorldInput());
  const canvasSize = { x: 800, y: 600 };
  const camera = defaultCamera({ width: canvasSize.x, height: canvasSize.y, map: world.map });

  beforeEach(() => {
    createThreeWorldRendererMock.mockClear();
    reportClientErrorMock.mockClear();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const StubIntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    } as unknown as typeof IntersectionObserver;
    vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
    (window as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver
      = StubIntersectionObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (window as unknown as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
  });

  function Harness() {
    const [canvasRef] = useState(() => ({ current: document.createElement("canvas") }));
    const [adaptiveDprStateRef] = useState(() => ({ current: initialAdaptiveDprState(1) }));
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
    const [maximumRequestedDprRef] = useState(() => ({ current: 1 }));
    const [mountEpochMsRef] = useState(() => ({ current: 0 }));
    const [shipsById] = useState(() => new Map(world.ships.map((ship) => [ship.id, ship])));
    const [motionPlan] = useState(() => buildMotionPlan(world, null, buildBaseMotionPlan(world, 0)));
    const [motionPlanRef] = useState(() => ({ current: motionPlan }));

    useWorldRenderLoop({
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
      reducedMotion: true,
      selectedDetailAnchor: null,
      selectedDetailId: null,
      selectedDetailIdRef,
      shipMotionSamplesRef,
      shipsById,
      stepCamera: (): WorldCameraStepResult => ({
        camera: cameraRef.current,
        cameraChanged: false,
        cameraIntentActive: false,
      }),
      wallClockHour: 12,
      world,
    });
    return null;
  }

  async function mountHarness() {
    const result = render(<Harness />);
    await act(async () => {
      await import("../three/world-renderer");
    });
    return result;
  }

  it("reports a lost WebGL context under the render category", async () => {
    await mountHarness();
    const createCalls = createThreeWorldRendererMock.mock.calls as unknown as Array<[CreateThreeWorldRendererInput]>;

    act(() => {
      createCalls[0]![0].onContextFailure("WebGL context lost");
    });

    expect(reportClientErrorMock).toHaveBeenCalledTimes(1);
    expect(reportClientErrorMock).toHaveBeenCalledWith(
      "render",
      { kind: "renderer-failure", cause: "webgl-context", message: "WebGL context lost" },
      "WebGL context lost",
    );
  });

  it("reports a renderer module that fails to load", async () => {
    createThreeWorldRendererMock.mockImplementationOnce(() => {
      throw new Error("chunk load failed");
    });

    await mountHarness();
    // The create() throw lands in the same .catch as an import() rejection.
    await act(async () => {});

    expect(reportClientErrorMock).toHaveBeenCalledWith(
      "render",
      { kind: "renderer-failure", cause: "module-load", message: "chunk load failed" },
      "chunk load failed",
    );
  });

  it("does not report while the renderer is healthy", async () => {
    await mountHarness();

    expect(reportClientErrorMock).not.toHaveBeenCalled();
  });
});
