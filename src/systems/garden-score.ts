import { recordDebugRitual } from "../lib/pharosville-debug";
import { dayCycleBeats, type DayCycleBeats } from "./day-cycle-beats";
import {
  GARDEN_ATTENTION_DEFAULT_SEED,
  gardenAttentionSlotsBetween,
  type GardenScoreGift,
} from "./garden-attention-scheduler";
import { gardenSeasonalLongitudeDeg, gardenSeasonalVisitor, gardenTreeLetsGo } from "./garden-calendar";
import {
  GARDEN_FOREGROUND_GAP_SECONDS,
  GARDEN_DISCRETE_EVENTS_PER_HOUR,
  GARDEN_QUIET_RUN_SECONDS,
  GARDEN_RITUAL_BACKOFF_SECONDS,
  gardenRitualHandler,
  requestGardenBeat,
  reserveGardenRitual,
  type GardenDirectorState,
  type GardenRitualHandler,
  type GardenRitualKind,
} from "./garden-director";
import {
  gardenMoonStateAt,
  gardenSkyDay,
  gardenSkyLatitude,
  gardenSolarElevationAt,
  gardenSolarHourAngle,
  type GardenSkyDay,
  type GardenSkyLatitude,
} from "./sky-almanac";
import { stableUnit } from "./stable-random";

/**
 * The day score (W5.1, contract S-A): a small repertoire of clock-anchored
 * rituals, each a gift the frame receives unannounced and follows with at
 * least eight minutes of nothing. Pure and deterministic per UTC day: the
 * UTC day key seeds every choice, the local sky day (sun and moon for the
 * date and latitude) places it.
 *
 * | ritual           | when                                            | attention |
 * | ---------------- | ----------------------------------------------- | --------- |
 * | heron-arrives    | 1.5–3.5 h after sunrise                         | 25 s      |
 * | heron-departs    | golden hour, golden ≥ 0.6, before the kindling  | 20 s      |
 * | kindling         | the sun at −0.8° (sunset) + 0–8 min (K20/O19)   | 230 s     |
 * | moonrise         | the displayed moon clearing the hills, sun down | ledger    |
 * | meteor           | dark-moon nights only, in astronomical night    | 10 s      |
 * | seasonal-visitor | kō-gated (garden-calendar event gates)          | 70 s      |
 * | crossing         | the attention lattice's crossing slots          | 540 s     |
 *
 * Every entry obeys §5.0 by construction and `gardenScoreBudgetViolations`
 * proves it: ≤ 6 discrete events in any hour, one unbroken 12-minute quiet in
 * every hour, ≥ 8 minutes between foreground events, a 90 s back-off after
 * any ritual, ≤ 6 gifts a day and ≤ 2 in dusk (golden 0.5 → night 0.5).
 * The crossing entries are the budget's reservation on the score clock; the
 * crossings themselves ride fleet-motion's lattice on the motion clock, kept
 * clear of the rituals by `gardenScoreMotionGifts` and, at runtime, by the
 * director's own §5.0 admission.
 */

export interface GardenScoreEntry {
  /** Stable id, `${kind}:${seed}` (crossings add their slot index). */
  id: string;
  kind: GardenRitualKind;
  /** Local clock seconds since local midnight at which the ritual starts. */
  startSec: number;
  /** It may still start this long after `startSec` if the frame is busy. */
  windowSec: number;
  /** The attention it holds once started. */
  holdSec: number;
  foreground: boolean;
  /**
   * A companion rides another ritual's attention beat instead of taking its
   * own: it starts `startSec` after that ritual actually starts (scored or
   * forced), only while the parent's declared attention hold remains open,
   * costs no §5.0 event, and is skipped by the budget checker.
   */
  companionOf?: GardenRitualKind;
}

export interface GardenDayScoreInput {
  /** The UTC day key (`YYYY-MM-DD`). */
  seed: string;
  /** The world calendar date (its local calendar day is the sky day). */
  date: Date;
  latitude?: GardenSkyLatitude;
  /** Extra gifts offered for the day (e.g. an anniversary); admitted under the same ceilings. */
  gifts?: readonly GardenScoreEntry[];
  /** An explicit sky day (tests, pinned captures); defaults to the date's. */
  day?: GardenSkyDay;
  /**
   * X1: tonight is an anniversary evening (the world's graves say a stablecoin
   * fell in this month). The stone-garden lantern then rides the kindling.
   */
  anniversaryEvening?: boolean;
}

