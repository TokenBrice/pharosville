import { describe, expect, it } from "vitest";
import type { HullClass } from "../layout/types";
import { composeCove, MEMORIAL_N, MEMORIAL_SCALE, tierPlan, type CoveDead, type CoveSlot } from "./wreck-cove";

const dead: CoveDead[] = Array.from({ length: 88 }, (_, i) => ({ id: `dead-${i}`, name: `Dead ${i}`, symbol: `D${i}`, deathDate: "2022-05", peakMcap: 10 ** (10.5 - i * 0.05) }));
const CLS: HullClass[] = ["large", "large", "large", "medium", "medium", "medium", "medium", "medium", ...Array<HullClass>(16).fill("small"), ...Array<HullClass>(26).fill("boat"), ...Array<HullClass>(38).fill("skiff")];
// a straight beach: the sea at z > 0, dry sand at z < 0, the slots strung along just above the tide line
const slots: CoveSlot[] = CLS.map((cls, i) => ({ id: `wreck-${i}`, cls, x: (i - 44) * 4, z: -3 - (i % 3), h: Math.PI / 2 }));
const env = { coast: (_x: number, z: number) => z, ground: (_x: number, z: number) => (z < 0 ? 1 : -1) };
const count = (items: string[]) => items.reduce<Record<string, number>>((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {});

describe("Wreck Cove v2 composition", () => {
  it("follows the kit author's guide, rank by rank", () => {
    const plan = tierPlan(88).map((p) => p.item);
    expect(plan.slice(0, 2)).toEqual(["wreck_great_hulk", "wreck_great_hulk"]);
    expect(plan.slice(2, 4)).toEqual(["wreck_schooner_sunk", "wreck_stern_section"]);
    expect(count(plan.slice(4, 10))).toEqual({ wreck_capsized: 2, wreck_burned: 2, wreck_rib_cage: 2 });
    expect(count(plan.slice(10, 22))).toEqual({ wreck_capsized: 3, wreck_burned: 3, wreck_rib_cage: 2, wreck_mast_stump: 4 });
    expect(count(plan.slice(22))).toEqual({ wreck_skiff: 30, wreck_dinghy: 24, wreck_mast_stump: 6, wreck_rib_cage: 6 });
  });

  it("gives every dead coin one wreck, the biggest on the biggest slots, sized by peak cap within a tier", () => {
    const pieces = composeCove(dead, slots, null);
    const wrecks = pieces.filter((p) => p.coin);
    expect(wrecks.length).toBe(88);
    expect(new Set(wrecks.map((p) => p.coin!.id)).size).toBe(88);
    const byRank = [...wrecks].sort((a, b) => a.rank - b.rank);
    expect(byRank[0].coin!.id).toBe("dead-0");
    expect(slots.find((s) => s.x === byRank[0].x)?.cls).toBe("large");
    expect(byRank[0].scale).toBeGreaterThan(byRank[1].scale);
    // the top 20 keep no post of their own (they stand on the memorial); the rest do
    expect(byRank.slice(0, MEMORIAL_N).every((p) => !p.board)).toBe(true);
    expect(byRank.slice(MEMORIAL_N).every((p) => p.board)).toBe(true);
    expect(byRank.slice(22).every((p) => p.scale >= 0.56 && p.scale <= 0.66)).toBe(true);
  });

  it("raises the memorial above the wrack line: 20 lit posts ~5 m apart facing the sea, the bell between, pennants at the ends", () => {
    const pieces = composeCove(dead, slots, env);
    const posts = pieces.filter((p) => p.item === "wreck_cove_epitaph");
    expect(posts.length).toBe(MEMORIAL_N);
    expect(posts.every((p) => p.lit && p.board && p.scale === MEMORIAL_SCALE)).toBe(true);
    expect(new Set(posts.map((p) => p.coin!.id))).toEqual(new Set(dead.slice(0, MEMORIAL_N).map((d) => d.id)));
    for (const p of posts) {
      expect(p.z).toBeLessThan(-9.5); // above the wrack line (stepped further up where a wreck lies)
      expect(p.z).toBeGreaterThan(-22);
      // the board (+z in the kit) faces the sea (+z here): heading h with -cos(h) ≈ 0 and sin(h) ≈ 1
      expect(Math.sin(p.h)).toBeGreaterThan(0.95);
    }
    const xs = posts.map((p) => p.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] < 9) expect(xs[i] - xs[i - 1]).toBeGreaterThan(4.5);
    expect(pieces.filter((p) => p.item === "wreck_cove_bell").length).toBe(1);
    expect(pieces.filter((p) => p.item === "wreck_cove_pennants").length).toBe(2);
    // the sunk schooner lies in the water, not on the sand
    const schooner = pieces.find((p) => p.item === "wreck_schooner_sunk")!;
    expect(schooner.water).toBe(true);
    expect(schooner.z).toBeGreaterThan(5);
  });

  it("takes the island's authored cove as it is: rank r in its kit, tier scale × the log-cap spread, its memorial arc", () => {
    const plan = tierPlan(88);
    const authored: CoveSlot[] = slots.map((sl, i) => ({ ...sl, rank: 88 - i, kit: plan[87 - i].item, scale: 0.5, sits: i === 87 ? "water" : "sand" }));
    const arc = Array.from({ length: MEMORIAL_N }, (_, i) => ({ rank: i + 1, x: i * 5, z: -12, h: 1.9, scale: MEMORIAL_SCALE }));
    const pieces = composeCove(dead, authored, env, arc);
    const wrecks = pieces.filter((p) => p.item !== "wreck_cove_epitaph");
    expect(wrecks.length).toBe(88);
    const first = wrecks.find((p) => p.rank === 0)!;
    expect(first.item).toBe("wreck_great_hulk");
    expect(first.water).toBe(true); // the slot authored rank 1 (last in the list) sits on the water
    expect(first.scale).toBeCloseTo(0.5 * 1.15, 5);
    expect(wrecks.every((p) => p.scale >= 0.5 * 0.8 - 1e-9 && p.scale <= 0.5 * 1.15 + 1e-9)).toBe(true);
    const posts = pieces.filter((p) => p.item === "wreck_cove_epitaph");
    expect(posts.map((p) => p.coin!.id)).toEqual(dead.slice(0, MEMORIAL_N).map((d) => d.id));
    expect(posts.every((p) => p.lit && p.h === 1.9)).toBe(true);
    // no bell or pennants of ours: the island bakes them
    expect(pieces.some((p) => p.item === "wreck_cove_bell" || p.item === "wreck_cove_pennants")).toBe(false);
  });
});
