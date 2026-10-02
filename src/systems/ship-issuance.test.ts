import type { MintBurnCoinFlow } from "@shared/types/mint-burn";
import { describe, expect, it } from "vitest";
import { buildShipIssuance } from "./ship-issuance";

function coin(overrides: Partial<MintBurnCoinFlow> = {}): MintBurnCoinFlow {
  return {
    stablecoinId: "coin",
    symbol: "COIN",
    flowIntensity: 75,
    netFlow24hUsd: 8_000_000,
    mintVolume24hUsd: 9_000_000,
    burnVolume24hUsd: 1_000_000,
    mintCount24h: 2,
    burnCount24h: 1,
    netFlow7dUsd: 0,
    netFlow30dUsd: 0,
    netFlow90dUsd: 0,
    largestEvent24h: { direction: "mint", amountUsd: 5_000_000, txHash: "0x1", timestamp: 1 },
    ...overrides,
  };
}

describe("per-ship issuance story", () => {
  it("retains net minting and its reported intensity and largest event", () => {
    const issuance = buildShipIssuance(coin())!;
    expect(issuance).toMatchObject({ direction: "minting", flowIntensity: 75, netFlow24hUsd: 8_000_000 });
    expect(issuance.largestEvent24h).toEqual({
      direction: "mint", amountUsd: 5_000_000, timestamp: 1,
    });
  });

  it("retains net redemption and keeps missing data explicit", () => {
    const issuance = buildShipIssuance(coin({ netFlow24hUsd: -3_000_000, flowIntensity: -50 }))!;
    expect(issuance).toMatchObject({
      direction: "redeeming", netFlow24hUsd: -3_000_000, flowIntensity: -50,
    });
    expect(buildShipIssuance(null)).toBeUndefined();
  });
});
