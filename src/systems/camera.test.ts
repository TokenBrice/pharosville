import { describe, expect, it } from "vitest";
import {
  cameraZoomLabel,
  clampCameraToMap,
  defaultCamera,
  followTile,
  panCamera,
  REST_SHOT_RECTS,
  restHandOffRig,
  solveRestShot,
  zoomIn,
  zoomOut,
} from "./camera";
import {
  ABSOLUTE_MIN_ZOOM,
  cameraView,
  cameraViewAngles,
  mapIsoBounds,
  minZoomForViewport,
  TILE_SCALE,
  worldToScreen,
} from "./projection";
import {
  GARDEN_SHIP_ROOT_Y,
  GARDEN_WATER_Y,
  gardenTowerWorldAnchors,
} from "./garden-observatory-slice";
import {
  buildPharosVilleMap,
  LIGHTHOUSE_TILE,
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
} from "./world-layout";
import type { DockNode } from "./world-types";

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


describe("rest ShotSpec (W1.1)", () => {
  const map = { height: PHAROSVILLE_MAP_HEIGHT, width: PHAROSVILLE_MAP_WIDTH };
  const tower = gardenTowerWorldAnchors(LIGHTHOUSE_TILE);
  const gates = [{ x: 1600, y: 1000 }, { x: 1200, y: 640 }, { x: 900, y: 720 }, { x: 720, y: 900 }];
  const within = (value: number, [low, high]: readonly [number, number]) => {
    expect(value).toBeGreaterThanOrEqual(low);
    expect(value).toBeLessThanOrEqual(high);
  };

  it.each(gates)("seats the rest on the K1 rects, corridor and panel at $x × $y", (viewport) => {
    const camera = defaultCamera({ height: viewport.y, map, width: viewport.x });
    const rects = viewport.x / viewport.y >= 1 ? REST_SHOT_RECTS.landscape : REST_SHOT_RECTS.tall;
    const project = (point: { x: number; y: number; z: number }) => {
      const screen = worldToScreen(point, camera, viewport);
      return { x: screen.x / viewport.x, y: screen.y / viewport.y };
    };
    // World-fixed points: the crown and the waterline under the tower axis.
    const foot = project({ ...tower.foot, y: GARDEN_WATER_Y });
    const crown = project(tower.crown);
    within(foot.x, rects.footX);
    within(crown.y, rects.crownY);
    within(foot.y - crown.y, rects.span);

    const shot = solveRestShot(viewport);
    expect(shot.spec.id).toBe(viewport.x / viewport.y >= 1 ? "seat-c-landscape" : "seat-c-tall");
    expect(shot.report.inletIntrusions).toEqual([]);
    expect(shot.report.panelIntrusions).toEqual([]);
    expect(shot.report.violation).toBe(0);

    // K1 eye, pitch and lens: a pose, not a zoom.
    const view = cameraView(camera, viewport);
    const angles = cameraViewAngles(view);
    within(view.eye.y, [14, 16]);
    within(angles.pitch * 180 / Math.PI, [2.5, 3.5]);
    expect(view.vFovDeg).toBe(32);
  });

  it("has no zoom term: the seat is the same pose at any pixel size of one aspect", () => {
    const large = cameraView(defaultCamera({ height: 1000, map, width: 1600 }), { x: 1600, y: 1000 });
    const small = cameraView(defaultCamera({ height: 500, map, width: 800 }), { x: 800, y: 500 });
    expect(small.eye).toEqual(large.eye);
    expect(small.target.x).toBeCloseTo(large.target.x, 6);
    expect(small.target.z).toBeCloseTo(large.target.z, 6);
  });

  it.each(gates)("hands off at $x × $y to an in-bounds rig on the same yaw that keeps the tower's foot pixel and crown row", (viewport) => {
    const shot = solveRestShot(viewport);
    const rig = restHandOffRig(shot.view, viewport);
    const rest = defaultCamera({ height: viewport.y, map, width: viewport.x });
    for (const point of [tower.foot, tower.crown]) {
      const seat = worldToScreen(point, rest, viewport);
      const handOff = worldToScreen(point, rig, viewport);
      expect(Math.abs(handOff.y - seat.y)).toBeLessThan(1);
      if (point === tower.foot) expect(Math.abs(handOff.x - seat.x)).toBeLessThan(1);
    }
    expect(cameraViewAngles(cameraView(rig, viewport)).yaw).toBeCloseTo(cameraViewAngles(shot.view).yaw, 9);
    expect(clampCameraToMap(rig, { map, viewport })).toEqual(rig);
  });

  it("reports a station whose massing or nobori stands in the inlet core", () => {
    const intruder = {
      id: "inlet-intruder",
      station: { shoreBearing: 0, type: "fishing-pier" },
      tile: { x: 86, y: 116 },
    } as unknown as DockNode;
    const shot = solveRestShot({ x: 1600, y: 1000 }, [intruder]);
    expect(shot.report.inletIntrusions).toContain("inlet-intruder");
    expect(shot.report.violation).toBeGreaterThanOrEqual(1);
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
