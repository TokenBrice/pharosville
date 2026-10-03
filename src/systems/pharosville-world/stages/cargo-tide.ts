import { resolveChainId } from "@shared/lib/chains";
import {
  getLiteralMintingPressureScore,
  getNetFlowDirection24h,
} from "@shared/lib/mint-burn-signals";
import type { MintBurnFlowsResponse } from "@shared/types/mint-burn";
import type { DockCargoTide, DockNode, FleetIssuance, PharosVilleSourceStatus, ShipNode, UnattributedIssuance } from "../../world-types";
import { observationEpochMs, rowSourceEvidence } from "../../source-evidence";
import type { CargoTideStage } from "../pipeline-types";

export const CARGO_TIDE_SLOTS = 6;

/** Current complete estimated activity, within the existing per-harbour slots. */
export function cargoTideCrateCount(tide: DockCargoTide | undefined): number {
  if (!tide?.tracked || !tide.completeWindow || tide.evidence.state !== "current") return 0;
  if (tide.direction === "flat") return tide.mintVolumeUsd + tide.burnVolumeUsd > 0 ? 2 : 0;
  if (tide.direction !== "minting" && tide.direction !== "burning") return 0;
  const pressure = Math.abs(tide.pressureScore ?? 0) / 100;
  return Math.max(1, Math.min(CARGO_TIDE_SLOTS, Math.round(pressure * CARGO_TIDE_SLOTS)));
}

/** Shared baked key: new publication times cannot rebuild identical crates. */
export function cargoTideVisualState(tide: DockCargoTide | undefined): string | null {
  const count = cargoTideCrateCount(tide);
  return count > 0 ? `${tide!.direction}:${count}` : null;
}

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
 * Flow is split by held-supply shares across the payload's own reported scope,
 * independently of which harbours render. An in-scope share on an unrendered
 * chain stays unattributed rather than inflating the remaining quays. Together,
 * rendered allocations and unattributed gross reproduce the raw fleet gross.
 *
 * A harbour on a chain OUTSIDE that scope is not given a quiet zero. Zero and
 * "issuance is not measured here" are opposite claims, and the world must not
 * let them look alike — `tracked: false` carries a reason, and the DOM prints
 * it rather than a number.
 *
 * The same rule governs flow the world cannot PLACE. A coin whose id carries no
 * ship — frozen, unlisted, or an id-namespace mismatch between the two feeds —
 * has issuance the world cannot attribute to any quay. "This coin does not sit
 * at this harbour" is knowledge the fleet holds; "we do not know where this coin
 * sits" is not, and only the second one makes a harbour's empty accumulator an
 * unverified claim. So an in-scope harbour that received NO allocation, while
 * issuance the world could not place is MATERIAL, reports `unattributed` rather
 * than a measured calm — a whole-fleet id mismatch turns every quay untracked
 * instead of having all of them swear to a quiet day the world never observed.
 *
 * ## Why the bar is materiality and not existence
 *
 * The two feeds do not share a universe, and they never will. `/api/mint-burn-flows`
 * tracks its own coin set; the fleet renders a curated registry minus frozen
 * hulls, and a ship states no chain presence at all when its chain-level supply
 * is missing. So a handful of coins are unplaceable on any ordinary day — ten of
 * thirty-seven active ones at the time of writing, carrying 0.44% of the day's
 * gross flow, nearly all of them Ethereum-native yield wrappers.
 *
 * Gating on the mere EXISTENCE of such flow therefore does not protect a rare
 * case; it fires almost always, and it converts a narrow false "measured zero"
 * into a near-permanent "no reading at all". That is not the safe direction to
 * fail in. A quay that reports nothing is just as much a lie as a quay that
 * reports a wrong number, and it is the more visible one.
 *
 * What actually disqualifies a calm reading is whether the unplaced flow is big
 * enough to have BEEN that reading had it landed here. So the doubt is weighed
 * by volume against the flow the world did measure, and only a material share
 * silences the quay. A trace of unattributable residue leaves an otherwise
 * sound reading standing; an id-namespace break, which puts most of the day's
 * flow beyond placement, still silences every calm quay it should.
 */

