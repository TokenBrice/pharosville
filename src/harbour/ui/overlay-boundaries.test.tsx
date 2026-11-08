// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { UIState } from "./store";
import { HarbourUI } from "./App";

const harness = vi.hoisted(() => ({
  state: { selected: null, searchOpen: false, ledgerOpen: true, chartMode: false, reducedMotion: false, announce: "", capturing: false, watch: null },
  preload: vi.fn(), set: vi.fn(), select: vi.fn(),
}));
vi.mock("./ChartLabels", () => ({ ChartLabels: () => null }));
vi.mock("./HoverTag", () => ({ HoverTag: () => null }));
vi.mock("./Postcard", () => ({ Postcard: () => null }));
vi.mock("./CornerMark", () => ({ CornerMark: () => <button className="hb-mark-btn">PharosVille</button> }));
vi.mock("./details", () => ({ preloadDetails: harness.preload }));
vi.mock("../../error-reporter", () => ({ reportClientError: vi.fn() }));
vi.mock("./hooks", () => ({
  useStore: () => ({ getSnapshot: () => harness.state, set: harness.set, select: harness.select, noteInput: vi.fn(), stopWatch: vi.fn() }),
  useUISlice: (select: (state: UIState) => unknown) => select(harness.state as UIState),
}));
beforeEach(() => { harness.preload.mockReset(); harness.state.ledgerOpen = true; vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("retains controls after a rejected detail import and creates a fresh lazy identity on retry", async () => {
  harness.preload.mockRejectedValueOnce(new Error("chunk unavailable"))
    .mockResolvedValueOnce({ default: () => <div>Details recovered</div> });
  render(<HarbourUI />);
  await screen.findByRole("heading", { name: "These details could not open." });
  expect(screen.getByRole("button", { name: "PharosVille" })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("heading"));
  fireEvent.click(screen.getByRole("button", { name: "Retry details" }));
  await screen.findByText("Details recovered");
  expect(harness.preload).toHaveBeenCalledTimes(2);
});

it("contains repeated render errors, offers reload, and returns focus when details close", async () => {
  const Broken = () => { throw new Error("detail render"); };
  harness.preload.mockResolvedValue({ default: Broken });
  const ui = render(<HarbourUI />);
  await screen.findByRole("button", { name: "Retry details" });
  fireEvent.click(screen.getByRole("button", { name: "Retry details" }));
  await screen.findByRole("button", { name: "Reload page" });
  fireEvent.click(screen.getByRole("button", { name: "Close details" }));
  expect(harness.set).toHaveBeenCalledWith({ ledgerOpen: false });
  harness.state.ledgerOpen = false; ui.rerender(<HarbourUI />);
  await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "PharosVille" }));
});
