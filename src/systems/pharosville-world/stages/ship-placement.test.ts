import { beforeEach, describe, expect, it } from "vitest";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixturePegSummary,
  fixtureWithDepegOn,
  makePegCoin,
  makePharosVilleWorldInput,
} from "../../../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "../../pharosville-world";
import { isRiskPlacementWaterTile } from "../../risk-water-placement";
import { resetHeldMoorings } from "./dock-assignment";
import { resetHeldShipPlacements } from "./ship-placement";
import type { PharosVilleInputs } from "../pipeline-types";
import type { ShipNode } from "../../world-types";

type DexPriceCheck = NonNullable<ReturnType<typeof makePegCoin>["dexPriceCheck"]>;

function worldWithCheck(check: DexPriceCheck | null | undefined): ShipNode {
  const inputs: PharosVilleInputs = makePharosVilleWorldInput({
    pegSummary: {
      ...fixturePegSummary,
      coins: [
        makePegCoin({
          id: "usdc-circle",
          symbol: "USDC",
          ...(check === undefined ? {} : { dexPriceCheck: check }),
        }),
        makePegCoin({ id: "usdt-tether", symbol: "USDT" }),
      ],
    },
  });
  const world = buildPharosVilleWorld(inputs);
  const ship = world.ships.find((entry) => entry.id === "usdc-circle");
  expect(ship).toBeDefined();
  return ship!;
}

const CROSSED: DexPriceCheck = {
  dexPrice: 0.9912,
  dexDeviationBps: -88,
  agrees: false,
  sourcePools: 4,
  sourceTvl: 12_300_000,
};

describe("ship dexCrossCheck (3b)", () => {
  it("carries the second bearing onto the ship when a check ran", () => {
    const ship = worldWithCheck(CROSSED);

    expect(ship.dexCrossCheck).toMatchObject({
      dexPrice: 0.9912,
      dexDeviationBps: -88,
      agrees: false,
      sourcePools: 4,
      sourceTvlUsd: 12_300_000,
    });
  });

  it("leaves the field absent when the pipeline ran no check", () => {
    // Both upstream shapes of "no check" — the key missing, and the key present
    // but null. Neither may become an object, because an object that defaulted
    // `agrees` would moor a buoy or, worse, silently claim agreement.
    expect(worldWithCheck(undefined).dexCrossCheck).toBeUndefined();
    expect(worldWithCheck(null).dexCrossCheck).toBeUndefined();
  });

  it("does not treat an unfillable reading as a bearing", () => {
    expect(worldWithCheck({ ...CROSSED, dexPrice: Number.NaN }).dexCrossCheck).toBeUndefined();
  });

  it("records agreement as agreement rather than as absence", () => {
    const ship = worldWithCheck({ ...CROSSED, agrees: true });

    expect(ship.dexCrossCheck?.agrees).toBe(true);
  });

  it("pairs the DEX bearing with the feed reading the rest of the world uses", () => {
    const ship = worldWithCheck(CROSSED);

    // Both instruments in one place: without the feed's own price and
    // deviation beside it, "they disagree" is a claim a reader cannot check.
    expect(ship.dexCrossCheck?.oraclePrice).toBe(ship.asset.price);
    expect(ship.dexCrossCheck?.oracleDeviationBps).toBe(ship.pegDeviationBps ?? null);
  });
});

function denseInputs(overrides: Partial<PharosVilleInputs> = {}): PharosVilleInputs {
  return makePharosVilleWorldInput({
    stablecoins: denseFixtureStablecoins,
    chains: denseFixtureChains,
    pegSummary: denseFixturePegSummary,
    stress: denseFixtureStress,
    ...overrides,
  });
}

/** Nudges every supply by well under a percent, the way a live refresh does. */
function withSupplyWiggle(inputs: PharosVilleInputs): PharosVilleInputs {
  const assets = (inputs.stablecoins?.peggedAssets ?? []).map((asset, index) => ({
    ...asset,
    circulating: { peggedUSD: (asset.circulating?.peggedUSD ?? 0) * (1 + (index % 5) * 0.0007) },
  }));
  return { ...inputs, stablecoins: { ...inputs.stablecoins, peggedAssets: assets } };
}

function tileOf(ships: readonly ShipNode[], id: string): string {
  const ship = ships.find((entry) => entry.id === id);
  return ship ? `${ship.riskTile.x}.${ship.riskTile.y}` : "absent";
}

