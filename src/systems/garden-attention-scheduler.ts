import { stableHash } from "./stable-random";

/**
 * The one attention scheduler (plan W1.6, K21, §5.0 attention budget).
 *
 * Every discrete event the rest frame may show — an inlet crossing, a score
 * gift (heron, kindling, moonrise, leaf fall, the anniversary lantern), the
 * anchorage swinging to a wind shift — happens only in an **attention slot**
 * this module issues. Continuous ambient motion (swell, gusts, lantern breath,
 * the fleet's windowed voyages) is not an event and never asks. The slot
 * lattice alone makes the §5.0 ceilings hold:
 *
 * - Two slots per hour, `GARDEN_ATTENTION_SLOT_PERIOD_SECONDS` apart, each
 *   holding the frame for at most `GARDEN_ATTENTION_SLOT_HOLD_SECONDS`. Any
 *   60-minute window therefore starts at most 2 events (ceiling 6) and holds
 *   a whole slot-free gap of 21 minutes (ceiling: one unbroken 12-minute quiet).
 * - Consecutive holds are 21 minutes apart, so crossings keep their 15-minute
 *   spacing and gifts their 8-minute spacing by construction.
 * - Each slot carries one thing: a crossing token, a score gift, or a wind
 *   shift. Gifts are admitted by `planGardenScoreGifts` (≤ 6 per rolling 24 h,
 *   ≤ 2 inside any dusk interval between golden 0.5 and night 0.5); wind
 *   shifts take two fixed slots a day (K21, K45a: the anchor swing is keyed to
 *   the wind, never to a tide); crossings take the rest.
 *
 * Pure and deterministic: a slot is a function of the seed and the clock only.
 * The clock is the motion clock (`motionTimeSeconds` in the render loop);
 * callers on another clock (the director's wall epoch) convert first.
 *
 * Consumers
 * - Motion planning (now): `buildBaseMotionPlan` hands each crossing slot's
 *   token to the most significant ceremony subject whose arrival voyage starts
 *   inside the slot's admit window and ends inside its hold; only that voyage
 *   routes through the inlet (`ShipMotionRoute.inletCrossings`).
 * - Director / day score (W5): pass the score's ritual requests through
 *   `planGardenScoreGifts`, play each admitted gift at its slot start, and pass
 *   the same gift list to `buildBaseMotionPlan` so motion leaves those slots
 *   unclaimed. The arrival ceremony nominates the token holder
 *   (`inletCrossingTokensBetween` in `motion-planning.ts`) as its subject.
 * - Voyage cadence (W4.F11): `gardenVoyageWindowAt` names the windows the
 *   fleet's departures and homecomings gather in; every slot opens a few
 *   minutes before a homecoming window, so a crossing voyage lands in it.
 * - Anchorages (W4.F9): `gardenWindShiftsBetween` names the settled wind
 *   bearings the anchored fleet rides to; a shift swings the anchorage once.
 */

/**
 * Voyage lattice: one departure window and one homecoming window per period.
 * Departures open the period and homecomings land in a window five minutes
 * later, so most of a period's voyages overlap into one gathering and the
 * rest of the period is a stand in which only a few stray hulls move.
 */
export const GARDEN_VOYAGE_PERIOD_SECONDS = 900;
/** Lattice offsets (seconds into the period) of the two gathering windows. */
export const GARDEN_VOYAGE_DEPARTURE_START_SECONDS = 0;
export const GARDEN_VOYAGE_HOMECOMING_START_SECONDS = 300;
export const GARDEN_VOYAGE_WINDOW_SECONDS = 150;
/**
 * Share of identities whose cast-off (and, independently, landfall) gathers
 * in its window; the rest fall anywhere else in the period. A hard lattice
 * made a regatta of every window (the whole fleet under way at once); this
 * weighting keeps the stand under a tenth of the hulls moving while a window
 * holds about a third.
 */
export const GARDEN_VOYAGE_WINDOW_SHARE = 0.75;
/**
 * Lattice offset at motion time zero. The motion clock starts when the world
 * loads, and 600 s lands the load in the stand: the harbour you arrive at is
 * quiet, and the first departures gather five minutes in (§5.0 / W0.11).
 */
export const GARDEN_VOYAGE_LATTICE_OFFSET_AT_ZERO_SECONDS = 600;

