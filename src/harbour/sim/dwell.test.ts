import { describe, expect, it } from "vitest";
import sharp from "sharp";
import layoutJson from "../data/layout.json";
import type { HarbourLayout } from "../layout/types";
import { buildHarbourModel } from "../model/build";
import { buildPlan, CYCLE_S } from "./plan";
import { HarbourSim, PH_ANCHORED, PH_DOCKED, PH_MOORED } from "./sim";
import { makeLayout, makePayloads, T0_MS } from "./test-fixtures";

describe("D10 effective dock occupancy", () => {
  it.each([false, true])("stays within one percentage point for every circuit hull over six UTC hours (real=%s)", async (real) => {
    const layout = real ? layoutJson as unknown as HarbourLayout : makeLayout();
    let coast = null;
    if (real) {
      const { data, info } = await sharp(new URL("../../../public" + layout.sea!.sdf, import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const red = new Uint8Array(info.width * info.height);
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) red[y * info.width + x] = data[((info.height - 1 - y) * info.width + x) * 4];
      coast = { data: red, size: info.width, bounds: layout.sea!.bounds as [number, number, number, number] };
    }
    const model = buildHarbourModel(makePayloads(), T0_MS, { pieredChains: layout.piers.map((p) => p.chain), dead: [] });
    const sim = new HarbourSim(model, layout, T0_MS, coast, buildPlan);
    const circuits = sim.plan.boats.flatMap((p, i) => p.kind === "circuit" ? [i] : []);
    const docked = circuits.map(() => new Map<string, number>());
    for (let t = 0; t < CYCLE_S; t += 5) {
      const p = sim.poseAt(T0_MS + t * 1000);
      circuits.forEach((i, j) => {
        if (![PH_DOCKED, PH_MOORED, PH_ANCHORED].includes(p.phase[i]) || p.slot[i] < 0) return;
        const where = sim.layout.slots[p.slot[i]].where;
        docked[j].set(where, (docked[j].get(where) ?? 0) + 5);
      });
    }
    expect(circuits.length).toBeGreaterThan(50);
    expect(circuits.filter((i) => sim.routeUnavailable.has(model.boats[i].id))).toEqual([]);
    circuits.forEach((i, j) => {
      const shares = new Map<string, number>();
      for (const s of model.boats[i].circuit) shares.set(sim.layout.whereOf(s.chain), (shares.get(sim.layout.whereOf(s.chain)) ?? 0) + s.share);
      const total = [...docked[j].values()].reduce((a, v) => a + v, 0);
      for (const [where, share] of shares) expect(Math.abs((docked[j].get(where) ?? 0) / total - share), `${model.boats[i].id} at ${where}; rejected: ${sim.routeUnavailable.has(model.boats[i].id)}`).toBeLessThanOrEqual(0.01);
    });
  }, 120_000);
});
