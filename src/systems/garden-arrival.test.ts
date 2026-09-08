import { describe, expect, it } from "vitest";
import { defaultCamera } from "./camera";
import {
  easeOutQuint,
  GARDEN_ARRIVAL_DURATION_MS,
  gardenArrivalCamera,
  sampleGardenArrivalCamera,
  sampleGardenArrivalCeremonyPose,
} from "./garden-arrival";
import { buildPharosVilleMap } from "./world-layout";

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

  it("opens at 0.82 of the resting frame and eases onto the new rest", () => {
    // Arrival opens wider than rest by the authored 0.82 factor and settles
    // on defaultCamera's framing over the same nine seconds.
    const map = buildPharosVilleMap();
    const rest = defaultCamera({ height: 1004, map, width: 1568 });
    const opening = gardenArrivalCamera(rest);
    expect(opening.zoom).toBeCloseTo(rest.zoom * 0.82);
    const settled = sampleGardenArrivalCamera(opening, rest, GARDEN_ARRIVAL_DURATION_MS);
    expect(settled).toEqual({ camera: rest, done: true });
  });

  it("authors an eight-to-twelve-second ceremony with a deterministic reduced-motion mid-pose", () => {
    expect(sampleGardenArrivalCeremonyPose(0, 10)).toEqual({
      compression: 1,
      ensoWake: 0,
      sailDip: 0,
    });
    const middle = sampleGardenArrivalCeremonyPose(5, 10);
    expect(middle.compression).toBeCloseTo(0.84);
    expect(middle.sailDip).toBe(1);
    expect(sampleGardenArrivalCeremonyPose(99, 10)).toEqual({
      compression: 1,
      ensoWake: 0,
      sailDip: 0,
    });
    expect(sampleGardenArrivalCeremonyPose(0, 8, true)).toEqual(middle);
  });
});
