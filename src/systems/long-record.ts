import type { StabilityIndexResponse } from "@shared/types";

/**
 * X7 — the Long Record: the whole daily PSI history, which the world reads
 * only thirty days of, kept for the lighthouse card as one ink ridge line.
 * Exact truth belongs in the DOM, so the scroll is a DOM SVG with a summary
 * sentence and a yearly table; nothing here reaches the renderer.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Ridge vertices kept after decimation: enough for a 340 px scroll. */
export const LONG_RECORD_POINT_BUDGET = 400;
/** The trailing window washed in moss, matching the garden's month record. */
export const LONG_RECORD_RECENT_DAYS = 30;
/** Two valleys closer than this are one event, not two. */
const LONG_RECORD_LOW_SEPARATION_DAYS = 180;

export interface LongRecordPoint {
  /** Epoch ms of the daily close. */
  at: number;
  score: number;
}

export interface LongRecordYear {
  year: number;
  low: number;
  average: number;
  /** Stablecoins whose recorded death month falls in this year. */
  deaths: number;
}

export interface LongRecordDeathMonth {
  /** `YYYY-MM`, as the cemetery records it. */
  month: string;
  /** Epoch ms of the first day of that month (UTC). */
  at: number;
  symbols: string[];
}

export interface LongRecordModel {
  /** Decimated daily closes, oldest first; the first and last are exact. */
  points: LongRecordPoint[];
  firstAt: number;
  lastAt: number;
  latestScore: number;
  /** Raw daily points read, before decimation. */
  sampleCount: number;
  /** The deepest close and the deepest one at least six months from it, in date order. */
  lows: LongRecordPoint[];
  years: LongRecordYear[];
  /** Deaths inside the recorded span, grouped by month, oldest first. */
  deaths: LongRecordDeathMonth[];
}

export interface LongRecordDeath {
  deathDate: string;
  symbol: string;
}

function epochMs(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return value < 10_000_000_000 ? value * 1000 : value;
}

function monthStartMs(month: string): number | null {
  const match = /^(\d{4})-(\d{2})/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return Date.UTC(year, monthIndex, 1);
}

/**
 * Largest-Triangle-Three-Buckets: keeps the points that carry the line's
 * shape, so the two deep valleys and the calm plateaus survive at 1:8.
 */
export function decimateLongRecord(points: readonly LongRecordPoint[], budget: number): LongRecordPoint[] {
  if (budget >= points.length || budget < 3) return points.slice();
  const sampled: LongRecordPoint[] = [points[0]!];
  const bucketSize = (points.length - 2) / (budget - 2);
  let anchor = 0;
  for (let bucket = 0; bucket < budget - 2; bucket += 1) {
    const nextStart = Math.floor((bucket + 1) * bucketSize) + 1;
    const nextEnd = Math.min(points.length, Math.floor((bucket + 2) * bucketSize) + 1);
    let averageAt = 0;
    let averageScore = 0;
    const nextCount = Math.max(1, nextEnd - nextStart);
    for (let index = nextStart; index < nextEnd; index += 1) {
      averageAt += points[index]!.at;
      averageScore += points[index]!.score;
    }
    averageAt /= nextCount;
    averageScore /= nextCount;
    const start = Math.floor(bucket * bucketSize) + 1;
    const end = Math.floor((bucket + 1) * bucketSize) + 1;
    const a = points[anchor]!;
    let bestArea = -1;
    let bestIndex = start;
    for (let index = start; index < end; index += 1) {
      const point = points[index]!;
      const area = Math.abs(
        (a.at - averageAt) * (point.score - a.score) - (a.at - point.at) * (averageScore - a.score),
      );
      if (area > bestArea) {
        bestArea = area;
        bestIndex = index;
      }
    }
    sampled.push(points[bestIndex]!);
    anchor = bestIndex;
  }
  sampled.push(points[points.length - 1]!);
  return sampled;
}

