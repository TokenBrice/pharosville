// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { QuickFind } from "./quick-find";
import type { QuickFindCandidate } from "../systems/quick-find-match";

const CANDIDATES: readonly QuickFindCandidate[] = [
  { detailId: "ship.usdt", kindLabel: "Ship", label: "Tether USD", symbol: "USDT", weight: 120_000 },
  { detailId: "ship.usdc", kindLabel: "Ship", label: "USD Coin", symbol: "USDC", weight: 60_000 },
  { detailId: "dock.ethereum", kindLabel: "Harbor", label: "Ethereum", symbol: null, weight: 900_000 },
];

function renderQuickFind(overrides: Partial<ComponentProps<typeof QuickFind>> = {}) {
  const onClose = vi.fn();
  const onSelect = vi.fn();
  render(<QuickFind candidates={CANDIDATES} onClose={onClose} onSelect={onSelect} {...overrides} />);
  const input = screen.getByRole("combobox", { name: "Find a ship or harbor by name" });
  return { input, onClose, onSelect };
}

afterEach(() => {
  cleanup();
});

describe("QuickFind", () => {
  it("focuses the labelled combobox on mount and starts collapsed", () => {
    const { input } = renderQuickFind();

    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-controls")).toBe("pharosville-quick-find-results");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("filters as you type and points aria-activedescendant at the top match", () => {
    const { input } = renderQuickFind();

    fireEvent.change(input, { target: { value: "usd" } });

    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "USDTTether USD · Ship",
      "USDCUSD Coin · Ship",
    ]);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0]!.id);
    expect(options[0]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("2 matches");
  });

  it("moves the active option with the arrow keys and clamps at both ends", () => {
    const { input } = renderQuickFind();
    fireEvent.change(input, { target: { value: "usd" } });
    const optionIds = screen.getAllByRole("option").map((option) => option.id);

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe(optionIds[0]);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(optionIds[1]);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(optionIds[1]);
  });

  it("selects the active match on Enter", () => {
    const { input, onSelect } = renderQuickFind();
    fireEvent.change(input, { target: { value: "usd" } });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith("ship.usdc");
  });

  it("selects a match on click", () => {
    const { input, onSelect } = renderQuickFind();
    fireEvent.change(input, { target: { value: "ether" } });

    fireEvent.click(screen.getByRole("option", { name: /Ethereum/ }));

    expect(onSelect).toHaveBeenCalledWith("dock.ethereum");
  });

  it("does not select when nothing matches, and says so", () => {
    const { input, onSelect } = renderQuickFind();
    fireEvent.change(input, { target: { value: "zzz" } });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("No ship or harbor by that name.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("No matches");
  });

  it("closes on Escape without letting the key reach the world shell", () => {
    const shellEscape = vi.fn();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(
      <div onKeyDown={shellEscape}>
        <QuickFind candidates={CANDIDATES} onClose={onClose} onSelect={onSelect} />
      </div>,
    );

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(shellEscape).not.toHaveBeenCalled();
  });

  it("keeps Enter and the arrow keys from reaching the world shell too", () => {
    const shellKeyDown = vi.fn();
    render(
      <div onKeyDown={shellKeyDown}>
        <QuickFind candidates={CANDIDATES} onClose={vi.fn()} onSelect={vi.fn()} />
      </div>,
    );
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "usd" } });

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });

    expect(shellKeyDown).not.toHaveBeenCalled();
  });
});
