import { beforeEach, describe, expect, it } from "vitest";
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
import { resetHeldMoorings } from "./dock-assignment";
import { resetHeldShipPlacements } from "./ship-placement";
import type { PharosVilleInputs } from "../pipeline-types";
import type { StablecoinData } from "@shared/types";

function denseWorldInputs(peggedAssets?: readonly StablecoinData[]): PharosVilleInputs {
  return {
    stablecoins: peggedAssets
      ? { ...denseFixtureStablecoins, peggedAssets: [...peggedAssets] }
      : denseFixtureStablecoins,
    chains: denseFixtureChains,
    stability: fixtureStability,
    pegSummary: denseFixturePegSummary,
    stress: denseFixtureStress,
    reportCards: denseFixtureReportCards,
    cemeteryEntries: [],
    freshness: {},
  };
}

describe("dock-assignment unique tier mooring placement", () => {
  beforeEach(() => {
    resetHeldShipPlacements();
    resetHeldMoorings();
  });

  it("moors unique-tier ships with flagship-tier barrier clearance (>= 3.3)", () => {
    const world = buildPharosVilleWorld(denseWorldInputs());

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

  it("keeps held berths clear of each other as ships join and leave", () => {
    // A held berth is claimed before any berth is searched for, so a ship
    // arriving at a busy dock cannot be handed a tile a survivor is holding.
    const all = denseFixtureStablecoins.peggedAssets ?? [];
    buildPharosVilleWorld(denseWorldInputs());

    for (let refresh = 1; refresh <= 6; refresh += 1) {
      const world = buildPharosVilleWorld(denseWorldInputs(
        all.filter((_, index) => (index + refresh) % 7 !== 0),
      ));

      const moorings = world.ships.flatMap((ship) => ship.dockVisits.map((visit) => ({
        key: `${visit.mooringTile.x}.${visit.mooringTile.y}`,
        label: `${ship.id} -> ${visit.dockId}`,
        tile: visit.mooringTile,
        ship,
      })));
      const seen = new Map<string, string>();
      for (const mooring of moorings) {
        expect(seen.get(mooring.key), `${mooring.label} collides with ${seen.get(mooring.key)}`).toBeUndefined();
        seen.set(mooring.key, mooring.label);
      }
    }
  });

  it("gives up a held berth the ship has outgrown", () => {
    // Barrier clearance is a function of the ship's size tier, so a berth held
    // from a smaller tier has to be surrendered rather than kept as a mooring
    // the hull no longer fits. Titans need 4.0.
    const all = denseFixtureStablecoins.peggedAssets ?? [];
    const grown = all.map((asset, index) => (index >= 20 && index < 30
      ? { ...asset, circulating: { peggedUSD: 60_000_000_000 } }
      : asset));

    buildPharosVilleWorld(denseWorldInputs());
    const after = buildPharosVilleWorld(denseWorldInputs(grown));

    const titans = after.ships.filter((ship) => ship.visual.sizeTier === "titan" && ship.dockVisits.length > 0);
    expect(titans.length).toBeGreaterThan(0);
    for (const ship of titans) {
      for (const visit of ship.dockVisits) {
        expect(seawallBarrierDistance(visit.mooringTile), `${ship.id} -> ${visit.dockId}`)
          .toBeGreaterThanOrEqual(4.0);
      }
    }
  });
});
