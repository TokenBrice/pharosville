import { describe, expect, it } from "vitest";
import { PREFERRED_DOCK_TILES } from "../../systems/world-layout";
import {
  CIVIC_VEGETATION_KINDS,
  SCENERY_PROPS,
  sceneryMotionClassForKind,
  isDynamicSceneryProp,
  isEntityPassSceneryProp,
  isStaticSceneryProp,
  isStaticSceneSceneryProp,
  type SceneryPropKind,
} from "./scenery";

const MIN_DISTANCE_FROM_LIVE_HARBOR_TILES = 4.75;
const TIME_DEPENDENT_SCENERY_KINDS: readonly SceneryPropKind[] = [
  "buoy",
  "harbor-bell",
  "harbor-lamp",
  "moored-dinghy-east",
  "sundial",
];

const EXPECTED_DYNAMIC_SCENERY_PLACEMENT_KINDS: readonly SceneryPropKind[] = [
  "buoy",
  "harbor-bell",
  "harbor-lamp",
  "moored-dinghy-east",
  "sundial",
];

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

describe("scenery motion classification", () => {
  it("classifies bobbing, swaying, wobbling, lit, and wall-clock scenery as dynamic", () => {
    for (const kind of TIME_DEPENDENT_SCENERY_KINDS) {
      expect(sceneryMotionClassForKind(kind), `${kind} should be dynamic`).toBe("dynamic");
    }
  });

  it("places expected dynamic scenery families", () => {
    const dynamicPlacedKinds = new Set(SCENERY_PROPS.filter(isDynamicSceneryProp).map((prop) => prop.kind));

    for (const kind of EXPECTED_DYNAMIC_SCENERY_PLACEMENT_KINDS) {
      expect(dynamicPlacedKinds.has(kind), `${kind} has no dynamic scenery placement`).toBe(true);
    }
  });

  it("keeps time-dependent scenery out of static classification", () => {
    const staticPlacedKinds = new Set(SCENERY_PROPS.filter(isStaticSceneryProp).map((prop) => prop.kind));

    for (const kind of TIME_DEPENDENT_SCENERY_KINDS) {
      expect(staticPlacedKinds.has(kind), `${kind} should not have static scenery placements`).toBe(false);
    }
  });

  it("places every scenery prop in exactly one motion class", () => {
    for (const prop of SCENERY_PROPS) {
      const isStatic = isStaticSceneryProp(prop);
      const isDynamic = isDynamicSceneryProp(prop);
      expect(Number(isStatic) + Number(isDynamic), `${prop.id} should have one motion class`).toBe(1);
    }
  });

  it("keeps occlusion-sensitive static scenery in the sorted entity pass", () => {
    const staticSceneKinds = new Set(SCENERY_PROPS.filter(isStaticSceneSceneryProp).map((prop) => prop.kind));
    expect(staticSceneKinds).toEqual(new Set(["grass-tuft", "reed-bed", "reef", "rock"]));

    for (const prop of SCENERY_PROPS) {
      expect(Number(isStaticSceneSceneryProp(prop)) + Number(isEntityPassSceneryProp(prop)), `${prop.id} should have one draw owner`).toBe(1);
    }

    const entitySortedKinds = new Set(SCENERY_PROPS.filter(isEntityPassSceneryProp).map((prop) => prop.kind));
    for (const kind of CIVIC_VEGETATION_KINDS) {
      expect(entitySortedKinds.has(kind), `${kind} should stay depth-sorted with ships and docks`).toBe(true);
    }
    expect(entitySortedKinds.has("dock-awning")).toBe(true);
    expect(entitySortedKinds.has("signal-post")).toBe(true);
    expect(entitySortedKinds.has("skiff")).toBe(true);
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