export const GARDEN_ATTENTION_SLOT_PERIOD_SECONDS = 1_800;
/** A crossing voyage or gift must begin inside this lead of its slot. */
export const GARDEN_ATTENTION_SLOT_ADMIT_SECONDS = 240;
/** …and be finished (out of the frame's attention) by this far into it. */
export const GARDEN_ATTENTION_SLOT_HOLD_SECONDS = 540;

/** §5.0 ceilings, stated once for gates and tests. */
export const GARDEN_ATTENTION_EVENT_CEILING_PER_HOUR = 6;
export const GARDEN_ATTENTION_QUIET_MIN_SECONDS = 720;
export const GARDEN_CROSSING_MIN_GAP_SECONDS = 900;
export const GARDEN_SCORE_GIFT_MIN_GAP_SECONDS = 480;
export const GARDEN_SCORE_GIFT_DAILY_CEILING = 6;
export const GARDEN_SCORE_GIFT_DUSK_CEILING = 2;
/** K21/§5.0: the anchorage swings to a wind shift at most twice a day. */
export const GARDEN_WIND_SHIFT_DAILY_CEILING = 2;
/**
 * A wind shift begins just after its slot's homecoming window closes, so the
 * swing plays in the stand that follows and is over (80 s swing + ≤ 45 s
 * lag across the anchorage) before the slot's hold ends.
 */
export const GARDEN_WIND_SHIFT_SLOT_OFFSET_SECONDS = 400;

export const GARDEN_ATTENTION_DEFAULT_SEED = "pharosville.attention";

const DAY_SECONDS = 86_400;
const SLOTS_PER_DAY = DAY_SECONDS / GARDEN_ATTENTION_SLOT_PERIOD_SECONDS;

export type GardenVoyageWindow = "departures" | "homecomings" | "stand";

/** Seconds into the voyage lattice period at a motion-clock instant. */
export function gardenVoyageLatticeOffset(timeSeconds: number): number {
  const period = GARDEN_VOYAGE_PERIOD_SECONDS;
  const time = (Number.isFinite(timeSeconds) ? timeSeconds : 0) + GARDEN_VOYAGE_LATTICE_OFFSET_AT_ZERO_SECONDS;
  return (time % period + period) % period;
}

/**
 * Which voyage window the fleet is in. Most departures begin inside the
 * departure window and most homecomings end inside the homecoming window
 * (`GARDEN_VOYAGE_WINDOW_SHARE`); between them the harbour stands.
 */
export function gardenVoyageWindowAt(timeSeconds: number): GardenVoyageWindow {
  const offset = gardenVoyageLatticeOffset(timeSeconds);
  if (offset >= GARDEN_VOYAGE_DEPARTURE_START_SECONDS && offset < GARDEN_VOYAGE_DEPARTURE_START_SECONDS + GARDEN_VOYAGE_WINDOW_SECONDS) return "departures";
  if (offset >= GARDEN_VOYAGE_HOMECOMING_START_SECONDS && offset < GARDEN_VOYAGE_HOMECOMING_START_SECONDS + GARDEN_VOYAGE_WINDOW_SECONDS) return "homecomings";
  return "stand";
}

export interface GardenAttentionSlot {
  /** Global slot ordinal on this seed's lattice (may be negative). */
  index: number;
  kind: "crossing" | "gift" | "wind-shift";
  /** Set when `kind` is "gift". */
  giftId: string | null;
  startSeconds: number;
  /** Last instant a crossing voyage or gift may begin. */
  admitEndSeconds: number;
  /** Everything the slot admitted is over by this instant. */
  endSeconds: number;
}

/**
 * Lattice phase for a seed: a slot opens four minutes before a homecoming
 * window (so a crossing voyage that starts in its admit lands in the window),
 * on one of the two such windows in each half hour.
 */
function slotPhaseSeconds(seed: string): number {
  const period = GARDEN_VOYAGE_PERIOD_SECONDS;
  const firstHomecoming = ((GARDEN_VOYAGE_HOMECOMING_START_SECONDS - GARDEN_VOYAGE_LATTICE_OFFSET_AT_ZERO_SECONDS) % period + period) % period;
  return firstHomecoming - GARDEN_ATTENTION_SLOT_ADMIT_SECONDS + (stableHash(`${seed}.attention-phase`) % 2) * period;
}

