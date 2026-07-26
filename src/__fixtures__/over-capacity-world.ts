import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureReportCards,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureStability,
} from "./pharosville-world";
import {
  GARDEN_OVERVIEW_SHIP_LIMIT,
} from "../systems/garden-observatory-slice";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import type {
  PharosVilleWorld,
  ShipNode,
} from "../systems/world-types";

/**
 * Test-only world that exercises the transient-selection path which production
 * data does not currently reach: the ordinary render slice is exactly full and
 * one more ship remains addressable through selection and the DOM record.
 */
export function overCapacityWorldFixture(): PharosVilleWorld {
  const base = buildPharosVilleWorld({
    cemeteryEntries: [],
    chains: denseFixtureChains,
    freshness: {},
    pegSummary: denseFixturePegSummary,
    reportCards: denseFixtureReportCards,
    stability: fixtureStability,
    stablecoins: denseFixtureStablecoins,
    stress: denseFixtureStress,
  });
  const shipCount = GARDEN_OVERVIEW_SHIP_LIMIT + 1;
  const ships: ShipNode[] = [];
  const entityById = { ...base.entityById };
  const detailIndex = { ...base.detailIndex };

  for (let index = 0; index < shipCount; index += 1) {
    const source = base.ships[index % base.ships.length]!;
    const suffix = String(index).padStart(3, "0");
    const id = `ship.capacity-${suffix}`;
    const label = `Capacity Ship ${suffix}`;
    const ship: ShipNode = {
      ...source,
      detailId: id,
      id,
      label,
      marketCapUsd: Math.max(1, source.marketCapUsd - index),
      symbol: `CAP${suffix}`,
      visual: {
        ...source.visual,
        hullForm: { ...source.visual.hullForm },
      },
    };
    ships.push(ship);
    entityById[id] = ship;

    const sourceDetail = base.detailIndex[source.detailId]!;
    detailIndex[id] = {
      ...sourceDetail,
      id,
      title: label,
    };
  }

  return {
    ...base,
    detailIndex,
    entityById,
    ships,
  };
}
