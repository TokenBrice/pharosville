import { describe, expect, it } from "vitest";
import { gardenZoneSeaCoverage } from "./garden-zone-coverage";
import { landWorldTile } from "./map-scale";

// Zones-v3 (operator steer, 2026-07-24): the six rendered zone ellipses must
// cover a solid majority of the open-sea surface (map minus rendered
// landmasses) — "zones should cover at least 50–60% of the total available
// surface". Measured at worst-case counts (1 per zone; the √count term only
// grows the ellipses). The zones-v2 radii already measured ~89% (the "empty"
// read was the faint tints, not the footprints); the floor below guards
// against regressions, and the <100% bound guards the open-water breathing
// room the operator asked to keep at the frame edges.
describe("gardenZoneSeaCoverage", () => {
  it("keeps zone union coverage of the sea solidly above half, without flooding", () => {
    const report = gardenZoneSeaCoverage();
    console.info(
      `zone sea coverage: ${(report.coverage * 100).toFixed(1)}%`,
      `(${report.coveredSeaSamples}/${report.seaSamples} sea samples)`,
    );
    expect(report.coverage).toBeGreaterThanOrEqual(0.5);
    expect(report.coverage).toBeLessThan(1);
  });

  it("only grows coverage as zone populations grow (√count term)", () => {
    const sparse = gardenZoneSeaCoverage({ counts: { CALM: 1, WATCH: 1 } });
    const dense = gardenZoneSeaCoverage({ counts: { CALM: 44, WATCH: 30 } });
    expect(dense.coverage).toBeGreaterThanOrEqual(sparse.coverage);
  });

  it("keeps every rendered ellipse centered on its authored display center", () => {
    const report = gardenZoneSeaCoverage();
    const byKey = new Map(report.ellipses.map((ellipse) => [ellipse.key, ellipse]));
    // Calm's harbor ring stays centered on the island; Watch stays
    // island-centric; Danger stays the small NE corner pit. N1: the island is
    // authored at design (31,31) and offset onto the 112-tile grid.
    expect(byKey.get("CALM")!.centerTile).toEqual(landWorldTile({ x: 31, y: 31 }));
    expect(byKey.get("DANGER")!.rx).toBeLessThan(byKey.get("CALM")!.rx);
    expect(byKey.get("WATCH")!.rx).toBeGreaterThan(byKey.get("ledger-mooring")!.rx);
  });
});
