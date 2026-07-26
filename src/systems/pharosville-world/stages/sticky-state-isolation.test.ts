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
import type { PharosVilleInputs } from "../pipeline-types";
import type { StablecoinData } from "@shared/types";

/**
 * Sticky placement and sticky berths are module-level memories of the previous
 * build. They are deliberate — they are what keeps ships from teleporting on
 * refresh — but they also mean a world build is a function of (inputs, previous
 * build), so a test file that builds more than one world would otherwise get
 * placements that depend on which `it()` ran first.
 *
 * `src/test-setup.ts` clears both memories before every test, so this file is
 * the proof that it works: the reference below is captured at module scope,
 * BEFORE any test runs and therefore from a genuinely cold build, and the last
 * test reproduces it exactly despite an unrelated world having been built in
 * the test before it. Neither test calls a reset — that is the point.
 */

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

const allAssets = denseFixtureStablecoins.peggedAssets ?? [];
const subsetInputs = () => denseWorldInputs(allAssets.filter((_, index) => index % 3 !== 0));

/** Every tile the sticky memories can move: risk tiles and mooring tiles. */
function placements(inputs: PharosVilleInputs): Record<string, string> {
  const world = buildPharosVilleWorld(inputs);
  const byShip: Record<string, string> = {};
  for (const ship of world.ships) {
    const moorings = ship.dockVisits
      .map((visit) => `${visit.dockId}@${visit.mooringTile.x}.${visit.mooringTile.y}`)
      .join(",");
    byShip[ship.id] = `${ship.riskTile.x}.${ship.riskTile.y}|${moorings}`;
  }
  return byShip;
}

const COLD_SUBSET_PLACEMENTS = placements(subsetInputs());

describe("world builds are independent of what earlier tests built", () => {
  it("builds an unrelated world, leaving its sticky placements behind", () => {
    const world = buildPharosVilleWorld(denseWorldInputs());
    expect(world.ships.length).toBeGreaterThan(0);
  });

  it("places the subset world exactly as a cold build would", () => {
    // Without the shared reset this build inherits the full fleet's held tiles
    // and moorings, and this file's assertions would then pass or fail by
    // execution order rather than by anything the code under test does.
    expect(placements(subsetInputs())).toEqual(COLD_SUBSET_PLACEMENTS);
  });
});
