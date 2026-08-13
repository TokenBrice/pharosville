// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gardenAlmanacEventForDate } from "../systems/garden-almanac";
import { useGardenAlmanac } from "./use-garden-almanac";

describe("useGardenAlmanac", () => {
  afterEach(() => vi.useRealTimers());

  it("records one timestamped entry without duplicating the active sighting", async () => {
    const date = new Date("2026-08-13T00:00:00Z");
    const event = gardenAlmanacEventForDate(date);
    const view = renderHook(({ hour }) => useGardenAlmanac({
      date,
      reducedMotion: false,
      wallClockHour: hour,
    }), { initialProps: { hour: event.startsAtHour + 0.01 } });

    await waitFor(() => expect(view.result.current.entries).toHaveLength(1));
    expect(view.result.current.entries[0]).toMatchObject({
      id: `${event.dayKey}:${event.id}`,
      message: event.ledgerMessage,
      timestampLabel: event.timestampLabel,
    });
    view.rerender({ hour: event.startsAtHour + 0.02 });
    expect(view.result.current.entries).toHaveLength(1);
  });

  it("does not activate or log ambient events under reduced motion", () => {
    const date = new Date("2026-08-13T00:00:00Z");
    const event = gardenAlmanacEventForDate(date);
    const { result } = renderHook(() => useGardenAlmanac({
      date,
      reducedMotion: true,
      wallClockHour: event.startsAtHour + 0.01,
    }));
    expect(result.current.activeEvent).toBeNull();
    expect(result.current.entries).toEqual([]);
  });

  it("advances the shared daily seed at UTC midnight in a long-lived tab", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T23:59:59.900Z"));
    const nextEvent = gardenAlmanacEventForDate(new Date("2026-08-14T00:00:00Z"));
    const { result } = renderHook(() => useGardenAlmanac({
      reducedMotion: false,
      wallClockHour: nextEvent.startsAtHour + 0.01,
    }));

    act(() => vi.advanceTimersByTime(200));

    expect(result.current.activeEvent?.dayKey).toBe(nextEvent.dayKey);
    expect(vi.getTimerCount()).toBe(1);
  });
});
