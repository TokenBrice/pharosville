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
}

function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) value = Math.imul(value ^ text.charCodeAt(i), 0x01000193);
  return value >>> 0;
}

export function createGardenDirector(seed: string): GardenDirectorState {
  return {
    active: null,
    lastForegroundEndSeconds: Number.NEGATIVE_INFINITY,
    log: [],
    seed,
    sequence: 0,
    silenceSeconds: 360 + hash(`${seed}:silence:0`) % 361,
    nextEnvironmentSeconds: Number.NEGATIVE_INFINITY,
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