/** The day's two wind-shift slots: one in each half of the day's slot lattice. */
function isWindShiftSlot(seed: string, index: number): boolean {
  const day = Math.floor(index / SLOTS_PER_DAY);
  const inDay = index - day * SLOTS_PER_DAY;
  const half = SLOTS_PER_DAY / 2;
  const first = stableHash(`${seed}.wind-shift.${day}.0`) % half;
  const second = half + stableHash(`${seed}.wind-shift.${day}.1`) % half;
  return inDay === first || inDay === second;
}

function slotAt(seed: string, index: number, gifts: readonly GardenScoreGift[]): GardenAttentionSlot {
  const startSeconds = index * GARDEN_ATTENTION_SLOT_PERIOD_SECONDS + slotPhaseSeconds(seed);
  const gift = gifts.find((entry) => entry.slotIndex === index) ?? null;
  return {
    index,
    kind: gift ? "gift" : isWindShiftSlot(seed, index) ? "wind-shift" : "crossing",
    giftId: gift?.requestId ?? null,
    startSeconds,
    admitEndSeconds: startSeconds + GARDEN_ATTENTION_SLOT_ADMIT_SECONDS,
    endSeconds: startSeconds + GARDEN_ATTENTION_SLOT_HOLD_SECONDS,
  };
}

/** Slots whose hold overlaps `[fromSeconds, toSeconds)`, in time order. */
export function gardenAttentionSlotsBetween(
  seed: string,
  fromSeconds: number,
  toSeconds: number,
  gifts: readonly GardenScoreGift[] = [],
): GardenAttentionSlot[] {
  if (!Number.isFinite(fromSeconds) || !Number.isFinite(toSeconds) || toSeconds <= fromSeconds) return [];
  const phase = slotPhaseSeconds(seed);
  const first = Math.floor((fromSeconds - phase - GARDEN_ATTENTION_SLOT_HOLD_SECONDS) / GARDEN_ATTENTION_SLOT_PERIOD_SECONDS) + 1;
  const slots: GardenAttentionSlot[] = [];
  for (let index = first; ; index += 1) {
    const slot = slotAt(seed, index, gifts);
    if (slot.startSeconds >= toSeconds) break;
    if (slot.endSeconds > fromSeconds) slots.push(slot);
  }
  return slots;
}

/** The slot holding the frame at `timeSeconds`, or null in the quiet between. */
export function gardenAttentionSlotAt(
  seed: string,
  timeSeconds: number,
  gifts: readonly GardenScoreGift[] = [],
): GardenAttentionSlot | null {
  return gardenAttentionSlotsBetween(seed, timeSeconds, timeSeconds + 1e-6, gifts)[0] ?? null;
}

export interface GardenScoreRequest {
  /** Stable ritual id (e.g. `heron-departs:2026-09-26`). */
  id: string;
  /** The ritual's own window on the scheduler clock. */
  earliestSeconds: number;
  latestSeconds: number;
  /** Higher first when requests compete for slots or ceilings. */
  priority: number;
}

export interface GardenScoreGift {
  requestId: string;
  slotIndex: number;
  startSeconds: number;
  endSeconds: number;
}

/**
 * Admits score gifts into attention slots. A request takes the earliest free
 * slot that starts inside its window, provided the rolling 24-hour count stays
 * ≤ 6 and no dusk interval would hold more than 2; otherwise it is declined
 * (the ritual simply does not happen today). Requests are considered by
 * priority, then window start, then id, so the plan is order-independent.
 */
export function planGardenScoreGifts(
  seed: string,
  requests: readonly GardenScoreRequest[],
  options: { duskIntervals?: readonly { startSeconds: number; endSeconds: number }[] } = {},
): GardenScoreGift[] {
  const dusk = options.duskIntervals ?? [];
  const gifts: GardenScoreGift[] = [];
  const ordered = requests
    .filter((request) => Number.isFinite(request.earliestSeconds) && Number.isFinite(request.latestSeconds))
    .toSorted((left, right) => (
      right.priority - left.priority
      || left.earliestSeconds - right.earliestSeconds
      || left.id.localeCompare(right.id)
    ));
  for (const request of ordered) {
    if (gifts.some((gift) => gift.requestId === request.id)) continue;
    const candidates = gardenAttentionSlotsBetween(seed, request.earliestSeconds, request.latestSeconds + 1e-6, gifts)
      .filter((slot) => slot.startSeconds >= request.earliestSeconds && slot.startSeconds <= request.latestSeconds);
    for (const slot of candidates) {
      if (slot.kind !== "crossing") continue;
      const inRollingDay = gifts.filter((gift) => Math.abs(gift.startSeconds - slot.startSeconds) < DAY_SECONDS).length;
      if (inRollingDay >= GARDEN_SCORE_GIFT_DAILY_CEILING) continue;
      const duskFull = dusk.some((interval) => (
        slot.startSeconds >= interval.startSeconds
        && slot.startSeconds < interval.endSeconds
        && gifts.filter((gift) => gift.startSeconds >= interval.startSeconds && gift.startSeconds < interval.endSeconds).length
          >= GARDEN_SCORE_GIFT_DUSK_CEILING
      ));
      if (duskFull) continue;
      gifts.push({
        requestId: request.id,
        slotIndex: slot.index,
        startSeconds: slot.startSeconds,
        endSeconds: slot.endSeconds,
      });
      break;
    }
  }
  return gifts.toSorted((left, right) => left.startSeconds - right.startSeconds);
}

