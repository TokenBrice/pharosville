import { describe, expect, it } from "vitest";
import { buildHarbourModel } from "../model/build";
import { CYCLE_S, SEG_DOCK, SPEED } from "./plan";
import { EV_LAUNCH, EV_TO_SHOALS, HarbourSim, PH_ANCHORED, PH_APPROACHING, PH_CASTING_OFF, PH_DOCKED, PH_MOORED, PH_SAILING, type PoseBuffer } from "./sim";
import { makeCoins, makeLayout, makePayloads, PIERED, T0_MS } from "./test-fixtures";

const opts = { pieredChains: PIERED, dead: [] };
const layout = makeLayout();
const model = buildHarbourModel(makePayloads(), T0_MS, opts);

const still = (ph: number) => ph === PH_DOCKED || ph === PH_MOORED || ph === PH_ANCHORED;
const moving = (ph: number) => ph === PH_CASTING_OFF || ph === PH_SAILING || ph === PH_APPROACHING;

/** Slots holding more than one stationary hull. */
function doubleBooked(p: PoseBuffer): number {
  const seen = new Set<number>();
  let dup = 0;
  for (let i = 0; i < p.count; i++) {
    if (!still(p.phase[i]) || p.slot[i] < 0) continue;
    if (seen.has(p.slot[i])) dup++;
    seen.add(p.slot[i]);
  }
  return dup;
}

