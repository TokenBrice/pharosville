import { describe, expect, it } from "vitest";
import {
  gardenAlmanacEventAt,
  gardenAlmanacEventForDate,
  gardenAlmanacLogEntry,
  type GardenAlmanacEventId,
  requestGardenAlmanac,
} from "./garden-almanac";
import { advanceGardenDirector, createGardenDirector } from "./garden-director";

describe("garden almanac", () => {
  it("selects one deterministic shared event from the UTC day seed", () => {
    const date = new Date("2026-08-13T23:30:00-07:00");
    expect(gardenAlmanacEventForDate(date)).toEqual(gardenAlmanacEventForDate(
      new Date("2026-08-14T06:30:00Z"),
    ));
  });

  it("ships the heron and meteor across daily seeds", () => {
    const found = new Set<GardenAlmanacEventId>();
    for (let day = 1; day <= 31; day += 1) {
      found.add(gardenAlmanacEventForDate(new Date(Date.UTC(2026, 7, day))).id);
    }
    expect(found).toEqual(new Set(["heron-dusk", "deep-night-meteor"]));
  });

  it("is active only inside its authored window and never under reduced motion", () => {
    const date = new Date("2026-08-13T00:00:00Z");
    const event = gardenAlmanacEventForDate(date);
    expect(gardenAlmanacEventAt(date, event.startsAtHour + 1 / 3600)).toEqual(event);
    expect(gardenAlmanacEventAt(date, event.startsAtHour - 0.01)).toBeNull();
    expect(gardenAlmanacEventAt(date, event.endsAtHour)).toBeNull();
    expect(gardenAlmanacEventAt(date, event.startsAtHour + 1 / 3600, true)).toBeNull();
  });

  it("releases meteor attention after its ten-second crossing rather than fourteen minutes", () => {
    const event = Array.from({ length: 31 }, (_, day) => gardenAlmanacEventForDate(new Date(Date.UTC(2026, 7, day + 1))))
      .find((candidate) => candidate.id === "deep-night-meteor")!;
    const state = createGardenDirector(event.dayKey);
    const beat = requestGardenAlmanac(state, event, 0);
    expect(beat).not.toBeNull();
    expect(advanceGardenDirector(state, 9).active).toBe(beat);
    expect(advanceGardenDirector(state, 10).active).toBeNull();
    expect(gardenAlmanacEventAt(new Date(`${event.dayKey}T00:00:00Z`), event.startsAtHour + 11 / 3600)).toBeNull();
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
