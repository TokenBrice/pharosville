import type { MintBurnCoinFlow, MintBurnHourlyBucket } from "@shared/types/mint-burn";
import { hasFlowDay } from "../civic/flows";
import type { FlowsReading } from "../model/types";
import { money } from "./format";
export { flowValued } from "../civic/flows";

export type CoinFlow = Pick<MintBurnCoinFlow, "mintVolume24hUsd" | "burnVolume24hUsd" | "netFlow24hUsd" | "netFlow7dUsd" | "coverage" | "valuation">;
export type FlowHour = FlowsReading["hourly"][number] & Pick<MintBurnHourlyBucket, "valuation">;

export const NET_UNAVAILABLE = "Net unavailable: some events lack USD valuation.";
export const VALUATION_UNKNOWN = "Valuation completeness is unknown.";
export const CUSTOMS_BARS = "Each bar is hourly net flow: mint minus burn. Positive bars show net minted; negative bars show net burned.";

export function coverageLine(c: CoinFlow["coverage"]): string | null {
  if (!c || c.status === "disabled" || c.status === "unknown" || typeof c.has24hWindow !== "boolean" || typeof c.isPartial !== "boolean") return "Flow reading unavailable.";
  if (c.status === "lagging") return "Flow coverage is lagging.";
  return c.status !== "full" || !c.has24hWindow || c.isPartial ? "Partial history" : null;
}

export function coinNet(f: CoinFlow, days: 1 | 7, asOfSec: number | null): number | null {
  const c = f.coverage;
  const complete = coverageLine(c) == null && (days === 1 || (asOfSec != null && c?.historyStartAt != null && c.historyStartAt <= asOfSec - 7 * 86400));
  const valuation = days === 1 ? f.valuation?.window24h.completeness : f.valuation?.netFlow7d;
  return complete && valuation === "complete" ? (days === 1 ? f.netFlow24hUsd : f.netFlow7dUsd) : null;
}

export function grossFlow(amount: number, side: "mint" | "burn", complete: boolean): string {
  return `${complete ? "" : "At least "}${money(amount)} ${side === "mint" ? "minted" : "burned"}.`;
}

export function flowWindow(hourly: ReadonlyArray<{ hourTs: number }>): string {
  return hasFlowDay(hourly) ? "24 h" : "Partial history";
}
