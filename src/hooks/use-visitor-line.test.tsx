// @vitest-environment jsdom
import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FIRST_VISIT_LINE_MS,
  FIRST_VISIT_LINES,
  ORIENTATION_STORAGE_KEY,
  RETURN_VISIT_LINE_MS,
  useVisitorLine,
} from "./use-visitor-line";

beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useVisitorLine", () => {
  it("speaks the three teachings once, after the arrival settles, and never again", () => {
    const { result, rerender } = renderHook((ready: boolean) => useVisitorLine({ ready, reducedMotion: false, returnSummary: null }), { initialProps: false });
    expect(result.current).toBeNull();
    rerender(true);
    const spoken: (string | null)[] = [];
    for (let line = 0; line < FIRST_VISIT_LINES.length; line += 1) {
      spoken.push(result.current);
      act(() => vi.advanceTimersByTime(FIRST_VISIT_LINE_MS));
    }
    expect(spoken).toEqual([...FIRST_VISIT_LINES]);
    expect(result.current).toBeNull();
    expect(window.localStorage.getItem(ORIENTATION_STORAGE_KEY)).not.toBeNull();

    const second = renderHook(() => useVisitorLine({ ready: true, reducedMotion: false, returnSummary: null }));
    expect(second.result.current).toBeNull();
  });

  it("skips the teachings on any input, and holds one sentence under reduced motion", () => {
    const { result } = renderHook(() => useVisitorLine({ ready: true, reducedMotion: true, returnSummary: null }));
    expect(result.current).toBe(FIRST_VISIT_LINES.join(" "));
    act(() => vi.advanceTimersByTime(FIRST_VISIT_LINE_MS * 10));
    expect(result.current).toBe(FIRST_VISIT_LINES.join(" "));
    act(() => { fireEvent.keyDown(window, { key: "a" }); });
    expect(result.current).toBeNull();
    expect(window.localStorage.getItem(ORIENTATION_STORAGE_KEY)).not.toBeNull();
  });

  it("tells a returning visitor what changed before anything else", () => {
    window.localStorage.setItem(ORIENTATION_STORAGE_KEY, "1");
    const summary = "Since you were here yesterday — stability rose from Tremor to Steady.";
    const { result } = renderHook(() => useVisitorLine({ ready: true, reducedMotion: false, returnSummary: summary }));
    expect(result.current).toBe(summary);
    act(() => { fireEvent.pointerDown(window); });
    expect(result.current).toBe(summary);
    act(() => vi.advanceTimersByTime(RETURN_VISIT_LINE_MS));
    expect(result.current).toBeNull();
  });
});
