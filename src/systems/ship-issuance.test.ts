import { describe, expect, it } from "vitest";
import { denseQuietArtInput, SCENARIOS } from "../__fixtures__/data-contract-scenarios";
import { buildShipIssuance, issuanceHasCurrentWindow, issuanceWorkMateriality, shipIssuanceVisualState } from "./ship-issuance";
import { buildPharosVilleWorld } from "./pharosville-world";
import type { PharosVilleWorld } from "./world-types";
import { cargoTideCrateCount } from "./pharosville-world/stages/cargo-tide";

const cases = [
  ["quietNormal", "inactive", 0, 0, 0],
  ["largeBalancedGross", "balanced-active", 100_000_000, 100_000_000, 0],
  ["largeMint", "minting", 100_000_000, 0, 100_000_000],
  ["largeRedemption", "redeeming", 0, 100_000_000, -100_000_000],
  ["oneDollarNet", "minting", 1, 0, 1],
] as const;

describe("per-coin issuance truth", () => {
  it.each(cases)("retains zero, balanced gross, mint and redeem as distinct readings: %s", (name, activity, mint, burn, net) => {
    const input = structuredClone(SCENARIOS[name]);
    const envelope = input.mintBurn!;
    const issuance = buildShipIssuance(envelope.coins[0], envelope, input.freshness.mintBurn)!;
    expect(issuance).toMatchObject({ activity, mintVolumeUsd: mint, burnVolumeUsd: burn, grossVolumeUsd: mint + burn, netFlow24hUsd: net });
    expect(issuance.mintCount).toBe(mint > 0 ? 10 : 0);
    expect(issuance.burnCount).toBe(burn > 0 ? 10 : 0);
    expect(issuance.direction).toBe(net > 0 ? "minting" : net < 0 ? "redeeming" : "flat");
    expect(issuance.intensity).toBe(0);
  });

  it("retains partial and historical quantities without certifying complete activity", () => {
    const input = structuredClone(SCENARIOS.partialFlow);
    const envelope = input.mintBurn!;
    const partial = buildShipIssuance(envelope.coins[0], envelope, input.freshness.mintBurn)!;
    expect(partial).toMatchObject({ mintVolumeUsd: 100_000_000, netFlow24hUsd: 100_000_000, activity: "minting", completeWindow: false });
    expect(issuanceHasCurrentWindow(partial)).toBe(false);
    expect(shipIssuanceVisualState(partial)).toBeNull();
    const retained = buildShipIssuance(envelope.coins[0], envelope, { ...input.freshness.mintBurn, state: "stale", reason: "retained poll failure" })!;
    expect(retained.mintVolumeUsd).toBe(partial.mintVolumeUsd);
    expect(retained.evidence.state).toBe("stale");
    expect(retained.evidence.reason).toContain("retained poll failure");
    const oldEnvelope = buildShipIssuance(envelope.coins[0], envelope, { ...input.freshness.mintBurn, state: "stale", reason: "Source age stale" })!;
    expect(oldEnvelope.evidence.state).toBe("stale");
    expect(shipIssuanceVisualState(oldEnvelope)).toBeNull();
    envelope.coins[0] = { ...envelope.coins[0]!, mintVolume24hUsd: 0, netFlow24hUsd: 0 };
    expect(buildShipIssuance(envelope.coins[0], envelope, input.freshness.mintBurn)!.activity).toBeNull();
    expect(buildShipIssuance(null, envelope, input.freshness.mintBurn)).toBeUndefined();
  });

  it("keeps an event's exact amount and own timestamp distinct from publication time", () => {
    const input = structuredClone(SCENARIOS.largeMint);
    const envelope = input.mintBurn!;
    envelope.coins[0]!.largestEvent24h = { direction: "mint", amountUsd: 1_234_567.89, timestamp: 1_699_999_000, txHash: "0xfixture" };
    const issuance = buildShipIssuance(envelope.coins[0], envelope, input.freshness.mintBurn)!;
    expect(issuance.largestEvent24h).toEqual({ direction: "mint", amountUsd: 1_234_567.89, timestamp: 1_699_999_000 });
    expect(issuance.evidence.observedAt).toBeNull();
    expect(issuance.evidence.publishedAt).toBe(envelope.updatedAt * 1_000);
  });
});

