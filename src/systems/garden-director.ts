import { recordDebugDirectorAdmission } from "../lib/pharosville-debug";

export type GardenBeatKind = "arrival" | "keeper" | "weather" | "fog" | "almanac" | "attract" | "market" | "ritual";

export interface GardenBeatRequest {
  kind: GardenBeatKind;
  foreground: boolean;
  durationSeconds: number;
  priority: number;
  subject?: string;
  /** Visible motion and lingering traces never extend attention ownership. */
  envelopeSeconds?: number;
  evidenceSeconds?: number;
}

export interface GardenBeat extends GardenBeatRequest {
  id: string;
  startSeconds: number;
}

export interface GardenDirectorState {
  active: GardenBeat | null;
  lastForegroundEndSeconds: number;
  log: readonly GardenBeat[];
}

interface SeededDirectorState extends GardenDirectorState {
  seed: string;
  sequence: number;
  silenceSeconds: number;
  nextEnvironmentSeconds: number;
  /** No ordinary foreground beat before this time (arrival silence, K17). */
  quietUntilSeconds: number;
  /** End of the last admitted ritual; every discrete event backs off 90 s after it. */
  lastRitualEndSeconds: number;
  /** The next scored ritual's attention span; other foreground beats keep 8 min clear of it. */
  reservation: { startSeconds: number; endSeconds: number } | null;
}

/**
 * K17 / W0.11: a freshly created director owns no caption for its first 90 s,
 * so the first sentence a visitor reads is the market's phase line, never a
 * minor arrival. Market pre-emption (priority ≥ 100) still speaks.
 */
export const GARDEN_DIRECTOR_INITIAL_SILENCE_SECONDS = 90;

/** §5.0 attention budget, enforced at admission for every discrete event. */
export const GARDEN_DISCRETE_EVENTS_PER_HOUR = 6;
export const GARDEN_QUIET_RUN_SECONDS = 720;
export const GARDEN_FOREGROUND_GAP_SECONDS = 480;
export const GARDEN_RITUAL_BACKOFF_SECONDS = 90;
const HOUR_SECONDS = 3_600;

function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) value = Math.imul(value ^ text.charCodeAt(i), 0x01000193);
  return value >>> 0;
}

/** 8–12 minutes of silence after a foreground beat (§5.0: ≥ 8 min apart). */
function foregroundSilence(seed: string, sequence: number): number {
  return GARDEN_FOREGROUND_GAP_SECONDS + hash(`${seed}:silence:${sequence}`) % 241;
}

/**
 * `createdAtSeconds` is the director clock at creation (wall epoch seconds in
 * the app); when given, foreground beats wait out the initial silence.
 */
export function createGardenDirector(seed: string, createdAtSeconds?: number): GardenDirectorState {
  return {
    active: null,
    lastForegroundEndSeconds: Number.NEGATIVE_INFINITY,
    log: [],
    seed,
    sequence: 0,
    silenceSeconds: foregroundSilence(seed, 0),
    nextEnvironmentSeconds: Number.NEGATIVE_INFINITY,
    quietUntilSeconds: createdAtSeconds !== undefined && Number.isFinite(createdAtSeconds)
      ? createdAtSeconds + GARDEN_DIRECTOR_INITIAL_SILENCE_SECONDS
      : Number.NEGATIVE_INFINITY,
    lastRitualEndSeconds: Number.NEGATIVE_INFINITY,
    reservation: null,
  } as SeededDirectorState;
}

/** A discrete event (§5.0): anything that takes the viewer's eye, plus every ritual. */
function isDiscrete(beat: GardenBeatRequest): boolean {
  return beat.foreground || beat.kind === "ritual";
}

/**
 * The §5.0 look-back: admitting `[start, end)` must keep the hour ending at
 * `end` at ≤ 6 discrete events, and every hour ending in the next 12 minutes
 * (if nothing else happens) must still hold one unbroken 12-minute quiet —
 * otherwise a later hour would inherit a budget it cannot repair.
 */
function keepsHourBudget(log: readonly GardenBeat[], start: number, end: number): boolean {
  const spans: [number, number][] = [[start, end]];
  let count = 1;
  for (const beat of log) {
    if (!isDiscrete(beat)) continue;
    const beatEnd = beat.startSeconds + beat.durationSeconds;
    if (beatEnd <= end - HOUR_SECONDS || beat.startSeconds >= end) continue;
    spans.push([beat.startSeconds, beatEnd]);
    if (beat.startSeconds >= end - HOUR_SECONDS) count += 1;
  }
  if (count > GARDEN_DISCRETE_EVENTS_PER_HOUR) return false;
  spans.sort((left, right) => left[0] - right[0]);
  for (let windowEnd = end; windowEnd <= end + GARDEN_QUIET_RUN_SECONDS; windowEnd += 15) {
    const windowStart = windowEnd - HOUR_SECONDS;
    let cursor = windowStart;
    let longest = 0;
    for (const [spanStart, spanEnd] of spans) {
      if (spanEnd <= windowStart) continue;
      longest = Math.max(longest, spanStart - cursor);
      cursor = Math.max(cursor, spanEnd);
    }
    if (Math.max(longest, windowEnd - cursor) < GARDEN_QUIET_RUN_SECONDS) return false;
  }
  return true;
}

/**
 * The score's next ritual (director clock) or null. Other foreground beats
 * keep 8 minutes clear on both sides, so a crossing never takes the minutes a
 * scored ritual has been promised.
 */
