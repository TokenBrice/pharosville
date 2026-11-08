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
      paths: [...requests.now, ...requests.soon].map(([from, to, cls, loop]) => {
        const { path, bad } = buildPlanLegPath(L, base, from, to, cls, loop);
        return [pathKey(from, to, cls, loop), path, bad];
      }),
    };
    const main = new HarbourSim(buildHarbourModel({}, now, opts), layout, now);
    main.setModel(model, now, structuredClone(prepared));
    expect(main.plan.boats).toStrictEqual(direct.plan.boats);
    for (const delta of [0, 1, 1000, 60_000, 240_000]) expect(main.poseAt(now + delta)).toStrictEqual(direct.poseAt(now + delta));
  }, 60_000);
});
