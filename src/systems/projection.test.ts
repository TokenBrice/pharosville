import { describe, expect, it } from "vitest";
import { PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH } from "./world-layout";
import {
  CAMERA_FAR,
  CAMERA_FOV_DEG,
  cameraDistanceForZoom,
  cameraEye,
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
    x: (index % 5) * 2.25 - 4.5,
    y: Math.floor(index / 5) * 2.5 - 3.75,
  }));
  const zooms = [0.28, 1, 2.4];
  const viewports = [{ x: 900, y: 720 }, { x: 1920, y: 1080 }];

  it("projects the look-at point (target tile at the pose's target height) to the viewport centre", () => {
    for (const viewport of viewports) {
      for (const zoom of zooms) {
        for (const offset of [{ x: 137.25, y: -84.5 }, { x: -400, y: 681.75 }]) {
          const camera = { offsetX: offset.x, offsetY: offset.y, zoom };
          const pose = cameraPoseFromIso(camera, viewport);
          const target = pose.targetTile;
          const screen = worldToScreen({ x: target.x * TILE_SCALE, y: pose.targetHeight, z: target.y * TILE_SCALE }, camera, viewport);
          expect(screen.x).toBeCloseTo(viewport.x / 2, 9);
          expect(screen.y).toBeCloseTo(viewport.y / 2, 9);
        }
      }
    }
  });

  it("round-trips twenty ground tiles through perspective projection at three zooms and two viewports", () => {
    for (const viewport of viewports) {
      for (const zoom of zooms) {
        const camera = { offsetX: -53.75, offsetY: 291.125, zoom };
        const target = cameraPoseFromIso(camera, viewport).targetTile;
        for (const offset of groundTiles) {
          const tile = { x: target.x + offset.x, y: target.y + offset.y };
          for (const groundY of [0, 3.75]) {
            const screen = worldToScreen({ x: tile.x * TILE_SCALE, y: groundY, z: tile.y * TILE_SCALE }, camera, viewport);
            const restored = screenToGround(screen, camera, viewport, groundY);
            expect(restored.x).toBeCloseTo(tile.x, 8);
            expect(restored.y).toBeCloseTo(tile.y, 8);
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
      }
    }
  });

  it("preserves the target-plane world-height scale within two percent near the centre", () => {
    const height = 1;
    for (const viewport of viewports) {
      for (const zoom of zooms) {
        const camera = { offsetX: 340, offsetY: -120, zoom };
        const pose = cameraPoseFromIso(camera, viewport);
        const tile = pose.targetTile;
        const ground = worldToScreen({ x: tile.x * TILE_SCALE, y: pose.targetHeight, z: tile.y * TILE_SCALE }, camera, viewport);
        const elevated = worldToScreen({ x: tile.x * TILE_SCALE, y: pose.targetHeight + height, z: tile.y * TILE_SCALE }, camera, viewport);
        const viewHeight = viewport.y / (TILE_HEIGHT * zoom);
        const expectedOffset = height * (viewport.y / viewHeight) * Math.cos(pose.pitch);
        expect(elevated.x).toBeCloseTo(ground.x, 9);
        expect(Math.abs((ground.y - elevated.y) / expectedOffset - 1)).toBeLessThan(0.02);
        expect(cameraDistanceForZoom(viewport.y, zoom) * 2 * Math.tan(CAMERA_FOV_DEG * Math.PI / 360)).toBeCloseTo(viewHeight, 9);
      }
    }
  });

  it("places the zero-vertical-direction horizon where the pose pitch puts it: 12.9 percent at the far pitch, rising as the viewer approaches", () => {
    for (const viewport of viewports) {
      for (const zoom of zooms) {
        const camera = { offsetX: 140, offsetY: -23, zoom };
        let above = 0;
        let below = viewport.y;
        for (let iteration = 0; iteration < 50; iteration += 1) {
          const y = (above + below) / 2;
          const ray = screenToGroundRay({ x: viewport.x / 2, y }, camera, viewport);
          if (ray.direction.y > 0) above = y;
          else below = y;
        }
        const horizon = (above + below) / 2;
        const pitch = cameraPoseFromIso(camera, viewport).pitch;
        const expected = 0.5 - Math.tan(pitch) / (2 * Math.tan(CAMERA_FOV_DEG * Math.PI / 360));
        expect(Math.abs(horizon / viewport.y - expected)).toBeLessThan(0.005);
        if (zoom <= 0.45) expect(Math.abs(horizon / viewport.y - 0.129)).toBeLessThan(0.005);
        expect(screenToGroundRay({ x: viewport.x / 2, y: horizon }, camera, viewport).direction.y).toBeCloseTo(0, 12);
      }
    }
  });

  it("projects a farther ground pair smaller than an equally spaced nearer pair", () => {
    for (const viewport of viewports) {
      for (const zoom of zooms) {
        const camera = { offsetX: 140, offsetY: -23, zoom };
        const target = cameraPoseFromIso(camera, viewport).targetTile;
        const spans = [5, -5].map((offset) => {
          const first = worldToScreen({
            x: (target.x + offset) * TILE_SCALE,
            y: 0,
            z: (target.y + offset) * TILE_SCALE,
          }, camera, viewport);
          const second = worldToScreen({
            x: (target.x + offset + 1) * TILE_SCALE,
            y: 0,
            z: (target.y + offset) * TILE_SCALE,
          }, camera, viewport);
          return Math.hypot(second.x - first.x, second.y - first.y);
        });
        expect(spans[1]).toBeLessThan(spans[0]);
      }
    }
  });

  it("casts unit rays from the eye and far-clamps above-horizon ground picks", () => {
    const camera = { offsetX: 140, offsetY: -23, zoom: 1.3 };
    const viewport = viewports[0];
    const point = { x: viewport.x / 2, y: 0 };
    const ray = screenToGroundRay(point, camera, viewport);
    const eye = cameraEye(cameraPoseFromIso(camera, viewport));
    const picked = screenToGround(point, camera, viewport);
    expect(ray.origin).toEqual(eye);
    expect(Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z)).toBeCloseTo(1, 12);
    expect(ray.direction.y).toBeGreaterThan(0);
    expect(picked.x).toBeCloseTo((eye.x + ray.direction.x * CAMERA_FAR) / TILE_SCALE, 9);
    expect(picked.y).toBeCloseTo((eye.z + ray.direction.z * CAMERA_FAR) / TILE_SCALE, 9);
  });

  it("keeps projection finite at and behind the eye", () => {
    const camera = { offsetX: 140, offsetY: -23, zoom: 1.3 };
    const viewport = viewports[0];
    const eye = cameraEye(cameraPoseFromIso(camera, viewport));
    for (const offset of [0, 10]) {
      const screen = worldToScreen({ x: eye.x + offset, y: eye.y + offset, z: eye.z + offset }, camera, viewport);
      expect(Number.isFinite(screen.x)).toBe(true);
      expect(Number.isFinite(screen.y)).toBe(true);
    }
  });
});