export function reserveGardenRitual(
  state: GardenDirectorState,
  reservation: { startSeconds: number; endSeconds: number } | null,
): void {
  if (Object.isFrozen(state)) return;
  (state as SeededDirectorState).reservation = reservation;
}

/** Requests mutate their owned state; advancing returns a new state only on expiry. */
export function requestGardenBeat(
  state: GardenDirectorState,
  request: GardenBeatRequest,
  timeSeconds: number,
): GardenBeat | null {
  if (Object.isFrozen(state)) return null;
  if (!Number.isFinite(timeSeconds) || !Number.isFinite(request.durationSeconds)
    || request.durationSeconds <= 0 || !Number.isFinite(request.priority)) return null;
  const owned = state as SeededDirectorState;
  if (owned.active && timeSeconds >= owned.active.startSeconds + owned.active.durationSeconds) {
    if (owned.active.foreground) owned.lastForegroundEndSeconds = owned.active.startSeconds + owned.active.durationSeconds;
    owned.active = null;
  }
  const market = request.kind === "market" && request.priority >= 100;
  const ritual = request.kind === "ritual";
  const end = timeSeconds + request.durationSeconds;
  if (!market) {
    if (owned.active && (owned.active.foreground || !request.foreground || request.priority <= owned.active.priority)) return null;
    if (request.foreground && timeSeconds < owned.quietUntilSeconds) return null;
    if (!request.foreground && !ritual && timeSeconds < owned.nextEnvironmentSeconds) return null;
    if (isDiscrete(request)) {
      // A ritual keeps the §5.0 floor exactly; other beats their seeded 8–12 min.
      const gap = ritual ? GARDEN_FOREGROUND_GAP_SECONDS : owned.silenceSeconds;
      if (request.foreground && timeSeconds < owned.lastForegroundEndSeconds + gap) return null;
      if (timeSeconds < owned.lastRitualEndSeconds + GARDEN_RITUAL_BACKOFF_SECONDS) return null;
      const reserved = owned.reservation;
      if (!ritual && request.foreground && reserved
        && end + GARDEN_FOREGROUND_GAP_SECONDS > reserved.startSeconds
        && timeSeconds < reserved.endSeconds + GARDEN_FOREGROUND_GAP_SECONDS) return null;
      if (!keepsHourBudget(owned.log, timeSeconds, end)) return null;
    }
  }
  if (owned.active?.foreground) owned.lastForegroundEndSeconds = timeSeconds;
  const beat: GardenBeat = { ...request, id: `${owned.seed}:${owned.sequence++}`, startSeconds: timeSeconds };
  owned.active = beat;
  owned.log = [...owned.log.slice(-63), beat];
  if (ritual) owned.lastRitualEndSeconds = end;
  if (request.foreground) {
    owned.silenceSeconds = foregroundSilence(owned.seed, owned.sequence);
  } else if (!ritual) {
    // One admitted environmental cue every 6–10 minutes under continuous demand.
    owned.nextEnvironmentSeconds = timeSeconds + 360 + hash(`${owned.seed}:environment:${owned.sequence}`) % 241;
  }
  recordDebugDirectorAdmission(beat);
  return beat;
}

/** Resume at now, never synthesize missed occurrences or replay the log. */
export function advanceGardenDirector(state: GardenDirectorState, timeSeconds: number): GardenDirectorState {
  const active = state.active;
  if (!active || timeSeconds < active.startSeconds + active.durationSeconds || !Number.isFinite(timeSeconds)) return state;
  return {
    ...state,
    active: null,
    lastForegroundEndSeconds: active.foreground
      ? active.startSeconds + active.durationSeconds
      : state.lastForegroundEndSeconds,
  };
}

/** Seconds since the last admitted ritual ended (attract backs off for 90 s). */
export function gardenRitualQuietSeconds(state: GardenDirectorState, timeSeconds: number): number {
  const end = (state as SeededDirectorState).lastRitualEndSeconds ?? Number.NEGATIVE_INFINITY;
  return timeSeconds - end;
}

// --- Ritual registry (contract S-A) ---------------------------------------------

export type GardenRitualKind =
  | "heron-arrives"
  | "heron-departs"
  | "kindling"
  | "moonrise"
  | "meteor"
  | "seasonal-visitor"
  | "crossing";

export const GARDEN_RITUAL_KINDS: readonly GardenRitualKind[] = [
  "heron-arrives", "heron-departs", "kindling", "moonrise", "meteor", "seasonal-visitor", "crossing",
];

/**
 * A ritual's visual owner. The score driver calls `start` once when the day
 * score admits the ritual (or the debug seam forces it), `update` every frame
 * until it returns true, and `cancel` if it must stop early. `t` is the
 * director clock (wall epoch seconds); `dt` the seconds since the last call.
 */
export interface GardenRitualHandler {
  start(t: number): void;
  update(t: number, dt: number): boolean;
  cancel(): void;
}

const ritualHandlers = new Map<GardenRitualKind, GardenRitualHandler>();

/** One handler per kind (the last registration wins); returns its unregister. */
export function registerRitual(kind: GardenRitualKind, handler: GardenRitualHandler): () => void {
  ritualHandlers.set(kind, handler);
  return () => {
    if (ritualHandlers.get(kind) === handler) ritualHandlers.delete(kind);
  };
}

export function gardenRitualHandler(kind: GardenRitualKind): GardenRitualHandler | null {
  return ritualHandlers.get(kind) ?? null;
}
