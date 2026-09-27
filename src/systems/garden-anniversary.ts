/**
 * X1 (harbour-4, data-poetry-2): the anniversary evening of the fallen.
 *
 * The cemetery ledger dates each fall to the month only (`deathDate` is
 * `YYYY-MM`), so a fall has no day to keep. The garden keeps the month: on
 * the first evening of a month in which stablecoins fell, one stone lantern
 * in the stone garden is kindled with the lamps and burns through that night.
 * Every other night of the year it stays dark. At most once a day, about
 * twelve evenings a year.
 *
 * The evening runs from local noon to the next local noon, so the lantern
 * lit on the 1st still burns in the small hours of the 2nd.
 */

export interface GardenAnniversaryFall {
  deathDate: string;
  name: string;
  peakMcap?: number | null | undefined;
}

export interface GardenAnniversaryEvening {
  /** 1 … 12, the month the remembered coins fell in. */
  month: number;
  /** Their names, largest peak supply first. */
  names: string[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** The local calendar day whose evening `hour` belongs to (hours before noon belong to the day before). */
function eveningDay(date: Date, hour: number): Date {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (hour < 12) day.setDate(day.getDate() - 1);
  return day;
}

/**
 * The anniversary this evening keeps, or null. `date` is the world calendar
 * date (its local day), `hour` the world clock hour.
 */
export function gardenAnniversaryEvening(
  date: Date,
  hour: number,
  falls: readonly GardenAnniversaryFall[],
): GardenAnniversaryEvening | null {
  const evening = eveningDay(date, hour);
  if (evening.getDate() !== 1) return null;
  const month = evening.getMonth() + 1;
  const suffix = `-${String(month).padStart(2, "0")}`;
  const remembered = falls
    .filter((fall) => /^\d{4}-\d{2}$/.test(fall.deathDate) && fall.deathDate.endsWith(suffix))
    .toSorted((left, right) => (right.peakMcap ?? 0) - (left.peakMcap ?? 0) || left.name.localeCompare(right.name));
  if (remembered.length === 0) return null;
  return { month, names: remembered.map((fall) => fall.name) };
}

/** The ledger's words for the evening (the world itself carries no text). */
export function gardenAnniversaryLedgerLine(evening: GardenAnniversaryEvening): string {
  const month = MONTH_NAMES[evening.month - 1];
  const count = evening.names.length;
  const whom = count === 1
    ? `${evening.names[0]}, which fell in ${month}`
    : `the ${count} stablecoins that fell in ${month}, among them ${evening.names[0]}`;
  return `A lantern was lit in the stone garden for ${whom}.`;
}
