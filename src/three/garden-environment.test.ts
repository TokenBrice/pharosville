import { describe, expect, it } from "vitest";
import { dayCyclePhase } from "./garden-day-cycle";
import {
  GARDEN_ENVIRONMENT_INTENSITY,
  gardenEnvironmentPhaseKey,
  resolveGardenEnvironmentStormBand,
} from "./garden-environment";

/**
 * The bake itself needs a live WebGL2 context, so what is testable here is the
 * CACHE KEY — which is also the part that decides whether the probe is rebuilt
 * a handful of times an hour or once a frame. `world-renderer.test.ts` asserts
 * the renderer honours it.
 */
describe("gardenEnvironmentPhaseKey", () => {
  it("holds one key across the long flat middle of day and of night", () => {
    // The sky does not move between 11:00 and 14:00, and neither should the
    // probe: this is the case that would otherwise bake on every frame of a
    // visitor's whole afternoon.
    const noon = gardenEnvironmentPhaseKey(dayCyclePhase(12));
    expect(gardenEnvironmentPhaseKey(dayCyclePhase(11))).toBe(noon);
    expect(gardenEnvironmentPhaseKey(dayCyclePhase(14))).toBe(noon);

    const midnight = gardenEnvironmentPhaseKey(dayCyclePhase(0));
    expect(gardenEnvironmentPhaseKey(dayCyclePhase(1.5))).toBe(midnight);
    expect(gardenEnvironmentPhaseKey(dayCyclePhase(23))).toBe(midnight);
  });

  it("separates the three states the environment exists to tell apart", () => {
    const keys = [dayCyclePhase(12), dayCyclePhase(18), dayCyclePhase(23)]
      .map(gardenEnvironmentPhaseKey);
    expect(new Set(keys).size).toBe(3);
  });

  it("costs a bounded number of bakes for a whole day, dragged end to end", () => {
    // The worst case is not the wall clock — which crosses a step every ~35
    // minutes — but a visitor sweeping the time control from midnight to
    // midnight, which walks the entire cycle in a few seconds of frames. What
    // bounds that is the number of DISTINCT keys the day contains, because the
    // probe can only bake when the key changes, so the sweep costs the same 41
    // bakes whether it takes two seconds or two hours.
    const keys = new Set<string>();
    for (let hour = 0; hour < 24; hour += 0.01) {
      keys.add(gardenEnvironmentPhaseKey(dayCyclePhase(hour)));
    }
    expect(keys.size).toBe(41);
  });

  it("rebakes through the evening ramp, so the ember horizon reaches the metal", () => {
    const keys = new Set<string>();
    for (let hour = 16.5; hour <= 21.25; hour += 0.1) {
      keys.add(gardenEnvironmentPhaseKey(dayCyclePhase(hour)));
    }
    // The steepest part of the cycle. One key here would mean the dusk sky
    // never reached the bronze it is supposed to light.
    expect(keys.size).toBeGreaterThan(10);
  });

  it("clamps rather than throwing on an out-of-range phase", () => {
    expect(gardenEnvironmentPhaseKey({ daylight: 2, dusk: -1, night: 0 })).toBe("10:0:0");
    // The storm term (Phase 2) joins the key, coarsely quantised and clamped.
    expect(gardenEnvironmentPhaseKey({ daylight: 2, dusk: -1, night: 0 }, 7)).toBe("10:0:4");
  });

  it("keeps the probe inside the strength range measured against the real GPU", () => {
    // The module header carries the measured table. 1.0 is the strongest value
    // that was actually captured and checked for a re-wash, so shipping above it
    // would be claiming a calibration nobody has looked at.
    expect(GARDEN_ENVIRONMENT_INTENSITY).toBeGreaterThan(0);
    expect(GARDEN_ENVIRONMENT_INTENSITY).toBeLessThanOrEqual(1);
  });

  it("does not rebake across a steady storm's breathing boundary", () => {
    let band: number | null = null;
    const visited: number[] = [];
    for (let seconds = 0; seconds <= 1_000; seconds += 0.5) {
      const stormLevel = 0.875 * (
        1 + 0.05 * Math.sin((Math.PI * 2 * seconds) / 167 + 0.6)
      );
      const next = resolveGardenEnvironmentStormBand(band, stormLevel);
      if (next !== band) visited.push(next);
      band = next;
    }

    expect(visited).toEqual([4]);
  });

  it("moves hysteretic storm bands on material risk-state changes", () => {
    let band = resolveGardenEnvironmentStormBand(null, 0.1);
    expect(band).toBe(0);
    band = resolveGardenEnvironmentStormBand(band, 0.2);
    expect(band).toBe(1);
    band = resolveGardenEnvironmentStormBand(band, 0.7);
    expect(band).toBe(3);
    band = resolveGardenEnvironmentStormBand(band, 0.2);
    expect(band).toBe(1);
  });
});
