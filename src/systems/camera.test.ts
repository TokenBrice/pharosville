import { describe, expect, it } from "vitest";
import {
  cameraZoomLabel,
  clampCameraToMap,
  defaultCamera,
  followTile,
  GARDEN_DEFAULT_CAMERA_ZOOM,
  GARDEN_REST_ZOOM_FLOOR,
  panCamera,
  zoomIn,
  zoomOut,
} from "./camera";
import {
  ABSOLUTE_MIN_ZOOM,
  mapIsoBounds,
  minZoomForViewport,
  tileToIso,
  tileToScreen,
  TILE_WIDTH,
} from "./projection";
import {
  GARDEN_LIGHTHOUSE_HEIGHT,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  gardenIslandDisplayTile,
  gardenTileToScreen,
} from "./garden-observatory-slice";
import {
  buildPharosVilleMap,
  CEMETERY_CENTER,
  EVM_BAY_STATION_SLOTS,
  isWaterTileKind,
  LIGHTHOUSE_TILE,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  PIGEON_ISLAND_CENTER,
} from "./world-layout";
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
  it("keeps the authored island mass inside the right-hand sea gutter by default", () => {
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

      // Warm-village A1 (2026-09-05): rest is the sailed-in 1.0 close
      // composition (was 0.6 * 1.02), refined per width to seat the
      // Mole -> island-centre landing span inside the right-hand ma gutter,
      // and never resting below the 0.8 floor.
      const moleIsoX = tileToIso(EVM_BAY_STATION_SLOTS[0].cove.tile).x;
      const expectedRest = Math.max(
        GARDEN_REST_ZOOM_FLOOR,
        Math.min(
          GARDEN_DEFAULT_CAMERA_ZOOM,
          (viewport.x - 128 - TILE_WIDTH / 2) / -moleIsoX,
        ),
      );
      expect(camera.zoom).toBeCloseTo(expectedRest);
      // The landing frame may move the island right to admit the Mole, but
      // never spends the authored 128px anchorage gutter on the island centre.
      expect(center.x).toBeGreaterThanOrEqual(viewport.x * 0.43);
      expect(center.x).toBeLessThanOrEqual(viewport.x - 128);
      // 0.70 (was 0.65): the crown-owned vertical seat places the island
      // centre up to ~69% down the frame on compact-height gates at the 1.0
      // rest, so the band widens by the same authored step.
      expect(center.y).toBeGreaterThanOrEqual(viewport.y * 0.45);
      expect(center.y).toBeLessThanOrEqual(viewport.y * 0.7);
      expect(clampCameraToMap(camera, { map, viewport })).toEqual(camera);
    }
  });

  it("seats the landing interval, Pharos headroom, and right-hand ma at both landing sizes", () => {
    const map = buildPharosVilleMap();
    const moleIsoX = tileToIso(EVM_BAY_STATION_SLOTS[0].cove.tile).x;

    for (const viewport of [
      { x: 900, y: 720 },  // compact square gate: the interval cannot seat at the rest floor
      { x: 1200, y: 640 }, // wide-laptop gate: the landing interval still seats
    ]) {
      const camera = defaultCamera({ height: viewport.y, map, width: viewport.x });
      const mole = tileToScreen(EVM_BAY_STATION_SLOTS[0].cove.tile, camera);
      const islandTile = gardenIslandDisplayTile(LIGHTHOUSE_TILE);
      const lighthouseTile = {
        x: islandTile.x + GARDEN_LIGHTHOUSE_ROOT_OFFSET.x / Math.SQRT2,
        y: islandTile.y + GARDEN_LIGHTHOUSE_ROOT_OFFSET.z / Math.SQRT2,
      };
      const towerBase = gardenTileToScreen(
        lighthouseTile,
        GARDEN_LIGHTHOUSE_ROOT_OFFSET.y,
        camera,
      );
      const towerTop = gardenTileToScreen(
        lighthouseTile,
        GARDEN_LIGHTHOUSE_ROOT_OFFSET.y + GARDEN_LIGHTHOUSE_HEIGHT,
        camera,
      );

      // The crown-owned vertical seat keeps at least 32px of sky above the
      // statue even in the compact-height profile the flat-map fit cannot
      // see; at the 1.0 rest the tower itself is ~half the frame height.
      expect(towerTop.y).toBeGreaterThanOrEqual(32);
      expect(towerTop.y).toBeLessThan(towerBase.y);
      expect(towerBase.y).toBeLessThan(viewport.y);
      // The water to the right of the Pharos remains a larger interval than
      // the Mole's left inset: deliberate ma rather than a centred ring.
      expect(viewport.x - towerBase.x).toBeGreaterThan(mole.x);
      expect(clampCameraToMap(camera, { map, viewport })).toEqual(camera);

      if (viewport.x - 128 - TILE_WIDTH / 2 >= -moleIsoX * GARDEN_REST_ZOOM_FLOOR) {
        // Wide enough to seat the authored interval at the rest floor: the
        // Mole quay is framed alongside the Pharos.
        expect(mole.x).toBeGreaterThan(0);
        expect(mole.x).toBeLessThan(viewport.x);
        expect(mole.y).toBeGreaterThan(0);
        expect(mole.y).toBeLessThan(viewport.y);
      } else {
        // Warm-village A1: below the seating width the right gutter wins —
        // the lighthouse remains the primary anchor and the Mole quay waits
        // off-frame to the west rather than spending the anchorage ma.
        expect(camera.zoom).toBeCloseTo(GARDEN_REST_ZOOM_FLOOR);
        expect(mole.x).toBeLessThanOrEqual(TILE_WIDTH / 2);
      }
    }
  });

  it("rests at the sailed-in 1.0 with the landing interval framed on standard desktops", () => {
    const map = buildPharosVilleMap();

    // Warm-village A1 (2026-09-05): the default rest is the 1.0 close
    // composition. The Pharos (60,70) and Ethereum Mole (15,95) tiles stay
    // inside the viewport minus the authored bottom/right padding wherever
    // the landing interval seats at 1.0. Seating the Mole half a tile inside
    // the left margin while the island centre keeps the 128px right gutter
    // needs a 1424px window, so the 1200px gate fits the interval instead
    // (0.825); no legal viewport rests below the 0.8 floor.
    const desktop = defaultCamera({ height: 1004, map, width: 1568 });
    expect(desktop.zoom).toBe(GARDEN_DEFAULT_CAMERA_ZOOM);

    const laptop = defaultCamera({ height: 640, map, width: 1200 });
    expect(laptop.zoom).toBeCloseTo(1056 / 1280);
    expect(laptop.zoom).toBeGreaterThanOrEqual(GARDEN_REST_ZOOM_FLOOR);

    for (const { camera, viewport } of [
      { camera: desktop, viewport: { x: 1568, y: 1004 } },
      { camera: laptop, viewport: { x: 1200, y: 640 } },
    ]) {
      for (const tile of [LIGHTHOUSE_TILE, EVM_BAY_STATION_SLOTS[0].cove.tile]) {
        const point = tileToScreen(tile, camera);
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(viewport.x - 128);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(viewport.y - 80);
      }
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
