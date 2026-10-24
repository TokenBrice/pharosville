import { describe, expect, it } from "vitest";
import { buildHarbourModel } from "../model/build";
import { CYCLE_S } from "./plan";
import { DEAD_STABLECOINS } from "@shared/lib/dead-stablecoins";
import { EV_REJOIN, EV_TO_SHOALS, EV_TOW, HarbourSim, PH_SAILING, windVeer, type SimEvent } from "./sim";
import { makeLayout, makePayloads, PIERED, T0_MS } from "./test-fixtures";

const layout = makeLayout();
const model = () => buildHarbourModel(makePayloads(), T0_MS, { pieredChains: PIERED });

describe("lane MOTION sim hooks", () => {
  it("07-M5 veer: small, slow and periodic with the 6 h cycle", () => {
    let max = 0, rate = 0;
    for (let t = 0; t < CYCLE_S; t += 7) {
      const v = windVeer(t);
      max = Math.max(max, Math.abs(v));
      rate = Math.max(rate, Math.abs(windVeer(t + 1) - v));
      expect(windVeer(t + CYCLE_S)).toBeCloseTo(v, 9);
    }
    expect(max).toBeLessThan(0.25);
    expect(max).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.002); // rad/s: the anchorage wheels over minutes
  });

  it("07-M8 drift: only hulls under way carry a lane / give-way offset; still hulls none", () => {
    const sim = new HarbourSim(model(), layout, T0_MS);
    let moving = 0, withDrift = 0;
    for (let s = 0; s < 900; s += 5) {
      const p = sim.poseAt(T0_MS + s * 1000);
      for (let i = 0; i < p.count; i++) {
        const d = Math.hypot(p.drift[i * 2], p.drift[i * 2 + 1]);
        if (p.phase[i] === PH_SAILING) { moving++; if (d > 0.05) withDrift++; }
        else if (p.phase[i] !== 1 && p.phase[i] !== 3) expect(d).toBe(0);
      }
    }
    expect(moving).toBeGreaterThan(0);
    expect(withDrift).toBeGreaterThan(0);
  });

  it("07-M6 a death: canvas struck, a tug tows her to Wreck Cove, casts off and rows home; events fire once", () => {
    const opts = { pieredChains: PIERED, dead: [] };
    const first = buildHarbourModel(makePayloads(), T0_MS, opts);
    const victim = first.boats.find((b) => b.state === "circuit" && b.hullClass === "medium")!.id;
    const sim = new HarbourSim(first, layout, T0_MS);
    const events: SimEvent[] = [];
    sim.onEvent((e) => events.push(e));
    const t1 = T0_MS + 300_000;
    sim.poseAt(t1);
    const dead = [{ ...DEAD_STABLECOINS[0], id: victim }];
    sim.setModel(buildHarbourModel(makePayloads({ nowMs: t1 }), t1, { pieredChains: PIERED, dead }), t1);
    expect(events.filter((e) => e.kind === "tow").map((e) => e.id)).toEqual([victim]);
    const vi = sim.indexOf(victim);
    let towed = 0, home = 0, lastTug = -1, maxGap = 0;
    for (let s = 1; s < 3 * 3600; s += 5) {
      const p = sim.poseAt(t1 + s * 1000);
      const T = sim.tugs;
      if (p.event[vi] === EV_TOW) {
        expect(p.sailState[vi]).toBe(0);
        if (T.count && T.of[0] === vi) {
          towed++;
          maxGap = Math.max(maxGap, Math.hypot(T.x[0] - p.position[vi * 3], T.z[0] - p.position[vi * 3 + 2]));
        }
      }
      if (T.count && T.of[0] === -1) home++;
      if (T.count) lastTug = s;
    }
    expect(towed).toBeGreaterThan(10);
    expect(home).toBeGreaterThan(10);
    expect(maxGap).toBeLessThan(60);
    // she does not linger: the tug is gone well within the hour after the tow
    expect(lastTug).toBeGreaterThan(0);
    expect(sim.tugs.count).toBe(0);
    // dockings are reported too
    expect(events.some((e) => e.kind === "docking")).toBe(true);
  });

  it("07-M7 adrift to the Shoals: half-loose canvas, slower than her pace, then sheeted home on recovery", () => {
    const opts = { pieredChains: PIERED, dead: [] };
    const first = buildHarbourModel(makePayloads(), T0_MS, opts);
    const victim = first.boats.find((b) => b.state === "circuit" && b.hullClass === "small")!.id;
    const sim = new HarbourSim(first, layout, T0_MS);
    const t1 = T0_MS + 120_000;
    sim.poseAt(t1);
    sim.setModel(buildHarbourModel(makePayloads({ depegIds: [victim], nowMs: t1 }), t1, opts), t1);
    const vi = sim.indexOf(victim);
    let adrift = 0, maxSail = 0, s = 0;
    for (; s < 3600; s += 5) {
      const p = sim.poseAt(t1 + s * 1000);
      if (p.event[vi] !== EV_TO_SHOALS) break;
      adrift++; maxSail = Math.max(maxSail, p.sailState[vi]);
    }
    expect(adrift).toBeGreaterThan(5);
    expect(maxSail).toBeLessThan(0.4);
    const t2 = t1 + 60 * 60_000;
    sim.poseAt(t2);
    sim.setModel(buildHarbourModel(makePayloads({ nowMs: t2 }), t2, opts), t2);
    let p = sim.poseAt(t2 + 2000);
    expect(p.event[vi]).toBe(EV_REJOIN);
    const early = p.sailState[vi];
    p = sim.poseAt(t2 + 60_000);
    if (p.event[vi] === EV_REJOIN) expect(p.sailState[vi]).toBeGreaterThan(early);
    expect(early).toBeLessThan(0.5);
  });
});
