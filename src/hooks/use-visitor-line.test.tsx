// @vitest-environment jsdom
import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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
  vi.restoreAllMocks();
});

describe("useVisitorLine", () => {
  it("opens teaching with the ready world, never putting it in the caption", () => {
    const { result, rerender } = renderHook((ready: boolean) => useVisitorLine({
      ready, returnSummary: null,
    }), { initialProps: false });
    expect(result.current.teachingOpen).toBe(false);
    rerender(true);
    expect(result.current.teachingOpen).toBe(true);
    expect(result.current.visitorLine).toBeNull();
    expect(window.localStorage.getItem(ORIENTATION_STORAGE_KEY)).toBeNull();
    act(() => result.current.dismissTeaching());
    expect(result.current.teachingOpen).toBe(false);
    expect(window.localStorage.getItem(ORIENTATION_STORAGE_KEY)).toBe("1");
    const second = renderHook(() => useVisitorLine({ ready: true, returnSummary: null }));
    expect(second.result.current.teachingOpen).toBe(false);
  });

  it.each(["1", "legacy-seen-value"])("does not re-teach an existing stored seen value: %s", (seen) => {
    window.localStorage.setItem(ORIENTATION_STORAGE_KEY, seen);
    const { result } = renderHook(() => useVisitorLine({ ready: true, returnSummary: null }));
    expect(result.current.teachingOpen).toBe(false);
    expect(result.current.visitorLine).toBeNull();
    expect(window.localStorage.getItem(ORIENTATION_STORAGE_KEY)).toBe(seen);
  });

  it("never consumes teaching on input, hidden tabs, elapsed time or readiness loss", () => {
    const { result, rerender } = renderHook((ready: boolean) => useVisitorLine({
      ready, returnSummary: null,
    }), { initialProps: true });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      fireEvent.pointerDown(window);
      fireEvent.wheel(window);
      fireEvent.keyDown(window, { key: "a" });
      fireEvent.touchStart(window);
      fireEvent(document, new Event("visibilitychange"));
      vi.advanceTimersByTime(120_000);
    });
    expect(result.current.teachingOpen).toBe(true);
    expect(window.localStorage.getItem(ORIENTATION_STORAGE_KEY)).toBeNull();
    rerender(false);
    act(() => result.current.dismissTeaching());
    expect(window.localStorage.getItem(ORIENTATION_STORAGE_KEY)).toBeNull();
    rerender(true);
    expect(result.current.teachingOpen).toBe(true);
  });

  it("keeps a returning visitor's 20-second summary independent of teaching", () => {
    window.localStorage.setItem(ORIENTATION_STORAGE_KEY, "1");
    const summary = "Since you were here yesterday — stability rose from Tremor to Steady.";
    const { result, rerender } = renderHook((returnReady: boolean) => useVisitorLine({
      ready: true, returnReady, returnSummary: summary,
    }), { initialProps: false });
    expect(result.current.visitorLine).toBeNull();
    act(() => vi.advanceTimersByTime(RETURN_VISIT_LINE_MS));
    rerender(true);
    expect(result.current.visitorLine).toBe(summary);
    act(() => fireEvent.pointerDown(window));
    expect(result.current.visitorLine).toBe(summary);
    act(() => vi.advanceTimersByTime(RETURN_VISIT_LINE_MS));
    expect(result.current.visitorLine).toBeNull();
    expect(result.current.teachingOpen).toBe(false);
  });

  it("does not mark unseen teaching complete when the return summary expires", () => {
    const { result } = renderHook(() => useVisitorLine({
      ready: true, returnSummary: "Since your last visit — supply rose.",
    }));
    expect(result.current.teachingOpen).toBe(true);
    act(() => vi.advanceTimersByTime(RETURN_VISIT_LINE_MS));
    expect(result.current.visitorLine).toBeNull();
    expect(result.current.teachingOpen).toBe(true);
    expect(window.localStorage.getItem(ORIENTATION_STORAGE_KEY)).toBeNull();
  });

  it("shows a session-dismissible key when storage is denied", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("Storage denied"); });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("Storage denied"); });
    const first = renderHook(() => useVisitorLine({ ready: true, returnSummary: null }));
    expect(first.result.current.teachingOpen).toBe(true);
    act(() => first.result.current.dismissTeaching());
    expect(first.result.current.teachingOpen).toBe(false);
    first.unmount();
    const second = renderHook(() => useVisitorLine({ ready: true, returnSummary: null }));
    expect(second.result.current.teachingOpen).toBe(false);
  });
});
