import { recordDebugDirectorAdmission } from "../lib/pharosville-debug";

export type GardenBeatKind = "arrival" | "keeper" | "weather" | "fog" | "almanac" | "attract" | "market";

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
}

/**
 * K17 / W0.11: a freshly created director owns no caption for its first 90 s,
 * so the first sentence a visitor reads is the market's phase line, never a
 * minor arrival. Market pre-emption (priority ≥ 100) still speaks.
 */
export const GARDEN_DIRECTOR_INITIAL_SILENCE_SECONDS = 90;

function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) value = Math.imul(value ^ text.charCodeAt(i), 0x01000193);
  return value >>> 0;
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
    silenceSeconds: 360 + hash(`${seed}:silence:0`) % 361,
    nextEnvironmentSeconds: Number.NEGATIVE_INFINITY,
    quietUntilSeconds: createdAtSeconds !== undefined && Number.isFinite(createdAtSeconds)
      ? createdAtSeconds + GARDEN_DIRECTOR_INITIAL_SILENCE_SECONDS
      : Number.NEGATIVE_INFINITY,
  } as SeededDirectorState;
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
  if (!market) {
    if (owned.active && (owned.active.foreground || !request.foreground || request.priority <= owned.active.priority)) return null;
    if (request.foreground && timeSeconds < owned.lastForegroundEndSeconds + owned.silenceSeconds) return null;
    if (request.foreground && timeSeconds < owned.quietUntilSeconds) return null;
    if (!request.foreground && timeSeconds < owned.nextEnvironmentSeconds) return null;
  }
  if (owned.active?.foreground) owned.lastForegroundEndSeconds = timeSeconds;
  const beat: GardenBeat = { ...request, id: `${owned.seed}:${owned.sequence++}`, startSeconds: timeSeconds };
  owned.active = beat;
  owned.log = [...owned.log.slice(-63), beat];
  if (request.foreground) {
    owned.silenceSeconds = 360 + hash(`${owned.seed}:silence:${owned.sequence}`) % 361;
  } else {
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
