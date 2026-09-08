import { describe, expect, it } from "vitest";
import { gardenAttractKeyframes } from "./garden-attract";
import { observeTourPoseToCamera } from "./observe-tour";
import { TILE_SCALE, worldToScreen } from "./projection";
import { LIGHTHOUSE_TILE, buildPharosVilleMap } from "./world-layout";

const map = buildPharosVilleMap();
describe("garden attract postcards", () => {
  it("gives every named subject a visible stationary window at both gates", () => {
    const book = gardenAttractKeyframes(LIGHTHOUSE_TILE);
    expect(book.map((frame) => frame.name)).toEqual([
      "Pharos Dawn", "Mole Market", "Storm Passage", "Wreck Memorial", "Garden Shore", "Ledger Basin",
    ]);
    expect(book).toEqual(gardenAttractKeyframes(LIGHTHOUSE_TILE));
    for (const frame of book) {
      expect(frame.holdSeconds).toBeGreaterThanOrEqual(180);
      expect(frame.holdSeconds).toBeLessThanOrEqual(360);
      expect(frame.travelSeconds).toBeGreaterThanOrEqual(20);
      expect(frame.travelSeconds).toBeLessThanOrEqual(35);
      expect(frame.zoom).toBeGreaterThanOrEqual(1);
      expect(frame.zoom).toBeLessThanOrEqual(1.4);
      for (const viewport of [{ x: 900, y: 720 }, { x: 1200, y: 640 }]) {
        const camera = observeTourPoseToCamera(frame, viewport, map);
        const point = worldToScreen({ x: frame.subjectTile.x * TILE_SCALE, y: 0, z: frame.subjectTile.y * TILE_SCALE }, camera, viewport);
        expect(point.x, frame.name).toBeGreaterThan(0);
        expect(point.x, frame.name).toBeLessThan(viewport.x);
        expect(point.y, frame.name).toBeGreaterThan(0);
        expect(point.y, frame.name).toBeLessThan(viewport.y);
      }
    }
  });
});
