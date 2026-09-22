import type { PegSummaryCoin, SafetyGradeEntry } from "@shared/types";

export function buildPegSummaryCoinMap(
  coins: readonly PegSummaryCoin[] | null | undefined,
): Map<string, PegSummaryCoin> {
  const map = new Map<string, PegSummaryCoin>();
  if (!coins) return map;
  for (const coin of coins) {
    map.set(coin.id, coin);
  }
  return map;
}

export function buildSafetyGradeMap(
  grades: readonly SafetyGradeEntry[] | null | undefined,
): Record<string, SafetyGradeEntry> | undefined {
  if (!grades) return undefined;
  return Object.fromEntries(grades.map((grade) => [grade.id, grade]));
}
