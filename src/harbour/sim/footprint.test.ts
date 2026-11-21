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
  it("keeps all ten titans at their authored size and separates their path keys", () => {
    const expected: ReadonlyArray<readonly [string, string, HullClass]> = [
      ["usdt-tether", "titan_usdt", "flagship"],
      ["usdc-circle", "titan_usdc", "flagship"],
      ["usde-ethena", "titan_usde", "large"],
      ["dai-makerdao", "titan_dai", "large"],
      ["usds-sky", "titan_usds", "large"],
      ["rlusd-ripple", "titan_rlusd", "large"],
      ["usd1-world-liberty-financial", "titan_usd1", "large"],
      ["xaut-tether", "titan_xaut", "large"],
      ["usdg-paxos", "titan_usdg", "large"],
      ["pyusd-paypal", "titan_pyusd", "large"],
    ];
    for (const [id, variant, cls] of expected) {
      const h = hulls.find((h) => h.id === variant)!;
      expect(h.class).toBe(cls);
      const f = footprint({ id, rig: "usd", hullClass: cls }, L);
      expect(f).toEqual({ loa: h.loa_m, beam: h.beam_m });
      expect(pathKey(0, 1, cls, 0, f.loa, f.beam)).not.toBe(pathKey(0, 1, cls, 0, 26, 6.6));
    }
  });
  it("excludes titan hulls from shared class slot envelopes", () => {
    for (const cls of ["large", "flagship"] as const) {
      let maxBeam = L.beam[cls];
      for (const rig of ["usd", "eur", "gold", "fiat", "other"] as const) {
        maxBeam = Math.max(maxBeam, footprint({ id: "ordinary", rig, hullClass: cls }, L).beam);
      }
      expect(slotFootprint(cls, L)).toEqual({ loa: L.loa[cls], beam: maxBeam });
    }
  });
});