describe("uncalibrated illustrative-work materiality", () => {
  function balancedReading(gross: number) {
    const input = structuredClone(SCENARIOS.largeBalancedGross);
    const envelope = input.mintBurn!;
    Object.assign(envelope.coins[0]!, { mintVolume24hUsd: gross / 2, burnVolume24hUsd: gross / 2 });
    return buildShipIssuance(envelope.coins[0], envelope, input.freshness.mintBurn)!;
  }

  it.each([
    [999_999, 50_000_000, null, false],
    [1_000_000, 50_000_000, null, true],
    [1_000_000, 100_000_000, null, true],
    [1_000_000, 100_000_001, null, false],
    [1_000_000, null, 1_000_000_000, true],
    [1_000_000, null, 1_000_000_001, false],
  ] as const)("applies the floor and either measured share exactly at the boundary (%s, %s, %s)", (gross, supply, fleetGross, eligible) => {
    expect(issuanceWorkMateriality(balancedReading(gross), supply, fleetGross).eligible).toBe(eligible);
  });

  it.each([[null, null], [0, 0], [Number.NaN, Number.POSITIVE_INFINITY], [Number.MIN_VALUE, Number.MIN_VALUE]] as const)("never promotes unknown denominators (%s, %s)", (supply, fleetGross) => {
    expect(issuanceWorkMateriality(balancedReading(1_000_000), supply, fleetGross)).toMatchObject({
      eligible: false, supplyShare: null, fleetGrossShare: null,
    });
  });

  it("large balanced activity earns work; $1-only retains direction but no moving work", () => {
    const balanced = buildPharosVilleWorld(structuredClone(SCENARIOS.largeBalancedGross)).ships.find((ship) => ship.id === "usdc-circle")!;
    const small = buildPharosVilleWorld(structuredClone(SCENARIOS.oneDollarNet)).ships.find((ship) => ship.id === "usdc-circle")!;
    expect(balanced.issuance).toMatchObject({ activity: "balanced-active", grossVolumeUsd: 200_000_000, netFlow24hUsd: 0, work: { eligible: true, overviewRank: 1 } });
    expect(small.issuance).toMatchObject({ activity: "minting", direction: "minting", netFlow24hUsd: 1, work: { eligible: false, overviewRank: null } });
    const input = structuredClone(SCENARIOS.largeBalancedGross);
    Object.assign(input.mintBurn!.coins[0]!, { burnVolume24hUsd: 99_999_999, netFlow24hUsd: 1 });
    const tinyNet = buildPharosVilleWorld(input).ships.find((ship) => ship.id === "usdc-circle")!;
    expect(tinyNet.issuance).toMatchObject({ activity: "minting", direction: "minting", grossVolumeUsd: 199_999_999, netFlow24hUsd: 1, work: { eligible: true } });
  });

  it("holds stable top-three ties independently of payload order", () => {
    const input = denseQuietArtInput();
    const ids = input.mintBurn!.coins.slice(0, 4).map((row) => row.stablecoinId);
    for (const row of input.mintBurn!.coins) if (ids.includes(row.stablecoinId)) Object.assign(row, {
      mintVolume24hUsd: 2_000_000, burnVolume24hUsd: 0, netFlow24hUsd: 2_000_000,
    });
    const slots = (world: PharosVilleWorld) => world.ships
      .filter((ship) => ship.issuance?.work.overviewRank !== null && ship.issuance?.work.overviewRank !== undefined)
      .toSorted((a, b) => a.issuance!.work.overviewRank! - b.issuance!.work.overviewRank!)
      .map((ship) => ship.id);
    expect(slots(buildPharosVilleWorld(input))).toEqual([...ids].sort().slice(0, 3));
    const reordered = structuredClone(input);
    reordered.mintBurn!.coins.reverse();
    reordered.stablecoins!.peggedAssets.reverse();
    expect(slots(buildPharosVilleWorld(reordered))).toEqual([...ids].sort().slice(0, 3));
    const partial = structuredClone(SCENARIOS.partialFlow);
    expect(buildPharosVilleWorld(partial).ships.find((ship) => ship.id === "usdc-circle")!.issuance!.work.eligible).toBe(false);
    const held = structuredClone(SCENARIOS.largeMint);
    held.freshness.mintBurn = { ...held.freshness.mintBurn, state: "stale", reason: "retained failure" };
    expect(buildPharosVilleWorld(held).ships.find((ship) => ship.id === "usdc-circle")!.issuance!.work.eligible).toBe(false);
  });

  it("unknown producer coverage cannot certify a full window even when window flags are optimistic", () => {
    const input = structuredClone(SCENARIOS.largeMint);
    Object.assign(input.mintBurn!.coins[0]!.coverage!, { status: "unknown" });
    const world = buildPharosVilleWorld(input);
    const ship = world.ships.find((entry) => entry.id === "usdc-circle")!;
    expect(ship.issuance).toMatchObject({ grossVolumeUsd: 100_000_000, completeWindow: false, work: { eligible: false } });
    expect(shipIssuanceVisualState(ship.issuance)).toBeNull();
    expect(world.docks.reduce((sum, dock) => sum + cargoTideCrateCount(dock.cargoTide), 0)).toBe(0);
    const empty = structuredClone(input);
    Object.assign(empty.mintBurn!.coins[0]!, { mintVolume24hUsd: 0, netFlow24hUsd: 0 });
    expect(buildPharosVilleWorld(empty).ships.find((entry) => entry.id === ship.id)!.issuance!.activity).toBeNull();
  });
});
