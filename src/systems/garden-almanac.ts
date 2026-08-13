export type GardenAlmanacEventId = "heron-dusk" | "lantern-round" | "deep-night-meteor";

export interface GardenAlmanacEvent {
  dayKey: string;
  endsAtHour: number;
  id: GardenAlmanacEventId;
  ledgerMessage: string;
  startsAtHour: number;
  timestampLabel: string;
}

export interface GardenAlmanacLogEntry {
  id: string;
  message: string;
  timestampLabel: string;
}

interface AlmanacEventDefinition {
  baseHour: number;
  durationHours: number;
  id: GardenAlmanacEventId;
  jitterHours: number;
  ledgerMessage: string;
}

const EVENT_DEFINITIONS: readonly AlmanacEventDefinition[] = Object.freeze([
  {
    baseHour: 18,
    durationHours: 0.4,
    id: "heron-dusk",
    jitterHours: 0.2,
    ledgerMessage: "A heron settled on the harbor piling at dusk.",
  },
  {
    baseHour: 19,
    durationHours: 0.4,
    id: "lantern-round",
    jitterHours: 0.2,
    ledgerMessage: "The harbor keeper made the lantern-lighting round at nightfall.",
  },
  {
    baseHour: 1,
    durationHours: 0.24,
    id: "deep-night-meteor",
    jitterHours: 0.3,
    ledgerMessage: "A single meteor crossed the deep-night harbor sky.",
  },
]);

/**
 * W6.3's shared daily sighting. UTC owns the seed so viewers get the same
 * event choice worldwide; the event itself remains tied to the harbor clock's
 * dusk/night phase. Exactly one definition is selected for each day.
 *
 * Moonbow is deliberately absent. The current render payload exposes the
 * present PSI stress, but no trustworthy previous stressed -> resolved edge;
 * inferring one from a calm frame would make a decorative event claim data
 * history the app does not have.
 */
export function gardenAlmanacEventForDate(date: Date = new Date()): GardenAlmanacEvent {
  const dayKey = utcDayKey(date);
  const seed = hashText(dayKey);
  const definition = EVENT_DEFINITIONS[seed % EVENT_DEFINITIONS.length]!;
  const jitterUnit = hashText(`${dayKey}:${definition.id}:hour`) / 0xffff_ffff;
  const startsAtHour = definition.baseHour + jitterUnit * definition.jitterHours;
  return {
    dayKey,
    endsAtHour: startsAtHour + definition.durationHours,
    id: definition.id,
    ledgerMessage: definition.ledgerMessage,
    startsAtHour,
    timestampLabel: formatHarborHour(startsAtHour),
  };
}

/** One event at most; stillness/reduced-motion deliberately has no event. */
export function gardenAlmanacEventAt(
  date: Date,
  wallClockHour: number,
  reducedMotion = false,
): GardenAlmanacEvent | null {
  if (reducedMotion || !Number.isFinite(wallClockHour)) return null;
  const hour = wallClockHour >= 0 && wallClockHour < 24
    ? wallClockHour
    : ((wallClockHour % 24) + 24) % 24;
  const event = gardenAlmanacEventForDate(date);
  return hour >= event.startsAtHour && hour < event.endsAtHour ? event : null;
}

export function gardenAlmanacLogEntry(event: GardenAlmanacEvent): GardenAlmanacLogEntry {
  return {
    id: `${event.dayKey}:${event.id}`,
    message: event.ledgerMessage,
    timestampLabel: event.timestampLabel,
  };
}

function utcDayKey(date: Date): string {
  if (!Number.isFinite(date.getTime())) return "1970-01-01";
  return date.toISOString().slice(0, 10);
}

function formatHarborHour(hour: number): string {
  const totalMinutes = Math.round(hour * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