/** X1: the anniversary lantern is lit this long after the kindling begins (the keeper's stagger). */
const ANNIVERSARY_STAGGER_SECONDS = 60;

const DAY_SECONDS = 86_400;
const HOUR_SECONDS = 3_600;
const MINUTE = 60;
const RAD_TO_DEG = 180 / Math.PI;
export const GARDEN_SCORE_GIFT_DAILY_CEILING = 6;
export const GARDEN_SCORE_DUSK_CEILING = 2;
const CROSSING_HOLD_SECONDS = 540;
/** Moonrise asks for no attention of its own; this is its ledger beat. */
const MOONRISE_HOLD_SECONDS = 60;
/** Displayed moon must be at least this lit for its rise to be an event. */
const MOONRISE_MIN_ILLUMINATION = 0.2;
/** "Dark moon": the meteor waits for nights under this illumination. */
const METEOR_MAX_ILLUMINATION = 0.25;
/** Share of dark-moon nights that bring one meteor. */
const METEOR_NIGHT_SHARE = 0.5;
/** X5a: the skein flies in the migration kō (seasonal longitude, °) on this share of those dawns. */
const SKEIN_SEASON_DEG = [195, 345] as const;
const SKEIN_DAY_SHARE = 0.35;
/**
 * X5a fish rings: a separate §5.0 generator (≤ 4/h, ≤ 1 per 15 min), not a
 * gift. Candidate slots every 20 min (a seeded 0–5 min in, so rings stay
 * ≥ 15 min apart), half of them offered, at the ends of the day only: the
 * midday water stands still (solar noon ± 2 h), which also keeps the noon
 * hour's decorative beats at ≤ 1.
 */
const FISH_RING_SLOT_SECONDS = 1_200;
const FISH_RING_MIN_GAP_SECONDS = 900;
const FISH_RING_SHARE = 0.5;
/** Natural rings admit on [start, start + 1 s); missed or busy offers never queue. */
const FISH_RING_ADMISSION_WINDOW_SECONDS = 1;
const FISH_RING_HOLD_SECONDS = 8;
const FISH_RING_NOON_CALM_HOURS = 2;
/** Kinds that are their own §5.0 generator rather than one of the day's ≤ 6 gifts. */
const NON_GIFT_KINDS: readonly GardenRitualKind[] = ["crossing", "fish-rings"];

interface Candidate {
  kind: GardenRitualKind;
  id: string;
  priority: number;
  preferred: number;
  earliest: number;
  latest: number;
  windowSec: number;
  holdSec: number;
  foreground: boolean;
}

/** First clock hour on the given side of noon at which the sun passes `deg` (going down in the evening, up in the morning). */
function sunCrossingHour(day: GardenSkyDay, deg: number, evening: boolean): number | null {
  const step = 2 / 60;
  let previous: number | null = null;
  for (let hour = 0; hour <= 24; hour += step) {
    if ((gardenSolarHourAngle(day, hour) >= 0) !== evening) { previous = null; continue; }
    const elevation = gardenSolarElevationAt(day, hour) * RAD_TO_DEG;
    if (previous !== null && (evening ? previous > deg && elevation <= deg : previous < deg && elevation >= deg)) {
      let low = hour - step;
      let high = hour;
      for (let iteration = 0; iteration < 20; iteration += 1) {
        const mid = (low + high) / 2;
        const value = gardenSolarElevationAt(day, mid) * RAD_TO_DEG;
        if (evening ? value > deg : value < deg) low = mid;
        else high = mid;
      }
      return high;
    }
    previous = elevation;
  }
  return null;
}

/** First evening hour at which `test(beats)` holds, to the minute. */
function eveningBeatHour(day: GardenSkyDay, from: number, test: (beats: DayCycleBeats) => boolean): number | null {
  for (let hour = from; hour <= 24; hour += 1 / 60) {
    if (gardenSolarHourAngle(day, hour) < 0) continue;
    if (test(dayCycleBeats(hour, day))) return hour;
  }
  return null;
}

/** The dusk interval (golden 0.5 → night 0.5) on the score clock, or null. */
export function gardenScoreDusk(day: GardenSkyDay): { startSec: number; endSec: number } | null {
  const start = eveningBeatHour(day, day.solarNoonHour, (beats) => beats.golden >= 0.5);
  if (start === null) return null;
  const end = eveningBeatHour(day, start, (beats) => beats.night >= 0.5) ?? 24;
  return { startSec: start * HOUR_SECONDS, endSec: end * HOUR_SECONDS };
}

