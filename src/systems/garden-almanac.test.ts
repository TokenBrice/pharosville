import { describe, expect, it } from "vitest";
import {
  gardenAlmanacEventAt,
  gardenAlmanacEventForDate,
  gardenAlmanacLogEntry,
  type GardenAlmanacEventId,
} from "./garden-almanac";

describe("garden almanac", () => {
  it("selects one deterministic shared event from the UTC day seed", () => {
    const date = new Date("2026-08-13T23:30:00-07:00");
    expect(gardenAlmanacEventForDate(date)).toEqual(gardenAlmanacEventForDate(
      new Date("2026-08-14T06:30:00Z"),
    ));
  });

  it("ships the heron, lantern round, and meteor across daily seeds", () => {
    const found = new Set<GardenAlmanacEventId>();
    for (let day = 1; day <= 31; day += 1) {
      found.add(gardenAlmanacEventForDate(new Date(Date.UTC(2026, 7, day))).id);
    }
    expect(found).toEqual(new Set(["heron-dusk", "lantern-round", "deep-night-meteor"]));
  });

  it("is active only inside its authored window and never under reduced motion", () => {
    const date = new Date("2026-08-13T00:00:00Z");
    const event = gardenAlmanacEventForDate(date);
    expect(gardenAlmanacEventAt(date, event.startsAtHour + 0.01)).toEqual(event);
    expect(gardenAlmanacEventAt(date, event.startsAtHour - 0.01)).toBeNull();
    expect(gardenAlmanacEventAt(date, event.endsAtHour)).toBeNull();
    expect(gardenAlmanacEventAt(date, event.startsAtHour + 0.01, true)).toBeNull();
  });

  it("writes a stable timestamped plain-language harbor-log entry", () => {
    const event = gardenAlmanacEventForDate(new Date("2026-08-13T00:00:00Z"));
    expect(gardenAlmanacLogEntry(event)).toEqual({
      id: `${event.dayKey}:${event.id}`,
      message: event.ledgerMessage,
      timestampLabel: expect.stringMatching(/^\d{2}:\d{2}$/),
    });
  });
});
