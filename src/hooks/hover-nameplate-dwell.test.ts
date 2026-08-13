import { describe, expect, it } from "vitest";
import {
  createHoverNameplateDwellState,
  hoverNameplateVisible,
  HOVER_NAMEPLATE_DWELL_MS,
} from "./hover-nameplate-dwell";

describe("hover nameplate dwell", () => {
  it("reveals one stable target after 150ms and restarts on a sweep", () => {
    const state = createHoverNameplateDwellState();
    expect(hoverNameplateVisible(state, "ship.a", 1_000)).toBe(false);
    expect(hoverNameplateVisible(state, "ship.a", 1_000 + HOVER_NAMEPLATE_DWELL_MS - 1)).toBe(false);
    expect(hoverNameplateVisible(state, "ship.a", 1_000 + HOVER_NAMEPLATE_DWELL_MS)).toBe(true);
    expect(hoverNameplateVisible(state, "ship.b", 1_200)).toBe(false);
    expect(hoverNameplateVisible(state, "ship.b", 1_350)).toBe(true);
  });

  it("hides immediately when the pointer leaves", () => {
    const state = createHoverNameplateDwellState();
    hoverNameplateVisible(state, "ship.a", 0);
    expect(hoverNameplateVisible(state, "ship.a", 200)).toBe(true);
    expect(hoverNameplateVisible(state, null, 201)).toBe(false);
  });
});