function candidates(input: GardenDayScoreInput, day: GardenSkyDay, latitude: GardenSkyLatitude): Candidate[] {
  const { seed } = input;
  const unit = (key: string): number => stableUnit(`${seed}:score:${key}`);
  const list: Candidate[] = [];
  const push = (
    kind: GardenRitualKind,
    priority: number,
    preferredHour: number,
    earliestHour: number,
    latestHour: number,
    windowSec: number,
    holdSec: number,
    foreground: boolean,
  ): void => {
    list.push({
      kind,
      id: `${kind}:${seed}`,
      priority,
      preferred: Math.round(preferredHour * HOUR_SECONDS),
      earliest: Math.round(earliestHour * HOUR_SECONDS),
      latest: Math.round(latestHour * HOUR_SECONDS),
      windowSec,
      holdSec,
      foreground,
    });
  };

  const sunset = sunCrossingHour(day, -0.8, true);
  if (sunset !== null) {
    // K20/O19: the keeper sets out as the sun goes; his walk is the kindling.
    const kindling = sunset + (unit("kindling") * 8) / 60;
    push("kindling", 5, kindling, sunset, sunset + 12 / 60, 240, 230, true);
  }
  const goldenOnset = eveningBeatHour(day, day.solarNoonHour, (beats) => beats.golden >= 0.6);
  if (goldenOnset !== null) {
    const latest = sunset !== null ? sunset - 12 / 60 : goldenOnset + 0.5;
    const departs = goldenOnset + unit("heron-departs") * Math.max(0, Math.min(0.25, latest - goldenOnset));
    push("heron-departs", 4, departs, goldenOnset, Math.max(goldenOnset, latest), 240, 20, true);
  }
  if (Number.isFinite(day.sunriseHour)) {
    const arrives = day.sunriseHour + 1.5 + unit("heron-arrives") * 2;
    push("heron-arrives", 3, arrives, day.sunriseHour + 1.5, day.sunriseHour + 3.5, 600, 25, true);
  }

  // Moonrise: the displayed disc clearing the hills while the sun is down.
  let moonPresence = gardenMoonStateAt(day, 0, 1.6).presence;
  for (let minute = 1; minute < 24 * 60; minute += 1) {
    const hour = minute / 60;
    const moon = gardenMoonStateAt(day, hour, 1.6);
    if (moonPresence === 0 && moon.presence > 0) {
      if (moon.illumination >= MOONRISE_MIN_ILLUMINATION && gardenSolarElevationAt(day, hour) * RAD_TO_DEG <= 0) {
        push("moonrise", 2, hour, hour, hour + 0.25, 600, MOONRISE_HOLD_SECONDS, false);
      }
      break;
    }
    moonPresence = moon.presence;
  }

  // Meteor: a dark-moon night, half of them, deep in astronomical night.
  const astronomicalDusk = sunCrossingHour(day, -18, true);
  if (astronomicalDusk !== null && unit("meteor-night") < METEOR_NIGHT_SHARE) {
    const hour = astronomicalDusk + unit("meteor") * 2.5;
    if (hour < 24 && gardenMoonStateAt(day, hour, 1.6).illumination < METEOR_MAX_ILLUMINATION) {
      push("meteor", 1, hour, astronomicalDusk, Math.min(23.9, astronomicalDusk + 3), 300, 10, true);
    }
  }

  // X5a (O16): a skein of geese at first light in the migration kō, on a third of those dawns.
  const seasonalLongitude = gardenSeasonalLongitudeDeg(input.date, latitude);
  if (Number.isFinite(day.sunriseHour) && seasonalLongitude >= SKEIN_SEASON_DEG[0]
    && seasonalLongitude <= SKEIN_SEASON_DEG[1] && unit("skein-day") < SKEIN_DAY_SHARE) {
    const earliest = day.sunriseHour - 20 / 60;
    const latest = day.sunriseHour + 40 / 60 - 240 / HOUR_SECONDS;
    push("dawn-skein", 1.5, earliest + unit("dawn-skein") * (latest - earliest), earliest, latest, 240, 45, true);
  }

  // X5b: on the one day a year the island maple lets go, an afternoon gust
  // takes its leaves; it stands in for that day's leaf-fall visitor.
  const letsGo = gardenTreeLetsGo(input.date, latitude).today;
  if (letsGo) {
    const from = day.solarNoonHour + 1.5;
    push("tree-lets-go", 2.5, from + unit("tree-lets-go") * 2, from, day.solarNoonHour + 4, 600, 180, true);
  }

  const visitor = letsGo ? null : gardenSeasonalVisitor(input.date, latitude);
  if (visitor?.id === "fireflies") {
    // Early summer: they rise as the night beat takes the reeds.
    const dark = sunCrossingHour(day, -8, true);
    if (dark !== null) push("seasonal-visitor", 1, dark + unit("visitor") * 0.75, dark, dark + 1.5, 600, 70, true);
  } else if (visitor?.id === "leaf-fall") {
    // Late autumn: an afternoon gust takes the maple's last leaves.
    const from = day.solarNoonHour + 1.5;
    push("seasonal-visitor", 1, from + unit("visitor") * 2, from, from + 2.5, 600, 70, true);
  }

  for (const gift of input.gifts ?? []) {
    list.push({
      kind: gift.kind,
      id: gift.id,
      priority: 0.5,
      preferred: gift.startSec,
      earliest: gift.startSec,
      latest: gift.startSec + gift.windowSec,
      windowSec: gift.windowSec,
      holdSec: gift.holdSec,
      foreground: gift.foreground,
    });
  }
  return list;
}

