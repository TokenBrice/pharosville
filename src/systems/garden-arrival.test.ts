import { describe, expect, it } from "vitest";
import { defaultCamera } from "./camera";
import {
  easeOutQuint,
  GARDEN_ARRIVAL_DURATION_MS,
  gardenArrivalCamera,
  sampleGardenArrivalCamera,
  sampleGardenArrivalCeremonyPose,
} from "./garden-arrival";
import { worldToScreen } from "./projection";
import { buildPharosVilleMap } from "./world-layout";

describe("garden arrival", () => {
  it("uses a bounded easeOutQuint curve", () => {
    expect(easeOutQuint(-1)).toBe(0);
    expect(easeOutQuint(0.5)).toBeCloseTo(0.96875);
    expect(easeOutQuint(2)).toBe(1);
  });

  it("starts on the rest ShotSpec with no slide and holds it until the arrival completes", () => {
    const map = buildPharosVilleMap();
    const viewport = { x: 1568, y: 1004 };
    const rest = defaultCamera({ height: viewport.y, map, width: viewport.x });
    const opening = gardenArrivalCamera(rest);
    const tower = { x: 94.8, y: 20, z: 109 };
    const seat = worldToScreen(tower, rest, viewport);
    for (const elapsed of [0, GARDEN_ARRIVAL_DURATION_MS / 3, GARDEN_ARRIVAL_DURATION_MS * 0.9]) {
      const sample = sampleGardenArrivalCamera(opening, rest, elapsed);
      expect(sample.done).toBe(false);
      expect(worldToScreen(tower, sample.camera, viewport)).toEqual(seat);
    }
    expect(sampleGardenArrivalCamera(opening, rest, GARDEN_ARRIVAL_DURATION_MS)).toEqual({ camera: rest, done: true });
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