/** Net flows below this are rounding residue from the share allocation, not a tide. */
const FLAT_NET_FLOW_USD = 1;

/**
 * How much of the day's measured flow may be beyond placement before a calm
 * quay stops being a measurement.
 *
 * One percent is the size of a real harbour's day, not a rounding error: at the
 * time of writing Arbitrum's whole allocated reading is 1.03% of the fleet's
 * gross flow. So doubt worth a full percent could have been an entire quay's
 * tide, and a harbour must not call that quiet; doubt below it could not have
 * moved any reading the world is showing. It also sits well clear of the ~0.44%
 * of residue the two feeds disagree about on an ordinary day, so the quays do
 * not flicker between measured and unmeasured as that residue breathes.
 */
const MATERIAL_UNATTRIBUTED_SHARE = 0.01;

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

function untrackedTide(
  reason: DockCargoTide["reason"],
  evidence: PharosVilleSourceStatus,
  unattributed: UnattributedIssuance | null,
): DockCargoTide {
  return {
    burnVolumeUsd: 0,
    coinCount: 0,
    direction: "inactive",
    mintVolumeUsd: 0,
    netFlowUsd: 0,
    pressureScore: null,
    reason,
    tracked: false,
    completeWindow: false, evidence,
    unattributed,
  };
}

function settleTide(
  totals: TideAccumulator,
  evidence: PharosVilleSourceStatus,
  unattributed: UnattributedIssuance,
): DockCargoTide {
  const gross = totals.mintVolumeUsd + totals.burnVolumeUsd;
  const netFlowUsd = Math.abs(totals.netFlowUsd) < FLAT_NET_FLOW_USD ? 0 : totals.netFlowUsd;
  return {
    burnVolumeUsd: totals.burnVolumeUsd,
    coinCount: totals.coinCount,
    direction: getNetFlowDirection24h({ has24hActivity: gross > 0, netFlow24hUsd: netFlowUsd }),
    mintVolumeUsd: totals.mintVolumeUsd,
    netFlowUsd: totals.netFlowUsd,
    pressureScore: getLiteralMintingPressureScore({
      burnVolume24hUsd: totals.burnVolumeUsd,
      mintVolume24hUsd: totals.mintVolumeUsd,
    }),
    reason: "tracked",
    tracked: true,
    completeWindow: evidence.coverage.state === "complete" && evidence.coverage.windowHours === 24,
    evidence,
    unattributed,
  };
}

function buildFleetIssuance(
  mintBurn: MintBurnFlowsResponse,
  unattributed: UnattributedIssuance | null,
): FleetIssuance {
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
    unattributed,
  };
}

