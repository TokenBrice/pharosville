import type { MintBurnCoinFlow } from "@shared/types/mint-burn";
import { formatCompactUsd } from "../lib/format-detail";
import type { ShipIssuance, ShipNode } from "./world-types";

export const SHIP_ISSUANCE_DRAFT_MAX = 0.12;

export function buildShipIssuance(
  coin: MintBurnCoinFlow | null | undefined,
): ShipIssuance | undefined {
  if (!coin) return undefined;
  const net = Number.isFinite(coin.netFlow24hUsd) ? coin.netFlow24hUsd : 0;
  const flowIntensity = typeof coin.flowIntensity === "number" && Number.isFinite(coin.flowIntensity)
    ? Math.max(-100, Math.min(100, coin.flowIntensity))
    : null;
  return {
    direction: net > 0 ? "minting" : net < 0 ? "redeeming" : "flat",
    flowIntensity,
    netFlow24hUsd: net,
    largestEvent24h: coin.largestEvent24h && Number.isFinite(coin.largestEvent24h.amountUsd)
      ? {
          amountUsd: Math.max(0, coin.largestEvent24h.amountUsd),
          direction: coin.largestEvent24h.direction,
          timestamp: coin.largestEvent24h.timestamp,
        }
      : null,
  };
}

/** Positive is higher in the water; minting takes draft and is therefore negative. */
export function shipIssuanceDraft(issuance: ShipIssuance | undefined): number {
  if (!issuance || issuance.direction === "flat") return 0;
  const intensity = Math.abs(issuance.flowIntensity ?? 0) / 100;
  const magnitude = SHIP_ISSUANCE_DRAFT_MAX * (0.35 + intensity * 0.65);
  return issuance.direction === "minting" ? -magnitude : magnitude;
}

function signedCompactUsd(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCompactUsd(Math.abs(value))}`;
}

export function shipIssuanceDetailLabel(ship: Pick<ShipNode, "issuance">): string {
  const issuance = ship.issuance;
  if (!issuance) return "Unavailable — neutral draft; no per-coin mint/redeem row";
  const activity = issuance.direction === "minting"
    ? `${signedCompactUsd(issuance.netFlow24hUsd)} net minted — loading cargo and riding deeper`
    : issuance.direction === "redeeming"
      ? `${signedCompactUsd(issuance.netFlow24hUsd)} net redeemed — discharging cargo and riding higher`
      : "Balanced net issuance — no loading or discharge run";
  const intensity = issuance.flowIntensity === null
    ? "flow intensity unavailable"
    : `flow intensity ${Math.round(Math.abs(issuance.flowIntensity))}/100`;
  const event = issuance.largestEvent24h
    ? `largest event ${issuance.largestEvent24h.direction} ${formatCompactUsd(issuance.largestEvent24h.amountUsd)}`
    : "no largest event reported";
  return `${activity}; ${intensity}; ${event}`;
}

export function shipIssuanceLedgerClause(ship: Pick<ShipNode, "issuance">): string {
  return `issuance work ${shipIssuanceDetailLabel(ship)}; rendered at garden tempo over 45 seconds, while this ledger states the latest truth immediately`;
}
