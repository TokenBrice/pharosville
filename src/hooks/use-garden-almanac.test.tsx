// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createGardenDirector, registerRitual } from "../systems/garden-director";
import { forceGardenRitual, gardenActiveDayScore } from "../systems/garden-score";
import { useGardenAlmanac } from "./use-garden-almanac";

const date = new Date("2026-09-26T10:00:00Z");

afterEach(cleanup);

describe("useGardenAlmanac", () => {
  it("hands the UTC day's score to the driver and writes one ledger line per ritual start", () => {
    const director = createGardenDirector("2026-09-26");
    const unregister = registerRitual("kindling", { start() {}, update: () => true, cancel() {} });
    const view = renderHook(() => useGardenAlmanac({ date, director, utcDayKey: "2026-09-26", wallClockHour: 19.1 }));
    expect(gardenActiveDayScore().some((entry) => entry.kind === "kindling")).toBe(true);
    act(() => { forceGardenRitual("kindling", 1_790_000_000); });
    expect(view.result.current.entries).toHaveLength(1);
    expect(view.result.current.entries[0]!.message).toMatch(/lamps/);
    expect(view.result.current.entries[0]!.timestampLabel).toMatch(/^\d{2}:\d{2}$/);
    unregister();
  });

  it("names the kō and the moon for the Almanac section, never an event", () => {
    const director = createGardenDirector("2026-09-26");
    const { result } = renderHook(() => useGardenAlmanac({ date, director, utcDayKey: "2026-09-26", wallClockHour: 22 }));
    expect(result.current.almanac.microseason).toBe("Thunder ceases");
    expect(result.current.almanac.sekki.length).toBeGreaterThan(0);
    expect(result.current.entries).toEqual([]);
  });
});
