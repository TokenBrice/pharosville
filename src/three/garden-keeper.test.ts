import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gardenSkyDayFromParts, pinGardenSkyDay } from "../systems/sky-almanac";
import { gardenRitualHandler } from "../systems/garden-director";
import { createGardenKeeper, gardenKeeperWalk, GARDEN_KEEPER_KINDLE_WINDOW, type GardenKeeper } from "./garden-keeper";
import {
  GARDEN_KINDLE_ORDER,
  gardenLanternKindleFactor,
  gardenLanternKindleState,
  updateGardenLanternKindling,
} from "./garden-lanterns";

const PINNED_DAY = gardenSkyDayFromParts({
  year: 2026, month: 9, day: 26, utcOffsetHours: 2, dstHours: 1,
  latitude: { latitudeRad: (35 * Math.PI) / 180, southern: false },
});
/** 18:58 — just after sunset, before the sun's own clock lights anything. */
const EDGE = 18.97;

beforeEach(() => pinGardenSkyDay(PINNED_DAY));
afterEach(() => pinGardenSkyDay(null));

/** Runs the ritual at 60 fps from `from` to `to` seconds, sampling the kindle state. */
function run(keeper: GardenKeeper, from: number, to: number, onFrame?: (t: number) => void) {
  for (let t = from; t <= to; t += 1 / 60) {
    keeper.handler.update(t, 1 / 60);
    keeper.update({ deltaSeconds: 1 / 60, hour: EDGE + t / 3600, reducedMotion: false });
    updateGardenLanternKindling(EDGE + t / 3600, 1 / 60);
    onFrame?.(t);
  }
}

const litNow = (order: number) => {
  const { progress, window } = gardenLanternKindleState();
  return gardenLanternKindleFactor(order, progress, window);
};

describe("the evening keeper (W5.4, K20)", () => {
  it("registers the kindling ritual and lights path → tower → lantern → stations → tōrō in 3–5 minutes", () => {
    const keeper = createGardenKeeper();
    expect(gardenRitualHandler("kindling")).toBe(keeper.handler);
    expect(keeper.durationSeconds).toBeGreaterThanOrEqual(180);
    expect(keeper.durationSeconds).toBeLessThanOrEqual(300);
    updateGardenLanternKindling(EDGE, 0, true);
    keeper.handler.start(0);
    const order = GARDEN_KINDLE_ORDER;
    const fixtures = [order.chasekiLantern, order.landingLantern, ...order.stairEmbers, order.lantern,
      order.stationNearest, order.stationFarthest, order.toro];
    const litAt = fixtures.map(() => Number.NaN);
    let figureGoneAt = Number.NaN;
    run(keeper, 0, keeper.durationSeconds + 5, (t) => {
      fixtures.forEach((fixture, index) => {
        if (Number.isNaN(litAt[index]!) && litNow(fixture) > 0.5) litAt[index] = t;
      });
      if (t > 5 && Number.isNaN(figureGoneAt) && !keeper.figure.visible) figureGoneAt = t;
    });
    expect(litAt.every(Number.isFinite)).toBe(true);
    for (let index = 1; index < litAt.length; index += 1) expect(litAt[index]!).toBeGreaterThan(litAt[index - 1]!);
    // He is seen on the island path only; the embers rise after he goes in.
    expect(figureGoneAt).toBeLessThan(litAt[2]!);
    expect(figureGoneAt).toBeGreaterThan(litAt[1]!);
    keeper.dispose();
    expect(gardenRitualHandler("kindling")).toBeNull();
  });

  it("walks from the chaseki door to the precinct gate and never pops in or out", () => {
    const keeper = createGardenKeeper({ register: false });
    const walk = gardenKeeperWalk();
    keeper.handler.start(0);
    let previous = 0;
    run(keeper, 0, walk.gateSeconds + 3, () => {
      const opacity = keeper.figure.material.opacity;
      expect(Math.abs(opacity - previous)).toBeLessThanOrEqual(1 / 60 / 1.5 + 1e-9);
      previous = opacity;
    });
    const first = walk.steps[0]!.from;
    const last = walk.steps.at(-1)!.to;
    expect(Math.hypot(first.x - 4.7, first.z - 3.65)).toBeLessThan(0.3);
    expect(last.y).toBeGreaterThan(8);
    expect(keeper.figure.visible).toBe(false);
    // A small figure: ≤ 300 triangles in one draw.
    expect(keeper.figure.geometry.getAttribute("position").count / 3).toBeLessThanOrEqual(300);
    keeper.dispose();
  });

  it("holds what he lit when cancelled, and never darkens a lamp the sun already lit", () => {
    const keeper = createGardenKeeper({ register: false });
    updateGardenLanternKindling(EDGE, 0, true);
    keeper.handler.start(0);
    run(keeper, 0, 120);
    const lanternBefore = litNow(GARDEN_KINDLE_ORDER.landingLantern);
    expect(lanternBefore).toBe(1);
    keeper.handler.cancel();
    run(keeper, 120, 140);
    expect(litNow(GARDEN_KINDLE_ORDER.landingLantern)).toBe(1);
    expect(keeper.ritual.active).toBe(false);
    // Next morning the hold is released and dawn banks by the sun.
    keeper.update({ deltaSeconds: 1 / 60, hour: 12, reducedMotion: false });
    updateGardenLanternKindling(12, 0, true);
    expect(litNow(GARDEN_KINDLE_ORDER.chasekiLantern)).toBe(0);
    keeper.dispose();
  });

  it("never banks what an earlier walk lit when the ritual is restarted", () => {
    const keeper = createGardenKeeper({ register: false });
    updateGardenLanternKindling(EDGE, 0, true);
    keeper.handler.start(0);
    run(keeper, 0, 110);
    expect(litNow(GARDEN_KINDLE_ORDER.stairEmbers[0])).toBe(1);
    keeper.handler.cancel();
    keeper.handler.start(110);
    run(keeper, 110, 130);
    expect(litNow(GARDEN_KINDLE_ORDER.stairEmbers[0])).toBe(1);
    expect(litNow(GARDEN_KINDLE_ORDER.landingLantern)).toBe(1);
    keeper.dispose();
  });

  it("uses a narrow window only while he walks", () => {
    const keeper = createGardenKeeper({ register: false });
    updateGardenLanternKindling(EDGE, 0, true);
    keeper.handler.start(0);
    run(keeper, 0, 10);
    expect(gardenLanternKindleState().window).toBeCloseTo(GARDEN_KEEPER_KINDLE_WINDOW, 2);
    keeper.dispose();
  });
});
