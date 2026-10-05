// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LEGEND_MARK_ROWS } from "../systems/visual-cue-registry";
import { LegendPanel, ReadingKey } from "./legend-panel";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { deriveReadingKey } from "../systems/reading-key";
import atlasManifest from "../systems/reading-atlas.json";

afterEach(() => {
  cleanup();
});

describe("LegendPanel", () => {
  it("reads as a field guide of three stanzas: ships, water and lighthouse", () => {
    render(<LegendPanel onClose={() => undefined} />);
    for (const heading of ["The ships", "The water", "The lighthouse"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    }
    expect(screen.getByText(/Each sail is a stablecoin/)).toBeTruthy();
    expect(screen.getByText(/The water beneath a ship is its peg risk/)).toBeTruthy();
    expect(screen.getByText(/The Pharos keeps the whole fleet's stability/)).toBeTruthy();
  });
  it("names all six East-Asian hull families", () => {
    const markup = renderToStaticMarkup(<LegendPanel onClose={() => undefined} />);

    for (const family of [
      "Bezaisen carrier",
      "Kobaya runner",
      "Twin-hull council boat",
      "Takasebune barge",
      "Battened junk",
      "Bullion scow",
    ]) {
      expect(markup).toContain(family);
    }
    expect(markup).toContain("Unclassified or missing-governance fallback");
    expect(markup).not.toContain("Crypto-backed centralized issuer");
    expect(markup).not.toMatch(/galleon|brigantine|schooner/i);
  });

  it("lists all seven canonical named waters", () => {
    const markup = renderToStaticMarkup(<LegendPanel onClose={() => undefined} />);

    for (const area of ["Calm Anchorage", "Watch Breakwater", "Alert Channel", "Warning Shoals", "Danger Strait", "Ledger Mooring", "Wreck Shoal"]) {
      expect(markup).toContain(area);
    }
  });

  it("uses modal dialog semantics and focuses/restores the close control", () => {
    const opener = document.createElement("button");
    opener.type = "button";
    opener.textContent = "Open legend";
    document.body.append(opener);
    opener.focus();

    const view = render(<LegendPanel onClose={() => undefined} />);

    const panel = screen.getByRole("dialog", { name: "Legend" });
    const closeButton = screen.getByRole("button", { name: "Close legend" });
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(closeButton, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(closeButton);

    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("renders one marks row for each registered analytical mark cue", () => {
    const markup = renderToStaticMarkup(<LegendPanel onClose={() => undefined} />);

    expect(markup).toContain("Marks to look for");
    for (const row of LEGEND_MARK_ROWS) {
      expect(markup).toContain(`data-cue-id="${row.cueId}"`);
      expect(markup).toContain(row.label);
    }
    expect(markup.match(/data-cue-id=/g) ?? []).toHaveLength(LEGEND_MARK_ROWS.length);
    expect(markup).not.toContain("Audit shields");
  });

  it("teaches beam character and source qualification as separate readings", () => {
    const markup = renderToStaticMarkup(<LegendPanel onClose={() => undefined} />);
    expect(markup).toContain("beam character");
    expect(markup).toContain("Stability Index (PSI)");
    expect(markup).toContain("sources; warmth alone does not decode PSI");
    expect(markup).not.toContain("beam warmth");
  });

  it("renders recent mover supply labels when provided", () => {
    const markup = renderToStaticMarkup(
      <LegendPanel
        onClose={() => undefined}
        recentFleetTrend={{
          growers: [{ detailId: "ship.usde", symbol: "USDe", change7dPct: 18 }],
          shrinkers: [{ detailId: "ship.dai", symbol: "DAI", change7dPct: -8 }],
          elevatedShipCount: 4,
        }}
      />,
    );

    expect(markup).toContain("Recent movers");
    expect(markup).toContain("USDe supply +18% (7d)");
    expect(markup).toContain("DAI supply -8% (7d)");
    expect(markup).toContain("4 ships in elevated water");
  });

  it("closes and starts observing from the closing call to action", () => {
    const calls: string[] = [];
    render(
      <LegendPanel
        onClose={() => calls.push("close")}
        onObserve={() => calls.push("observe")}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Watch the harbor" }));
    expect(calls).toEqual(["close", "observe"]);
  });

  it("places the primary action immediately after Close in the focus order", () => {
    render(
      <LegendPanel
        onClose={() => undefined}
        onObserve={() => undefined}
        onSelectDetail={() => undefined}
        recentFleetTrend={{
          growers: [{ detailId: "ship.usde", symbol: "USDe", change7dPct: 18 }],
          shrinkers: [],
          elevatedShipCount: 1,
        }}
      />,
    );

    const panel = screen.getByRole("dialog", { name: "Legend" });
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])"),
    );
    expect(focusable.slice(0, 2).map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim()))
      .toEqual(["Close legend", "Watch the harbor"]);
  });

  it("omits the call to action when observing is unavailable", () => {
    const markup = renderToStaticMarkup(<LegendPanel onClose={() => undefined} />);

    expect(markup).not.toContain("Watch the harbor");
  });

  it("renders the flat-week recent mover message", () => {
    const markup = renderToStaticMarkup(
      <LegendPanel
        onClose={() => undefined}
        recentFleetTrend={{ growers: [], shrinkers: [], elevatedShipCount: 0 }}
      />,
    );

    expect(markup).toContain("no notable supply moves this week; 0 ships in elevated water");
  });
});

describe("nonmodal ReadingKey", () => {
  it("can open, close with Escape, restore focus and reopen beside the caption", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    render(<><p role="status">Mint and burn unavailable · refresh failed</p><ReadingKey world={world} onSelectDetail={() => undefined} /></>);
    const opener = screen.getByRole("button", { name: "Read key" });
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(opener);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Lighthouse" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("refresh failed");
    fireEvent.keyDown(screen.getByRole("button", { name: "Close reading key" }), { key: "Escape" });
    expect(document.activeElement).toBe(opener);
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(opener);
    expect(screen.getByRole("heading", { name: "Water" })).toBeTruthy();
  });

  it("previews focus without selecting; native activation composes existing detail ids", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const select = vi.fn(), preview = vi.fn();
    render(<ReadingKey world={world} open onSelectDetail={select} onPreviewDetail={preview} />);
    const leader = deriveReadingKey(world).leaders[0]!;
    const button = screen.getByRole("button", { name: leader.label });
    fireEvent.focus(button);
    expect(preview).toHaveBeenLastCalledWith(leader.detailId);
    expect(select).not.toHaveBeenCalled();
    fireEvent.blur(button);
    expect(preview).toHaveBeenLastCalledWith(null);
    fireEvent.click(button);
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith(leader.detailId);
  });

  it("renders text only until the published atlas exists; never fabricates exemplar patterns", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const { container } = render(<ReadingKey world={world} open onSelectDetail={() => undefined} />);
    expect(container.querySelectorAll("[data-reading-id]")).toHaveLength(8 + Math.min(3, world.ships.length));
    expect(screen.getByText(/qualitative, not proportional/)).toBeTruthy();
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector("[data-placeholder]")).toBeNull();
    // The initial import manifest is genuinely unpublished, not a fake tile.
    if (!container.querySelector("[data-exemplar-id]")) expect(container.querySelector("img")).toBeNull();
  });

  it("keeps a pending water slot text-only even when other atlas crops are published", () => {
    const cells: Record<string, { x: number; y: number; width: number; height: number }> = atlasManifest.exemplars;
    const previous = cells["water.warning"];
    delete cells["water.warning"];
    try {
      const world = buildPharosVilleWorld(makePharosVilleWorldInput());
      const { container } = render(<ReadingKey world={world} open onSelectDetail={() => undefined} />);
      const entry = container.querySelector('[data-reading-id="water.warning"]');
      expect(entry?.textContent).toContain("Warning Shoals");
      expect(entry?.textContent).toContain("Short oblique groups of three");
      expect(entry?.querySelector("img")).toBeNull();
      expect(entry?.querySelector("[data-exemplar-id]")).toBeNull();
      expect(entry?.querySelector("[data-placeholder]")).toBeNull();
    } finally {
      if (previous) cells["water.warning"] = previous;
    }
  });

  it("dismisses controlled future teaching explicitly while keeping the opener available", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const dismiss = vi.fn();
    render(<ReadingKey world={world} teachingOpen onDismissTeaching={dismiss} onSelectDetail={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(dismiss).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Read key" })).toBeTruthy();
  });

  it("does not complete teaching on focus, incidental keys or inspecting one exemplar", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const dismiss = vi.fn(), select = vi.fn();
    render(<ReadingKey world={world} teachingOpen onDismissTeaching={dismiss} onSelectDetail={select} />);
    const lighthouse = screen.getByRole("button", { name: deriveReadingKey(world).lighthouse.label });
    fireEvent.focus(lighthouse);
    fireEvent.keyDown(lighthouse, { key: "ArrowDown" });
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent.click(lighthouse);
    expect(select).toHaveBeenCalledWith(world.lighthouse.detailId);
    expect(dismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Got it" })).toBeTruthy();
  });

  it("accepts explicit keyboard dismissal, restores focus and remains reopenable", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const dismiss = vi.fn();
    const view = render(<ReadingKey world={world} teachingOpen onDismissTeaching={dismiss} onSelectDetail={() => undefined} />);
    const opener = screen.getByRole("button", { name: "Read key" });
    const done = screen.getByRole("button", { name: "Got it" });
    done.focus();
    fireEvent.keyDown(done, { key: "Escape" });
    expect(dismiss).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
    view.rerender(<ReadingKey world={world} teachingOpen={false} onDismissTeaching={dismiss} onSelectDetail={() => undefined} />);
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(opener);
    expect(screen.getByRole("heading", { name: "Water" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close reading key" }));
    expect(dismiss).toHaveBeenCalledOnce();
  });
});
