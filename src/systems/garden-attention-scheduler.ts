import { stableHash } from "./stable-random";

/**
 * The one attention scheduler (plan W1.6, K21, §5.0 attention budget).
 *
 * Every discrete event the rest frame may show — an inlet crossing, a score
 * gift (heron, kindling, moonrise, leaf fall, the anniversary lantern, an
 * anchor swing) — happens only in an **attention slot** this module issues.
 * Continuous ambient motion (swell, gusts, lantern breath) is not an event and
 * never asks. The slot lattice alone makes the §5.0 ceilings hold:
 *
 * - Two slots per hour, `GARDEN_ATTENTION_SLOT_PERIOD_SECONDS` apart, each
 *   holding the frame for at most `GARDEN_ATTENTION_SLOT_HOLD_SECONDS`. Any
 *   60-minute window therefore starts at most 2 events (ceiling 6) and holds
 *   a whole slot-free gap of 21 minutes (ceiling: one unbroken 12-minute quiet).
 * - Consecutive holds are 21 minutes apart, so crossings keep their 15-minute
 *   spacing and gifts their 8-minute spacing by construction.
 * - Each slot carries a crossing token or a score gift, never both; gifts are
 *   admitted by `planGardenScoreGifts` (≤ 6 per rolling 24 h, ≤ 2 inside any
 *   dusk interval between golden 0.5 and night 0.5), crossings take the rest.
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
 * - Voyage cadence (W4.F11): `gardenTideWindowAt` names the tide windows that
 *   departures (ebb) and homecomings (flood) gather in; slots open on the flood.
 */

/** Harbour-master tide: one cycle of this length (see `tidePhase`). */
export const GARDEN_TIDE_PERIOD_SECONDS = 600;
/** Tide offsets (seconds into the cycle) of the flood and ebb gathering windows. */
export const GARDEN_TIDE_EBB_START_SECONDS = 0;
export const GARDEN_TIDE_FLOOD_START_SECONDS = 300;
/** Each window lasts this long; the ±30 s around each tide turn is slack. */
export const GARDEN_TIDE_WINDOW_SECONDS = 120;
export const GARDEN_TIDE_SLACK_HALF_SECONDS = 30;

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

export const GARDEN_ATTENTION_DEFAULT_SEED = "pharosville.attention";

const DAY_SECONDS = 86_400;

export type GardenTideWindow = "ebb" | "flood" | "slack" | "stand";

/**
 * Which voyage window the harbour tide is in. Ebb and flood are the
 * gathering windows for departures and homecomings; slack is the minute
 * around each turn, when no voyage boundary should fall; stand is between.
 */
export function gardenTideWindowAt(timeSeconds: number): GardenTideWindow {
  const period = GARDEN_TIDE_PERIOD_SECONDS;
  const offset = ((Number.isFinite(timeSeconds) ? timeSeconds : 0) % period + period) % period;
  const turns = [GARDEN_TIDE_FLOOD_START_SECONDS / 2, (GARDEN_TIDE_FLOOD_START_SECONDS + period) / 2];
  if (turns.some((turn) => Math.abs(offset - turn) < GARDEN_TIDE_SLACK_HALF_SECONDS)) return "slack";
  if (offset >= GARDEN_TIDE_EBB_START_SECONDS && offset < GARDEN_TIDE_EBB_START_SECONDS + GARDEN_TIDE_WINDOW_SECONDS) return "ebb";
  if (offset >= GARDEN_TIDE_FLOOD_START_SECONDS && offset < GARDEN_TIDE_FLOOD_START_SECONDS + GARDEN_TIDE_WINDOW_SECONDS) return "flood";
  return "stand";
}

export interface GardenAttentionSlot {
  /** Global slot ordinal on this seed's lattice (may be negative). */
  index: number;
  kind: "crossing" | "gift";
  /** Set when `kind` is "gift". */
  giftId: string | null;
  startSeconds: number;
  /** Last instant a crossing voyage or gift may begin. */
  admitEndSeconds: number;
  /** Everything the slot admitted is over by this instant. */
  endSeconds: number;
}

/**
 * Lattice phase for a seed: slot starts fall on a flood-window start
 * (tide offset 300 s), at one of the three flood starts in the first half hour.
 */
function slotPhaseSeconds(seed: string): number {
  return GARDEN_TIDE_FLOOD_START_SECONDS + (stableHash(`${seed}.attention-phase`) % 3) * GARDEN_TIDE_PERIOD_SECONDS;
}

function slotAt(seed: string, index: number, gifts: readonly GardenScoreGift[]): GardenAttentionSlot {
  const startSeconds = index * GARDEN_ATTENTION_SLOT_PERIOD_SECONDS + slotPhaseSeconds(seed);
  const gift = gifts.find((entry) => entry.slotIndex === index) ?? null;
  return {
    index,
    kind: gift ? "gift" : "crossing",
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
      if (slot.kind === "gift") continue;
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
