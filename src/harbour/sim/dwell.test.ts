import { describe, expect, it } from "vitest";
import sharp from "sharp";
import layoutJson from "../data/layout.json";
import type { HarbourLayout } from "../layout/types";
import { buildHarbourModel } from "../model/build";
import { buildPlan, CYCLE_S } from "./plan";
import { HarbourSim, PH_ANCHORED, PH_DOCKED, PH_MOORED } from "./sim";
import { makeLayout, makePayloads, T0_MS } from "./test-fixtures";

describe.runIf(Number(process.env.HARBOUR_AUDIT_HOURS ?? 0) > 0)("D10 effective dock occupancy (deferred S16-I3 audit)", () => {
  it.each([false, true])("reports effective dock-share drift over six UTC hours (real=%s)", async (real) => {
    const layout = real ? layoutJson as unknown as HarbourLayout : makeLayout();
    let coast = null;
    if (real) {
      const { data, info } = await sharp(new URL("../../../public" + layout.sea!.sdf, import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const red = new Uint8Array(info.width * info.height);
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) red[y * info.width + x] = data[((info.height - 1 - y) * info.width + x) * 4];
      coast = { data: red, size: info.width, bounds: layout.sea!.bounds as [number, number, number, number] };
    }
    const model = buildHarbourModel(makePayloads({ n: 657 }), T0_MS, { pieredChains: layout.piers.map((p) => p.chain), dead: [] });
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
    let maxDrift = 0, worst = "", measured = 0;
    const flagship: Array<{ id: string; where: string; share: number; effective: number; driftPoints: number }> = [];
    circuits.forEach((i, j) => {
      const shares = new Map<string, number>();
      for (const s of model.boats[i].circuit) shares.set(sim.layout.whereOf(s.chain), (shares.get(sim.layout.whereOf(s.chain)) ?? 0) + s.share);
      const total = [...docked[j].values()].reduce((a, v) => a + v, 0);
      if (!total) return;
      measured++;
      for (const [where, share] of shares) {
        const effective = (docked[j].get(where) ?? 0) / total, drift = Math.abs(effective - share);
        if (drift > maxDrift) { maxDrift = drift; worst = `${model.boats[i].id} at ${where}`; }
        if (model.boats[i].hullClass === "flagship") flagship.push({ id: model.boats[i].id, where, share, effective, driftPoints: drift * 100 });
      }
    });
    expect(measured).toBeGreaterThan(0);
    console.info(JSON.stringify({ real, measured, circuits: circuits.length, maxDriftPoints: maxDrift * 100, worst, routeUnavailable: circuits.filter((i) => sim.routeUnavailable.has(model.boats[i].id)).length, flagship }, null, 2));
  }, 120_000);
});
