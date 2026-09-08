import { describe, expect, it } from "vitest";
import {
  cameraZoomLabel,
  clampCameraToMap,
  defaultCamera,
  followTile,
  panCamera,
  zoomIn,
  zoomOut,
} from "./camera";
import {
  ABSOLUTE_MIN_ZOOM,
  cameraEye,
  cameraPoseFromIso,
  GARDEN_PLATE_MARGIN_TILES,
  mapIsoBounds,
  minZoomForViewport,
  TILE_SCALE,
  worldToScreen,
} from "./projection";
import {
  GARDEN_LIGHTHOUSE_HEIGHT,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_SHIP_ROOT_Y,
  gardenIslandDisplayTile,
} from "./garden-observatory-slice";
import {
  buildPharosVilleMap,
  EVM_BAY_STATION_SLOTS,
  LIGHTHOUSE_TILE,
  OUTER_HARBOR_STATION_SLOTS,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
} from "./world-layout";
import { denseFixtureChains } from "../__fixtures__/pharosville-world";
import { buildChainDocks } from "./chain-docks";

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
  // G1 0.5-tile / 0.01-zoom feasibility scan: 900×720 has 150 candidates
  // at 60%; 1200×640 has zero at 50% (best violation 0.0129), 31 at 44%.
  it.each([{ x: 900, y: 720, band: 0.60 }, { x: 1200, y: 640, band: 0.44 }])(
    "seats the eye on the near plate with crown air and an open inlet at $x × $y",
    (viewport) => {
      const map = buildPharosVilleMap();
      const docks = buildChainDocks(denseFixtureChains);
      const island = gardenIslandDisplayTile(LIGHTHOUSE_TILE);
      const baseWorld = {
        x: island.x * TILE_SCALE + GARDEN_LIGHTHOUSE_ROOT_OFFSET.x,
        y: GARDEN_LIGHTHOUSE_ROOT_OFFSET.y,
        z: island.y * TILE_SCALE + GARDEN_LIGHTHOUSE_ROOT_OFFSET.z,
      };
      for (const subjects of [undefined, docks]) {
        const camera = defaultCamera({ height: viewport.y, map, width: viewport.x, ...(subjects ? { subjects } : {}) });
        const eye = cameraEye(cameraPoseFromIso(camera, viewport));
        const eyeTile = { x: eye.x / TILE_SCALE, y: eye.z / TILE_SCALE };
        const base = worldToScreen(baseWorld, camera, viewport);
        const crown = worldToScreen(
          { ...baseWorld, y: baseWorld.y + GARDEN_LIGHTHOUSE_HEIGHT }, camera, viewport,
        );
        const diagnostic = JSON.stringify({ viewport, camera, eyeTile, base, crown, withDocks: !!subjects });
        expect(camera.zoom, diagnostic).toBeGreaterThanOrEqual(0.8);
        expect.soft(camera.zoom, diagnostic).toBeLessThanOrEqual(1.15);
        expect(eyeTile.x, diagnostic).toBeGreaterThanOrEqual(8);
        expect(eyeTile.y, diagnostic).toBeGreaterThanOrEqual(8);
        expect(eyeTile.x, diagnostic).toBeLessThanOrEqual(map.width + GARDEN_PLATE_MARGIN_TILES - 4);
        expect(eyeTile.y, diagnostic).toBeLessThanOrEqual(map.height + GARDEN_PLATE_MARGIN_TILES - 4);
        expect(eyeTile.x + eyeTile.y, diagnostic).toBeGreaterThanOrEqual(200);
        for (const point of [base, crown]) {
          expect(point.x / viewport.x, diagnostic).toBeGreaterThanOrEqual(0.50);
          expect(point.x / viewport.x, diagnostic).toBeLessThanOrEqual(0.72);
        }
        expect(crown.y / viewport.y, diagnostic).toBeGreaterThanOrEqual(0.04);
        expect(base.y / viewport.y, diagnostic).toBeGreaterThanOrEqual(0.35);
        expect(base.y / viewport.y, diagnostic).toBeLessThanOrEqual(0.65);
        const stationTiles = subjects?.map((dock) => dock.tile)
          ?? [...EVM_BAY_STATION_SLOTS, ...OUTER_HARBOR_STATION_SLOTS].map((slot) => slot.cove.tile);
        const segmentX = baseWorld.x - eye.x;
        const segmentZ = baseWorld.z - eye.z;
        const segmentLengthSquared = segmentX ** 2 + segmentZ ** 2;
        for (const tile of stationTiles) {
          const stationDiagnostic = `${diagnostic}, station=${JSON.stringify(tile)}`;
          expect.soft(Math.hypot(tile.x - eyeTile.x, tile.y - eyeTile.y), stationDiagnostic)
            .toBeGreaterThanOrEqual(14);
          const flag = worldToScreen(
            { x: tile.x * TILE_SCALE, y: 26, z: tile.y * TILE_SCALE }, camera, viewport,
          );
          if (Math.hypot(tile.x - eyeTile.x, tile.y - eyeTile.y) <= 40) {
            const vertices = [
              worldToScreen({ x: tile.x * TILE_SCALE, y: 0, z: tile.y * TILE_SCALE }, camera, viewport),
              flag,
            ];
            for (const reach of [-6, 6]) {
              for (const y of [16, 26]) {
                vertices.push(worldToScreen({
                  x: tile.x * TILE_SCALE + reach / Math.SQRT2,
                  y,
                  z: tile.y * TILE_SCALE - reach / Math.SQRT2,
                }, camera, viewport));
              }
            }
            const left = Math.min(...vertices.map((point) => point.x / viewport.x));
            const right = Math.max(...vertices.map((point) => point.x / viewport.x));
            const top = Math.min(...vertices.map((point) => point.y / viewport.y));
            const bottom = Math.max(...vertices.map((point) => point.y / viewport.y));
            expect.soft(
              right <= (1 - viewport.band) / 2 || left >= (1 + viewport.band) / 2
                || bottom <= 0 || top >= 1,
              stationDiagnostic,
            ).toBe(true);
          } else {
            const flagX = flag.x / viewport.x;
            expect.soft(
              flagX >= Math.min(base.x, crown.x) / viewport.x - 0.12
                && flagX <= Math.max(base.x, crown.x) / viewport.x + 0.12,
              stationDiagnostic,
            ).toBe(false);
          }
          const stationX = tile.x * TILE_SCALE - eye.x;
          const stationZ = tile.y * TILE_SCALE - eye.z;
          const along = Math.max(0, Math.min(1,
            (stationX * segmentX + stationZ * segmentZ) / segmentLengthSquared,
          ));
          expect.soft(Math.hypot(stationX - along * segmentX, stationZ - along * segmentZ), stationDiagnostic)
            .toBeGreaterThanOrEqual(4);
        }
        const tiles = subjects?.map((dock) => dock.tile) ?? [EVM_BAY_STATION_SLOTS[0]!.cove.tile];
        const points = tiles.map((tile) => {
          const point = worldToScreen(
            { x: tile.x * TILE_SCALE, y: 0, z: tile.y * TILE_SCALE }, camera, viewport,
          );
          return { x: point.x / viewport.x, y: point.y / viewport.y };
        });
        // Without supplied harbours, the western Mole is a preference: its
        // visibility must not pull the observer off the garden shore.
        if (subjects) {
          expect(points.some(({ x, y }) => x >= 0.04 && x <= 0.96 && y >= 0.04 && y <= 0.96), diagnostic).toBe(true);
        }
        expect(points.some(({ x, y }) => x >= 0.35 && x <= 0.65 && y >= 0.6 && y <= 0.95), diagnostic).toBe(false);
      }
    },
  );

  it("keeps bounded zooms inside the biased composition frame", () => {
    const map = buildPharosVilleMap();
    const viewport = { x: 1440, y: 1000 };
    const camera = defaultCamera({ height: viewport.y, map, width: viewport.x });
    const zoomed = zoomIn(camera, viewport, map);

    expect(zoomed.zoom).toBeGreaterThan(camera.zoom);
    expect(clampCameraToMap(zoomed, { map, viewport })).toEqual(zoomed);
  });

  it("follows a ship by centering its elevated anchor at both viewport gates", () => {
    const tile = { x: 32, y: 32 };
    for (const viewport of [{ x: 1600, y: 1000 }, { x: 1200, y: 640 }]) {
      for (const zoom of [0.6, 1.2]) {
        const camera = followTile({
          camera: { offsetX: 0, offsetY: 0, zoom },
          tile,
          viewport,
        });
        const anchor = worldToScreen({
          x: tile.x * TILE_SCALE,
          y: GARDEN_SHIP_ROOT_Y,
          z: tile.y * TILE_SCALE,
        }, camera, viewport);

        expect(anchor.x).toBeCloseTo(viewport.x / 2, 6);
        expect(anchor.y).toBeCloseTo(viewport.y / 2, 6);
        expect(cameraZoomLabel(camera)).toBe(`${zoom * 100}%`);
      }
    }
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