/** `[start, start+hold+window)` must keep 8 min (foreground) / 90 s clear of every accepted entry. */
function clashes(entries: readonly GardenScoreEntry[], candidate: GardenScoreEntry): boolean {
  const start = candidate.startSec;
  const end = candidate.startSec + candidate.windowSec + candidate.holdSec;
  return entries.some((entry) => {
    const entryEnd = entry.startSec + entry.windowSec + entry.holdSec;
    const gap = entry.foreground && candidate.foreground ? GARDEN_FOREGROUND_GAP_SECONDS : GARDEN_RITUAL_BACKOFF_SECONDS;
    return start < entryEnd + gap && entry.startSec < end + gap;
  });
}

/**
 * Every §5.0 breach in a score, as readable strings (empty when it holds).
 * Shared by the permanent test, the throwaway sim and debug tooling.
 */
export function gardenScoreBudgetViolations(
  scoreIn: readonly GardenScoreEntry[],
  dusk: { startSec: number; endSec: number } | null = null,
): string[] {
  const violations: string[] = [];
  const score = scoreIn.filter((entry) => entry.companionOf === undefined);
  const gifts = score.filter((entry) => !NON_GIFT_KINDS.includes(entry.kind));
  const rings = score.filter((entry) => entry.kind === "fish-rings").toSorted((left, right) => left.startSec - right.startSec);
  for (let index = 1; index < rings.length; index += 1) {
    if (rings[index]!.startSec - rings[index - 1]!.startSec < FISH_RING_MIN_GAP_SECONDS) {
      violations.push(`${rings[index - 1]!.id} → ${rings[index]!.id}: fish rings < 15 min apart`);
    }
  }
  if (gifts.length > GARDEN_SCORE_GIFT_DAILY_CEILING) violations.push(`${gifts.length} gifts in a day`);
  if (dusk) {
    const inDusk = gifts.filter((entry) => entry.startSec >= dusk.startSec && entry.startSec < dusk.endSec);
    if (inDusk.length > GARDEN_SCORE_DUSK_CEILING) violations.push(`${inDusk.length} gifts in dusk`);
  }
  const ordered = score.toSorted((left, right) => left.startSec - right.startSec);
  // Each entry is judged at its latest start (the window's end), the worst case.
  const span = (entry: GardenScoreEntry): [number, number] => [entry.startSec, entry.startSec + entry.windowSec + entry.holdSec];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    const [, previousEnd] = span(previous);
    if (previous.foreground && current.foreground && current.startSec < previousEnd + GARDEN_FOREGROUND_GAP_SECONDS) {
      violations.push(`${previous.id} → ${current.id}: foreground < 8 min apart`);
    }
    if (previous.kind !== "crossing" && current.startSec < previousEnd + GARDEN_RITUAL_BACKOFF_SECONDS) {
      violations.push(`${previous.id} → ${current.id}: inside the 90 s back-off`);
    }
  }
  for (let windowStart = 0; windowStart + HOUR_SECONDS <= DAY_SECONDS; windowStart += MINUTE) {
    const windowEnd = windowStart + HOUR_SECONDS;
    const inside = ordered.filter((entry) => {
      const [start, end] = span(entry);
      return start < windowEnd && end > windowStart;
    });
    const starts = inside.filter((entry) => entry.startSec >= windowStart).length;
    if (starts > GARDEN_DISCRETE_EVENTS_PER_HOUR) violations.push(`${starts} events in the hour from ${windowStart}s`);
    let cursor = windowStart;
    let longest = 0;
    for (const entry of inside) {
      const [start, end] = span(entry);
      longest = Math.max(longest, start - cursor);
      cursor = Math.max(cursor, end);
    }
    longest = Math.max(longest, windowEnd - cursor);
    if (longest < GARDEN_QUIET_RUN_SECONDS) violations.push(`no 12-min quiet in the hour from ${windowStart}s`);
  }
  return violations;
}

