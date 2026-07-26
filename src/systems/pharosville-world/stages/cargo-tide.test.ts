import { describe, expect, it } from "vitest";
import type { MintBurnFlowsResponse } from "@shared/types/mint-burn";
import type { DockNode, ShipNode } from "../../world-types";
import { buildCargoTideStage } from "./cargo-tide";

function dock(chainId: string): DockNode {
  return {
    id: `dock.${chainId}`,
    kind: "dock",
    label: chainId,
    chainId,
    tile: { x: 0, y: 0 },
    totalUsd: 1_000,
    size: 1,
    healthBand: null,
    stablecoinCount: 1,
    concentration: null,
    harboredStablecoins: [],
    detailId: `dock.${chainId}`,
  };
}

function ship(id: string, presence: Array<[string, number]>): ShipNode {
  return {
    id,
    chainPresence: presence.map(([chainId, share]) => ({
      chainId,
      currentUsd: share * 1_000,
      share,
      hasRenderedDock: true,
    })),
  } as unknown as ShipNode;
}

function coin(
  stablecoinId: string,
  net: number,
  mint: number,
  burn: number,
): MintBurnFlowsResponse["coins"][number] {
  return {
    stablecoinId,
    symbol: stablecoinId.toUpperCase(),
    flowIntensity: null,
    has24hActivity: mint + burn > 0,
    netFlow24hUsd: net,
    mintVolume24hUsd: mint,
    burnVolume24hUsd: burn,
    mintCount24h: 1,
    burnCount24h: 1,
    netFlow7dUsd: 0,
    netFlow30dUsd: 0,
    netFlow90dUsd: 0,
    largestEvent24h: null,
  };
}

function payload(
  coins: MintBurnFlowsResponse["coins"],
  scopeChainIds: string[] | null = ["ethereum", "arbitrum"],
): MintBurnFlowsResponse {
  return {
    gauge: {
      score: 10,
      band: "EXPANDING",
      flightToQuality: false,
      flightIntensity: 0,
      trackedCoins: coins.length,
      trackedMcapUsd: 1_000_000,
    },
    coins,
    hourly: [],
    updatedAt: 1_700_000_000,
    ...(scopeChainIds ? { scope: { chainIds: scopeChainIds, label: "Configured issuance chains" } } : {}),
  };
}

const tideOf = (docks: DockNode[], chainId: string) =>
  docks.find((entry) => entry.chainId === chainId)!.cargoTide!;

