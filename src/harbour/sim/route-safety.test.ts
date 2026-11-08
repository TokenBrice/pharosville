import { describe, expect, it } from "vitest";
import { buildHarbourModel } from "../model/build";
import { buildSimLayout } from "./layout-graph";
import { buildPath } from "./path";
import { buildPlan } from "./plan";
import { buildPlanLegPath, pathClear } from "./plan-paths";
import { HarbourSim } from "./sim";
import { makeLayout, makePayloads, PIERED, T0_MS } from "./test-fixtures";

describe("terminal routing safety", () => {
  it("rejects ordinary, scenic and outing paths when repair cannot clear blocked slips", () => {
    const L = buildSimLayout(makeLayout({ berthsPerClass: 1 }));
    const slots = [...L.pools.values()].map((pool) => pool.get("medium")![0]);
    L.hard = () => -10; L.field = null;
    for (const [from, to, loop] of [[slots[0], slots[1], 0], [slots[0], slots[1], 1], [slots[0], slots[0], 1]]) {
      expect(buildPlanLegPath(L, L.slots.length, from, to, "medium", loop).bad).toBe(true);
    }
  });

  it("rejects a disconnected lane route across a blocked channel", () => {
    const L = buildSimLayout(makeLayout({ berthsPerClass: 1 }));
    const slots = [...L.pools.values()].map((pool) => pool.get("medium")![0]);
    const a = L.slots[slots[0]], b = L.slots[slots[1]], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    L.graph.next.fill(-1); L.graph.dist.fill(Infinity); L.field = null;
    L.hard = (x, z) => Math.abs((x - (a.x + b.x) / 2) * dx + (z - (a.z + b.z) / 2) * dz) / length - 20;
    expect(buildPlanLegPath(L, L.slots.length, a.index, b.index, "medium", 0).bad).toBe(true);
  });

  it("sweeps between samples and checks both warp endpoints", () => {
    const L = buildSimLayout(makeLayout({ berthsPerClass: 1 }));
    L.field = null;
    const path = buildPath([[0, 0], [0, 100]], 5);
    L.hard = (_x, z) => Math.abs(z - 50) - 0.25;
    expect(pathClear(L, path, 5, 1)).toBe(false);
    L.hard = (x) => 10 - x;
    path.w1 = new Float32Array([15, 0, 0]);
    expect(pathClear(L, path, 5, 1)).toBe(false);
  });

  it("retains the last safe pose when an event route is impossible and exposes the local failure", () => {
    const layout = makeLayout(), opts = { pieredChains: PIERED, dead: [] };
    const first = buildHarbourModel(makePayloads({ n: 2 }), T0_MS, opts);
    const sim = new HarbourSim(first, layout, T0_MS, null, buildPlan);
    const before = structuredClone(sim.poseAt(T0_MS));
    sim.pose.heel[0] = 0.2;
    sim.layout.hard = () => -10; sim.layout.field = null;
    const id = first.boats[0].id;
    sim.setModel({ ...first, boats: first.boats.map((b, i) => i === 0 ? { ...b, state: "shoals" } : b) }, T0_MS);
    for (const dt of [0, 1000, 60_000]) {
      const p = sim.poseAt(T0_MS + dt);
      expect(p.position[0]).toBe(before.position[0]); expect(p.position[2]).toBe(before.position[2]);
      expect(p.slot[0]).toBe(-1); expect(p.speed[0]).toBe(0); expect(p.heel[0]).toBe(0);
    }
    expect(sim.routeUnavailable.has(id)).toBe(true);
  });

  it("never selects an undersized or conflicting stale berth when suitable berths are exhausted", () => {
    const layout = makeLayout({ berthsPerClass: 1 }), L = buildSimLayout(layout);
    const first = buildHarbourModel(makePayloads({ n: 1 }), T0_MS, { pieredChains: PIERED, dead: [] });
    const sim = new HarbourSim(first, L, T0_MS, null, buildPlan);
    const pool = L.pools.values().next().value!, large = pool.get("large")![0], skiff = pool.get("skiff")![0];
    const taken = new Set(L.slots.map((s) => s.index)); taken.delete(skiff);
    const internals = sim as unknown as { freeSlotNear(slot: number, r: { cls: string; loa: number }, taken: Set<number>): number };
    expect(internals.freeSlotNear(large, { cls: "large", loa: L.loa.large }, taken)).toBe(-1);
    taken.delete(large); L.slots[large].conflicts.push(pool.get("medium")![0]);
    expect(internals.freeSlotNear(large, { cls: "large", loa: L.loa.large }, taken)).toBe(-1);
  });
});