export function buildCargoTideStage(
  docks: readonly DockNode[],
  ships: readonly ShipNode[],
  mintBurn: MintBurnFlowsResponse | null | undefined,
  status: PharosVilleSourceStatus,
): CargoTideStage {
  const completeWindow = mintBurn?.windowHours === 24 && mintBurn.coins.length > 0
    && mintBurn.coins.every((coin) => coin.coverage?.has24hWindow === true && !coin.coverage.isPartial);
  const evidence = rowSourceEvidence("mintBurn", {
    ...status, publishedAt: observationEpochMs(mintBurn?.updatedAt) ?? status.publishedAt,
  }, {
    available: !!mintBurn, observedAt: null, methodologyVersion: status.methodologyVersion,
    coverage: {
      state: completeWindow ? "complete" : mintBurn?.coins.some((coin) => coin.coverage) ? "partial" : "unknown",
      ...(mintBurn?.windowHours !== undefined ? { windowHours: mintBurn.windowHours } : {}),
      ...(mintBurn?.scope?.label ? { scopeLabel: mintBurn.scope.label } : {}),
    },
    reason: completeWindow ? null : "Issuance history incomplete or unknown",
  });
  // No payload, or a payload that will not say where it looked: every harbour
  // reports untracked rather than calm. See the note above on zero vs unmeasured.
  const scopeChainIds = mintBurn?.scope?.chainIds;
  if (!mintBurn || !scopeChainIds?.length) {
    const reason: DockCargoTide["reason"] = mintBurn ? "scope-unreported" : "no-flow-data";
    return {
      docks: docks.map((dock) => ({ ...dock, cargoTide: untrackedTide(reason, evidence, null) })),
      fleetIssuance: mintBurn ? buildFleetIssuance(mintBurn, null) : null,
    };
  }

  // The scope arrives in the payload's raw upstream vocabulary, while every
  // dock below carries the canonical id the scaffold boundary normalized to.
  // An aliased scope (`hyperliquid-l1` where the dock says `hyperliquid`)
  // would mark that harbour untracked and darken its tide, so these ids
  // canonicalise too — same rule, same fallback: an id `resolveChainId` does
  // not recognise passes through raw rather than silently narrowing the scope.
  const scope = new Set(scopeChainIds.map((chainId) => resolveChainId(chainId) ?? chainId));
  // Rendering chooses recipients, never the denominator over the reported scope.
  const trackedChainIds = new Set(
    docks.map((dock) => dock.chainId).filter((chainId) => scope.has(chainId)),
  );

  const totalsByChainId = new Map<string, TideAccumulator>();
  for (const chainId of trackedChainIds) totalsByChainId.set(chainId, emptyAccumulator());

  const shipById = new Map(ships.map((ship) => [ship.id, ship]));
  const unattributed: UnattributedIssuance = {
    grossUsd: 0,
    byReason: { "unrendered harbour": 0, "outside the reported scope": 0, "no chain presence": 0 },
    evidence,
  };
  let measuredGrossUsd = 0;
  for (const coin of mintBurn.coins) {
    if (!coinHasActivity(coin)) continue;
    const grossUsd = coin.mintVolume24hUsd + coin.burnVolume24hUsd;
    measuredGrossUsd += grossUsd;
    const chainPresence = shipById.get(coin.stablecoinId)?.chainPresence;
    if (!chainPresence?.length) {
      unattributed.grossUsd += grossUsd;
      unattributed.byReason["no chain presence"] += grossUsd;
      continue;
    }
    let scopedShare = 0;
    for (const presence of chainPresence) {
      if (scope.has(presence.chainId)) scopedShare += presence.share;
    }
    if (scopedShare <= 0) {
      unattributed.grossUsd += grossUsd;
      unattributed.byReason["outside the reported scope"] += grossUsd;
      continue;
    }
    for (const presence of chainPresence) {
      if (!scope.has(presence.chainId) || presence.share <= 0) continue;
      const weight = presence.share / scopedShare;
      const totals = totalsByChainId.get(presence.chainId);
      if (!totals) {
        const unrenderedGrossUsd = grossUsd * weight;
        unattributed.grossUsd += unrenderedGrossUsd;
        unattributed.byReason["unrendered harbour"] += unrenderedGrossUsd;
        continue;
      }
      totals.burnVolumeUsd += coin.burnVolume24hUsd * weight;
      totals.coinCount += 1;
      totals.mintVolumeUsd += coin.mintVolume24hUsd * weight;
      totals.netFlowUsd += coin.netFlow24hUsd * weight;
    }
  }

  // The doubt is fleet-wide because the flow it covers has no known home: it
  // could have landed at any quay, so it hangs equally over every one that
  // reports calm. Only harbours with nothing of their own to show are exposed to
  // it — a quay that measured its own issuance stands on that measurement.
  const calmIsUnverifiable =
    measuredGrossUsd > 0 && unattributed.byReason["no chain presence"] / measuredGrossUsd >= MATERIAL_UNATTRIBUTED_SHARE;

  return {
    docks: docks.map((dock) => {
      const totals = totalsByChainId.get(dock.chainId);
      if (!totals) return { ...dock, cargoTide: untrackedTide("chain-not-in-scope", evidence, unattributed) };
      // An empty accumulator only means "nothing was issued here" when the flow
      // the fleet could not place is too small to have been this quay's tide.
      // Above that bar the silence is unverified, and unverified must not print
      // as measured.
      const unverifiableCalm = totals.coinCount === 0 && calmIsUnverifiable;
      return {
        ...dock,
        cargoTide: unverifiableCalm ? untrackedTide("unattributed", evidence, unattributed) : settleTide(totals, evidence, unattributed),
      };
    }),
    fleetIssuance: buildFleetIssuance(mintBurn, unattributed),
  };
}
