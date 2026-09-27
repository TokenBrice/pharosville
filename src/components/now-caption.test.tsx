// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dayCycleBeats } from "../systems/day-cycle-beats";
import { NOW_LINE_FADE_OUT_MS, NowCaption } from "./now-caption";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const props = {
  arrivalAnnotation: null,
  beats: dayCycleBeats(12.25),
  freshness: {},
  latestTransition: null,
  psi: 82,
};

describe("NowCaption", () => {
  it("ticks the minute in place and speaks only the phrase, not the minute", () => {
    const view = render(<NowCaption {...props} hour={12.25} />);

    const caption = screen.getByTestId("pharosville-now-caption");
    const status = screen.getByRole("status");
    expect(caption.getAttribute("aria-live")).toBeNull();
    expect(caption.textContent).toBe("12:15 a quiet noon · readings current");
    expect(status.textContent).toBe("a quiet noon · readings current");

    const spokenNode = status.firstChild;
    view.rerender(<NowCaption {...props} hour={12 + 16 / 60} />);
    expect(caption.textContent).toBe("12:16 a quiet noon · readings current");
    expect(caption.dataset.leaving).toBeUndefined();
    expect(status.textContent).toBe("a quiet noon · readings current");
    expect(status.firstChild).toBe(spokenNode);
  });

  it("crossfades a new sentence: the old one leaves before the new one is set", () => {
    vi.useFakeTimers();
    const view = render(<NowCaption {...props} hour={12.25} />);
    const caption = screen.getByTestId("pharosville-now-caption");

    view.rerender(<NowCaption {...props} hour={12.25} arrivalAnnotation="Tether comes in to Ethereum" />);
    // The status region speaks at once; the visible line waits for its fade.
    expect(screen.getByRole("status").textContent).toBe("Tether comes in to Ethereum");
    expect(caption.dataset.leaving).toBe("true");
    expect(caption.textContent).toBe("12:15 a quiet noon · readings current");

    act(() => { vi.advanceTimersByTime(NOW_LINE_FADE_OUT_MS); });
    expect(caption.dataset.leaving).toBeUndefined();
    expect(caption.textContent).toBe("Tether comes in to Ethereum");
  });

  it("swaps at once under reduced motion and marks a stale feed as a warning", () => {
    const view = render(<NowCaption {...props} hour={12.25} reducedMotion />);
    view.rerender(<NowCaption {...props} hour={12.25} reducedMotion freshness={{ stabilityStale: true, observedAt: null }} />);
    const caption = screen.getByTestId("pharosville-now-caption");
    expect(caption.textContent).toBe("PSI stale since an unknown time");
    expect(caption.dataset.warning).toBe("true");
    expect(caption.querySelector("time")).toBeNull();
  });

  it("lets a visitor's line outrank a ceremony but never a stale feed", () => {
    const view = render(
      <NowCaption {...props} hour={12.25} reducedMotion arrivalAnnotation="Tether comes in" visitorLine="Each sail is a stablecoin." />,
    );
    expect(screen.getByRole("status").textContent).toBe("Each sail is a stablecoin.");
    view.rerender(
      <NowCaption
        {...props}
        hour={12.25}
        reducedMotion
        visitorLine="Each sail is a stablecoin."
        freshness={{ chainsStale: true, observedAt: null }}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Chains stale since an unknown time");
  });
});
