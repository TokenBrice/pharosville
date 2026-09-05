// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLayoutEffect, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { HitTargetSnapshot } from "../renderer/hit-testing";
import { defaultCamera } from "../systems/camera";
import type { ShipMotionSample } from "../systems/motion";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { screenToIso, tileToIso } from "../systems/projection";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import {
  advanceCameraIntent,
  cameraModeCancelsFollow,
  dampFollowCamera,
  leadFollowTile,
  normalizeWheelDeltaY,
  selectionCameraTarget,
  useCanvasResizeAndCamera,
  type CameraStepResult,
  type UseCanvasResizeAndCameraInput,
  wheelZoomScaleFromDelta,
  zoomCameraByWheelDelta,
} from "./use-canvas-resize-and-camera";

const world = buildPharosVilleWorld(makePharosVilleWorldInput());

afterEach(() => {
  vi.restoreAllMocks();
});

describe("wheel camera helpers", () => {
  it("normalizes wheel deltas by delta mode", () => {
    expect(normalizeWheelDeltaY(48, 0)).toBe(48);
    expect(normalizeWheelDeltaY(3, 1)).toBe(48);
    expect(normalizeWheelDeltaY(2, 2, 900)).toBe(240);
    expect(normalizeWheelDeltaY(Number.NaN, 0)).toBe(0);
  });

  it("maps wheel deltas to monotonic exponential zoom scales", () => {
    const trackpadScale = wheelZoomScaleFromDelta(4, 0);
    const wheelScale = wheelZoomScaleFromDelta(100, 0);
    const zoomInScale = wheelZoomScaleFromDelta(-100, 0);

    expect(trackpadScale).toBeLessThan(1);
    expect(trackpadScale).toBeGreaterThan(wheelScale);
    expect(wheelScale).toBeLessThan(1);
    expect(zoomInScale).toBeGreaterThan(1);
    expect(zoomInScale).toBeCloseTo(1 / wheelScale);
  });

  it("keeps the pointer focal point stable while wheel zooming", () => {
    const camera = { offsetX: 240, offsetY: 140, zoom: 1 };
    const point = { x: 320, y: 220 };
    const before = screenToIso(point, camera);
    const next = zoomCameraByWheelDelta({
      camera,
      deltaMode: 0,
      deltaY: -80,
      point,
      viewport: { x: 960, y: 640 },
    });
    const after = screenToIso(point, next);

    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
    expect(next.zoom).toBeGreaterThan(camera.zoom);
  });
});

