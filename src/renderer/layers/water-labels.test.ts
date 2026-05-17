import { describe, expect, it } from "vitest";
import { waterLabelChromeStyleForTerrain, waterLabelPlaqueMetrics } from "./water-labels";

describe("water label plaque chrome", () => {
  it("maps zone terrains to the requested plaque materials", () => {
    expect(waterLabelChromeStyleForTerrain("storm-water")).toBe("charred-wax");
    expect(waterLabelChromeStyleForTerrain("warning-water")).toBe("weathered-wood");
    expect(waterLabelChromeStyleForTerrain("calm-water")).toBe("calm-parchment");
    expect(waterLabelChromeStyleForTerrain("ledger-water")).toBe("ledger-vellum");
    expect(waterLabelChromeStyleForTerrain("watch-water")).toBe("generic-board");
  });

  it("keeps plaque metrics legible at the minimum label scale", () => {
    const metrics = waterLabelPlaqueMetrics({
      align: "center",
      maxWidth: 110,
      measuredWidthRaw: 88,
      scale: 0.72,
    });

    expect(metrics.width).toBeCloseTo(79.2);
    expect(metrics.plaqueWidth).toBe(metrics.width);
    expect(metrics.height).toBeGreaterThan(12);
    expect(metrics.plaqueX).toBeCloseTo(-39.6);
  });
});
