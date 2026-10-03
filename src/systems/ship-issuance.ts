import type { MintBurnCoinFlow, MintBurnFlowsResponse } from "@shared/types/mint-burn";
import { formatCompactUsd } from "../lib/format-detail";
import { nodeSourceEvidenceLabel, observationEpochMs, rowSourceEvidence } from "./source-evidence";
import type { PharosVilleSourceStatus, ShipIssuance, ShipNode } from "./world-types";

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
  const completeWindow = windowHours === 24 && coverage?.has24hWindow === true && !coverage.isPartial;
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
    largestEvent24h: event && Number.isFinite(event.amountUsd) && Number.isFinite(event.timestamp)
      ? { amountUsd: event.amountUsd, direction: event.direction, timestamp: event.timestamp } : null,
  };
}

/** Shared membership gate for categorical cargo and supported route intensity. */
export function issuanceHasCurrentWindow(issuance: ShipIssuance | undefined): issuance is ShipIssuance {
  return !!issuance && issuance.evidence.state === "current" && issuance.completeWindow;
}

/** Only fields that change the lighter composition belong in renderer keys. */
export function shipIssuanceVisualState(issuance: ShipIssuance | undefined): string | null {
  if (!issuanceHasCurrentWindow(issuance) || !issuance.activity || issuance.activity === "inactive") return null;
  return `${issuance.activity}:${issuance.largestEvent24h !== null ? 1 : 0}`;
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
    nodeSourceEvidenceLabel({ mintBurn: issuance.evidence }),
    `raw intensity ${issuance.intensity ?? "unavailable"}; semantics ${issuance.intensitySemantics ?? "unknown"}`,
    event ? `largest event ${event.direction} ${event.amountUsd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })} at ${new Date(event.timestamp * 1_000).toISOString()}; ${visible ? "static lift, not replayed" : "illustration withheld, not replayed"}` : "no largest event reported",
    "illustrative, not a transaction",
  ].join("\n");
}

export function shipIssuanceLedgerClause(ship: Pick<ShipNode, "issuance">): string {
  return `issuance work ${shipIssuanceDetailLabel(ship).replace(/\n/g, "; ")}; rendered at garden tempo, not a transaction rate`;
}
