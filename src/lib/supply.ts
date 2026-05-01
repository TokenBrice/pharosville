import type { StablecoinData } from "@shared/types/market";

const safeNum = (value: number | null | undefined): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export function sumPegBuckets(obj: Record<string, number> | undefined): number {
  if (!obj) return 0;
  return Object.values(obj).reduce((sum, value) => sum + safeNum(value), 0);
}

function hasAnyBucket(obj: Record<string, number> | undefined): boolean {
  if (!obj) return false;
  return Object.values(obj).some((value) => typeof value === "number" && Number.isFinite(value) && value !== 0);
}

export function getCirculatingRaw(asset: StablecoinData): number {
  return sumPegBuckets(asset.circulating);
}

export function getPrevDayRawOrNull(asset: StablecoinData): number | null {
  const value = sumPegBuckets(asset.circulatingPrevDay);
  return value === 0 && !hasAnyBucket(asset.circulatingPrevDay) ? null : value;
}

export function getPrevWeekRawOrNull(asset: StablecoinData): number | null {
  const value = sumPegBuckets(asset.circulatingPrevWeek);
  return value === 0 && !hasAnyBucket(asset.circulatingPrevWeek) ? null : value;
}

export function getPrevMonthRawOrNull(asset: StablecoinData): number | null {
  const value = sumPegBuckets(asset.circulatingPrevMonth);
  return value === 0 && !hasAnyBucket(asset.circulatingPrevMonth) ? null : value;
}
