// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { dayCycleBeats } from "../systems/day-cycle-beats";
import { NowCaption } from "./now-caption";

afterEach(cleanup);

describe("NowCaption", () => {
  it("renders one polite live sentence", () => {
    render(
      <NowCaption
        arrivalAnnotation={null}
        beats={dayCycleBeats(12.25)}
        freshness={{}}
        hour={12.25}
        latestTransition={null}
        psi={82}
      />,
    );

    const caption = screen.getByTestId("pharosville-now-caption");
    expect(caption.getAttribute("aria-live")).toBe("polite");
    expect(caption.textContent).toBe("12:15 — a quiet noon · readings current");
  });
});
