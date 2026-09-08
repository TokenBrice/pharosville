import { describe, expect, it } from "vitest";
import {
  cameraZoomLabel,
  clampCameraToMap,
  defaultCamera,
  followTile,
  GARDEN_REST_ZOOM_FLOOR,
  panCamera,
  zoomIn,
  zoomOut,
} from "./camera";
import {
  ABSOLUTE_MIN_ZOOM,
  mapIsoBounds,
  minZoomForViewport,
  TILE_SCALE,
  worldToScreen,
} from "./projection";
import {
  GARDEN_LIGHTHOUSE_HEIGHT,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  gardenIslandDisplayTile,
} from "./garden-observatory-slice";
import {
  buildPharosVilleMap,
  EVM_BAY_STATION_SLOTS,
  LIGHTHOUSE_TILE,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
} from "./world-layout";
import { denseFixtureChains } from "../__fixtures__/pharosville-world";
import { buildChainDocks, topHarboursByShare } from "./chain-docks";

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
  it("seats the landing interval, Pharos headroom, and right-hand ma at both landing sizes", () => {
    const map = buildPharosVilleMap();
    const docks = buildChainDocks(denseFixtureChains);
    const southern = topHarboursByShare(docks.filter((dock) => dock.tile.y >= 112), 1)[0]!;
    const island = gardenIslandDisplayTile(LIGHTHOUSE_TILE);
    const baseWorld = {
      x: island.x * TILE_SCALE + GARDEN_LIGHTHOUSE_ROOT_OFFSET.x,
      y: GARDEN_LIGHTHOUSE_ROOT_OFFSET.y,
      z: island.y * TILE_SCALE + GARDEN_LIGHTHOUSE_ROOT_OFFSET.z,
    };

    for (const viewport of [{ x: 900, y: 720 }, { x: 1200, y: 640 }]) {
      for (const subjects of [undefined, docks]) {
        const camera = defaultCamera({ height: viewport.y, map, width: viewport.x, ...(subjects ? { subjects } : {}) });
        const base = worldToScreen(baseWorld, camera, viewport);
        const crown = worldToScreen(
          { ...baseWorld, y: baseWorld.y + GARDEN_LIGHTHOUSE_HEIGHT }, camera, viewport,
        );
        const diagnostic = JSON.stringify({ viewport, camera, base, crown, withDocks: !!subjects });
        expect(camera.zoom).toBeGreaterThanOrEqual(GARDEN_REST_ZOOM_FLOOR);
        expect(camera.zoom).toBeLessThanOrEqual(1);
        for (const point of [base, crown]) {
          expect(point.x / viewport.x, diagnostic).toBeGreaterThanOrEqual(0.56);
          expect(point.x / viewport.x, diagnostic).toBeLessThanOrEqual(0.68);
        }
        // The 12° ground-target rig puts the crown above the horizon, not
        // at the former orthographic 38%-height seat.
        expect(crown.y / viewport.y, diagnostic).toBeGreaterThanOrEqual(0.04);
        expect(crown.y / viewport.y, diagnostic).toBeLessThanOrEqual(0.30);
        expect(base.y / viewport.y, diagnostic).toBeGreaterThanOrEqual(0.25);
        expect(base.y / viewport.y, diagnostic).toBeLessThanOrEqual(0.50);

        const tiles = [EVM_BAY_STATION_SLOTS[0]!.cove.tile];
        if (subjects) tiles.push(...topHarboursByShare(subjects, 3).map((dock) => dock.tile), southern.tile);
        for (const tile of tiles) {
          const point = worldToScreen(
            { x: tile.x * TILE_SCALE, y: 0, z: tile.y * TILE_SCALE }, camera, viewport,
          );
          const x = point.x / viewport.x;
          const y = point.y / viewport.y;
          if (tile === tiles[0] || tile === southern.tile) {
            expect(x, diagnostic).toBeGreaterThanOrEqual(0.04);
            expect(x, diagnostic).toBeLessThanOrEqual(0.96);
            expect(y, diagnostic).toBeGreaterThanOrEqual(0.04);
            expect(y, diagnostic).toBeLessThanOrEqual(0.96);
          }
          expect(x >= 0 && x < 0.15 && y > 0.85 && y <= 1, diagnostic).toBe(false);
          if (y > base.y / viewport.y + 0.04 && y <= 1) {
            const centre = base.x / viewport.x
              + (0.5 - base.x / viewport.x) * (y - base.y / viewport.y) / (1 - base.y / viewport.y);
            expect(Math.abs(x - centre), diagnostic).toBeGreaterThanOrEqual(0.045);
          }
        }
      }
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
