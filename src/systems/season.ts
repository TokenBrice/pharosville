export type GardenSeason = "spring" | "summer" | "autumn" | "winter";

/**
 * Northern-hemisphere meteorological seasons, resolved in UTC so the same
 * instant cannot select two dressings in different browser time zones.
 */
export function seasonFromDate(date: Date = new Date()): GardenSeason {
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
