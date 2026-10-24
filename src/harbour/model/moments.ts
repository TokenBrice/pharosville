/**
 * The rarity scheduler: which confirmed events (model/events.ts) the world may STAGE as a moment, and when.
 * Pure (the caller passes the time), unit-tested in moments.test.ts. Calm is enforced here, in code:
 *
 *   - at most one staged moment per MOMENT_GAP_MS (3 min), at most MOMENT_HOUR_MAX (6) in any rolling hour;
 *   - each moment lasts at most MOMENT_MAX_MS (20 s), then the world returns to rest;
 *   - priority death > depeg > recovery > launch > band change (PSI, DEWS) > flow hour. Hull-class and grade
 *     changes are never staged (Day book only);
 *   - one moment may wait in the queue (the highest priority seen); everything else, and a queued moment that
 *     waited longer than QUEUE_MAX_WAIT_MS, goes to the Day book unstaged;
 *   - reduced motion: nothing is staged, the Day book still records everything.
 * Every confirmed event reaches the Day book whatever happens here; this only decides the ceremony.
 */
import type { EventKind, HarbourEvent } from "./events";

export const MOMENT_GAP_MS = 3 * 60_000;
export const MOMENT_HOUR_MAX = 6;
export const MOMENT_MAX_MS = 20_000;
export const QUEUE_MAX_WAIT_MS = 3 * 60_000;
const HOUR_MS = 60 * 60_000;

/** Higher stages first; absent = never staged. */
export const MOMENT_PRIORITY: Partial<Record<EventKind, number>> = {
  death: 6, depeg: 5, recovery: 4, launch: 3, "psi-band": 2, "dews-band": 2, "flow-hour": 1,
};
/** How long each kind's ceremony runs (all ≤ MOMENT_MAX_MS). */
export const MOMENT_DURATION_MS: Partial<Record<EventKind, number>> = {
  death: 20_000, depeg: 15_000, recovery: 15_000, launch: 18_000, "psi-band": 10_000, "dews-band": 10_000, "flow-hour": 8_000,
};

export interface StagedMoment {
  event: HarbourEvent;
  startMs: number;
  /** The ceremony must be over (the world at rest) by this time: startMs + ≤ MOMENT_MAX_MS. */
  endMs: number;
}

export interface MomentState {
  /** Start times of the moments staged in the last hour, oldest first. */
  starts: number[];
  queued: HarbourEvent | null;
  current: StagedMoment | null;
}

export const EMPTY_MOMENTS: MomentState = { starts: [], queued: null, current: null };

export const stageable = (e: HarbourEvent): boolean => MOMENT_PRIORITY[e.kind] != null;

function better(a: HarbourEvent, b: HarbourEvent): boolean {
  const pa = MOMENT_PRIORITY[a.kind] ?? -1, pb = MOMENT_PRIORITY[b.kind] ?? -1;
  return pa > pb || (pa === pb && a.atMs < b.atMs);
}

/**
 * One step: the incoming confirmed events at `nowMs` (may be empty: a tick) → the moment to stage now (or null)
 * and the events that will not be staged. Pure: `prev` is not mutated.
 */
export function stepMoments(prev: MomentState, nowMs: number, incoming: readonly HarbourEvent[], opts: { reduced: boolean }): { state: MomentState; staged: StagedMoment | null; unstaged: HarbourEvent[] } {
  const starts = prev.starts.filter((t) => nowMs - t < HOUR_MS);
  const current = prev.current && nowMs < prev.current.endMs ? prev.current : null;
  const unstaged: HarbourEvent[] = [];
  let best: HarbourEvent | null = null;
  const cands = prev.queued ? [prev.queued, ...incoming] : [...incoming];
  for (const e of cands) {
    if (!stageable(e) || opts.reduced || nowMs - e.atMs > QUEUE_MAX_WAIT_MS) { unstaged.push(e); continue; }
    if (!best) best = e;
    else if (better(e, best)) { unstaged.push(best); best = e; }
    else unstaged.push(e);
  }
  const last = starts.length ? starts[starts.length - 1] : -Infinity;
  if (best && !current && nowMs - last >= MOMENT_GAP_MS && starts.length < MOMENT_HOUR_MAX) {
    const dur = Math.min(MOMENT_MAX_MS, MOMENT_DURATION_MS[best.kind] ?? MOMENT_MAX_MS);
    const staged: StagedMoment = { event: best, startMs: nowMs, endMs: nowMs + dur };
    return { state: { starts: [...starts, nowMs], queued: null, current: staged }, staged, unstaged };
  }
  return { state: { starts, queued: best, current }, staged: null, unstaged };
}
