// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);
import { WorldToolbar } from "./world-toolbar";

describe("WorldToolbar (streamlined)", () => {
  it("renders zoom, time, reset, and follow controls", () => {
    render(
      <WorldToolbar
        zoomLabel="112%"
        timeOfDayHour={18.5}
        selectedDetailId="ship-x"
        onResetView={vi.fn()}
        onFollowSelected={vi.fn()}
        onTimeOfDayChange={vi.fn()}
      />,
    );
    expect(screen.getByText("112%")).toBeTruthy();
    expect(screen.getByLabelText(/time of day/i).textContent).toBe("18:30");
    expect(screen.getByLabelText(/set session hour/i)).toBeTruthy();
    expect(screen.getByLabelText(/reset view/i)).toBeTruthy();
    expect(screen.getByLabelText(/follow selected/i)).toBeTruthy();
    expect(screen.queryByLabelText(/zoom in/i)).toBeNull();
    expect(screen.queryByLabelText(/zoom out/i)).toBeNull();
    expect(screen.queryByLabelText(/pan north/i)).toBeNull();
    expect(screen.queryByLabelText(/clear selection/i)).toBeNull();
  });

  it("does not render entity count chip", () => {
    render(<WorldToolbar zoomLabel="100%" onResetView={vi.fn()} />);
    expect(screen.queryByLabelText(/map entity count/i)).toBeNull();
  });

  it("does not render selected-name chip even when selection is set", () => {
    render(
      <WorldToolbar
        zoomLabel="100%"
        onResetView={vi.fn()}
        selectedDetailId="ship-x"
      />,
    );
    expect(screen.queryByLabelText(/selected detail/i)).toBeNull();
  });

  it("disables follow-selected when no handler is supplied", () => {
    render(<WorldToolbar zoomLabel="100%" onResetView={vi.fn()} />);
    const follow = screen.getByLabelText(/follow selected/i) as HTMLButtonElement;
    expect(follow.disabled).toBe(true);
  });

  it("disables follow-selected when handler is supplied but no selection exists", () => {
    render(<WorldToolbar zoomLabel="100%" onResetView={vi.fn()} onFollowSelected={vi.fn()} />);
    const follow = screen.getByLabelText(/follow selected/i) as HTMLButtonElement;
    expect(follow.disabled).toBe(true);
  });

  it("emits manual time changes and exposes reset while override is active", () => {
    const onTimeOfDayChange = vi.fn();
    const onClearTimeOverride = vi.fn();
    render(
      <WorldToolbar
        zoomLabel="100%"
        manualTimeOverrideHour={6.25}
        timeOfDayHour={6.25}
        onClearTimeOverride={onClearTimeOverride}
        onResetView={vi.fn()}
        onTimeOfDayChange={onTimeOfDayChange}
      />,
    );

    const scrubber = screen.getByLabelText(/set session hour/i) as HTMLInputElement;
    expect(screen.getByLabelText(/time of day/i).textContent).toBe("06:15");
    fireEvent.change(scrubber, { target: { value: "21.5" } });
    expect(onTimeOfDayChange).toHaveBeenCalledWith(21.5);

    fireEvent.click(screen.getByLabelText(/return to day-night preset/i));
    expect(onClearTimeOverride).toHaveBeenCalledOnce();
  });
});
