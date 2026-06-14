// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FleetFocus } from "./fleet-focus";
import type { FleetFocusProps } from "./fleet-focus";

afterEach(() => cleanup());

describe("FleetFocus", () => {
  it("renders a polite live match count and controlled segmented toggles", () => {
    const updateSelection = vi.fn();
    render(<FleetFocus {...propsFixture({ updateSelection })} />);

    const count = screen.getByTestId("pharosville-fleet-focus-count");
    expect(count.textContent).toBe("2 of 4 ships");
    expect(count.getAttribute("aria-live")).toBe("polite");

    const defi = screen.getByRole("button", { name: "Ship class: DeFi, 2 ships" });
    expect(defi.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Risk band: Warning, 2 ships" }));
    expect(updateSelection).toHaveBeenCalledWith({ riskBand: "warning" });

    fireEvent.click(defi);
    expect(updateSelection).toHaveBeenCalledWith({ shipClass: null });
  });

  it("keeps the selected chain visible when chain options are collapsed", () => {
    render(<FleetFocus {...propsFixture({ chainOptionLimit: 2 })} />);

    expect(screen.getByRole("button", { name: "Chain: Ethereum, 3 ships" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chain: Base, 2 ships" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chain: Polygon, 1 ships" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Chain: Solana, 1 ships" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /More chains/ }));
    expect(screen.getByRole("button", { name: "Chain: Solana, 1 ships" })).toBeTruthy();
  });
});

function propsFixture(overrides: Partial<FleetFocusProps> = {}): FleetFocusProps {
  return {
    activeSubsetLabel: "ship class DeFi and chain Polygon",
    clearFocus: vi.fn(),
    label: "ship class DeFi and chain Polygon",
    matchCount: 2,
    matchCountLabel: "2 of 4 ships",
    options: {
      riskBands: [
        { value: "calm", label: "Calm", count: 2 },
        { value: "warning", label: "Warning", count: 2 },
      ],
      shipClasses: [
        { value: "cefi", label: "CeFi", count: 2 },
        { value: "defi", label: "DeFi", count: 2 },
      ],
      sizeTiers: [
        { value: "major", label: "Major", count: 3 },
        { value: "regional", label: "Regional", count: 1 },
      ],
      chains: [
        { value: "ethereum", label: "Ethereum", count: 3 },
        { value: "base", label: "Base", count: 2 },
        { value: "polygon", label: "Polygon", count: 1 },
        { value: "solana", label: "Solana", count: 1 },
      ],
    },
    selection: {
      riskBand: null,
      shipClass: "defi",
      sizeTier: null,
      chain: "polygon",
    },
    totalCount: 4,
    updateSelection: vi.fn(),
    ...overrides,
  };
}
