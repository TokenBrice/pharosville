import type { CollateralQuality, ReportCard } from "@shared/types";
import type { ShipFittings, ShipNode } from "./world-types";

const SEALED_COLLATERAL = new Set<CollateralQuality>(["native", "rwa", "eth-lst"]);

export function deriveShipFittings(reportCard: ReportCard | null | undefined): ShipFittings | undefined {
  if (!reportCard) return undefined;
  const raw = reportCard.rawInputs;
  const capacity = raw.redemptionImmediateCapacityRatio;
  return {
    blacklistStatus: raw.canBeBlacklisted,
    collateralCargo: SEALED_COLLATERAL.has(raw.collateralQuality) ? "sealed" : "mixed",
    collateralQuality: raw.collateralQuality,
    redemptionCapacityRatio: typeof capacity === "number" && Number.isFinite(capacity)
      ? Math.max(0, Math.min(1, capacity))
      : null,
  };
}

function redemptionLevel(profile: ShipFittings | undefined): number {
  const capacity = profile?.redemptionCapacityRatio;
  if (capacity === null || capacity === undefined) return 0;
  if (capacity === 0) return 0;
  if (capacity < 0.34) return 1;
  if (capacity < 0.67) return 2;
  return 3;
}

/** Packed into the existing hull-surface float; zero means wholly unavailable. */
export function shipFittingsCode(profile: ShipFittings | undefined): number {
  if (!profile) return 0;
  const collateral = profile.collateralCargo === "sealed" ? 1 : 2;
  const brand = profile.blacklistStatus === false ? 0 : 1;
  return redemptionLevel(profile) + collateral * 4 + brand * 12;
}

export function shipRedemptionFittingLabel(ship: Pick<ShipNode, "fittings">): string {
  const ratio = ship.fittings?.redemptionCapacityRatio;
  if (ratio === null || ratio === undefined) return "Unavailable — no capacity reading; no lifeboats deployed";
  if (ratio === 0) return "0% immediate capacity — no lifeboats deployed";
  return `${Math.round(ratio * 100)}% immediate capacity — lifeboats swung ${ratio < 0.34 ? "just clear" : ratio < 0.67 ? "partway out" : "fully out"}`;
}

export function shipCollateralFittingLabel(ship: Pick<ShipNode, "fittings">): string {
  const fittings = ship.fittings;
  if (!fittings) return "Unavailable — neutral deck cargo";
  return fittings.collateralCargo === "sealed"
    ? `${fittings.collateralQuality} collateral — sealed treasury chests`
    : `${fittings.collateralQuality} collateral — mixed open crates`;
}

export function shipCustomsFittingLabel(ship: Pick<ShipNode, "fittings">): string {
  const status = ship.fittings?.blacklistStatus;
  if (status === undefined) return "Unavailable — no customs claim marked";
  if (status === false) return "No blacklist authority reported — no customs brand";
  return `${status === true ? "Blacklist authority reported" : `${status} blacklist authority`} — customs brand at the plimsoll mark`;
}

export function shipFittingsLedgerClause(ship: Pick<ShipNode, "fittings">): string {
  return [
    `redemption fitting ${shipRedemptionFittingLabel(ship)}`,
    `collateral cargo ${shipCollateralFittingLabel(ship)}`,
    `customs fitting ${shipCustomsFittingLabel(ship)}`,
  ].join("; ");
}
