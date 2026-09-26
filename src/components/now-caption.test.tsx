// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { dayCycleBeats } from "../systems/day-cycle-beats";
import { NowCaption } from "./now-caption";

afterEach(cleanup);

describe("NowCaption", () => {
  it("shows the clocked sentence and speaks only the phrase, not the minute", () => {
    const props = {
      arrivalAnnotation: null,
      beats: dayCycleBeats(12.25),
      freshness: {},
      latestTransition: null,
      psi: 82,
    };
    const view = render(<NowCaption {...props} hour={12.25} />);

    const caption = screen.getByTestId("pharosville-now-caption");
    const status = screen.getByRole("status");
    expect(caption.getAttribute("aria-live")).toBeNull();
    expect(caption.textContent).toBe("12:15 — a quiet noon · readings current");
    expect(status.textContent).toBe("a quiet noon · readings current");

    const spokenNode = status.firstChild;
    view.rerender(<NowCaption {...props} hour={12 + 16 / 60} />);
    expect(caption.textContent).toBe("12:16 — a quiet noon · readings current");
    expect(status.textContent).toBe("a quiet noon · readings current");
    expect(status.firstChild).toBe(spokenNode);

    view.rerender(<NowCaption {...props} hour={12 + 16 / 60} arrivalAnnotation="Tether arrives at Ethereum" />);
    expect(status.textContent).toBe("Tether arrives at Ethereum");
  });
});
