import { describe, expect, it } from "vitest";
import { cameraZoomLabel, clampCameraToMap, defaultCamera, followTile, panCamera, zoomIn, zoomOut } from "./camera";
import { ABSOLUTE_MIN_ZOOM, mapIsoBounds, minZoomForViewport, tileToScreen } from "./projection";
import { MIN_LONG_SIDE_PX, MIN_SHORT_SIDE_PX } from "./viewport-gate";
import { gardenIslandDisplayTile } from "./garden-observatory-slice";
import { buildPharosVilleMap, CEMETERY_CENTER, isWaterTileKind, LIGHTHOUSE_TILE, PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH, PIGEON_ISLAND_CENTER } from "./world-layout";
import type { TerrainKind } from "./world-types";

describe("camera", () => {
  it("pans by screen-space deltas", () => {
    expect(panCamera({ offsetX: 10, offsetY: 20, zoom: 1 }, { x: 5, y: -8 })).toEqual({
      offsetX: 15,
      offsetY: 12,
      zoom: 1,
    });
  });

  it("clamps panning to the authored map bounds", () => {
    const bounds = { map: { width: PHAROSVILLE_MAP_WIDTH, height: PHAROSVILLE_MAP_HEIGHT }, viewport: { x: 1440, y: 1000 } };
    const camera = clampCameraToMap({ offsetX: 10_000, offsetY: -10_000, zoom: 1 }, bounds);

    expect(panCamera(camera, { x: 10_000, y: -10_000 }, bounds)).toEqual(camera);
  });

  it("zooms around viewport center", () => {
    const camera = { offsetX: 0, offsetY: 0, zoom: 1 };

    expect(zoomOut(zoomIn(camera, { x: 1000, y: 800 }), { x: 1000, y: 800 }).zoom).toBeCloseTo(1);
  });

  it("frames the authored island mass left of the extra sea margin by default", () => {
    const map = buildPharosVilleMap();
    const centerTile = landBoundsCenter(map.tiles);

    for (const viewport of [
      { x: 1440, y: 1000 },
      { x: 1280, y: 760 },
      { x: 1000, y: 640 },
      { x: 1200, y: 640 },
      { x: 900, y: 720 },
      { x: 720, y: 900 },
    ]) {
      const camera = defaultCamera({ height: viewport.y, map, width: viewport.x });
      const center = tileToScreen(centerTile, camera);

      const shortSide = Math.min(viewport.x, viewport.y);
      const shortSideProgress = Math.max(
        0,
        Math.min(1, (shortSide - MIN_SHORT_SIDE_PX) / 280),
      );
      const longSideProgress = Math.max(
        0,
        Math.min(1, (Math.max(viewport.x, viewport.y) - MIN_LONG_SIDE_PX) / 100),
      );
      const compositionProgress = shortSide < MIN_SHORT_SIDE_PX
        ? 0
        : Math.max(shortSideProgress, longSideProgress);
      expect(camera.zoom).toBeCloseTo(0.6 * (1 + compositionProgress * 0.02));
      // The constant 128px right-gutter is proportionally largest in the
      // 720px-wide tall case; the island remains intentionally left of center.
      expect(center.x).toBeGreaterThanOrEqual(viewport.x * 0.43);
      expect(center.x).toBeLessThanOrEqual(viewport.x * 0.68);
      expect(center.y).toBeGreaterThanOrEqual(viewport.y * 0.45);
      expect(center.y).toBeLessThanOrEqual(viewport.y * 0.65);
      expect(clampCameraToMap(camera, { map, viewport })).toEqual(camera);
    }
  });

  it("frames the Ethereum shore capital with the Pharos and a broad right-hand interval", () => {
    const map = buildPharosVilleMap();
    const viewport = { x: 1600, y: 1000 };
    const camera = defaultCamera({ height: viewport.y, map, width: viewport.x });
    const tower = tileToScreen(gardenIslandDisplayTile(LIGHTHOUSE_TILE), camera);
    const ethereumStation = tileToScreen({ x: 14, y: 74 }, camera);
    expect(ethereumStation.x).toBeGreaterThan(viewport.x * 0.08);
    expect(ethereumStation.x).toBeLessThan(viewport.x * 0.2);
    expect(tower.x).toBeGreaterThan(viewport.x * 0.43);
    expect(tower.x).toBeLessThan(viewport.x * 0.52);
    expect(tower.y).toBeGreaterThan(viewport.y * 0.45);
    expect(tower.y).toBeLessThan(viewport.y * 0.58);
  });

  it("keeps bounded zooms inside the biased composition frame", () => {
    const map = buildPharosVilleMap();
    const viewport = { x: 1440, y: 1000 };
    const camera = defaultCamera({ height: viewport.y, map, width: viewport.x });
    const zoomed = zoomIn(camera, viewport, map);

    expect(zoomed.zoom).toBeGreaterThan(camera.zoom);
    expect(clampCameraToMap(zoomed, { map, viewport })).toEqual(zoomed);
  });

  it("follows a tile by centering it", () => {
    const camera = followTile({
      camera: { offsetX: 0, offsetY: 0, zoom: 1 },
      tile: { x: 32, y: 32 },
      viewport: { x: 1000, y: 800 },
    });

    expect(camera.offsetX).toBe(500);
    expect(camera.offsetY).toBe(-112);
    expect(cameraZoomLabel(camera)).toBe("100%");
  });

  it("clamps follow-target framing against the biased map bounds", () => {
    const map = buildPharosVilleMap();
    const viewport = { x: 1440, y: 1000 };
    const camera = followTile({
      camera: defaultCamera({ height: viewport.y, map, width: viewport.x }),
      map,
      tile: { x: 44, y: 18 },
      viewport,
    });

    expect(clampCameraToMap(camera, { map, viewport })).toEqual(camera);
  });
});