function deepestLows(points: readonly LongRecordPoint[]): LongRecordPoint[] {
  let deepest: LongRecordPoint | null = null;
  for (const point of points) {
    if (!deepest || point.score < deepest.score) deepest = point;
  }
  if (!deepest) return [];
  const separation = LONG_RECORD_LOW_SEPARATION_DAYS * DAY_MS;
  let second: LongRecordPoint | null = null;
  for (const point of points) {
    if (Math.abs(point.at - deepest.at) < separation) continue;
    if (!second || point.score < second.score) second = point;
  }
  return second ? [deepest, second].sort((a, b) => a.at - b.at) : [deepest];
}

/** Null when there is not enough history to draw a line. */
export function buildLongRecord(
  stability: StabilityIndexResponse | null | undefined,
  deaths: readonly LongRecordDeath[] = [],
): LongRecordModel | null {
  const byDay = new Map<number, LongRecordPoint>();
  for (const point of stability?.history ?? []) {
    const at = epochMs(point.date);
    if (at === null || !Number.isFinite(point.score)) continue;
    // One close per UTC day; a later write for the same day wins.
    byDay.set(Math.floor(at / DAY_MS), { at, score: point.score });
  }
  const points = [...byDay.values()].sort((a, b) => a.at - b.at);
  if (points.length < 2) return null;
  const firstAt = points[0]!.at;
  const lastAt = points[points.length - 1]!.at;

  const yearStats = new Map<number, { low: number; sum: number; count: number; deaths: number }>();
  for (const point of points) {
    const year = new Date(point.at).getUTCFullYear();
    const stats = yearStats.get(year) ?? { low: Infinity, sum: 0, count: 0, deaths: 0 };
    stats.low = Math.min(stats.low, point.score);
    stats.sum += point.score;
    stats.count += 1;
    yearStats.set(year, stats);
  }

  const deathMonths = new Map<string, LongRecordDeathMonth>();
  const firstMonthAt = Date.UTC(new Date(firstAt).getUTCFullYear(), new Date(firstAt).getUTCMonth(), 1);
  for (const death of deaths) {
    const month = death.deathDate.slice(0, 7);
    const at = monthStartMs(month);
    if (at === null || at < firstMonthAt || at > lastAt) continue;
    const entry = deathMonths.get(month) ?? { month, at, symbols: [] };
    entry.symbols.push(death.symbol);
    deathMonths.set(month, entry);
    const stats = yearStats.get(new Date(at).getUTCFullYear());
    if (stats) stats.deaths += 1;
  }

  return {
    points: decimateLongRecord(points, LONG_RECORD_POINT_BUDGET),
    firstAt,
    lastAt,
    latestScore: points[points.length - 1]!.score,
    sampleCount: points.length,
    lows: deepestLows(points),
    years: [...yearStats.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, stats]) => ({ year, low: stats.low, average: stats.sum / stats.count, deaths: stats.deaths })),
    deaths: [...deathMonths.values()].sort((a, b) => a.at - b.at),
  };
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export function longRecordMonthLabel(at: number): string {
  return MONTH_LABEL.format(at);
}

export function longRecordScoreLabel(score: number): string {
  return score.toFixed(1);
}

/** The sentence a screen reader hears for the scroll; the table carries the rest. */
export function longRecordSummary(record: LongRecordModel): string {
  const span = `Daily PSI from ${longRecordMonthLabel(record.firstAt)} to ${longRecordMonthLabel(record.lastAt)}, ${record.sampleCount.toLocaleString("en-US")} days.`;
  const lows = record.lows.length === 0
    ? ""
    : ` ${record.lows.length === 1 ? "The low" : "The two deepest valleys"}: ${record.lows
      .map((low) => `${longRecordScoreLabel(low.score)} in ${longRecordMonthLabel(low.at)}`)
      .join(" and ")}.`;
  const deathCount = record.deaths.reduce((sum, month) => sum + month.symbols.length, 0);
  const deaths = deathCount > 0
    ? ` ${deathCount} ${deathCount === 1 ? "stablecoin" : "stablecoins"} died in this span, marked as stones.`
    : "";
  return `${span}${lows} Latest ${longRecordScoreLabel(record.latestScore)}.${deaths} PSI is an index; lows are daily closes.`;
}
