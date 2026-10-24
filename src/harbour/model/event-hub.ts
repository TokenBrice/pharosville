/**
 * The 'events' service: the detector (events.ts) + the rarity scheduler (moments.ts) + the Day book, behind one
 * subscribe API. Driven by the readings system (readings/readings-system.ts): `observe` after every model build,
 * `tick` every frame (cheap: it does work only while a moment is queued or running). No renderer, no clock reads.
 *
 * Consumers (audio, moments, camera lanes):
 *   const ev = ctx.services.get("events") as EventsService | undefined;
 *   ev?.onMoment((m) => stage(m.event.kind, m.event.coinId, m.endMs));   // staged moments only, already budgeted
 *   ev?.subscribe(() => render(ev.book));                                  // any change: book or staging
 * A staged moment must be over by `m.endMs` (≤ 20 s). Under reduced motion nothing is staged; the book records all.
 */
import { detectEvents, eventSnapshot, type EventState, type HarbourEvent } from "./events";
import { EMPTY_MOMENTS, stepMoments, type MomentState, type StagedMoment } from "./moments";
import type { HarbourModel, HarbourPayloads } from "./types";

export type { HarbourEvent, StagedMoment };

export interface DayBookEntry extends HarbourEvent {
  /** True once this event was staged as a moment in the world (false: recorded only). */
  staged: boolean;
}

export interface EventsService {
  /** Bumped on every change (a new entry, a moment starting or ending). */
  readonly version: number;
  /** Wall-clock ms the viewer arrived (the Day book is "since you arrived"). */
  readonly arrivedAtMs: number;
  /** Every confirmed event since arrival, newest first (capped at DAY_BOOK_MAX). */
  readonly book: readonly DayBookEntry[];
  /** The moment being staged right now, or null. */
  readonly current: StagedMoment | null;
  subscribe(fn: () => void): () => void;
  onMoment(fn: (m: StagedMoment) => void): () => void;
}

export const DAY_BOOK_MAX = 200;

export class HarbourEventHub implements EventsService {
  private detector: EventState | null = null;
  private moments: MomentState = EMPTY_MOMENTS;
  private entries: DayBookEntry[] = [];
  private ver = 0;
  private readonly listeners = new Set<() => void>();
  private readonly momentListeners = new Set<(m: StagedMoment) => void>();

  constructor(readonly arrivedAtMs: number) {}

  get version(): number { return this.ver; }
  get book(): readonly DayBookEntry[] { return this.entries; }
  get current(): StagedMoment | null { return this.moments.current; }

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  /** A late subscriber still hears the moment on stage now (it may have been staged earlier in this frame). */
  onMoment(fn: (m: StagedMoment) => void): () => void {
    this.momentListeners.add(fn);
    const now = this.moments.current;
    if (now) fn(now);
    return () => { this.momentListeners.delete(fn); };
  }

  /** After a model build: detect, record, schedule. Returns the events confirmed by this build. */
  observe(model: HarbourModel, payloads: HarbourPayloads, nowMs: number, reduced: boolean): HarbourEvent[] {
    const r = detectEvents(this.detector, eventSnapshot(model, payloads, nowMs));
    this.detector = r.state;
    this.feed(r.events, nowMs, reduced);
    return r.events;
  }

  /** Dev only (`?moment=`): put a synthetic event through the same book and budget. */
  inject(e: HarbourEvent, nowMs: number, reduced: boolean): void { this.feed([{ ...e, dev: true }], nowMs, reduced); }

  /** Every frame: releases a queued moment when the budget allows, ends the current one. */
  tick(nowMs: number, reduced: boolean): void {
    const m = this.moments;
    if (!m.queued && !m.current) return;
    this.feed([], nowMs, reduced);
  }

  private feed(events: readonly HarbourEvent[], nowMs: number, reduced: boolean): void {
    let changed = false;
    if (events.length) {
      this.entries = [...events.map((e) => ({ ...e, staged: false })).reverse(), ...this.entries].slice(0, DAY_BOOK_MAX);
      changed = true;
    }
    const before = this.moments.current;
    const s = stepMoments(this.moments, nowMs, events, { reduced });
    this.moments = s.state;
    if (s.staged) {
      const id = s.staged.event.id;
      this.entries = this.entries.map((e) => (e.id === id ? { ...e, staged: true } : e));
    }
    if (s.staged || before !== this.moments.current) changed = true;
    if (changed) { this.ver++; for (const fn of this.listeners) fn(); }
    if (s.staged) for (const fn of this.momentListeners) fn(s.staged);
  }
}
