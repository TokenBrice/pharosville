import {
  getLiteralMintingPressureScore,
  getNetFlowDirection24h,
} from "@shared/lib/mint-burn-signals";
import type { MintBurnFlowsResponse } from "@shared/types/mint-burn";
import type { DockCargoTide, DockNode, FleetIssuance, ShipNode } from "../../world-types";
import type { CargoTideStage } from "../pipeline-types";

/**
 * The mint/burn cargo tide — the world's first FLOW signal.
 *
 * Every other feed the harbour reads is a STOCK: how much supply exists, which
 * chain it sits on, how far off par it trades. None of them can answer the
 * question the asset class actually turns on — is supply being CREATED or
 * DESTROYED right now. `/api/mint-burn-flows` answers it, and until now the app
 * never asked.
 *
 * ## Attribution, and why it is not a free choice
 *
 * The payload is per-COIN, not per-chain: `coins[].netFlow24hUsd` is one
 * stablecoin's 24h issuance measured across the whole tracked scope. Harbours
 * are chains. Getting from one to the other honestly is the whole difficulty
 * here, and there are two ways to get it wrong:
 *
 * - Summing each coin's flow into every harbour it appears at DOUBLE-COUNTS.
 *   USDC would mint its full net flow at Ethereum, at Base, and at Arbitrum
 *   simultaneously, and the harbours would sum to several times the fleet total.
 * - Attributing a coin's whole flow to one "home" harbour puts issuance that
 *   happened on Ethereum onto a Solana quay whenever a coin's largest supply
 *   sits somewhere the issuance did not.
 *
 * So the flow is ALLOCATED: split across the harbours where that coin's supply
 * actually sits, in proportion to how much sits at each, and renormalised over
 * the tracked scope only. `scope.chainIds` is the payload's own statement of
 * which chains issuance was observed on (`["ethereum", "arbitrum"]` at the time
 * of writing), so a coin's flow is divided only among tracked harbours where it
 * has supply. Summed over every tracked harbour, the allocation reproduces the
 * fleet's own net flow for exactly the coins that have any tracked presence.
 *
 * A harbour on a chain OUTSIDE that scope is not given a quiet zero. Zero and
 * "issuance is not measured here" are opposite claims, and the world must not
 * let them look alike — `tracked: false` carries a reason, and the DOM prints
 * it rather than a number.
 */

/** Net flows below this are rounding residue from the share allocation, not a tide. */
const FLAT_NET_FLOW_USD = 1;

function coinHasActivity(coin: MintBurnFlowsResponse["coins"][number]): boolean {
  return coin.has24hActivity ?? (coin.mintVolume24hUsd + coin.burnVolume24hUsd > 0);
}

interface TideAccumulator {
  burnVolumeUsd: number;
  coinCount: number;
  mintVolumeUsd: number;
  netFlowUsd: number;
}

function emptyAccumulator(): TideAccumulator {
  return { burnVolumeUsd: 0, coinCount: 0, mintVolumeUsd: 0, netFlowUsd: 0 };
}

function untrackedTide(reason: DockCargoTide["reason"]): DockCargoTide {
  return {
    burnVolumeUsd: 0,
    coinCount: 0,
    direction: "inactive",
    mintVolumeUsd: 0,
    netFlowUsd: 0,
    pressureScore: null,
    reason,
    tracked: false,
  };
}

function settleTide(totals: TideAccumulator): DockCargoTide {
  const gross = totals.mintVolumeUsd + totals.burnVolumeUsd;
  const netFlowUsd = Math.abs(totals.netFlowUsd) < FLAT_NET_FLOW_USD ? 0 : totals.netFlowUsd;
  return {
    burnVolumeUsd: totals.burnVolumeUsd,
    coinCount: totals.coinCount,
    direction: getNetFlowDirection24h({ has24hActivity: gross > 0, netFlow24hUsd: netFlowUsd }),
    mintVolumeUsd: totals.mintVolumeUsd,
    netFlowUsd,
    pressureScore: getLiteralMintingPressureScore({
      burnVolume24hUsd: totals.burnVolumeUsd,
      mintVolume24hUsd: totals.mintVolumeUsd,
    }),
    reason: "tracked",
    tracked: true,
  };
}

