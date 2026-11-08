/** UTC epoch seconds that the platform can represent; missing dates never become an epoch. */
export function validObservationDate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 8.64e12;
}

/** Source order breaks timestamp ties: the last received row owns that observation. */
export function datedObservations<T extends { date: number }>(rows: readonly T[]): T[] {
  const byDate = new Map<number, T>();
  for (const row of rows) if (validObservationDate(row.date)) byDate.set(row.date, row);
  return [...byDate.values()].sort((a, b) => a.date - b.date);
}