/** The day's ordered score (see the module table). Deterministic in its input. */
export function gardenDayScore(input: GardenDayScoreInput): GardenScoreEntry[] {
  const latitude = input.latitude ?? gardenSkyLatitude();
  const day = input.day ?? gardenSkyDay(input.date, latitude);
  const dusk = gardenScoreDusk(day);
  const accepted: GardenScoreEntry[] = [];
  const ordered = candidates(input, day, latitude)
    .toSorted((left, right) => right.priority - left.priority || left.preferred - right.preferred || left.id.localeCompare(right.id));
  for (const candidate of ordered) {
    if (accepted.length >= GARDEN_SCORE_GIFT_DAILY_CEILING) break;
    const inDusk = (start: number): boolean => dusk !== null && start >= dusk.startSec && start < dusk.endSec;
    // Try the preferred minute, then later, then earlier, inside the ritual's own window.
    const tries: number[] = [candidate.preferred];
    for (let offset = MINUTE; offset <= candidate.latest - candidate.earliest; offset += MINUTE) {
      if (candidate.preferred + offset <= candidate.latest) tries.push(candidate.preferred + offset);
      if (candidate.preferred - offset >= candidate.earliest) tries.push(candidate.preferred - offset);
    }
    for (const startSec of tries) {
      if (startSec < 0 || startSec + candidate.windowSec + candidate.holdSec > DAY_SECONDS) continue;
      const entry: GardenScoreEntry = {
        id: candidate.id,
        kind: candidate.kind,
        startSec,
        windowSec: candidate.windowSec,
        holdSec: candidate.holdSec,
        foreground: candidate.foreground,
      };
      if (clashes(accepted, entry)) continue;
      if (inDusk(startSec) && accepted.filter((other) => inDusk(other.startSec)).length >= GARDEN_SCORE_DUSK_CEILING) break;
      accepted.push(entry);
      break;
    }
  }

  // Crossings take the lattice slots the rituals leave clear.
  const score = [...accepted];
  for (const slot of gardenAttentionSlotsBetween(input.seed, 0, DAY_SECONDS)) {
    if (slot.kind !== "crossing" || slot.startSeconds < 0 || slot.endSeconds > DAY_SECONDS) continue;
    const entry: GardenScoreEntry = {
      id: `crossing:${input.seed}:${slot.index}`,
      kind: "crossing",
      startSec: slot.startSeconds,
      windowSec: 0,
      holdSec: CROSSING_HOLD_SECONDS,
      foreground: true,
    };
    if (!clashes(accepted, entry)) score.push(entry);
  }
  score.sort((left, right) => left.startSec - right.startSec);
  // Where a ritual squeezed the hour's quiet, the neighbouring crossing yields.
  for (;;) {
    const hourBreach = firstQuietBreach(score);
    if (hourBreach === null) break;
    const crossing = score.findIndex((entry) => entry.kind === "crossing"
      && entry.startSec < hourBreach + HOUR_SECONDS && entry.startSec + entry.holdSec > hourBreach);
    if (crossing < 0) break;
    score.splice(crossing, 1);
  }
  placeFishRings(input.seed, day, score);
  if (input.anniversaryEvening && score.some((entry) => entry.kind === "kindling")) {
    score.push({
      id: `anniversary-lantern:${input.seed}`,
      kind: "anniversary-lantern",
      startSec: ANNIVERSARY_STAGGER_SECONDS,
      windowSec: 0,
      holdSec: 45,
      foreground: false,
      companionOf: "kindling",
    });
  }
  return score;
}

