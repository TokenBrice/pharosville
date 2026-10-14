import { describe, expect, it } from "vitest";
import layout from "../data/layout.json";
import crests from "../../../public/harbour/crests.json";
import { nearestChain, officePlots } from "./offices";
import { chainSlug, markSites, type MarkPier } from "./pier-marks";
import type { CivicPlot, CrestAtlas } from "./types";

const civic = (layout as unknown as { civic: CivicPlot[] }).civic;

describe("harbour heraldry", () => {
  it("the crest atlas covers every harbour office's chain", () => {
    const atlas = crests as unknown as CrestAtlas;
    const plots = officePlots(civic);
    expect(plots.length).toBe(8);
    for (const p of plots) {
      const c = atlas.chains[p.chain];
      expect(c, p.chain).toBeTruthy();
      expect(c.panel[2]).toBeGreaterThan(c.panel[0]);
      expect(c.flag[3]).toBeGreaterThan(c.flag[1]);
    }
  });

  it("a node is assigned to the nearest office plot", () => {
    const plots = officePlots(civic);
    const tron = plots.find((p) => p.chain === "tron")!;
    expect(nearestChain(plots, tron.x + 6, tron.z - 4)).toBe("tron");
    expect(nearestChain(plots, 0, 0)).toBeNull();
  });

  it("every chain pier gets chain-colour posts", () => {
    const atlas = crests as unknown as CrestAtlas;
    const piers = (layout as unknown as { piers: MarkPier[] }).piers;
    const sites = markSites(piers);
    for (const p of piers.filter((x) => x.kind !== "grand")) {
      const mine = sites.filter((s) => s.chain === chainSlug(p.chain));
      expect(atlas.chains[chainSlug(p.chain)], p.chain).toBeTruthy();
      // quay-only harbours have no dolphins at their ends: they get beacon posts
      if (!p.segments.some((s) => s.kind === "thead")) expect(mine.some((s) => s.beacon), p.chain).toBe(true);
      expect(mine.filter((s) => !s.beacon).length, p.chain).toBeGreaterThan(3);
    }
  });
});
