import type { StabilityIndexResponse } from "@shared/types";
import type { GardenMonthRecord } from "./world-types";

const DAY_MS = 24 * 60 * 60 * 1000;
export const GARDEN_MONTH_WINDOW_DAYS = 30;

function epochMs(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  // The API may serialize epoch seconds or milliseconds.
  const at = value < 10_000_000_000 ? value * 1000 : value;
  return Number.isFinite(at) ? at : null;
}

/**
 * W6.2: a quiet trailing record, not today's status. The newest history point
 * anchors the window so stale-but-valid history does not vanish with wall time.
 */
export function buildGardenMonthRecord(
  stability: StabilityIndexResponse | null | undefined,
): GardenMonthRecord {
  const points = (stability?.history ?? []).flatMap((point) => {
    const at = epochMs(point.date);
    return at === null || !Number.isFinite(point.score) ? [] : [{ at, score: point.score }];
  });
  if (points.length === 0) {
    return { averagePsi: null, growth: 0.5, sampleCount: 0, spanDays: 0, unavailable: true };
  }
  const newest = Math.max(...points.map((point) => point.at));
  const cutoff = newest - GARDEN_MONTH_WINDOW_DAYS * DAY_MS;
  const month = points.filter((point) => point.at >= cutoff);
  const oldest = Math.min(...month.map((point) => point.at));
  const averagePsi = month.reduce((sum, point) => sum + point.score, 0) / month.length;
  // PSI 30 and below is a stressed, shedding month; 80 and above is fully
  // flourishing. The continuous middle avoids daily category pops.
  const growth = Math.max(0, Math.min(1, (averagePsi - 30) / 50));
  return {
    averagePsi,
    growth,
    sampleCount: month.length,
    spanDays: Math.round((newest - oldest) / DAY_MS),
    unavailable: false,
  };
}

export function gardenMonthRecordLabel(record?: GardenMonthRecord): string {
  if (!record || record.unavailable || record.averagePsi === null) {
    return "Neutral garden — no index history to grow from";
  }
  const state = record.growth >= 0.7
    ? "Flourishing — blossoms open and moss greens"
    : record.growth >= 0.4
      ? "Settled — modest growth held"
      : "Weathered — planting sheds and browns";
  return `${state}; average PSI ${record.averagePsi.toFixed(1)}; ${record.spanDays} days on record`;
}

export function gardenMonthRecordLedgerClause(record?: GardenMonthRecord): string {
  return `Garden record, 30d: ${gardenMonthRecordLabel(record)}. This is a slow trailing record; it changes with daily history, never as a live alarm.`;
}
