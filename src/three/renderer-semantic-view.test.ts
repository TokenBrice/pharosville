import { describe, expect, it } from "vitest";
import { defaultCamera, withoutRest } from "../systems/camera";
import { GARDEN_FLEET_THINNING_START_ZOOM } from "../systems/garden-fleet-thinning";
import { zoomCameraByWheelDelta } from "../hooks/camera-intent";
import { minZoomForViewport, type IsoCamera } from "../systems/projection";
import { PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH } from "../systems/world-layout";
import { OVERVIEW_LOD_FULL_ZOOM } from "./garden-overview-lod";
import { createRendererDetailPolicy, resolveRendererDetailPolicy } from "./renderer-semantic-view";

const map = { height: PHAROSVILLE_MAP_HEIGHT, width: PHAROSVILLE_MAP_WIDTH };
const gates = [{ x: 1600, y: 1000 }, { x: 1200, y: 640 }, { x: 900, y: 720 }, { x: 720, y: 900 }];

function policyFor(camera: IsoCamera, viewport: { x: number; y: number }, selectedDetailId: string | null = null) {
  return resolveRendererDetailPolicy(
    { camera, height: viewport.y, selectedDetailId, width: viewport.x },
    createRendererDetailPolicy(),
  );
}

describe("renderer detail policy (W1.0 rest state)", () => {
  it.each(gates)("keeps explore-level truth carriers and the whole fleet at rest at $x × $y", (viewport) => {
    const policy = policyFor(defaultCamera({ height: viewport.y, map, width: viewport.x }), viewport);
    expect(policy.rest).toBe(true);
    expect(policy.semanticView).toBe("explore");
    expect(policy.zoneBuoys).toBe("all");
    expect(policy.showWorldDetail).toBe(true);
    expect(policy.fleetThinningZoom).toBeGreaterThanOrEqual(GARDEN_FLEET_THINNING_START_ZOOM);
    expect(policy.overviewLodZoom).toBeGreaterThanOrEqual(OVERVIEW_LOD_FULL_ZOOM);
  });

  it.each(gates)("stays explore-level through the first wheel off the seat at $x × $y", (viewport) => {
    const rest = defaultCamera({ height: viewport.y, map, width: viewport.x });
    for (const deltaY of [-120, 120]) {
      const rig = zoomCameraByWheelDelta({
        camera: rest,
        deltaMode: 0,
        deltaY,
        map,
        point: { x: viewport.x / 2, y: viewport.y * 0.8 },
        viewport,
      });
      const policy = policyFor(rig, viewport);
      expect(policy.rest).toBe(false);
      expect(policy.semanticView).toBe("explore");
      expect(policy.fleetThinningZoom).toBeGreaterThanOrEqual(GARDEN_FLEET_THINNING_START_ZOOM);
      expect(policy.overviewLodZoom).toBeGreaterThanOrEqual(OVERVIEW_LOD_FULL_ZOOM);
    }
  });

  it.each(gates)("keeps the whole-map pull-out on its overview thresholds at $x × $y", (viewport) => {
    const rest = defaultCamera({ height: viewport.y, map, width: viewport.x });
    const wholeMap = { ...withoutRest(rest), zoom: minZoomForViewport(viewport, map) };
    const policy = policyFor(wholeMap, viewport);
    expect(policy.rest).toBe(false);
    expect(policy.semanticView).toBe("overview");
    expect(policy.zoneBuoys).toBe("hidden");
    expect(policy.fleetThinningZoom).toBeCloseTo(wholeMap.zoom, 9);
    expect(policy.overviewLodZoom).toBeCloseTo(wholeMap.zoom, 9);
    expect(policy.seaSignZoom).toBeCloseTo(wholeMap.zoom, 9);
  });

  it("gives a selection the analyze hierarchy even at rest", () => {
    const viewport = gates[0]!;
    const policy = policyFor(defaultCamera({ height: viewport.y, map, width: viewport.x }), viewport, "ship:usdc");
    expect(policy.semanticView).toBe("analyze");
    expect(policy.zoneBuoys).toBe("focused");
  });
});
