import { describe, expect, it } from "vitest";
import {
  GARDEN_ATTENTION_EVENT_CEILING_PER_HOUR,
  GARDEN_ATTENTION_QUIET_MIN_SECONDS,
  GARDEN_CROSSING_MIN_GAP_SECONDS,
  GARDEN_SCORE_GIFT_DAILY_CEILING,
  GARDEN_SCORE_GIFT_DUSK_CEILING,
  GARDEN_SCORE_GIFT_MIN_GAP_SECONDS,
  gardenAttentionSlotAt,
  gardenAttentionSlotsBetween,
  planGardenScoreGifts,
  type GardenScoreRequest,
} from "./garden-attention-scheduler";

const HOUR = 3_600;
const DAY = 86_400;

/** A day score far busier than W5 will ask for: a ritual every 20 minutes, each with a 90-minute window. */
function greedyScore(days: number): GardenScoreRequest[] {
  return Array.from({ length: days * 72 }, (_, index) => ({
    id: `ritual-${index}`,
    earliestSeconds: index * 1_200,
    latestSeconds: index * 1_200 + 5_400,
    priority: index % 5,
  }));
}

const DUSK = [0, 1, 2].map((day) => ({ startSeconds: day * DAY + 18 * HOUR, endSeconds: day * DAY + 20.5 * HOUR }));

describe("garden attention scheduler", () => {
  it("keeps every idle hour inside the §5.0 ceilings even when every slot fires", () => {
    for (const seed of ["2026-09-26", "2026-09-27", "pharosville.attention"]) {
      const gifts = planGardenScoreGifts(seed, greedyScore(3), { duskIntervals: DUSK });
      const events = gardenAttentionSlotsBetween(seed, 0, 3 * DAY, gifts);
      // Sliding hours, minute by minute, over three days.
      for (let from = 0; from + HOUR <= 3 * DAY; from += 60) {
        const to = from + HOUR;
        const inWindow = events.filter((slot) => slot.startSeconds >= from && slot.startSeconds < to);
        expect(inWindow.length, `${seed} @${from}`).toBeLessThanOrEqual(GARDEN_ATTENTION_EVENT_CEILING_PER_HOUR);
        let longestQuiet = 0;
        let cursor = from;
        for (const slot of events.filter((entry) => entry.endSeconds > from && entry.startSeconds < to)) {
          longestQuiet = Math.max(longestQuiet, slot.startSeconds - cursor);
          cursor = Math.max(cursor, slot.endSeconds);
        }
        longestQuiet = Math.max(longestQuiet, to - cursor);
        expect(longestQuiet, `${seed} @${from}`).toBeGreaterThanOrEqual(GARDEN_ATTENTION_QUIET_MIN_SECONDS);
      }
    }
  });

  it("spaces crossing tokens at least fifteen minutes apart and gifts at least eight", () => {
    const seed = "2026-09-26";
    const gifts = planGardenScoreGifts(seed, greedyScore(2), { duskIntervals: DUSK });
    const slots = gardenAttentionSlotsBetween(seed, 0, 2 * DAY, gifts);
    const crossings = slots.filter((slot) => slot.kind === "crossing");
    expect(crossings.length).toBeGreaterThan(0);
    for (let index = 1; index < crossings.length; index += 1) {
      expect(crossings[index]!.startSeconds - crossings[index - 1]!.endSeconds).toBeGreaterThanOrEqual(GARDEN_CROSSING_MIN_GAP_SECONDS);
    }
    for (let index = 1; index < gifts.length; index += 1) {
      expect(gifts[index]!.startSeconds - gifts[index - 1]!.endSeconds).toBeGreaterThanOrEqual(GARDEN_SCORE_GIFT_MIN_GAP_SECONDS);
    }
  });

  it("admits at most six gifts a day and two between golden and night", () => {
    const seed = "2026-09-26";
    const gifts = planGardenScoreGifts(seed, greedyScore(3), { duskIntervals: DUSK });
    expect(gifts.length).toBeGreaterThan(0);
    for (const gift of gifts) {
      const rollingDay = gifts.filter((other) => other.startSeconds >= gift.startSeconds && other.startSeconds < gift.startSeconds + DAY);
      expect(rollingDay.length).toBeLessThanOrEqual(GARDEN_SCORE_GIFT_DAILY_CEILING);
    }
    for (const dusk of DUSK) {
      const inDusk = gifts.filter((gift) => gift.startSeconds >= dusk.startSeconds && gift.startSeconds < dusk.endSeconds);
      expect(inDusk.length).toBeLessThanOrEqual(GARDEN_SCORE_GIFT_DUSK_CEILING);
    }
    // A gift plays inside its ritual's own window, in a slot the crossings no longer own.
    const byId = new Map(greedyScore(3).map((request) => [request.id, request]));
    const slots = gardenAttentionSlotsBetween(seed, 0, 3 * DAY, gifts);
    for (const gift of gifts) {
      const request = byId.get(gift.requestId)!;
      expect(gift.startSeconds).toBeGreaterThanOrEqual(request.earliestSeconds);
      expect(gift.startSeconds).toBeLessThanOrEqual(request.latestSeconds);
      expect(slots.find((slot) => slot.index === gift.slotIndex)?.kind).toBe("gift");
    }
  });

  it("is a pure function of seed, clock and requests", () => {
    const requests = greedyScore(1);
    const forward = planGardenScoreGifts("seed-a", requests, { duskIntervals: DUSK });
    const reversed = planGardenScoreGifts("seed-a", requests.toReversed(), { duskIntervals: DUSK });
    expect(reversed).toEqual(forward);
    expect(gardenAttentionSlotsBetween("seed-a", 7_200, 14_400)).toEqual(gardenAttentionSlotsBetween("seed-a", 7_200, 14_400));
    const slot = gardenAttentionSlotsBetween("seed-a", 7_200, 14_400)[0]!;
    expect(gardenAttentionSlotAt("seed-a", slot.startSeconds + 1)?.index).toBe(slot.index);
    expect(gardenAttentionSlotAt("seed-a", slot.endSeconds + 1)).toBeNull();
  });
});
