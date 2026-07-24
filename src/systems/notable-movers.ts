import { formatChangePercent, formatCompactUsd } from "../lib/format-detail";
import type { PharosVilleWorld, ShipNode } from "./world-types";

export interface NotableMover {
  detailId: string;
  symbol: string;
  change24hPct: number | null;
  change24hUsd: number | null;
  change24hPctLabel: string;
  change24hUsdLabel: string;
  riskWaterLabel: string;
}

const DEFAULT_LIMIT = 5;

export function hasRecentMove(ship: ShipNode): boolean {
  return Math.abs(ship.change24hUsd ?? 0) >= 1_000_000
    || Math.abs(ship.change24hPct ?? 0) >= 1;
}

export function selectNotableMovers(world: Pick<PharosVilleWorld, "ships">, limit = DEFAULT_LIMIT): NotableMover[] {
  return world.ships
    .filter(hasRecentMove)
    .toSorted(compareMoverShips)
    .slice(0, Math.max(0, limit))
    .map((ship) => ({
      detailId: ship.detailId,
      symbol: ship.symbol,
      change24hPct: ship.change24hPct,
      change24hUsd: ship.change24hUsd,
      change24hPctLabel: formatChangePercent(ship.change24hPct),
      change24hUsdLabel: formatCompactUsd(ship.change24hUsd),
      riskWaterLabel: ship.riskWaterLabel,
    }));
}

function compareMoverShips(a: ShipNode, b: ShipNode): number {
  return Math.abs(b.change24hUsd ?? 0) - Math.abs(a.change24hUsd ?? 0);
}
