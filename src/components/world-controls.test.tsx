// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorldControls } from "./world-controls";

afterEach(cleanup);

describe("WorldControls", () => {
  it("chooses dusk and Still while retaining system reduced motion as a minimum", () => {
    const onChangeHour = vi.fn();
    const onChangeStill = vi.fn();
    const view = render(<WorldControls hour={18.25} manualTime onChangeHour={onChangeHour} onChangeStill={onChangeStill} />);
    fireEvent.change(screen.getByLabelText("Time of day"), { target: { value: "06:30" } });
    expect(onChangeHour).toHaveBeenCalledWith(6.5);
    fireEvent.click(screen.getByLabelText("Still"));
    expect(onChangeStill).toHaveBeenCalledWith(true);
    view.rerender(<WorldControls still osReducedMotion />);
    expect((screen.getByLabelText("Still") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Still") as HTMLInputElement).checked).toBe(true);
  });
  it("keeps one affordance at rest and groups discovery with view controls", () => {
    const onOpenFind = vi.fn();
    const onOpenLegend = vi.fn();
    const onOpenLedger = vi.fn();
    render(
      <WorldControls
        onOpenFind={onOpenFind}
        onOpenLegend={onOpenLegend}
        onOpenLedger={onOpenLedger}
        onResetView={vi.fn()}
        onToggleNightMode={vi.fn()}
        onToggleObserve={vi.fn()}
      />,
    );

    const toolbar = screen.getByTestId("pharosville-world-controls");
    const affordance = screen.getByRole("button", { name: "Explore harbor controls" });
    expect(toolbar.getAttribute("data-expanded")).toBe("false");
    expect(affordance.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByLabelText("Reset view")).toBeTruthy();
    expect(screen.getByLabelText("Observe harbor")).toBeTruthy();
    expect(screen.getByLabelText("Light and motion: 12:00 local")).toBeTruthy();

    fireEvent.click(affordance);
    expect(toolbar.getAttribute("data-expanded")).toBe("true");
    expect(affordance.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByText("Find", { selector: ".pv-chrome-action span" }).closest("button")!);
    fireEvent.click(screen.getByText("Legend", { selector: ".pv-chrome-action span" }).closest("button")!);
    fireEvent.click(screen.getByText("Harbor ledger", { selector: ".pv-chrome-action span" }).closest("button")!);
    expect(onOpenFind).toHaveBeenCalledOnce();
    expect(onOpenLegend).toHaveBeenCalledOnce();
    expect(onOpenLedger).toHaveBeenCalledOnce();

    expect(screen.queryByLabelText(/set session hour/i)).toBeNull();
    expect(screen.queryByLabelText(/follow selected/i)).toBeNull();
    expect(screen.queryByLabelText(/auto day-night/i)).toBeNull();
    expect(screen.queryByLabelText(/current zoom/i)).toBeNull();
    expect(screen.queryByLabelText(/fullscreen/i)).toBeNull();
  });

  it("drops observe when the world cannot run it", () => {
    render(<WorldControls onResetView={vi.fn()} onToggleNightMode={vi.fn()} />);

    expect(screen.queryByLabelText(/observe/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Explore harbor controls" })).toBeTruthy();
  });

  it("keeps every control reachable and operable from the keyboard", () => {
    const onResetView = vi.fn();
    const onToggleObserve = vi.fn();
    const onToggleNightMode = vi.fn();
    render(
      <WorldControls
        onResetView={onResetView}
        onToggleNightMode={onToggleNightMode}
        onToggleObserve={onToggleObserve}
      />,
    );

    for (const button of screen.getAllByRole("button")) {
      // Faint at rest is a paint concern only: nothing here may be removed
      // from the tab order or hidden from assistive technology.
      expect(button.getAttribute("tabindex")).toBeNull();
      expect(button.getAttribute("aria-hidden")).toBeNull();
      button.focus();
      expect(document.activeElement).toBe(button);
      fireEvent.click(button);
    }

    expect(onResetView).toHaveBeenCalledTimes(1);
    expect(onToggleObserve).toHaveBeenCalledTimes(1);
    expect(onToggleNightMode).toHaveBeenCalledTimes(1);
  });

  it("marks the pressed state of the toggles", () => {
    render(
      <WorldControls
        nightMode
        observing
        onResetView={vi.fn()}
        onToggleNightMode={vi.fn()}
        onToggleObserve={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Stop observing").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Day preset")).toBeTruthy();
  });
});