function landBoundsCenter(tiles: Array<{ x: number; y: number; kind: TerrainKind }>) {
  // Cemetery and pigeonnier sit on their own detached islets — exclude their
  // tiles when computing the main-island visual focal point so the framing
  // test reflects the dominant mass.
  const landTiles = tiles.filter((tile) => {
    if (isWaterTileKind(tile.kind)) return false;
    if (Math.hypot(tile.x - CEMETERY_CENTER.x, tile.y - CEMETERY_CENTER.y) <= 6) return false;
    if (Math.hypot(tile.x - PIGEON_ISLAND_CENTER.x, tile.y - PIGEON_ISLAND_CENTER.y) <= 2) return false;
    return true;
  });
  const xs = landTiles.map((tile) => tile.x);
  const ys = landTiles.map((tile) => tile.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

describe("N1 zoom floor", () => {
  const map = { height: 112, width: 112 };

  it("stops zoom-out at the point the map still frames the viewport", () => {
    // The fit includes the finite plate margin, not just the outer tile
    // centres. The floor sits just under that shared extent so a sliver of sky
    // frames the plate; it must never sit above the fit or the plate cannot be
    // seen whole.
    const viewport = { x: 1920, y: 1080 };
    const floor = minZoomForViewport(viewport, map);
    const bounds = mapIsoBounds(map);
    const fit = Math.min(
      viewport.x / (bounds.maxX - bounds.minX),
      viewport.y / (bounds.maxY - bounds.minY),
    );
    expect(floor).toBeLessThanOrEqual(fit);
    expect(floor).toBeGreaterThan(fit * 0.9);

    let camera = { offsetX: 900, offsetY: 300, zoom: 1.1 };
    for (let step = 0; step < 40; step += 1) camera = zoomOut(camera, viewport, map);
    expect(camera.zoom).toBeCloseTo(floor, 5);
  });

  it("scales the floor with the viewport so small screens still see it all", () => {
    const large = minZoomForViewport({ x: 1920, y: 1080 }, map);
    const small = minZoomForViewport({ x: 1280, y: 720 }, map);
    expect(small).toBeLessThan(large);
    // A tiny viewport must never be pinned above the absolute floor, or the
    // world could not be framed at all.
    expect(minZoomForViewport({ x: 300, y: 200 }, map)).toBe(ABSOLUTE_MIN_ZOOM);
  });

  it("still allows zooming in past the floor", () => {
    const viewport = { x: 1920, y: 1080 };
    const floor = minZoomForViewport(viewport, map);
    const zoomed = zoomIn({ offsetX: 900, offsetY: 300, zoom: floor }, viewport, map);
    expect(zoomed.zoom).toBeGreaterThan(floor);
  });
});
