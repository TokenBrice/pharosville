import { describe, expect, it } from "vitest";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureReportCards,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureStability,
} from "../../../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "../../pharosville-world";
import { seawallBarrierDistance } from "../../seawall";
import { UNIQUE_SHIP_DEFINITIONS } from "../../unique-ships";

describe("dock-assignment unique tier mooring placement", () => {
  it("moors unique-tier ships with flagship-tier barrier clearance (>= 3.3)", () => {
    const world = buildPharosVilleWorld({
      stablecoins: denseFixtureStablecoins,
      chains: denseFixtureChains,
      stability: fixtureStability,
      pegSummary: denseFixturePegSummary,
      stress: denseFixtureStress,
      reportCards: denseFixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    });

    const uniqueIds = new Set(Object.keys(UNIQUE_SHIP_DEFINITIONS));
    const uniqueShips = world.ships.filter((ship) => uniqueIds.has(ship.id));

    // The dense fixture seeds from ACTIVE_STABLECOINS, so at least one unique
    // candidate must surface. If this assertion ever fails, the dense
    // fixture composition has changed and the test needs new bait.
    expect(uniqueShips.length).toBeGreaterThan(0);

    for (const ship of uniqueShips) {
      expect(ship.visual.sizeTier, ship.id).toBe("unique");
      for (const visit of ship.dockVisits) {
        const distance = seawallBarrierDistance(visit.mooringTile);
        expect(distance, `${ship.id} -> ${visit.dockId}`).toBeGreaterThanOrEqual(3.3);
      }
    }
  });
});