function buildFleetIssuance(mintBurn: MintBurnFlowsResponse): FleetIssuance {
  let burnVolumeUsd = 0;
  let mintVolumeUsd = 0;
  let netFlowUsd = 0;
  let activeCoins = 0;
  for (const coin of mintBurn.coins) {
    if (!coinHasActivity(coin)) continue;
    activeCoins += 1;
    burnVolumeUsd += coin.burnVolume24hUsd;
    mintVolumeUsd += coin.mintVolume24hUsd;
    netFlowUsd += coin.netFlow24hUsd;
  }
  return {
    activeCoins,
    band: mintBurn.gauge.band,
    burnVolumeUsd,
    direction: getNetFlowDirection24h({
      has24hActivity: mintVolumeUsd + burnVolumeUsd > 0,
      netFlow24hUsd: netFlowUsd,
    }),
    flightIntensity: mintBurn.gauge.flightIntensity,
    flightToQuality: mintBurn.gauge.flightToQuality,
    mintVolumeUsd,
    netFlowUsd,
    scopeChainIds: [...(mintBurn.scope?.chainIds ?? [])],
    scopeLabel: mintBurn.scope?.label ?? null,
    score: mintBurn.gauge.score,
    trackedCoins: mintBurn.gauge.trackedCoins,
  };
}

export function buildCargoTideStage(
  docks: readonly DockNode[],
  ships: readonly ShipNode[],
  mintBurn: MintBurnFlowsResponse | null | undefined,
): CargoTideStage {
  // No payload, or a payload that will not say where it looked: every harbour
  // reports untracked rather than calm. See the note above on zero vs unmeasured.
  const scopeChainIds = mintBurn?.scope?.chainIds;
  if (!mintBurn || !scopeChainIds?.length) {
    const reason: DockCargoTide["reason"] = mintBurn ? "scope-unreported" : "no-flow-data";
    return {
      docks: docks.map((dock) => ({ ...dock, cargoTide: untrackedTide(reason) })),
      fleetIssuance: mintBurn ? buildFleetIssuance(mintBurn) : null,
    };
  }

  const scope = new Set(scopeChainIds);
  // Only harbours that are BOTH in the payload's scope and actually rendered can
  // receive an allocation, so the renormalisation below divides by the share the
  // world can really show rather than by a share it cannot draw.
  const trackedChainIds = new Set(
    docks.map((dock) => dock.chainId).filter((chainId) => scope.has(chainId)),
  );

  const totalsByChainId = new Map<string, TideAccumulator>();
  for (const chainId of trackedChainIds) totalsByChainId.set(chainId, emptyAccumulator());

  const shipById = new Map(ships.map((ship) => [ship.id, ship]));
  for (const coin of mintBurn.coins) {
    if (!coinHasActivity(coin)) continue;
    const presences = shipById.get(coin.stablecoinId)?.chainPresence
      .filter((presence) => trackedChainIds.has(presence.chainId)) ?? [];
    const scopedShare = presences.reduce((sum, presence) => sum + presence.share, 0);
    // The coin's issuance was observed, but it holds no supply at any harbour
    // this world draws inside the tracked scope — there is nowhere honest to
    // land it, so it lands nowhere.
    if (scopedShare <= 0) continue;
    for (const presence of presences) {
      const totals = totalsByChainId.get(presence.chainId);
      if (!totals) continue;
      const weight = presence.share / scopedShare;
      totals.burnVolumeUsd += coin.burnVolume24hUsd * weight;
      totals.coinCount += 1;
      totals.mintVolumeUsd += coin.mintVolume24hUsd * weight;
      totals.netFlowUsd += coin.netFlow24hUsd * weight;
    }
  }

  return {
    docks: docks.map((dock) => {
      const totals = totalsByChainId.get(dock.chainId);
      return {
        ...dock,
        cargoTide: totals ? settleTide(totals) : untrackedTide("chain-not-in-scope"),
      };
    }),
    fleetIssuance: buildFleetIssuance(mintBurn),
  };
}
