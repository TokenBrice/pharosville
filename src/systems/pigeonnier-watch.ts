import type { PegSummaryResponse } from "@shared/types";
import { selectNotableMovers } from "./notable-movers";
import type { PharosVilleWorld, PigeonnierNode } from "./world-types";

export const PIGEONNIER_ROOST_VISUAL_CAP = 12;

type PigeonnierWatch = Required<Pick<PigeonnierNode, "notableMovers" | "roost">>;

export function pigeonnierWatchForWorld(
  world: Pick<PharosVilleWorld, "ships">,
  pegSummary: PegSummaryResponse | null | undefined,
): PigeonnierWatch {
  const summary = pegSummary?.summary ?? null;
  const eventsToday = finiteCount(summary?.depegEventsToday);
  const eventsYesterday = finiteCount(summary?.depegEventsYesterday);
  const comparison = eventsToday === null || eventsYesterday === null
    ? null
    : eventsToday - eventsYesterday;
  return {
    notableMovers: selectNotableMovers(world).map((mover) => ({
      change24hPctLabel: mover.change24hPctLabel,
      change24hUsdLabel: mover.change24hUsdLabel,
      detailId: mover.detailId,
      id: mover.detailId.slice("ship.".length),
      riskWaterLabel: mover.riskWaterLabel,
      symbol: mover.symbol,
    })),
    roost: {
      capped: eventsToday !== null && eventsToday > PIGEONNIER_ROOST_VISUAL_CAP,
      comparison,
      eventsToday,
      eventsYesterday,
      visualCount: Math.min(eventsToday ?? 0, PIGEONNIER_ROOST_VISUAL_CAP),
    },
  };
}

export function pigeonnierRoostLabel(roost: NonNullable<PigeonnierNode["roost"]>): string {
  if (roost.eventsToday === null) return "Unavailable — no peg summary to count";
  const today = `${roost.eventsToday} today`;
  if (roost.eventsYesterday === null || roost.comparison === null) {
    return `${today}; yesterday unavailable`;
  }
  const direction = roost.comparison > 0
    ? `${roost.comparison} more than yesterday`
    : roost.comparison < 0
      ? `${Math.abs(roost.comparison)} fewer than yesterday`
      : "same as yesterday";
  return `${today}; ${roost.eventsYesterday} yesterday (${direction})`;
}

function finiteCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : null;
}