/**
 * One wind shift: the settled bearing the anchored fleet lies to turns from
 * `fromOffsetRad` to `toOffsetRad` (radians from the harbour's default
 * bearing), starting at `startSeconds` on the motion clock.
 */
export interface GardenWindShift {
  slotIndex: number;
  startSeconds: number;
  fromOffsetRad: number;
  toOffsetRad: number;
}

/**
 * Settled bearing after the `ordinal`-th shift of the seed's clock. Shifts
 * alternate side, so every shift turns the anchorage 25–50°, a swing the eye
 * reads as one communal event and never as a drift.
 */
function windShiftOffsetRad(seed: string, ordinal: number): number {
  const side = ordinal % 2 === 0 ? 1 : -1;
  return side * (0.22 + 0.2 * ((stableHash(`${seed}.wind-shift-bearing.${ordinal}`) % 1_000) / 1_000));
}

/** Wind-shift slot indices in time order within `[fromIndex, toIndex]`. */
function windShiftSlotIndicesBetween(seed: string, fromIndex: number, toIndex: number): number[] {
  const indices: number[] = [];
  for (let index = fromIndex; index <= toIndex; index += 1) {
    if (isWindShiftSlot(seed, index)) indices.push(index);
  }
  return indices;
}

/**
 * Wind shifts whose swing may still be visible at or after `fromSeconds` and
 * that start before `toSeconds`, plus the shift in force at `fromSeconds`, in
 * time order. Motion planning hands this list to the anchorage sampler; each
 * shift's `fromOffsetRad` is the previous shift's `toOffsetRad`, so the list
 * is continuous. A slot's ordinal is its day index × 2 + its half, so the
 * bearing sequence is a pure function of the seed and the clock.
 */
export function gardenWindShiftsBetween(seed: string, fromSeconds: number, toSeconds: number): GardenWindShift[] {
  if (!Number.isFinite(fromSeconds) || !Number.isFinite(toSeconds) || toSeconds < fromSeconds) return [];
  const phase = slotPhaseSeconds(seed);
  const period = GARDEN_ATTENTION_SLOT_PERIOD_SECONDS;
  // Start one full day back so the shift in force at `fromSeconds` is included.
  const firstIndex = Math.floor((fromSeconds - phase - GARDEN_WIND_SHIFT_SLOT_OFFSET_SECONDS) / period) - SLOTS_PER_DAY;
  const lastIndex = Math.floor((toSeconds - phase - GARDEN_WIND_SHIFT_SLOT_OFFSET_SECONDS) / period);
  const shifts: GardenWindShift[] = [];
  for (const index of windShiftSlotIndicesBetween(seed, firstIndex, lastIndex)) {
    const day = Math.floor(index / SLOTS_PER_DAY);
    const ordinal = day * GARDEN_WIND_SHIFT_DAILY_CEILING + (index - day * SLOTS_PER_DAY < SLOTS_PER_DAY / 2 ? 0 : 1);
    shifts.push({
      slotIndex: index,
      startSeconds: index * period + phase + GARDEN_WIND_SHIFT_SLOT_OFFSET_SECONDS,
      fromOffsetRad: windShiftOffsetRad(seed, ordinal - 1),
      toOffsetRad: windShiftOffsetRad(seed, ordinal),
    });
  }
  // Keep only the shift in force at `fromSeconds` and those after it.
  let firstKept = 0;
  for (let index = 0; index < shifts.length; index += 1) {
    if (shifts[index]!.startSeconds <= fromSeconds) firstKept = index;
  }
  return shifts.slice(firstKept);
}
