import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { indexVariants, pickVariant } from "../fleet/variants";
import type { HullClass } from "../layout/types";
import hulls from "./hull-footprints.json";
import { footprint, slotFootprint } from "./footprint";
import { buildSimLayout } from "./layout-graph";
import { pathKey } from "./plan-paths";
import { makeLayout } from "./test-fixtures";

describe("rendered planning footprints", () => {
  const L = buildSimLayout(makeLayout({ berthsPerClass: 1 }));
  it("pins the compact metadata to the kit manifest", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../../public/harbour/kit/manifest.json", import.meta.url), "utf8"));
    expect(hulls).toEqual(manifest.hulls.map((h: Record<string, unknown>) => Object.fromEntries(["id", "family", "class", "loa_m", "beam_m"].map((k) => [k, h[k]]))));
  });
  it("uses the renderer's fallback and scaled beam for every family and class", () => {
    const index = indexVariants(hulls);
    for (const rig of ["usd", "eur", "gold", "fiat", "other", "missing"]) for (const cls of Object.keys(L.loa) as HullClass[]) {
      const h = hulls.find((h) => h.id === pickVariant(index, rig, cls))!;
      const f = footprint({ id: "ordinary", rig: rig as "usd", hullClass: cls }, L);
      expect(f).toEqual({ loa: L.loa[cls], beam: h.beam_m * (L.loa[cls] / h.loa_m) });
      expect(slotFootprint(cls, L).loa).toBeGreaterThanOrEqual(f.loa);
      expect(slotFootprint(cls, L).beam).toBeGreaterThanOrEqual(f.beam);
    }
  });
  it("keeps all four titans at their authored size and separates their path keys", () => {
    for (const [id, variant] of [["usdt-tether", "titan_usdt"], ["usdc-circle", "titan_usdc"], ["usde-ethena", "titan_usde"], ["usds-sky", "titan_usds"]]) {
      const h = hulls.find((h) => h.id === variant)!;
      const f = footprint({ id, rig: "usd", hullClass: "flagship" }, L);
      expect(f).toEqual({ loa: h.loa_m, beam: h.beam_m });
      expect(pathKey(0, 1, "flagship", 0, f.loa, f.beam)).not.toBe(pathKey(0, 1, "flagship", 0, 26, 6.6));
    }
  });
});

it("reserves a titan-sized overflow raft instead of reusing a smaller cell", async () => {
  const { buildHarbourModel } = await import("../model/build");
  const { buildPlan } = await import("./plan");
  const { makeCoins, makePayloads, PIERED, T0_MS } = await import("./test-fixtures");
  const L = buildSimLayout(makeLayout({ berthsPerClass: 1 }));
  for (const pool of L.pools.values()) for (const list of pool.values()) list.length = 0;
  const coins = makeCoins({ n: 2 }); coins[0].id = "usdt-tether"; coins[1].id = "usdc-circle";
  const model = buildHarbourModel(makePayloads({ coins }), T0_MS, { pieredChains: PIERED, dead: [] });
  const plan = buildPlan(model, L);
  for (const p of plan.boats) for (let i = 0; i < p.segKind.length; i++) if (p.segKind[i] === 0) {
    const slot = L.slots[p.segSlot[i]];
    expect(slot.kind).toBe("raft"); expect(slot.loa).toBeGreaterThanOrEqual(p.loa); expect(slot.beam).toBeGreaterThanOrEqual(p.beam);
  }
});

it("shares static raft clearance answers without changing placements as neighbours accumulate", async () => {
  const { addRaftSlot } = await import("./layout-graph");
  const layout = makeLayout({ berthsPerClass: 1 }), a = buildSimLayout(layout), b = buildSimLayout(layout);
  const memo = new Map<string, boolean>();
  for (let k = 0; k < 8; k++) {
    const where = k % 2 ? "pier-tron" : "pier-ethereum", loa = k % 3 ? 26 : 32, beam = k % 3 ? 7.2 : 8.64;
    expect(addRaftSlot(a, where, k, loa, beam, memo)).toEqual(addRaftSlot(b, where, k, loa, beam));
  }
  expect(memo.size).toBeGreaterThan(0);
});