/**
 * X5a: offer the day's fish rings into the finished score, keeping each only
 * if every hour it touches still holds ≤ 6 events and a 12-minute quiet.
 * `score` is sorted and stays sorted.
 */
function placeFishRings(seed: string, day: GardenSkyDay, score: GardenScoreEntry[]): void {
  if (!Number.isFinite(day.sunriseHour) || !Number.isFinite(day.sunsetHour)) return;
  const from = (day.sunriseHour + 0.5) * HOUR_SECONDS;
  const spanSeconds = FISH_RING_ADMISSION_WINDOW_SECONDS + FISH_RING_HOLD_SECONDS;
  const to = (day.sunsetHour - 10 / 60) * HOUR_SECONDS - spanSeconds;
  const calmFrom = (day.solarNoonHour - FISH_RING_NOON_CALM_HOURS) * HOUR_SECONDS;
  const calmTo = (day.solarNoonHour + FISH_RING_NOON_CALM_HOURS) * HOUR_SECONDS;
  for (let slot = 0; from + slot * FISH_RING_SLOT_SECONDS < to; slot += 1) {
    const key = `${seed}:score:fish-rings:${slot}`;
    if (stableUnit(`${key}:offer`) >= FISH_RING_SHARE) continue;
    const startSec = Math.round(from + slot * FISH_RING_SLOT_SECONDS + stableUnit(key) * 300);
    const endSec = startSec + spanSeconds;
    if (startSec > to || (endSec > calmFrom && startSec < calmTo)) continue;
    const entry: GardenScoreEntry = {
      id: `fish-rings:${seed}:${slot}`,
      kind: "fish-rings",
      startSec,
      windowSec: FISH_RING_ADMISSION_WINDOW_SECONDS,
      holdSec: FISH_RING_HOLD_SECONDS,
      foreground: false,
    };
    if (clashes(score, entry)) continue;
    const at = score.findIndex((other) => other.startSec > startSec);
    const index = at < 0 ? score.length : at;
    score.splice(index, 0, entry);
    const lastWindow = Math.min(DAY_SECONDS - HOUR_SECONDS, endSec);
    if (firstQuietBreach(score, Math.max(0, startSec - HOUR_SECONDS), lastWindow) !== null) score.splice(index, 1);
  }
}

/** Window start (s) of the first hour lacking its quiet run or over its count, or null. */
function firstQuietBreach(
  score: readonly GardenScoreEntry[],
  fromWindow = 0,
  toWindow = DAY_SECONDS - HOUR_SECONDS,
): number | null {
  for (let windowStart = Math.floor(fromWindow / MINUTE) * MINUTE; windowStart <= toWindow; windowStart += MINUTE) {
    const windowEnd = windowStart + HOUR_SECONDS;
    let cursor = windowStart;
    let longest = 0;
    let starts = 0;
    for (const entry of score) {
      const end = entry.startSec + entry.windowSec + entry.holdSec;
      if (entry.startSec >= windowEnd || end <= windowStart) continue;
      if (entry.startSec >= windowStart) starts += 1;
      longest = Math.max(longest, entry.startSec - cursor);
      cursor = Math.max(cursor, end);
    }
    longest = Math.max(longest, windowEnd - cursor);
    if (longest < GARDEN_QUIET_RUN_SECONDS || starts > GARDEN_DISCRETE_EVENTS_PER_HOUR) return windowStart;
  }
  return null;
}

/**
 * The score's hand-off to motion (W1.6 scheduler): every motion-lattice
 * crossing slot that would come within 8 minutes of a scored ritual becomes a
 * gift slot, so fleet-motion routes no crossing there. `clockAtMotionZero` is
 * the score clock (local seconds since midnight) at motion time zero.
 */
export function gardenScoreMotionGifts(
  score: readonly GardenScoreEntry[],
  clockAtMotionZero: number,
  seed: string = GARDEN_ATTENTION_DEFAULT_SEED,
): GardenScoreGift[] {
  if (!Number.isFinite(clockAtMotionZero)) return [];
  const gifts: GardenScoreGift[] = [];
  for (const entry of score) {
    if (entry.kind === "crossing" || !entry.foreground) continue;
    const start = entry.startSec - clockAtMotionZero;
    const end = start + entry.windowSec + entry.holdSec;
    for (const slot of gardenAttentionSlotsBetween(seed, start - GARDEN_FOREGROUND_GAP_SECONDS, end + GARDEN_FOREGROUND_GAP_SECONDS)) {
      if (slot.kind !== "crossing") continue;
      if (slot.startSeconds < end + GARDEN_FOREGROUND_GAP_SECONDS && start < slot.endSeconds + GARDEN_FOREGROUND_GAP_SECONDS) {
        gifts.push({ requestId: entry.id, slotIndex: slot.index, startSeconds: slot.startSeconds, endSeconds: slot.endSeconds });
      }
    }
  }
  return gifts;
}

