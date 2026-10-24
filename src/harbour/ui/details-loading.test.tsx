// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { UIState } from "./store";
import { HarbourUI } from "./App";

const harness = vi.hoisted(() => {
  let resolve!: (value: { default: () => React.ReactNode }) => void;
  const pending = new Promise<{ default: () => React.ReactNode }>((done) => { resolve = done; });
  return {
    state: { model: null, hover: null, selected: null as UIState["selected"], searchOpen: false, ledgerOpen: false, chartMode: false, reducedMotion: false, tick: 0, follow: null, announce: "", capturing: false, watch: null },
    set: vi.fn(), select: vi.fn(), preload: vi.fn(() => pending), resolve,
  };
});
vi.mock("./ChartLabels", () => ({ ChartLabels: () => null }));
vi.mock("./HoverTag", () => ({ HoverTag: () => null }));
vi.mock("./Postcard", () => ({ Postcard: () => null }));
vi.mock("./CornerMark", () => ({ CornerMark: () => <button className="hb-mark-btn">PharosVille</button> }));
vi.mock("./details", () => ({ preloadDetails: harness.preload }));
vi.mock("./hooks", () => ({
  useStore: () => ({ getSnapshot: () => harness.state, set: harness.set, select: harness.select, noteInput: vi.fn(), stopWatch: vi.fn() }),
  useUISlice: (select: (s: UIState) => unknown) => select(harness.state),
}));
afterEach(cleanup);

it("shows immediately closable, matching chrome for every early detail action while the chunk is pending", async () => {
  const ui = render(<HarbourUI />);
  expect(harness.preload).not.toHaveBeenCalled();
  harness.state.ledgerOpen = true; ui.rerender(<HarbourUI />);
  expect(screen.getByRole("status").textContent).toBe("Loading the harbour ledger…");
  expect(screen.getByRole("dialog").className).toContain("hb-ledger hb-paper hb-neat");
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "What you are looking at" }));
  fireEvent.click(screen.getByRole("button", { name: "Close ledger (Esc)" }));
  expect(harness.set).toHaveBeenCalledWith({ ledgerOpen: false });

  harness.state.ledgerOpen = false; harness.state.selected = { kind: "landmark", id: "pharos" }; ui.rerender(<HarbourUI />);
  expect(screen.getByRole("status").textContent).toBe("Loading these harbour details…");
  expect(screen.getByRole("complementary").className).toContain("hb-panel hb-paper hb-neat");
  fireEvent.click(screen.getByRole("button", { name: "Close panel (Esc)" }));
  expect(harness.select).toHaveBeenCalledWith(null);

  harness.state.selected = null; harness.state.searchOpen = true; ui.rerender(<HarbourUI />);
  expect(screen.getByRole("dialog", { name: "Find a coin" }).className).toContain("hb-search hb-paper");
  expect(screen.getByRole("status").textContent).toContain("Loading coins, chains and landmarks…");
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Search is loading" }));
  fireEvent.click(screen.getByRole("button", { name: "Close (Esc)" }));
  expect(harness.set).toHaveBeenCalledWith({ searchOpen: false });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(harness.set).toHaveBeenLastCalledWith({ searchOpen: false });

  harness.state.searchOpen = false; ui.rerender(<HarbourUI />);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(harness.preload).toHaveBeenCalledOnce();
  await act(async () => { harness.resolve({ default: () => <div>Loaded details</div> }); });
  expect(screen.getByText("Loaded details")).toBeTruthy();
  expect(screen.queryByText(/Loading the harbour ledger/)).toBeNull();
});