describe("HarbourSim", () => {
  it("is deterministic from (model, layout, UTC) and independent of history", () => {
    const a = new HarbourSim(model, layout, T0_MS);
    const b = new HarbourSim(model, layout, T0_MS);
    for (let k = 0; k < 400; k++) a.poseAt(T0_MS + k * 9_000); // a has history, b none
    const t = T0_MS + 400 * 9_000;
    const pa = a.poseAt(t);
    const snapA = Float32Array.from(pa.position);
    const headA = Float32Array.from(pa.heading);
    const pb = b.poseAt(t);
    expect(Array.from(pb.position)).toEqual(Array.from(snapA));
    expect(Array.from(pb.heading)).toEqual(Array.from(headA));
    // and the 6 h cycle repeats exactly
    const c = new HarbourSim(model, layout, T0_MS);
    const pc = c.poseAt(t + CYCLE_S * 1000);
    for (let i = 0; i < pc.count * 3; i++) expect(pc.position[i]).toBeCloseTo(snapA[i], 2);
  });

  it("reconciles counts: one pose per payload coin", () => {
    const sim = new HarbourSim(model, layout, T0_MS);
    const p = sim.poseAt(T0_MS);
    expect(model.payloadCount).toBe(625);
    expect(model.boats.length).toBe(model.payloadCount);
    expect(p.count).toBe(model.boats.length);
    expect(new Set(p.ids).size).toBe(p.count);
  });

  it("never double-books a berth over a 3-hour sweep", () => {
    const sim = new HarbourSim(model, layout, T0_MS);
    let worst = 0;
    for (let k = 0; k < (3 * 3600) / 5; k++) worst = Math.max(worst, doubleBooked(sim.poseAt(T0_MS + k * 5_000)));
    expect(worst).toBe(0);
  });

  it("puts 25-40 hulls under way and docks 4-8 a minute", () => {
    const sim = new HarbourSim(model, layout, T0_MS);
    const prev = new Uint8Array(model.boats.length).fill(255);
    let uw = 0, samples = 0, arrivals = 0;
    const minutes = 120;
    for (let k = 0; k < minutes * 30; k++) {
      const p = sim.poseAt(T0_MS + k * 2_000);
      uw += sim.stats.underWay; samples++;
      for (let i = 0; i < p.count; i++) {
        if (prev[i] === PH_APPROACHING && (p.phase[i] === PH_DOCKED || p.phase[i] === PH_MOORED)) arrivals++;
        prev[i] = p.phase[i];
      }
    }
    const meanUnderWay = uw / samples, perMin = arrivals / minutes;
    expect(meanUnderWay).toBeGreaterThanOrEqual(25);
    expect(meanUnderWay).toBeLessThanOrEqual(40);
    expect(perMin).toBeGreaterThanOrEqual(4);
    expect(perMin).toBeLessThanOrEqual(8);
  });

  it("docks each hull at each stop for time ∝ its supply share there", () => {
    const sim = new HarbourSim(model, layout, T0_MS);
    let checked = 0;
    model.boats.forEach((b, i) => {
      const plan = sim.plan.boats[i];
      if (plan.kind !== "circuit") return;
      let total = 0;
      const byWhere = new Map<string, number>();
      for (let k = 0; k < plan.segKind.length; k++) {
        if (plan.segKind[k] !== SEG_DOCK) continue;
        const d = plan.segEnd[k] - plan.segStart[k];
        const where = sim.layout.slots[plan.segSlot[k]].where;
        byWhere.set(where, (byWhere.get(where) ?? 0) + d);
        total += d;
      }
      for (const s of b.circuit) {
        const got = (byWhere.get(sim.layout.whereOf(s.chain)) ?? 0) / total;
        expect(Math.abs(got - s.share)).toBeLessThan(0.01);
        expect(Math.abs(got - s.rawShare)).toBeLessThan(0.05); // within one quantization step
      }
      checked++;
    });
    expect(checked).toBeGreaterThan(50);
  });

  it("empirically: over a cycle, docked time per harbour follows the shares", () => {
    const sim = new HarbourSim(model, layout, T0_MS);
    const circuit = model.boats.map((_, i) => (sim.plan.boats[i].kind === "circuit" ? i : -1)).filter((i) => i >= 0).slice(0, 25);
    const acc = circuit.map(() => new Map<string, number>());
    const step = 20;
    for (let t = 0; t < CYCLE_S; t += step) {
      const p = sim.poseAt(T0_MS + t * 1000);
      circuit.forEach((i, j) => {
        if (!still(p.phase[i])) return;
        const w = sim.layout.slots[p.slot[i]].where;
        acc[j].set(w, (acc[j].get(w) ?? 0) + step);
      });
    }
    circuit.forEach((i, j) => {
      const tot = [...acc[j].values()].reduce((a, b) => a + b, 0);
      for (const s of model.boats[i].circuit) {
        const got = (acc[j].get(sim.layout.whereOf(s.chain)) ?? 0) / tot;
        expect(Math.abs(got - s.share)).toBeLessThan(0.03);
      }
    });
  });

  it("stale data: hulls under way finish their leg, then everything holds", () => {
    const staleModel = buildHarbourModel(makePayloads({ stale: true }), T0_MS, opts);
    expect(staleModel.truth.stablecoins.state).toBe("stale");
    const sim = new HarbourSim(model, layout, T0_MS);
    sim.poseAt(T0_MS + 600_000);
    const before = sim.stats.underWay;
    expect(before).toBeGreaterThan(0);
    sim.setModel(staleModel, T0_MS + 600_000);
    expect(sim.frozen).toBe(true);
    // nobody casts off: under way only decreases
    let last = Infinity;
    for (let k = 0; k <= 60; k++) {
      sim.poseAt(T0_MS + 600_000 + k * 20_000);
      expect(sim.stats.underWay).toBeLessThanOrEqual(Math.min(last, before));
      last = sim.stats.underWay;
    }
    const p = sim.poseAt(T0_MS + 600_000 + 3600_000);
    for (let i = 0; i < p.count; i++) { expect(still(p.phase[i])).toBe(true); expect(p.speed[i]).toBe(0); }
    expect(doubleBooked(p)).toBe(0);
    // fresh again: the harbour resumes, still without double-booking
    sim.setModel(buildHarbourModel(makePayloads({ nowMs: T0_MS + 3700_000 }), T0_MS + 3700_000, opts), T0_MS + 3700_000);
    expect(sim.frozen).toBe(false);
    let worst = 0;
    for (let k = 0; k < 360; k++) worst = Math.max(worst, doubleBooked(sim.poseAt(T0_MS + 3700_000 + k * 10_000)));
    expect(worst).toBe(0);
    expect(sim.stats.underWay).toBeGreaterThan(5);
  });

  it("depegs: on first load they are simply on the Shoals; a later depeg sails there once", () => {
    const victim = model.boats.find((b) => b.state === "circuit")!.id;
    const first = buildHarbourModel(makePayloads({ depegIds: ["coin-small-3"] }), T0_MS, opts);
    const sim = new HarbourSim(first, layout, T0_MS);
    let p = sim.poseAt(T0_MS);
    const s3 = sim.indexOf("coin-small-3");
    expect(p.phase[s3]).toBe(PH_ANCHORED);
    expect(sim.slotOf(s3)?.kind).toBe("shoals");
    expect(p.event[s3]).toBe(0);
    expect(Math.abs(p.heel[s3])).toBeGreaterThan(0.05);

    const t1 = T0_MS + 120_000;
    sim.poseAt(t1);
    sim.setModel(buildHarbourModel(makePayloads({ depegIds: ["coin-small-3", victim], nowMs: t1 }), t1, opts), t1);
    const vi = sim.indexOf(victim);
    p = sim.poseAt(t1 + 30_000);
    expect(p.event[vi]).toBe(EV_TO_SHOALS);
    p = sim.poseAt(t1 + 40 * 60_000);
    expect(p.phase[vi]).toBe(PH_ANCHORED);
    expect(sim.slotOf(vi)?.kind).toBe("shoals");
    // same snapshot again: no replay
    sim.setModel(buildHarbourModel(makePayloads({ depegIds: ["coin-small-3", victim], nowMs: t1 + 41 * 60_000 }), t1 + 41 * 60_000, opts), t1 + 41 * 60_000);
    p = sim.poseAt(t1 + 41 * 60_000 + 1000);
    expect(p.event[vi]).toBe(0);
    // recovery: it rejoins its circuit (sails, then follows the plan)
    const t2 = t1 + 50 * 60_000;
    sim.setModel(buildHarbourModel(makePayloads({ depegIds: ["coin-small-3"], nowMs: t2 }), t2, opts), t2);
    p = sim.poseAt(t2 + 20_000);
    expect(moving(p.phase[vi])).toBe(true);
    let worst = 0;
    for (let k = 0; k < 240; k++) worst = Math.max(worst, doubleBooked(sim.poseAt(t2 + k * 15_000)));
    expect(worst).toBe(0);
    expect(sim.slotOf(vi)?.kind).not.toBe("shoals");
  });

  it("a new coin launches from the slipway; the first load never does", () => {
    const coins = makeCoins();
    const fresh = coins.pop()!;
    const sim = new HarbourSim(buildHarbourModel(makePayloads({ coins }), T0_MS, opts), layout, T0_MS);
    let p = sim.poseAt(T0_MS);
    for (let i = 0; i < p.count; i++) expect(p.event[i]).toBe(0);
    const t1 = T0_MS + 60_000;
    sim.setModel(buildHarbourModel(makePayloads({ coins: [...coins, fresh], nowMs: t1 }), t1, opts), t1);
    p = sim.poseAt(t1 + 1000);
    const k = sim.indexOf(fresh.id);
    expect(p.event[k]).toBe(EV_LAUNCH);
    expect(Math.hypot(p.position[k * 3] - 0, p.position[k * 3 + 2] - 40)).toBeLessThan(15);
  });

  it("a re-plan (portfolio change) never teleports a hull and never double-books", () => {
    const coins = makeCoins();
    const sim = new HarbourSim(buildHarbourModel(makePayloads({ coins }), T0_MS, opts), layout, T0_MS);
    const t1 = T0_MS + 900_000;
    const before = Float32Array.from(sim.poseAt(t1).position);
    const moved = coins.map((c, i) => (i % 40 === 7 ? { ...c, chainCirculating: { Solana: { current: 3e7 }, Base: { current: 2e7 } }, chains: ["Solana", "Base"] } : c));
    const m2 = buildHarbourModel(makePayloads({ coins: moved, nowMs: t1 }), t1, opts);
    expect(m2.planKey).not.toBe(sim.plan.key);
    sim.setModel(m2, t1);
    const after = sim.poseAt(t1);
    let jump = 0;
    for (let i = 0; i < after.count; i++) jump = Math.max(jump, Math.hypot(after.position[i * 3] - before[i * 3], after.position[i * 3 + 2] - before[i * 3 + 2]));
    // hulls whose neighbours start re-plan voyages may be shoved a little differently; nobody teleports
    expect(jump).toBeLessThan(5);
    let worst = 0;
    for (let k = 1; k < 360; k++) worst = Math.max(worst, doubleBooked(sim.poseAt(t1 + k * 10_000)));
    expect(worst).toBe(0);
  });

  it("swinging moorings (layout v2) lie to the wind and keep their slot", () => {
    const v2 = makeLayout({ moorings: true });
    const sim = new HarbourSim(model, v2, T0_MS);
    const p = sim.poseAt(T0_MS);
    const moored = [...Array(p.count).keys()].filter((i) => sim.slotOf(i)?.kind === "mooring" && p.phase[i] === PH_MOORED && sim.plan.boats[i].kind === "static");
    expect(moored.length).toBeGreaterThan(10);
    const i = moored[0];
    const h0 = p.heading[i];
    const s = sim.slotOf(i)!;
    const r0 = Math.hypot(p.position[i * 3] - s.x, p.position[i * 3 + 2] - s.z);
    const p2 = sim.poseAt(T0_MS + 300_000);
    expect(p2.slot[i]).toBe(s.index);
    expect(Math.abs(p2.heading[i] - h0)).toBeGreaterThan(0.005);
    expect(Math.abs(p2.heading[i] - h0)).toBeLessThan(0.9);
    // on her rode: the bow surges a little on the buoy, she never drags
    expect(Math.abs(Math.hypot(p2.position[i * 3] - s.x, p2.position[i * 3 + 2] - s.z) - s.swing)).toBeLessThanOrEqual(0.31);
    expect(Math.abs(r0 - s.swing)).toBeLessThanOrEqual(0.31);
    // and the field does not swing in lockstep: neighbours' headings differ
    const hs = moored.slice(0, 12).map((k) => p2.heading[k]);
    expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThan(0.12);
    let worst = 0;
    for (let k = 0; k < 600; k++) worst = Math.max(worst, doubleBooked(sim.poseAt(T0_MS + k * 18_000)));
    expect(worst).toBe(0);
  });

  it("legs are smooth: no position jumps or heading snaps while under way", () => {
    const sim = new HarbourSim(model, layout, T0_MS);
    const n = model.boats.length;
    const px = new Float32Array(n), pz = new Float32Array(n), ph = new Float32Array(n);
    let maxJump = 0, maxTurn = 0, shoved = 0, samples = 0;
    const s = sim as unknown as { pushX: Float32Array; pushZ: Float32Array };
    for (let k = 0; k < 1800; k++) {
      const p = sim.poseAt(T0_MS + k * 500);
      for (let i = 0; i < n; i++) {
        // the path itself (the give-way shove is judged separately: it may sidestep, never snap)
        const x = p.position[i * 3] - s.pushX[i], z = p.position[i * 3 + 2] - s.pushZ[i];
        if (k > 0 && moving(p.phase[i])) {
          maxJump = Math.max(maxJump, Math.hypot(x - px[i], z - pz[i]));
          samples++;
          let d = Math.abs(p.heading[i] - ph[i]) % (2 * Math.PI);
          if (d > Math.PI) d = 2 * Math.PI - d;
          maxTurn = Math.max(maxTurn, d);
        }
        px[i] = x; pz[i] = z; ph[i] = p.heading[i];
      }
      for (let i = 0; i < n; i++) if (Math.hypot(s.pushX[i], s.pushZ[i]) > 0.05) shoved++;
    }
    expect(maxJump).toBeLessThan(3); // < 6 m/s over 0.5 s
    expect(maxTurn).toBeLessThan(0.35); // < 40°/s
    expect(samples).toBeGreaterThan(1000);
    expect(shoved).toBeGreaterThan(0); // the give-way pass is live
  });

  it("casts off without spinning: no hull turns tighter than ~0.6 LOA while making way", () => {
    const sim = new HarbourSim(model, layout, T0_MS);
    const n = model.boats.length;
    const px = new Float32Array(n), pz = new Float32Array(n), ph = new Float32Array(n);
    const loa = model.boats.map((b) => sim.layout.loa[b.hullClass]);
    const s = sim as unknown as { pushX: Float32Array; pushZ: Float32Array };
    let spins = 0, checked = 0;
    for (let k = 0; k < 1200; k++) {
      const p = sim.poseAt(T0_MS + k * 1000);
      for (let i = 0; i < n; i++) {
        const x = p.position[i * 3] - s.pushX[i], z = p.position[i * 3 + 2] - s.pushZ[i];
        if (k > 0 && moving(p.phase[i])) {
          const ds = Math.hypot(x - px[i], z - pz[i]);
          let dh = Math.abs(p.heading[i] - ph[i]) % (2 * Math.PI);
          if (dh > Math.PI) dh = 2 * Math.PI - dh;
          checked++;
          // the hull turns only by moving through the water (a slow yaw at a swing mooring aside)
          if (dh > 0.03 && ds / dh < loa[i] * 0.3) spins++;
        }
        px[i] = x; pz[i] = z; ph[i] = p.heading[i];
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(spins / checked).toBeLessThan(0.01);
  });

  it("keeps sailing speeds sane: harbour pace, no surges", () => {
    const sim = new HarbourSim(model, layout, T0_MS);
    let maxV = 0, maxA = 0;
    const prev = new Float32Array(model.boats.length);
    for (let k = 0; k < 1800; k++) {
      const p = sim.poseAt(T0_MS + k * 1000);
      for (let i = 0; i < p.count; i++) {
        const cap = SPEED[model.boats[i].hullClass] * 1.5 * 1.25; // open-water factor, short-window slack
        if (moving(p.phase[i])) { maxV = Math.max(maxV, p.speed[i] / cap); if (k > 0) maxA = Math.max(maxA, Math.abs(p.speed[i] - prev[i])); }
        prev[i] = p.speed[i];
      }
    }
    expect(maxV).toBeLessThanOrEqual(1);
    expect(maxA).toBeLessThan(0.6); // m/s per second
  });

  it("poses 700 hulls well inside the frame budget", () => {
    const big = buildHarbourModel(makePayloads({ coins: [...makeCoins(), ...makeCoins().slice(0, 75).map((c) => ({ ...c, id: c.id + "-b" }))] }), T0_MS, opts);
    const sim = new HarbourSim(big, layout, T0_MS);
    for (let k = 0; k < 200; k++) sim.poseAt(T0_MS + k * 16); // warm paths
    const t0 = performance.now();
    const N = 600;
    for (let k = 0; k < N; k++) sim.poseAt(T0_MS + 3200 + k * 16);
    const per = (performance.now() - t0) / N;
    expect(sim.pose.count).toBe(700);
    expect(per).toBeLessThan(1.5);
  });
});
