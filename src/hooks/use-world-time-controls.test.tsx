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

  it("clamps manual time changes to quarter-hour steps and ignores NaN", () => {
    const { result } = renderHook(() => useWorldTimeControls({ requestPaint: vi.fn() }));

    act(() => {
      result.current.setManualTimeOverrideHour(6.13);
    });
    expect(result.current.manualTimeOverrideHour).toBe(6.25);

    act(() => {
      result.current.setManualTimeOverrideHour(Number.NaN);
    });
    expect(result.current.manualTimeOverrideHour).toBe(6.25);

    act(() => {
      result.current.setManualTimeOverrideHour(-3);
    });
    expect(result.current.manualTimeOverrideHour).toBe(0);
  });
});
