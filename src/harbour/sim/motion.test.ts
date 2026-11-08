import { describe, expect, it } from "vitest";
import { buildHarbourModel } from "../model/build";
import { buildPlan, CYCLE_S } from "./plan";
import { DEAD_STABLECOINS } from "@shared/lib/dead-stablecoins";
import { EV_LAUNCH, EV_REJOIN, EV_TO_SHOALS, EV_TOW, HarbourSim, PH_SAILING, windVeer, type SimEvent } from "./sim";
import { makeLayout, makePayloads, PIERED, T0_MS } from "./test-fixtures";

const layout = makeLayout();
const model = () => buildHarbourModel(makePayloads(), T0_MS, { pieredChains: PIERED });

describe("lane MOTION sim hooks", { timeout: 120_000 }, () => {
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
    const sim = new HarbourSim(model(), layout, T0_MS, null, buildPlan);
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
    const sim = new HarbourSim(first, layout, T0_MS, null, buildPlan);
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
    const sim = new HarbourSim(first, layout, T0_MS, null, buildPlan);
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

describe("refresh and reroute continuity", () => {
  it("keeps a tow, drift and launch through unrelated structural, membership and freshness refreshes", () => {
    const payloads = makePayloads({ n: 40 });
    const opts = { pieredChains: PIERED, dead: [] };
    const first = buildHarbourModel(payloads, T0_MS, opts);
    const sim = new HarbourSim({ ...first, planKey: first.planKey + "#before-launch", boats: first.boats.slice(0, -1) }, layout, T0_MS, null, buildPlan);
    const launch = first.boats.at(-1)!.id;
    const tow = first.boats[0].id, drift = first.boats[1].id;
    const events: SimEvent[] = []; sim.onEvent((e) => events.push(e));
    const t = T0_MS + 20_000;
    sim.poseAt(t);
    const changed = { ...first, boats: first.boats.map((b) => b.id === tow ? { ...b, state: "wrecked" as const } : b.id === drift ? { ...b, state: "shoals" as const } : b) };
    sim.setModel(changed, t);
    for (const [k, stale] of [false, true, false].entries()) {
      const now = t + (k + 1) * 10_000;
      const before = structuredClone(sim.poseAt(now));
      const refreshed = { ...changed, planKey: first.planKey + k, boats: changed.boats.filter((_, i) => i !== 35 + k).map((b, i) => k === 0 && i === 2 ? { ...b, state: "shoals" as const } : b), truth: { ...changed.truth, stablecoins: { ...changed.truth.stablecoins, state: stale ? "stale" as const : "current" as const } } };
      sim.setModel(refreshed, now);
      const after = sim.poseAt(now);
      for (const id of [tow, drift, launch]) {
        const a = before.ids.indexOf(id), b = after.ids.indexOf(id);
        expect(Math.hypot(after.position[b * 3] - before.position[a * 3], after.position[b * 3 + 2] - before.position[a * 3 + 2])).toBeLessThan(0.1);
        expect(after.event[b]).toBe(id === tow ? EV_TOW : id === drift ? EV_TO_SHOALS : EV_LAUNCH);
      }
    }
    expect(events.filter((e) => e.kind === "tow")).toHaveLength(1);
    expect(events.filter((e) => e.kind === "to-shoals" && e.id === drift)).toHaveLength(1);
    sim.poseAt(t + 3 * 3600_000);
    expect(sim.tugs.count).toBe(0);
  }, 60_000);

  it("carries position, heading and speed into depeg, recovery, replanning and stale voyages", () => {
    const opts = { pieredChains: PIERED, dead: [] };
    const first = buildHarbourModel(makePayloads({ n: 40 }), T0_MS, opts);
    const sim = new HarbourSim(first, layout, T0_MS, null, buildPlan);
    let t = T0_MS, i = -1;
    for (; t < T0_MS + 3600_000; t += 1000) {
      const p = sim.poseAt(t);
      i = first.boats.findIndex((b, j) => b.state === "circuit" && p.phase[j] === PH_SAILING && p.speed[j] > 2);
      if (i >= 0) break;
    }
    expect(i).toBeGreaterThanOrEqual(0);
    const id = first.boats[i].id;
    for (const [k, state] of ["shoals", "circuit", "circuit"].entries()) {
      const before = structuredClone(sim.poseAt(t));
      const next = { ...first, planKey: first.planKey + k, boats: first.boats.map((b) => b.id === id ? { ...b, state: state as "shoals" | "circuit" } : b) };
      sim.setModel(next, t);
      const after = sim.poseAt(t);
      expect(after.speed[i]).toBeCloseTo(before.speed[i], 3);
      expect(Math.hypot(after.position[i * 3] - before.position[i * 3], after.position[i * 3 + 2] - before.position[i * 3 + 2])).toBeLessThan(0.1);
      expect(Math.abs(Math.atan2(Math.sin(after.heading[i] - before.heading[i]), Math.cos(after.heading[i] - before.heading[i])))).toBeLessThan(0.1);
      const speed = after.speed[i];
      sim.poseAt(t + 100);
      expect(Math.abs(sim.pose.speed[i] - speed)).toBeLessThan(0.1);
      t += 5000;
    }
    const beforeStale = structuredClone(sim.poseAt(t));
    sim.setStale(true, t);
    const afterStale = sim.poseAt(t);
    expect(afterStale.speed[i]).toBeCloseTo(beforeStale.speed[i], 3);
    expect(Math.hypot(afterStale.position[i * 3] - beforeStale.position[i * 3], afterStale.position[i * 3 + 2] - beforeStale.position[i * 3 + 2])).toBeLessThan(0.1);
  }, 60_000);
});
