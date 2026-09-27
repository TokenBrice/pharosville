import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { REST_SEAT_EYE_LANDSCAPE, REST_SEAT_YAW_RAD } from "../systems/rest-seat";
import {
  createGardenSkein,
  GARDEN_SKEIN_MAX,
  GARDEN_SKEIN_MIN,
  GARDEN_SKEIN_SECONDS,
  gardenSkeinCrossingPoint,
  gardenSkeinFormation,
} from "./garden-skein";

const T0 = 1_792_000_000;

describe("X5 dawn skein", () => {
  it("flies nine to fifteen geese in a loose V with a leader and two arms", () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const formation = gardenSkeinFormation(seed + 0.5);
      expect(formation.length).toBeGreaterThanOrEqual(GARDEN_SKEIN_MIN);
      expect(formation.length).toBeLessThanOrEqual(GARDEN_SKEIN_MAX);
      const [leader, ...followers] = formation;
      expect(leader!.back).toBe(0);
      // Everyone trails the leader, on both sides.
      expect(followers.every((goose) => goose.back > 0)).toBe(true);
      expect(followers.some((goose) => goose.side < -1)).toBe(true);
      expect(followers.some((goose) => goose.side > 1)).toBe(true);
    }
  });

  it("crosses the sky left of the tower, receding into the haze", () => {
    const eye = REST_SEAT_EYE_LANDSCAPE.world;
    const right = new Vector3(Math.cos(REST_SEAT_YAW_RAD), 0, -Math.sin(REST_SEAT_YAW_RAD));
    const forward = new Vector3(-Math.sin(REST_SEAT_YAW_RAD), 0, -Math.cos(REST_SEAT_YAW_RAD));
    // The tower's axis stands at x ≈ 0.62 of the frame: right/depth ≈ 0.11.
    const towerBearing = 0.11;
    let previousDepth = 0;
    for (let step = 0; step <= 20; step += 1) {
      const point = gardenSkeinCrossingPoint(step / 20).sub(new Vector3(eye.x, eye.y, eye.z));
      const depth = point.dot(forward);
      expect(depth).toBeGreaterThan(previousDepth);
      previousDepth = depth;
      expect(point.dot(right) / depth).toBeLessThan(towerBearing - 0.08);
      // Above the borrowed ridges.
      expect(point.y / depth).toBeGreaterThan(Math.tan((4.5 * Math.PI) / 180));
    }
  });

  it("runs as the score's ritual: starts, crosses, ends, and hides on cancel", () => {
    const registered: string[] = [];
    const skein = createGardenSkein({
      registerRitual: (kind) => {
        registered.push(kind);
        return () => registered.splice(registered.indexOf(kind), 1);
      },
    });
    expect(registered).toEqual(["dawn-skein"]);
    expect(skein.root.visible).toBe(false);
    skein.ritual.start(T0);
    expect(skein.root.visible).toBe(true);
    expect(skein.mesh.count).toBeGreaterThanOrEqual(GARDEN_SKEIN_MIN);
    const before = skein.root.position.clone();
    expect(skein.ritual.update(T0 + 20, 1)).toBe(false);
    expect(skein.root.position.distanceTo(before)).toBeGreaterThan(20);
    expect(skein.ritual.update(T0 + GARDEN_SKEIN_SECONDS, 1)).toBe(true);
    expect(skein.root.visible).toBe(false);

    skein.ritual.start(T0 + 100);
    skein.ritual.cancel();
    expect(skein.flying()).toBe(false);
    expect(skein.root.visible).toBe(false);
    skein.dispose();
    expect(registered).toEqual([]);
  });
});
