import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import layoutJson from "../data/layout.json";
import seedJson from "../data/sim-seeds.json";
import type { HarbourLayout } from "../layout/types";
import { buildHarbourModel } from "../model/build";
import { buildSimLayout } from "./layout-graph";
import type { CoastGrid } from "./obstacles";
import { seedOutings } from "./outings";
import { buildPlan, seedLegTimes } from "./plan";
import { matchingSeeds, type SimSeeds } from "./seeds";
import { HarbourSim } from "./sim";
import { buildPlanLegPath } from "./plan-paths";
import { makeCoins, makePayloads, T0_MS } from "./test-fixtures";

const layout = layoutJson as unknown as HarbourLayout, seed = seedJson as unknown as SimSeeds;
let coast: CoastGrid;
beforeAll(async () => {
  const { data, info } = await sharp(new URL("../../../public" + layout.sea!.sdf, import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  coast = { data: new Uint8Array(info.width * info.height), size: info.width, bounds: layout.sea!.bounds as [number, number, number, number] };
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) coast.data[y * info.width + x] = data[((info.height - 1 - y) * info.width + x) * 4];
});

describe("versioned exact layout seeds", () => {
  it("records the current transitive generator sources (regenerate after algorithm changes)", async () => {
    const hash = createHash("sha256");
    for (const path of seed.sources) hash.update(path).update(await readFile(new URL("../../../" + path, import.meta.url)));
    expect(hash.digest("hex")).toBe(seed.algorithms);
  });

  it("matches only the authored layout, coast bytes and seed version", async () => {
    expect(await matchingSeeds(seed, layout, coast)).toBe(true);
    expect(seed.outings.lanes).toBeNull();
    expect(await matchingSeeds({ ...seed, version: seed.version + 1 }, layout, coast)).toBe(false);
    expect(await matchingSeeds(seed, { ...layout, piers: [] }, coast)).toBe(false);
    const changed = { ...coast, data: coast.data.slice() }; changed.data[0] ^= 1;
    expect(await matchingSeeds(seed, layout, changed)).toBe(false);
    expect(await matchingSeeds(seed, layout, null)).toBe(false);
  });

  it.each(["fleet", "class-crossing", "stale"])("preserves every plan, route and pose field bit for bit for %s", (scenario) => {
    const coins = makeCoins();
    if (scenario === "class-crossing") {
      // Real allocator inputs change; no quantization or special-casing may suppress this replan.
      coins[0] = { ...coins[0], circulating: { peggedUSD: 10_000_000 } };
    }
    const payloads = makePayloads({ coins });
    const now = scenario === "stale" ? T0_MS + 7_200_000 : T0_MS;
    const model = buildHarbourModel(payloads, now, { pieredChains: layout.piers.map((p) => p.chain), dead: [] });
    const direct = new HarbourSim(model, layout, now, coast, buildPlan);
    const L = buildSimLayout(layout, coast);
    seedLegTimes(L, seed.legs); seedOutings(L, seed.outings);
    const seeded = new HarbourSim(model, L, now, null, buildPlan);
    expect(seeded.plan.boats).toStrictEqual(direct.plan.boats);
    expect(seeded.plan.stats).toStrictEqual(direct.plan.stats);
    const request = direct.pathRequests(now), base = direct.layout.slots.length - direct.rafts().length;
    for (const [from, to, cls, loop] of [...request.now, ...request.soon]) {
      expect(buildPlanLegPath(seeded.layout, base, from, to, cls, loop)).toStrictEqual(buildPlanLegPath(direct.layout, base, from, to, cls, loop));
    }
    for (const delta of [0, 1, 1000, 60_000, 240_000]) expect(seeded.poseAt(now + delta)).toStrictEqual(direct.poseAt(now + delta));
  }, 120_000);
});
