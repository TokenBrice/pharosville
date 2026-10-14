import { describe, expect, it } from "vitest";
import layout from "../data/layout.json";
import crests from "../../../public/harbour/crests.json";
import { nearestChain, officePlots } from "./offices";
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
});
