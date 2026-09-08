// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { gardenAlmanacEventForDate } from "../systems/garden-almanac";
import { createGardenDirector, requestGardenBeat } from "../systems/garden-director";
import { useGardenAlmanac } from "./use-garden-almanac";

const date = new Date("2026-08-13T00:00:00Z");
const event = gardenAlmanacEventForDate(date);


afterEach(cleanup);
describe("useGardenAlmanac", () => {
  it("records an admitted sighting once and releases attention before lingering evidence", () => {
    const director = createGardenDirector(event.dayKey);
    const view = renderHook(({ timeSeconds }) => useGardenAlmanac({
      date, director, timeSeconds, reducedMotion: false, wallClockHour: event.startsAtHour + 1 / 3600,
    }), { initialProps: { timeSeconds: 0 } });
    expect(view.result.current.activeEvent?.id).toBe(event.id);
    expect(view.result.current.entries.map((entry) => entry.message)).toEqual([event.ledgerMessage]);
    view.rerender({ timeSeconds: event.durationSeconds });
    expect(view.result.current.attentionActive).toBe(false);
    view.rerender({ timeSeconds: event.envelopeSeconds + event.evidenceSeconds + 1 });
    expect(view.result.current.activeEvent).toBeNull();
    expect(view.result.current.evidenceEvent).toBeNull();
    expect(view.result.current.entries).toHaveLength(1);
    expect(director.log).toHaveLength(1);
  });

  it("does not activate or log ambient events under reduced motion", () => {
    const director = createGardenDirector(event.dayKey);
    const { result } = renderHook(() => useGardenAlmanac({
      date, director, timeSeconds: 0, reducedMotion: true, wallClockHour: event.startsAtHour + 1 / 3600,
    }));
    expect(result.current.activeEvent).toBeNull();
    expect(result.current.entries).toEqual([]);
    expect(director.log).toEqual([]);
  });

  it("does not turn a refused sighting into a deferred lottery", () => {
    const director = createGardenDirector(event.dayKey);
    requestGardenBeat(director, { kind: "market", foreground: true, durationSeconds: 1, priority: 100 }, 0);
    const view = renderHook(({ timeSeconds }) => useGardenAlmanac({
      date, director, timeSeconds, reducedMotion: false, wallClockHour: event.startsAtHour + 1 / 3600,
    }), { initialProps: { timeSeconds: 0 } });
    view.rerender({ timeSeconds: 1000 });
    expect(view.result.current.entries).toEqual([]);
    expect(view.result.current.activeEvent).toBeNull();
  });

  it("uses the supplied UTC day and never replays a sighting crossed while hidden", () => {
    const director = createGardenDirector(event.dayKey);
    const view = renderHook(({ hour }) => useGardenAlmanac({
      date, director, timeSeconds: 0, reducedMotion: false, wallClockHour: hour,
    }), { initialProps: { hour: event.startsAtHour - 1 } });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    view.rerender({ hour: event.startsAtHour + 1 / 3600 });
    expect(view.result.current.activeEvent).toBeNull();
    expect(view.result.current.entries).toEqual([]);
  });

  it("suppresses the visual envelope when a market beat interrupts it", () => {
    const director = createGardenDirector(event.dayKey);
    const view = renderHook(({ timeSeconds }) => useGardenAlmanac({
      date, director, timeSeconds, reducedMotion: false, wallClockHour: event.startsAtHour + 1 / 3600,
    }), { initialProps: { timeSeconds: 0 } });
    requestGardenBeat(director, { kind: "market", foreground: true, durationSeconds: 10, priority: 100 }, 1);
    view.rerender({ timeSeconds: 1 });
    expect(view.result.current.activeEvent).toBeNull();
    expect(view.result.current.attentionActive).toBe(false);
  });
});
