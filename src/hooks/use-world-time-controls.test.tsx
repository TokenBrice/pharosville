// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorldTimeControls } from "./use-world-time-controls";

afterEach(() => {
  delete (globalThis as { __pharosVilleTestWallClockHour?: number }).__pharosVilleTestWallClockHour;
});

describe("useWorldTimeControls", () => {
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
});
