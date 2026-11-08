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

/** One last-source-row series for the latest 24 hours, shared by flow totals and charts. */
export function hourlyObservations<T extends { hourTs: number }>(rows: readonly T[]): T[] {
  const dated = datedObservations(rows.map((row) => ({ date: row.hourTs, row })));
  const end = dated.at(-1)?.date;
  return end == null ? [] : dated.filter(({ date }) => date >= end - 23 * 3600).slice(-24).map(({ row }) => row);
}
