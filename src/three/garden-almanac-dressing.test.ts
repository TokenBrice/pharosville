import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  createGardenAlmanacDressing,
  GARDEN_METEOR_FADE_SECONDS,
  GARDEN_METEOR_TRAVEL_SECONDS,
} from "./garden-almanac-dressing";

const camera = new Vector3(0, 10, 0);

describe("garden almanac meteor ritual", () => {
  it("streaks once while its ritual runs, then is gone", () => {
    const dressing = createGardenAlmanacDressing();
    dressing.update({ cameraPosition: camera, reducedMotion: false });
    expect(dressing.meteor.visible).toBe(false);
    dressing.ritual.start(100);
    expect(dressing.ritual.update(100.3, 0.3)).toBe(false);
    dressing.update({ cameraPosition: camera, reducedMotion: false });
    expect(dressing.meteor.visible).toBe(true);
    expect(dressing.meteor.material.opacity).toBeGreaterThan(0);
    // High in the sky, not on the water.
    const position = dressing.meteor.geometry.getAttribute("position");
    expect(position.getY(0)).toBeGreaterThan(camera.y + 20);
    expect(dressing.ritual.update(100 + GARDEN_METEOR_TRAVEL_SECONDS + GARDEN_METEOR_FADE_SECONDS, 0.5)).toBe(true);
    dressing.update({ cameraPosition: camera, reducedMotion: false });
    expect(dressing.meteor.visible).toBe(false);
  });

  it("never shows under reduced motion or after a cancel", () => {
    const dressing = createGardenAlmanacDressing();
    dressing.ritual.start(0);
    dressing.ritual.update(0.2, 0.2);
    dressing.update({ cameraPosition: camera, reducedMotion: true });
    expect(dressing.meteor.visible).toBe(false);
    dressing.ritual.cancel();
    dressing.update({ cameraPosition: camera, reducedMotion: false });
    expect(dressing.meteor.visible).toBe(false);
  });
});
