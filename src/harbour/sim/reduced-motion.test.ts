import { describe, expect, it, vi } from "vitest";
import { buildHarbourModel } from "../model/build";
import { buildPlan } from "./plan";
import { HarbourSim, type PoseBuffer } from "./sim";
import { makeCoins, makeLayout, makePayloads, PIERED, T0_MS } from "./test-fixtures";

const opts = { pieredChains: PIERED, dead: [] };
function boatPose(p: PoseBuffer, i: number) {
  return Object.fromEntries(Object.entries(p).filter(([, v]) => ArrayBuffer.isView(v)).map(([k, v]) => {
    const values = v as Float32Array, stride = values.length / p.count;
    return [k, [...values.slice(i * stride, (i + 1) * stride)]];
  }));
}
describe("truthful static snapshot changes", () => {
  it("settles depeg, recovery, launch, death and stale updates without voyages or replayed ceremonies", () => {
    const layout = makeLayout({ berthsPerClass: 3 }), coins = makeCoins({ n: 6 });
    const model = buildHarbourModel(makePayloads({ coins }), T0_MS, opts);
    const sim = new HarbourSim(model, layout, T0_MS, null, buildPlan);
    const events = vi.fn(); sim.onEvent(events);
    const before = structuredClone(sim.poseAt(T0_MS));
    sim.settleMotion(T0_MS);
    const id = model.boats[0].id;
    const depeg = buildHarbourModel(makePayloads({ coins, depegIds: [id] }), T0_MS, opts);
    sim.setModel(depeg, T0_MS, undefined, true); sim.poseAt(T0_MS);
    expect(sim.slotOf(sim.indexOf(id))?.kind).toBe("shoals");
    expect([...sim.pose.event]).toEqual(Array(6).fill(0));
    for (let i = 1; i < sim.pose.count; i++) expect(boatPose(sim.pose, i)).toEqual(boatPose(before, i));
    sim.setModel(model, T0_MS, undefined, true); sim.poseAt(T0_MS);
    expect(sim.slotOf(sim.indexOf(id))?.kind).not.toBe("shoals");
    const fresh = { ...coins[2], id: "new-coin", symbol: "NEW" };
    const launch = buildHarbourModel(makePayloads({ coins: [...coins, fresh] }), T0_MS, opts);
    sim.setModel(launch, T0_MS, undefined, true); sim.poseAt(T0_MS);
    expect(sim.pose.event[sim.indexOf(fresh.id)]).toBe(0);
    expect(sim.pose.speed[sim.indexOf(fresh.id)]).toBe(0);
    const dead = { ...launch, planKey: launch.planKey + "#death", boats: launch.boats.map((b) => b.id === id ? { ...b, state: "wrecked" as const } : b) };
    sim.setModel(dead, T0_MS, undefined, true); sim.poseAt(T0_MS);
    expect(sim.slotOf(sim.indexOf(id))?.kind).toBe("wreck");
    const stale = { ...dead, truth: { ...dead.truth, stablecoins: { ...dead.truth.stablecoins, state: "stale" as const } } };
    sim.setModel(stale, T0_MS, undefined, true); sim.poseAt(T0_MS);
    expect(sim.frozen).toBe(true);
    expect([...sim.pose.event]).toEqual(Array(7).fill(0));
    expect(events).not.toHaveBeenCalled();
  });

  it("resumes unchanged ordinary poses on the held clock without constructing rejoin voyages", () => {
    const model = buildHarbourModel(makePayloads({ n: 6 }), T0_MS, opts);
    const sim = new HarbourSim(model, makeLayout({ berthsPerClass: 3 }), T0_MS, null, buildPlan);
    const before = structuredClone(sim.poseAt(T0_MS));
    sim.settleMotion(T0_MS);
    expect(sim.poseAt(T0_MS)).toEqual(before);
    sim.resumeMotion(T0_MS);
    expect(sim.poseAt(T0_MS)).toEqual(before);
    expect(sim.stats.voyages).toBe(0);
  });

  it("settles a changed circuit while preserving every unaffected held pose", () => {
    const model = buildHarbourModel(makePayloads({ n: 6 }), T0_MS, opts);
    const sim = new HarbourSim(model, makeLayout({ berthsPerClass: 3 }), T0_MS, null, buildPlan);
    const before = structuredClone(sim.poseAt(T0_MS));
    const victim = model.boats.findIndex((b) => b.state === "circuit");
    expect(victim).toBeGreaterThanOrEqual(0);
    const changed = { ...model, planKey: model.planKey + "#circuit", boats: model.boats.map((b, i) => i === victim ? { ...b, circuit: [...b.circuit].reverse() } : b) };
    sim.settleMotion(T0_MS); sim.setModel(changed, T0_MS, undefined, true); sim.poseAt(T0_MS);
    expect(sim.pose.speed[victim]).toBe(0); expect(sim.pose.event[victim]).toBe(0);
    for (let i = 0; i < sim.pose.count; i++) if (i !== victim) expect(boatPose(sim.pose, i)).toEqual(boatPose(before, i));
    const occupied = [...sim.pose.slot].filter((slot) => slot >= 0);
    expect(new Set(occupied).size).toBe(occupied.length);
  });
});
