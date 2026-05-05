import { describe, expect, it } from "vitest";
import { PREFERRED_DOCK_TILES } from "../../systems/world-layout";
import { CIVIC_VEGETATION_KINDS, SCENERY_PROPS } from "./scenery";

const MIN_DISTANCE_FROM_LIVE_HARBOR_TILES = 4.75;

describe("civic vegetation scenery", () => {
  const civicVegetation = SCENERY_PROPS.filter((prop) => CIVIC_VEGETATION_KINDS.has(prop.kind));

  it("keeps decorative vegetation clear of live harbor slots", () => {
    expect(civicVegetation.length).toBeGreaterThan(0);

    for (const prop of civicVegetation) {
      const nearest = nearestDockDistance(prop.tile);
      expect(nearest.distance, `${prop.id} is too close to ${nearest.dockKey}`).toBeGreaterThanOrEqual(
        MIN_DISTANCE_FROM_LIVE_HARBOR_TILES,
      );
    }
  });

  it("renders every generated civic vegetation family at least once", () => {
    const renderedKinds = new Set(civicVegetation.map((prop) => prop.kind));

    for (const kind of CIVIC_VEGETATION_KINDS) {
      expect(renderedKinds.has(kind), `${kind} is declared but has no scenery placement`).toBe(true);
    }
  });
});

function nearestDockDistance(tile: { x: number; y: number }): { distance: number; dockKey: string } {
  let nearest = { distance: Number.POSITIVE_INFINITY, dockKey: "" };
  for (const [dockKey, dockTile] of Object.entries(PREFERRED_DOCK_TILES)) {
    const distance = Math.hypot(tile.x - dockTile.x, tile.y - dockTile.y);
    if (distance < nearest.distance) nearest = { distance, dockKey };
  }
  return nearest;
}
