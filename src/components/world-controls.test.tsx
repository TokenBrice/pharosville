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
  it("keeps Find and Explore distinct at rest and discloses secondary controls", () => {
    const onOpenFind = vi.fn();
    const onOpenLegend = vi.fn();
    const onOpenLedger = vi.fn();
    const onStay = vi.fn();
    render(
      <WorldControls
        onOpenFind={onOpenFind}
        onOpenLegend={onOpenLegend}
        onOpenLedger={onOpenLedger}
        onStay={onStay}
        onResetView={vi.fn()}
        onToggleNightMode={vi.fn()}
        onToggleObserve={vi.fn()}
      />,
    );

    const toolbar = screen.getByTestId("pharosville-world-controls");
    const affordance = screen.getByRole("button", { name: "Explore harbor controls" });
    expect(toolbar.getAttribute("data-expanded")).toBe("false");
    expect(affordance.getAttribute("aria-expanded")).toBe("false");
    const find = screen.getByRole("button", { name: "Find a ship or harbor" });
    expect(screen.getAllByRole("button", { name: /Find/ })).toHaveLength(1);
    expect(find.id).toBe("pharosville-find");
    expect(find.getAttribute("aria-keyshortcuts")).toBe("/");
    expect(affordance.getAttribute("aria-keyshortcuts")).toBeNull();
    expect(affordance.querySelector("kbd")).toBeNull();
    expect(screen.queryByRole("button", { name: "Harbor ledger" })).toBeNull();
    expect(document.getElementById(affordance.getAttribute("aria-controls")!)!.hidden).toBe(true);
    fireEvent.click(find);
    expect(onOpenFind).toHaveBeenCalledOnce();
    expect(toolbar.getAttribute("data-expanded")).toBe("false");

    fireEvent.click(affordance);
    expect(toolbar.getAttribute("data-expanded")).toBe("true");
    expect(affordance.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Home")).toBeTruthy();
    expect(screen.getByLabelText("Observe harbor")).toBeTruthy();
    expect(screen.getByLabelText("Light and motion: 12:00 local")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "legend" }));
    fireEvent.click(screen.getByRole("button", { name: "Harbor ledger" }));
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(onOpenFind).toHaveBeenCalledOnce();
    expect(onOpenLegend).toHaveBeenCalledOnce();
    expect(onOpenLedger).toHaveBeenCalledOnce();
    expect(onStay).toHaveBeenCalledOnce();

    fireEvent.click(affordance);
    expect(screen.queryByRole("button", { name: "Harbor ledger" })).toBeNull();
    expect(screen.getByRole("button", { name: "Find a ship or harbor" })).toBe(find);
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

    fireEvent.click(screen.getByRole("button", { name: "Explore harbor controls" }));
    for (const button of screen.getAllByRole("button").filter((entry) => entry.id !== "pharosville-explore")) {
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

  it("exposes station-local Previous and Next with Home distinct from Stroll", () => {
    const next = vi.fn(), previous = vi.fn(), home = vi.fn();
    const view = render(<WorldControls onStrollNext={next} onStrollPrevious={previous} onResetView={home} />);
    fireEvent.click(screen.getByRole("button", { name: "Explore harbor controls" }));
    fireEvent.click(screen.getByRole("button", { name: "Stroll" }));
    expect(next).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Previous" })).toBeNull();
    view.rerender(<WorldControls onStrollNext={next} onStrollPrevious={previous} onResetView={home} strollTitle="Chaseki bench" />);
    expect(screen.getByRole("status").textContent).toBe("Chaseki bench");
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(previous).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledTimes(2);
    expect(home).toHaveBeenCalledOnce();
  });
});
