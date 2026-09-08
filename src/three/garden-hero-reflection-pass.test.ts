import { Group, Mesh, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  GARDEN_HERO_REFLECTION_LAYER,
  mirrorGardenHeroCamera,
} from "./garden-hero-reflection-pass";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";

describe("garden hero reflection camera", () => {
  it("reflects the world position and orientation about the water, including parent transforms", () => {
    const rig = new Group();
    rig.position.set(11, 3, -7);
    rig.rotation.y = 0.3;
    const main = new PerspectiveCamera(32, 16 / 9, 0.1, 1000);
    main.position.set(20, 35, 70);
    main.lookAt(0, GARDEN_WATER_Y, 0);
    rig.add(main);
    const mirror = new PerspectiveCamera();
    const originalProjection = main.projectionMatrix.clone();
    mirrorGardenHeroCamera(main, mirror);
    const position = main.getWorldPosition(new Vector3());
    expect(mirror.position.x).toBeCloseTo(position.x);
    expect(mirror.position.y).toBeCloseTo(2 * GARDEN_WATER_Y - position.y);
    expect(mirror.position.z).toBeCloseTo(position.z);
    const forward = main.getWorldDirection(new Vector3());
    forward.y *= -1;
    expect(mirror.getWorldDirection(new Vector3()).distanceTo(forward)).toBeLessThan(1e-10);
    expect(main.projectionMatrix.equals(originalProjection)).toBe(true);
  });

  it("clips submerged geometry while admitting the hero and excluding fleet layers", () => {
    const main = new PerspectiveCamera(32, 1, 0.1, 1000);
    main.position.set(0, 20, 80);
    main.lookAt(0, GARDEN_WATER_Y, 0);
    const mirror = new PerspectiveCamera();
    mirrorGardenHeroCamera(main, mirror);
    const hero = new Mesh();
    hero.layers.enable(GARDEN_HERO_REFLECTION_LAYER);
    const fleet = new Mesh();
    expect(mirror.layers.test(hero.layers)).toBe(true);
    expect(mirror.layers.test(fleet.layers)).toBe(false);
    const above = new Vector3(0, GARDEN_WATER_Y + 5, 0).project(mirror);
    const below = new Vector3(0, GARDEN_WATER_Y - 5, 0).project(mirror);
    expect(above.z).toBeGreaterThanOrEqual(-1);
    expect(above.z).toBeLessThanOrEqual(1);
    expect(below.z).toBeLessThan(-1);
  });
});
