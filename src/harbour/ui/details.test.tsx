// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UIState } from "./store";
import { HarbourUI } from "./App";
import { preloadDetails } from "./details";

const { imported, state } = vi.hoisted(() => ({
  imported: vi.fn(),
  state: { model: null, hover: null, selected: null, searchOpen: false, ledgerOpen: false, chartMode: false, reducedMotion: false, tick: 0, follow: null, announce: "", capturing: false, watch: null },
}));
vi.mock("./ChartLabels", () => ({ ChartLabels: () => null }));
vi.mock("./HoverTag", () => ({ HoverTag: () => null }));
vi.mock("./CornerMark", () => ({ CornerMark: () => <button className="hb-mark-btn">PharosVille</button> }));
vi.mock("./hooks", () => ({
  useStore: () => ({ getSnapshot: () => state, set: vi.fn(), select: vi.fn() }),
  useUISlice: (select: (s: UIState) => unknown) => select(state),
}));
vi.mock("./DetailPanels", () => {
  imported();
  return { default: () => <div>detail tools</div> };
});
afterEach(cleanup);

describe("detail loading boundary", () => {
  it("does not import closed tools, warms without mounting, then opens from the shared warm promise", async () => {
    const ui = render(<HarbourUI />);
    expect(imported).not.toHaveBeenCalled();
    expect(screen.queryByText("detail tools")).toBeNull();
    await preloadDetails();
    expect(imported).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("detail tools")).toBeNull();
    state.ledgerOpen = true;
    ui.rerender(<HarbourUI />);
    await waitFor(() => expect(screen.getByText("detail tools")).toBeTruthy());
    state.ledgerOpen = false;
    ui.rerender(<HarbourUI />);
    expect(imported).toHaveBeenCalledTimes(1);
  });
});
