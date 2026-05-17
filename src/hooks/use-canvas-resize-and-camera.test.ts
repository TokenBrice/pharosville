// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HitTargetSnapshot } from "../renderer/hit-testing";
import { defaultCamera } from "../systems/camera";
import type { ShipMotionSample } from "../systems/motion";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { screenToIso } from "../systems/projection";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import {
  advanceCameraIntent,
  cameraModeCancelsFollow,
  dampFollowCamera,
  leadFollowTile,
  normalizeWheelDeltaY,
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

function makeCanvasInput(overrides: Partial<UseCanvasResizeAndCameraInput> = {}): UseCanvasResizeAndCameraInput {
  const hitTargetSnapshotRef = { current: null as HitTargetSnapshot | null };
  return {
    exitFullscreen: vi.fn(),
    fullscreenMode: false,
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
