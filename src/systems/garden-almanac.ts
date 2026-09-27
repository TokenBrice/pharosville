import { gardenMicroseason } from "./garden-calendar";
import type { GardenRitualKind } from "./garden-director";
import { gardenMoonPhrase, gardenSkyLatitude, type GardenSkyDay, type GardenSkyLatitude } from "./sky-almanac";

/**
 * The Almanac (W5.1, W5.6, K18): the ledger's words for the day score's
 * rituals and the day's place in the year. The rituals themselves are chosen
 * and timed by `garden-score.ts`; this module only says what happened, in
 * plain language with the local time. Kō names live here and in the ledger
 * only — never in the now-line.
 */

export interface GardenAlmanacLogEntry {
  id: string;
  message: string;
  timestampLabel: string;
}

const RITUAL_LEDGER_LINES: Record<GardenRitualKind, string> = {
  "heron-arrives": "A heron came down into the reed shallows.",
  "heron-departs": "The heron lifted in the last gold light and flew low over the island.",
  kindling: "The keeper lit the island lamps; the harbour lanterns followed.",
  moonrise: "The moon cleared the borrowed hills.",
  meteor: "A single meteor crossed the dark-moon sky.",
  "seasonal-visitor": "A seasonal visitor came to the garden.",
  crossing: "A ship crossed the mirror inlet.",
};

/** One ledger line per ritual start, stamped with the local clock hour it began at. */
export function gardenRitualLedgerEntry(event: {
  id: string;
  kind: GardenRitualKind;
  clockHour: number;
  directorSeconds: number;
}, dayKey: string): GardenAlmanacLogEntry {
  return {
    id: `${dayKey}:${event.id}:${Math.round(event.directorSeconds)}`,
    message: RITUAL_LEDGER_LINES[event.kind],
    timestampLabel: formatHarborHour(event.clockHour),
  };
}

export interface GardenAlmanacDay {
  /** English kō name, e.g. "Thunder ceases". */
  microseason: string;
  /** English sekki name holding it. */
  sekki: string;
  /** The moon in words, or null while it is down or new. */
  moon: string | null;
}

/** The Almanac section's words for a date and hour. */
export function gardenAlmanacDay(
  date: Date,
  hour: number,
  day: GardenSkyDay,
  latitude: GardenSkyLatitude = gardenSkyLatitude(),
): GardenAlmanacDay {
  const { name, sekki } = gardenMicroseason(date, latitude);
  return { microseason: name, sekki, moon: gardenMoonPhrase(hour, day) };
}

function formatHarborHour(hour: number): string {
  const totalMinutes = Math.round((((hour % 24) + 24) % 24) * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