// --- Runtime driver ------------------------------------------------------------

export interface GardenRitualEvent {
  id: string;
  kind: GardenRitualKind;
  /** Local clock hour the ritual began at. */
  clockHour: number;
  forced: boolean;
  directorSeconds: number;
}

type RitualListener = (event: GardenRitualEvent) => void;

interface RunningRitual {
  kind: GardenRitualKind;
  handler: GardenRitualHandler;
}

const driver = {
  score: [] as readonly GardenScoreEntry[],
  /** Companions waiting for their stagger after the ritual they ride began. */
  pendingCompanions: [] as { entry: GardenScoreEntry; dueSeconds: number; expirySeconds: number }[],
  played: new Set<string>(),
  running: [] as RunningRitual[],
  listeners: new Set<RitualListener>(),
  lastSeconds: Number.NaN,
  firstSeconds: Number.NaN,
  clockHour: 12,
};

/** The day's score (pharosville-world sets it per UTC day). A new day forgets the old day's plays. */
export function setGardenDayScore(score: readonly GardenScoreEntry[]): void {
  if (score === driver.score) return;
  const kept = new Set(score.map((entry) => entry.id));
  for (const id of driver.played) if (!kept.has(id)) driver.played.delete(id);
  for (let index = driver.pendingCompanions.length - 1; index >= 0; index -= 1) {
    if (!kept.has(driver.pendingCompanions[index]!.entry.id)) driver.pendingCompanions.splice(index, 1);
  }
  driver.score = score;
}

export function gardenActiveDayScore(): readonly GardenScoreEntry[] {
  return driver.score;
}

/** Ledger and sound hear every ritual start; returns the unsubscribe. */
export function subscribeGardenRituals(listener: RitualListener): () => void {
  driver.listeners.add(listener);
  return () => driver.listeners.delete(listener);
}

function beginRitual(id: string, kind: GardenRitualKind, t: number, forced: boolean): boolean {
  const handler = gardenRitualHandler(kind);
  const previous = driver.running.findIndex((ritual) => ritual.kind === kind);
  if (previous >= 0) {
    driver.running[previous]!.handler.cancel();
    driver.running.splice(previous, 1);
  }
  if (handler) {
    handler.start(t);
    driver.running.push({ kind, handler });
  }
  const event: GardenRitualEvent = { id, kind, clockHour: driver.clockHour, forced, directorSeconds: t };
  recordDebugRitual(event);
  for (const listener of driver.listeners) listener(event);
  const parent = driver.score.find((entry) => entry.id === id)
    ?? driver.score.find((entry) => entry.kind === kind && entry.companionOf === undefined);
  for (const entry of driver.score) {
    if (!parent || entry.companionOf !== kind || driver.played.has(entry.id)) continue;
    driver.played.add(entry.id);
    driver.pendingCompanions.push({
      entry,
      dueSeconds: t + entry.startSec,
      expirySeconds: t + parent.holdSec,
    });
  }
  return handler !== null || kind === "moonrise";
}

/**
 * idleDepth (§5.0/K16): the longer the viewer stays, the rarer the
 * decorative gifts — at two hours in, a third of them pass unplayed. The
 * kindling (the lamps are data-free but structural) and crossings never thin.
 */
function thinnedByIdle(entry: GardenScoreEntry, sessionSeconds: number): boolean {
  if (entry.kind === "kindling") return false;
  const idleDepth = Math.min(1, Math.max(0, sessionSeconds / 7_200));
  return stableUnit(`${entry.id}:idle`) < 0.35 * idleDepth;
}

export interface GardenScoreTickInput {
  director: GardenDirectorState | undefined;
  /** Director clock (wall epoch seconds). */
  directorSeconds: number;
  /** Local wall-clock hour (the sky's hour). */
  clockHour: number;
  reducedMotion: boolean;
}