function mooringsOf(ships: readonly ShipNode[]): Map<string, string> {
  const moorings = new Map<string, string>();
  for (const ship of ships) {
    for (const visit of ship.dockVisits) {
      moorings.set(`${ship.id}|${visit.dockId}`, `${visit.mooringTile.x}.${visit.mooringTile.y}`);
    }
  }
  return moorings;
}

describe("sticky ship placement", () => {
  beforeEach(() => {
    resetHeldShipPlacements();
    resetHeldMoorings();
  });

  it("keeps every tile and berth when a refresh moves metrics but no placement", () => {
    // The whole point. Placement is greedy farthest-point sampling walked in
    // market-cap order, so before this a sub-percent supply wiggle re-tiled
    // ships whose own data never moved — new path keys, an A* re-solve, and a
    // fleet that teleports on refresh.
    const before = buildPharosVilleWorld(denseInputs());
    const after = buildPharosVilleWorld(withSupplyWiggle(denseInputs()));

    const beforeById = new Map(before.ships.map((ship) => [ship.id, ship]));
    const moved = after.ships.filter((ship) => {
      const previous = beforeById.get(ship.id);
      return previous
        && previous.riskPlacement === ship.riskPlacement
        && (previous.riskTile.x !== ship.riskTile.x || previous.riskTile.y !== ship.riskTile.y);
    });

    expect(after.ships.length).toBeGreaterThan(100);
    expect(moved.map((ship) => ship.id)).toEqual([]);
    expect(mooringsOf(after.ships)).toEqual(mooringsOf(before.ships));
  });

  it("re-tiles a ship whose risk placement actually changed", () => {
    // Holding must be conditional on the placement, not on the id — a depegged
    // ship has to leave the calm water it was holding.
    const inputs = denseInputs();
    const before = buildPharosVilleWorld(inputs);
    const subject = before.ships.find((ship) => ship.riskPlacement === "safe-harbor")!;
    const after = buildPharosVilleWorld(fixtureWithDepegOn(inputs, subject.id));

    const moved = after.ships.find((ship) => ship.id === subject.id)!;
    expect(moved.riskPlacement).not.toBe("safe-harbor");
    expect(tileOf(after.ships, subject.id)).not.toBe(tileOf(before.ships, subject.id));
    expect(isRiskPlacementWaterTile(moved.riskTile, moved.riskPlacement)).toBe(true);
  });

  it("gives a cold build and a warm rebuild the same world", () => {
    // Sticky placement makes the build a function of (inputs, held placements)
    // rather than inputs alone, so both halves of that have to hold: rebuilding
    // the same inputs must be a no-op, and a cold build must reproduce exactly
    // what the previous cold build produced.
    const first = buildPharosVilleWorld(denseInputs());
    const warm = buildPharosVilleWorld(denseInputs());
    expect(warm.ships.map((ship) => tileOf(warm.ships, ship.id)))
      .toEqual(first.ships.map((ship) => tileOf(first.ships, ship.id)));

    resetHeldShipPlacements();
    resetHeldMoorings();
    const cold = buildPharosVilleWorld(denseInputs());
    expect(cold.ships.map((ship) => tileOf(cold.ships, ship.id)))
      .toEqual(first.ships.map((ship) => tileOf(first.ships, ship.id)));
  });

  it("never lets a held tile collide or leave its own risk water", () => {
    // Ships join and leave across refreshes; held survivors must not end up
    // sharing a tile with a newcomer that was placed into the gap they left.
    buildPharosVilleWorld(denseInputs());
    for (let refresh = 1; refresh <= 6; refresh += 1) {
      const assets = (denseFixtureStablecoins.peggedAssets ?? [])
        .filter((_, index) => (index + refresh) % 9 !== 0);
      const world = buildPharosVilleWorld(withSupplyWiggle(denseInputs({
        stablecoins: { ...denseFixtureStablecoins, peggedAssets: assets },
      })));

      const spread = world.ships.filter((ship) => ship.squadRole !== "consort");
      const tiles = spread.map((ship) => `${ship.riskTile.x}.${ship.riskTile.y}`);
      expect(new Set(tiles).size).toBe(tiles.length);
      const outsiders = spread.filter((ship) => !isRiskPlacementWaterTile(ship.riskTile, ship.riskPlacement));
      expect(outsiders.map((ship) => ship.id)).toEqual([]);
    }
  });
});