it("blocks ordinary boats from overlapping a docked titan without shrinking ordinary slot capacity", async () => {
  const { buildHarbourModel } = await import("../model/build");
  const { buildPlan } = await import("./plan");
  const { slotConflictsFor, slotsOverlap } = await import("./layout-graph");
  const { makePayloads, PIERED, T0_MS } = await import("./test-fixtures");

  // Two large alongside berths 19.6 m apart bow-to-stern: two ordinary 18 m boats clear by 1.6 m
  // (> 0.5 m gap, zero static conflict), while a 22 m titan + 18 m boat would overlap by 0.4 m.
  const makePairLayout = () => {
    const L = buildSimLayout(makeLayout({ berthsPerClass: 2 }));
    L.hard = () => 100;
    const list = L.pools.get("pier-ethereum")!.get("large")!;
    expect(list.length).toBeGreaterThanOrEqual(2);
    const a = L.slots[list[0]], b = L.slots[list[1]];
    // Place both in open water heading +Z along the same line, 19.6 m apart.
    a.x = 120; a.z = 120; a.heading = 0; a.swing = 0; a.mode = "alongside"; a.conflicts = [];
    b.x = 120; b.z = 139.6; b.heading = 0; b.swing = 0; b.mode = "alongside"; b.conflicts = [];
    // Clear flagship pool on pier-ethereum so the titan uses one of the two large berths.
    L.pools.get("pier-ethereum")!.set("flagship", []);
    L.pools.get("pier-ethereum")!.set("large", [a.index, b.index]);
    return { L, a, b };
  };

  const makeLargeCoin = (id: string, supply: number) => ({
    id, name: id, symbol: id, pegType: "peggedUSD",
    circulating: { peggedUSD: supply },
    chainCirculating: { Ethereum: { current: supply } },
    chains: ["Ethereum"],
  });

  // Sanity: two ordinary large boats can occupy both slots simultaneously.
  {
    const { L, a, b } = makePairLayout();
    expect(slotsOverlap(a, slotFootprint("large", L), b, slotFootprint("large", L))).toBe(false);
    const coins = [makeLargeCoin("ord-a", 3e9), makeLargeCoin("ord-b", 2e9)];
    const model = buildHarbourModel(makePayloads({ coins }), T0_MS, { pieredChains: PIERED, dead: [] });
    expect(model.boats.map((m) => m.hullClass)).toEqual(["large", "large"]);
    const plan = buildPlan(model, L);
    expect(plan.boats.map((p) => p.staticSlot).sort((x, y) => x - y)).toEqual([a.index, b.index].sort((x, y) => x - y));
  }

  // Docked titan (usde-ethena, 22 m) + ordinary large boat (18 m): neighbour slot is reserved, zero overlap.
  {
    const { L, a, b } = makePairLayout();
    const coins = [makeLargeCoin("usde-ethena", 5e9), makeLargeCoin("ord-b", 2e9)];
    const model = buildHarbourModel(makePayloads({ coins }), T0_MS, { pieredChains: PIERED, dead: [] });
    const titanFoot = footprint(model.boats[0], L);
    expect(slotConflictsFor(L, a.index, titanFoot)).toContain(b.index);
    const plan = buildPlan(model, L);
    const titanPlan = plan.byId.get("usde-ethena")!;
    const ordPlan = plan.boats.find((p) => p.id !== "usde-ethena")!;
    expect([a.index, b.index]).toContain(titanPlan.staticSlot);
    expect([a.index, b.index]).not.toContain(ordPlan.staticSlot);
    const sT = L.slots[titanPlan.staticSlot], sO = L.slots[ordPlan.staticSlot];
    expect(slotsOverlap(sT, { loa: titanPlan.loa, beam: titanPlan.beam }, sO, { loa: ordPlan.loa, beam: ordPlan.beam })).toBe(false);
  }

  // Two titans at slots 20.6 m apart (titan + ordinary clears, titan + titan overlaps): never both berthed together.
  {
    const { L, b } = makePairLayout();
    b.z = 140.6;
    const coins = [makeLargeCoin("usde-ethena", 5e9), makeLargeCoin("rlusd-ripple", 4e9)];
    const model = buildHarbourModel(makePayloads({ coins }), T0_MS, { pieredChains: PIERED, dead: [] });
    const plan = buildPlan(model, L);
    const p0 = plan.byId.get("usde-ethena")!, p1 = plan.byId.get("rlusd-ripple")!;
    expect(slotsOverlap(L.slots[p0.staticSlot], { loa: p0.loa, beam: p0.beam }, L.slots[p1.staticSlot], { loa: p1.loa, beam: p1.beam })).toBe(false);
  }
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

it("reserves different holding water for boats sharing a rejected leg, outside every berth and raft", async () => {
  const { buildHarbourModel } = await import("../model/build");
  const { buildPlan } = await import("./plan");
  const { buildPlanLegPath, reservePlanHolds } = await import("./plan-paths");
  const { makePayloads, PIERED, T0_MS } = await import("./test-fixtures");
  const L = buildSimLayout(makeLayout({ berthsPerClass: 1 }));
  const plan = buildPlan(buildHarbourModel(makePayloads({ n: 2 }), T0_MS, { pieredChains: PIERED, dead: [] }), L);
  const p = plan.boats[0], twin = { ...p, id: "twin" }, seg = 1;
  const key = pathKey(p.segFrom[seg], p.segSlot[seg], p.cls, p.segLoop[seg], p.loa, p.beam);
  const path = buildPlanLegPath(L, L.slots.length, p.segFrom[seg], p.segSlot[seg], p.cls, p.segLoop[seg], p.loa, p.beam).path;
  const holds = reservePlanHolds(L, [p, twin], [[key, path, true]]);
  expect(holds).toHaveLength(2);
  expect(holds[0][1].index).not.toBe(holds[1][1].index);
  for (const [, hold] of holds) for (const other of L.slots) {
    if (hold === other || other.kind === "wreck") continue;
    const beam = other.beam ?? slotFootprint(other.cls, L).beam;
    expect(Math.hypot(hold.x - other.x, hold.z - other.z)).toBeGreaterThan((hold.beam! + beam) / 2);
  }
  const count = L.slots.length;
  expect(reservePlanHolds(L, [p, twin], [[key, path, true]])).toEqual(holds);
  expect(L.slots).toHaveLength(count);
});

it("refuses an overflow slot when every search candidate is obstructed", async () => {
  const { addRaftSlot } = await import("./layout-graph");
  const L = buildSimLayout(makeLayout({ berthsPerClass: 1 })), count = L.slots.length;
  L.hard = () => -10;
  expect(() => addRaftSlot(L, "pier-ethereum", 0)).toThrow("No clear overflow anchorage");
  expect(L.slots).toHaveLength(count);
});
