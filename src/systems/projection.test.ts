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
  cameraDetailZoom,
  cameraPixelZoom,
  cameraRestBlend,
  cameraView,
  cameraViewAngles,
  cameraViewFromAngles,
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

  it("picks through the breathed pose the camera state carries, orbiting the look-at point", () => {
    const viewport = { x: 1600, y: 1000 };
    const camera = { offsetX: -53.75, offsetY: 291.125, zoom: 1 };
    const pose = cameraPoseFromIso(camera, viewport);
    const target = { x: pose.targetTile.x * TILE_SCALE, y: pose.targetHeight, z: pose.targetTile.y * TILE_SCALE };
    const probe = { x: target.x - 40, y: 0, z: target.z - 60 };
    const still = worldToScreen(probe, camera, viewport);
    const breath = { dolly: 1.012, pitch: -0.6 * Math.PI / 180, yaw: 0.8 * Math.PI / 180 };
    const breathing = { ...camera, breath };
    const centre = worldToScreen(target, breathing, viewport);
    expect(centre.x).toBeCloseTo(viewport.x / 2, 9);
    expect(centre.y).toBeCloseTo(viewport.y / 2, 9);
    const expectedEye = cameraEye({
      ...pose,
      distance: pose.distance * breath.dolly,
      pitch: pose.pitch + breath.pitch,
      yaw: pose.yaw + breath.yaw,
    });
    const origin = screenToGroundRay({ x: 10, y: 10 }, breathing, viewport).origin;
    expect(origin.x).toBeCloseTo(expectedEye.x, 9);
    expect(origin.y).toBeCloseTo(expectedEye.y, 9);
    expect(origin.z).toBeCloseTo(expectedEye.z, 9);
    const breathed = worldToScreen(probe, breathing, viewport);
    expect(Math.hypot(breathed.x - still.x, breathed.y - still.y)).toBeGreaterThan(1);
    const restored = screenToGround(breathed, breathing, viewport, 0);
    expect(restored.x * TILE_SCALE).toBeCloseTo(probe.x, 8);
    expect(restored.y * TILE_SCALE).toBeCloseTo(probe.z, 8);
    // Detail measures never read the breath, so thresholds cannot flicker with it.
    expect(cameraDetailZoom(breathing, viewport)).toBe(cameraDetailZoom(camera, viewport));
    expect(worldToScreen(probe, camera, viewport)).toEqual(still);
  });

  it("shows the rest view at presence 1 and blends continuously to the rig as presence falls", () => {
    const viewport = { x: 1200, y: 640 };
    const rig = { offsetX: -53.75, offsetY: 291.125, zoom: 1.1 };
    const rigView = cameraView(rig, viewport);
    const restView = cameraViewFromAngles({ x: 160, y: 15, z: 250 }, 31 * Math.PI / 180, 2.6 * Math.PI / 180, 74, 32);
    const at = (presence: number) => ({ ...rig, rest: { presence, view: restView } });
    // A ground point both poses see (a probe behind either eye has no pixel).
    const probe = rigView.target;
    const rest = worldToScreen(restView.target, at(1), viewport);
    expect(rest.x).toBeCloseTo(viewport.x / 2, 9);
    expect(rest.y).toBeCloseTo(viewport.y / 2, 9);
    expect(cameraViewAngles(cameraView(at(1), viewport)).pitch).toBeCloseTo(2.6 * Math.PI / 180, 12);
    expect(worldToScreen(probe, at(0), viewport)).toEqual(worldToScreen(probe, rig, viewport));
    expect(cameraView(at(0), viewport)).toEqual(rigView);
    // The smootherstep leaves each end with zero speed: one frame of the 0.6 s
    // hand-off (1/36 of presence) moves a ground point by under 2 % of an even
    // step along the same journey (a linear blend is 100 %, a cubic ~8 %).
    const first = worldToScreen(probe, at(1 - 1 / 36), viewport);
    const seat = worldToScreen(probe, at(1), viewport);
    const end = worldToScreen(probe, at(0), viewport);
    const evenStep = Math.hypot(end.x - seat.x, end.y - seat.y) / 36;
    expect(Math.hypot(first.x - seat.x, first.y - seat.y)).toBeLessThan(0.02 * evenStep);
    expect(cameraRestBlend(0.5)).toBeCloseTo(0.5, 12);
    // Continuous: no frame jumps by more than the smootherstep's peak speed
    // (1.875× an even step) plus perspective slack for a 230 u eye journey.
    let previous = seat;
    for (let step = 1; step <= 36; step += 1) {
      const next = worldToScreen(probe, at(1 - step / 36), viewport);
      expect(Math.hypot(next.x - previous.x, next.y - previous.y)).toBeLessThan(3 * evenStep);
      previous = next;
    }
  });

  it("reads detail from the pose's stand-off, not the rig zoom: the same physical distance matches at every viewport", () => {
    for (const viewport of viewports) {
      const camera = { offsetX: 12, offsetY: -40, zoom: 0.8 };
      expect(cameraDetailZoom(camera, viewport)).toBeCloseTo(0.8 * 1000 / viewport.y, 9);
      expect(cameraPixelZoom(camera, viewport)).toBeCloseTo(0.8, 9);
    }
    const restView = cameraViewFromAngles({ x: 160, y: 15, z: 250 }, 0.5, 0.05, 73.7, 32);
    const small = { offsetX: 0, offsetY: 0, zoom: 1, rest: { presence: 1, view: restView } };
    expect(cameraDetailZoom(small, { x: 1200, y: 640 })).toBeCloseTo(cameraDetailZoom(small, { x: 1600, y: 1000 }), 12);
    expect(cameraDetailZoom(small, { x: 1600, y: 1000 })).toBeCloseTo(cameraDistanceForZoom(1000, 1) / 73.7, 9);
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
