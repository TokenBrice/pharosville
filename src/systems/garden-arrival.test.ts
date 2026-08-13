import { describe, expect, it } from "vitest";
import {
  easeOutQuint,
  GARDEN_ARRIVAL_DURATION_MS,
  gardenArrivalCamera,
  sampleGardenArrivalCamera,
} from "./garden-arrival";

describe("garden arrival", () => {
  it("uses a bounded easeOutQuint curve", () => {
    expect(easeOutQuint(-1)).toBe(0);
    expect(easeOutQuint(0.5)).toBeCloseTo(0.96875);
    expect(easeOutQuint(2)).toBe(1);
  });

  it("settles exactly on the veranda camera after nine seconds", () => {
    const target = { offsetX: 400, offsetY: 220, zoom: 1.2 };
    const start = gardenArrivalCamera(target);
    const halfway = sampleGardenArrivalCamera(start, target, GARDEN_ARRIVAL_DURATION_MS / 2);
    const settled = sampleGardenArrivalCamera(start, target, GARDEN_ARRIVAL_DURATION_MS);

    expect(start.zoom).toBeLessThan(target.zoom);
    expect(halfway.done).toBe(false);
    expect(halfway.camera.zoom).toBeGreaterThan(start.zoom);
    expect(settled).toEqual({ camera: target, done: true });
  });
});
