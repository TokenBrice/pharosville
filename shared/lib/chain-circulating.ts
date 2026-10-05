import { resolveChainId } from "./chains";

export interface ChainCirculatingPoint {
  current: number;
  circulatingPrevDay: number | null;
  circulatingPrevWeek: number | null;
  circulatingPrevMonth: number | null;
}

export type RawChainCirculating = Record<string, {
  current?: number;
  circulatingPrevDay?: number | null | undefined;
  circulatingPrevWeek?: number | null | undefined;
  circulatingPrevMonth?: number | null | undefined;
}>;

export function canonicalizeChainCirculating(
  chainCirculating: RawChainCirculating | null | undefined,
): Map<string, ChainCirculatingPoint> {
  const canonical = new Map<string, ChainCirculatingPoint>();
  if (!chainCirculating || typeof chainCirculating !== "object") {
    return canonical;
  }

  for (const [rawChainId, data] of Object.entries(chainCirculating)) {
    if (!data || typeof data !== "object") continue;
    const chainId = resolveChainId(rawChainId);
    if (!chainId) continue;

    const current = data.current ?? 0;
    const circulatingPrevDay = data.circulatingPrevDay ?? null;
    const circulatingPrevWeek = data.circulatingPrevWeek ?? null;
    const circulatingPrevMonth = data.circulatingPrevMonth ?? null;
    const existing = canonical.get(chainId);

    if (existing) {
      existing.current += current;
      existing.circulatingPrevDay = existing.circulatingPrevDay === null || circulatingPrevDay === null ? null : existing.circulatingPrevDay + circulatingPrevDay;
      existing.circulatingPrevWeek = existing.circulatingPrevWeek === null || circulatingPrevWeek === null ? null : existing.circulatingPrevWeek + circulatingPrevWeek;
      existing.circulatingPrevMonth = existing.circulatingPrevMonth === null || circulatingPrevMonth === null ? null : existing.circulatingPrevMonth + circulatingPrevMonth;
      continue;
    }

    canonical.set(chainId, {
      current,
      circulatingPrevDay,
      circulatingPrevWeek,
      circulatingPrevMonth,
    });
  }

  return canonical;
}

export function findCanonicalChainData(
  chainCirculating: RawChainCirculating | null | undefined,
  targetChainId: string,
): ChainCirculatingPoint | null {
  return canonicalizeChainCirculating(chainCirculating).get(targetChainId) ?? null;
}