/**
 * Once per rendered frame: advance running rituals, keep the next scored
 * ritual's reservation on the director, and start whatever the score admits
 * now. Allocation-free on the steady path.
 */
export function tickGardenScore(input: GardenScoreTickInput): void {
  const t = input.directorSeconds;
  if (!Number.isFinite(t)) return;
  const dt = Number.isFinite(driver.lastSeconds) ? Math.min(0.25, Math.max(0, t - driver.lastSeconds)) : 0;
  driver.lastSeconds = t;
  if (!Number.isFinite(driver.firstSeconds)) driver.firstSeconds = t;
  driver.clockHour = ((input.clockHour % 24) + 24) % 24;
  if (input.reducedMotion) {
    // Reduced motion: one authored static state per ritual, owned by its handler.
    for (const ritual of driver.running) ritual.handler.cancel();
    driver.running.length = 0;
    driver.pendingCompanions.length = 0;
    return;
  }
  for (let index = driver.running.length - 1; index >= 0; index -= 1) {
    if (driver.running[index]!.handler.update(t, dt)) driver.running.splice(index, 1);
  }
  for (let index = driver.pendingCompanions.length - 1; index >= 0; index -= 1) {
    const pending = driver.pendingCompanions[index]!;
    if (t >= pending.expirySeconds) {
      driver.pendingCompanions.splice(index, 1);
      continue;
    }
    if (t < pending.dueSeconds) continue;
    driver.pendingCompanions.splice(index, 1);
    beginRitual(pending.entry.id, pending.entry.kind, t, false);
  }
  const director = input.director;
  if (!director) return;
  const clockSec = driver.clockHour * HOUR_SECONDS;
  let next: GardenScoreEntry | null = null;
  for (const entry of driver.score) {
    if (entry.kind === "crossing" || entry.companionOf !== undefined || driver.played.has(entry.id)) continue;
    if (clockSec >= entry.startSec + entry.windowSec) {
      if (entry.kind === "fish-rings") driver.played.add(entry.id);
      continue;
    }
    // Nothing would draw it, so nothing is logged: a kind plays only once its
    // owner has registered (the moonrise alone is drawn continuously by the sky).
    if (entry.kind !== "moonrise" && !gardenRitualHandler(entry.kind)) continue;
    if (clockSec >= entry.startSec) {
      // A forced run of the same ritual already covers this window: no double walk.
      if (thinnedByIdle(entry, t - driver.firstSeconds) || driver.running.some((ritual) => ritual.kind === entry.kind)) {
        driver.played.add(entry.id);
        continue;
      }
      const beat = requestGardenBeat(director, {
        kind: "ritual",
        foreground: entry.foreground,
        durationSeconds: entry.holdSec,
        priority: 30,
        subject: entry.id,
      }, t);
      // A ring is a passing offer, not a retry when the frame becomes quiet.
      if (entry.kind === "fish-rings") driver.played.add(entry.id);
      if (beat) {
        driver.played.add(entry.id);
        beginRitual(entry.id, entry.kind, t, false);
      }
      continue;
    }
    if (entry.foreground && (next === null || entry.startSec < next.startSec)) next = entry;
  }
  reserveGardenRitual(director, next ? {
    startSeconds: t + (next.startSec - clockSec),
    endSeconds: t + (next.startSec - clockSec) + next.windowSec + next.holdSec,
  } : null);
}

/** Debug seam (`__pharosVilleDebug.forceRitual`): start a ritual now, outside the score. */
export function forceGardenRitual(kind: GardenRitualKind, directorSeconds?: number): boolean {
  // The driver's own clock, so the handler's start and its updates share one timeline.
  const t = directorSeconds ?? (Number.isFinite(driver.lastSeconds) ? driver.lastSeconds : Date.now() / 1000);
  // A forced ritual stands in for today's scored one if its window is open or opens within the hour.
  const clockSec = driver.clockHour * HOUR_SECONDS;
  for (const entry of driver.score) {
    if (entry.kind === kind && clockSec < entry.startSec + entry.windowSec && entry.startSec - clockSec < HOUR_SECONDS) {
      driver.played.add(entry.id);
    }
  }
  return beginRitual(`forced:${kind}:${Math.round(t)}`, kind, t, true);
}

/** Renderer disposal: stop every running ritual. */
export function cancelGardenRituals(): void {
  for (const ritual of driver.running) ritual.handler.cancel();
  driver.running.length = 0;
  driver.pendingCompanions.length = 0;
}
