import type { PharosVilleWorld, SelectableWorldEntity } from "./world-types";

export interface QuickFindCandidate {
  detailId: string;
  /** Short noun for the result row ("Ship", "Harbor") — never the raw kind. */
  kindLabel: string;
  label: string;
  /** Ticker for ships; null for everything else. */
  symbol: string | null;
  /** Tie-break within one match rank, so the biggest coin or harbor leads. */
  weight: number;
}

const KIND_LABELS: Record<SelectableWorldEntity["kind"], string> = {
  area: "Sea area",
  dock: "Harbor",
  grave: "Wreck",
  lighthouse: "Landmark",
  pigeonnier: "Landmark",
  ship: "Ship",
};

const MATCH_RANK_SYMBOL_PREFIX = 0;
const MATCH_RANK_LABEL_PREFIX = 1;
const MATCH_RANK_SYMBOL_SUBSTRING = 2;
const MATCH_RANK_LABEL_SUBSTRING = 3;

export const QUICK_FIND_RESULT_LIMIT = 8;

export function buildQuickFindCandidates(world: PharosVilleWorld): QuickFindCandidate[] {
  return Object.values(world.entityById).map((entity) => ({
    detailId: entity.detailId,
    kindLabel: KIND_LABELS[entity.kind],
    label: entity.label,
    symbol: entity.kind === "ship" ? entity.symbol : null,
    weight: candidateWeight(entity),
  }));
}

/**
 * Ranks prefix matches above substring matches and the ticker above the
 * display name, so typing "usd" leads with USDC rather than with every coin
 * whose name happens to contain "usd".
 */
export function matchQuickFindCandidates(
  candidates: readonly QuickFindCandidate[],
  rawQuery: string,
  limit: number = QUICK_FIND_RESULT_LIMIT,
): QuickFindCandidate[] {
  const query = rawQuery.trim().toLowerCase();
  if (query.length === 0) return [];

  const ranked: Array<{ candidate: QuickFindCandidate; rank: number }> = [];
  for (const candidate of candidates) {
    const rank = matchRank(candidate, query);
    if (rank === null) continue;
    ranked.push({ candidate, rank });
  }

  ranked.sort((left, right) => (
    left.rank - right.rank
    || right.candidate.weight - left.candidate.weight
    || left.candidate.label.localeCompare(right.candidate.label)
  ));
  return ranked.slice(0, limit).map((entry) => entry.candidate);
}

function matchRank(candidate: QuickFindCandidate, query: string): number | null {
  const symbol = candidate.symbol?.toLowerCase() ?? "";
  const label = candidate.label.toLowerCase();
  if (symbol.startsWith(query)) return MATCH_RANK_SYMBOL_PREFIX;
  if (label.startsWith(query)) return MATCH_RANK_LABEL_PREFIX;
  if (symbol.includes(query)) return MATCH_RANK_SYMBOL_SUBSTRING;
  if (label.includes(query)) return MATCH_RANK_LABEL_SUBSTRING;
  return null;
}

function candidateWeight(entity: SelectableWorldEntity): number {
  const raw = entity.kind === "ship"
    ? entity.marketCapUsd
    : entity.kind === "dock"
      ? entity.totalUsd
      : 0;
  return Number.isFinite(raw) ? raw : 0;
}
