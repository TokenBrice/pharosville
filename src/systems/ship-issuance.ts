import type { MintBurnCoinFlow, MintBurnFlowsResponse } from "@shared/types/mint-burn";
import { formatCompactUsd } from "../lib/format-detail";
import { nodeSourceEvidenceLabel, observationEpochMs, rowSourceEvidence } from "./source-evidence";
import type { PharosVilleSourceStatus, ShipIssuance, ShipNode } from "./world-types";

/** Prototype thresholds: explicitly uncalibrated, never financial methodology. */
export const ISSUANCE_WORK_MIN_GROSS_USD = 1_000_000;
export const ISSUANCE_WORK_MIN_SUPPLY_SHARE = 0.01;
export const ISSUANCE_WORK_MIN_FLEET_GROSS_SHARE = 0.001;
export const ISSUANCE_OVERVIEW_WORK_LIMIT = 3;

function finiteQuantity(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildShipIssuance(
  coin: MintBurnCoinFlow | null | undefined,
  envelope: MintBurnFlowsResponse,
  status: PharosVilleSourceStatus,
): ShipIssuance | undefined {
  if (!coin) return undefined;
  const net = finiteQuantity(coin.netFlow24hUsd);
  const mint = finiteQuantity(coin.mintVolume24hUsd);
  const burn = finiteQuantity(coin.burnVolume24hUsd);
  const gross = mint === null || burn === null ? null : mint + burn;
  const windowHours = finiteQuantity(envelope.windowHours);
  const coverage = coin.coverage ?? null;
  const completeWindow = windowHours === 24 && coverage?.status === "full" && coverage.has24hWindow && !coverage.isPartial;
  const direction = net === null ? null : net > 0 ? "minting" : net < 0 ? "redeeming" : "flat";
  const activity = net === null || gross === null ? null
    : net > 0 ? "minting" : net < 0 ? "redeeming"
    : gross > 0 ? "balanced-active" : completeWindow ? "inactive" : null;
  const evidence = rowSourceEvidence("mintBurn", {
    ...status, publishedAt: observationEpochMs(envelope.updatedAt) ?? status.publishedAt,
  }, {
    available: net !== null && gross !== null,
    observedAt: null,
    methodologyVersion: status.methodologyVersion,
    coverage: {
      state: completeWindow ? "complete" : coverage ? "partial" : "unknown",
      ...(windowHours !== null ? { windowHours } : {}),
      ...(envelope.scope?.label ? { scopeLabel: envelope.scope.label } : {}),
    },
    reason: completeWindow ? null : coverage ? `Partial history (${coverage.status}); complete 24h window unavailable` : "Window coverage unknown",
  });
  const event = coin.largestEvent24h;
  return {
    activity, direction,
    mintVolumeUsd: mint, burnVolumeUsd: burn, grossVolumeUsd: gross, netFlow24hUsd: net,
    mintCount: finiteQuantity(coin.mintCount24h), burnCount: finiteQuantity(coin.burnCount24h),
    intensity: finiteQuantity(coin.flowIntensity), intensitySemantics: envelope.gauge.intensitySemantics ?? null,
    windowHours, coverage, completeWindow, evidence,
    work: { eligible: false, supplyShare: null, fleetGrossShare: null, overviewRank: null },
    largestEvent24h: event && Number.isFinite(event.amountUsd) && Number.isFinite(event.timestamp)
      ? { amountUsd: event.amountUsd, direction: event.direction, timestamp: event.timestamp } : null,
  };
}

/** Shared membership gate for categorical cargo and supported route intensity. */
export function issuanceHasCurrentWindow(issuance: ShipIssuance | undefined): issuance is ShipIssuance {
  return !!issuance && issuance.evidence.state === "current" && issuance.completeWindow;
}

function materialityShare(gross: number | null, denominator: number | null): number | null {
  if (gross === null || !Number.isFinite(gross) || denominator === null || !Number.isFinite(denominator) || denominator <= 0) return null;
  const share = gross / denominator;
  return Number.isFinite(share) ? share : null;
}

/** A zero, missing or non-finite denominator is not an infinite share. */
export function issuanceWorkMateriality(
  issuance: ShipIssuance,
  supplyUsd: number | null,
  coveredFleetGrossUsd: number | null,
): ShipIssuance["work"] {
  const gross = issuance.grossVolumeUsd;
  const supplyShare = materialityShare(gross, supplyUsd);
  const fleetGrossShare = materialityShare(gross, coveredFleetGrossUsd);
  return {
    eligible: issuanceHasCurrentWindow(issuance) && gross !== null && gross >= ISSUANCE_WORK_MIN_GROSS_USD
      && ((supplyShare !== null && supplyShare >= ISSUANCE_WORK_MIN_SUPPLY_SHARE)
        || (fleetGrossShare !== null && fleetGrossShare >= ISSUANCE_WORK_MIN_FLEET_GROSS_SHARE)),
    supplyShare, fleetGrossShare, overviewRank: null,
  };
}

/** Once per fleet refresh; the denominator covers all current full-window rows. */
export function assignShipIssuanceWork(ships: readonly ShipNode[], readings: ReadonlyMap<string, ShipIssuance>): void {
  let coveredGross = 0;
  for (const issuance of readings.values()) {
    if (issuanceHasCurrentWindow(issuance) && issuance.grossVolumeUsd !== null && Number.isFinite(issuance.grossVolumeUsd)) {
      coveredGross += Math.max(0, issuance.grossVolumeUsd);
    }
  }
  const eligible: ShipNode[] = [];
  for (const ship of ships) {
    if (!ship.issuance) continue;
    ship.issuance.work = issuanceWorkMateriality(ship.issuance, ship.marketCapUsd, coveredGross > 0 ? coveredGross : null);
    if (ship.issuance.work.eligible) eligible.push(ship);
  }
  eligible.sort((a, b) => b.issuance!.grossVolumeUsd! - a.issuance!.grossVolumeUsd! || a.id.localeCompare(b.id));
  for (let index = 0; index < Math.min(ISSUANCE_OVERVIEW_WORK_LIMIT, eligible.length); index += 1) {
    eligible[index]!.issuance!.work.overviewRank = index + 1;
  }
}

/** Only fields that change the lighter composition belong in renderer keys. */
export function shipIssuanceVisualState(issuance: ShipIssuance | undefined): string | null {
  if (!issuanceHasCurrentWindow(issuance) || !issuance.activity || issuance.activity === "inactive") return null;
  return `${issuance.activity}:${issuance.largestEvent24h !== null ? 1 : 0}:${issuance.work.eligible ? 1 : 0}:${issuance.work.overviewRank !== null ? 1 : 0}`;
}

function signedCompactUsd(value: number | null): string {
  if (value === null) return "unavailable";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCompactUsd(Math.abs(value))}`;
}

export function shipIssuanceDetailLabel(ship: Pick<ShipNode, "issuance">): string {
  const issuance = ship.issuance;
  if (!issuance) return "Unavailable — no per-coin mint/redeem row; illustrative, not a transaction";
  const state = issuance.activity === "balanced-active" ? "Balanced active"
    : issuance.activity === "inactive" ? "Inactive — measured zero gross and net"
    : issuance.activity === "minting" ? "Minting"
    : issuance.activity === "redeeming" ? "Redeeming" : "Activity unavailable — incomplete reading";
  const visible = shipIssuanceVisualState(issuance) !== null;
  const cargo = visible ? issuance.activity === "balanced-active" ? "Opposing aboard/ashore cargo"
    : issuance.activity === "minting" ? "Aboard cargo" : "Ashore cargo"
    : "No working cargo — inactive or incomplete, held or unavailable evidence";
  const window = issuance.completeWindow ? `Trailing ${issuance.windowHours}h window; complete coverage`
    : `Partial or unknown coverage; reporting window ${issuance.windowHours === null ? "unknown" : `${issuance.windowHours}h`}; history ${issuance.coverage?.historyStartAt ? new Date(issuance.coverage.historyStartAt * 1_000).toISOString() : "unknown"}`;
  const event = issuance.largestEvent24h;
  return [
    state,
    `mint ${formatCompactUsd(issuance.mintVolumeUsd)} (${issuance.mintCount ?? "unknown"} events), burn ${formatCompactUsd(issuance.burnVolumeUsd)} (${issuance.burnCount ?? "unknown"} events), gross ${formatCompactUsd(issuance.grossVolumeUsd)}, net ${signedCompactUsd(issuance.netFlow24hUsd)}`,
    window,
    cargo,
    `Illustrative work (uncalibrated): ${!issuanceHasCurrentWindow(issuance) ? "qualified evidence; no moving work" : issuance.work.eligible ? "eligible" : issuance.work.supplyShare === null && issuance.work.fleetGrossShare === null ? "unmeasured materiality; static cargo" : "below policy; static cargo"}; own supply share ${issuance.work.supplyShare === null ? "unmeasured" : `${(issuance.work.supplyShare * 100).toFixed(3)}%`}; covered fleet gross share ${issuance.work.fleetGrossShare === null ? "unmeasured" : `${(issuance.work.fleetGrossShare * 100).toFixed(3)}%`}; ${issuance.work.overviewRank === null ? "no overview work slot" : `overview slot ${issuance.work.overviewRank}/${ISSUANCE_OVERVIEW_WORK_LIMIT}`}`,
    `Uncalibrated thresholds: gross floor ${formatCompactUsd(ISSUANCE_WORK_MIN_GROSS_USD)}; either ${ISSUANCE_WORK_MIN_SUPPLY_SHARE * 100}% own supply or ${ISSUANCE_WORK_MIN_FLEET_GROSS_SHARE * 100}% covered fleet gross`,
    nodeSourceEvidenceLabel({ mintBurn: issuance.evidence }),
    `raw intensity ${issuance.intensity ?? "unavailable"}; semantics ${issuance.intensitySemantics ?? "unknown"}`,
    event ? `largest event ${event.direction} ${event.amountUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })} at ${new Date(event.timestamp * 1_000).toISOString()}; ${visible ? "static lift, not replayed" : "illustration withheld, not replayed"}` : "no largest event reported",
    "illustrative, not a transaction",
  ].join("\n");
}

export function shipIssuanceLedgerClause(ship: Pick<ShipNode, "issuance">): string {
  return `issuance work ${shipIssuanceDetailLabel(ship).replace(/\n/g, "; ")}; rendered at garden tempo, not a transaction rate`;
}
