// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorldControls } from "./world-controls";

afterEach(cleanup);

describe("WorldControls", () => {
  it("renders only recenter, observe and day-night", () => {
    render(
      <WorldControls
        onResetView={vi.fn()}
        onToggleNightMode={vi.fn()}
        onToggleObserve={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Reset view")).toBeTruthy();
    expect(screen.getByLabelText("Observe harbor")).toBeTruthy();
    expect(screen.getByLabelText("Switch to night")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(3);

    // The retired toolbar's other controls are gone for good.
    expect(screen.queryByLabelText(/set session hour/i)).toBeNull();
    expect(screen.queryByLabelText(/follow selected/i)).toBeNull();
    expect(screen.queryByLabelText(/auto day-night/i)).toBeNull();
    expect(screen.queryByLabelText(/current zoom/i)).toBeNull();
    expect(screen.queryByLabelText(/fullscreen/i)).toBeNull();
  });

  it("drops observe when the world cannot run it", () => {
    render(<WorldControls onResetView={vi.fn()} onToggleNightMode={vi.fn()} />);

    expect(screen.queryByLabelText(/observe/i)).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
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
    expect(screen.getByLabelText("Switch to day").getAttribute("aria-pressed")).toBe("true");
  });
});
