import { describe, expect, it } from "vitest";
import { buildHarbourModel } from "../model/build";
import { buildSimLayout } from "./layout-graph";
import { buildPlan } from "./plan";
import { buildPlanLegPath, pathKey, planPathRequests, type PreparedPlan } from "./plan-paths";
import { HarbourSim } from "./sim";
import { makeLayout, makePayloads, PIERED, T0_MS } from "./test-fixtures";

/** The worker must not import playback merely to discover the first paths. */
describe("allocation-only worker parity", () => {
  it("keeps planning identity independent of the model clock and freshness", () => {
    const payloads = makePayloads(), opts = { pieredChains: PIERED, dead: [] };
    const key = buildHarbourModel(payloads, T0_MS, opts).planKey;
    for (const now of [T0_MS + 1, T0_MS + 7_200_000, T0_MS + 86_400_000]) {
      expect(buildHarbourModel(payloads, now, opts).planKey).toBe(key);
    }
  });

  it.each(["current", "shoals", "stale"])("prepares byte-identical poses without constructing a worker sim: %s", (state) => {
    const layout = makeLayout();
    const opts = { pieredChains: PIERED, dead: [] };
    const payloads = makePayloads(state === "shoals" ? { depegIds: ["coin-small-3"] } : {});
    const now = state === "stale" ? T0_MS + 7_200_000 : T0_MS;
    const model = buildHarbourModel(payloads, now, opts);
    const direct = new HarbourSim(model, layout, now, null, buildPlan);
    const L = buildSimLayout(layout), base = L.slots.length;
    const plan = buildPlan(model, L);
    const sailing = plan.boats.filter((_, i) => model.boats[i].state !== "shoals" && model.boats[i].state !== "wrecked");
    const requests = planPathRequests(sailing, now, () => false);
    const prepared: PreparedPlan = {
      plan: { key: plan.key, boats: plan.boats, stats: plan.stats }, rafts: L.slots.slice(base),
      paths: [...requests.now, ...requests.soon].map(([from, to, cls, loop, loa, beam]) => {
        const { path, bad } = buildPlanLegPath(L, base, from, to, cls, loop, loa, beam);
        return [pathKey(from, to, cls, loop, loa, beam), path, bad];
      }),
    };
    const main = new HarbourSim(buildHarbourModel({}, now, opts), layout, now);
    main.setModel(model, now, structuredClone(prepared));
    expect(main.plan.boats).toStrictEqual(direct.plan.boats);
    for (const delta of [0, 1, 1000, 60_000, 240_000]) {
      const req = main.pathRequests(now + delta);
      main.seedPaths(main.plan, [...req.now, ...req.soon].map((r) => { const result = buildPlanLegPath(L, base, ...r); return [pathKey(...r), result.path, result.bad]; }));
      expect(main.poseAt(now + delta)).toStrictEqual(direct.poseAt(now + delta));
    }
  }, 60_000);
});

it("transfers every route array once without cloning the live layout", async () => {
  const { pathBuffers } = await import("./plan-paths");
  const L = buildSimLayout(makeLayout({ berthsPerClass: 1 }));
  const slots = [...L.pools.values()].map((p) => p.get("medium")![0]);
  const result = buildPlanLegPath(L, L.slots.length, slots[0], slots[1], "medium", 0);
  const bytes = result.path.pts.byteLength, entries: PreparedPlan["paths"] = [["route", result.path, result.bad]];
  const buffers = pathBuffers(entries), copy = structuredClone(entries, { transfer: [...buffers] as ArrayBuffer[] });
  expect(buffers.size).toBeGreaterThanOrEqual(5);
  expect(result.path.pts.byteLength).toBe(0); expect(copy[0][1].pts.byteLength).toBe(bytes);
  expect(L.graph.x.byteLength).toBeGreaterThan(0);
});

it("invalidates allocation when the rendered rig family changes at unchanged supply", () => {
  const payloads = makePayloads({ n: 2 }), opts = { pieredChains: PIERED, dead: [] };
  const a = buildHarbourModel(payloads, T0_MS, opts);
  payloads.stablecoins!.data!.peggedAssets[0].pegType = "peggedUSD";
  const b = buildHarbourModel(payloads, T0_MS, opts);
  const id = payloads.stablecoins!.data!.peggedAssets[0].id, before = a.boats.find((boat) => boat.id === id)!, after = b.boats.find((boat) => boat.id === id)!;
  expect(after.hullClass).toBe(before.hullClass);
  expect(after.rig).not.toBe(before.rig); expect(b.planKey).not.toBe(a.planKey);
});

it("prefetches before the dock quarter-window can require a borrowed departure path", async () => {
  const { CYCLE_S } = await import("./plan");
  const plan = {
    id: "long-dock", cls: "medium" as const, loa: 13, beam: 4, kind: "circuit" as const,
    period: CYCLE_S, offset: 0, staticSlot: -1, outing: false, dwell: new Map(), legSeconds: 200,
    segStart: Float64Array.of(0, 2000, 2100, 4000), segEnd: Float64Array.of(2000, 2100, 4000, CYCLE_S),
    segKind: Uint8Array.of(0, 1, 0, 1), segFrom: Int32Array.of(0, 0, 1, 1), segSlot: Int32Array.of(0, 1, 1, 0), segLoop: new Uint8Array(4),
  };
  expect(planPathRequests([plan], 1_450_000, () => false)).toEqual({ now: [], soon: [[0, 1, "medium", 0, 13, 4]] });
});
