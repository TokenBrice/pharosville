import { describe, expect, it } from "vitest";
import { SCENARIOS } from "../__fixtures__/data-contract-scenarios";
import { buildShipIssuance, issuanceHasCurrentWindow, shipIssuanceVisualState } from "./ship-issuance";

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
