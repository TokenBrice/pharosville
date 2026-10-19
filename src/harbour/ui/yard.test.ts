import { describe, expect, it } from "vitest";
import runtimeSlim from "@shared/data/stablecoins/runtime-slim.json";
import { RUNTIME_TRACKED_STABLECOINS } from "@shared/lib/stablecoins/runtime-registry";
import layout from "../data/layout.json";
import prelaunch from "../data/prelaunch.json";
import scenery from "virtual:pharosville-prelaunch";
import type { HarbourLayout } from "../layout/types";
import { landmarkFact, PANEL_LANDMARKS } from "./facts";
import { civicPlots, inPlot, officeChain, placeName, seaZones } from "./places";
import { expectedKey, expectedLabel, groupYard, installYardBook, REGISTRY_YARD, sortYard, toYardCoin } from "./yard";

const L = layout as unknown as HarbourLayout;

describe("the Shipyard's book", () => {
  it("lists every tracked launch, each with a stage", () => {
    expect(REGISTRY_YARD.length).toBeGreaterThanOrEqual(43);
    expect(new Set(REGISTRY_YARD.map((c) => c.id)).size).toBe(REGISTRY_YARD.length);
    for (const c of REGISTRY_YARD) expect(["keel", "ribs", "planked", "painted", "rigged"]).toContain(c.stage);
  });

  it("reads the same pre-launch coins from the slim registry as from the full one", () => {
    const full = RUNTIME_TRACKED_STABLECOINS.filter((c) => c.status === "pre-launch").map(toYardCoin);
    expect(full.length).toBeGreaterThan(0);
    expect(runtimeSlim.filter((c) => c.status === "pre-launch").map(toYardCoin)).toEqual(full);
  });

  it("normalises phase labels and guards missing fields", () => {
    expect(toYardCoin({ id: "x", phase: "Launching Soon" })).toMatchObject({ id: "x", symbol: "x", phase: "launching-soon", stage: "rigged", expected: null, milestones: [] });
    expect(toYardCoin({ id: "y", launchPhase: "nonsense", milestones: [{ date: 1 }, { date: "2026-01-02", title: "t", type: "audit" }] })).toMatchObject({ phase: null, stage: "keel" });
    expect(toYardCoin({ id: "y", milestones: [{ date: 1 }, { date: "2026-01-02", title: "t", type: "audit" }] })?.milestones).toHaveLength(1);
    expect(toYardCoin({})).toBeNull();
    expect(toYardCoin(null)).toBeNull();
  });

  it("reads expected dates in the chart voice and sorts sooner first", () => {
    expect(expectedLabel("2026-Q2")).toBe("Q2 2026");
    expect(expectedLabel("2026-h2")).toBe("H2 2026");
    expect(expectedLabel("2026-09")).toBe("Sep 2026");
    expect(expectedLabel("2027")).toBe("2027");
    expect(expectedLabel(null)).toBe("not stated");
    const keys = ["2027", "2026-Q2", "Oct 2026", "2026-09", null].map(expectedKey);
    expect([...keys].sort()).toEqual([expectedKey("2026-Q2"), expectedKey("2026-09"), expectedKey("Oct 2026"), expectedKey("2027"), expectedKey(null)]);
  });

  it("groups furthest along first, unphased last", () => {
    const coins = ["announced", "beta", null, "launching-soon"].map((p, i) => toYardCoin({ id: `c${i}`, launchPhase: p })!);
    expect(groupYard(coins).map((g) => g.label)).toEqual(["Launching soon", "Beta", "Announced", "Phase not stated"]);
    expect(sortYard(coins)[0].phase).toBe("launching-soon");
  });

  it("keeps every scenery and hover field exact when the narrative book is deferred", () => {
    const fields = (row: unknown) => {
      const { phaseDetail: _detail, milestones: _milestones, issuer: _issuer, ...visible } = toYardCoin(row)!;
      return visible;
    };
    expect(scenery.coins.map(fields)).toEqual(prelaunch.coins.map(fields));
    expect(scenery.coins.every((c) => !("milestones" in c) && !("launchPhaseDetail" in c))).toBe(true);
  });

  it("restores full descriptions and snapshot milestone sources before details mount", () => {
    installYardBook(prelaunch.coins);
    for (const row of prelaunch.coins) {
      const actual = REGISTRY_YARD.find((c) => c.id === row.id)!;
      expect(actual.phaseDetail).toBe(toYardCoin(row)!.phaseDetail);
      const snapshot = runtimeSlim.find((c) => c.id === row.id);
      const sources = new Map(toYardCoin(snapshot)?.milestones.map((m) => [`${m.date}|${m.title}`, m.sourceUrl]) ?? []);
      expect(actual.milestones).toEqual(toYardCoin(row)!.milestones.map((m) => ({
        ...m, ...(m.sourceUrl || !sources.get(`${m.date}|${m.title}`) ? {} : { sourceUrl: sources.get(`${m.date}|${m.title}`) }),
      })));
    }
  });
});

describe("P6 places", () => {
  it("reads the civic plots and sea zones from the layout", () => {
    expect(civicPlots(L).length).toBeGreaterThanOrEqual(17);
    expect(seaZones(L).some((z) => z.kind === "roads")).toBe(true);
    expect(officeChain(L, "harbour-office:hyperliquid-l1")).toBe("Hyperliquid L1");
    expect(officeChain(L, "mint")).toBeNull();
    expect(placeName(L, "the-roads")).toBe("The Roads");
    for (const id of ["mint", "burn", "slipway", "chartroom", "keeperslog", "the-roads"]) expect(PANEL_LANDMARKS.has(id)).toBe(true);
  });

  it("tests a point against a rotated plot", () => {
    const p = { id: "p", kind: "mint", position: [0, 0, 0] as [number, number, number], rotationY: Math.PI / 2, footprint: [40, 10] as [number, number] };
    // rotated a quarter turn, the 40 m side runs along z
    expect(inPlot(p, 0, 18)).toBe(true);
    expect(inPlot(p, 18, 0)).toBe(false);
  });

  it("gives the new buildings a fact without the tide board", () => {
    expect(landmarkFact("mint", null, null).fact).toMatch(/no flow reading/);
    expect(landmarkFact("slipway", null, null, { yard: 43 }).fact).toBe("43 coins building · pre-launch");
    expect(landmarkFact("customs-house", null, null).fact).not.toMatch(/tide/);
  });
});
