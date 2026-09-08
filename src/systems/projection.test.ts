import { describe, expect, it } from "vitest";
import { PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH } from "./world-layout";
import {
  CAMERA_DISTANCE,
  cameraPoseFromIso,
  fitCameraToMap,
  GARDEN_FIT_CAMERA_MIN_ZOOM,
  isoFromCameraPose,
  screenToGround,
  screenToGroundRay,
  screenToTile,
  TILE_HEIGHT,
  TILE_SCALE,
  tileToIso,
  tileToScreen,
  worldToScreen,
  zoomCameraAt,
} from "./projection";

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
    // Warm-village A1: the fit floor is the sailed-in 1.0 rest (0.6 before);
    // whole-map zoom-out is minZoomForViewport's job, not the fit's.
    expect(camera.zoom).toBeGreaterThanOrEqual(GARDEN_FIT_CAMERA_MIN_ZOOM);
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

  const groundTiles = Array.from({ length: 20 }, (_, index) => ({
    x: index * 7.25 - 18,
    y: (index % 7) * 13.5 - 9,
  }));
  const zooms = [0.28, 1, 2.4];
  const viewports = [{ x: 900, y: 720 }, { x: 1920, y: 1080 }];

  it("projects ground tiles exactly like the isometric contract across zooms and viewports", () => {
    for (const viewport of viewports) {
      for (const zoom of zooms) {
        const camera = { offsetX: 137.25, offsetY: -84.5, zoom };
        for (const tile of groundTiles) {
          const screen = worldToScreen({ x: tile.x * TILE_SCALE, y: 0, z: tile.y * TILE_SCALE }, camera, viewport);
          const expected = tileToScreen(tile, camera);
          expect(Math.abs(screen.x - expected.x)).toBeLessThan(1e-6);
          expect(Math.abs(screen.y - expected.y)).toBeLessThan(1e-6);
        }
      }
    }
  });

  it("intersects orthographic rays at ground and raised horizontal planes", () => {
    for (const viewport of viewports) {
      for (const zoom of zooms) {
        const camera = { offsetX: -53.75, offsetY: 291.125, zoom };
        for (const tile of groundTiles) {
          for (const groundY of [0, 3.75]) {
            const screen = worldToScreen({ x: tile.x * TILE_SCALE, y: groundY, z: tile.y * TILE_SCALE }, camera, viewport);
            const restored = screenToGround(screen, camera, viewport, groundY);
            expect(Math.abs(restored.x - tile.x)).toBeLessThan(1e-6);
            expect(Math.abs(restored.y - tile.y)).toBeLessThan(1e-6);
          }
        }
      }
    }
  });

  it("preserves the camera through its fixed-rig pose representation", () => {
    for (const viewport of viewports) {
      for (const zoom of zooms) {
        const camera = { offsetX: -173.125, offsetY: 681.75, zoom };
        const pose = cameraPoseFromIso(camera, viewport);
        const restored = isoFromCameraPose(pose, viewport);
        expect(restored.offsetX).toBeCloseTo(camera.offsetX, 9);
        expect(restored.offsetY).toBeCloseTo(camera.offsetY, 9);
        expect(restored.zoom).toBeCloseTo(camera.zoom, 12);
        const target = tileToScreen(pose.targetTile, camera);
        expect(target.x).toBeCloseTo(viewport.x / 2, 9);
        expect(target.y).toBeCloseTo(viewport.y / 2, 9);
        expect(pose.yaw).toBeCloseTo(Math.PI / 4, 12);
        expect(pose.pitch).toBeCloseTo(Math.PI / 6, 12);
        expect(pose.distance * zoom).toBeCloseTo(CAMERA_DISTANCE * Math.sqrt(8 / 3), 9);
      }
    }
  });

  it("projects elevated anchors with the observatory's world-height rule", () => {
    const tile = { x: 27.5, y: 63.25 };
    const height = 4.75;
    for (const viewport of viewports) {
      for (const zoom of zooms) {
        const camera = { offsetX: 340, offsetY: -120, zoom };
        const ground = tileToScreen(tile, camera);
        const elevated = worldToScreen({ x: tile.x * TILE_SCALE, y: height, z: tile.y * TILE_SCALE }, camera, viewport);
        // gardenTileToScreen: screenY -= worldY * TILE_HEIGHT * (sqrt(3) / 2) * zoom.
        expect(elevated.x).toBeCloseTo(ground.x, 9);
        expect(elevated.y).toBeCloseTo(ground.y - height * TILE_HEIGHT * (Math.sqrt(3) / 2) * zoom, 9);
      }
    }
  });

  it("casts parallel unit rays toward the ground from the eye plane", () => {
    const camera = { offsetX: 140, offsetY: -23, zoom: 1.3 };
    const viewport = viewports[0];
    const center = { x: viewport.x / 2, y: viewport.y / 2 };
    const ray = screenToGroundRay(center, camera, viewport);
    const other = screenToGroundRay({ x: 123, y: 456 }, camera, viewport);
    const target = screenToTile(center, camera);
    expect(other.direction).toEqual(ray.direction);
    expect(Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z)).toBeCloseTo(1, 12);
    expect(ray.direction.y).toBeLessThan(0);
    expect(ray.origin.x).toBeCloseTo(target.x * TILE_SCALE + CAMERA_DISTANCE, 9);
    expect(ray.origin.y).toBeCloseTo(CAMERA_DISTANCE * Math.sqrt(2 / 3), 9);
    expect(ray.origin.z).toBeCloseTo(target.y * TILE_SCALE + CAMERA_DISTANCE, 9);
  });
});
