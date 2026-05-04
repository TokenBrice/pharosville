// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);
import { WorldToolbar } from "./world-toolbar";

describe("WorldToolbar (streamlined)", () => {
  it("renders only zoom%, reset, and follow controls", () => {
    render(
      <WorldToolbar
        zoomLabel="112%"
        selectedDetailId="ship-x"
        onResetView={vi.fn()}
        onFollowSelected={vi.fn()}
      />,
    );
    expect(screen.getByText("112%")).toBeTruthy();
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
});
