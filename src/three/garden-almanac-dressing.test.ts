import { Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { gardenAlmanacEventForDate } from "../systems/garden-almanac";
import { rimLandAt } from "../systems/garden-rim";
import {
  createGardenAlmanacDressing,
  GARDEN_ALMANAC_FADE_SECONDS,
  GARDEN_HERON_PERCH_WORLD,
  GARDEN_LANTERN_ROUND_COUNT,
  GARDEN_LANTERN_ROUND_TILES,
} from "./garden-almanac-dressing";
import { TILE_SCALE } from "./garden-util";

const EVENTS = (() => {
  const byId = new Map<string, ReturnType<typeof gardenAlmanacEventForDate>>();
  for (let day = 1; day <= 31; day += 1) {
    const event = gardenAlmanacEventForDate(new Date(Date.UTC(2026, 7, day)));
    byId.set(event.id, event);
  }
  return byId;
})();

describe("garden almanac dressing", () => {
  it("uses the named multi-second fade and one instanced lantern round", () => {
    const dressing = createGardenAlmanacDressing();
    expect(GARDEN_ALMANAC_FADE_SECONDS).toBe(9);
    expect(dressing.lanternRound.count).toBe(GARDEN_LANTERN_ROUND_COUNT);
  });

  it("shows only the selected event after its shared fade", () => {
    const dressing = createGardenAlmanacDressing();
    const heron = EVENTS.get("heron-dusk")!;
    dressing.update({
      activeEvent: heron,
      deltaSeconds: 0,
      reducedMotion: false,
      timeSeconds: 0,
    });
    dressing.update({
      activeEvent: heron,
      deltaSeconds: GARDEN_ALMANAC_FADE_SECONDS,
      reducedMotion: false,
      timeSeconds: 9,
    });
    expect(dressing.heron.visible).toBe(true);
    expect(dressing.heron.position.x).toBe(GARDEN_HERON_PERCH_WORLD.x);
    expect(dressing.heron.position.z).toBe(GARDEN_HERON_PERCH_WORLD.z);
    expect(dressing.lanternRound.visible).toBe(false);
    expect(dressing.meteor.visible).toBe(false);
  });

  it("holds the active event as a complete deterministic reduced-motion frame", () => {
    const dressing = createGardenAlmanacDressing();
    dressing.update({
      activeEvent: EVENTS.get("lantern-round")!,
      deltaSeconds: GARDEN_ALMANAC_FADE_SECONDS,
      reducedMotion: false,
      timeSeconds: 9,
    });
    dressing.update({
      activeEvent: EVENTS.get("lantern-round")!,
      deltaSeconds: 0,
      reducedMotion: true,
      timeSeconds: 0,
    });
    expect(dressing.heron.visible).toBe(false);
    expect(dressing.lanternRound.visible).toBe(true);
    expect(dressing.meteor.visible).toBe(false);
    const matrix = new Matrix4();
    dressing.lanternRound.getMatrixAt(0, matrix);
    const position = new Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(GARDEN_LANTERN_ROUND_TILES[0]!.x * TILE_SCALE);
    expect(position.z).toBeCloseTo(GARDEN_LANTERN_ROUND_TILES[0]!.y * TILE_SCALE);
    expect(GARDEN_LANTERN_ROUND_TILES.every((tile) => rimLandAt(tile.x, tile.y))).toBe(true);
  });
});
