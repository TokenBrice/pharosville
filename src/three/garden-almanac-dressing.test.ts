import { describe, expect, it } from "vitest";
import { gardenAlmanacEventForDate } from "../systems/garden-almanac";
import {
  createGardenAlmanacDressing,
  GARDEN_ALMANAC_FADE_SECONDS,
  GARDEN_LANTERN_ROUND_COUNT,
} from "./garden-almanac-dressing";

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
      islandX: 20,
      islandZ: 30,
      reducedMotion: false,
      timeSeconds: 0,
    });
    dressing.update({
      activeEvent: heron,
      deltaSeconds: GARDEN_ALMANAC_FADE_SECONDS,
      islandX: 20,
      islandZ: 30,
      reducedMotion: false,
      timeSeconds: 9,
    });
    expect(dressing.heron.visible).toBe(true);
    expect(dressing.lanternRound.visible).toBe(false);
    expect(dressing.meteor.visible).toBe(false);
  });

  it("removes every event in the deterministic reduced-motion composition", () => {
    const dressing = createGardenAlmanacDressing();
    dressing.update({
      activeEvent: EVENTS.get("lantern-round")!,
      deltaSeconds: GARDEN_ALMANAC_FADE_SECONDS,
      islandX: 0,
      islandZ: 0,
      reducedMotion: false,
      timeSeconds: 9,
    });
    dressing.update({
      activeEvent: EVENTS.get("lantern-round")!,
      deltaSeconds: 0,
      islandX: 0,
      islandZ: 0,
      reducedMotion: true,
      timeSeconds: 0,
    });
    expect(dressing.heron.visible).toBe(false);
    expect(dressing.lanternRound.visible).toBe(false);
    expect(dressing.meteor.visible).toBe(false);
  });
});
