import { debugCalendarDayMs } from "../lib/pharosville-debug";

export type GardenSeason = "spring" | "summer" | "autumn" | "winter";

const DAY_MS = 86_400_000;

/**
 * The one calendar the world reads for season, almanac and every other
 * date-driven choice. It is the wall clock unless a debug session pins the
 * day with `d=YYYY-MM-DD`; a pinned day keeps the real UTC time of day, so
 * clocks that tick inside the day (and every `timeSeconds` elsewhere) stay
 * continuous while the calendar day holds.
 */
export function worldCalendarDate(now: Date = new Date()): Date {
  const pinnedDayMs = debugCalendarDayMs();
  if (pinnedDayMs === null) return now;
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return new Date(pinnedDayMs);
  return new Date(pinnedDayMs + (((nowMs % DAY_MS) + DAY_MS) % DAY_MS));
}

/**
 * Northern-hemisphere meteorological seasons, resolved in UTC so the same
 * instant cannot select two dressings in different browser time zones. A
 * coarse label for the sky and lantern dressings only: flora no longer reads
 * it (K24) — trees follow `garden-calendar` (solar longitude, per-specimen
 * phenology, hemisphere from the visitor's zone).
 */
export function seasonFromDate(date: Date = worldCalendarDate()): GardenSeason {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return "winter";
  const month = date.getUTCMonth();
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}

export const GARDEN_SEASON_LABEL: Readonly<Record<GardenSeason, string>> = Object.freeze({
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
});
