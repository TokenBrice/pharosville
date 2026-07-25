import { describe, expect, it } from "vitest";
import { cameraZoomLabel, clampCameraToMap, defaultCamera, followTile, panCamera, zoomIn, zoomOut } from "./camera";
import { ABSOLUTE_MIN_ZOOM, minZoomForViewport, tileToScreen } from "./projection";
import { buildPharosVilleMap, CEMETERY_CENTER, isWaterTileKind, PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH, PIGEON_ISLAND_CENTER } from "./world-layout";
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

    for (const viewport of [{ x: 1440, y: 1000 }, { x: 1280, y: 760 }, { x: 1000, y: 640 }]) {
      const camera = defaultCamera({ height: viewport.y, map, width: viewport.x });
      const center = tileToScreen(centerTile, camera);

      // 0.7776 = fitCameraToMap floor 0.72 × tighten 1.08 (reframed from
      // 0.8136 so the 34-unit Pharos crown keeps headroom at 1440×960).
      expect(camera.zoom).toBeCloseTo(0.7776);
      // Lower bound is 0.39 (not 0.4) so the constant 128 px right-gutter
      // reservation still falls inside the "left-of-center" band at the
      // 1000-wide gate floor, where the gutter is proportionally larger.
      expect(center.x).toBeGreaterThanOrEqual(viewport.x * 0.39);
      expect(center.x).toBeLessThanOrEqual(viewport.x * 0.55);
      expect(center.y).toBeGreaterThanOrEqual(viewport.y * 0.45);
      expect(center.y).toBeLessThanOrEqual(viewport.y * 0.65);
      expect(clampCameraToMap(camera, { map, viewport })).toEqual(camera);
    }
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
    // The map's iso bounds are 1760x880, so 1920x1080 frames it at ~1.09. The
    // old flat 0.48 floor let the camera pull back to roughly 2.3x the map's
    // area, and the world read as a small tile adrift in empty ocean.
    // The 112-tile map's iso bounds are 3520x1760, so 1920x1080 frames it at
    // ~0.545. The floor sits just under that so a sliver of sea frames the
    // world; it must never sit above the fit or the map cannot be seen whole.
    const viewport = { x: 1920, y: 1080 };
    const floor = minZoomForViewport(viewport, map);
    const fit = Math.min(1920 / 3520, 1080 / 1760);
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
