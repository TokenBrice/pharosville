import { describe, expect, it } from "vitest";
import {
  fixturePegSummary,
  makePegCoin,
  makePharosVilleWorldInput,
} from "../../../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "../../pharosville-world";
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
