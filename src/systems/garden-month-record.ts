import type { StabilityIndexResponse } from "@shared/types";
import type { GardenMonthClose, GardenMonthDay, GardenMonthRecord, PharosVilleSourceStatus } from "./world-types";

const DAY_MS = 86_400_000;
export const GARDEN_MONTH_WINDOW_DAYS = 30;

function epochMs(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const at = value < 10_000_000_000 ? value * 1000 : value;
  return Number.isFinite(at) && at <= 8_640_000_000_000_000 ? at : null;
}

/** Exact supplied UTC daily closes. Array write order—not intraday timestamp
 * order—decides duplicates, as in the full Long Record. Never an average. */
export function buildGardenMonthRecord(
  stability: StabilityIndexResponse | null | undefined,
  evidence: PharosVilleSourceStatus | null = null,
): GardenMonthRecord {
  const history = stability?.history ?? [];
  let newestDay: number | null = null;
  for (const point of history) {
    const at = epochMs(point.date);
    if (at !== null) newestDay = Math.max(newestDay ?? -Infinity, Math.floor(at / DAY_MS));
  }
  const empty: GardenMonthRecord = {
    days: [], segments: [], sampleCount: 0, spanDays: 0, firstDay: null, lastDay: null,
    windowStartDay: null, windowEndDay: null, scoreBounds: [0, 100], evidence, unavailable: true,
  };
  if (newestDay === null) return empty;
  const start = newestDay - GARDEN_MONTH_WINDOW_DAYS + 1;
  const byDay = new Map<number, GardenMonthDay>();
  for (const point of history) {
    const at = epochMs(point.date);
    if (at === null) continue;
    const dayIndex = Math.floor(at / DAY_MS);
    if (dayIndex < start || dayIndex > newestDay) continue;
    const day = new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);
    byDay.set(dayIndex, Number.isFinite(point.score)
      ? { day, at, score: point.score, band: point.band, methodologyVersion: point.methodologyVersion, gap: false }
      : { day, at, score: null, band: point.band, methodologyVersion: point.methodologyVersion, gap: true });
  }
  const days: GardenMonthDay[] = [];
  const segments: GardenMonthClose[][] = [];
  let segment: GardenMonthClose[] | null = null;
  for (let dayIndex = start; dayIndex <= newestDay; dayIndex += 1) {
    const day = new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);
    const point: GardenMonthDay = byDay.get(dayIndex) ?? { day, at: null, score: null, band: null, methodologyVersion: null, gap: true };
    days.push(point);
    if (point.gap) { segment = null; continue; }
    const previous = segment?.[segment.length - 1];
    if (!previous || !point.methodologyVersion || previous.methodologyVersion !== point.methodologyVersion) {
      segment = [];
      segments.push(segment);
    }
    segment!.push(point);
  }
  const closes = segments.flat();
  return {
    days, segments, sampleCount: closes.length,
    spanDays: closes.length > 0 ? Math.round((Date.parse(closes.at(-1)!.day) - Date.parse(closes[0]!.day)) / DAY_MS) : 0,
    firstDay: closes[0]?.day ?? null, lastDay: closes.at(-1)?.day ?? null,
    windowStartDay: days[0]!.day, windowEndDay: days.at(-1)!.day,
    scoreBounds: [0, 100], evidence, unavailable: closes.length === 0,
  };
}

export function gardenMonthRecordLabel(record?: GardenMonthRecord): string {
  if (!record || record.unavailable) return "Neutral gravel bed — no supplied daily PSI closes";
  return `${record.sampleCount}/30 UTC daily closes; ${record.firstDay} to ${record.lastDay}; score axis 0–100, oldest left. Gaps and methodology edges are not joined; no rolling average.`;
}

export function gardenMonthRecordLedgerClause(record?: GardenMonthRecord): string {
  return `Garden record, 30d: ${gardenMonthRecordLabel(record)}. Dated official PSI history, not a live alarm; moss, decorative stones and sound have no market meaning.`;
}

const contentKeys = new WeakMap<GardenMonthRecord, string>();
/** GPU content only: source freshness changes the DOM, never the dated trace. */
export function gardenMonthRecordContentSignature(record?: GardenMonthRecord): string {
  if (!record) return "";
  const cached = contentKeys.get(record);
  if (cached !== undefined) return cached;
  const key = JSON.stringify([record.windowStartDay, record.windowEndDay, record.days.map((point) => [
    point.day, point.at, point.score, point.band, point.methodologyVersion,
  ])]);
  contentKeys.set(record, key);
  return key;
}
