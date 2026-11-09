import { describe, expect, it } from "vitest";
import { buildHarbourModel } from "../model/build";
import type { Slot } from "./layout-graph";
import { HarbourSim, windVeer } from "./sim";
import { makeLayout, T0_MS } from "./test-fixtures";

/** The swing heading as written before its per-slot / per-instant terms were cached. */
function reference(sim: HarbourSim, r: { lag: number; yawA: number; yawP: number; yawP2: number; phi: number }, s: Slot, t: number): number {
  const TAU = 2 * Math.PI;
  const tide = 0.22 * Math.sin(s.x / 95 + 0.4) + 0.16 * Math.cos(s.z / 70 - s.x / 160)
    + 0.24 * Math.sin((TAU * t) / 1800 + s.x / 130 + s.z / 170);
  return sim.layout.windFrom + windVeer(t - r.lag) + tide + 0.1 * Math.sin((TAU * t) / 432)
    + r.yawA * Math.sin((TAU * t) / r.yawP + r.phi) + 0.07 * Math.sin((TAU * t) / r.yawP2 + r.phi * 2.3);
}

describe("swing heading caches", () => {
  it("returns the uncached heading exactly for authored slots, re-used extra indices and every instant", () => {
    const sim = new HarbourSim(buildHarbourModel({}, T0_MS), makeLayout(), T0_MS);
    const internal = sim as unknown as { t: number; tmp: Float64Array; swingHeading(r: unknown, s: Slot): void };
    const r = { lag: 37, yawA: 0.31, yawP: 61, yawP2: 23, phi: 1.7 };
    const authored = sim.layout.slots.slice(0, 6);
    // an extra anchorage slot past the authored ones, then a different one re-using its index after a replan
    const extra = (x: number, z: number): Slot => ({ ...authored[0], index: sim.layout.slots.length, x, z });
    const first = extra(120.5, -48.25), second = extra(-301.75, 77.5);
    for (const t of [0, 12.5, 12.5, 1800.25, 86399.9]) {
      internal.t = t;
      for (const s of [...authored, first, second, ...authored]) {
        internal.swingHeading(r, s);
        expect(internal.tmp[10]).toBe(reference(sim, r, s, t));
      }
    }
  });
});
