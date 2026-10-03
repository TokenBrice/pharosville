import { describe, expect, it } from "vitest";
import type { MintBurnFlowsResponse } from "@shared/types/mint-burn";
import type { DockNode, ShipNode } from "../../world-types";
import { buildCargoTideStage } from "./cargo-tide";
import { makeSourceStatuses } from "../../../__fixtures__/pharosville-world";
import { FULL_COVERAGE, quayAllocationInput, SCENARIOS } from "../../../__fixtures__/data-contract-scenarios";
import { buildPharosVilleWorld } from "../../pharosville-world";

function dock(chainId: string): DockNode {
  return {
    id: `dock.${chainId}`,
    kind: "dock",
    station: { coveId: "fixture-cove", type: "tea-house-quay", shoreBearing: 0 },
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
    coverage: { ...FULL_COVERAGE },
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
    windowHours: 24,
    ...(scopeChainIds ? { scope: { chainIds: scopeChainIds, label: "Configured issuance chains" } } : {}),
  };
}

const tideOf = (docks: DockNode[], chainId: string) =>
  docks.find((entry) => entry.chainId === chainId)!.cargoTide!;

describe("buildCargoTideStage", () => {
  it("suppresses partial illustrations while retaining exact allocated totals", () => {
    const world = buildPharosVilleWorld(structuredClone(SCENARIOS.partialFlow));
    const tide = world.docks.find((entry) => entry.chainId === "ethereum")!.cargoTide!;
    expect(tide.completeWindow).toBe(false);
    expect(world.docks.reduce((sum, dock) => sum + dock.cargoTide!.mintVolumeUsd, 0)).toBeCloseTo(100_000_000);
    expect(world.docks.reduce((sum, dock) => sum + dock.cargoTide!.netFlowUsd, 0)).toBeCloseTo(100_000_000);
    expect(tide.evidence.coverage.state).toBe("partial");
  });
  it("names the direction from the sign of the allocated net flow", () => {
    const stage = buildCargoTideStage([dock("ethereum"), dock("arbitrum")],
    [ship("mint-coin", [["ethereum", 1]]), ship("burn-coin", [["arbitrum", 1]])],
    payload([
      coin("mint-coin", 8_000_000, 10_000_000, 2_000_000),
      coin("burn-coin", -3_000_000, 1_000_000, 4_000_000),
    ]), makeSourceStatuses().mintBurn);

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
    const stage = buildCargoTideStage([dock("ethereum"), dock("arbitrum")],
    [ship("split-coin", [["ethereum", 0.75], ["arbitrum", 0.25]])],
    payload([coin("split-coin", 8_000_000, 8_000_000, 0)]), makeSourceStatuses().mintBurn);

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
    const stage = buildCargoTideStage([dock("ethereum"), dock("solana")],
    [ship("wide-coin", [["solana", 0.8], ["ethereum", 0.2]])],
    payload([coin("wide-coin", 5_000_000, 5_000_000, 0)]), makeSourceStatuses().mintBurn);

    expect(tideOf(stage.docks, "ethereum").netFlowUsd).toBeCloseTo(5_000_000);
  });

  it("a harbour's allocation is unchanged when another harbour is hidden", () => {
    const full = buildPharosVilleWorld(quayAllocationInput());
    const subset = buildPharosVilleWorld(quayAllocationInput(["ethereum"]));
    const before = tideOf(full.docks, "ethereum");
    const after = tideOf(subset.docks, "ethereum");
    expect(before).toMatchObject({
      tracked: true, mintVolumeUsd: 4_800_000, burnVolumeUsd: 2_400_000, netFlowUsd: 2_400_000,
    });
    expect(after.mintVolumeUsd).toBe(before.mintVolumeUsd);
    expect(after.burnVolumeUsd).toBe(before.burnVolumeUsd);
    expect(after.netFlowUsd).toBe(before.netFlowUsd);
    expect(subset.fleetIssuance!.unattributed!.byReason["unrendered harbour"]).toBe(4_800_000);
  });

  it("allocation plus unattributed equals raw gross", () => {
    for (const rendered of [["ethereum", "arbitrum"], ["ethereum"], ["arbitrum"], []]) {
      const input = quayAllocationInput(rendered);
      const world = buildPharosVilleWorld(input);
      const allocatedGross = world.docks.reduce((sum, dock) =>
        sum + dock.cargoTide!.mintVolumeUsd + dock.cargoTide!.burnVolumeUsd, 0);
      const unattributed = world.fleetIssuance!.unattributed!;
      expect(allocatedGross + unattributed.grossUsd).toBeCloseTo(22_000_000);
      expect(Object.values(unattributed.byReason).reduce((sum, value) => sum + value, 0))
        .toBeCloseTo(unattributed.grossUsd);
      expect(unattributed.byReason["outside the reported scope"]).toBe(4_000_000);
      expect(unattributed.byReason["no chain presence"]).toBe(6_000_000);
      expect(world.fleetIssuance).toMatchObject({
        mintVolumeUsd: 16_000_000, burnVolumeUsd: 6_000_000, netFlowUsd: 10_000_000,
      });
      for (const row of input.mintBurn!.coins) {
        const issuance = world.ships.find((ship) => ship.id === row.stablecoinId)!.issuance!;
        expect(issuance.mintVolumeUsd).toBe(row.mintVolume24hUsd);
        expect(issuance.burnVolumeUsd).toBe(row.burnVolume24hUsd);
        expect(issuance.netFlow24hUsd).toBe(row.netFlow24hUsd);
      }
    }
  });

  it("a coin present only on unrendered chains is counted as unattributed with its reason", () => {
    const input = quayAllocationInput(["ethereum"]);
    input.mintBurn!.coins = [input.mintBurn!.coins[0]!];
    input.stablecoins!.peggedAssets[0]!.chainCirculating = {
      Arbitrum: { current: 1_000_000_000, circulatingPrevDay: 1_000_000_000, circulatingPrevWeek: 1_000_000_000, circulatingPrevMonth: 1_000_000_000 },
    };
    const world = buildPharosVilleWorld(input);
    expect(world.fleetIssuance!.unattributed).toMatchObject({
      grossUsd: 12_000_000,
      byReason: { "unrendered harbour": 12_000_000, "outside the reported scope": 0, "no chain presence": 0 },
    });
    // Its known home is elsewhere, so hiding that harbour must not falsify this zero.
    expect(tideOf(world.docks, "ethereum")).toMatchObject({
      tracked: true, direction: "inactive", mintVolumeUsd: 0, burnVolumeUsd: 0,
    });
  });

  it("retains unattributed gross with the issuance source's held or partial qualification", () => {
    for (const qualification of ["held", "partial"] as const) {
      const input = quayAllocationInput(["ethereum"]);
      if (qualification === "held") input.freshness!.mintBurn = {
        ...input.freshness!.mintBurn, state: "stale", reason: "Refresh failed",
      };
      else input.mintBurn!.coins[0]!.coverage = { ...FULL_COVERAGE, has24hWindow: false, isPartial: true };
      const world = buildPharosVilleWorld(input);
      expect(world.fleetIssuance!.unattributed!.grossUsd).toBe(14_800_000);
      const evidence = world.fleetIssuance!.unattributed!.evidence;
      expect(qualification === "held" ? evidence.state : evidence.coverage.state)
        .toBe(qualification === "held" ? "stale" : "partial");
    }
  });

  it("reports an out-of-scope harbour as unmeasured rather than as calm", () => {
    // Zero and "not measured" are opposite claims. A quiet quay that means the
    // latter must say so, or the world is asserting something it never checked.
    const stage = buildCargoTideStage([dock("ethereum"), dock("solana")],
    [ship("mint-coin", [["ethereum", 1]])],
    payload([coin("mint-coin", 1_000_000, 1_000_000, 0)]), makeSourceStatuses().mintBurn);

    expect(tideOf(stage.docks, "solana")).toMatchObject({
      netFlowUsd: 0,
      reason: "chain-not-in-scope",
      tracked: false,
    });
  });

  it("reports every harbour as unmeasured when no payload landed", () => {
    const stage = buildCargoTideStage([dock("ethereum")], [], null, makeSourceStatuses().mintBurn);

    expect(tideOf(stage.docks, "ethereum")).toMatchObject({
      reason: "no-flow-data",
      tracked: false,
    });
    expect(stage.fleetIssuance).toBeNull();
  });

  it("reports every harbour as unmeasured when the payload will not say where it looked", () => {
    const stage = buildCargoTideStage([dock("ethereum")],
    [ship("mint-coin", [["ethereum", 1]])],
    payload([coin("mint-coin", 1_000_000, 1_000_000, 0)], null), makeSourceStatuses().mintBurn);

    expect(tideOf(stage.docks, "ethereum")).toMatchObject({
      reason: "scope-unreported",
      tracked: false,
    });
    // The fleet reading survives — it needed no per-harbour attribution.
    expect(stage.fleetIssuance?.netFlowUsd).toBe(1_000_000);
    expect(stage.fleetIssuance!.unattributed).toBeNull();
    expect(tideOf(stage.docks, "ethereum").unattributed).toBeNull();
  });

  it("separates a tracked harbour that saw no issuance from one that is not tracked", () => {
    const stage = buildCargoTideStage([dock("ethereum")],
    [ship("idle-coin", [["ethereum", 1]])],
    payload([coin("idle-coin", 0, 0, 0)]), makeSourceStatuses().mintBurn);

    expect(tideOf(stage.docks, "ethereum")).toMatchObject({
      direction: "inactive",
      reason: "tracked",
      tracked: true,
    });
  });

  it("refuses to call a harbour idle while material issuance it cannot place exists", () => {
    // The cardinal sin: a coin minting $400M carries an id no ship holds (an
    // id-namespace mismatch, a frozen coin, a listing gap), so its flow lands
    // nowhere — and the quay it may well have landed at would otherwise swear
    // to a measured quiet day it never observed.
    const stage = buildCargoTideStage([dock("ethereum")],
    [ship("known-coin", [["ethereum", 1]])],
    payload([coin("unknown-coin", 400_000_000, 400_000_000, 0)]), makeSourceStatuses().mintBurn);

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
    const stage = buildCargoTideStage([dock("ethereum"), dock("arbitrum")],
    [ship("known-coin", [["ethereum", 1]])],
    payload([
      coin("known-coin", 2_000_000, 2_000_000, 0),
      coin("unknown-coin", 9_000_000, 9_000_000, 0),
    ]), makeSourceStatuses().mintBurn);

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
    const stage = buildCargoTideStage([dock("ethereum"), dock("arbitrum")],
    [ship("mint-coin", [["ethereum", 1]]), ship("idle-coin", [["arbitrum", 1]])],
    payload([coin("mint-coin", 1_000_000, 1_000_000, 0), coin("idle-coin", 0, 0, 0)]), makeSourceStatuses().mintBurn);

    expect(tideOf(stage.docks, "arbitrum")).toMatchObject({
      direction: "inactive",
      reason: "tracked",
      tracked: true,
    });
  });

  it("lets a trace of unplaceable flow stand beside an otherwise sound calm", () => {
    // The over-correction this guards, and the shape of the real feeds: the two
    // payloads never share a universe, so a few dust-sized wrappers are always
    // beyond placement — $8M against a $2B day, 0.4%, which is what production
    // actually looks like. Silencing every calm quay over that residue trades a
    // narrow wrong number for a permanent refusal to read, which is worse.
    const stage = buildCargoTideStage([dock("ethereum"), dock("arbitrum")],
    [ship("major-coin", [["ethereum", 1]])],
    payload([
      coin("major-coin", 0, 1_000_000_000, 1_000_000_000),
      coin("dust-wrapper", 8_000_000, 8_000_000, 0),
    ]), makeSourceStatuses().mintBurn);

    expect(tideOf(stage.docks, "arbitrum")).toMatchObject({
      direction: "inactive",
      reason: "tracked",
      tracked: true,
    });
  });

  it("silences a calm harbour once unplaceable flow grows to a harbour's worth", () => {
    // The same fleet as above with the unplaceable share pushed past one percent
    // — the size of a real quay's day. Now the flow could have BEEN Arbitrum's
    // tide, so Arbitrum may no longer call itself observed.
    const stage = buildCargoTideStage([dock("ethereum"), dock("arbitrum")],
    [ship("major-coin", [["ethereum", 1]])],
    payload([
      coin("major-coin", 0, 1_000_000_000, 1_000_000_000),
      coin("big-unplaceable", 60_000_000, 60_000_000, 0),
    ]), makeSourceStatuses().mintBurn);

    expect(tideOf(stage.docks, "arbitrum")).toMatchObject({
      reason: "unattributed",
      tracked: false,
    });
    // Ethereum measured its own issuance, so the doubt does not reach it.
    expect(tideOf(stage.docks, "ethereum").tracked).toBe(true);
  });

  it("counts a ship that states no chain presence as flow it cannot place", () => {
    // The commonest real cause, ahead of a missing ship entirely: the hull is in
    // the fleet but its chain-level supply is absent, so `chainPresence` is empty
    // and the world knows the coin moved without knowing where.
    const stage = buildCargoTideStage([dock("ethereum"), dock("arbitrum")],
    [ship("placed-coin", [["ethereum", 1]]), ship("no-presence-coin", [])],
    payload([
      coin("placed-coin", 1_000_000, 1_000_000, 0),
      coin("no-presence-coin", 400_000_000, 400_000_000, 0),
    ]), makeSourceStatuses().mintBurn);

    expect(tideOf(stage.docks, "arbitrum")).toMatchObject({
      reason: "unattributed",
      tracked: false,
    });
  });

  it("holds a balanced harbour apart from an idle one", () => {
    const stage = buildCargoTideStage([dock("ethereum")],
    [ship("busy-coin", [["ethereum", 1]])],
    payload([coin("busy-coin", 0, 4_000_000, 4_000_000)]), makeSourceStatuses().mintBurn);

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

    const stage = buildCargoTideStage([dock("ethereum")],
    [ship("mint-coin", [["ethereum", 1]])],
    flows, makeSourceStatuses().mintBurn);

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
    const build = () => buildCargoTideStage([dock("ethereum"), dock("arbitrum")],
    [ship("split-coin", [["ethereum", 0.6], ["arbitrum", 0.4]])],
    payload([coin("split-coin", 1_234_567, 2_000_000, 765_433)]), makeSourceStatuses().mintBurn);

    expect(build().docks.map((entry) => entry.cargoTide))
      .toEqual(build().docks.map((entry) => entry.cargoTide));
  });
});

