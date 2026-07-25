import { describe, expect, it } from "vitest";
import { PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH } from "./world-layout";
import { fitCameraToMap, screenToTile, tileToIso, tileToScreen, zoomCameraAt } from "./projection";

describe("projection", () => {
  it("projects tiles into deterministic isometric coordinates", () => {
    expect(tileToIso({ x: 32, y: 32 })).toEqual({ x: 0, y: 512 });
    expect(tileToIso({ x: 33, y: 32 })).toEqual({ x: 16, y: 520 });
  });

  it("fits the authored map inside the available viewport", () => {
    const camera = fitCameraToMap({ width: 1440, height: 1000, map: { width: PHAROSVILLE_MAP_WIDTH, height: PHAROSVILLE_MAP_HEIGHT } });

    // The MIDDLE of the authored map lands near the middle of the viewport —
    // pinned relative to the map so it survives a MAP_SCALE change (H4).
    const center = tileToScreen(
      { x: PHAROSVILLE_MAP_WIDTH / 2, y: PHAROSVILLE_MAP_HEIGHT / 2 },
      camera,
    );
    expect(Math.abs(center.x - 1440 / 2)).toBeLessThan(40);
    expect(Math.abs(center.y - 1000 / 2)).toBeLessThan(40);
    expect(camera.zoom).toBeGreaterThanOrEqual(0.72);
  });

  it("zooms around the pointer without shifting the iso point under it", () => {
    const camera = { offsetX: 100, offsetY: 120, zoom: 1 };
    const zoomed = zoomCameraAt(camera, { x: 300, y: 280 }, 2);

    expect(zoomed).toEqual({ offsetX: -100, offsetY: -40, zoom: 2 });
  });

  it("inverts screen points back to tiles", () => {
    const camera = { offsetX: 80, offsetY: 120, zoom: 1 };
    const screen = tileToScreen({ x: 12, y: 18 }, camera);

    expect(screenToTile(screen, camera).x).toBeCloseTo(12);
    expect(screenToTile(screen, camera).y).toBeCloseTo(18);
  });
});
