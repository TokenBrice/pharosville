import type { PegSummaryCoin, StablecoinData, StablecoinMeta, StressSignalEntry } from "@shared/types";
import type { PharosVilleFreshness, PlacementEvidence, ShipRiskPlacement } from "./world-types";
import { dewsAreaPlacementForBand } from "./risk-water-areas";

// Severity rank for cross-placement comparison. The DEWS continuum maps to ranks
// 1-5 (CALM → DANGER) per the band ordering in `risk-water-areas.ts`.
// `ledger-mooring` is ranked below CALM because it is the navToken routing track,
// outside the DEWS gradient — a navToken-only consort never out-stricts a flagship
// in any DEWS placement, which is the intended Maker-squad invariant.
const PLACEMENT_SEVERITY: Record<ShipRiskPlacement, number> = {
  "storm-shelf": 5,
  "outer-rough-water": 4,
  "harbor-mouth-watch": 3,
  "breakwater-edge": 2,
  "safe-harbor": 1,
  "ledger-mooring": 0,
};

export function isStricterPlacement(a: ShipRiskPlacement, b: ShipRiskPlacement): boolean {
  return PLACEMENT_SEVERITY[a] > PLACEMENT_SEVERITY[b];
}

export interface RiskPlacementInput {
  asset: StablecoinData;
  meta: StablecoinMeta;
  pegCoin: PegSummaryCoin | undefined;
  stress: StressSignalEntry | undefined;
  freshness: PharosVilleFreshness;
}

function evidence(reason: string, sourceFields: string[], stale = false): PlacementEvidence {
  return { reason, sourceFields, stale };
}

function deviationPlacement(absBps: number): ShipRiskPlacement | null {
  if (absBps >= 500) return "storm-shelf";
  if (absBps >= 200) return "outer-rough-water";
  if (absBps >= 50) return "harbor-mouth-watch";
  return null;
}

export function resolveShipRiskPlacement(input: RiskPlacementInput): {
  placement: ShipRiskPlacement;
  evidence: PlacementEvidence;
} {
  const { asset, meta, pegCoin, stress, freshness } = input;
  const navSourceFields = ["meta.flags.navToken"];
  if (pegCoin) navSourceFields.push("pegSummary.coins[]");
  else navSourceFields.push("pegSummary.coins");
  if (stress) navSourceFields.push("stress.signals[]");
  const navStale = (pegCoin?.activeDepeg === true && freshness.pegSummaryStale === true)
    || (!!stress && freshness.stressStale === true);

  if (pegCoin?.activeDepeg && !freshness.pegSummaryStale) {
    return {
      placement: "storm-shelf",
      evidence: evidence("Active depeg event", ["pegSummary.coins[].activeDepeg"]),
    };
  }

  const currentDeviation = pegCoin?.currentDeviationBps ?? null;
  if (currentDeviation != null && !freshness.pegSummaryStale) {
    const placement = deviationPlacement(Math.abs(currentDeviation));
    if (placement) {
      return {
        placement,
        evidence: evidence("Current peg deviation", ["pegSummary.coins[].currentDeviationBps"]),
      };
    }
  }

  if (stress && !freshness.stressStale) {
    const placement = dewsAreaPlacementForBand(stress.band);
    if (placement) {
      return {
        placement,
        evidence: evidence("DEWS stress escalation", ["stress.signals[id].band"]),
      };
    }
  }

  if (meta.flags.navToken) {
    return {
      placement: "ledger-mooring",
      evidence: evidence("NAV token Ledger Mooring idle preference", navSourceFields, navStale),
    };
  }

  if (pegCoin?.activeDepeg && freshness.pegSummaryStale) {
    return {
      placement: "safe-harbor",
      evidence: evidence("Active depeg evidence is stale", ["pegSummary.coins[].activeDepeg", "freshness.pegSummaryStale"], true),
    };
  }

  if (!pegCoin || asset.price == null || asset.priceConfidence === "low") {
    return {
      placement: "safe-harbor",
      evidence: evidence("Missing or low-confidence price evidence", ["pegSummary.coins", "stablecoins.price", "stablecoins.priceConfidence"], true),
    };
  }

  if (freshness.pegSummaryStale || freshness.stressStale) {
    return {
      placement: "safe-harbor",
      evidence: evidence("Risk evidence is stale", ["freshness.pegSummaryStale", "freshness.stressStale"], true),
    };
  }

  return {
    placement: "safe-harbor",
    evidence: evidence("No active peg or DEWS stress", ["pegSummary.coins", "stress.signals"]),
  };
}