describe("camera intent helpers", () => {
  it("holds the completed arrival destination through subsequent camera frames", () => {
    const { result } = renderHook(() => useCanvasResizeAndCamera(makeCanvasInput()));
    const viewport = { x: 1200, y: 640 };
    const destination = defaultCamera({ width: viewport.x, height: viewport.y, map: world.map });
    const onComplete = vi.fn();
    act(() => {
      result.current.canvasSizeRef.current = viewport;
      result.current.setCamera(destination);
      result.current.startArrival(onComplete);
      result.current.stepCamera(1_000, new Map());
    });
    expect(result.current.cameraRef.current!.zoom).toBeLessThan(destination.zoom);
    act(() => { result.current.stepCamera(10_001, new Map()); });
    expect(result.current.cameraRef.current).toEqual(destination);
    expect(onComplete).toHaveBeenCalledTimes(1);
    for (const time of [10_017, 10_033, 11_000, 15_000]) {
      act(() => {
        const frame = result.current.stepCamera(time, new Map());
        expect(frame.camera).toEqual(destination);
        expect(frame.cameraChanged).toBe(false);
        expect(frame.cameraIntentActive).toBe(false);
      });
    }
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("damps camera intent toward the target without overshooting", () => {
    const current = { offsetX: 0, offsetY: 0, zoom: 1 };
    const target = { offsetX: 100, offsetY: -50, zoom: 1.5 };
    const first = advanceCameraIntent(current, target, 1 / 60, "wheel");

    expect(first.settled).toBe(false);
    expect(first.camera.offsetX).toBeGreaterThan(current.offsetX);
    expect(first.camera.offsetX).toBeLessThan(target.offsetX);
    expect(first.camera.offsetY).toBeLessThan(current.offsetY);
    expect(first.camera.offsetY).toBeGreaterThan(target.offsetY);
    expect(first.camera.zoom).toBeGreaterThan(current.zoom);
    expect(first.camera.zoom).toBeLessThan(target.zoom);
  });

  it("converges intent to an exact settled camera", () => {
    const target = { offsetX: 100, offsetY: -50, zoom: 1.5 };
    let camera = { offsetX: 0, offsetY: 0, zoom: 1 };
    let settled = false;

    for (let frame = 0; frame < 90 && !settled; frame += 1) {
      const next = advanceCameraIntent(camera, target, 1 / 60, "toolbar");
      camera = next.camera;
      settled = next.settled;
    }

    expect(settled).toBe(true);
    expect(camera).toEqual(target);
  });

  it("dollies a selection without overshoot and settles in 1.5–2.5 seconds", () => {
    const viewport = { x: 800, y: 600 };
    const current = defaultCamera({ height: viewport.y, map: world.map, width: viewport.x });
    const target = selectionCameraTarget({
      camera: current,
      map: world.map,
      tile: { x: 48, y: 48 },
      viewport,
    });
    expect(target.zoom).toBeGreaterThanOrEqual(current.zoom);

    let camera = current;
    let settledAt = 0;
    for (let frame = 1; frame <= 180; frame += 1) {
      const next = advanceCameraIntent(camera, target, 1 / 60, "selection");
      expect(next.camera.zoom).toBeLessThanOrEqual(target.zoom);
      camera = next.camera;
      if (next.settled) {
        settledAt = frame / 60;
        break;
      }
    }
    expect(settledAt).toBeGreaterThanOrEqual(1.5);
    expect(settledAt).toBeLessThanOrEqual(2.5);
    expect(camera).toEqual(target);
  });

  it("marks manual camera modes as follow-cancelling", () => {
    expect(cameraModeCancelsFollow("drag")).toBe(true);
    expect(cameraModeCancelsFollow("wheel")).toBe(true);
    expect(cameraModeCancelsFollow("pinch")).toBe(true);
    expect(cameraModeCancelsFollow("keyboard")).toBe(true);
    expect(cameraModeCancelsFollow("toolbar")).toBe(true);
    expect(cameraModeCancelsFollow("reset")).toBe(true);
    expect(cameraModeCancelsFollow("external")).toBe(true);
    expect(cameraModeCancelsFollow("follow-selected")).toBe(false);
    expect(cameraModeCancelsFollow("resize")).toBe(false);
  });

  it("routes animated camera intent through the world frame requester instead of a hook-local RAF", () => {
    const requestWorldFrame = vi.fn();
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const { result } = renderHook(() => useCanvasResizeAndCamera(makeCanvasInput({ requestWorldFrame, reducedMotion: false })));
    const startCamera = defaultCamera({ height: 600, map: world.map, width: 800 });

    act(() => {
      result.current.setCamera(startCamera);
    });
    requestWorldFrame.mockClear();
    rafSpy.mockClear();

    act(() => {
      result.current.handleToolbarZoomIn();
    });

    expect(requestWorldFrame).toHaveBeenCalledTimes(1);
    expect(rafSpy).not.toHaveBeenCalled();

    let stepResult: CameraStepResult | null = null;
    act(() => {
      stepResult = result.current.stepCamera(1_000, new Map());
    });

    const resolvedStepResult = requireStepResult(stepResult);
    expect(resolvedStepResult.cameraChanged).toBe(true);
    expect(resolvedStepResult.cameraIntentActive).toBe(true);
    expect(result.current.cameraRef.current?.zoom).not.toBe(startCamera.zoom);
  });

  it("keeps reduced-motion camera commands immediate and one-shot", () => {
    const requestWorldFrame = vi.fn();
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const { result } = renderHook(() => useCanvasResizeAndCamera(makeCanvasInput({ requestWorldFrame, reducedMotion: true })));
    const startCamera = defaultCamera({ height: 600, map: world.map, width: 800 });

    act(() => {
      result.current.setCamera(startCamera);
    });
    requestWorldFrame.mockClear();
    rafSpy.mockClear();

    act(() => {
      result.current.handleToolbarZoomIn();
    });

    expect(requestWorldFrame).toHaveBeenCalledTimes(1);
    expect(rafSpy).not.toHaveBeenCalled();
    expect(result.current.cameraRef.current?.zoom).not.toBe(startCamera.zoom);

    let stepResult: CameraStepResult | null = null;
    act(() => {
      stepResult = result.current.stepCamera(1_000, new Map());
    });
    const resolvedStepResult = requireStepResult(stepResult);
    expect(resolvedStepResult.cameraChanged).toBe(false);
    expect(resolvedStepResult.cameraIntentActive).toBe(false);
  });

  it("preserves a selection dolly queued during the selection commit", () => {
    const onRest = vi.fn();
    const ship = world.ships[0]!;
    const input = makeCanvasInput();
    const { result, rerender } = renderHook(({ selected }: { selected: boolean }) => {
      const camera = useCanvasResizeAndCamera({ ...input, selectedEntity: selected ? ship : null });
      const focusSelection = camera.focusSelection;
      useLayoutEffect(() => {
        if (selected) focusSelection({ x: 48, y: 48 }, onRest);
      }, [selected, focusSelection]);
      return camera;
    }, { initialProps: { selected: false } });
    act(() => {
      result.current.canvasSizeRef.current = { x: 800, y: 600 };
      result.current.setCamera(defaultCamera({ height: 600, map: world.map, width: 800 }));
    });
    const start = result.current.cameraRef.current;
    rerender({ selected: true });
    act(() => { result.current.stepCamera(1_000, new Map()); });
    expect(result.current.cameraRef.current).not.toEqual(start);
    expect(onRest).not.toHaveBeenCalled();
    act(() => {
      for (let frame = 1; frame < 600; frame += 1) result.current.stepCamera(1_000 + frame * 16.67, new Map());
    });
    expect(onRest).toHaveBeenCalledTimes(1);
  });

  it("applies reduced-motion selection framing instantly and reports camera rest", () => {
    const onRest = vi.fn();
    const { result } = renderHook(() => useCanvasResizeAndCamera(makeCanvasInput({ reducedMotion: true })));
    const viewport = { x: 800, y: 600 };
    const start = defaultCamera({ height: viewport.y, map: world.map, width: viewport.x });
    act(() => {
      result.current.canvasSizeRef.current = viewport;
      result.current.setCamera(start);
      result.current.focusSelection({ x: 48, y: 48 }, onRest);
    });
    expect(onRest).toHaveBeenCalledTimes(1);
    expect(result.current.cameraRef.current?.zoom).toBeGreaterThanOrEqual(start.zoom);
  });

  it("uses the renderer-provided displayed tile when following a ship", () => {
    const ship = world.ships[0]!;
    const resolveSelectedFollowTile = vi.fn(() => ({ x: 17, y: 9 }));
    const { result } = renderHook(() => useCanvasResizeAndCamera(makeCanvasInput({
      resolveSelectedFollowTile,
      selectedDetailIdRef: { current: ship.detailId },
      selectedEntity: ship,
    })));

    act(() => {
      result.current.handleFollowSelected();
    });

    expect(resolveSelectedFollowTile).toHaveBeenCalledWith(
      ship,
      expect.any(Map),
    );
  });

  it("starts Observe from the displayed pose and freezes it exactly on interruption", () => {
    const { result } = renderHook(() => useCanvasResizeAndCamera(makeCanvasInput()));
    const viewport = { x: 800, y: 600 };
    const startCamera = defaultCamera({ height: viewport.y, map: world.map, width: viewport.x });
    const targetIso = tileToIso({ x: 42, y: 34 });

    act(() => {
      result.current.canvasSizeRef.current = viewport;
      result.current.setCamera(startCamera);
      result.current.handleToolbarZoomIn();
      result.current.stepCamera(1_000, new Map());
    });
    const displayedBeforeTour = { ...result.current.cameraRef.current! };

    act(() => {
      result.current.startObserveTour([{
        beatIndex: 0,
        isoX: targetIso.x,
        isoY: targetIso.y,
        zoom: 1.35,
      }]);
      result.current.stepCamera(2_000, new Map());
    });
    expect(result.current.cameraRef.current?.offsetX).toBeCloseTo(displayedBeforeTour.offsetX, 10);
    expect(result.current.cameraRef.current?.offsetY).toBeCloseTo(displayedBeforeTour.offsetY, 10);
    expect(result.current.cameraRef.current?.zoom).toBeCloseTo(displayedBeforeTour.zoom, 10);

    act(() => {
      result.current.stepCamera(4_000, new Map());
    });
    const interrupted = { ...result.current.cameraRef.current! };

    act(() => {
      result.current.cancelCameraIntent();
      result.current.stepCamera(4_600, new Map());
      result.current.stepCamera(5_200, new Map());
    });
    expect(result.current.cameraRef.current).toEqual(interrupted);
  });

  it("publishes sampled Observe beats across clock jumps and completion", () => {
    const onBeatChange = vi.fn();
    const { result } = renderHook(() => useCanvasResizeAndCamera(makeCanvasInput()));
    const viewport = { x: 800, y: 600 };
    const startCamera = defaultCamera({ height: viewport.y, map: world.map, width: viewport.x });

    act(() => {
      result.current.canvasSizeRef.current = viewport;
      result.current.setCamera(startCamera);
      result.current.startObserveTour([
        { beatIndex: 0, isoX: 0, isoY: 320, zoom: 1 },
        { beatIndex: 1, isoX: 80, isoY: 360, zoom: 1.2 },
        { beatIndex: 2, isoX: -60, isoY: 420, zoom: 1.1 },
      ], onBeatChange);
      result.current.stepCamera(1_000, new Map());
      result.current.stepCamera(14_000, new Map());
      result.current.stepCamera(26_000, new Map());
      result.current.stepCamera(38_000, new Map());
    });

    expect(onBeatChange.mock.calls.map(([beatIndex]) => beatIndex)).toEqual([0, 1, 2, null]);
  });

  it("resolves the Observe return pose against the latest viewport", () => {
    const { result } = renderHook(() => useCanvasResizeAndCamera(makeCanvasInput()));
    const initialViewport = { x: 800, y: 600 };
    const resizedViewport = { x: 1_100, y: 720 };
    const startCamera = defaultCamera({
      height: initialViewport.y,
      map: world.map,
      width: initialViewport.x,
    });
    const returnCenter = screenToIso({
      x: initialViewport.x / 2,
      y: initialViewport.y / 2,
    }, startCamera);

    act(() => {
      result.current.canvasSizeRef.current = initialViewport;
      result.current.setCamera(startCamera);
      result.current.startObserveTour([{
        beatIndex: 0,
        isoX: returnCenter.x + 100,
        isoY: returnCenter.y + 80,
        zoom: 1.3,
      }]);
      result.current.stepCamera(1_000, new Map());
      result.current.stepCamera(3_000, new Map());
      result.current.canvasSizeRef.current = resizedViewport;
      result.current.stopObserveTour({ easeBack: true });
    });

    for (let frame = 0; frame < 120; frame += 1) {
      act(() => {
        result.current.stepCamera(3_000 + frame * 16.67, new Map());
      });
    }

    const returned = result.current.cameraRef.current!;
    const returnedCenter = screenToIso({
      x: resizedViewport.x / 2,
      y: resizedViewport.y / 2,
    }, returned);
    expect(returnedCenter.x).toBeCloseTo(returnCenter.x, 5);
    expect(returnedCenter.y).toBeCloseTo(returnCenter.y, 5);
    expect(returned.zoom).toBeCloseTo(startCamera.zoom, 6);
  });
});

describe("follow camera helpers", () => {
  it("leads the followed tile by sampled velocity", () => {
    expect(leadFollowTile(
      { x: 12, y: 8 },
      { x: 10, y: 7 },
      2,
    )).toEqual({
      x: 12.45,
      y: 8.225,
    });
  });

  it("does not lead without a usable previous sample", () => {
    const tile = { x: 12, y: 8 };

    expect(leadFollowTile(tile, null, 1)).toBe(tile);
    expect(leadFollowTile(tile, { x: 10, y: 7 }, 0)).toBe(tile);
  });

  it("damps camera movement toward the target without overshooting", () => {
    const current = { offsetX: 0, offsetY: 0, zoom: 1 };
    const target = { offsetX: 100, offsetY: -50, zoom: 1.5 };
    const next = dampFollowCamera(current, target, 0.25);

    expect(next.offsetX).toBeGreaterThan(60);
    expect(next.offsetX).toBeLessThan(target.offsetX);
    expect(next.offsetY).toBeLessThan(-30);
    expect(next.offsetY).toBeGreaterThan(target.offsetY);
    expect(next.zoom).toBeGreaterThan(current.zoom);
    expect(next.zoom).toBeLessThan(target.zoom);
  });

  it("keeps the current camera when damping cannot advance", () => {
    const current = { offsetX: 0, offsetY: 0, zoom: 1 };
    const target = { offsetX: 100, offsetY: -50, zoom: 1.5 };

    expect(dampFollowCamera(current, target, 0)).toBe(current);
    expect(dampFollowCamera(current, target, 1, 0)).toBe(current);
  });
});

describe("world keyboard shortcuts", () => {
  function keyEvent(key: string, target: EventTarget) {
    return {
      key,
      shiftKey: false,
      target,
      preventDefault: vi.fn(),
    } as unknown as ReactKeyboardEvent<HTMLElement>;
  }

  function renderWithCamera(input: UseCanvasResizeAndCameraInput) {
    const { result } = renderHook(() => useCanvasResizeAndCamera(input));
    act(() => {
      result.current.setCamera(defaultCamera({ height: 600, map: world.map, width: 800 }));
    });
    return result;
  }

  it("clears the selection on Escape from the world itself", () => {
    const onClearSelection = vi.fn();
    const result = renderWithCamera(makeCanvasInput({ onClearSelection }));

    act(() => {
      result.current.handleKeyDown(keyEvent("Escape", document.createElement("main")));
    });

    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  // The reference panels render inside the shell, so their Escape reaches this
  // handler too. It closes the panel; taking the selection with it would leave
  // the visitor holding neither.
  it("leaves the selection alone on Escape from inside an open panel", () => {
    const onClearSelection = vi.fn();
    const result = renderWithCamera(makeCanvasInput({ onClearSelection }));
    const panel = document.createElement("aside");
    panel.setAttribute("role", "dialog");
    const closeButton = document.createElement("button");
    panel.append(closeButton);

    act(() => {
      result.current.handleKeyDown(keyEvent("Escape", closeButton));
    });

    expect(onClearSelection).not.toHaveBeenCalled();
  });
});

function makeCanvasInput(overrides: Partial<UseCanvasResizeAndCameraInput> = {}): UseCanvasResizeAndCameraInput {
  const hitTargetSnapshotRef = { current: null as HitTargetSnapshot | null };
  return {
    hasSelection: () => false,
    hitTargetSnapshotRef,
    hitTargetsRef: { current: [] },
    hoveredDetailIdRef: { current: null },
    onClearSelection: vi.fn(),
    onSelectTarget: vi.fn(),
    recomputeHitTargets: () => hitTargetSnapshotRef.current,
    reducedMotion: false,
    requestWorldFrame: vi.fn(),
    selectedDetailIdRef: { current: null },
    selectedEntity: null,
    setHoveredDetailId: vi.fn(),
    shipMotionSamplesRef: { current: new Map<string, ShipMotionSample>() },
    world,
    ...overrides,
  };
}

function requireStepResult(result: CameraStepResult | null): CameraStepResult {
  if (result === null) throw new Error("Expected stepCamera to return a result");
  return result;
}
