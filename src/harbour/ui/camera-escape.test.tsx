// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HarbourUI } from "./App";
import type { UIState } from "./store";

const harness = vi.hoisted(() => {
  const state = { selected: null, searchOpen: false, ledgerOpen: false, chartMode: false, shipChoices: [], hover: null, watch: null } as Partial<UIState>;
  return { state, store: { getSnapshot: () => state, noteInput() {}, set: vi.fn(), select: vi.fn(), dismissHover: vi.fn(), stopAutomation: vi.fn(), stopWatch: vi.fn() } };
});
vi.mock("./hooks", () => ({ useStore: () => harness.store, useUISlice: (select: (s: UIState) => unknown) => select(harness.state as UIState) }));
vi.mock("./ChartLabels", () => ({ ChartLabels: () => null }));
vi.mock("./HoverTag", () => ({ HoverTag: () => null }));
vi.mock("./Postcard", () => ({ Postcard: () => null }));
vi.mock("./CornerMark", () => ({ CornerMark: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("Escape closes the top layer, then hover, then automation, and respects consumed events", () => {
  render(<HarbourUI />);
  Object.assign(harness.state, { searchOpen: true, selected: { kind: "boat", id: "coin" }, ledgerOpen: true, watch: { symbol: "X", line: "test" } });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(harness.store.set).toHaveBeenLastCalledWith({ searchOpen: false });
  expect(harness.store.stopWatch).not.toHaveBeenCalled(); expect(harness.store.select).not.toHaveBeenCalled();
  harness.state.searchOpen = false; fireEvent.keyDown(window, { key: "Escape" });
  expect(harness.store.select).toHaveBeenCalledWith(null);
  harness.state.selected = null; fireEvent.keyDown(window, { key: "Escape" });
  expect(harness.store.set).toHaveBeenLastCalledWith({ ledgerOpen: false });
  harness.state.ledgerOpen = false; harness.store.dismissHover.mockReturnValueOnce(true);
  fireEvent.keyDown(window, { key: "Escape" }); expect(harness.store.stopAutomation).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "Escape" }); expect(harness.store.stopAutomation).toHaveBeenCalledTimes(1);
  const consumed = new KeyboardEvent("keydown", { key: "Escape", cancelable: true }); consumed.preventDefault(); window.dispatchEvent(consumed);
  expect(harness.store.stopAutomation).toHaveBeenCalledTimes(1);
});
