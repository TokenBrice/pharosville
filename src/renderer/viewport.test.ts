import { describe, expect, it } from "vitest";
import { fitCameraToMap } from "../systems/projection";
import { isScreenPointInViewport, tileBoundsTileCount, visibleTileBoundsForCamera } from "./viewport";

describe("renderer viewport helpers", () => {
  it("returns null when the projected viewport falls fully outside map bounds", () => {
    const bounds = visibleTileBoundsForCamera({
      camera: { offsetX: -10_000, offsetY: -10_000, zoom: 1 },
      mapHeight: 64,
      mapWidth: 64,
      tileMargin: 0,
      viewportHeight: 120,
      viewportWidth: 160,
    });

    expect(bounds).toBeNull();
    expect(tileBoundsTileCount(bounds)).toBe(0);
  });

  it("expands and clamps tile bounds by the requested tile margin", () => {
    const camera = fitCameraToMap({
      height: 760,
      map: { height: 56, width: 56 },
      width: 1280,
    });
    const noMargin = visibleTileBoundsForCamera({
      camera,
      mapHeight: 56,
      mapWidth: 56,
      tileMargin: 0,
      viewportHeight: 760,
      viewportWidth: 1280,
    });
    const expanded = visibleTileBoundsForCamera({
      camera,
      mapHeight: 56,
      mapWidth: 56,
      tileMargin: 2,
      viewportHeight: 760,
      viewportWidth: 1280,
    });

    expect(noMargin).not.toBeNull();
    expect(expanded).not.toBeNull();
    expect(expanded!.minX).toBeLessThanOrEqual(noMargin!.minX);
    expect(expanded!.minY).toBeLessThanOrEqual(noMargin!.minY);
    expect(expanded!.maxX).toBeGreaterThanOrEqual(noMargin!.maxX);
    expect(expanded!.maxY).toBeGreaterThanOrEqual(noMargin!.maxY);
    expect(expanded!.minX).toBeGreaterThanOrEqual(0);
    expect(expanded!.minY).toBeGreaterThanOrEqual(0);
    expect(expanded!.maxX).toBeLessThan(56);
    expect(expanded!.maxY).toBeLessThan(56);
    expect(tileBoundsTileCount(expanded)).toBeGreaterThanOrEqual(tileBoundsTileCount(noMargin));
  });

  it("checks viewport inclusion with separate horizontal and vertical margins", () => {
    expect(isScreenPointInViewport({ x: -8, y: 20 }, 100, 80, 10, 5)).toBe(true);
    expect(isScreenPointInViewport({ x: 105, y: 84 }, 100, 80, 10, 5)).toBe(true);
    expect(isScreenPointInViewport({ x: -11, y: 20 }, 100, 80, 10, 5)).toBe(false);
    expect(isScreenPointInViewport({ x: 105, y: 86 }, 100, 80, 10, 5)).toBe(false);
  });
});