describe("buildCargoTideStage", () => {
  it("names the direction from the sign of the allocated net flow", () => {
    const stage = buildCargoTideStage(
      [dock("ethereum"), dock("arbitrum")],
      [ship("mint-coin", [["ethereum", 1]]), ship("burn-coin", [["arbitrum", 1]])],
      payload([
        coin("mint-coin", 8_000_000, 10_000_000, 2_000_000),
        coin("burn-coin", -3_000_000, 1_000_000, 4_000_000),
      ]),
    );

    expect(tideOf(stage.docks, "ethereum")).toMatchObject({
      direction: "minting",
      netFlowUsd: 8_000_000,
      tracked: true,
    });
    expect(tideOf(stage.docks, "arbitrum")).toMatchObject({
      direction: "burning",
      netFlowUsd: -3_000_000,
      tracked: true,
    });
  });

  it("splits one coin's flow across its harbours instead of double-counting it", () => {
    // The failure this guards: summing a coin's whole flow into every harbour it
    // touches would report $8M at BOTH quays and $16M across a fleet that minted
    // $8M. The allocation must reproduce the coin's own figure, not a multiple.
    const stage = buildCargoTideStage(
      [dock("ethereum"), dock("arbitrum")],
      [ship("split-coin", [["ethereum", 0.75], ["arbitrum", 0.25]])],
      payload([coin("split-coin", 8_000_000, 8_000_000, 0)]),
    );

    const ethereum = tideOf(stage.docks, "ethereum");
    const arbitrum = tideOf(stage.docks, "arbitrum");
    expect(ethereum.netFlowUsd).toBeCloseTo(6_000_000);
    expect(arbitrum.netFlowUsd).toBeCloseTo(2_000_000);
    expect(ethereum.netFlowUsd + arbitrum.netFlowUsd).toBeCloseTo(8_000_000);
  });

  it("renormalises over the tracked scope so out-of-scope supply does not swallow flow", () => {
    // Most of this coin's supply sits on a chain where issuance is not measured.
    // The flow still happened, and all of it belongs to the one tracked harbour
    // the coin is present at — dropping 80% of it would under-report the quay.
    const stage = buildCargoTideStage(
      [dock("ethereum"), dock("solana")],
      [ship("wide-coin", [["solana", 0.8], ["ethereum", 0.2]])],
      payload([coin("wide-coin", 5_000_000, 5_000_000, 0)]),
    );

    expect(tideOf(stage.docks, "ethereum").netFlowUsd).toBeCloseTo(5_000_000);
  });

  it("reports an out-of-scope harbour as unmeasured rather than as calm", () => {
    // Zero and "not measured" are opposite claims. A quiet quay that means the
    // latter must say so, or the world is asserting something it never checked.
    const stage = buildCargoTideStage(
      [dock("ethereum"), dock("solana")],
      [ship("mint-coin", [["ethereum", 1]])],
      payload([coin("mint-coin", 1_000_000, 1_000_000, 0)]),
    );

    expect(tideOf(stage.docks, "solana")).toMatchObject({
      netFlowUsd: 0,
      reason: "chain-not-in-scope",
      tracked: false,
    });
  });

  it("reports every harbour as unmeasured when no payload landed", () => {
    const stage = buildCargoTideStage([dock("ethereum")], [], null);

    expect(tideOf(stage.docks, "ethereum")).toMatchObject({
      reason: "no-flow-data",
      tracked: false,
    });
    expect(stage.fleetIssuance).toBeNull();
  });

  it("reports every harbour as unmeasured when the payload will not say where it looked", () => {
    const stage = buildCargoTideStage(
      [dock("ethereum")],
      [ship("mint-coin", [["ethereum", 1]])],
      payload([coin("mint-coin", 1_000_000, 1_000_000, 0)], null),
    );

    expect(tideOf(stage.docks, "ethereum")).toMatchObject({
      reason: "scope-unreported",
      tracked: false,
    });
    // The fleet reading survives — it needed no per-harbour attribution.
    expect(stage.fleetIssuance?.netFlowUsd).toBe(1_000_000);
  });

  it("separates a tracked harbour that saw no issuance from one that is not tracked", () => {
    const stage = buildCargoTideStage(
      [dock("ethereum")],
      [ship("idle-coin", [["ethereum", 1]])],
      payload([coin("idle-coin", 0, 0, 0)]),
    );

    expect(tideOf(stage.docks, "ethereum")).toMatchObject({
      direction: "inactive",
      reason: "tracked",
      tracked: true,
    });
  });

  it("refuses to call a harbour idle while issuance it cannot place exists", () => {
    // The cardinal sin: a coin minting $400M carries an id no ship holds (an
    // id-namespace mismatch, a frozen coin, a listing gap), so its flow lands
    // nowhere — and the quay it may well have landed at would otherwise swear
    // to a measured quiet day it never observed.
    const stage = buildCargoTideStage(
      [dock("ethereum")],
      [ship("known-coin", [["ethereum", 1]])],
      payload([coin("unknown-coin", 400_000_000, 400_000_000, 0)]),
    );

    expect(tideOf(stage.docks, "ethereum")).toMatchObject({
      reason: "unattributed",
      tracked: false,
    });
    // The flow itself is not lost — the fleet line still reports it, which is
    // exactly the contradiction ("billions issued, every quay calm") the
    // untracked reason exists to prevent.
    expect(stage.fleetIssuance?.netFlowUsd).toBe(400_000_000);
  });

  it("still measures a harbour that received an allocation of its own", () => {
    // Unplaceable flow elsewhere makes a harbour's SILENCE unverified; it does
    // not taint a harbour that actually saw issuance.
    const stage = buildCargoTideStage(
      [dock("ethereum"), dock("arbitrum")],
      [ship("known-coin", [["ethereum", 1]])],
      payload([
        coin("known-coin", 2_000_000, 2_000_000, 0),
        coin("unknown-coin", 9_000_000, 9_000_000, 0),
      ]),
    );

    expect(tideOf(stage.docks, "ethereum")).toMatchObject({
      direction: "minting",
      netFlowUsd: 2_000_000,
      tracked: true,
    });
    expect(tideOf(stage.docks, "arbitrum")).toMatchObject({ reason: "unattributed", tracked: false });
  });

  it("keeps a genuinely idle harbour measured when every active coin was placed", () => {
    // Arbitrum harbours nothing that moved, but the world knows where every
    // active coin sits — so its zero is observed, not merely unverified.
    const stage = buildCargoTideStage(
      [dock("ethereum"), dock("arbitrum")],
      [ship("mint-coin", [["ethereum", 1]]), ship("idle-coin", [["arbitrum", 1]])],
      payload([coin("mint-coin", 1_000_000, 1_000_000, 0), coin("idle-coin", 0, 0, 0)]),
    );

    expect(tideOf(stage.docks, "arbitrum")).toMatchObject({
      direction: "inactive",
      reason: "tracked",
      tracked: true,
    });
  });

  it("holds a balanced harbour apart from an idle one", () => {
    const stage = buildCargoTideStage(
      [dock("ethereum")],
      [ship("busy-coin", [["ethereum", 1]])],
      payload([coin("busy-coin", 0, 4_000_000, 4_000_000)]),
    );

    expect(tideOf(stage.docks, "ethereum")).toMatchObject({
      direction: "flat",
      pressureScore: 0,
      tracked: true,
    });
  });

  it("carries the fleet gauge including flight to quality", () => {
    const flows = payload([coin("mint-coin", 2_000_000, 3_000_000, 1_000_000)]);
    flows.gauge.flightToQuality = true;
    flows.gauge.flightIntensity = 42;

    const stage = buildCargoTideStage(
      [dock("ethereum")],
      [ship("mint-coin", [["ethereum", 1]])],
      flows,
    );

    expect(stage.fleetIssuance).toMatchObject({
      activeCoins: 1,
      band: "EXPANDING",
      direction: "minting",
      flightIntensity: 42,
      flightToQuality: true,
      scopeChainIds: ["ethereum", "arbitrum"],
    });
  });

  it("is deterministic across repeated builds of identical inputs", () => {
    const build = () => buildCargoTideStage(
      [dock("ethereum"), dock("arbitrum")],
      [ship("split-coin", [["ethereum", 0.6], ["arbitrum", 0.4]])],
      payload([coin("split-coin", 1_234_567, 2_000_000, 765_433)]),
    );

    expect(build().docks.map((entry) => entry.cargoTide))
      .toEqual(build().docks.map((entry) => entry.cargoTide));
  });
});
