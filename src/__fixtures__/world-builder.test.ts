import { describe, expect, it } from "vitest";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { WorldBuilder } from "./world-builder";

describe("WorldBuilder", () => {
  it("produces a valid empty PharosVilleInputs that buildPharosVilleWorld can consume", () => {
    const inputs = new WorldBuilder().build();
    expect(inputs.stablecoins).not.toBeNull();
    expect(inputs.chains).not.toBeNull();
    expect(inputs.freshness).toEqual({
      stablecoinsStale: false,
      chainsStale: false,
      stabilityStale: false,
      pegSummaryStale: false,
      stressStale: false,
      reportCardsStale: false,
    });
    const world = buildPharosVilleWorld(inputs);
    expect(world.routeMode).toBe("world");
    expect(world.ships).toEqual([]);
  });

  it("addAsset appends stablecoins into the inputs payload", () => {
    const inputs = new WorldBuilder()
      .withDefaultChains()
      .addAsset({ id: "usdc", symbol: "USDC" })
      .addAsset({ id: "usdt", symbol: "USDT" })
      .build();
    const ids = inputs.stablecoins?.peggedAssets.map((a) => a.id) ?? [];
    expect(ids).toEqual(["usdc", "usdt"]);
    // Sanity: buildPharosVilleWorld can consume the inputs without throwing.
    // (Whether ships materialise depends on chain/active-asset matching that
    // is out of WorldBuilder's scope.)
    expect(() => buildPharosVilleWorld(inputs)).not.toThrow();
  });

  it("markStale flips a single freshness flag without disturbing siblings", () => {
    const inputs = new WorldBuilder()
      .markStale("stablecoinsStale")
      .markStale("chainsStale")
      .build();
    expect(inputs.freshness.stablecoinsStale).toBe(true);
    expect(inputs.freshness.chainsStale).toBe(true);
    expect(inputs.freshness.stabilityStale).toBe(false);
    expect(inputs.freshness.pegSummaryStale).toBe(false);
  });

  it("withRouteMode and withGeneratedAt round-trip into the inputs", () => {
    const inputs = new WorldBuilder()
      .withRouteMode("loading")
      .withGeneratedAt(1_700_000_000)
      .build();
    expect(inputs.routeMode).toBe("loading");
    expect(inputs.generatedAt).toBe(1_700_000_000);
  });
});