describe("buildCargoTideStage scope chain-id boundary (L13)", () => {
  it("tracks a canonical harbour under an aliased scope id instead of darkening its tide", () => {
    // The docks carry the canonical ids the scaffold boundary normalized to;
    // the mint-burn scope arrives in the payload's own raw upstream
    // vocabulary. Before this join canonicalised, `hyperliquid-l1` marked the
    // `hyperliquid` quay chain-not-in-scope and darkened its cargo tide — the
    // one real bypass of the scaffold boundary.
    const stage = buildCargoTideStage([dock("hyperliquid")],
    [ship("usdc-circle", [["hyperliquid", 1]])],
    payload([coin("usdc-circle", 8_000_000, 8_000_000, 0)], ["hyperliquid-l1"]), makeSourceStatuses().mintBurn);

    expect(tideOf(stage.docks, "hyperliquid")).toMatchObject({
      direction: "minting",
      netFlowUsd: 8_000_000,
      reason: "tracked",
      tracked: true,
    });
  });

  it("keeps an unrecognised scope id raw so an unlisted chain's quay stays measured", () => {
    // Same rule, same fallback as the scaffold boundary: `resolveChainId`
    // returns null outside CHAIN_META, and dropping such ids would silently
    // narrow the payload's scope and untrack a harbour it did report on.
    const stage = buildCargoTideStage([dock("unknown-issuance-chain")],
    [ship("usdc-circle", [["unknown-issuance-chain", 1]])],
    payload([coin("usdc-circle", -3_000_000, 1_000_000, 4_000_000)], ["unknown-issuance-chain"]), makeSourceStatuses().mintBurn);

    expect(tideOf(stage.docks, "unknown-issuance-chain")).toMatchObject({
      direction: "burning",
      netFlowUsd: -3_000_000,
      reason: "tracked",
      tracked: true,
    });
  });
});
