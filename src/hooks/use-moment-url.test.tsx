// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import {
  buildMomentUrlHref,
  MOMENT_URL_SETTLE_DELAY_MS,
  parseMomentUrl,
  useMomentUrl,
} from "./use-moment-url";

describe("moment URL", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
  });

  it("uses query params for a quantized present-tense moment and leaves the hash alone", () => {
    const href = buildMomentUrlHref(
      "https://example.test/?debug=1#t=22&n=1",
      {
        camera: { offsetX: 12.34, offsetY: -5.67, zoom: 1.26 },
        shipId: "ship.usdc",
      },
    );
    const url = new URL(href);

    expect(url.searchParams.get("ship")).toBe("ship.usdc");
    expect(url.searchParams.get("cam")).toBe("12.3,-5.7@1.3");
    expect(url.searchParams.get("debug")).toBe("1");
    expect(url.hash).toBe("#t=22&n=1");
    expect(url.searchParams.has("t")).toBe(false);
  });

  it("parses only the query moment contract and ignores hash controls", () => {
    expect(parseMomentUrl("https://example.test/?ship=ship.usdc&cam=1.2,-3.4@0.9#t=7&n=1")).toEqual({
      camera: { offsetX: 1.2, offsetY: -3.4, zoom: 0.9 },
      shipId: "ship.usdc",
    });
    expect(parseMomentUrl("https://example.test/#ship=ship.usdc&cam=1,2@1")).toEqual({
      camera: null,
      shipId: null,
    });
    expect(parseMomentUrl("https://example.test/?cam=1,2,3&ship=")).toEqual({
      camera: null,
      shipId: "",
    });
  });

  it("waits for the camera to settle before replacing the URL", () => {
    const onRestoreShip = vi.fn();
    const moveCameraTo = vi.fn();
    const setCamera = vi.fn();
    const world = momentWorld();
    window.history.replaceState(null, "", "/?ship=ship.usdc&cam=0,0@1#t=22&n=1");

    const { rerender } = renderHook(
      ({ camera }: { camera: { offsetX: number; offsetY: number; zoom: number } }) => useMomentUrl({
        camera,
        canvasSize: { x: 900, y: 720 },
        onRestoreShip,
        ready: true,
        selectedDetailId: "ship.usdc",
        moveCameraTo,
        setCamera,
        world,
      }),
      { initialProps: { camera: { offsetX: 0, offsetY: 0, zoom: 1 } } },
    );

    expect(onRestoreShip).toHaveBeenCalledWith("ship.usdc", false);
    expect(moveCameraTo).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(MOMENT_URL_SETTLE_DELAY_MS - 1));
    expect(new URL(window.location.href).searchParams.get("cam")).toBe("0,0@1");

    rerender({ camera: { offsetX: 12.34, offsetY: -5.67, zoom: 1.26 } });
    act(() => vi.advanceTimersByTime(MOMENT_URL_SETTLE_DELAY_MS - 1));
    expect(new URL(window.location.href).searchParams.get("cam")).toBe("0,0@1");

    act(() => vi.advanceTimersByTime(1));
    expect(new URL(window.location.href).searchParams.get("cam")).toBe("12.3,-5.7@1.3");
    expect(new URL(window.location.href).hash).toBe("#t=22&n=1");
  });

  it("silently ignores a stale ship id while still restoring a valid camera", () => {
    const onRestoreShip = vi.fn();
    const moveCameraTo = vi.fn();
    const setCamera = vi.fn();
    window.history.replaceState(null, "", "/?ship=ship.missing&cam=4,8@1.5");

    renderHook(() => useMomentUrl({
      camera: { offsetX: 0, offsetY: 0, zoom: 1 },
      canvasSize: { x: 900, y: 720 },
      onRestoreShip,
      ready: true,
      selectedDetailId: null,
      moveCameraTo,
      setCamera,
      world: momentWorld(),
    }));

    expect(onRestoreShip).not.toHaveBeenCalled();
    expect(moveCameraTo).toHaveBeenCalledTimes(1);
  });

  it("waits for world readiness before resolving the linked ship", () => {
    const onRestoreShip = vi.fn();
    const moveCameraTo = vi.fn();
    const setCamera = vi.fn();
    window.history.replaceState(null, "", "/?ship=ship.usdc");

    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) => useMomentUrl({
        camera: { offsetX: 0, offsetY: 0, zoom: 1 },
        canvasSize: { x: 900, y: 720 },
        onRestoreShip,
        ready,
        selectedDetailId: null,
        moveCameraTo,
        setCamera,
        world: momentWorld(),
      }),
      { initialProps: { ready: false } },
    );

    expect(onRestoreShip).not.toHaveBeenCalled();
    rerender({ ready: true });
    expect(onRestoreShip).toHaveBeenCalledWith("ship.usdc", true);
    expect(moveCameraTo).not.toHaveBeenCalled();
  });
});

function momentWorld(): PharosVilleWorldModel {
  return {
    entityById: {
      "ship.usdc": { detailId: "ship.usdc", id: "usdc", kind: "ship" },
    },
    map: { height: 100, width: 100 },
  } as unknown as PharosVilleWorldModel;
}
