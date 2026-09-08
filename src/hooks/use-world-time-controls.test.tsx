// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useWorldTimeControls,
  WORLD_TIME_NUDGE_HOUR,
} from "./use-world-time-controls";

afterEach(() => {
  cleanup();
  delete (globalThis as { __pharosVilleTestWallClockHour?: number }).__pharosVilleTestWallClockHour;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useWorldTimeControls", () => {
  it("sets dusk from a visible input and resets the effective time to local", () => {
    const { result } = renderHook(() => useWorldTimeControls({ requestPaint: vi.fn() }));
    act(() => result.current.setSessionHour(18.25));
    expect(result.current.wallClockHour).toBe(18.25);
    act(() => result.current.resetLocalTime());
    expect(result.current.manualTimeOverrideHour).toBeNull();
    expect(result.current.nightMode).toBe(false);
    expect(globalThis.__pharosVilleTestWallClockHour).toBeUndefined();
    const now = new Date();
    expect(result.current.wallClockHour).toBeCloseTo(now.getHours() + now.getMinutes() / 60, 1);
  });
  it("seeds night mode and a clamped manual time override", async () => {
    const requestPaint = vi.fn();
    const { result } = renderHook(() => useWorldTimeControls({
      initialManualTimeOverrideHour: 24.5,
      initialNightMode: true,
      requestPaint,
    }));

    expect(result.current.nightMode).toBe(true);
    expect(result.current.manualTimeOverrideHour).toBe(23.75);
    expect(result.current.wallClockHour).toBe(23.75);
    await waitFor(() => expect(globalThis.__pharosVilleTestWallClockHour).toBe(23.75));
  });

  it("clamps a seeded manual hour to quarter-hour steps and ignores NaN", () => {
    const seeded = renderHook(() => useWorldTimeControls({
      initialManualTimeOverrideHour: 6.13,
      requestPaint: vi.fn(),
    }));
    expect(seeded.result.current.manualTimeOverrideHour).toBe(6.25);

    const notANumber = renderHook(() => useWorldTimeControls({
      initialManualTimeOverrideHour: Number.NaN,
      requestPaint: vi.fn(),
    }));
    expect(notANumber.result.current.manualTimeOverrideHour).toBeNull();

    const belowRange = renderHook(() => useWorldTimeControls({
      initialManualTimeOverrideHour: -3,
      requestPaint: vi.fn(),
    }));
    expect(belowRange.result.current.manualTimeOverrideHour).toBe(0);
  });

  // The hour slider is gone (interface revamp DU10); switching to the day or
  // night preset is now the only way to drop a `?t=` override in-app.
  it("clears the seeded manual override when the day-night preset is switched", () => {
    const requestPaint = vi.fn();
    const { result } = renderHook(() => useWorldTimeControls({
      initialManualTimeOverrideHour: 6.25,
      requestPaint,
    }));
    expect(result.current.manualTimeOverrideHour).toBe(6.25);

    act(() => {
      result.current.toggleNightMode();
    });

    expect(result.current.manualTimeOverrideHour).toBeNull();
    expect(result.current.nightMode).toBe(true);
    expect(globalThis.__pharosVilleTestWallClockHour).toBeUndefined();
  });

  it("steps the session hour half an hour at a time from the hour on show", () => {
    const { result } = renderHook(() => useWorldTimeControls({
      initialManualTimeOverrideHour: 6.5,
      requestPaint: vi.fn(),
    }));

    act(() => {
      result.current.nudgeSessionHour(WORLD_TIME_NUDGE_HOUR);
    });
    expect(result.current.manualTimeOverrideHour).toBe(7);
    expect(result.current.wallClockHour).toBe(7);

    act(() => {
      result.current.nudgeSessionHour(-WORLD_TIME_NUDGE_HOUR);
    });
    expect(result.current.manualTimeOverrideHour).toBe(6.5);
  });

  it("stops at both ends of the day instead of wrapping around", () => {
    const lateEvening = renderHook(() => useWorldTimeControls({
      initialManualTimeOverrideHour: 23.5,
      requestPaint: vi.fn(),
    }));
    act(() => {
      lateEvening.result.current.nudgeSessionHour(WORLD_TIME_NUDGE_HOUR);
    });
    expect(lateEvening.result.current.manualTimeOverrideHour).toBe(23.75);
    act(() => {
      lateEvening.result.current.nudgeSessionHour(WORLD_TIME_NUDGE_HOUR);
    });
    expect(lateEvening.result.current.manualTimeOverrideHour).toBe(23.75);

    const earlyMorning = renderHook(() => useWorldTimeControls({
      initialManualTimeOverrideHour: 0.25,
      requestPaint: vi.fn(),
    }));
    act(() => {
      earlyMorning.result.current.nudgeSessionHour(-WORLD_TIME_NUDGE_HOUR);
    });
    expect(earlyMorning.result.current.manualTimeOverrideHour).toBe(0);
    act(() => {
      earlyMorning.result.current.nudgeSessionHour(-WORLD_TIME_NUDGE_HOUR);
    });
    expect(earlyMorning.result.current.manualTimeOverrideHour).toBe(0);
  });

  // The two are not rivals: the override outranks the night preset while it is
  // set, and stepping starts from the preset's own hour rather than resetting
  // the toggle out from under the visitor.
  it("steps away from the night preset without clearing it", () => {
    const { result } = renderHook(() => useWorldTimeControls({
      initialNightMode: true,
      requestPaint: vi.fn(),
    }));
    expect(result.current.wallClockHour).toBe(22);

    act(() => {
      result.current.nudgeSessionHour(WORLD_TIME_NUDGE_HOUR);
    });

    expect(result.current.manualTimeOverrideHour).toBe(22.5);
    expect(result.current.wallClockHour).toBe(22.5);
    expect(result.current.nightMode).toBe(true);
  });

  it("subscribes while visible, rolls over UTC midnight, and resumes at now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T23:59:59.900Z"));
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const requestPaint = vi.fn();
    const view = renderHook(() => useWorldTimeControls({ requestPaint }));
    act(() => vi.advanceTimersByTime(100));
    expect(view.result.current.utcDayKey).toBe("2026-08-14");
    const beforeHidden = view.result.current.timeSeconds;
    act(() => {
      visibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => vi.advanceTimersByTime(3_600_000));
    expect(view.result.current.timeSeconds).toBe(beforeHidden);
    act(() => {
      visibility = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(view.result.current.timeSeconds).toBe(Date.now() / 1000);
    expect(view.result.current.timeSeconds - beforeHidden).toBe(3600);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("holds a single static time under reduced motion", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T12:00:00Z"));
    const view = renderHook(() => useWorldTimeControls({ requestPaint: vi.fn(), reducedMotion: true }));
    const initial = view.result.current.timeSeconds;
    act(() => vi.advanceTimersByTime(3_600_000));
    view.rerender();
    expect(view.result.current.timeSeconds).toBe(initial);
    expect(vi.getTimerCount()).toBe(0);
    view.unmount();
  });
});
